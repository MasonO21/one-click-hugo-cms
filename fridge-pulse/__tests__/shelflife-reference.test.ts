import { FOOD_CATALOG } from '../src/lib/foodCatalog';
import { estimateShelfLifeDays, freezesWell, MAX_SHELF_LIFE_DAYS } from '../src/lib/shelfLife';
import type { Category, StorageLocation } from '../src/lib/types';
import { FOOD_CASES } from '../test-utils/foodCases';
import reference from '../test-utils/shelfLifeReference.json';

/**
 * Every food the app knows by name is checked, in the fridge, freezer and pantry, against a reference
 * compiled independently (without seeing the app's figures) from USDA FoodKeeper, the FDA refrigerator
 * and freezer chart and FSIS guidance. The app's estimate must fall inside the reference range, except
 * where one of the conventions below applies. Each exception says why.
 */
type Range = [number, number];
interface Ref {
  fridge: Range;
  freezer: Range;
  pantry: Range;
  note: string;
}
const REF = reference.foods as unknown as Record<string, Ref>;
const LOCATIONS: StorageLocation[] = ['fridge', 'freezer', 'pantry'];

const CATEGORY = new Map<string, Category>();
for (const [name, category] of FOOD_CASES) CATEGORY.set(name, category);
for (const food of FOOD_CATALOG) CATEGORY.set(food.name, food.category);

/**
 * Where it is kept tells the app whether a jar, carton or can is open: a pasta sauce in the cupboard
 * is unopened (an opened one would be in the fridge). The reference assumed "opened" everywhere, so
 * for these the cupboard figure is checked against unopened shelf-life guidance instead.
 */
const UNOPENED_IN_PANTRY: Record<string, Range> = {
  'Oat milk': [180, 365],
  'Almond milk': [180, 365],
  'Soy milk': [180, 365],
  'Orange juice': [180, 365],
  'Apple juice': [180, 365],
  'Cranberry juice': [180, 365],
  Lemonade: [180, 365],
  'Iced tea': [180, 365],
  'Coconut water': [180, 365],
  Mayonnaise: [90, 180],
  'Salad dressing': [180, 365],
  'Ranch dressing': [90, 365],
  'BBQ sauce': [365, 365],
  'Teriyaki sauce': [365, 365],
  'Oyster sauce': [365, 365],
  'Maple syrup': [365, 365],
  Jam: [365, 365],
  'Strawberry jam': [365, 365],
  Pesto: [180, 365],
  Salsa: [365, 540],
  Relish: [365, 540],
  Pickles: [365, 540],
  Olives: [365, 540],
  'Pasta sauce': [365, 540],
  'Tomato soup': [365, 540],
  'Chicken broth': [365, 730],
  'Vegetable stock': [365, 730],
  'Beef broth': [365, 730],
};

/** Dry goods need no cold storage; in the fridge or freezer they keep as long as in the cupboard. */
const NO_COLD_STORAGE_NEEDED = new Set<Category>(['grains', 'snacks', 'condiments', 'drinks']);

/** Deliberate differences from the reference, each with its reason. */
const DEVIATIONS: Record<string, Partial<Record<StorageLocation, { days: number; why: string }>>> = {
  Chorizo: {
    fridge: {
      days: 2,
      why: 'The reference assumed dry-cured chorizo (2-3 weeks); fresh chorizo is raw sausage (1-2 days) and the app cannot tell them apart, so it uses the safer figure.',
    },
  },
  'Sweet potatoes': { fridge: { days: 14, why: 'Guidance says not to refrigerate raw sweet potatoes (the core hardens); if someone does, two weeks is a quality estimate.' } },
  'Sweet potato': { fridge: { days: 14, why: 'As above.' } },
};

const HIGH_RISK = new Set<Category>(['meat', 'seafood', 'dairy', 'leftovers']);

describe('shelf-life estimates match food-safety guidance', () => {
  const names = Object.keys(REF);

  it('covers every food the app names', () => {
    expect(names.length).toBeGreaterThan(400);
    for (const name of names) expect(CATEGORY.has(name)).toBe(true);
  });

  for (const name of names) {
    const ref = REF[name];
    it(`${name}`, () => {
      const category = CATEGORY.get(name)!;
      const days = (loc: StorageLocation) => estimateShelfLifeDays(name, category, loc);
      for (const loc of LOCATIONS) {
        const [lo, hi] = ref[loc];
        const ours = days(loc);
        const where = `${name} in the ${loc}: app ${ours} days, guidance ${lo}-${hi} (${ref.note})`;
        const deviation = DEVIATIONS[name]?.[loc];
        if (deviation) {
          expect({ where, ours }).toEqual({ where, ours: deviation.days });
          continue;
        }
        if (lo === 0 && hi === 0) {
          if (loc === 'pantry') {
            const unopened = UNOPENED_IN_PANTRY[name];
            if (unopened) {
              expect({ where, ok: ours >= unopened[0] && ours <= unopened[1] }).toEqual({ where, ok: true });
            } else {
              // Must not sit out: "use today" (and for meat, fish, dairy and leftovers exactly that).
              expect({ where, ok: ours <= (HIGH_RISK.has(category) ? 0 : 1) }).toEqual({ where, ok: true });
            }
          } else if (loc === 'freezer') {
            // Either the app knows it freezes badly, or freezing is merely pointless and gains nothing.
            const gainsNothing = ours <= Math.max(days('fridge'), days('pantry'));
            expect({ where, ok: !freezesWell(name, category) || (NO_COLD_STORAGE_NEEDED.has(category) && gainsNothing) }).toEqual({ where, ok: true });
          } else {
            // Fridge not needed (dry goods): it keeps no longer than in the cupboard.
            // Or it cannot be kept there at all (ice cream in the fridge), which the app shows as "use today".
            expect({ where, ok: ours === 0 || (NO_COLD_STORAGE_NEEDED.has(category) && ours <= days('pantry')) }).toEqual({ where, ok: true });
          }
          continue;
        }
        if (lo > MAX_SHELF_LIFE_DAYS) {
          // Estimates stop at two years; beyond that the app just says "keeps a year or more".
          expect({ where, ours }).toEqual({ where, ours: MAX_SHELF_LIFE_DAYS });
          continue;
        }
        expect({ where, ok: ours >= lo && ours <= hi }).toEqual({ where, ok: true });
      }
    });
  }

  it('never suggests freezing buys time for food that freezes badly', () => {
    for (const name of names) {
      const category = CATEGORY.get(name)!;
      if (freezesWell(name, category)) continue;
      expect({ name, freezer: estimateShelfLifeDays(name, category, 'freezer') <= estimateShelfLifeDays(name, category, 'fridge') }).toEqual({
        name,
        freezer: true,
      });
    }
  });
});
