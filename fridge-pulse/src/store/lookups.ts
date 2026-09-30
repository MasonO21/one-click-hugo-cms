import { create } from 'zustand';
import { friendlyError, identifyFood } from '../lib/api';
import { todayISO } from '../lib/dates';
import { learnedFromCandidate } from '../lib/identify';
import { newId, type DraftItem } from '../lib/scan';
import type { FoodCandidate, LearnedFood } from '../lib/types';
import { getProvider, useBilling } from './billing';
import { useFoods } from './foods';
import { useScanDraft } from './scanDraft';

export type Lookup =
  | { status: 'searching' }
  | { status: 'found'; candidates: FoodCandidate[]; index: number }
  | { status: 'none' }
  | { status: 'error'; message: string }
  | { status: 'confirmed'; name: string };

interface LookupsState {
  /** Lookup state per draft key. */
  byKey: Record<string, Lookup>;
  /** Looks a draft up online, with the photo it was seen in when there is one. */
  start: (draft: Pick<DraftItem, 'key' | 'name' | 'category' | 'location' | 'clue'>, photo?: string) => void;
  /** "No": shows the next candidate, or ends with no match. */
  next: (key: string) => void;
  /** "Yes": saves the shown candidate to the food database and applies it to the draft. */
  confirm: (key: string) => LearnedFood | null;
  /** Stops and forgets one lookup (its draft was removed). */
  cancel: (key: string) => void;
  /** Stops everything (the review screen closed). */
  reset: () => void;
}

/** Lookups run a couple at a time; each one is a model call with web searches. */
const MAX_CONCURRENT = 2;

let generation = 0;
let running = 0;
const waiting: (() => void)[] = [];
const controllers = new Map<string, AbortController>();

function pump() {
  while (running < MAX_CONCURRENT && waiting.length > 0) waiting.shift()!();
}

export const useLookups = create<LookupsState>((set, get) => {
  const put = (key: string, lookup: Lookup | null) =>
    set((s) => {
      const byKey = { ...s.byKey };
      if (lookup) byKey[key] = lookup;
      else delete byKey[key];
      return { byKey };
    });

  return {
    byKey: {},

    start: (draft, photo) => {
      const current = get().byKey[draft.key];
      if (current && current.status !== 'error' && current.status !== 'none') return;
      const gen = generation;
      const controller = new AbortController();
      controllers.get(draft.key)?.abort();
      controllers.set(draft.key, controller);
      put(draft.key, { status: 'searching' });

      waiting.push(async () => {
        if (controller.signal.aborted || gen !== generation) return;
        running += 1;
        try {
          const userId = await getProvider().getUserId();
          const candidates = await identifyFood({
            userId,
            name: draft.name,
            category: draft.category,
            location: draft.location,
            clue: draft.clue,
            image: photo,
            signal: controller.signal,
          });
          if (controller.signal.aborted || gen !== generation) return;
          put(draft.key, candidates.length > 0 ? { status: 'found', candidates, index: 0 } : { status: 'none' });
        } catch (e) {
          if (controller.signal.aborted || gen !== generation) return;
          const { message, paywall } = friendlyError(e);
          put(draft.key, { status: 'error', message });
          if (paywall) void useBilling.getState().refresh();
        } finally {
          running -= 1;
          if (controllers.get(draft.key) === controller) controllers.delete(draft.key);
          pump();
        }
      });
      pump();
    },

    next: (key) => {
      const l = get().byKey[key];
      if (l?.status !== 'found') return;
      put(key, l.index + 1 < l.candidates.length ? { ...l, index: l.index + 1 } : { status: 'none' });
    },

    confirm: (key) => {
      const l = get().byKey[key];
      if (l?.status !== 'found') return null;
      const draft = useScanDraft.getState().drafts.find((d) => d.key === key);
      const candidate = l.candidates[l.index];
      if (!draft || !candidate) return null;
      const food = useFoods
        .getState()
        .add(learnedFromCandidate(candidate, { name: draft.name, confidence: draft.confidence, clue: draft.clue }, `f-${newId()}`, todayISO()));
      useScanDraft.getState().applyIdentified(key, food);
      put(key, { status: 'confirmed', name: food.name });
      return food;
    },

    cancel: (key) => {
      controllers.get(key)?.abort();
      controllers.delete(key);
      put(key, null);
    },

    reset: () => {
      generation += 1;
      controllers.forEach((c) => c.abort());
      controllers.clear();
      waiting.length = 0;
      set({ byKey: {} });
    },
  };
});
