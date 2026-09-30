import { create } from 'zustand';
import { addDays, todayISO } from '../lib/dates';
import { normalizeName } from '../lib/expiry';
import type { DraftItem } from '../lib/scan';
import { estimateShelfLifeDays, guessCategory } from '../lib/shelfLife';
import type { Category, StorageLocation } from '../lib/types';
import { useInventory } from './inventory';

/** "scan": reviewing what a photo found. "manual": typing items in by hand. */
export type DraftMode = 'scan' | 'manual';

interface ScanDraftState {
  mode: DraftMode;
  location: StorageLocation;
  drafts: DraftItem[];
  notes: string | null;
  start: (location: StorageLocation, drafts: DraftItem[], notes: string | null, mode?: DraftMode) => void;
  update: (key: string, patch: Partial<DraftItem>) => void;
  remove: (key: string) => void;
  /** Adds a typed or suggested item at the top of the list. `keptIn` overrides the list's location. */
  addManual: (name: string, opts?: { category?: Category; keptIn?: StorageLocation }) => void;
  /** Moves the list to another location, re-estimating dates that were estimates. */
  setLocation: (location: StorageLocation) => void;
  clear: () => void;
}

/** In-memory hand-off between the scan screen and the review screen. */
export const useScanDraft = create<ScanDraftState>((set, get) => ({
  mode: 'scan',
  location: 'fridge',
  drafts: [],
  notes: null,
  start: (location, drafts, notes, mode = 'scan') => set({ location, drafts, notes, mode }),
  update: (key, patch) => set((s) => ({ drafts: s.drafts.map((d) => (d.key === key ? { ...d, ...patch } : d)) })),
  remove: (key) => set((s) => ({ drafts: s.drafts.filter((d) => d.key !== key) })),
  addManual: (rawName, opts = {}) => {
    const trimmed = rawName.trim().replace(/\s+/g, ' ');
    if (!trimmed) return;
    const name = trimmed[0].toUpperCase() + trimmed.slice(1);
    const location = opts.keptIn ?? get().location;
    const category = opts.category ?? guessCategory(name);
    const days = estimateShelfLifeDays(name, category, location);
    const tracked = useInventory
      .getState()
      .items.some((i) => i.status === 'active' && i.location === location && normalizeName(i.name) === normalizeName(name));
    const draft: DraftItem = {
      key: `manual-${Date.now()}-${get().drafts.length}`,
      name,
      category,
      quantity: '1',
      location,
      expiresOn: addDays(todayISO(), days),
      expirySource: 'estimate',
      confidence: 'high',
      // Picked on purpose, so it stays selected; the "Already tracked" tag still points out a repeat.
      selected: true,
      duplicate: tracked,
    };
    set((s) => ({ drafts: [draft, ...s.drafts] }));
  },
  setLocation: (location) => {
    const { location: previous, drafts } = get();
    const today = todayISO();
    set({
      location,
      // Items deliberately kept elsewhere (ice cream in the freezer) stay where they are.
      drafts: drafts.map((d) =>
        d.location !== previous
          ? d
          : {
              ...d,
              location,
              expiresOn: d.expirySource === 'estimate' ? addDays(today, estimateShelfLifeDays(d.name, d.category, location)) : d.expiresOn,
            },
      ),
    });
  },
  clear: () => set({ drafts: [], notes: null }),
}));
