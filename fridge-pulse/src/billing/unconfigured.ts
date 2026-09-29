import { NO_ENTITLEMENT, PRICE_PER_MONTH } from './trial';
import type { BillingProvider } from './types';

/**
 * Used when a production build has no store credentials. It fails closed:
 * nobody gets access, and the paywall explains that purchases are unavailable.
 */
export function createUnconfiguredProvider(): BillingProvider {
  const message = 'Purchases are not available in this build.';
  return {
    kind: 'unconfigured',
    async init() {},
    async getEntitlement() {
      return NO_ENTITLEMENT;
    },
    async getOffer() {
      return { priceString: PRICE_PER_MONTH };
    },
    async purchase() {
      return { ok: false, cancelled: false, message };
    },
    async restore() {
      return NO_ENTITLEMENT;
    },
    subscribe() {
      return () => {};
    },
    async getUserId() {
      return 'unconfigured';
    },
  };
}
