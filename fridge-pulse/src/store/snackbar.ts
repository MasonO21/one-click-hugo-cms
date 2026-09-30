import { create } from 'zustand';

export interface Snack {
  id: number;
  message: string;
  /** "rescue" gets a leaf and a warmer look: the moment the app exists for. */
  tone: 'plain' | 'rescue' | 'waste' | 'freeze';
  action?: { label: string; onPress: () => void };
  durationMs: number;
}

interface SnackbarState {
  snack: Snack | null;
  /**
   * Bottom button bars of mounted screens, newest last. The message bar sits above the newest one;
   * keeping them all means a screen closing never clears the footer of the screen that replaced it.
   */
  footers: { id: number; height: number }[];
  setFooter: (id: number, height: number) => void;
  clearFooter: (id: number) => void;
  show: (snack: Omit<Snack, 'id' | 'tone' | 'durationMs'> & Partial<Pick<Snack, 'tone' | 'durationMs'>>) => void;
  /** Hides the given snack (or whatever is showing). A newer snack is left alone. */
  hide: (id?: number) => void;
}

let seq = 0;

/** One message bar for the whole app, so an Undo survives closing the screen that caused it. */
export const useSnackbar = create<SnackbarState>((set, get) => ({
  snack: null,
  footers: [],
  setFooter: (id, height) =>
    set((s) => {
      const known = s.footers.some((f) => f.id === id);
      return { footers: known ? s.footers.map((f) => (f.id === id ? { id, height } : f)) : [...s.footers, { id, height }] };
    }),
  clearFooter: (id) => set((s) => ({ footers: s.footers.filter((f) => f.id !== id) })),
  show: (snack) => set({ snack: { tone: 'plain', durationMs: 5000, ...snack, id: ++seq } }),
  hide: (id) => {
    if (id === undefined || get().snack?.id === id) set({ snack: null });
  },
}));
