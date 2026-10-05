import { create } from 'zustand';
import { addDays, todayISO } from '../lib/dates';
import { normalizeName } from '../lib/expiry';
import type { DraftItem } from '../lib/scan';
import { estimateShelfLifeDays, guessCategory, usualPlace } from '../lib/shelfLife';
import type { Category, LearnedFood, StorageLocation } from '../lib/types';
import { useInventory } from './inventory';
import type { ShoppingItem } from './shopping';

/**
 * "scan": reviewing what a shelf photo found. "receipt": what a receipt listed, each item headed for its
 * own place. "barcode": scanned product barcodes, each headed for its own place too. "manual": typing
 * items in. "shopping": putting shopping away.
 */
export type DraftMode = 'scan' | 'receipt' | 'barcode' | 'manual' | 'shopping';

/** Lists where every item picks its own place, instead of the whole list sharing one. */
export const placesPerItem = (mode: DraftMode) => mode === 'receipt' || mode === 'barcode';

interface ScanDraftState {
  mode: DraftMode;
  location: StorageLocation;
  drafts: DraftItem[];
  notes: string | null;
  /** The scanned photos (base64 JPEG), kept in memory only, so unrecognised items can be looked up. */
  photos: string[];
  start: (location: StorageLocation, drafts: DraftItem[], notes: string | null, mode?: DraftMode, photos?: string[]) => void;
  /** Starts a list from ticked-off shopping, each item headed for where it usually lives. */
  startPutAway: (items: ShoppingItem[]) => void;
  update: (key: string, patch: Partial<DraftItem>) => void;
  remove: (key: string) => void;
  /** Adds a typed or suggested item at the top of the list. `keptIn` overrides the list's location. */
  addManual: (name: string, opts?: { category?: Category; keptIn?: StorageLocation }) => void;
  /** Turns a draft into the food the person confirmed from a lookup. */
  applyIdentified: (key: string, food: LearnedFood) => void;
  /** Moves the list to another location, re-estimating dates that were estimates. */
  setLocation: (location: StorageLocation) => void;
  /** Moves one item, re-estimating its date if it was an estimate. */
  moveDraft: (key: string, location: StorageLocation) => void;
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
  photos: [],
  start: (location, drafts, notes, mode = 'scan', photos = []) => set({ location, drafts, notes, mode, photos }),
  startPutAway: (items) =>
    set({
      mode: 'shopping',
      location: 'fridge',
      notes: null,
      photos: [],
      drafts: items.map((i, n) => draftFor(i.name, i.category, i.keptIn ?? usualPlace(i.name, i.category), `shop-${i.id}-${n}`, { shoppingId: i.id })),
    }),
  update: (key, patch) =>
    set((s) => ({
      drafts: s.drafts.map((d) => (d.key === key ? { ...d, ...patch, ...('selected' in patch ? { userSelected: true } : null) } : d)),
    })),
  remove: (key) => set((s) => ({ drafts: s.drafts.filter((d) => d.key !== key) })),
  applyIdentified: (key, food) =>
    set((s) => ({
      drafts: s.drafts.map((d) => {
        if (d.key !== key) return d;
        // A receipt's food goes where this food is kept; a photographed one is already somewhere.
        const location = placesPerItem(s.mode) ? food.keptIn : d.location;
        // A printed date or one the person set still wins; an estimate uses the food's own figure
        // (the registry already knows the food, see src/store/foods.ts).
        const expiresOn = d.expirySource === 'estimate' ? addDays(d.addedOn ?? todayISO(), estimateShelfLifeDays(food.name, food.category, location)) : d.expiresOn;
        const duplicate = tracked(food.name, location);
        return {
          ...d,
          name: food.name,
          category: food.category,
          location,
          expiresOn,
          confidence: 'high',
          identified: true,
          duplicate,
          selected: d.userSelected ? d.selected : s.mode === 'scan' ? !duplicate : d.selected,
        };
      }),
    })),
  addManual: (rawName, opts = {}) => {
    const trimmed = rawName.trim().replace(/\s+/g, ' ');
    if (!trimmed) return;
    const name = trimmed[0]!.toUpperCase() + trimmed.slice(1);
    const category = opts.category ?? guessCategory(name);
    // On a receipt every item has its own place, so a forgotten one goes where it usually lives.
    const location = opts.keptIn ?? (placesPerItem(get().mode) ? usualPlace(name, category) : get().location);
    const draft = draftFor(name, category, location, `manual-${Date.now()}-${get().drafts.length}`);
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
  moveDraft: (key, location) =>
    set((s) => ({
      drafts: s.drafts.map((d) => {
        if (d.key !== key || d.location === location) return d;
        return {
          ...d,
          location,
          expiresOn: d.expirySource === 'estimate' ? addDays(d.addedOn ?? todayISO(), estimateShelfLifeDays(d.name, d.category, location)) : d.expiresOn,
          duplicate: tracked(d.name, location),
        };
      }),
    })),
  clear: () => set({ drafts: [], notes: null, photos: [] }),
}));
