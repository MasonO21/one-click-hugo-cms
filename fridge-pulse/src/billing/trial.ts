import { addDays, daysBetween, toISODate } from '../lib/dates';

/**
 * The offer, defined once. It must match the store products: four auto-renewing subscriptions in
 * one subscription group, each with a 2-week (14-day) free-trial introductory offer. The household
 * plans also cover everyone in the payer's shared household (see server/src/household.ts).
 * `__tests__/pricing.test.ts` fails if any other price or trial length appears in the app.
 */
export const TRIAL_DAYS = 14;

export type PlanId = 'monthly' | 'annual' | 'household-monthly' | 'household-annual';
export type Period = 'month' | 'year';

export interface Plan {
  id: PlanId;
  /** Product id in App Store Connect and Google Play. */
  productId: string;
  /** Package identifier in RevenueCat's default offering. */
  packageId: string;
  /** US price, shown until the store's localised price arrives. */
  price: string;
  period: Period;
  /** Covers everyone in the payer's household. */
  household: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
  monthly: { id: 'monthly', productId: 'fridge_pulse_monthly', packageId: '$rc_monthly', price: '$9.99', period: 'month', household: false },
  annual: { id: 'annual', productId: 'fridge_pulse_annual', packageId: '$rc_annual', price: '$59.99', period: 'year', household: false },
  'household-monthly': { id: 'household-monthly', productId: 'fridge_pulse_household_monthly', packageId: 'household_monthly', price: '$14.99', period: 'month', household: true },
  'household-annual': { id: 'household-annual', productId: 'fridge_pulse_household_annual', packageId: 'household_annual', price: '$89.99', period: 'year', household: true },
};

/** Paywall order. Yearly is picked first: it is the better deal. */
export const PLAN_IDS: PlanId[] = ['annual', 'monthly', 'household-annual', 'household-monthly'];
export const DEFAULT_PLAN: PlanId = 'annual';
/** People a household plan covers (the household size limit on the server). */
export const HOUSEHOLD_MAX_PEOPLE = 8;
/** RevenueCat entitlement the household plans grant as well as `pro`. */
export const HOUSEHOLD_ENTITLEMENT_ID = 'household';

/** The plain monthly plan's price, for copy that names one price. */
export const PRICE_PER_MONTH = PLANS.monthly.price;

/** The plan with this audience and period. */
export function planFor(household: boolean, period: Period): Plan {
  return Object.values(PLANS).find((p) => p.household === household && p.period === period)!;
}

/** "Household, yearly". */
export function planName(plan: PlanId): string {
  const p = PLANS[plan];
  const period = p.period === 'year' ? 'yearly' : 'monthly';
  return p.household ? `Household, ${period}` : period === 'yearly' ? 'Yearly' : 'Monthly';
}

/** "$59.99/year". */
export const priceLabel = (price: string, period: Period) => `${price}/${period}`;

/** A store price string as a number ("$59.99" -> 59.99, "59,99 €" -> 59.99, "¥9,800" -> 9800), or null. */
export function priceAmount(price: string): number | null {
  const t = price.replace(/[^\d.,]/g, '');
  if (!/\d/.test(t)) return null;
  // A separator followed by one or two digits at the end is the decimal point; any others group thousands.
  const dec = /[.,](\d{1,2})$/.exec(t);
  const whole = (dec ? t.slice(0, dec.index) : t).replace(/[.,]/g, '');
  return Number(`${whole || '0'}.${dec ? dec[1] : '0'}`);
}

/** Whole percent saved by paying yearly instead of twelve months, from the shown prices. */
export function yearlySaving(monthly: string, yearly: string): number | null {
  const m = priceAmount(monthly);
  const y = priceAmount(yearly);
  if (!m || !y || y >= m * 12) return null;
  return Math.round((1 - y / (m * 12)) * 100);
}
/** Reads naturally in "Start {TRIAL_NAME} free trial" and "Your {TRIAL_NAME} free trial". */
export const TRIAL_NAME = '2-week';
/** Reads naturally in "Free for {TRIAL_SPAN}". */
export const TRIAL_SPAN = '2 weeks';
/** RevenueCat entitlement identifier that unlocks the app. */
export const ENTITLEMENT_ID = 'pro';

export type AccessStatus = 'none' | 'trial' | 'active' | 'expired';

export interface Entitlement {
  status: AccessStatus;
  /** Calendar date (YYYY-MM-DD) the trial ends / the paid period renews or ends. */
  endsOn: string | null;
  /** Whole days left in the current trial / period, when known. */
  daysRemaining: number | null;
  /** False once the person has cancelled: the trial or period runs out without a charge. */
  willRenew?: boolean;
  /** For an expired entitlement: whether it was a free trial or a paid subscription that ended. */
  lapsed?: 'trial' | 'paid';
  /** The plan, when the store says which one. */
  planId?: PlanId;
  /** A household plan: it also covers everyone in the person's shared household. */
  household?: boolean;
}

export const NO_ENTITLEMENT: Entitlement = { status: 'none', endsOn: null, daysRemaining: null };

export function isUnlocked(e: Entitlement): boolean {
  return e.status === 'trial' || e.status === 'active';
}

/** State for the local (non-store) billing used in demos and previews. */
export interface LocalBillingState {
  /** Local date the trial started, or null if it has not. */
  trialStartedOn: string | null;
  /** Local date a simulated paid period runs through, or null. */
  paidThrough: string | null;
  /** The plan picked, once one has been. */
  plan?: PlanId | null;
}

export function computeLocalEntitlement(state: LocalBillingState, now: Date = new Date()): Entitlement {
  const base = baseLocalEntitlement(state, now);
  if (!state.plan) return base;
  return { ...base, planId: state.plan, ...(isUnlocked(base) && PLANS[state.plan].household ? { household: true } : {}) };
}

function baseLocalEntitlement(state: LocalBillingState, now: Date): Entitlement {
  const today = toISODate(now);

  if (state.paidThrough && state.paidThrough >= today) {
    return { status: 'active', endsOn: state.paidThrough, daysRemaining: daysBetween(today, state.paidThrough) };
  }
  if (state.trialStartedOn) {
    const trialEnd = addDays(state.trialStartedOn, TRIAL_DAYS);
    if (trialEnd > today) {
      return { status: 'trial', endsOn: trialEnd, daysRemaining: daysBetween(today, trialEnd) };
    }
    return { status: 'expired', endsOn: trialEnd, daysRemaining: 0, lapsed: 'trial' };
  }
  if (state.paidThrough) {
    return { status: 'expired', endsOn: state.paidThrough, daysRemaining: 0, lapsed: 'paid' };
  }
  return NO_ENTITLEMENT;
}
