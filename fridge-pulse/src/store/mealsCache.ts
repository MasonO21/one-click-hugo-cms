import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Meal } from '../lib/types';

interface MealsCacheState {
  /** `suggestionKey` the cached meals were generated for. */
  key: string | null;
  meals: Meal[];
  setResult: (key: string, meals: Meal[]) => void;
  clear: () => void;
}

export const useMealsCache = create<MealsCacheState>()(
  persist(
    (set) => ({
      key: null,
      meals: [],
      setResult: (key, meals) => set({ key, meals }),
      clear: () => set({ key: null, meals: [] }),
    }),
    { name: 'fp.meals.v1', version: 1, storage: createJSONStorage(() => AsyncStorage) },
  ),
);
