import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Diet } from '../lib/types';

interface SettingsState {
  onboarded: boolean;
  diet: Diet;
  servings: number;
  remindersEnabled: boolean;
  /** Local hour (0-23) for the daily expiry digest. */
  reminderHour: number;
  /** Whether we have already shown our own notification pre-prompt. */
  askedForReminders: boolean;
  set: (patch: Partial<Omit<SettingsState, 'set' | 'reset'>>) => void;
  reset: () => void;
}

const DEFAULTS = {
  onboarded: false,
  diet: 'none' as Diet,
  servings: 2,
  remindersEnabled: true,
  reminderHour: 9,
  askedForReminders: false,
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      set: (patch) => set(patch),
      reset: () => set(DEFAULTS),
    }),
    { name: 'fp.settings.v1', version: 1, storage: createJSONStorage(() => AsyncStorage) },
  ),
);
