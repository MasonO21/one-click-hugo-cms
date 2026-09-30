import { computeImpact, isRescue, MILESTONES, NO_LIFETIME } from '../src/lib/impact';
import { freezeRescueDays, usualPlace } from '../src/lib/shelfLife';
import { buyAgain, shoppingText } from '../src/lib/shopping';
import { storageTips } from '../src/lib/tips';
import { FOOD_CATALOG } from '../src/lib/foodCatalog';
import { resolveMessage, wouldRescue } from '../src/store/actions';
import { mk, NOW } from '../test-utils/helpers';

jest.mock('@react-native-async-storage/async-storage', () => {
  const data = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (k: string) => data.get(k) ?? null,
      setItem: async (k: string, v: string) => void data.set(k, v),
      removeItem: async (k: string) => void data.delete(k),
    },
  };
});

describe('impact', () => {
  const today = '2026-09-29';
  const items = [
    mk('1', 'Milk', '2026-09-30', { status: 'used', resolvedOn: '2026-09-29' }), // used a day early: rescue, today
    mk('2', 'Rice', '2027-06-01', { status: 'used', resolvedOn: '2026-09-28' }), // used, not a rescue
    mk('3', 'Spinach', '2026-09-20', { status: 'wasted', resolvedOn: '2026-09-21' }),
    mk('4', 'Old yogurt', '2026-07-01', { status: 'used', resolvedOn: '2026-07-01' }), // outside 30 days
  ];

  it('counts rescues, uses and waste in the last 30 days', () => {
    const i = computeImpact(items, { ...NO_LIFETIME, rescued: 2, used: 3, wasted: 1, startedOn: '2026-06-01', lastWastedOn: '2026-09-21' }, NOW);
    expect(i).toMatchObject({ rescuedRecently: 1, usedRecently: 2, wastedRecently: 1 });
  });

  it('counts the no-waste streak from the last thing thrown out, or from the start', () => {
    expect(computeImpact([], { ...NO_LIFETIME, startedOn: '2026-09-01', lastWastedOn: '2026-09-21' }, NOW).streakDays).toBe(8);
    expect(computeImpact([], { ...NO_LIFETIME, startedOn: '2026-09-19', lastWastedOn: null }, NOW).streakDays).toBe(10);
    expect(computeImpact([], NO_LIFETIME, NOW).streakDays).toBe(0);
  });

  it('draws the last seven days, today last', () => {
    const { week } = computeImpact(items, NO_LIFETIME, NOW);
    expect(week).toHaveLength(7);
    expect(week[6]).toMatchObject({ day: today, used: 1, wasted: 0 });
    expect(week[5]).toMatchObject({ day: '2026-09-28', used: 1 });
    expect(week.reduce((n, d) => n + d.wasted, 0)).toBe(0); // the waste was 8 days ago
  });

  it('points at the next rescue milestone', () => {
    expect(computeImpact([], { ...NO_LIFETIME, rescued: 0 }, NOW)).toMatchObject({ nextMilestone: 1, lastMilestone: null });
    expect(computeImpact([], { ...NO_LIFETIME, rescued: 7 }, NOW)).toMatchObject({ nextMilestone: 10, lastMilestone: 5 });
    expect(computeImpact([], { ...NO_LIFETIME, rescued: MILESTONES[MILESTONES.length - 1]! }, NOW).nextMilestone).toBeNull();
  });

  it('calls it a rescue only when used on time, in the last three days', () => {
    expect(isRescue({ status: 'used', resolvedOn: '2026-09-29', expiresOn: '2026-10-02' })).toBe(true);
    expect(isRescue({ status: 'used', resolvedOn: '2026-09-29', expiresOn: '2026-10-03' })).toBe(false);
    expect(isRescue({ status: 'used', resolvedOn: '2026-09-29', expiresOn: '2026-09-28' })).toBe(false);
    expect(isRescue({ status: 'wasted', resolvedOn: '2026-09-29', expiresOn: '2026-09-30' })).toBe(false);
  });
});

describe('the message after using or tossing food', () => {
  const today = '2026-09-29';
  it('celebrates a rescue and names the food', () => {
    expect(resolveMessage([{ name: 'Chicken thighs', expiresOn: '2026-09-30' }], 'used', undefined, today)).toBe('Nice save! Chicken thighs rescued');
    expect(resolveMessage([{ name: 'Rice', expiresOn: '2027-01-01' }], 'used', undefined, today)).toBe('Rice marked as used');
    expect(resolveMessage([{ name: 'Spinach', expiresOn: '2026-09-28' }], 'wasted', undefined, today)).toBe('Spinach thrown out');
  });

  it('summarises a meal', () => {
    const used = [
      { name: 'Eggs', expiresOn: '2026-10-20' },
      { name: 'Milk', expiresOn: '2026-09-30' },
    ];
    expect(resolveMessage(used, 'used', 'French toast', today)).toBe('2 items used in French toast, 1 rescued');
  });

  it('does not count food past its date as rescued', () => {
    expect(wouldRescue({ expiresOn: '2026-09-28' }, today)).toBe(false);
    expect(wouldRescue({ expiresOn: '2026-09-29' }, today)).toBe(true);
  });
});

