/**
 * Diet filters over every food the app suggests, against lists written by hand from what the foods
 * are made of (not from the filter's own word lists), plus names that mix a plant word with meat.
 */
import { FOOD_CATALOG } from '../src/lib/foodCatalog';
import { filterForDiet, localSuggestions } from '../src/lib/meals';
import type { Category, Diet } from '../src/lib/types';
import { mk, NOW } from '../test-utils/helpers';

const allowed = (name: string, category: Category, diet: Diet) => filterForDiet([mk('1', name, '2026-10-20', { category })], diet).length === 1;

/** Meat and fish filed outside the meat and seafood shelves. */
const MEAT_ELSEWHERE = ['Chicken soup', 'Worcestershire sauce', 'Fish sauce', 'Canned tuna', 'Chicken broth', 'Beef broth', 'Sardines'];
/** Made with milk, cream, butter or cheese, though not filed under dairy. */
const DAIRY_ELSEWHERE = [
  'Milk chocolate', 'Ranch dressing', 'Pesto', 'Tzatziki', 'Chocolate spread',
  'Pizza', 'Leftover pizza', 'Frozen pizza', 'Lasagna',
  'Cake', 'Brownies', 'Croissants', 'Brioche', 'Frozen waffles', 'Muffins', 'Donuts', 'Cookies',
];
/** Made with eggs, besides the eggs themselves. */
const EGG = ['Mayonnaise', 'Ranch dressing', 'Egg noodles', 'Cake', 'Brownies', 'Croissants', 'Brioche', 'Frozen waffles', 'Muffins', 'Donuts', 'Cookies'];
/** Made with wheat, barley or rye. */
const GLUTEN = [
  'Bread', 'White bread', 'Whole wheat bread', 'Sourdough bread', 'Rye bread', 'Baguette', 'Bagels', 'English muffins', 'Croissants',
  'Hamburger buns', 'Hot dog buns', 'Dinner rolls', 'Pita bread', 'Naan', 'Flour tortillas', 'Wraps', 'Muffins', 'Donuts', 'Cake', 'Brownies',
  'Crumpets', 'Brioche', 'Pizza dough', 'Frozen waffles', 'Leftover pizza', 'Leftover pasta', 'Lasagna', 'Pizza', 'Frozen pizza', 'Beer',
  'Soy sauce', 'Teriyaki sauce', 'Pasta', 'Spaghetti', 'Penne', 'Macaroni', 'Egg noodles', 'Ramen noodles', 'Couscous', 'Cereal', 'Granola',
  'Flour', 'Breadcrumbs', 'Crackers', 'Pretzels', 'Cookies', 'Granola bars', 'Fish sticks', 'Fish fingers',
];

const shouldBlock = (name: string, category: Category, diet: Diet): boolean => {
  const meat = category === 'meat' || category === 'seafood' || MEAT_ELSEWHERE.includes(name);
  const eggs = /\beggs\b/i.test(name);
  const dairy = (category === 'dairy' && !eggs) || DAIRY_ELSEWHERE.includes(name);
  switch (diet) {
    case 'vegetarian':
      return meat;
    case 'vegan':
      return meat || dairy || eggs || EGG.includes(name) || name === 'Honey';
    case 'dairy-free':
      return dairy;
    case 'gluten-free':
      return GLUTEN.includes(name);
    default:
      return false;
  }
};

describe('every catalog food against each diet', () => {
  for (const diet of ['vegetarian', 'vegan', 'dairy-free', 'gluten-free'] as const) {
    it(diet, () => {
      const wrong = FOOD_CATALOG.filter((f) => allowed(f.name, f.category, diet) === shouldBlock(f.name, f.category, diet)).map(
        (f) => `${f.name} (${shouldBlock(f.name, f.category, diet) ? 'should be left out' : 'should be allowed'})`,
      );
      expect(wrong).toEqual([]);
    });
  }

  it('the hand-written lists only name catalog foods', () => {
    const names = new Set(FOOD_CATALOG.map((f) => f.name));
    expect([...MEAT_ELSEWHERE, ...DAIRY_ELSEWHERE, ...EGG, ...GLUTEN].filter((n) => !names.has(n))).toEqual([]);
  });
});

describe('a plant word only makes the food it describes plant-based', () => {
  it.each([
    ['Honey soy chicken', 'meat', 'vegetarian'],
    ['Chicken and veggie skewers', 'meat', 'vegetarian'],
    ['Pork and tofu dumplings', 'meat', 'vegetarian'],
    ['Soy glazed salmon', 'seafood', 'vegetarian'],
    ['Veggie stir fry with chicken', 'leftovers', 'vegetarian'],
    ['Cheese and veggie pizza', 'leftovers', 'vegan'],
    ['Cheese and veggie pizza', 'leftovers', 'dairy-free'],
    ['Soy sauce eggs', 'dairy', 'vegan'],
    ['Vegetarian cheese', 'dairy', 'vegan'],
    ['Dairy-free chicken pie', 'meat', 'vegetarian'],
  ] as [string, Category, Diet][])('keeps %s (%s) away from a %s diet', (name, category, diet) => {
    expect(allowed(name, category, diet)).toBe(false);
  });

  it.each([
    ['Veggie sausages', 'meat', 'vegetarian'],
    ['Quorn mince', 'meat', 'vegetarian'],
    ['Beyond burger', 'meat', 'vegetarian'],
    ['Soy chorizo', 'meat', 'vegetarian'],
    ['Vegan prawns', 'seafood', 'vegan'],
    ['Vegan mayo', 'condiments', 'vegan'],
    ['Vegan cheese', 'dairy', 'vegan'],
    ['Dairy-free yogurt', 'dairy', 'dairy-free'],
    ['Egg-free mayo', 'condiments', 'vegan'],
    ['Vegan chocolate cake', 'bakery', 'vegan'],
    ['Plant-based butter', 'dairy', 'dairy-free'],
    ['Coconut yogurt', 'dairy', 'vegan'],
    ['Tofu', 'other', 'vegan'],
    ['Pizza sauce', 'condiments', 'gluten-free'],
    ['Pizza dough', 'bakery', 'dairy-free'],
    ['Lasagna sheets', 'grains', 'vegan'],
  ] as [string, Category, Diet][])('allows %s (%s) on a %s diet', (name, category, diet) => {
    expect(allowed(name, category, diet)).toBe(true);
  });

  it('never builds a vegetarian dinner around honey soy chicken', () => {
    const items = [
      mk('1', 'Honey soy chicken', '2026-10-01', { category: 'meat' }),
      mk('2', 'Rice', '2026-12-01', { category: 'grains' }),
      mk('3', 'Broccoli', '2026-10-02', { category: 'produce' }),
      mk('4', 'Garlic', '2026-10-20', { category: 'produce' }),
      mk('5', 'Lemons', '2026-10-20', { category: 'produce' }),
    ];
    for (const meal of localSuggestions(items, { diet: 'vegetarian', servings: 2 }, NOW)) expect(meal.uses).not.toContain('Honey soy chicken');
  });
});
