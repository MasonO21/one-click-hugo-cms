import { SCREENSHOT_MODE } from './config';
import { addDays, todayISO } from './dates';
import { DEMO_GOCHUJANG_PICTURE, DEMO_SSAMJANG_PICTURE } from './demoPictures';
import { localSuggestions } from './meals';
import type { Meal, MealPrefs, PantryItem, ScanResponse, StorageLocation } from './types';

type Sample = ScanResponse['items'][number];

const item = (
  name: string,
  category: Sample['category'],
  quantity: string,
  shelfLifeDays: number | null,
  confidence: Sample['confidence'] = 'high',
  labelInDays: number | null = null,
  clue: string | null = null,
): Sample => ({
  name,
  category,
  quantity,
  shelfLifeDays,
  labelExpiryDate: labelInDays == null ? null : addDays(todayISO(), labelInDays),
  confidence,
  clue,
  photo: 1,
});

const MYSTERY_CLUE = 'Red plastic tub, red lid, Korean label, chili pepper picture';

/**
 * Sample scan results used when no backend is configured. Like the real scan, it names foods the
 * person has taught the app: once the mystery tub is confirmed, it comes back by its name.
 */
export async function demoScan(location: StorageLocation, known: { name: string }[] = []): Promise<ScanResponse> {
  const taught = known.find((k) => /^(gochujang|ssamjang)$/i.test(k.name.trim()));
  await new Promise((r) => setTimeout(r, 1600));
  const byLocation: Record<StorageLocation, Sample[]> = {
    fridge: [
      item('Whole milk', 'dairy', '1 carton', 6, 'high', 6),
      // Something the app does not know: the review screen looks it up and asks "Is this it?".
      taught ? item(taught.name, 'condiments', '1 tub', 180, 'high') : item('Chili paste', 'condiments', '1 tub', 60, 'low', null, MYSTERY_CLUE),
      item('Baby spinach', 'produce', '1 bag', 3, 'medium'),
      item('Greek yogurt', 'dairy', '2 tubs', 12, 'high', 12),
      item('Chicken thighs', 'meat', '4 pieces', 2, 'medium'),
      item('Eggs', 'dairy', '10', 21, 'high'),
      item('Cheddar cheese', 'dairy', '1 block', 21, 'medium'),
      item('Bell peppers', 'produce', '3', 8, 'high'),
      item('Strawberries', 'produce', '1 punnet', 3, 'low'),
      item('Leftover pasta', 'leftovers', '1 container', 3, 'low'),
    ],
    pantry: [
      item('Spaghetti', 'grains', '1 box', 365, 'high'),
      item('Canned tomatoes', 'canned', '3 cans', 420, 'high', 420),
      item('Basmati rice', 'grains', '1 bag', 365, 'high'),
      item('Bananas', 'produce', '5', 4, 'medium'),
      item('Sourdough bread', 'bakery', '1 loaf', 3, 'medium'),
      item('Peanut butter', 'condiments', '1 jar', 90, 'high'),
    ],
    freezer: [
      item('Frozen peas', 'produce', '1 bag', 300, 'high'),
      item('Ground beef', 'meat', '500 g', 120, 'medium'),
      item('Salmon fillets', 'seafood', '2', 60, 'medium'),
    ],
  };
  return {
    items: byLocation[location],
    notes: SCREENSHOT_MODE ? null : 'Sample items: this preview is not connected to the photo-scanning service.',
  };
}

const line = (
  name: string,
  category: Sample['category'],
  quantity: string,
  shelfLifeDays: number,
  keptIn: StorageLocation,
  price: number,
  confidence: Sample['confidence'] = 'high',
  clue: string | null = null,
): Sample => ({
  name,
  category,
  quantity,
  shelfLifeDays,
  labelExpiryDate: null,
  confidence,
  clue,
  photo: null,
  keptIn,
  price,
});

/**
 * A sample receipt read, used when no backend is configured: abbreviations already expanded, each
 * line headed for where it is kept, bought yesterday.
 */
