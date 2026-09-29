import { create } from 'zustand';
import { addDays, todayISO } from '../lib/dates';
import type { DraftItem } from '../lib/scan';
import { estimateShelfLifeDays, guessCategory } from '../lib/shelfLife';
import type { StorageLocation } from '../lib/types';

interface ScanDraftState {
  location: StorageLocation;
  drafts: DraftItem[];
  notes: string | null;
  start: (location: StorageLocation, drafts: DraftItem[], notes: string | null) => void;
  update: (key: string, patch: Partial<DraftItem>) => void;
  remove: (key: string) => void;
  addManual: (name: string) => void;
  clear: () => void;
}

/** In-memory hand-off between the scan screen and the review screen. */
export const useScanDraft = create<ScanDraftState>((set, get) => ({
  location: 'fridge',
  drafts: [],
  notes: null,
  start: (location, drafts, notes) => set({ location, drafts, notes }),
  update: (key, patch) => set((s) => ({ drafts: s.drafts.map((d) => (d.key === key ? { ...d, ...patch } : d)) })),
  remove: (key) => set((s) => ({ drafts: s.drafts.filter((d) => d.key !== key) })),
  addManual: (rawName) => {
    const name = rawName.trim();
    if (!name) return;
    const { location } = get();
    const category = guessCategory(name);
    const days = estimateShelfLifeDays(name, category, location);
    const draft: DraftItem = {
      key: `manual-${Date.now()}-${get().drafts.length}`,
      name: name[0].toUpperCase() + name.slice(1),
      category,
      quantity: '1',
      location,
      expiresOn: addDays(todayISO(), days),
      expirySource: 'estimate',
      confidence: 'high',
      selected: true,
      duplicate: false,
    };
    set((s) => ({ drafts: [...s.drafts, draft] }));
  },
  clear: () => set({ drafts: [], notes: null }),
}));
