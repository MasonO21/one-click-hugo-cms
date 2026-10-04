import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createProvider } from '../health/provider';
import type { DayActivity, HealthProvider, NutritionSample } from '../health/types';
import { lastDays } from '../lib/foodLog';
import { persistStorage } from './storage';

let provider: HealthProvider | null = null;
/** The phone's health store: Apple Health, Health Connect, or sample data in the preview. */
export function getHealth(): HealthProvider {
  provider ??= createProvider();
  return provider;
}
/** Tests swap in their own. */
export function setHealthForTesting(p: HealthProvider | null): void {
  provider = p;
}

interface HealthState {
  /** The person connected the app to their health store. */
  connected: boolean;
  /** Save logged food to the health store too. */
  writeFood: boolean;
  /** The last seven days, oldest first; not persisted, read fresh each launch. */
  days: DayActivity[];
  refreshing: boolean;
  error: string | null;
  connect: () => Promise<boolean>;
  disconnect: () => void;
  refresh: () => Promise<void>;
  setWriteFood: (on: boolean) => void;
  /** Saves a logged food, when connected and allowed; returns ids for removing it. */
  saveFood: (sample: NutritionSample) => Promise<string[]>;
  removeFood: (ids: string[]) => Promise<void>;
}

export const useHealth = create<HealthState>()(
  persist(
    (set, get) => ({
      connected: false,
      writeFood: true,
      days: [],
      refreshing: false,
      error: null,
      connect: async () => {
        const health = getHealth();
        if (!(await health.isAvailable())) {
          set({ error: `${health.name} is not available on this phone.` });
          return false;
        }
        const ok = await health.requestAccess();
        set({ connected: ok, error: ok ? null : `${health.name} access was not given. You can allow it in ${health.name}'s settings.` });
        if (ok) await get().refresh();
        return ok;
      },
      disconnect: () => set({ connected: false, days: [], error: null }),
      refresh: async () => {
        if (!get().connected || get().refreshing) return;
        set({ refreshing: true });
        try {
          const days = await getHealth().readDays(lastDays(7));
          set({ days, error: null });
        } catch {
          set({ error: 'Could not read your activity. Try again later.' });
        } finally {
          set({ refreshing: false });
        }
      },
      setWriteFood: (on) => set({ writeFood: on }),
      saveFood: async (sample) => {
        const { connected, writeFood } = get();
        if (!connected || !writeFood) return [];
        try {
          return await getHealth().writeNutrition(sample);
        } catch {
          return [];
        }
      },
      removeFood: async (ids) => {
        if (ids.length === 0) return;
        await getHealth().deleteNutrition(ids).catch(() => {});
      },
    }),
    {
      name: 'fp.health.v1',
      version: 1,
      storage: persistStorage(),
      partialize: (s) => ({ connected: s.connected, writeFood: s.writeFood }),
    },
  ),
);

/** Today's activity, or null before anything was read. */
export const todayActivity = (days: DayActivity[], today: string) => days.find((d) => d.day === today) ?? null;
