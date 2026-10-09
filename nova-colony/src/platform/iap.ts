/**
 * In-app purchases.
 *  - RevenueCatIap : @revenuecat/purchases-capacitor on iOS/Android. API keys come from
 *                    VITE_RC_IOS_KEY / VITE_RC_ANDROID_KEY (public SDK keys). Localized prices come from the store.
 *                    The App Store / Play Store product ids are the ids in src/data/monetization.ts.
 *  - WebMockIap    : web/dev — a confirm() dialog flagged as a dev store. No money moves.
 *
 * Prices are never hard-coded here; LiveOpsSystem.price() falls back to ProductDef.fallbackPrice when
 * the store has not answered. OWNER: meta agent.
 */
import type { IapService, PurchaseResult, StoreProduct } from './types';
import { env, isDevBuild } from './env';

type ProductKind = 'consumable' | 'non_consumable' | 'subscription';
type RcModule = typeof import('@revenuecat/purchases-capacitor');
type RcStoreProduct = import('@revenuecat/purchases-capacitor').PurchasesStoreProduct;
type RcCustomerInfo = import('@revenuecat/purchases-capacitor').CustomerInfo;

/** Google subscription ids come back as "<subscriptionId>:<basePlanId>". */
const baseId = (id: string): string => id.split(':')[0];

export class RevenueCatIap implements IapService {
  private mod: Promise<RcModule> | null = null;
  private readonly kinds = new Map<string, ProductKind>();
  private readonly found = new Map<string, RcStoreProduct>();
  private configured = false;
  private info: RcCustomerInfo | null = null;
  private country: string | null = null;

  constructor(
    private readonly platform: 'ios' | 'android',
    private readonly apiKey: string = env(platform === 'ios' ? 'VITE_RC_IOS_KEY' : 'VITE_RC_ANDROID_KEY'),
  ) {}

  private plugin(): Promise<RcModule> {
    this.mod ??= import('@revenuecat/purchases-capacitor');
    return this.mod;
  }

  async init(products: { id: string; type: ProductKind }[]): Promise<void> {
    for (const p of products) this.kinds.set(p.id, p.type);
    if (!this.apiKey) {
      console.warn(`[iap] no RevenueCat key (VITE_RC_${this.platform === 'ios' ? 'IOS' : 'ANDROID'}_KEY) — the store is disabled in this build`);
      return;
    }
    try {
      const { Purchases, PRODUCT_CATEGORY, LOG_LEVEL } = await this.plugin();
      if (isDevBuild()) await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
      await Purchases.configure({ apiKey: this.apiKey });
      this.configured = true;
      const ids = (k: (t: ProductKind) => boolean) => products.filter((p) => k(p.type)).map((p) => p.id);
      for (const [productIdentifiers, type] of [
        [ids((t) => t !== 'subscription'), PRODUCT_CATEGORY.NON_SUBSCRIPTION],
        [ids((t) => t === 'subscription'), PRODUCT_CATEGORY.SUBSCRIPTION],
      ] as const) {
        if (productIdentifiers.length === 0) continue;
        try {
          const res = await Purchases.getProducts({ productIdentifiers, type });
          for (const p of res.products) this.found.set(baseId(p.identifier), p);
        } catch (e) {
          console.warn('[iap] could not fetch store products', e);
        }
      }
      this.info = (await Purchases.getCustomerInfo()).customerInfo;
      try {
        this.country = (await Purchases.getStorefront()).countryCode || null;
      } catch {
        /* unknown storefront: no regional rules apply */
      }
    } catch (e) {
      console.warn('[iap] RevenueCat init failed', e);
    }
  }

  storefrontCountry(): string | null {
    return this.country;
  }

  products(): StoreProduct[] {
    const out: StoreProduct[] = [];
    for (const id of this.kinds.keys()) {
      const p = this.found.get(id);
      out.push(
        p
          ? { id, price: p.priceString, priceMicros: Math.round(p.price * 1e6), currency: p.currencyCode, available: true }
          : { id, price: '', available: false },
      );
    }
    return out;
  }

