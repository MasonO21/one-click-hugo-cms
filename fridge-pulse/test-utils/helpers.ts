import type { Category, PantryItem, StorageLocation } from '../src/lib/types';

/** Tuesday 29 Sep 2026, 10:00 local. */
export const NOW = new Date(2026, 8, 29, 10, 0, 0);

export function mk(
  id: string,
  name: string,
  expiresOn: string,
  opts: Partial<PantryItem> & { category?: Category; location?: StorageLocation } = {},
): PantryItem {
  return {
    id,
    name,
    category: opts.category ?? 'other',
    quantity: '1',
    location: opts.location ?? 'fridge',
    addedOn: '2026-09-25',
    expiresOn,
    expirySource: 'estimate',
    status: 'active',
    ...opts,
  };
}
