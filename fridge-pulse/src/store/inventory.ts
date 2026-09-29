import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { addDays, todayISO } from '../lib/dates';
import type { ItemStatus, PantryItem } from '../lib/types';

/** How long used/wasted items stay around for the "rescued" stats. */
const HISTORY_DAYS = 90;

interface InventoryState {
  items: PantryItem[];
  addItems: (items: PantryItem[]) => void;
  updateItem: (id: string, patch: Partial<Omit<PantryItem, 'id'>>) => void;
  resolveItem: (id: string, status: Exclude<ItemStatus, 'active'>) => void;
  reactivateItem: (id: string) => void;
  removeItem: (id: string) => void;
  clear: () => void;
}

function pruned(items: PantryItem[]): PantryItem[] {
  const cutoff = addDays(todayISO(), -HISTORY_DAYS);
  return items.filter((i) => i.status === 'active' || !i.resolvedOn || i.resolvedOn >= cutoff);
}

export const useInventory = create<InventoryState>()(
  persist(
    (set) => ({
      items: [],
      addItems: (added) => set((s) => ({ items: pruned([...added, ...s.items]) })),
      updateItem: (id, patch) =>
        set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),
      resolveItem: (id, status) =>
        set((s) => ({
          items: pruned(s.items.map((i) => (i.id === id ? { ...i, status, resolvedOn: todayISO() } : i))),
        })),
      reactivateItem: (id) =>
        set((s) => ({
          items: s.items.map((i) => {
            if (i.id !== id) return i;
            const { resolvedOn: _drop, ...rest } = i;
            return { ...rest, status: 'active' as const };
          }),
        })),
      removeItem: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      clear: () => set({ items: [] }),
    }),
    { name: 'fp.inventory.v1', version: 1, storage: createJSONStorage(() => AsyncStorage) },
  ),
);
