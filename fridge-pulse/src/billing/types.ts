import type { Entitlement } from './trial';

export interface Offer {
  /** Localised price, e.g. "$9.99". */
  priceString: string;
}

export type PurchaseResult =
  | { ok: true; entitlement: Entitlement }
  | { ok: false; cancelled: boolean; message?: string };

export interface BillingProvider {
  kind: 'revenuecat' | 'local' | 'unconfigured';
  init(): Promise<void>;
  getEntitlement(): Promise<Entitlement>;
  getOffer(): Promise<Offer>;
  /** Starts the free trial (first time) or subscribes (after a trial). */
  purchase(): Promise<PurchaseResult>;
  restore(): Promise<Entitlement>;
  /** Subscribes to entitlement changes pushed by the store. Returns an unsubscribe fn. */
  subscribe(listener: (e: Entitlement) => void): () => void;
  /** Stable identifier the backend uses to look up this user's entitlement. */
  getUserId(): Promise<string>;
  /** Development only (local provider): move the trial so it ends in `daysLeft` days. */
  simulateTrialDaysLeft?(daysLeft: number): Promise<void>;
}
