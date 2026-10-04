import { Platform } from 'react-native';
import Purchases, { type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';
import { mapCustomerInfo } from './mapCustomerInfo';
import { ENTITLEMENT_ID, PLAN_IDS, PLANS, type PlanId } from './trial';
import type { BillingProvider } from './types';

/**
 * The package for a plan in the current offering: by its package identifier, else by product id
 * (Google Play product ids carry a ":base-plan" suffix), else the offering's monthly / annual slot.
 */
export function findPackage<P extends { identifier: string; product: { identifier: string } }>(
  available: P[],
  plan: PlanId,
  slots: { monthly?: P | null; annual?: P | null } = {},
): P | null {
  const want = PLANS[plan];
  return (
    available.find((p) => p.identifier === want.packageId) ??
    available.find((p) => p.product.identifier === want.productId || p.product.identifier.startsWith(`${want.productId}:`)) ??
    (plan === 'monthly' ? slots.monthly : plan === 'annual' ? slots.annual : null) ??
    null
  );
}

/** "fridge_pulse_monthly:monthly-base" -> "fridge_pulse_monthly": Google Play's subscription id. */
const subscriptionId = (productId: string) => productId.split(':')[0]!;

/**
 * Store-backed billing via RevenueCat. The 2-week free trial is an introductory
 * offer configured on the subscription product in App Store Connect / Google Play;
 * RevenueCat reports it as an entitlement with periodType "trial".
 */
export function createRevenueCatProvider(apiKey: string): BillingProvider {
  let packages: Partial<Record<PlanId, PurchasesPackage>> | null = null;

  async function packageFor(plan: PlanId): Promise<PurchasesPackage | null> {
    if (!packages) {
      const current = (await Purchases.getOfferings()).current;
      const found: Partial<Record<PlanId, PurchasesPackage>> = {};
      for (const id of PLAN_IDS) {
        const p = current ? findPackage(current.availablePackages, id, { monthly: current.monthly, annual: current.annual }) : null;
        if (p) found[id] = p;
      }
      packages = found;
    }
    return packages[plan] ?? null;
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
      const prices: Partial<Record<PlanId, string>> = {};
      try {
        for (const id of PLAN_IDS) {
          const p = await packageFor(id);
          if (p) prices[id] = p.product.priceString;
        }
      } catch {
        // The plans' US prices stand in until the store answers.
      }
      return { prices };
    },
    async purchase(plan) {
      try {
        const p = await packageFor(plan);
        if (!p) return { ok: false, cancelled: false, message: 'That plan is not available right now. Please try again later.' };
        // Google Play needs to be told which subscription a plan change replaces, or the person pays for both.
        // The App Store does this itself, since every plan is in one subscription group.
        let change = null;
        if (Platform.OS === 'android') {
          const current = (await Purchases.getCustomerInfo()).entitlements.active[ENTITLEMENT_ID]?.productIdentifier;
          if (current && subscriptionId(current) !== subscriptionId(p.product.identifier)) {
            change = { oldProductIdentifier: subscriptionId(current), replacementMode: Purchases.STORE_REPLACEMENT_MODE.WITH_TIME_PRORATION };
          }
        }
        const { customerInfo } = await Purchases.purchasePackage(p, null, change);
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
