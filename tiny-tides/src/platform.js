// Tiny Tides — native/web bridge. Every call is wrapped so the game works in a plain browser too.
import { Capacitor, registerPlugin } from '@capacitor/core';
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
import { tk } from './i18n.js';


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
  /** Resolves true only if at least one backing store accepted the write. */
  async set(key, val) {
    let ok = false;
    if (isNative) ok = await safe(async () => { await Preferences.set({ key, value: val }); return true; }, false);
    try { localStorage.setItem(key, val); ok = true; } catch { /* quota / private mode */ }
    return ok;
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
  let last = !document.hidden;
  const fire = (active) => { if (active === last) return; last = active; cb(active); };   // both sources fire on iOS: report each change once
  document.addEventListener('visibilitychange', () => fire(!document.hidden));
  if (isNative) safe(() => App.addListener('appStateChange', ({ isActive }) => fire(isActive)));
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
      try {
        const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
        await Share.share({ title: 'Tiny Tides', text, url: uri, dialogTitle: 'Share your tidepool' });
        return { ok: true };
      } finally { safe(() => Filesystem.deleteFile({ path, directory: Directory.Cache })); }
    }, { ok: false });
  }
  const file = new File([blob], 'tiny-tides.png', { type: 'image/png' });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text, title: 'Tiny Tides' }); return { ok: true }; }
  } catch (e) { if (e?.name === 'AbortError') return { ok: false, cancelled: true }; }
  return { ok: false, unsupported: true };   // plain browsers / sandboxed pages: the UI shows the picture to long-press instead
}

// ------------------------------------------------------------------ age (Apple's Declared Age Range, iOS 26+)
// Native side: ios/App/App/AgeRangePlugin.swift. Where Apple offers nothing (older iOS, the web) the game asks its own
// neutral birth-month question instead, see ui.ensurePaidOk().
const AgeRange = registerPlugin('AgeRange');
export const age = {
  /** { available, required }: can Apple share an age range here, and does the law where the player is require an age check? */
  async status() {
    if (!isNative) return { available: false, required: false };
    const r = await safe(() => AgeRange.status(), null);
    return { available: !!r?.available, required: !!r?.required };
  },
  /** Asks Apple (system sheet) whether the player is at least `gate` years old: 'adult' | 'minor' | '' (declined, unavailable, error). */
  async ask(gate) {
    if (!isNative) return '';
    const r = await safe(() => AgeRange.request({ gate }), null);
    if (r?.result !== 'sharing') return '';
    if (Number.isFinite(r.lower) && r.lower >= gate) return 'adult';
    if (!Number.isFinite(r.lower) || (Number.isFinite(r.upper) && r.upper < gate)) return 'minor';
    return '';
  },
};

