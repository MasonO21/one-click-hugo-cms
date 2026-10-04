/**
 * Food categories: the catalog, the guess for typed names, and scanned items.
 */
import { FOOD_CATALOG } from '../src/lib/foodCatalog';
import { toDrafts } from '../src/lib/scan';
import { catalogCategory, guessCategory, ruleCategory } from '../src/lib/shelfLife';
import type { Category } from '../src/lib/types';
import { NOW } from '../test-utils/helpers';

describe('the food catalog', () => {
  const inCategory = (c: Category) => FOOD_CATALOG.filter((f) => f.category === c).map((f) => f.name);

  it('files plant milks with drinks, not dairy', () => {
    for (const name of ['Oat milk', 'Almond milk', 'Soy milk']) expect(catalogCategory(name)).toBe('drinks');
    expect(inCategory('dairy').filter((n) => /\b(oat|almond|soy|rice|coconut) milk\b/i.test(n))).toEqual([]);
  });

  it('keeps ready meals out of leftovers and desserts out of produce', () => {
    expect(catalogCategory('Frozen pizza')).toBe('other');
    expect(inCategory('leftovers').filter((n) => /\bfrozen\b/i.test(n))).toEqual([]);
    expect(inCategory('produce').filter((n) => /\b(ice cream|cake|cookies|chocolate|jam)\b/i.test(n))).toEqual([]);
  });

  it('guesses its own foods, and their variants, into the catalog category', () => {
    for (const f of FOOD_CATALOG) {
      expect({ name: f.name, category: guessCategory(f.name) }).toEqual({ name: f.name, category: f.category });
      expect({ name: `Organic ${f.name}`, category: guessCategory(`Organic ${f.name}`) }).toEqual({ name: `Organic ${f.name}`, category: f.category });
      expect({ name: f.name.toUpperCase(), category: guessCategory(f.name.toUpperCase()) }).toEqual({ name: f.name.toUpperCase(), category: f.category });
    }
  });

  it('has word rules that agree with the catalog, so unfamiliar foods land in the same place', () => {
    // "Dates" and "Sardines" alone could be either; the catalog decides for those.
    const disagree = FOOD_CATALOG.filter((f) => ruleCategory(f.name) !== f.category).map((f) => f.name);
    expect(disagree).toEqual(['Dates', 'Sardines']);
  });
});

describe('guessing a typed food', () => {
  it.each([
    // The last word says what it is.
    ['Honey roast ham', 'meat'],
    ['Sliced pepperoni', 'meat'],
    ['Pepperoni pizza', 'leftovers'],
    ['Strawberry yogurt', 'dairy'],
    ['Chocolate milk', 'dairy'],
    ['Mint chocolate', 'snacks'],
    ['Chocolate cake', 'bakery'],
    ['Garlic bread', 'bakery'],
    ['Garlic powder', 'condiments'],
    ['Cheese crackers', 'snacks'],
    ['Pineapple juice', 'drinks'],
    ['Tomato soup', 'leftovers'],
    ['Baby bella mushrooms', 'produce'],
    ['Rainbow chard', 'produce'],
    ['Pinto beans', 'canned'],
    ['Butter beans', 'canned'],
    ['Red lentils', 'grains'],
    ['Soba noodles', 'grains'],
    ['Smoked mackerel', 'seafood'],
    ['Kielbasa', 'meat'],
    ['Pastrami', 'meat'],
    ['Labneh', 'dairy'],
    ['Quail eggs', 'dairy'],
    ['Dragon fruit', 'produce'],
    ['Seaweed snacks', 'snacks'],
    // Compound names whose last word would mislead.
    ['Peanut butter', 'condiments'],
    ['Ice cream sandwich', 'dairy'],
    ['Fish cakes', 'seafood'],
    ['Salmon steak', 'seafood'],
    ['Tuna steaks', 'seafood'],
    ['Lemon juice', 'condiments'],
    ['White pepper', 'condiments'],
    ['Ground ginger', 'condiments'],
    ['Baking soda', 'condiments'],
    ['Peanut butter cups', 'snacks'],
    ['Rice milk', 'drinks'],
    ['Coconut milk beverage', 'drinks'],
    ['Coconut milk', 'canned'],
    ['Cauliflower rice', 'produce'],
    ['Zucchini noodles', 'produce'],
    ['Runner beans', 'produce'],
    ['Frozen green beans', 'produce'],
    ['Coffee creamer', 'dairy'],
    ['Chicken stock', 'canned'],
    ['Puff pastry', 'bakery'],
    ['Bean burgers', 'other'],
    ['Mac and cheese', 'leftovers'],
    ['Potato salad', 'leftovers'],
    ['Spring rolls', 'other'],
    ['Sweet potato fries', 'other'],
    // A word at the front decides.
    ['Tinned tomatoes', 'canned'],
    ['Canned peaches', 'canned'],
    ['Canned tomato soup', 'canned'],
    ['Sardines in olive oil', 'canned'],
    ['Pickled onions', 'condiments'],
    ['Dried apricots', 'snacks'],
    ['Dried oregano', 'condiments'],
    ['Frozen lasagna', 'other'],
    ['Leftover chicken', 'leftovers'],
    ['Veggie sausages', 'other'],
    ['Vegan mince', 'other'],
    // Unknown food stays unknown.
    ['Widget', 'other'],
  ] as const)('%s -> %s', (name, category) => {
    expect(guessCategory(name)).toBe(category);
  });
});

describe('scanned food', () => {
  it('keeps the usual category for a food the app knows, whatever the scan said', () => {
    const drafts = toDrafts(
      {
        items: [
          { name: 'Oat milk', category: 'dairy', quantity: '1', shelfLifeDays: 7, labelExpiryDate: null, confidence: 'high' },
          { name: 'Gochujang', category: 'condiments', quantity: '1', shelfLifeDays: 90, labelExpiryDate: null, confidence: 'high' },
          { name: 'Mystery jar', category: 'nonsense' as Category, quantity: '1', shelfLifeDays: null, labelExpiryDate: null, confidence: 'low' },
        ],
      },
      'fridge',
      [],
      NOW,
    );
    expect(drafts.map((d) => [d.name, d.category])).toEqual([
      ['Oat milk', 'drinks'],
      ['Gochujang', 'condiments'],
      ['Mystery jar', 'other'],
    ]);
  });
});
