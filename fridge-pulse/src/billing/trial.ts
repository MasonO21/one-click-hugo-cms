import { addDays, daysBetween, toISODate } from '../lib/dates';

export const TRIAL_DAYS = 14;
export const PRICE_PER_MONTH = '$9.99';
/** RevenueCat entitlement identifier that unlocks the app. */
export const ENTITLEMENT_ID = 'pro';

export type AccessStatus = 'none' | 'trial' | 'active' | 'expired';

export interface Entitlement {
  status: AccessStatus;
  /** Calendar date (YYYY-MM-DD) the trial ends / the paid period renews or ends. */
  endsOn: string | null;
  /** Whole days left in the current trial / period, when known. */
  daysRemaining: number | null;
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
}

export function computeLocalEntitlement(state: LocalBillingState, now: Date = new Date()): Entitlement {
  const today = toISODate(now);

  if (state.paidThrough && state.paidThrough >= today) {
    return { status: 'active', endsOn: state.paidThrough, daysRemaining: daysBetween(today, state.paidThrough) };
  }
  if (state.trialStartedOn) {
    const trialEnd = addDays(state.trialStartedOn, TRIAL_DAYS);
    if (trialEnd > today) {
      return { status: 'trial', endsOn: trialEnd, daysRemaining: daysBetween(today, trialEnd) };
    }
    return { status: 'expired', endsOn: trialEnd, daysRemaining: 0 };
  }
  if (state.paidThrough) {
    return { status: 'expired', endsOn: state.paidThrough, daysRemaining: 0 };
  }
  return NO_ENTITLEMENT;
}
