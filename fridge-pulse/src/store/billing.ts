import { create } from 'zustand';
import { pickProvider, type BillingProvider } from '../billing';
import { DEFAULT_PLAN, NO_ENTITLEMENT, PLANS, priceLabel, type Entitlement, type PlanId } from '../billing/trial';

let provider: BillingProvider | null = null;
/** Lazily created so tests and web builds never touch native billing modules unless needed. */
export function getProvider(): BillingProvider {
  provider ??= pickProvider();
  return provider;
}

interface BillingState {
  /** True once the first entitlement lookup has finished (success or failure). */
  ready: boolean;
  entitlement: Entitlement;
  /** Each plan's price: the store's localised one once it arrives, the US price until then. */
  prices: Record<PlanId, string>;
  busy: boolean;
  error: string | null;
  init: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Starts the free trial or subscribes on a plan. Resolves true when access was granted. */
  purchase: (plan: PlanId) => Promise<boolean>;
  restore: () => Promise<boolean>;
}

let initStarted = false;

const US_PRICES = Object.fromEntries(Object.values(PLANS).map((p) => [p.id, p.price])) as Record<PlanId, string>;

/** The price and period ("/year" or "/month") of the person's plan, or of the plan they are about to pick. */
export function planPriceLabel(prices: Record<PlanId, string>, plan: PlanId = DEFAULT_PLAN): string {
  return priceLabel(prices[plan], PLANS[plan].period);
}

export const useBilling = create<BillingState>((set, get) => ({
  ready: false,
  entitlement: NO_ENTITLEMENT,
  prices: US_PRICES,
  busy: false,
  error: null,

  async init() {
    if (initStarted) return;
    initStarted = true;
    const p = getProvider();
    try {
      await p.init();
      p.subscribe((entitlement) => set({ entitlement }));
      // The app opens as soon as access is known; the store's localised price follows when it arrives.
      set({ entitlement: await p.getEntitlement(), ready: true, error: null });
      p.getOffer()
        .then((offer) => set({ prices: { ...US_PRICES, ...offer.prices } }))
        .catch(() => {});
    } catch {
      set({ ready: true, error: 'Could not check your subscription. Check your connection and try again.' });
    }
  },

  async refresh() {
    try {
      set({ entitlement: await getProvider().getEntitlement() });
    } catch {
      // Keep the last known entitlement when offline.
    }
  },

  async purchase(plan) {
    if (get().busy) return false;
    set({ busy: true, error: null });
    const result = await getProvider().purchase(plan);
    if (result.ok) {
      set({ busy: false, entitlement: result.entitlement });
      return true;
    }
    set({ busy: false, error: result.cancelled ? null : (result.message ?? 'The purchase could not be completed.') });
    return false;
  },

  async restore() {
    if (get().busy) return false;
    set({ busy: true, error: null });
    try {
      const entitlement = await getProvider().restore();
      const granted = entitlement.status === 'trial' || entitlement.status === 'active';
      set({ busy: false, entitlement, error: granted ? null : 'No active subscription was found for this account.' });
      return granted;
    } catch {
      set({ busy: false, error: 'Could not restore purchases. Please try again.' });
      return false;
    }
  },
}));
