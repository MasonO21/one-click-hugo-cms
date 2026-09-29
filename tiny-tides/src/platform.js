// Tiny Tides — native/web bridge. Every call is wrapped so the game works in a plain browser too.
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { App } from '@capacitor/app';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';
import { PRODUCTS, PRODUCT_IDS } from './data.js';

/* global __DEMO__, __DEBUG__ */
// Injected by tools/build.mjs as literals so esbuild can strip all debug code from release builds.
export const DEMO = __DEMO__;
export const DEBUG = __DEBUG__;
export const isNative = (() => { try { return Capacitor.isNativePlatform(); } catch { return false; } })();
export const platformName = isNative ? Capacitor.getPlatform() : 'web';
const safe = async (fn, fallback) => { try { return await fn(); } catch (e) { if (DEBUG) console.warn('[platform]', e?.message || e); return fallback; } };

// ------------------------------------------------------------------ storage
export const storage = {
  async get(key) {
    let a = null, b = null;
    if (isNative) a = await safe(async () => (await Preferences.get({ key })).value, null);
    try { b = localStorage.getItem(key); } catch { /* private mode */ }
    return [a, b];
  },
  async set(key, val) {
    if (isNative) await safe(() => Preferences.set({ key, value: val }));
    try { localStorage.setItem(key, val); } catch { /* quota / private mode */ }
  },
  async remove(key) {
    if (isNative) await safe(() => Preferences.remove({ key }));
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
};

// ------------------------------------------------------------------ haptics
let hapticsOn = true;
export const haptic = {
  enable(v) { hapticsOn = v; },
  tap() { if (hapticsOn && isNative) safe(() => Haptics.impact({ style: ImpactStyle.Light })); },
  pop() { if (hapticsOn && isNative) safe(() => Haptics.impact({ style: ImpactStyle.Medium })); },
  heavy() { if (hapticsOn && isNative) safe(() => Haptics.impact({ style: ImpactStyle.Heavy })); },
  success() { if (hapticsOn && isNative) safe(() => Haptics.notification({ type: NotificationType.Success })); },
  warn() { if (hapticsOn && isNative) safe(() => Haptics.notification({ type: NotificationType.Warning })); },
};

// ------------------------------------------------------------------ notifications
export const notify = {
  supported: isNative,
  async permission() {
    if (!isNative) return 'unsupported';
    return safe(async () => (await LocalNotifications.checkPermissions()).display, 'denied');
  },
  async request() {
    if (!isNative) return false;
    const r = await safe(() => LocalNotifications.requestPermissions(), null);
    return r?.display === 'granted';
  },
  async cancelAll() {
    if (!isNative) return;
    await safe(async () => {
      const p = await LocalNotifications.getPending();
      if (p.notifications.length) await LocalNotifications.cancel({ notifications: p.notifications });
    });
  },
  /** list: [{ id, title, body, at:Date }] — replaces everything pending. */
  async schedule(list) {
    if (!isNative) return;
    await notify.cancelAll();
    if (!list.length) return;
    await safe(() => LocalNotifications.schedule({ notifications: list.map((n) => ({ id: n.id, title: n.title, body: n.body, schedule: { at: n.at, allowWhileIdle: true } })) }));
  },
};

// ------------------------------------------------------------------ app lifecycle & chrome
export function onAppState(cb) {
  document.addEventListener('visibilitychange', () => cb(!document.hidden));
  if (isNative) safe(() => App.addListener('appStateChange', ({ isActive }) => cb(isActive)));
}
export async function setupChrome() {
  if (!isNative) return;
  await safe(() => StatusBar.setStyle({ style: Style.Dark }));
  await safe(() => StatusBar.setOverlaysWebContent?.({ overlay: true }));
}
export const hideSplash = () => { if (isNative) safe(() => SplashScreen.hide({ fadeOutDuration: 250 })); };
export function openUrl(url) {
  try { window.open(url, '_blank', 'noopener'); } catch { location.href = url; }
}

// ------------------------------------------------------------------ share a picture
export async function shareCanvas(canvas, text) {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) return { ok: false };
  if (isNative) {
    const data = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
    return safe(async () => {
      const path = `tiny-tides-${Date.now()}.png`;
      await Filesystem.writeFile({ path, data, directory: Directory.Cache });
      const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
      await Share.share({ title: 'Tiny Tides', text, url: uri, dialogTitle: 'Share your tidepool' });
      return { ok: true };
    }, { ok: false });
  }
  const file = new File([blob], 'tiny-tides.png', { type: 'image/png' });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text, title: 'Tiny Tides' }); return { ok: true }; }
  } catch (e) { if (e?.name === 'AbortError') return { ok: false, cancelled: true }; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'tiny-tides.png'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return { ok: true, downloaded: true };
}