  async purchase(productId: string): Promise<PurchaseResult> {
    const product = this.found.get(productId);
    if (!this.configured || !product) return { ok: false, productId, error: 'store_unavailable' };
    try {
      const { Purchases } = await this.plugin();
      const r = await Purchases.purchaseStoreProduct({ product });
      this.info = r.customerInfo;
      return { ok: true, productId, transactionId: r.transaction?.transactionIdentifier };
    } catch (e) {
      const err = e as { userCancelled?: boolean | null; code?: string | number; message?: string };
      // RevenueCat PURCHASE_CANCELLED_ERROR === "1"
      if (err.userCancelled || String(err.code) === '1') return { ok: false, productId, cancelled: true };
      return { ok: false, productId, error: err.message ?? 'purchase_failed' };
    }
  }

  async restore(): Promise<string[]> {
    if (!this.configured) return [];
    const { Purchases } = await this.plugin();
    const { customerInfo } = await Purchases.restorePurchases();
    this.info = customerInfo;
    const owned = new Set<string>();
    for (const id of customerInfo.allPurchasedProductIdentifiers) owned.add(baseId(id));
    for (const id of customerInfo.activeSubscriptions) owned.add(baseId(id));
    return [...owned];
  }

  async subscriptionExpiry(productId: string): Promise<number | null> {
    if (!this.configured) return null;
    try {
      const { Purchases } = await this.plugin();
      this.info = (await Purchases.getCustomerInfo()).customerInfo;
    } catch {
      /* use the last known info */
    }
    const dates = this.info?.allExpirationDates ?? {};
    for (const [id, iso] of Object.entries(dates)) {
      if (baseId(id) === productId && iso) {
        const t = Date.parse(iso);
        if (Number.isFinite(t)) return t;
      }
    }
    return null;
  }
}

/**
 * Web / dev store. Always flagged as a development store in the confirm dialog. Set
 * VITE_DISABLE_WEB_IAP=true to make web builds report the store as unavailable instead.
 */
export class WebMockIap implements IapService {
  private readonly kinds = new Map<string, ProductKind>();
  private readonly owned = new Set<string>();
  private readonly disabled = env('VITE_DISABLE_WEB_IAP') === 'true';

  async init(products: { id: string; type: ProductKind }[]): Promise<void> {
    for (const p of products) this.kinds.set(p.id, p.type);
  }

  products(): StoreProduct[] {
    // price '' => callers show ProductDef.fallbackPrice
    return [...this.kinds.keys()].map((id) => ({ id, price: '', available: !this.disabled }));
  }

  async purchase(productId: string): Promise<PurchaseResult> {
    if (this.disabled) return { ok: false, productId, error: 'store_unavailable' };
    const confirmFn = (globalThis as { confirm?: (m: string) => boolean }).confirm;
    if (typeof confirmFn === 'function' && !confirmFn(`DEV STORE (no real payment)\n\nPretend to buy "${productId}"?`)) {
      return { ok: false, productId, cancelled: true };
    }
    if (this.kinds.get(productId) === 'non_consumable') this.owned.add(productId);
    return { ok: true, productId, transactionId: `dev_${productId}_${Math.random().toString(36).slice(2, 10)}` };
  }

  async restore(): Promise<string[]> {
    return [...this.owned];
  }

  async subscriptionExpiry(_productId: string): Promise<number | null> {
    return null;
  }

  /** Web: VITE_STOREFRONT if set (testing), else the region of the browser language ("nl-BE" -> "BE"). */
  storefrontCountry(): string | null {
    const forced = env('VITE_STOREFRONT');
    if (forced) return forced;
    const lang = (globalThis as { navigator?: { language?: string } }).navigator?.language ?? '';
    const m = /^[a-z]{2,3}[-_]([A-Za-z]{2})\b/.exec(lang);
    return m ? m[1].toUpperCase() : null;
  }
}
