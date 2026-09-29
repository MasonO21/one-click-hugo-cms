import { toDrafts, draftToItem } from '../src/lib/scan';
import { estimateShelfLifeDays, guessCategory } from '../src/lib/shelfLife';
import { mk, NOW } from '../test-utils/helpers';

describe('shelf life', () => {
  it('uses specific rules before category defaults', () => {
    expect(estimateShelfLifeDays('Baby spinach', 'produce', 'fridge')).toBe(5);
    expect(estimateShelfLifeDays('Cheddar cheese', 'dairy', 'fridge')).toBe(42);
    expect(estimateShelfLifeDays('Ground beef', 'meat', 'fridge')).toBe(2);
    expect(estimateShelfLifeDays('Chicken thighs', 'meat', 'freezer')).toBe(270);
  });

  it('matches rules on whole words', () => {
    // "cream cheese" must not be treated as "cheese" (hard cheese, 42 days).
    expect(estimateShelfLifeDays('Cream cheese', 'dairy', 'fridge')).toBe(14);
  });

  it('falls back to the category default when a rule has no figure for that location', () => {
    // The mushroom rule only defines a fridge figure.
    expect(estimateShelfLifeDays('Mushrooms', 'produce', 'pantry')).toBe(5);
    expect(estimateShelfLifeDays('Mystery jar', 'other', 'fridge')).toBe(14);
  });

  it('guesses categories for typed items', () => {
    expect(guessCategory('Greek yogurt')).toBe('dairy');
    expect(guessCategory('Chicken breast')).toBe('meat');
    expect(guessCategory('Sourdough bread')).toBe('bakery');
    expect(guessCategory('Widget')).toBe('other');
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
