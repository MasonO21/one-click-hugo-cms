import type { BillingProvider } from './types';

// RevenueCat's native SDK is not used on web; demo builds fall back to local billing.
export function createRevenueCatProvider(_apiKey: string): BillingProvider | null {
  return null;
}
