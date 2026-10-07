// Shop: cosmetic characters (src/art/items.js), unlocked with Hot Dogs, the shop currency.
//
//  • Hot Dogs are bought with real money in packs ($1 = 100 Hot Dogs, see src/shop-config.js). A character
//    costs 100 Hot Dogs. Every shop tab has a bundle, and there is an Everything Bundle; a bundle is priced
//    by how many of its characters the player is still missing, at the bundle discount.
//  • App (Capacitor): packs are consumable products in Google Play Billing / StoreKit, through
//    @capgo/native-purchases (plugin "NativePurchases"). Each purchase is credited once (by its transaction
//    id, kept in save.txSeen) and only then consumed (Android) or finished (iOS). Until then the store keeps
//    it, and the app looks again at launch, on resume and when the shop opens, so an interrupted purchase is
//    credited later rather than lost. (On iOS this relies on patches/@capgo+native-purchases*.patch, which
//    stops the plugin from finishing transactions on its own.) Refunds that iOS reports take the Hot Dogs back.
//  • Every purchase carries this install's wallet id (appAccountToken), so another phone or tablet on the
//    same store account doesn't credit it too. Another install's purchase is only taken over once it has
//    waited a day (that install is most likely gone, e.g. the app was reinstalled mid-purchase).
//  • All store calls run one at a time: on Android the plugin shares one billing connection, and a call that
//    overlaps another can cut it off.
//  • The wallet (balance, characters, credited purchases, wallet id) is also kept in native storage
//    (@capacitor/preferences), which the OS doesn't clear the way it can clear a web view's storage.
//  • Test contexts (Claude artifact, localhost, ?adtest): a clearly labelled test store, no money involved.
//  • Plain web build: no store — the shop shows the characters as "In the app".
// Characters are purely cosmetic: they are drawn over the sausage's own physics body, so every level plays the same.
import { ITEMS, ITEM_BY_ID, CATEGORIES } from './art/items.js';
import { WEB_ADS } from './ads.js';
import { SKIN_PRICE, BUNDLE_MIN, PACKS, PACK_BY_ID, bundlePrice } from './shop-config.js';

export const ALL = 'all';                         // the Everything Bundle (other bundle ids are tab ids)
const MIRROR_KEY = 'sizzleflip.wallet.v1';
const ADOPT_AFTER = 24 * 3600e3;                  // another install's purchase is taken over after a day
const PURCHASE_TIMEOUT = 10 * 60e3;               // a purchase sheet that never answers releases the shop after 10 minutes
export const fmt = (n) => Math.round(n).toLocaleString(); // in the player's number format
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const isPending = (tx) => tx.purchaseState !== undefined && tx.purchaseState !== null && String(tx.purchaseState) !== '1'; // Android

