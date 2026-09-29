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
