import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistStorage } from './storage';
import { addDays, todayISO } from '../lib/dates';
import { isRescue, NO_LIFETIME, type Lifetime } from '../lib/impact';
import type { ItemStatus, PantryItem } from '../lib/types';

/** How long used/wasted items stay around for the "rescued" stats and the weekly chart. */
const HISTORY_DAYS = 90;

interface InventoryState {
  items: PantryItem[];
  lifetime: Lifetime;
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

function count(l: Lifetime, item: PantryItem, sign: 1 | -1): Lifetime {
  return {
    ...l,
    used: Math.max(0, l.used + (item.status === 'used' ? sign : 0)),
    wasted: Math.max(0, l.wasted + (item.status === 'wasted' ? sign : 0)),
    rescued: Math.max(0, l.rescued + (isRescue(item) ? sign : 0)),
  };
}

function lastWasted(items: PantryItem[]): string | null {
  return items.reduce<string | null>((latest, i) => (i.status === 'wasted' && i.resolvedOn && (!latest || i.resolvedOn > latest) ? i.resolvedOn : latest), null);
}

export const useInventory = create<InventoryState>()(
  persist(
    (set) => ({
      items: [],
      lifetime: NO_LIFETIME,
      addItems: (added) =>
        set((s) => ({
          items: pruned([...added, ...s.items]),
          lifetime: s.lifetime.startedOn || added.length === 0 ? s.lifetime : { ...s.lifetime, startedOn: todayISO() },
        })),
      updateItem: (id, patch) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),
      resolveItem: (id, status) =>
        set((s) => {
          const item = s.items.find((i) => i.id === id);
          // Resolving twice (a double tap) must not count twice.
          if (!item || item.status !== 'active') return {};
          const today = todayISO();
          const done: PantryItem = { ...item, status, resolvedOn: today };
          const lifetime = count(s.lifetime, done, 1);
          return {
            items: pruned(s.items.map((i) => (i.id === id ? done : i))),
            lifetime: status === 'wasted' ? { ...lifetime, lastWastedOn: today } : lifetime,
          };
        }),
      reactivateItem: (id) =>
        set((s) => {
          const item = s.items.find((i) => i.id === id);
          if (!item || item.status === 'active') return {};
          const { resolvedOn: _drop, ...rest } = item;
          const items = s.items.map((i) => (i.id === id ? { ...rest, status: 'active' as const } : i));
          const lifetime = count(s.lifetime, item, -1);
          return { items, lifetime: item.status === 'wasted' ? { ...lifetime, lastWastedOn: lastWasted(items) } : lifetime };
        }),
      removeItem: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      clear: () => set({ items: [], lifetime: NO_LIFETIME }),
    }),
    {
      name: 'fp.inventory.v1',
      version: 2,
      storage: persistStorage(),
      // Version 1 had no running totals: rebuild them from the history that is still kept.
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as { items?: PantryItem[]; lifetime?: Lifetime };
        const items = Array.isArray(state.items) ? state.items : [];
        if (version < 2) {
          let lifetime = { ...NO_LIFETIME };
          for (const i of items) if (i.status !== 'active') lifetime = count(lifetime, i, 1);
          const firstAdded = items.reduce<string | null>((min, i) => (!min || i.addedOn < min ? i.addedOn : min), null);
          lifetime = { ...lifetime, startedOn: firstAdded, lastWastedOn: lastWasted(items) };
          return { items, lifetime } as unknown as InventoryState;
        }
        return state as unknown as InventoryState;
      },
    },
  ),
);
