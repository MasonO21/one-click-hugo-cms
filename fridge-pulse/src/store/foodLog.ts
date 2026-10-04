import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { addDays, todayISO } from '../lib/dates';
import { clampServings, LOG_HISTORY_DAYS, type LogEntry, type NewEntry } from '../lib/foodLog';
import { persistStorage } from './storage';

interface FoodLogState {
  entries: LogEntry[];
  /** Adds an entry (today unless a day is given) and returns its id. */
  add: (entry: NewEntry) => string;
  remove: (id: string) => LogEntry | undefined;
  setServings: (id: string, servings: number) => void;
  update: (id: string, patch: Partial<Pick<LogEntry, 'healthIds'>>) => void;
  clear: () => void;
}

let seq = 0;
const newId = () => `log-${Date.now().toString(36)}-${(seq++).toString(36)}`;

function pruned(entries: LogEntry[]): LogEntry[] {
  const cutoff = addDays(todayISO(), -LOG_HISTORY_DAYS);
  return entries.filter((e) => e.day >= cutoff);
}

/** What the person ate, kept on this device. Newest first. */
export const useFoodLog = create<FoodLogState>()(
  persist(
    (set, get) => ({
      entries: [],
      add: (entry) => {
        const id = newId();
        const now = Date.now();
        const full: LogEntry = { ...entry, id, at: entry.at ?? now, day: entry.day ?? todayISO(new Date(now)), servings: clampServings(entry.servings) };
        set((s) => ({ entries: pruned([full, ...s.entries]) }));
        return id;
      },
      remove: (id) => {
        const gone = get().entries.find((e) => e.id === id);
        set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
        return gone;
      },
      setServings: (id, servings) => set((s) => ({ entries: s.entries.map((e) => (e.id === id ? { ...e, servings: clampServings(servings) } : e)) })),
      update: (id, patch) => set((s) => ({ entries: s.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),
      clear: () => set({ entries: [] }),
    }),
    { name: 'fp.foodlog.v1', version: 1, storage: persistStorage() },
  ),
);
