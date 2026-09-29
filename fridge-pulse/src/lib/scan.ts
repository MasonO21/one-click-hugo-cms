import { addDays, daysBetween, isValidISODate, todayISO } from './dates';
import { normalizeName } from './expiry';
import { estimateShelfLifeDays, MAX_SHELF_LIFE_DAYS } from './shelfLife';
import {
  CATEGORIES,
  type Category,
  type Confidence,
  type ExpirySource,
  type PantryItem,
  type ScanItem,
  type ScanResponse,
  type StorageLocation,
} from './types';

export interface DraftItem {
  key: string;
  name: string;
  category: Category;
  quantity: string;
  location: StorageLocation;
  expiresOn: string;
  expirySource: ExpirySource;
  confidence: Confidence;
  /** Whether it will be saved. Duplicates of tracked items start unselected. */
  selected: boolean;
  duplicate: boolean;
}

export const MAX_DRAFT_ITEMS = 60;

/** A printed date more than this many days in the past is almost certainly misread. */
const STALE_LABEL_DAYS = 14;
/** Printed dates further out than this are treated as misreads too. */
const MAX_LABEL_DAYS = 365 * 5;

function tidyName(raw: string): string {
  const s = raw.trim().replace(/\s+/g, ' ');
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function isCategory(v: unknown): v is Category {
  return typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v);
}

/**
 * Defensive conversion of the scan endpoint's response into editable drafts.
 * The server validates its output, but this is the trust boundary for anything
 * that ends up in storage, so it coerces rather than assumes.
 */
export function toDrafts(
  response: Pick<ScanResponse, 'items'>,
  location: StorageLocation,
  existing: PantryItem[],
  now: Date = new Date(),
): DraftItem[] {
  const today = todayISO(now);
  const tracked = new Set(
    existing.filter((i) => i.status === 'active' && i.location === location).map((i) => normalizeName(i.name)),
  );
  const seen = new Set<string>();
  const drafts: DraftItem[] = [];

  for (const raw of response.items as Partial<ScanItem>[]) {
    if (drafts.length >= MAX_DRAFT_ITEMS) break;
    const name = typeof raw.name === 'string' ? tidyName(raw.name) : '';
    if (!name || name.length > 80) continue;
    const norm = normalizeName(name);
    if (seen.has(norm)) continue;
    seen.add(norm);

    const category: Category = isCategory(raw.category) ? raw.category : 'other';

    let expiresOn: string;
    let expirySource: ExpirySource;
    const label = raw.labelExpiryDate;
    if (
      isValidISODate(label) &&
      daysBetween(today, label) >= -STALE_LABEL_DAYS &&
      daysBetween(today, label) <= MAX_LABEL_DAYS
    ) {
      expiresOn = label;
      expirySource = 'label';
    } else {
      const days =
        typeof raw.shelfLifeDays === 'number' && Number.isFinite(raw.shelfLifeDays)
          ? Math.min(Math.max(Math.round(raw.shelfLifeDays), 0), MAX_SHELF_LIFE_DAYS)
          : estimateShelfLifeDays(name, category, location);
      expiresOn = addDays(today, days);
      expirySource = 'estimate';
    }

    const duplicate = tracked.has(norm);
    drafts.push({
      key: `${norm}-${drafts.length}`,
      name,
      category,
      quantity: typeof raw.quantity === 'string' && raw.quantity.trim() ? raw.quantity.trim().slice(0, 30) : '1',
      location,
      expiresOn,
      expirySource,
      confidence: raw.confidence === 'high' || raw.confidence === 'low' ? raw.confidence : 'medium',
      selected: !duplicate,
      duplicate,
    });
  }
  return drafts;
}

export function draftToItem(draft: DraftItem, id: string, now: Date = new Date()): PantryItem {
  return {
    id,
    name: draft.name,
    category: draft.category,
    quantity: draft.quantity,
    location: draft.location,
    addedOn: todayISO(now),
    expiresOn: draft.expiresOn,
    expirySource: draft.expirySource,
    status: 'active',
  };
}

export function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
