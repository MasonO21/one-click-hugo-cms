import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { todayISO } from '../lib/dates';
import { normalizeName } from '../lib/expiry';
import type { Category, StorageLocation } from '../lib/types';
import { persistStorage } from './storage';

export interface ShoppingItem {
  id: string;
  name: string;
  category: Category;
  /** Where it belongs regardless of the usual place (ice cream: freezer). */
  keptIn?: StorageLocation;
  checked: boolean;
  addedOn: string;
}

interface ShoppingState {
  items: ShoppingItem[];
  /** Adds a food; false when it is already on the list (a ticked-off one is un-ticked instead). */
  add: (food: { name: string; category: Category; keptIn?: StorageLocation }) => boolean;
  toggle: (id: string) => void;
  remove: (id: string) => void;
  removeMany: (ids: string[]) => void;
  clearChecked: () => void;
  clear: () => void;
}

let seq = 0;
const newId = () => `s-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export const useShopping = create<ShoppingState>()(
  persist(
    (set, get) => ({
      items: [],
      add: ({ name, category, keptIn }) => {
        const clean = name.trim().replace(/\s+/g, ' ');
        if (!clean) return false;
        const key = normalizeName(clean);
        const existing = get().items.find((i) => normalizeName(i.name) === key);
        if (existing) {
          if (!existing.checked) return false;
          set((s) => ({ items: s.items.map((i) => (i.id === existing.id ? { ...i, checked: false } : i)) }));
          return true;
        }
        const item: ShoppingItem = {
          id: newId(),
          name: clean[0]!.toUpperCase() + clean.slice(1),
          category,
          ...(keptIn ? { keptIn } : {}),
          checked: false,
          addedOn: todayISO(),
        };
        set((s) => ({ items: [item, ...s.items] }));
        return true;
      },
      toggle: (id) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)) })),
      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      removeMany: (ids) => set((s) => ({ items: s.items.filter((i) => !ids.includes(i.id)) })),
      clearChecked: () => set((s) => ({ items: s.items.filter((i) => !i.checked) })),
      clear: () => set({ items: [] }),
    }),
    { name: 'fp.shopping.v1', version: 1, storage: persistStorage() },
  ),
);
