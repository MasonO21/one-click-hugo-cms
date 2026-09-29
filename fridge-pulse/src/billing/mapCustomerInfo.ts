import { daysBetween, toISODate, todayISO } from '../lib/dates';
import { ENTITLEMENT_ID, NO_ENTITLEMENT, type Entitlement } from './trial';

/** The slice of RevenueCat's CustomerInfo we read, so mapping can be tested without the SDK. */
export interface EntitlementLike {
  periodType: string;
  expirationDate: string | null;
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
    };
  }
  const past = info.entitlements.all[ENTITLEMENT_ID];
  if (past) return { status: 'expired', endsOn: endDate(past), daysRemaining: 0 };
  return NO_ENTITLEMENT;
}