describe('where food usually goes', () => {
  it.each([
    ['Bananas', 'produce', 'pantry'],
    ['Potatoes', 'produce', 'pantry'],
    ['Tomatoes', 'produce', 'pantry'],
    ['Cherry tomatoes', 'produce', 'fridge'],
    ['Lettuce', 'produce', 'fridge'],
    ['Milk', 'dairy', 'fridge'],
    ['Chicken breast', 'meat', 'fridge'],
    ['Frozen peas', 'produce', 'freezer'],
    ['Ice cream', 'dairy', 'freezer'],
    ['Pasta', 'grains', 'pantry'],
    ['Canned tuna', 'canned', 'pantry'],
    ['Hummus', 'condiments', 'fridge'],
    ['Ketchup', 'condiments', 'pantry'],
    ['Orange juice', 'drinks', 'fridge'],
    ['Beer', 'drinks', 'pantry'],
    ['Bread', 'bakery', 'pantry'],
    ['Cheesecake', 'bakery', 'fridge'],
    ['Tofu', 'other', 'fridge'],
  ] as const)('%s goes in the %s', (name, category, place) => {
    expect(usualPlace(name, category)).toBe(place);
  });
});

describe('freezing as a rescue', () => {
  it('is offered for food due soon that freezes well', () => {
    expect(freezeRescueDays({ name: 'Chicken thighs', category: 'meat', location: 'fridge' }, 1)).toBe(270);
    expect(freezeRescueDays({ name: 'Sourdough bread', category: 'bakery', location: 'pantry' }, 0)).toBe(90);
  });

  it('is not offered when freezing would ruin it, it is already frozen, or it is not due yet', () => {
    expect(freezeRescueDays({ name: 'Lettuce', category: 'produce', location: 'fridge' }, 1)).toBeNull();
    expect(freezeRescueDays({ name: 'Eggs', category: 'dairy', location: 'fridge' }, 1)).toBeNull();
    expect(freezeRescueDays({ name: 'Chicken thighs', category: 'meat', location: 'freezer' }, 1)).toBeNull();
    expect(freezeRescueDays({ name: 'Chicken thighs', category: 'meat', location: 'fridge' }, 6)).toBeNull();
    expect(freezeRescueDays({ name: 'Chicken thighs', category: 'meat', location: 'fridge' }, -1)).toBeNull();
    expect(freezeRescueDays({ name: 'Rice', category: 'grains', location: 'pantry' }, 2)).toBeNull();
  });
});

describe('storage tips', () => {
  it('gives the key food-safety advice', () => {
    expect(storageTips('Chicken thighs', 'meat', 'fridge')[0]).toMatch(/bottom shelf.*1 to 2 days/);
    expect(storageTips('Eggs', 'dairy', 'pantry')[0]).toMatch(/must be kept in the fridge/);
    expect(storageTips('Leftover curry', 'leftovers', 'fridge')[0]).toMatch(/within 2 hours.*165°F/);
    expect(storageTips('Sweet potatoes', 'produce', 'pantry')[0]).toMatch(/not the fridge/);
    expect(storageTips('Lettuce', 'produce', 'freezer').join(' ')).toMatch(/does not freeze well/);
    expect(storageTips('Black beans', 'canned', 'pantry')[0]).toMatch(/bulging/);
    expect(storageTips('Mayonnaise', 'condiments', 'pantry')[0]).toBe('Once opened, keep it in the fridge.');
  });

  it('never gives more than two, for any food anywhere', () => {
    for (const f of FOOD_CATALOG) {
      for (const loc of ['fridge', 'freezer', 'pantry'] as const) expect(storageTips(f.name, f.category, loc).length).toBeLessThanOrEqual(2);
    }
  });
});

describe('shopping helpers', () => {
  it('suggests buying again what was finished and is not in stock or on the list', () => {
    const items = [
      mk('1', 'Milk', '2026-09-25', { status: 'used', resolvedOn: '2026-09-25' }),
      mk('2', 'Milk', '2026-09-18', { status: 'used', resolvedOn: '2026-09-18' }),
      mk('3', 'Eggs', '2026-09-20', { status: 'used', resolvedOn: '2026-09-20' }),
      mk('4', 'Eggs', '2026-10-20'), // bought again already
      mk('5', 'Bread', '2026-09-26', { status: 'wasted', resolvedOn: '2026-09-26' }),
      mk('6', 'Butter', '2026-08-01', { status: 'used', resolvedOn: '2026-08-01' }), // too long ago
    ];
    expect(buyAgain(items, [], '2026-08-30').map((b) => b.name)).toEqual(['Milk', 'Bread']);
    expect(buyAgain(items, ['milk'], '2026-08-30').map((b) => b.name)).toEqual(['Bread']);
  });

  it('shares the list as plain text', () => {
    expect(shoppingText(['Milk', 'Eggs'])).toBe('Shopping list\n• Milk\n• Eggs');
  });
});