// ------------------------------------------------------------------ in-app purchases (StoreKit 2 via @capgo/native-purchases)
export const store = {
  /** 'native' (real StoreKit) | 'demo' (simulated, no money) | 'unavailable' */
  mode: isNative ? 'native' : (DEMO || DEBUG ? 'demo' : 'unavailable'),
  prices: {},
  priceNums: {},               // productId -> { price: number, currency: 'USD' } from the App Store
  country: '',                 // App Store storefront country (ISO alpha-3 from StoreKit, e.g. "USA"); '' until known
  listener: null,
  /** Two-letter/three-letter region hints: the storefront (authoritative) and the device locale (extra caution). */
  regions() {
    let loc = '';
    try { loc = (new Intl.DateTimeFormat().resolvedOptions().locale.split('-')[1] || '').toUpperCase(); } catch { /* old webview */ }
    return [store.country, loc].filter(Boolean);
  },
  async init(onTransaction) {
    if (store.mode !== 'native') return;
    const ok = await safe(async () => (await NativePurchases.isBillingSupported()).isBillingSupported, false);
    if (!ok) { store.mode = 'unavailable'; return; }
    // Transactions completed outside a purchase call (Ask-to-Buy approvals, interrupted purchases, other devices).
    // The (patched) plugin retains these events until a listener exists and never finishes them itself.
    store.listener = await safe(() => NativePurchases.addListener('transactionUpdated', (t) => {
      if (t && PRODUCTS[t.productIdentifier] && !t.revocationDate && t.transactionId != null) onTransaction(t.productIdentifier, String(t.transactionId));
    }));
    const sf = await safe(() => NativePurchases.getStorefront(), null);
    store.country = String(sf?.countryCode || '').toUpperCase();
    await store.loadPrices();
  },
  async loadPrices() {
    if (store.mode !== 'native') return;
    const r = await safe(() => NativePurchases.getProducts({ productIdentifiers: PRODUCT_IDS, productType: PURCHASE_TYPE.INAPP }), null);
    for (const p of r?.products || []) {
      store.prices[p.identifier] = p.priceString;
      if (Number.isFinite(Number(p.price)) && p.currencyCode) store.priceNums[p.identifier] = { price: Number(p.price), currency: String(p.currencyCode) };
    }
  },
  price(id) { return store.prices[id] || PRODUCTS[id].price; },
  /** { price, currency } for a product: the App Store's numbers when known, otherwise the US list price (web/demo builds). */
  priceInfo(id) {
    if (store.priceNums[id]) return store.priceNums[id];
    if (store.mode === 'native') return null;
    const m = /^\$(\d+(?:\.\d+)?)$/.exec(PRODUCTS[id]?.price || '');
    return m ? { price: Number(m[1]), currency: 'USD' } : null;
  },
  /** Resolves { ok, txId } | { ok:false, cancelled } | { ok:false, pending } | { ok:false, error } */
  async buy(id) {
    if (store.mode === 'demo') { await new Promise((r) => setTimeout(r, 450)); return { ok: true, txId: `demo-${id}-${Date.now()}` }; }
    if (store.mode !== 'native') return { ok: false, error: tk('Purchases are available in the App Store version.') };
    try {
      const t = await NativePurchases.purchaseProduct({ productIdentifier: id, productType: PURCHASE_TYPE.INAPP, quantity: 1, autoAcknowledgePurchases: false });
      // the money has moved: never fail here just because the id is missing, use a unique stand-in (a ledger entry still stops repeats)
      return { ok: true, txId: t?.transactionId != null ? String(t.transactionId) : `local-${id}-${Date.now()}` };
    } catch (e) {
      const msg = String(e?.message || e || '');
      if (/cancel/i.test(msg)) return { ok: false, cancelled: true };
      if (/pending/i.test(msg)) return { ok: false, pending: true };
      return { ok: false, error: msg || tk('Purchase failed') };
    }
  },
  /** Tell StoreKit we've delivered the goods. Call only after the grant is safely saved. Resolves true on success. */
  async finish(txId) {
    if (store.mode !== 'native') return true;
    return safe(async () => { await NativePurchases.acknowledgePurchase({ purchaseToken: txId }); return true; }, false);
  },
  /** Every verified in-app transaction StoreKit knows about: [{ id, txId, date, revoked }]. Receipts are dropped to keep this light. */
  async history() {
    if (store.mode !== 'native') return [];
    const r = await safe(() => NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP }), null);
    return (r?.purchases || []).filter((p) => PRODUCTS[p.productIdentifier]).map((p) => ({ id: p.productIdentifier, txId: String(p.transactionId), date: Date.parse(p.purchaseDate) || 0, revoked: !!p.revocationDate }));
  },
  /** Ask the App Store to sync this Apple ID's purchases (may show a sign-in prompt). The caller then reads `history()`. */
  async restore() {
    if (store.mode === 'demo') return { ok: true };
    if (store.mode !== 'native') return { ok: false, error: tk('Restore is available in the App Store version.') };
    try { await NativePurchases.restorePurchases(); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e?.message || e) }; }
  },
};
