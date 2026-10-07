// Shop: cosmetic characters (src/art/items.js), $1 each as one-time in-app purchases, plus the
// Everything Bundle (one purchase that unlocks every character, including ones added in later updates).
//
//  • App (Capacitor): Google Play Billing / StoreKit through @capgo/native-purchases (plugin "NativePurchases").
//    Purchases are acknowledged automatically (Google refunds unacknowledged ones after 3 days), pending
//    payments unlock when they complete, and ownership is re-read from the store at launch (reinstalls,
//    new phones) and on "Restore purchases".
//  • Test contexts (Claude artifact, localhost, ?adtest): a clearly labelled test store, no money involved.
//  • Plain web build: no store — the shop shows the items as "In the app".
// Items are purely cosmetic: they are drawn over the sausage's own physics body, so every level plays the same.
import { ITEMS, ITEM_BY_ID } from './art/items.js';
import { WEB_ADS } from './ads.js';

export const PRODUCT_PREFIX = 'item_';            // store product id = item_<id>, e.g. item_butter
export const BUNDLE = 'bundle';                   // the Everything Bundle…
export const BUNDLE_PRODUCT = 'bundle_all';       // …and its store product id
export const productId = (id) => (id === BUNDLE ? BUNDLE_PRODUCT : PRODUCT_PREFIX + id);
export const PRICE_FALLBACK = '$1.00';            // shown until the store returns the local price
export const BUNDLE_PRICE_FALLBACK = '$9.99';

export class Shop {
  constructor(app) {
    this.app = app;
    this.prices = {};
    this.provider = pickProvider(this);
    this.ready = this.provider.init ? this.provider.init().catch((e) => console.warn('[shop] init', e)) : Promise.resolve();
  }

  get kind() { return this.provider.kind; }
  get available() { return this.provider.kind !== 'none'; }
  get owned() { const s = this.app.save; if (!s.owned || typeof s.owned !== 'object') s.owned = {}; return s.owned; }
  get hasBundle() { return !!this.owned[BUNDLE]; }
  isOwned(id) { return !!this.owned[id] || (id !== BUNDLE && id !== 'sausage' && this.hasBundle); }
  price(id) { return this.prices[id] || (id === BUNDLE ? BUNDLE_PRICE_FALLBACK : PRICE_FALLBACK); }
  ownedCount() { return this.hasBundle ? ITEMS.length : ITEMS.filter(i => this.owned[i.id]).length; }

  // the item to draw instead of the sausage (null = sausage)
  characterItem() {
    const id = this.app.save.character;
    return id && id !== 'sausage' && this.isOwned(id) ? ITEM_BY_ID[id] || null : null;
  }

  equip(id) {
    this.app.save.character = id === 'sausage' || this.isOwned(id) ? id : 'sausage';
    this.app.persist();
  }

  grant(id, source) {
    if ((!ITEM_BY_ID[id] && id !== BUNDLE) || this.owned[id]) return false;
    this.owned[id] = { at: Date.now(), source };
    this.app.persist();
    return true;
  }

  // productIdentifier from the store → item id
  itemFor(pid) { return pid === BUNDLE_PRODUCT ? BUNDLE : pid && pid.startsWith(PRODUCT_PREFIX) ? pid.slice(PRODUCT_PREFIX.length) : null; }

  // Resolves 'bought' | 'pending' | 'cancelled' | 'error' | 'unavailable'
  async buy(id) {
    if (this.isOwned(id)) return 'bought';
    if (!this.available || this.busy) return 'unavailable';
    this.busy = true;
    try {
      const r = await this.provider.buy(id);
      if (r === 'bought') { this.grant(id, this.kind); if (id !== BUNDLE) this.equip(id); }
      return r;
    } catch (e) { console.warn('[shop] buy', e); return 'error'; } finally { this.busy = false; }
  }

  // Resolves the number of items newly restored (or -1 if the store couldn't be reached)
  async restore() {
    if (!this.available || !this.provider.restore) return 0;
    try { return await this.provider.restore(); } catch (e) { console.warn('[shop] restore', e); return -1; }
  }

  // apply a list of store transactions (launch sync, restore, live updates). Returns newly granted count.
  applyTransactions(list) {
    let n = 0;
    for (const tx of list || []) {
      const id = this.itemFor(tx.productIdentifier);
      if (!id) continue;
      if (tx.revocationDate) {
        if (this.owned[id]) { delete this.owned[id]; if (!this.characterItem()) this.app.save.character = 'sausage'; this.app.persist(); }
        continue;
      }
      if (tx.purchaseState !== undefined && tx.purchaseState !== null && String(tx.purchaseState) !== '1') continue; // Android: pending
      if (this.grant(id, this.kind)) n++;
    }
    if (n) this.app.ui && this.app.ui.onShopChanged && this.app.ui.onShopChanged();
    return n;
  }

  // Settings → testing panel only
  resetTestPurchases() { if (this.kind !== 'test') return; this.app.save.owned = {}; this.app.save.character = 'sausage'; this.app.persist(); }
}

function pickProvider(shop) {
  const Cap = window.Capacitor;
  const native = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  if (native && Cap.registerPlugin) return new NativeStore(shop, Cap.registerPlugin('NativePurchases'));
  if (WEB_ADS === 'test') return new TestStore(shop);
  return { kind: 'none' };
}

class NativeStore {
  constructor(shop, plugin) { this.kind = 'store'; this.shop = shop; this.plugin = plugin; }

  async init() {
    const P = this.plugin;
    // purchases completed outside a buy() call: pending payments that cleared, promo codes, Ask to Buy
    try { await P.addListener('transactionUpdated', (tx) => this.shop.applyTransactions([tx])); } catch (e) { /* noop */ }
    try {
      const { products } = await P.getProducts({ productIdentifiers: [...ITEMS.map(i => productId(i.id)), BUNDLE_PRODUCT], productType: 'inapp' });
      for (const p of products || []) { const id = this.shop.itemFor(p.identifier); if (id && p.priceString) this.shop.prices[id] = p.priceString; }
    } catch (e) { console.warn('[shop] products', e); }
    await this.sync();
  }

  async sync() {
    const { purchases } = await this.plugin.getPurchases({ productType: 'inapp' });
    return this.shop.applyTransactions(purchases);
  }

  async buy(id) {
    let tx;
    try {
      tx = await this.plugin.purchaseProduct({ productIdentifier: productId(id), productType: 'inapp', quantity: 1 });
    } catch (e) {
      const msg = String((e && (e.message || e.code)) || e).toLowerCase();
      return /cancel/.test(msg) ? 'cancelled' : 'error';
    }
    if (tx && tx.purchaseState !== undefined && tx.purchaseState !== null && String(tx.purchaseState) !== '1') return 'pending';
    return 'bought';
  }

  async restore() {
    try { await this.plugin.restorePurchases(); } catch (e) { /* Android: nothing to restore explicitly */ }
    return this.sync();
  }
}

// Test store for the browser build: a clearly labelled confirmation, no payment.
class TestStore {
  constructor(shop) { this.kind = 'test'; this.shop = shop; }
  buy(id) {
    const name = id === BUNDLE ? `the Everything Bundle (all ${ITEMS.length} characters)` : ITEM_BY_ID[id].name;
    return new Promise((resolve) => {
      this.shop.app.ui.confirm(`TEST PURCHASE — no money is charged.\nBuy ${name} for ${this.shop.price(id)}?`, () => resolve('bought'),
        { yes: 'Buy (test)', no: () => resolve('cancelled') });
    });
  }
  async restore() { return 0; }
}
