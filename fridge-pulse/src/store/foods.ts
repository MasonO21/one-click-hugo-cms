import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { learnedKey, setLearnedFoods } from '../lib/shelfLife';
import type { LearnedFood } from '../lib/types';
import { persistStorage } from './storage';

/** Plenty for a household; the oldest entries give way beyond this. */
export const MAX_LEARNED_FOODS = 300;

interface FoodsState {
  foods: LearnedFood[];
  /** Adds a confirmed food, replacing an earlier entry with the same name. Returns what was stored. */
  add: (food: LearnedFood) => LearnedFood;
  remove: (id: string) => void;
  clear: () => void;
}

/**
 * The person's own food database: items the app did not know, looked up online and confirmed from
 * a picture. Kept on this device only. Shelf-life estimates, suggestions and later scans use it.
 */
export const useFoods = create<FoodsState>()(
  persist(
    (set, get) => ({
      foods: [],
      add: (food) => {
        const key = learnedKey(food.name);
        const earlier = get().foods.find((f) => learnedKey(f.name) === key);
        // Keep aliases learned before, so older names still match.
        const merged: LearnedFood = earlier ? { ...food, id: earlier.id, aliases: [...new Set([...earlier.aliases, ...food.aliases])] } : food;
        set((s) => ({ foods: [merged, ...s.foods.filter((f) => f.id !== merged.id)].slice(0, MAX_LEARNED_FOODS) }));
        return merged;
      },
      remove: (id) => set((s) => ({ foods: s.foods.filter((f) => f.id !== id) })),
      clear: () => set({ foods: [] }),
    }),
    { name: 'fp.foods.v1', version: 1, storage: persistStorage() },
  ),
);

// Keep the shelf-life registry in step with the database (on load and on every change).
// Oldest first, so the newest entry wins a shared alias.
const sync = (foods: LearnedFood[]) => setLearnedFoods([...foods].reverse());
sync(useFoods.getState().foods);
useFoods.subscribe((s, prev) => {
  if (s.foods !== prev.foods) sync(s.foods);
});

/** The picture of a taught food with this name, if it has one. */
export function usePictureFor(name: string): string | null {
  return useFoods((s) => {
    const key = learnedKey(name);
    const food = s.foods.find((f) => learnedKey(f.name) === key || f.aliases.some((a) => learnedKey(a) === key));
    return food?.imageUrl ?? null;
  });
}
