import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistStorage } from './storage';
import { NO_PROFILE, type Profile } from '../lib/goals';
import type { Diet } from '../lib/types';

/** Dark is the brand's neon look; light and "match the phone" are there for those who prefer them. */
export type Appearance = 'dark' | 'light' | 'system';

interface SettingsState {
  onboarded: boolean;
  diet: Diet;
  servings: number;
  remindersEnabled: boolean;
  /** Local hour (0-23) for the daily expiry digest. */
  reminderHour: number;
  /** Whether we have already shown our own notification pre-prompt. */
  askedForReminders: boolean;
  /** Agreement to send photos and ingredient lists to the AI service. Off until the person agrees. */
  aiConsent: boolean;
  /** ISO timestamp of when consent was given, for our own records. */
  aiConsentAt: string | null;
  appearance: Appearance;
  /** Body details for protein and calorie targets. Kept on this device only. */
  profile: Profile;
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
  aiConsent: false,
  aiConsentAt: null as string | null,
  appearance: 'dark' as Appearance,
  profile: NO_PROFILE,
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      set: (patch) => set(patch),
      reset: () => set(DEFAULTS),
    }),
    { name: 'fp.settings.v1', version: 1, storage: persistStorage() },
  ),
);
