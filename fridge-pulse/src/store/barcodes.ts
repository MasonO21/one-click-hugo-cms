import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BarcodeProduct } from '../lib/barcode';
import { persistStorage } from './storage';

/** Products this phone has scanned before, so a repeat scan is instant and works offline. */
const MAX_KNOWN = 400;

interface BarcodesState {
  known: Record<string, BarcodeProduct & { at: number }>;
  /** Remembers a product (or the name the person typed for a barcode nobody knew). */
  remember: (product: BarcodeProduct) => void;
  clear: () => void;
}

export const useBarcodes = create<BarcodesState>()(
  persist(
    (set) => ({
      known: {},
      remember: (product) =>
        set((s) => {
          const known = { ...s.known, [product.code]: { ...product, at: Date.now() } };
          const codes = Object.keys(known);
          if (codes.length > MAX_KNOWN) {
            // Forget the products scanned longest ago.
            codes.sort((a, b) => known[a]!.at - known[b]!.at);
            for (const code of codes.slice(0, codes.length - MAX_KNOWN)) delete known[code];
          }
          return { known };
        }),
      clear: () => set({ known: {} }),
    }),
    { name: 'fp.barcodes.v1', version: 1, storage: persistStorage() },
  ),
);
