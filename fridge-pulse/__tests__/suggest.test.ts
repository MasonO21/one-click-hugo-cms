import { emojiFor, LOCATIONS } from '../src/components/categories';
import { FOOD_CATALOG } from '../src/lib/foodCatalog';
import { estimateShelfLifeDays } from '../src/lib/shelfLife';
import { exactSuggestion, fold, historyFrom, keepsLabel, prefixDistance, suggestFoods } from '../src/lib/suggest';
import { CATEGORIES, type PantryItem } from '../src/lib/types';

const names = (typed: string, opts?: Parameters<typeof suggestFoods>[1]) => suggestFoods(typed, opts).map((s) => s.name);

const item = (name: string, addedOn: string, patch: Partial<PantryItem> = {}): PantryItem => ({
  id: `${name}-${addedOn}`,
  name,
  category: 'other',
  quantity: '1',
  location: 'fridge',
  addedOn,
  expiresOn: addedOn,
  expirySource: 'estimate',
  status: 'active',
  ...patch,
});

describe('suggestFoods', () => {
  it('suggests nothing until something is typed', () => {
    expect(suggestFoods('')).toEqual([]);
    expect(suggestFoods('   ')).toEqual([]);
  });

  it('completes the start of a name and marks the typed part', () => {
    const [first] = suggestFoods('straw');
    expect(first.name).toBe('Strawberries');
    expect(first.matches).toEqual([[0, 5]]);
  });

  it('puts an exact match first, then foods where a later word matches', () => {
    const list = suggestFoods('milk');
    expect(list[0].name).toBe('Milk');
    expect(list.map((s) => s.name)).toEqual(expect.arrayContaining(['Oat milk', 'Whole milk']));
    const oat = list.find((s) => s.name === 'Oat milk')!;
    expect('Oat milk'.slice(...oat.matches[0])).toBe('milk');
  });

  it('matches several typed words against the words of a name', () => {
    const [greek] = suggestFoods('gr yo');
    expect(greek.name).toBe('Greek yogurt');
    expect(greek.matches).toEqual([
      [0, 2],
      [6, 8],
    ]);
    expect(names('chicken b')).toEqual(['Chicken breast', 'Chicken broth']);
  });

  it.each([
    ['brocoli', 'Broccoli'],
    ['avacado', 'Avocados'],
    ['bannana', 'Bananas'],
    ['chiken', 'Chicken'],
    ['yoghurt', 'Yogurt'],
    ['zuchini', 'Zucchini'],
    ['letuce', 'Lettuce'],
    ['chikcen', 'Chicken'],
  ])('forgives the typo "%s" and offers %s', (typed, expected) => {
    expect(names(typed)[0]).toBe(expected);
  });

  it('only guesses at typos when nothing matches as typed', () => {
    // "pear" matches Pears as typed, so near misses such as Peas are not offered.
    const list = names('pear');
    expect(list[0]).toBe('Pears');
    for (const name of list) expect(fold(name)).toContain('pear');
  });

  it('ignores accents and case, and highlights the right letters', () => {
    expect(names('jalapeno')).toEqual(['Jalapeños']);
    const [creme] = suggestFoods('CREME');
    expect(creme.name).toBe('Crème fraîche');
    expect(creme.name.slice(...creme.matches[0])).toBe('Crème');
  });

  it('keeps one- and two-letter suggestions to names that start that way', () => {
    for (const typed of ['t', 'b', 'p', 'ch']) {
      for (const name of names(typed)) expect(fold(name).startsWith(typed)).toBe(true);
    }
  });

  it('does not offer foods that merely contain a short fragment', () => {
    expect(names('ice')).toEqual(['Ice cream', 'Iced tea', 'Iceberg lettuce']);
    expect(names('ice')).not.toContain('Rice');
    // Longer fragments inside words are useful.
    expect(names('berr')).toEqual(expect.arrayContaining(['Blueberries', 'Strawberries', 'Raspberries']));
  });

  it('shows at most five suggestions unless told otherwise', () => {
    expect(names('c')).toHaveLength(5);
    expect(names('c', { limit: 2 })).toHaveLength(2);
  });

  it('returns nothing for text that is not food', () => {
    expect(suggestFoods('xyzzy')).toEqual([]);
    expect(suggestFoods('(')).toEqual([]);
  });

  it('puts foods the person adds often ahead of the catalog', () => {
    const history = historyFrom([
      item('Oat milk', '2026-09-20', { status: 'used' }),
      item('Oat milk', '2026-09-27'),
      item("Grandma's jam", '2026-09-01', { category: 'condiments' }),
    ]);
    const m = suggestFoods('m', { history });
    expect(m[0]).toMatchObject({ name: 'Oat milk', fromHistory: true });
    // Their own foods are suggested even when the catalog does not know them.
    expect(suggestFoods('gra', { history })[0]).toMatchObject({ name: "Grandma's jam", category: 'condiments', fromHistory: true });
    // An apostrophe does not start a new word, so "s" does not find "Grandma's".
    expect(names('s', { history })).not.toContain("Grandma's jam");
  });

  it('merges a food they have added with the same catalog food, keeping their spelling', () => {
    const history = historyFrom([item('whole milk', '2026-09-27', { category: 'dairy' })]);
    const list = suggestFoods('whole', { history });
    expect(list.filter((s) => fold(s.name) === 'whole milk')).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'whole milk', fromHistory: true });
  });

  it('skips foods already on the list being built', () => {
    expect(names('milk', { exclude: ['MILK', 'Oat milk'] })).not.toEqual(expect.arrayContaining(['Milk']));
    expect(names('milk', { exclude: ['MILK', 'Oat milk'] })).not.toContain('Oat milk');
  });

  it('says where frozen foods belong', () => {
    expect(suggestFoods('ice cream')[0]).toMatchObject({ name: 'Ice cream', keptIn: 'freezer' });
    expect(suggestFoods('frozen peas')[0]).toMatchObject({ name: 'Frozen peas', keptIn: 'freezer' });
    expect(suggestFoods('milk')[0].keptIn).toBeUndefined();
  });
});

