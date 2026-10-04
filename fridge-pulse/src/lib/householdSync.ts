import type { SyncRecord } from './api';
import { isValidISODate } from './dates';
import { CATEGORIES, type Category, type PantryItem, type StorageLocation } from './types';
import type { ShoppingItem } from '../store/shopping';

/**
 * Merging a shared household's lists. Each item and shopping entry carries the time it last changed;
 * the newest version wins, and a deletion is remembered (a "tombstone") so it beats older edits and
 * reaches the other phones. Pure functions: the stores and the sync loop call these.
 */

/** Deleted ids and when they were deleted (ms). */
export type Tombstones = Record<string, number>;

/** How long a phone remembers its own deletions (the server keeps them as long). */
export const TOMBSTONE_MS = 60 * 86_400_000;

const LOCATIONS: readonly StorageLocation[] = ['fridge', 'freezer', 'pantry'];
const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() !== '' ? v.slice(0, max) : null);
const isCategory = (v: unknown): v is Category => typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v);
const isLocation = (v: unknown): v is StorageLocation => typeof v === 'string' && (LOCATIONS as readonly string[]).includes(v);

/** The parts of an item that are shared: everything but this phone's bookkeeping. */
export function itemData(i: PantryItem): Record<string, unknown> {
  const { id: _id, updatedAt: _u, ...rest } = i;
  return rest;
}

export function shoppingData(s: ShoppingItem): Record<string, unknown> {
  const { id: _id, updatedAt: _u, ...rest } = s;
  return rest;
}

/** An item from another phone, checked like anything else that arrives from outside. */
export function itemFrom(id: string, updatedAt: number, d: Record<string, unknown> | null): PantryItem | null {
  if (!d) return null;
  const name = str(d.name, 80);
  if (!name || !isCategory(d.category) || !isLocation(d.location)) return null;
  if (!isValidISODate(d.addedOn) || !isValidISODate(d.expiresOn)) return null;
  const status = d.status === 'used' || d.status === 'wasted' ? d.status : 'active';
  const expirySource = d.expirySource === 'label' || d.expirySource === 'manual' ? d.expirySource : 'estimate';
  const price = typeof d.price === 'number' && d.price > 0 && d.price < 10000 ? d.price : undefined;
  const currency = typeof d.currency === 'string' && /^[A-Z]{3}$/.test(d.currency) ? d.currency : undefined;
  return {
    id,
    name,
    category: d.category,
    quantity: str(d.quantity, 30) ?? '1',
    location: d.location,
    addedOn: d.addedOn,
    expiresOn: d.expiresOn,
    expirySource,
    status,
    ...(status !== 'active' && isValidISODate(d.resolvedOn) ? { resolvedOn: d.resolvedOn } : {}),
    ...(price !== undefined ? { price, ...(currency ? { currency } : {}) } : {}),
    ...(str(d.addedBy, 40) ? { addedBy: str(d.addedBy, 40)! } : {}),
    updatedAt,
  };
}

export function shoppingFrom(id: string, updatedAt: number, d: Record<string, unknown> | null): ShoppingItem | null {
  if (!d) return null;
  const name = str(d.name, 80);
  if (!name || !isCategory(d.category) || !isValidISODate(d.addedOn)) return null;
  return {
    id,
    name,
    category: d.category,
    ...(isLocation(d.keptIn) ? { keptIn: d.keptIn } : {}),
    checked: d.checked === true,
    addedOn: d.addedOn,
    ...(str(d.addedBy, 40) ? { addedBy: str(d.addedBy, 40)! } : {}),
    updatedAt,
  };
}

/** Local changes made after `since` (ms), deletions included, ready to send. */
export function outgoing<T extends { id: string; updatedAt?: number }>(kind: SyncRecord['kind'], list: T[], deleted: Tombstones, since: number, data: (x: T) => Record<string, unknown>): SyncRecord[] {
  const out: SyncRecord[] = [];
  for (const x of list) if ((x.updatedAt ?? 0) > since) out.push({ kind, id: x.id, updatedAt: x.updatedAt!, deleted: false, data: data(x) });
  for (const [id, at] of Object.entries(deleted)) if (at > since) out.push({ kind, id, updatedAt: at, deleted: true, data: null });
  return out;
}

/**
 * Applies changes from the household to a local list: newer versions replace older ones, deletions
 * remove (and are remembered), and anything this phone changed more recently is kept.
 */
export function merge<T extends { id: string; updatedAt?: number }>(
  list: T[],
  deleted: Tombstones,
  incoming: SyncRecord[],
  parse: (id: string, updatedAt: number, data: Record<string, unknown> | null) => T | null,
): { list: T[]; deleted: Tombstones; changed: boolean } {
  const byId = new Map(list.map((x) => [x.id, x]));
  const tomb = { ...deleted };
  let changed = false;
  for (const r of incoming) {
    const local = byId.get(r.id);
    const localAt = Math.max(local?.updatedAt ?? 0, tomb[r.id] ?? 0);
    if (localAt >= r.updatedAt) continue;
    if (r.deleted) {
      if (local) {
        byId.delete(r.id);
        changed = true;
      }
      tomb[r.id] = r.updatedAt;
      continue;
    }
    const next = parse(r.id, r.updatedAt, r.data);
    if (!next) continue;
    byId.set(r.id, next);
    delete tomb[r.id];
    changed = true;
  }
  // New arrivals go first, the way a freshly added item would.
  const known = new Set(list.map((x) => x.id));
  const added = [...byId.values()].filter((x) => !known.has(x.id));
  const kept = list.filter((x) => byId.has(x.id)).map((x) => byId.get(x.id)!);
  return { list: [...added, ...kept], deleted: tomb, changed };
}

/**
 * The time to stamp a change with: now, but always later than the version it replaces, so an edit or
 * deletion made straight after another (or after a housemate's change from a phone whose clock runs
 * a little ahead) still counts as the newest.
 */
export function nextStamp(previous: number | undefined, now: number = Date.now()): number {
  return Math.max(now, (previous ?? 0) + 1);
}

/** Drops tombstones older than the server keeps them. */
export function pruneTombstones(deleted: Tombstones, now: number = Date.now()): Tombstones {
  const out: Tombstones = {};
  for (const [id, at] of Object.entries(deleted)) if (now - at < TOMBSTONE_MS) out[id] = at;
  return out;
}