// ------------------------------------------------------------------ in-app purchases (StoreKit 2 via @capgo/native-purchases)
export const store = {
  /** 'native' (real StoreKit) | 'demo' (simulated, no money) | 'unavailable' */
  mode: isNative ? 'native' : (DEMO || DEBUG ? 'demo' : 'unavailable'),
  prices: {},
  listener: null,
  async init(onTransaction) {
    if (store.mode !== 'native') return;
    const ok = await safe(async () => (await NativePurchases.isBillingSupported()).isBillingSupported, false);
    if (!ok) { store.mode = 'unavailable'; return; }
    // transactions completed outside a purchase call (Ask-to-Buy approvals, interrupted purchases, other devices)
    store.listener = await safe(() => NativePurchases.addListener('transactionUpdated', (t) => {
      if (t && PRODUCTS[t.productIdentifier] && !t.revocationDate) onTransaction(t.productIdentifier, String(t.transactionId));
    }));
    await store.loadPrices();
  },
  async loadPrices() {
    if (store.mode !== 'native') return;
    const r = await safe(() => NativePurchases.getProducts({ productIdentifiers: PRODUCT_IDS, productType: PURCHASE_TYPE.INAPP }), null);
    for (const p of r?.products || []) store.prices[p.identifier] = p.priceString;
  },
  price(id) { return store.prices[id] || PRODUCTS[id].price; },
  /** Resolves { ok, txId } | { ok:false, cancelled } | { ok:false, pending } | { ok:false, error } */
  async buy(id) {
    if (store.mode === 'demo') { await new Promise((r) => setTimeout(r, 450)); return { ok: true, txId: `demo-${id}-${Date.now()}` }; }
    if (store.mode !== 'native') return { ok: false, error: 'Purchases are available in the App Store version.' };
    try {
      const t = await NativePurchases.purchaseProduct({ productIdentifier: id, productType: PURCHASE_TYPE.INAPP, quantity: 1, autoAcknowledgePurchases: false });
      return { ok: true, txId: String(t.transactionId) };
    } catch (e) {
      const msg = String(e?.message || e || '');
      if (/cancel/i.test(msg)) return { ok: false, cancelled: true };
      if (/pending/i.test(msg)) return { ok: false, pending: true };
      return { ok: false, error: msg || 'Purchase failed' };
    }
  },
  /** Tell StoreKit we've delivered the goods (only after the grant has been saved). */
  async finish(txId) {
    if (store.mode !== 'native') return;
    await safe(() => NativePurchases.acknowledgePurchase({ purchaseToken: txId }));
  },
  /** Returns product ids of non-consumables the user owns. */
  async restore() {
    if (store.mode === 'demo') return { ok: true, items: [] };
    if (store.mode !== 'native') return { ok: false, error: 'Restore is available in the App Store version.' };
    try {
      await NativePurchases.restorePurchases();
      const r = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP });
      const items = (r.purchases || []).filter((p) => PRODUCTS[p.productIdentifier]?.type === 'nonconsumable' && !p.revocationDate).map((p) => ({ id: p.productIdentifier, txId: String(p.transactionId) }));
      return { ok: true, items };
    } catch (e) { return { ok: false, error: String(e?.message || e) }; }
  },
};
