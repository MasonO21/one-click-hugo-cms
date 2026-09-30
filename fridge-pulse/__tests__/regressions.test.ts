/**
 * One test per bug found in the full-app review, so none of them comes back.
 */
import { expiryLabel, wasteStats } from '../src/lib/expiry';
import { filterForDiet, localSuggestions, matchTracked, suggestionKey, uniqueUses } from '../src/lib/meals';
import { mk, NOW } from '../test-utils/helpers';

describe('diet filters recognise every food the app suggests', () => {
  it.each(['Penne', 'Macaroni', 'Baguette', 'Sourdough bread', 'Croissants', 'Breadcrumbs', 'Brioche', 'Pizza dough', 'Naan', 'Bagels'])(
    'keeps %s away from a gluten-free diet',
    (name) => {
      expect(filterForDiet([mk('1', name, '2026-10-01', { category: 'bakery' })], 'gluten-free')).toEqual([]);
    },
  );

  it('does not treat rice noodles or corn tortillas as gluten', () => {
    const items = [mk('1', 'Rice noodles', '2026-10-01', { category: 'grains' }), mk('2', 'Corn tortillas', '2026-10-01', { category: 'bakery' })];
    expect(filterForDiet(items, 'gluten-free')).toHaveLength(2);
  });

  it('does not treat peanut or almond butter as dairy', () => {
    const items = [mk('1', 'Peanut butter', '2026-10-30', { category: 'condiments' }), mk('2', 'Almond butter', '2026-10-30', { category: 'condiments' })];
    expect(filterForDiet(items, 'vegan')).toHaveLength(2);
    expect(filterForDiet(items, 'dairy-free')).toHaveLength(2);
    expect(filterForDiet([mk('3', 'Butter', '2026-10-30', { category: 'dairy' })], 'vegan')).toEqual([]);
  });

  it('keeps fish and shellfish away from vegetarians wherever they are filed', () => {
    const items = [mk('1', 'Anchovies', '2027-01-01', { category: 'canned' }), mk('2', 'Fish sauce', '2027-01-01', { category: 'condiments' })];
    expect(filterForDiet(items, 'vegetarian')).toEqual([]);
  });

  it('never offers French toast to a gluten-free cook with a baguette', () => {
    const items = [mk('1', 'Baguette', '2026-09-30', { category: 'bakery' }), mk('2', 'Eggs', '2026-10-10', { category: 'dairy' }), mk('3', 'Milk', '2026-10-02', { category: 'dairy' })];
    const ideas = localSuggestions(items, { diet: 'gluten-free', servings: 2 }, NOW);
    expect(ideas.map((m) => m.title)).not.toContain('French toast');
  });
});

describe('meal ingredients', () => {
  it('never matches every ingredient to an item whose name was cleared', () => {
    const items = [mk('1', '', '2026-10-01'), mk('2', 'Eggs', '2026-10-01')];
    expect(matchTracked('Eggs', items)?.id).toBe('2');
    expect(matchTracked('Tomatoes', items)).toBeUndefined();
    expect(matchTracked('', items)).toBeUndefined();
  });

  it('lists each ingredient once', () => {
    expect(uniqueUses(['Carrots', 'carrots ', 'Onions', ''])).toEqual(['Carrots', 'Onions']);
  });

  it('asks for new ideas when an item is renamed or recategorised', () => {
    const before = [mk('1', 'Chicken thighs', '2026-10-01', { category: 'meat' })];
    const after = [mk('1', 'Tofu', '2026-10-01', { category: 'other' })];
    const prefs = { diet: 'none' as const, servings: 2 };
    expect(suggestionKey(before, prefs, NOW)).not.toBe(suggestionKey(after, prefs, NOW));
  });
});

describe('rescued food', () => {
  it('only counts food used before its date passed', () => {
    const since = '2026-09-01';
    const items = [
      mk('1', 'Milk', '2026-09-20', { status: 'used', resolvedOn: '2026-09-19' }), // used the day before: rescued
      mk('2', 'Yogurt', '2026-09-10', { status: 'used', resolvedOn: '2026-09-25' }), // used 15 days late: not a rescue
      mk('3', 'Rice', '2027-09-10', { status: 'used', resolvedOn: '2026-09-25' }), // nowhere near its date: just used
    ];
    expect(wasteStats(items, since)).toEqual({ used: 3, wasted: 0, rescued: 1 });
  });
});

describe('expiry wording', () => {
  it('does not count very long dates in months', () => {
    expect(expiryLabel(300)).toBe('In 10 months');
    expect(expiryLabel(720)).toBe('In over a year');
  });
});
