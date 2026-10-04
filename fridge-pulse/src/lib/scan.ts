import { addDays, daysBetween, isValidISODate, todayISO } from './dates';
import { normalizeName } from './expiry';
import { cleanCurrency, cleanPrice, deviceCurrency } from './money';
import { catalogCategory, estimateShelfLifeDays, guessCategory, hasShelfLifeRule, knownShelfLifeDays, MAX_SHELF_LIFE_DAYS, usualPlace } from './shelfLife';
import {
  CATEGORIES,
  type Category,
  type Confidence,
  type ExpirySource,
  type PantryItem,
  type ScanItem,
  type ScanMode,
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
  /** True once the person has ticked or unticked it themselves; their choice then sticks. */
  userSelected?: boolean;
  /** Came from the shopping list; removed from the list when saved. */
  shoppingId?: string;
  /** What the scan saw when it could not tell exactly what the item is. */
  clue?: string;
  /** Index into the scanned photos (0-based) of the one that shows it best. */
  photo?: number;
  /** Confirmed from an online lookup. */
  identified?: boolean;
  /** Bought on this day (from a receipt), YYYY-MM-DD; otherwise added today. */
  addedOn?: string;
  /** What it cost, from the receipt. */
  price?: number;
  currency?: string;
}

export const MAX_DRAFT_ITEMS = 60;

/** A printed date more than this many days in the past is almost certainly misread. */
const STALE_LABEL_DAYS = 14;
/** Printed dates further out than this are treated as misreads too. */
const MAX_LABEL_DAYS = 365 * 5;
/** A receipt older than this is not this week's shopping: dates count from today instead. */
const MAX_RECEIPT_AGE_DAYS = 30;

const LOCATIONS: readonly StorageLocation[] = ['fridge', 'freezer', 'pantry'];

/**
 * Where a food from a receipt goes. The app's own rule wins for food it knows (bananas on the counter,
 * ice cream in the freezer); for anything else the receipt reader's answer is used, except that food
 * which must be chilled never goes in the cupboard.
 */
export function receiptPlace(name: string, category: Category, keptIn: unknown): StorageLocation {
  const known = catalogCategory(name) !== undefined || hasShelfLifeRule(name);
  if (known || typeof keptIn !== 'string' || !LOCATIONS.includes(keptIn as StorageLocation)) return usualPlace(name, category);
  if (keptIn === 'pantry' && estimateShelfLifeDays(name, category, 'pantry') === 0) return usualPlace(name, category);
  return keptIn as StorageLocation;
}

/** The day a receipt's food was bought: its printed date when that is believable, else today. */
export function purchaseDay(printed: unknown, today: string): string {
  if (!isValidISODate(printed)) return today;
  const age = daysBetween(printed, today);
  return age >= 0 && age <= MAX_RECEIPT_AGE_DAYS ? printed : today;
}

function tidyName(raw: string): string {
  const s = raw.trim().replace(/\s+/g, ' ');
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function isCategory(v: unknown): v is Category {
  return typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v);
}

/**
 * The AI judges freshness from the photo, which can only shorten the time left: wilted spinach has
 * less than the usual five days. For a food the app recognises, it never gets longer than food-safety
 * guidance allows in the fridge or freezer. (In the cupboard a jar or carton may be unopened, so the
 * model's reading of the label wins there.)
 */
export function reconcile(modelDays: number, name: string, category: Category, location: StorageLocation): number {
  if (location === 'pantry') return modelDays;
  const known = knownShelfLifeDays(name, category, location);
  return known === null ? modelDays : Math.min(modelDays, known);
}

/**
 * Defensive conversion of the scan endpoint's response into editable drafts.
 * The server validates its output, but this is the trust boundary for anything
 * that ends up in storage, so it coerces rather than assumes.
 */
export function toDrafts(
  response: Pick<ScanResponse, 'items' | 'purchaseDate' | 'currency'>,
  location: StorageLocation,
  existing: PantryItem[],
  now: Date = new Date(),
  mode: ScanMode = 'shelf',
): DraftItem[] {
  const today = todayISO(now);
  const receipt = mode === 'receipt';
  // Food from a receipt was bought on the receipt's date, so its time counts from then.
  const bought = receipt ? purchaseDay(response.purchaseDate, today) : today;
  const currency = receipt ? cleanCurrency(response.currency) : null;
  const tracked = new Set(
    existing.filter((i) => i.status === 'active').map((i) => `${i.location}:${normalizeName(i.name)}`),
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

    // A food the app knows keeps its usual category, so oat milk is always filed with the drinks.
    const category: Category = catalogCategory(name) ?? (isCategory(raw.category) ? raw.category : guessCategory(name));
    const place = receipt ? receiptPlace(name, category, raw.keptIn) : location;

    let expiresOn: string;
    let expirySource: ExpirySource;
    const label = receipt ? null : raw.labelExpiryDate;
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
          ? reconcile(Math.min(Math.max(Math.round(raw.shelfLifeDays), 0), MAX_SHELF_LIFE_DAYS), name, category, place)
          : estimateShelfLifeDays(name, category, place);
      expiresOn = addDays(bought, days);
      expirySource = 'estimate';
    }

    const duplicate = tracked.has(`${place}:${norm}`);
    const clue = typeof raw.clue === 'string' ? raw.clue.trim().replace(/\s+/g, ' ').slice(0, 200) : '';
    const photo = typeof raw.photo === 'number' && Number.isInteger(raw.photo) && raw.photo >= 1 && raw.photo <= 10 ? raw.photo - 1 : undefined;
    drafts.push({
      key: `${norm}-${drafts.length}`,
      name,
      category,
      quantity: typeof raw.quantity === 'string' && raw.quantity.trim() ? raw.quantity.trim().slice(0, 30) : '1',
      location: place,
      expiresOn,
      expirySource,
      confidence: raw.confidence === 'high' || raw.confidence === 'low' ? raw.confidence : 'medium',
      // A repeat in a shelf photo is the same food; a repeat on a receipt is more of it.
      selected: receipt || !duplicate,
      duplicate,
      ...(clue ? { clue } : {}),
      ...(photo !== undefined && !receipt ? { photo } : {}),
      ...(bought !== today ? { addedOn: bought } : {}),
      ...(receipt && cleanPrice(raw.price) !== null ? { price: cleanPrice(raw.price)!, ...(currency ? { currency } : {}) } : {}),
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
    addedOn: draft.addedOn ?? todayISO(now),
    expiresOn: draft.expiresOn,
    expirySource: draft.expirySource,
    status: 'active',
    ...(draft.price !== undefined ? { price: draft.price, currency: draft.currency ?? deviceCurrency() } : {}),
  };
}

export function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