function uuid() {
  const c = window.crypto;
  if (c && c.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && c.getRandomValues) c.getRandomValues(b); else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export class Shop {
  constructor(app) {
    this.app = app;
    this.prices = {};
    this.busy = false;
    this.mirrorWrite = Promise.resolve();
    this.migrate();
    const Cap = window.Capacitor;
    const native = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform() && Cap.registerPlugin);
    this.prefs = native ? Cap.registerPlugin('Preferences') : null;
    this.provider = native ? new NativeStore(this, Cap.registerPlugin('NativePurchases'), Cap.getPlatform ? Cap.getPlatform() : 'android')
      : WEB_ADS === 'test' ? new TestStore(this) : { kind: 'none' };
    this.walletReady = this.restoreMirror().catch((e) => console.warn('[shop] wallet', e)).then(() => this.ensureWalletId());
    this.ready = this.walletReady.then(() => this.provider.init && this.provider.init()).catch((e) => console.warn('[shop] init', e));
    // e.g. an Android payment that was pending clears while the app is in the background
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.refresh(); });
  }

  get kind() { return this.provider.kind; }
  get available() { return this.provider.kind !== 'none'; }
  get owned() { const s = this.app.save; s.owned = obj(s.owned); return s.owned; }
  get txSeen() { const s = this.app.save; s.txSeen = obj(s.txSeen); return s.txSeen; }
  get balance() { const n = this.app.save.hotdogs; return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; }
  get walletId() { return this.app.save.walletId || ''; }
  isOwned(id) { return !!(ITEM_BY_ID[id] && this.owned[id]); }
  ownedCount() { return ITEMS.filter(i => this.owned[i.id]).length; }
  packPrice(pid) { return this.prices[pid] || '$' + PACK_BY_ID[pid].usd; }

  // the item to draw instead of the sausage (null = sausage)
  characterItem() {
    const id = this.app.save.character;
    return id && id !== 'sausage' && this.isOwned(id) ? ITEM_BY_ID[id] || null : null;
  }

  equip(id) {
    this.app.save.character = id === 'sausage' || this.isOwned(id) ? id : 'sausage';
    this.app.persist();
    this.writeMirror();
  }

  // ------------------------------------------------------------ bundles (a tab id, or ALL)
  bundleName(b) { if (b === ALL) return 'Everything Bundle'; const c = CATEGORIES.find(c => c.id === b); return c ? `${c.name} Bundle` : 'Bundle'; }
  bundleItems(b) { return b === ALL ? ITEMS : ITEMS.filter(i => i.cat === b); }
  bundleOffer(b) {
    const all = this.bundleItems(b), missing = all.filter(i => !this.owned[i.id]), n = missing.length;
    return { id: b, name: this.bundleName(b), total: all.length, items: missing, n, cost: bundlePrice(n), full: n * SKIN_PRICE, open: n >= BUNDLE_MIN };
  }

  // ------------------------------------------------------------ spending Hot Dogs
  // Resolve 'bought' | 'short' (not enough Hot Dogs) | 'owned' | 'changed' (price no longer the quoted one) | 'unavailable'
  async unlock(id) {
    await this.walletReady;
    if (!ITEM_BY_ID[id] || !this.available) return 'unavailable';
    if (this.owned[id]) return 'owned';
    if (!this.spend(SKIN_PRICE)) return 'short';
    this.owned[id] = { at: Date.now(), source: 'hotdogs' };
    this.app.save.character = id;
    this.saveWallet();
    return 'bought';
  }

  // quoted: the price the player agreed to; nothing is charged if the bundle has changed since
  async unlockBundle(b, quoted) {
    await this.walletReady;
    const o = this.bundleOffer(b);
    if (!o.total || !this.available) return 'unavailable';
    if (!o.n) return 'owned';
    if (!o.open) return 'unavailable';
    if (quoted !== undefined && quoted !== o.cost) return 'changed';
    if (!this.spend(o.cost)) return 'short';
    const at = Date.now();
    for (const it of o.items) this.owned[it.id] = { at, source: 'bundle:' + b };
    this.saveWallet();
    return 'bought';
  }

  spend(n) {
    if (!(n > 0) || this.balance < n) return false;
    this.app.save.hotdogs = this.balance - n;
    return true;
  }

  // ------------------------------------------------------------ buying Hot Dogs
  // Resolves { r: 'bought' | 'pending' | 'cancelled' | 'stuck' | 'error' | 'unavailable' | 'busy', n: Hot Dogs credited }
  async buyPack(pid) {
    if (!PACK_BY_ID[pid] || !this.available) return { r: 'unavailable', n: 0 };
    if (this.busy) return { r: 'busy', n: 0 };
    this.busy = true;
    try {
      await this.walletReady;
      return await this.provider.buy(pid);
    } catch (e) { console.warn('[shop] buy', e); return { r: 'error', n: 0 }; } finally { this.busy = false; }
  }

  txKey(tx) { return String((tx && (tx.transactionId || tx.purchaseToken || tx.orderId)) || ''); }

  // Is this purchase this install's to credit? Ours (our wallet id), or without one, or another install's that
  // has waited over a day.
  isMine(tx) {
    const t = tx && tx.appAccountToken ? String(tx.appAccountToken).toLowerCase() : '';
    if (!t || t === this.walletId.toLowerCase()) return true;
    const at = Date.parse((tx && tx.purchaseDate) || '');
    return Number.isFinite(at) && Date.now() - at > ADOPT_AFTER;
  }

  // credit a completed store purchase, once. Returns the Hot Dogs added (0 if it was credited before).
  credit(tx) {
    const pack = PACK_BY_ID[tx && tx.productIdentifier], key = this.txKey(tx);
    if (!pack || !key || this.txSeen[key]) return 0;
    const n = pack.hotdogs * Math.max(1, Math.floor(+tx.quantity) || 1);
    this.txSeen[key] = { p: pack.id, n, at: Date.now() };
    this.app.save.hotdogs = this.balance + n;
    this.saveWallet();
    return n;
  }

  isFinished(tx) { const e = this.txSeen[this.txKey(tx)]; return !!(e && e.f); }
  markFinished(tx) { const e = this.txSeen[this.txKey(tx)]; if (e && !e.f) { e.f = 1; this.saveWallet(); } }

  // a refunded purchase: take its Hot Dogs back, as far as the balance goes (and never credit it later)
  revoke(tx) {
    const pack = PACK_BY_ID[tx && tx.productIdentifier], key = this.txKey(tx);
    if (!pack || !key) return;
    const e = this.txSeen[key];
    if (e && e.r) return;
    if (e) this.app.save.hotdogs = Math.max(0, this.balance - (e.n || 0));
    this.txSeen[key] = { ...(e || { p: pack.id, n: 0, at: Date.now() }), f: 1, r: 1 };
    this.saveWallet();
  }

  // ask the store again for purchases not credited yet (shop opened, app resumed); never during a purchase
  refresh() {
    if (!this.provider.sync || this.busy || Date.now() - (this._synced || 0) < 4000) return;
    this._synced = Date.now();
    this.ready.then(() => this.provider.sync()).catch((e) => console.warn('[shop] sync', e));
  }

  // ------------------------------------------------------------ wallet storage
  saveWallet() {
    const s = this.app.save;
    s.walletRev = (s.walletRev || 0) + 1;
    this.app.persist();
    this.writeMirror();
    const ui = this.app.ui;
    if (ui && ui.onShopChanged) ui.onShopChanged();
  }

  ensureWalletId() {
    const s = this.app.save;
    if (s.walletId) return;
    s.walletId = uuid();
    s.walletRev = (s.walletRev || 0) + 1;
    this.app.persist();
    this.writeMirror();
  }

  // The web view's storage can be cleared by the OS; the native copy can't. The newer copy wins.
  async restoreMirror() {
    if (!this.prefs || !this.prefs.get) return;
    const { value } = (await this.prefs.get({ key: MIRROR_KEY })) || {};
    const m = value ? JSON.parse(value) : null;
    const s = this.app.save, mine = s.walletRev || 0, theirs = (m && +m.rev) || 0;
    if (m && theirs > mine) {
      s.hotdogs = Number.isFinite(m.hotdogs) && m.hotdogs > 0 ? Math.floor(m.hotdogs) : 0;
      s.owned = obj(m.owned);
      s.txSeen = obj(m.txSeen);
      if (m.walletId) s.walletId = m.walletId;
      if (typeof m.character === 'string') s.character = m.character;
      s.walletRev = theirs;
      this.app.persist();
      const ui = this.app.ui;
      if (ui && ui.onShopChanged) ui.onShopChanged();
    } else if (mine > theirs) this.writeMirror();
  }

  // Returns a promise that settles once this copy is stored (purchases are finished only after that).
  writeMirror() {
    if (!this.prefs || !this.prefs.set) return this.mirrorWrite;
    const s = this.app.save;
    const value = JSON.stringify({ rev: s.walletRev || 0, walletId: s.walletId, hotdogs: this.balance, owned: this.owned, txSeen: this.txSeen, character: s.character });
    let p;
    try { p = Promise.resolve(this.prefs.set({ key: MIRROR_KEY, value })); } catch (e) { p = Promise.reject(e); }
    this.mirrorWrite = p.catch((e) => console.warn('[shop] mirror', e));
    return this.mirrorWrite;
  }

  // test builds bought characters with real-money products before Hot Dogs existed
  migrate() {
    const s = this.app.save, owned = this.owned;
    if (!owned.bundle) return;
    for (const it of ITEMS) if (!owned[it.id]) owned[it.id] = { at: owned.bundle.at || Date.now(), source: 'bundle' };
    delete owned.bundle;
    s.walletRev = (s.walletRev || 0) + 1;
    this.app.persist();
  }

  // Settings → testing panel only
  resetTestPurchases() {
    if (this.kind !== 'test') return;
    const s = this.app.save;
    s.owned = {}; s.txSeen = {}; s.hotdogs = 0; s.character = 'sausage';
    this.saveWallet();
  }
}