export async function demoReceipt(known: { name: string }[] = []): Promise<ScanResponse> {
  const taught = known.find((k) => /^(gochujang|ssamjang)$/i.test(k.name.trim()));
  await new Promise((r) => setTimeout(r, 1600));
  return {
    purchaseDate: addDays(todayISO(), -1),
    items: [
      line('Bananas', 'produce', '1.3 lb', 5, 'pantry', 1.12),
      line('2% milk', 'dairy', '1 gallon', 7, 'fridge', 3.49),
      line('Chicken breast', 'meat', '1.5 lb', 2, 'fridge', 8.97, 'medium'),
      line('Baby spinach', 'produce', '1 bag', 5, 'fridge', 3.99),
      line('Greek yogurt', 'dairy', '2', 14, 'fridge', 5.58),
      line('Strawberries', 'produce', '1 lb', 4, 'fridge', 4.29),
      line('Cheddar cheese', 'dairy', '8 oz', 42, 'fridge', 3.79, 'medium'),
      line('Avocados', 'produce', '3', 4, 'pantry', 3.75),
      line('Sourdough bread', 'bakery', '1 loaf', 4, 'pantry', 4.49),
      line('Spaghetti', 'grains', '2', 365, 'pantry', 2.58),
      line('Canned tomatoes', 'canned', '4', 540, 'pantry', 4.36),
      line('Frozen peas', 'produce', '1 bag', 300, 'freezer', 1.99),
      line('Ice cream', 'dairy', '1 tub', 60, 'freezer', 4.99),
      // A line the reader could not decode: the review screen looks it up.
      taught ? line(taught.name, 'condiments', '1 tub', 365, 'pantry', 6.49) : line('Chili paste', 'condiments', '1 tub', 365, 'pantry', 6.49, 'low', 'CJ GOCHU PST 500G'),
    ],
    currency: 'USD',
    notes: SCREENSHOT_MODE ? null : 'Sample receipt: this preview is not connected to the receipt-reading service.',
  };
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new Error('aborted'));
    });
  });

const GOCHUJANG = {
  name: 'Gochujang',
  brand: null,
  product: null,
  category: 'condiments',
  keptIn: 'pantry',
  shelfLife: { fridge: 180, freezer: 365, pantry: 365 },
  looks: 'Red plastic tub with a red lid and a chili pepper on the label',
  why: 'The red tub, chili pepper picture and Korean label match gochujang, a fermented chili paste.',
  sourceUrl: 'https://en.wikipedia.org/wiki/Gochujang',
  image: { url: DEMO_GOCHUJANG_PICTURE, credit: 'Sample picture', pageUrl: 'https://en.wikipedia.org/wiki/Gochujang' },
};

const SSAMJANG = {
  name: 'Ssamjang',
  brand: null,
  product: null,
  category: 'condiments',
  keptIn: 'pantry',
  shelfLife: { fridge: 90, freezer: 180, pantry: 365 },
  looks: 'Brown plastic tub with a green lid',
  why: 'A similar Korean tub, though ssamjang is usually brown rather than red.',
  sourceUrl: 'https://en.wikipedia.org/wiki/Ssamjang',
  image: { url: DEMO_SSAMJANG_PICTURE, credit: 'Sample picture', pageUrl: 'https://en.wikipedia.org/wiki/Ssamjang' },
};

/**
 * Sample lookup used when no backend is configured. It only knows the sample scan's mystery tub;
 * anything else comes back with no match.
 */
export async function demoIdentify(name: string, clue: string | undefined, signal?: AbortSignal): Promise<unknown> {
  await wait(2200, signal);
  const text = `${name} ${clue ?? ''}`.toLowerCase();
  if (/ssamjang/.test(text)) return { candidates: [SSAMJANG] };
  if (/gochujang|chil+i paste|korean/.test(text)) return { candidates: [GOCHUJANG, SSAMJANG] };
  return { candidates: [] };
}

/** Sample "AI" ideas: the built-in recipes, skipping titles already shown when asked for more. */
export async function demoMeals(items: PantryItem[], prefs: MealPrefs, exclude: string[] = []): Promise<Meal[]> {
  await new Promise((r) => setTimeout(r, 600));
  const all = localSuggestions(items, prefs, new Date(), 120);
  const unseen = all.filter((m) => !exclude.includes(m.title));
  return (unseen.length > 0 ? unseen : all).slice(0, 6);
}
