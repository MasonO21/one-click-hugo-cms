import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { todayISO } from '../lib/dates';
import { normalizeName } from '../lib/expiry';
import type { Category, StorageLocation } from '../lib/types';
import { nextStamp, pruneTombstones, type Tombstones } from '../lib/householdSync';
import { persistStorage } from './storage';

export interface ShoppingItem {
  id: string;
  name: string;
  category: Category;
  /** Where it belongs regardless of the usual place (ice cream: freezer). */
  keptIn?: StorageLocation;
  checked: boolean;
  addedOn: string;
  /** Who added it, in a shared household. */
  addedBy?: string;
  /** Last change (ms), for merging a shared household's list. */
  updatedAt?: number;
}

interface ShoppingState {
  items: ShoppingItem[];
  /** Ids removed on this phone, and when: passed on to a shared household. */
  deleted: Tombstones;
  /** Replaces the list with a merged copy from the household. */
  applyRemote: (items: ShoppingItem[], deleted: Tombstones) => void;
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

let author: string | null = null;
/** The name new entries are added under while the phone shares a household. */
export function setShoppingAuthor(name: string | null): void {
  author = name;
}

const touch = (i: ShoppingItem): ShoppingItem => ({ ...i, updatedAt: nextStamp(i.updatedAt) });
const gone = (items: ShoppingItem[], deleted: Tombstones, ids: string[]): Tombstones => {
  const out = pruneTombstones(deleted);
  for (const id of ids) out[id] = nextStamp(items.find((i) => i.id === id)?.updatedAt);
  return out;
};

export const useShopping = create<ShoppingState>()(
  persist(
    (set, get) => ({
      items: [],
      deleted: {},
      applyRemote: (items, deleted) => set({ items, deleted }),
      add: ({ name, category, keptIn }) => {
        const clean = name.trim().replace(/\s+/g, ' ');
        if (!clean) return false;
        const key = normalizeName(clean);
        const existing = get().items.find((i) => normalizeName(i.name) === key);
        if (existing) {
          if (!existing.checked) return false;
          set((s) => ({ items: s.items.map((i) => (i.id === existing.id ? touch({ ...i, checked: false }) : i)) }));
          return true;
        }
        const item: ShoppingItem = {
          id: newId(),
          name: clean[0]!.toUpperCase() + clean.slice(1),
          category,
          ...(keptIn ? { keptIn } : {}),
          checked: false,
          addedOn: todayISO(),
          ...(author ? { addedBy: author } : {}),
          updatedAt: Date.now(),
        };
        set((s) => ({ items: [item, ...s.items] }));
        return true;
      },
      toggle: (id) => set((s) => ({ items: s.items.map((i) => (i.id === id ? touch({ ...i, checked: !i.checked }) : i)) })),
      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id), deleted: gone(s.items, s.deleted, [id]) })),
      removeMany: (ids) => set((s) => ({ items: s.items.filter((i) => !ids.includes(i.id)), deleted: gone(s.items, s.deleted, ids) })),
      clearChecked: () => set((s) => ({ items: s.items.filter((i) => !i.checked), deleted: gone(s.items, s.deleted, s.items.filter((i) => i.checked).map((i) => i.id)) })),
      clear: () => set({ items: [], deleted: {} }),
    }),
    { name: 'fp.shopping.v1', version: 1, storage: persistStorage() },
  ),
);