class NativeStore {
  constructor(shop, plugin, platform) {
    this.kind = 'store'; this.shop = shop; this.plugin = plugin; this.android = platform !== 'ios';
    this.q = Promise.resolve();
  }

  // run store calls one at a time (see the top of this file)
  queue(job) {
    const p = this.q.then(job);
    this.q = p.catch(() => {});
    return p;
  }

  async init() {
    // iOS: purchases that complete outside a buy() call (Ask to Buy, a payment that cleared, a purchase
    // interrupted by a crash). The patched plugin leaves them unfinished and keeps the event until this
    // listener is attached.
    try { await this.plugin.addListener('transactionUpdated', (tx) => { this.queue(() => this.handle([tx])).catch((e) => console.warn('[shop] update', e)); }); } catch (e) { /* noop */ }
    this.shop._synced = Date.now();
    await this.sync();
  }

  sync() {
    return this.queue(async () => {
      if (!Object.keys(this.shop.prices).length) await this.loadPrices();
      const { purchases } = await this.plugin.getPurchases({ productType: 'inapp' });
      return this.handle(purchases);
    });
  }

  async loadPrices() {
    try {
      const { products } = await this.plugin.getProducts({ productIdentifiers: PACKS.map(p => p.id), productType: 'inapp' });
      for (const p of products || []) if (PACK_BY_ID[p.identifier] && p.priceString) this.shop.prices[p.identifier] = p.priceString;
    } catch (e) { console.warn('[shop] products', e); }
  }