describe('historyFrom', () => {
  it('counts repeats and keeps the most recent spelling and category', () => {
    const history = historyFrom([
      item('oat milk', '2026-09-01', { category: 'dairy' }),
      item('Oat Milk ', '2026-09-20', { category: 'drinks' }),
      item('Eggs', '2026-09-10'),
    ]);
    expect(history).toHaveLength(2);
    expect(history.find((h) => h.count === 2)).toEqual({ name: 'Oat Milk', category: 'drinks', count: 2, lastAdded: '2026-09-20' });
  });
});

describe('helpers', () => {
  it('finds the suggestion that is exactly what was typed', () => {
    const list = suggestFoods('milk');
    expect(exactSuggestion(' MILK ', list)?.name).toBe('Milk');
    expect(exactSuggestion('mil', list)).toBeUndefined();
  });

  it('measures typos against the start of a word', () => {
    expect(prefixDistance('brocoli', 'broccoli')).toBe(1);
    expect(prefixDistance('chikcen', 'chicken breast')).toBe(1);
    expect(prefixDistance('milk', 'milk chocolate')).toBe(0);
    expect(prefixDistance('xyz', 'milk')).toBe(3);
  });

  it.each([
    [0, 'Best used today'],
    [1, 'Keeps about 1 day'],
    [5, 'Keeps about 5 days'],
    [21, 'Keeps about 3 weeks'],
    [60, 'Keeps about 2 months'],
    [540, 'Keeps a year or more'],
  ])('describes %i days as "%s"', (days, label) => {
    expect(keepsLabel(days)).toBe(label);
  });
});

describe('food catalog', () => {
  it('has each food once, with a valid category and a tidy name', () => {
    const seen = new Set<string>();
    for (const food of FOOD_CATALOG) {
      const key = fold(food.name);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      expect(CATEGORIES).toContain(food.category);
      expect(food.name).toBe(food.name.trim());
      expect(food.name.length).toBeLessThanOrEqual(30);
      expect(food.name[0]).toMatch(/[A-Z0-9]/);
    }
    expect(FOOD_CATALOG.length).toBeGreaterThan(350);
  });

  it('gives every food a plausible estimate wherever it is kept', () => {
    for (const food of FOOD_CATALOG) {
      for (const location of LOCATIONS) {
        const days = estimateShelfLifeDays(food.name, food.category, location);
        expect(days).toBeGreaterThanOrEqual(0);
        expect(days).toBeLessThanOrEqual(730);
      }
      // Only frozen desserts are "use today" in the fridge.
      if (food.keptIn !== 'freezer') expect(estimateShelfLifeDays(food.name, food.category, 'fridge')).toBeGreaterThan(0);
      else expect(estimateShelfLifeDays(food.name, food.category, 'freezer')).toBeGreaterThanOrEqual(30);
    }
  });

  it('shows every food with a glyph', () => {
    for (const food of FOOD_CATALOG) expect(emojiFor(food.name, food.category).length).toBeGreaterThan(0);
  });
});
