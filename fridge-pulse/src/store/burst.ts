import { create } from 'zustand';

export interface Burst {
  id: number;
  /** Window coordinates of the burst's centre. */
  x: number;
  y: number;
}

interface BurstState {
  bursts: Burst[];
  emit: (x: number, y: number) => void;
  done: (id: number) => void;
}

let seq = 0;

/** Celebration bursts drawn by `BurstLayer` above everything else. */
export const useBurst = create<BurstState>((set) => ({
  bursts: [],
  emit: (x, y) => set((s) => ({ bursts: [...s.bursts.slice(-3), { id: ++seq, x, y }] })),
  done: (id) => set((s) => ({ bursts: s.bursts.filter((b) => b.id !== id) })),
}));