  // Purchases the store still holds: Android — paid but not consumed yet; iOS — not finished yet.
  async handle(list) {
    let n = 0;
    for (const tx of list || []) {
      if (!tx || !PACK_BY_ID[tx.productIdentifier]) continue;
      if (tx.revocationDate) { this.shop.revoke(tx); continue; }   // only takes back what this install credited
      if (isPending(tx) || !this.shop.isMine(tx)) continue;
      n += this.shop.credit(tx);
      await this.finish(tx);
    }
    const ui = this.shop.app.ui;
    if (n && ui && ui.onCredited) ui.onCredited(n);
    return n;
  }

  // Consume (Android; this also lets the pack be bought again) or finish (iOS), only once the Hot Dogs are
  // credited and stored. If it fails, the next sync tries again — the credit itself never repeats.
  async finish(tx) {
    if (!this.android && this.shop.isFinished(tx)) return;
    try {
      await this.shop.mirrorWrite;
      if (this.android) await this.plugin.consumePurchase({ purchaseToken: tx.purchaseToken || tx.transactionId });
      else await this.plugin.acknowledgePurchase({ purchaseToken: String(tx.transactionId) });
      this.shop.markFinished(tx);
    } catch (e) { console.warn('[shop] finish', e); }
  }

  buy(pid) {
    return this.queue(async () => {
      let tx, timer;
      const purchase = this.plugin.purchaseProduct({
        productIdentifier: pid, productType: 'inapp', quantity: 1, isConsumable: false, autoAcknowledgePurchases: false, appAccountToken: this.shop.walletId,
      });
      try {
        const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve({ timedOut: true }), PURCHASE_TIMEOUT); });
        tx = await Promise.race([timeout, purchase]);
      } catch (e) {
        // Android reports a cancel as message "Purchase is not purchased" with code USER_CANCELED
        const msg = `${(e && e.message) || e} ${(e && e.code) || ''}`.toLowerCase();
        if (/item_already_owned|already own/.test(msg)) { await this.syncNow(); return { r: 'stuck', n: 0 }; }
        return { r: /cancel/.test(msg) ? 'cancelled' : /pending|deferred/.test(msg) ? 'pending' : 'error', n: 0 };
      } finally { clearTimeout(timer); }
      if (tx && tx.timedOut) {
        // the purchase sheet never answered: release the shop; if it answers later, credit it then
        purchase.then((late) => late && this.queue(() => this.handle([{ ...late, productIdentifier: late.productIdentifier || pid }]))).catch(() => {});
        return { r: 'pending', n: 0 };
      }
      if (!tx || !this.shop.txKey(tx)) return { r: 'error', n: 0 };
      tx = { ...tx, productIdentifier: tx.productIdentifier || pid };
      if (isPending(tx)) return { r: 'pending', n: 0 };
      const n = this.shop.credit(tx);
      await this.finish(tx);
      return { r: 'bought', n };
    });
  }

  // a sync from inside a queued job (it already holds the queue)
  async syncNow() {
    try { const { purchases } = await this.plugin.getPurchases({ productType: 'inapp' }); await this.handle(purchases); } catch (e) { console.warn('[shop] sync', e); }
  }
}

// Test store for the browser build: a clearly labelled confirmation, no payment.
class TestStore {
  constructor(shop) { this.kind = 'test'; this.shop = shop; this.seq = 0; }
  buy(pid) {
    const pack = PACK_BY_ID[pid];
    return new Promise((resolve) => {
      this.shop.app.ui.confirm(`TEST PURCHASE — no money is charged.\nBuy ${pack.title} for ${this.shop.packPrice(pid)}?`, () => {
        const n = this.shop.credit({ productIdentifier: pid, transactionId: `test-${Date.now()}-${++this.seq}` });
        resolve({ r: 'bought', n });
      }, { yes: 'Buy (test)', no: () => resolve({ r: 'cancelled', n: 0 }) });
    });
  }
}
