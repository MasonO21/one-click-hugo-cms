import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistStorage } from './storage';
import { addDays, todayISO } from '../lib/dates';
import { isRescue, NO_LIFETIME, type Lifetime } from '../lib/impact';
import { nextStamp, pruneTombstones, type Tombstones } from '../lib/householdSync';
import type { ItemStatus, PantryItem } from '../lib/types';

/** How long used/wasted items stay around for the "rescued" stats and the weekly chart. */
const HISTORY_DAYS = 90;

interface InventoryState {
  items: PantryItem[];
  lifetime: Lifetime;
  /** Ids removed on this phone, and when: passed on to a shared household. */
  deleted: Tombstones;
  /** Replaces the items with a merged copy from the household. */
  applyRemote: (items: PantryItem[], deleted: Tombstones) => void;
  addItems: (items: PantryItem[]) => void;
  updateItem: (id: string, patch: Partial<Omit<PantryItem, 'id'>>) => void;
  /** Marks an active item used or thrown out. Returns false when it was not active (already done, or gone). */
  resolveItem: (id: string, status: Exclude<ItemStatus, 'active'>) => boolean;
  reactivateItem: (id: string) => void;
  /**
   * Takes back a resolve: the items still in the state it left them go back to active, and the date
   * of the last waste returns to what it was before (`lastWastedOn`), when nothing was thrown out since.
   */
  undoResolve: (ids: string[], status: Exclude<ItemStatus, 'active'>, lastWastedOn: string | null | undefined) => void;
  removeItem: (id: string) => void;
  clear: () => void;
}

let author: string | null = null;
/** The name new items are added under while the phone shares a household. */
export function setItemAuthor(name: string | null): void {
  author = name;
}

/** Marks an item changed now, so a shared household takes this version. */
const touch = (i: PantryItem): PantryItem => ({ ...i, updatedAt: nextStamp(i.updatedAt) });

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
    (set, get) => ({
      items: [],
      lifetime: NO_LIFETIME,
      deleted: {},
      applyRemote: (items, deleted) => set({ items: pruned(items), deleted }),
      addItems: (added) =>
        set((s) => ({
          items: pruned([...added.map((i) => touch(author && !i.addedBy ? { ...i, addedBy: author } : i)), ...s.items]),
          lifetime: s.lifetime.startedOn || added.length === 0 ? s.lifetime : { ...s.lifetime, startedOn: todayISO() },
        })),
      updateItem: (id, patch) => set((s) => ({ items: s.items.map((i) => (i.id === id ? touch({ ...i, ...patch }) : i)) })),
      resolveItem: (id, status) => {
        const item = get().items.find((i) => i.id === id);
        // Resolving twice (a double tap) must not count twice.
        if (!item || item.status !== 'active') return false;
        set((s) => {
          const today = todayISO();
          const done: PantryItem = touch({ ...item, status, resolvedOn: today });
          const lifetime = count(s.lifetime, done, 1);
          return {
            items: pruned(s.items.map((i) => (i.id === id ? done : i))),
            lifetime: status === 'wasted' ? { ...lifetime, lastWastedOn: today } : lifetime,
          };
        });
        return true;
      },
      undoResolve: (ids, status, lastWastedOn) =>
        set((s) => {
          let lifetime = s.lifetime;
          const items = s.items.map((i) => {
            // Changed again since (a housemate, say): their version stands.
            if (!ids.includes(i.id) || i.status !== status) return i;
            lifetime = count(lifetime, i, -1);
            const { resolvedOn: _drop, ...rest } = i;
            return touch({ ...rest, status: 'active' as const });
          });
          if (status === 'wasted' && lastWastedOn !== undefined) lifetime = { ...lifetime, lastWastedOn };
          return { items, lifetime };
        }),
      reactivateItem: (id) =>
        set((s) => {
          const item = s.items.find((i) => i.id === id);
          if (!item || item.status === 'active') return {};
          const { resolvedOn: _drop, ...rest } = item;
          const items = s.items.map((i) => (i.id === id ? touch({ ...rest, status: 'active' as const }) : i));
          const lifetime = count(s.lifetime, item, -1);
          return { items, lifetime: item.status === 'wasted' ? { ...lifetime, lastWastedOn: lastWasted(items) } : lifetime };
        }),
      removeItem: (id) =>
        set((s) => {
          const deleted = pruneTombstones(s.deleted);
          deleted[id] = nextStamp(s.items.find((i) => i.id === id)?.updatedAt);
          return { items: s.items.filter((i) => i.id !== id), deleted };
        }),
      clear: () => set({ items: [], lifetime: NO_LIFETIME, deleted: {} }),
    }),
    {
      name: 'fp.inventory.v1',
      version: 2,
      storage: persistStorage(),
      // Version 1 had no running totals: rebuild them from the history that is still kept.
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as { items?: PantryItem[]; lifetime?: Lifetime };
        // Anything that is not an item (damaged storage) is dropped rather than stopping the app loading.
        const items = Array.isArray(state.items) ? state.items.filter((i): i is PantryItem => !!i && typeof i === 'object' && typeof i.id === 'string') : [];
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
