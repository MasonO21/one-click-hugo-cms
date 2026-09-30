import { create } from 'zustand';
import { addDays, todayISO } from '../lib/dates';
import { normalizeName } from '../lib/expiry';
import type { DraftItem } from '../lib/scan';
import { estimateShelfLifeDays, guessCategory, usualPlace } from '../lib/shelfLife';
import type { Category, StorageLocation } from '../lib/types';
import { useInventory } from './inventory';
import type { ShoppingItem } from './shopping';

/** "scan": reviewing what a photo found. "manual": typing items in. "shopping": putting shopping away. */
export type DraftMode = 'scan' | 'manual' | 'shopping';

interface ScanDraftState {
  mode: DraftMode;
  location: StorageLocation;
  drafts: DraftItem[];
  notes: string | null;
  start: (location: StorageLocation, drafts: DraftItem[], notes: string | null, mode?: DraftMode) => void;
  /** Starts a list from ticked-off shopping, each item headed for where it usually lives. */
  startPutAway: (items: ShoppingItem[]) => void;
  update: (key: string, patch: Partial<DraftItem>) => void;
  remove: (key: string) => void;
  /** Adds a typed or suggested item at the top of the list. `keptIn` overrides the list's location. */
  addManual: (name: string, opts?: { category?: Category; keptIn?: StorageLocation }) => void;
  /** Moves the list to another location, re-estimating dates that were estimates. */
  setLocation: (location: StorageLocation) => void;
  clear: () => void;
}

function tracked(name: string, location: StorageLocation): boolean {
  const key = normalizeName(name);
  return useInventory.getState().items.some((i) => i.status === 'active' && i.location === location && normalizeName(i.name) === key);
}

function draftFor(name: string, category: Category, location: StorageLocation, key: string, extra: Partial<DraftItem> = {}): DraftItem {
  return {
    key,
    name,
    category,
    quantity: '1',
    location,
    expiresOn: addDays(todayISO(), estimateShelfLifeDays(name, category, location)),
    expirySource: 'estimate',
    confidence: 'high',
    // Picked on purpose, so it stays selected; the "Already tracked" tag still points out a repeat.
    selected: true,
    duplicate: tracked(name, location),
    ...extra,
  };
}

/** In-memory hand-off between the scan / shopping screens and the review screen. */
export const useScanDraft = create<ScanDraftState>((set, get) => ({
  mode: 'scan',
  location: 'fridge',
  drafts: [],
  notes: null,
  start: (location, drafts, notes, mode = 'scan') => set({ location, drafts, notes, mode }),
  startPutAway: (items) =>
    set({
      mode: 'shopping',
      location: 'fridge',
      notes: null,
      drafts: items.map((i, n) => draftFor(i.name, i.category, i.keptIn ?? usualPlace(i.name, i.category), `shop-${i.id}-${n}`, { shoppingId: i.id })),
    }),
  update: (key, patch) =>
    set((s) => ({
      drafts: s.drafts.map((d) => (d.key === key ? { ...d, ...patch, ...('selected' in patch ? { userSelected: true } : null) } : d)),
    })),
  remove: (key) => set((s) => ({ drafts: s.drafts.filter((d) => d.key !== key) })),
  addManual: (rawName, opts = {}) => {
    const trimmed = rawName.trim().replace(/\s+/g, ' ');
    if (!trimmed) return;
    const name = trimmed[0]!.toUpperCase() + trimmed.slice(1);
    const location = opts.keptIn ?? get().location;
    const draft = draftFor(name, opts.category ?? guessCategory(name), location, `manual-${Date.now()}-${get().drafts.length}`);
    set((s) => ({ drafts: [draft, ...s.drafts] }));
  },
  setLocation: (location) => {
    const { location: previous, drafts, mode } = get();
    const today = todayISO();
    set({
      location,
      drafts: drafts.map((d) => {
        // Items deliberately kept elsewhere (ice cream in the freezer) stay where they are.
        if (d.location !== previous) return d;
        const duplicate = tracked(d.name, location);
        return {
          ...d,
          location,
          expiresOn: d.expirySource === 'estimate' ? addDays(today, estimateShelfLifeDays(d.name, d.category, location)) : d.expiresOn,
          duplicate,
          // A scanned repeat starts unticked; a moved list re-decides, unless the person chose.
          selected: d.userSelected || mode !== 'scan' ? d.selected : !duplicate,
        };
      }),
    });
  },
  clear: () => set({ drafts: [], notes: null }),
}));
