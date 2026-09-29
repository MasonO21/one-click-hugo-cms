import Purchases, { type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';
import { mapCustomerInfo } from './mapCustomerInfo';
import { PRICE_PER_MONTH } from './trial';
import type { BillingProvider } from './types';

/**
 * Store-backed billing via RevenueCat. The 14-day free trial is an introductory
 * offer configured on the subscription product in App Store Connect / Google Play;
 * RevenueCat reports it as an entitlement with periodType "trial".
 */
export function createRevenueCatProvider(apiKey: string): BillingProvider {
  let pkg: PurchasesPackage | null = null;

  async function monthlyPackage(): Promise<PurchasesPackage | null> {
    if (pkg) return pkg;
    const offerings = await Purchases.getOfferings();
    pkg = offerings.current?.monthly ?? offerings.current?.availablePackages[0] ?? null;
    return pkg;
  }

  return {
    kind: 'revenuecat',
    async init() {
      if (!(await Purchases.isConfigured())) Purchases.configure({ apiKey });
    },
    async getEntitlement() {
      return mapCustomerInfo(await Purchases.getCustomerInfo());
    },
    async getOffer() {
      try {
        const p = await monthlyPackage();
        return { priceString: p?.product.priceString ?? PRICE_PER_MONTH };
      } catch {
        return { priceString: PRICE_PER_MONTH };
      }
    },
    async purchase() {
      try {
        const p = await monthlyPackage();
        if (!p) return { ok: false, cancelled: false, message: 'The subscription is not available right now. Please try again later.' };
        const { customerInfo } = await Purchases.purchasePackage(p);
        return { ok: true, entitlement: mapCustomerInfo(customerInfo) };
      } catch (e) {
        const err = e as { userCancelled?: boolean | null; message?: string };
        if (err.userCancelled) return { ok: false, cancelled: true };
        return { ok: false, cancelled: false, message: err.message ?? 'The purchase could not be completed.' };
      }
    },
    async restore() {
      return mapCustomerInfo(await Purchases.restorePurchases());
    },
    subscribe(listener) {
      const handler = (info: CustomerInfo) => listener(mapCustomerInfo(info));
      Purchases.addCustomerInfoUpdateListener(handler);
      return () => {
        Purchases.removeCustomerInfoUpdateListener(handler);
      };
    },
    async getUserId() {
      return Purchases.getAppUserID();
    },
  };
}
