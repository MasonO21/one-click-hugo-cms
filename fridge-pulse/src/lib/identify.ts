import { FOOD_CATALOG } from './foodCatalog';
import { hasShelfLifeRule, learnedKey, MAX_SHELF_LIFE_DAYS } from './shelfLife';
import type { DraftItem } from './scan';
import { CATEGORIES, type Category, type FoodCandidate, type LearnedFood, type ShelfLifeDays, type StorageLocation } from './types';

/**
 * Product pictures only ever load from the two food databases the server asks (Open Food Facts and
 * Wikimedia). The server enforces this too; this is the app's own trust boundary.
 */
export const PICTURE_HOSTS = ['images.openfoodfacts.org', 'static.openfoodfacts.org', 'upload.wikimedia.org'];

/** The most lookups started on their own after one scan; each one costs a web search. */
export const MAX_AUTO_LOOKUPS = 5;

export function isAllowedPicture(url: unknown, allowInline = false): url is string {
  if (typeof url !== 'string') return false;
  // Sample pictures bundled with the demo build.
  if (allowInline) return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(url) && url.length < 400_000;
  if (url.length > 500) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && PICTURE_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

function httpsUrl(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 500) return null;
  try {
    return new URL(v).protocol === 'https:' ? v : null;
  } catch {
    return null;
  }
}

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const orNull = (v: unknown, max: number): string | null => text(v, max) || null;

function days(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.min(Math.max(Math.round(v), 0), MAX_SHELF_LIFE_DAYS);
}

const isCategory = (v: unknown): v is Category => typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v);
const isLocation = (v: unknown): v is StorageLocation => v === 'fridge' || v === 'freezer' || v === 'pantry';

/** Defensive conversion of the lookup response: anything malformed is dropped, not trusted. */
export function toCandidates(raw: unknown, allowInlinePictures = false): FoodCandidate[] {
  const list = (raw as { candidates?: unknown } | null)?.candidates;
  if (!Array.isArray(list)) return [];
  const out: FoodCandidate[] = [];
  for (const r of list.slice(0, 10) as Record<string, unknown>[]) {
    if (out.length === 3) break;
    if (!r || typeof r !== 'object') continue;
    const name = text(r.name, 80);
    if (!name || !isCategory(r.category)) continue;
    const life = (r.shelfLife ?? {}) as Record<string, unknown>;
    const img = r.image as { url?: unknown; credit?: unknown; pageUrl?: unknown } | null | undefined;
    const imageOk = img && isAllowedPicture(img.url, allowInlinePictures);
    out.push({
      name: name[0]!.toUpperCase() + name.slice(1),
      brand: orNull(r.brand, 60),
      product: orNull(r.product, 120),
      category: r.category,
      keptIn: isLocation(r.keptIn) ? r.keptIn : 'fridge',
      shelfLife: { fridge: days(life.fridge), freezer: days(life.freezer), pantry: days(life.pantry) },
      looks: text(r.looks, 200),
      why: text(r.why, 200),
      sourceUrl: httpsUrl(r.sourceUrl),
      image: imageOk ? { url: img.url as string, credit: text(img.credit, 40) || 'the web', pageUrl: httpsUrl(img.pageUrl) ?? '' } : null,
    });
  }
  return out;
}

const catalogNames = new Set(FOOD_CATALOG.map((f) => learnedKey(f.name)));

/** In the app's food list, covered by a shelf-life rule, or taught by the person. */
export function isRecognized(name: string): boolean {
  return catalogNames.has(learnedKey(name)) || hasShelfLifeRule(name);
}

/**
 * Whether a scanned item should be looked up online: the app does not know the food, or the scan
 * could not tell exactly what it is and described it instead. Leftovers are never looked up.
 */
export function needsLookup(draft: Pick<DraftItem, 'name' | 'category' | 'confidence' | 'clue' | 'identified'>): boolean {
  if (draft.identified || draft.category === 'leftovers') return false;
  if (learnedKey(draft.name).length < 3) return false;
  return !isRecognized(draft.name) || (draft.confidence === 'low' && !!draft.clue);
}

/** A typed item the app does not know, for which a manual "look it up" is worth offering. */
export function canLookUp(draft: Pick<DraftItem, 'name' | 'category' | 'identified'>): boolean {
  return !draft.identified && draft.category !== 'leftovers' && learnedKey(draft.name).length >= 3 && !isRecognized(draft.name);
}

/** "Chung Jung One Gochujang" when there is a brand, else the name. */
export function displayName(food: Pick<FoodCandidate, 'name' | 'brand'>): string {
  if (!food.brand || learnedKey(food.name).includes(learnedKey(food.brand))) return food.name;
  return `${food.brand} ${food.name}`;
}

/**
 * The database entry for a confirmed candidate. What the scan first called it becomes an alias
 * when that was a real name, so the same product is recognised next time; a vague description
 * ("Jar of red paste") is not, or every red jar would match.
 */
export function learnedFromCandidate(
  c: FoodCandidate,
  from: { name: string; confidence: DraftItem['confidence']; clue?: string },
  id: string,
  today: string,
): LearnedFood {
  const aliases = new Set<string>();
  if (from.confidence !== 'low' && !from.clue && learnedKey(from.name) !== learnedKey(c.name)) aliases.add(from.name.trim());
  if (c.brand && learnedKey(c.brand) !== learnedKey(c.name)) aliases.add(displayName(c));
  return {
    id,
    name: c.name,
    brand: c.brand,
    product: c.product,
    category: c.category,
    keptIn: c.keptIn,
    shelfLife: c.shelfLife,
    looks: c.looks || from.clue || '',
    aliases: [...aliases],
    imageUrl: c.image?.url ?? null,
    imageCredit: c.image?.credit ?? null,
    sourceUrl: c.sourceUrl,
    addedOn: today,
  };
}

/** "6 months" for a number of days, for the database screen and the verify card. */
export function durationLabel(d: number): string {
  if (d <= 0) return 'same day';
  if (d === 1) return '1 day';
  if (d < 14) return `${d} days`;
  if (d < 56) return `${Math.round(d / 7)} weeks`;
  if (d < 365) {
    const m = Math.round(d / 30);
    return m === 1 ? '1 month' : `${m} months`;
  }
  const y = Math.round(d / 365);
  return y === 1 ? '1 year' : `${y} years`;
}

/** "Fridge 6 months · Pantry 1 year · Don't freeze" */
export function shelfLifeSummary(life: ShelfLifeDays): string {
  const parts: string[] = [];
  if (life.fridge != null) parts.push(`Fridge ${durationLabel(life.fridge)}`);
  if (life.pantry != null) parts.push(life.pantry === 0 ? 'Keep chilled' : `Pantry ${durationLabel(life.pantry)}`);
  parts.push(life.freezer == null ? "Don't freeze" : `Freezer ${durationLabel(life.freezer)}`);
  return parts.join(' · ');
}

/** The newest foods first, trimmed, for the scan to recognise by name. */
export function knownForScan(foods: LearnedFood[], limit = 50): { name: string; looks: string | null }[] {
  return [...foods]
    .sort((a, b) => b.addedOn.localeCompare(a.addedOn))
    .slice(0, limit)
    .map((f) => ({ name: f.name.slice(0, 80), looks: f.looks ? f.looks.slice(0, 200) : null }));
}
