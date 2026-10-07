/**
 * Platform service interfaces. Web/dev builds use mock implementations; iOS/Android builds use
 * Capacitor plugin adapters (see src/platform/*). The Game only talks to these interfaces.
 */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export type AdResult = 'rewarded' | 'skipped' | 'unavailable';

export interface AdService {
  /** Preload/check readiness for a rewarded placement. */
  isReady(placement: string): boolean;
  /** Show a rewarded video. Resolves when closed. */
  showRewarded(placement: string): Promise<AdResult>;
}

export interface StoreProduct {
  id: string;
  /** Localized price string from the store, e.g. "$4.99" / "4,99 €". */
  price: string;
  priceMicros?: number;
  currency?: string;
  available: boolean;
}

export interface PurchaseResult {
  ok: boolean;
  productId: string;
  /** Store transaction id (for server-side receipt validation hooks). */
  transactionId?: string;
  error?: string;
  cancelled?: boolean;
}

export interface IapService {
  init(productIds: { id: string; type: 'consumable' | 'non_consumable' | 'subscription' }[]): Promise<void>;
  products(): StoreProduct[];
  purchase(productId: string): Promise<PurchaseResult>;
  /** Restore non-consumables & subscriptions; returns owned product ids. */
  restore(): Promise<string[]>;
  /** Active subscription expiry (epoch ms) if known. */
  subscriptionExpiry?(productId: string): Promise<number | null>;
}

export interface AnalyticsService {
  setConsent(enabled: boolean): void;
  track(event: string, props?: Record<string, string | number | boolean>): void;
  /** Flush queued events (called on pause). */
  flush(): Promise<void>;
}

export interface HapticsService {
  tap(): void;
  success(): void;
  warning(): void;
  heavy(): void;
}

export interface CloudSaveService {
  available(): boolean;
  upload(data: string): Promise<boolean>;
  download(): Promise<string | null>;
}

export interface PlatformServices {
  platform: 'web' | 'ios' | 'android';
  store: KeyValueStore;
  ads: AdService;
  iap: IapService;
  analytics: AnalyticsService;
  haptics: HapticsService;
  cloud: CloudSaveService;
}
