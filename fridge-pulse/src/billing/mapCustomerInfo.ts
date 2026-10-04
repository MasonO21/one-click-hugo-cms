import { daysBetween, toISODate, todayISO } from '../lib/dates';
import { ENTITLEMENT_ID, HOUSEHOLD_ENTITLEMENT_ID, NO_ENTITLEMENT, PLANS, type Entitlement, type PlanId } from './trial';

/** The slice of RevenueCat's CustomerInfo we read, so mapping can be tested without the SDK. */
export interface EntitlementLike {
  periodType: string;
  expirationDate: string | null;
  willRenew?: boolean;
  /** The store product behind it ("fridge_pulse_annual", or "...:base-plan" on Google Play). */
  productIdentifier?: string;
}

/** Which plan a store product id belongs to. */
export function planOfProduct(productId: string | undefined): PlanId | undefined {
  if (!productId) return undefined;
  return (Object.keys(PLANS) as PlanId[]).find((id) => productId === PLANS[id].productId || productId.startsWith(`${PLANS[id].productId}:`));
}
export interface CustomerInfoLike {
  entitlements: {
    active: Record<string, EntitlementLike | undefined>;
    all: Record<string, EntitlementLike | undefined>;
  };
}

function endDate(e: EntitlementLike): string | null {
  if (!e.expirationDate) return null;
  const d = new Date(e.expirationDate);
  return Number.isNaN(d.getTime()) ? null : toISODate(d);
}

export function mapCustomerInfo(info: CustomerInfoLike, now: Date = new Date()): Entitlement {
  const live = info.entitlements.active[ENTITLEMENT_ID];
  if (live) {
    const endsOn = endDate(live);
    return {
      status: live.periodType.toLowerCase() === 'trial' ? 'trial' : 'active',
      endsOn,
      daysRemaining: endsOn ? Math.max(0, daysBetween(todayISO(now), endsOn)) : null,
      ...(typeof live.willRenew === 'boolean' ? { willRenew: live.willRenew } : {}),
      ...(planOfProduct(live.productIdentifier) ? { planId: planOfProduct(live.productIdentifier) } : {}),
      ...(info.entitlements.active[HOUSEHOLD_ENTITLEMENT_ID] ? { household: true } : {}),
    };
  }
  const past = info.entitlements.all[ENTITLEMENT_ID];
  if (past) return { status: 'expired', endsOn: endDate(past), daysRemaining: 0, lapsed: past.periodType.toLowerCase() === 'trial' ? 'trial' : 'paid' };
  return NO_ENTITLEMENT;
}
