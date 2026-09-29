import { addDays, todayISO } from '../lib/dates';
import { newId } from '../lib/scan';
import { safeStorage } from '../store/storage';
import type { BillingProvider } from './types';
import { computeLocalEntitlement, PRICE_PER_MONTH, type LocalBillingState } from './trial';

const KEY = 'fp.local-billing.v1';
const EMPTY: LocalBillingState & { userId: string | null } = { trialStartedOn: null, paidThrough: null, userId: null };

/**
 * Stand-in for the app stores, used in development, Expo Go and demo builds.
 * State lives on the device, so it is trivially bypassable. It must never ship
 * in a production build (see `pickProvider`).
 */
export function createLocalProvider(): BillingProvider {
  const listeners = new Set<(e: ReturnType<typeof computeLocalEntitlement>) => void>();

  async function load() {
    try {
      const raw = await safeStorage.getItem(KEY);
      return raw ? { ...EMPTY, ...JSON.parse(raw) } : { ...EMPTY };
    } catch {
      return { ...EMPTY };
    }
  }
  async function save(state: typeof EMPTY) {
    try {
      await safeStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // Storage failures degrade to a non-persistent trial in demo mode only.
    }
    const e = computeLocalEntitlement(state);
    listeners.forEach((l) => l(e));
    return e;
  }

  return {
    kind: 'local',
    async init() {},
    async getEntitlement() {
      return computeLocalEntitlement(await load());
    },
    async getOffer() {
      return { priceString: PRICE_PER_MONTH };
    },
    async purchase() {
      const state = await load();
      const today = todayISO();
      const next = state.trialStartedOn
        ? { ...state, paidThrough: addDays(today, 30) }
        : { ...state, trialStartedOn: today };
      return { ok: true, entitlement: await save(next) };
    },
    async restore() {
      return computeLocalEntitlement(await load());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async getUserId() {
      const state = await load();
      if (state.userId) return state.userId;
      const userId = `local-${newId()}`;
      await save({ ...state, userId });
      return userId;
    },
    async simulateTrialDaysLeft(daysLeft) {
      const state = await load();
      await save({ ...state, paidThrough: null, trialStartedOn: addDays(todayISO(), daysLeft - 14) });
    },
  };
}
