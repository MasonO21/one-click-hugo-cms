import { draftToItem, reconcile, toDrafts } from '../src/lib/scan';
import { estimateShelfLifeDays, guessCategory } from '../src/lib/shelfLife';
import { mk, NOW } from '../test-utils/helpers';

describe('shelf life', () => {
  it('uses specific rules before category defaults', () => {
    expect(estimateShelfLifeDays('Baby spinach', 'produce', 'fridge')).toBe(5);
    expect(estimateShelfLifeDays('Cheddar cheese', 'dairy', 'fridge')).toBe(21);
    expect(estimateShelfLifeDays('Ground beef', 'meat', 'fridge')).toBe(2);
    expect(estimateShelfLifeDays('Chicken thighs', 'meat', 'freezer')).toBe(270);
  });

  it('matches rules on whole words', () => {
    // "cream cheese" must not be treated as "cheese" (hard cheese, 21 days).
    expect(estimateShelfLifeDays('Cream cheese', 'dairy', 'fridge')).toBe(14);
  });

  it('falls back to a conservative category figure for foods no rule knows', () => {
    // Most produce wilts within a day out of the fridge.
    expect(estimateShelfLifeDays('Dragon fruit', 'produce', 'pantry')).toBe(1);
    expect(estimateShelfLifeDays('Mystery jar', 'other', 'fridge')).toBe(7);
    // A can of anything keeps for years unopened, whatever fresh food it contains.
    expect(estimateShelfLifeDays('Peaches', 'canned', 'pantry')).toBe(730);
    expect(estimateShelfLifeDays('Peaches', 'produce', 'pantry')).toBe(2);
  });

  // Prepared and processed foods used to match the ingredient in their name. Each row here was wrong
  // before (leftover pasta kept a year, peanut butter two days in the pantry, fish sauce two days).
  it.each([
    ['Leftover pasta', 'leftovers', 'fridge', 4],
    ['Leftover rice', 'leftovers', 'fridge', 4],
    ['Pasta salad', 'leftovers', 'fridge', 4],
    ['Pasta sauce', 'condiments', 'fridge', 4],
    ['Peanut butter', 'condiments', 'pantry', 90],
    ['Fish sauce', 'condiments', 'fridge', 365],
    ['Red wine vinegar', 'condiments', 'fridge', 730],
    ['Milk chocolate', 'snacks', 'pantry', 180],
    ['Chocolate milk', 'dairy', 'fridge', 7],
    ['Almond milk', 'dairy', 'fridge', 7],
    ['Egg noodles', 'grains', 'pantry', 365],
    ['Orange juice', 'drinks', 'fridge', 7],
    ['Canned tomatoes', 'canned', 'pantry', 540],
    ['Green onions', 'produce', 'fridge', 7],
    ['Sugar snap peas', 'produce', 'fridge', 4],
    ['Black pepper', 'condiments', 'pantry', 730],
    ['Pepper jack', 'dairy', 'fridge', 21],
    ['Turkey bacon', 'meat', 'fridge', 7],
    ['Tuna steak', 'seafood', 'fridge', 2],
    ['Crab cakes', 'seafood', 'fridge', 2],
    ['Hot dog buns', 'bakery', 'pantry', 4],
    ['Garlic bread', 'bakery', 'fridge', 4],
    ['Spaghetti squash', 'produce', 'pantry', 60],
    ['Rice cakes', 'snacks', 'pantry', 14],
    ['Potato chips', 'snacks', 'pantry', 14],
    ['Ice cream', 'dairy', 'freezer', 60],
    ['Ice cream', 'dairy', 'fridge', 0],
    ['Frozen peas', 'produce', 'freezer', 300],
    ['Sushi', 'leftovers', 'fridge', 1],
    ['Red wine', 'drinks', 'fridge', 4],
  ] as const)('%s in the %s keeps about the right time', (name, category, location, days) => {
    expect(estimateShelfLifeDays(name, category, location)).toBe(days);
  });

  it('guesses categories for typed items', () => {
    expect(guessCategory('Greek yogurt')).toBe('dairy');
    expect(guessCategory('Chicken breast')).toBe('meat');
    expect(guessCategory('Sourdough bread')).toBe('bakery');
    expect(guessCategory('Widget')).toBe('other');
    expect(guessCategory('Peanut butter')).toBe('condiments');
    expect(guessCategory('Unsalted butter')).toBe('dairy');
    expect(guessCategory('Egg noodles')).toBe('grains');
    expect(guessCategory('Ice cream')).toBe('dairy');
    expect(guessCategory('Fish sauce')).toBe('condiments');
    expect(guessCategory("Grandma's chutney")).toBe('condiments');
  });
});

