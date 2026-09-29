import { addDays, todayISO } from './dates';
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
): Sample => ({
  name,
  category,
  quantity,
  shelfLifeDays,
  labelExpiryDate: labelInDays == null ? null : addDays(todayISO(), labelInDays),
  confidence,
});

/** Sample scan results used when no backend is configured. */
export async function demoScan(location: StorageLocation): Promise<ScanResponse> {
  await new Promise((r) => setTimeout(r, 1600));
  const byLocation: Record<StorageLocation, Sample[]> = {
    fridge: [
      item('Whole milk', 'dairy', '1 carton', 6, 'high', 6),
      item('Baby spinach', 'produce', '1 bag', 3, 'medium'),
      item('Greek yogurt', 'dairy', '2 tubs', 12, 'high', 12),
      item('Chicken thighs', 'meat', '4 pieces', 2, 'medium'),
      item('Eggs', 'dairy', '10', 21, 'high'),
      item('Cheddar cheese', 'dairy', '1 block', 40, 'medium'),
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
      item('Peanut butter', 'condiments', '1 jar', 150, 'high'),
    ],
    freezer: [
      item('Frozen peas', 'produce', '1 bag', 240, 'high'),
      item('Ground beef', 'meat', '500 g', 90, 'medium'),
      item('Salmon fillets', 'seafood', '2', 120, 'medium'),
    ],
  };
  return {
    items: byLocation[location],
    notes: 'Sample items: this preview is not connected to the photo-scanning service.',
  };
}

export async function demoMeals(items: PantryItem[], prefs: MealPrefs): Promise<Meal[]> {
  await new Promise((r) => setTimeout(r, 600));
  return localSuggestions(items, prefs);
}
