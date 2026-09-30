export type StorageLocation = 'fridge' | 'freezer' | 'pantry';

export const CATEGORIES = [
  'produce',
  'dairy',
  'meat',
  'seafood',
  'bakery',
  'leftovers',
  'drinks',
  'condiments',
  'grains',
  'canned',
  'snacks',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export type ExpirySource = 'label' | 'estimate' | 'manual';
export type ItemStatus = 'active' | 'used' | 'wasted';

export interface PantryItem {
  id: string;
  name: string;
  category: Category;
  /** Free text: "2", "1 carton", "half". */
  quantity: string;
  location: StorageLocation;
  /** Local calendar date, YYYY-MM-DD. */
  addedOn: string;
  /** Local calendar date, YYYY-MM-DD. */
  expiresOn: string;
  expirySource: ExpirySource;
  status: ItemStatus;
  /** Local calendar date the item was marked used / wasted. */
  resolvedOn?: string;
}

export type Confidence = 'high' | 'medium' | 'low';

/** One item as returned by the scan endpoint. */
export interface ScanItem {
  name: string;
  category: Category;
  quantity: string;
  /** Model's estimate of how many days from today the item stays good. */
  shelfLifeDays: number | null;
  /** Printed date, if one was legible, as YYYY-MM-DD. */
  labelExpiryDate: string | null;
  confidence: Confidence;
  /** What the scan saw when it could not tell exactly what the item is: container, colours, words. */
  clue?: string | null;
  /** Which photo (1 = first) shows the item best. */
  photo?: number | null;
}

export interface ScanResponse {
  items: ScanItem[];
  /** Short note when the photo is unusable (blurry, not food, ...). */
  notes: string | null;
}

export interface Meal {
  id: string;
  title: string;
  summary: string;
  minutes: number;
  servings: number;
  /** Names of tracked items this meal uses. */
  uses: string[];
  /** Ingredients needed that are not tracked (staples included). */
  extras: string[];
  steps: string[];
  source: 'ai' | 'local';
}

export type Diet = 'none' | 'vegetarian' | 'vegan' | 'gluten-free' | 'dairy-free';

export interface MealPrefs {
  diet: Diet;
  servings: number;
}

export interface ShelfLifeDays {
  fridge: number | null;
  /** null when freezing is not advised. */
  freezer: number | null;
  pantry: number | null;
}

/** A possible match from the online lookup (server/src/schemas.ts FoodCandidate). */
export interface FoodCandidate {
  name: string;
  brand: string | null;
  product: string | null;
  category: Category;
  keptIn: StorageLocation;
  shelfLife: ShelfLifeDays;
  /** How it looks, so a later scan can recognise it. */
  looks: string;
  /** Why the lookup thinks it matches. */
  why: string;
  sourceUrl: string | null;
  image: { url: string; credit: string; pageUrl: string } | null;
}

/** A food the person confirmed from a picture, kept on this device (src/store/foods.ts). */
export interface LearnedFood {
  id: string;
  name: string;
  brand: string | null;
  product: string | null;
  category: Category;
  keptIn: StorageLocation;
  shelfLife: ShelfLifeDays;
  looks: string;
  /** Other names that mean this food, such as what a scan first called it. */
  aliases: string[];
  imageUrl: string | null;
  imageCredit: string | null;
  sourceUrl: string | null;
  /** YYYY-MM-DD. */
  addedOn: string;
}