describe('AI estimates are held to food-safety guidance', () => {
  const base = { quantity: '1', confidence: 'high' as const, labelExpiryDate: null };

  it('never lets the AI give a known food longer than guidance in the fridge or freezer', () => {
    const [chicken, beef] = toDrafts(
      { items: [{ ...base, name: 'Chicken thighs', category: 'meat', shelfLifeDays: 10 }, { ...base, name: 'Ground beef', category: 'meat', shelfLifeDays: 400 }] },
      'fridge',
      [],
      NOW,
    );
    expect(chicken.expiresOn).toBe('2026-10-01'); // 2 days, not 10
    expect(beef.expiresOn).toBe('2026-10-01');
    expect(reconcile(400, 'Ground beef', 'meat', 'freezer')).toBe(120);
  });

  it('keeps a shorter AI estimate, because the photo can show food past its best', () => {
    expect(reconcile(1, 'Baby spinach', 'produce', 'fridge')).toBe(1);
  });

  it('trusts the AI for foods it cannot check, and in the cupboard where a jar may be unopened', () => {
    expect(reconcile(9, 'Dragon fruit', 'produce', 'fridge')).toBe(9);
    expect(reconcile(365, 'Pasta sauce', 'condiments', 'pantry')).toBe(365);
  });
});

describe('toDrafts', () => {
  const base = { quantity: '1', confidence: 'high' as const, shelfLifeDays: 5, labelExpiryDate: null };

  it('uses a legible label date over the estimate', () => {
    const [d] = toDrafts({ items: [{ ...base, name: 'milk', category: 'dairy', labelExpiryDate: '2026-10-04' }] }, 'fridge', [], NOW);
    expect(d.expiresOn).toBe('2026-10-04');
    expect(d.expirySource).toBe('label');
    expect(d.name).toBe('Milk');
  });

  it('ignores label dates that are implausible and falls back to the estimate', () => {
    const drafts = toDrafts(
      {
        items: [
          { ...base, name: 'Yogurt', category: 'dairy', labelExpiryDate: '2019-05-01', shelfLifeDays: 10 },
          { ...base, name: 'Jam', category: 'condiments', labelExpiryDate: '2099-01-01', shelfLifeDays: 90 },
          { ...base, name: 'Butter', category: 'dairy', labelExpiryDate: '2026-02-30', shelfLifeDays: 30 },
        ],
      },
      'fridge',
      [],
      NOW,
    );
    expect(drafts.map((d) => [d.expiresOn, d.expirySource])).toEqual([
      ['2026-10-09', 'estimate'],
      ['2026-12-28', 'estimate'],
      ['2026-10-29', 'estimate'],
    ]);
  });

  it('keeps a label date that is only slightly past (item really is expired)', () => {
    const [d] = toDrafts({ items: [{ ...base, name: 'Cream', category: 'dairy', labelExpiryDate: '2026-09-25' }] }, 'fridge', [], NOW);
    expect(d.expiresOn).toBe('2026-09-25');
  });

  it('estimates when the model gave no shelf life', () => {
    const [d] = toDrafts({ items: [{ ...base, name: 'Baby spinach', category: 'produce', shelfLifeDays: null }] }, 'fridge', [], NOW);
    expect(d.expiresOn).toBe('2026-10-04');
  });

  it('coerces bad categories and clamps absurd shelf lives', () => {
    const drafts = toDrafts(
      {
        items: [
          { ...base, name: 'Thing', category: 'gadgets' as never, shelfLifeDays: 99999 },
          { ...base, name: 'Other', category: 'other', shelfLifeDays: -4 },
        ],
      },
      'pantry',
      [],
      NOW,
    );
    expect(drafts[0].category).toBe('other');
    expect(drafts[0].expiresOn).toBe('2028-09-28'); // capped at 730 days
    expect(drafts[1].expiresOn).toBe('2026-09-29'); // floored at today
  });

  it('drops blank names, repeated names, and over-long names', () => {
    const drafts = toDrafts(
      {
        items: [
          { ...base, name: '   ', category: 'other' },
          { ...base, name: 'Milk', category: 'dairy' },
          { ...base, name: ' milk ', category: 'dairy' },
          { ...base, name: 'x'.repeat(200), category: 'other' },
        ],
      },
      'fridge',
      [],
      NOW,
    );
    expect(drafts.map((d) => d.name)).toEqual(['Milk']);
  });

  it('flags items already tracked in the same location and leaves them unselected', () => {
    const existing = [mk('a', 'Milk', '2026-10-02'), mk('b', 'Rice', '2027-01-01', { location: 'pantry' })];
    const drafts = toDrafts(
      { items: [{ ...base, name: 'Milk', category: 'dairy' }, { ...base, name: 'Rice', category: 'grains' }] },
      'fridge',
      existing,
      NOW,
    );
    expect(drafts.map((d) => [d.name, d.duplicate, d.selected])).toEqual([
      ['Milk', true, false],
      ['Rice', false, true], // tracked in the pantry, not the fridge
    ]);
  });

  it('turns a draft into an active item stamped with today', () => {
    const [d] = toDrafts({ items: [{ ...base, name: 'Eggs', category: 'dairy' }] }, 'fridge', [], NOW);
    const item = draftToItem(d, 'id-1', NOW);
    expect(item).toMatchObject({ id: 'id-1', name: 'Eggs', status: 'active', addedOn: '2026-09-29', location: 'fridge' });
  });
});
