import { computeLocalEntitlement, isUnlocked, NO_ENTITLEMENT, TRIAL_DAYS } from '../src/billing/trial';
import { filterForDiet, localSuggestions, mealScore, rankMeals, suggestionKey, suggestible, urgencyWeight } from '../src/lib/meals';
import { buildDigests, buildTrialReminder, needsAttention } from '../src/lib/reminders';
import type { Meal } from '../src/lib/types';
import { mk, NOW } from '../test-utils/helpers';

describe('reminders', () => {
  it('schedules a tomorrow heads-up and a day-of nudge for the same item', () => {
    const digests = buildDigests([mk('1', 'Spinach', '2026-10-01', { category: 'produce' })], NOW, { hour: 9 });
    expect(digests.map((d) => [d.fireAt.getDate(), d.fireAt.getMonth(), d.body])).toEqual([
      [30, 8, 'Spinach tomorrow. Tap for meal ideas.'],
      [1, 9, 'Spinach today. Tap for meal ideas.'],
    ]);
    expect(digests[0].title).toBe('1 item needs using up');
  });

  it('skips reminder times that have already passed today', () => {
    // NOW is 10:00 on the 29th; a 9:00 reminder for today is in the past.
    const digests = buildDigests([mk('1', 'Milk', '2026-09-29')], NOW, { hour: 9 });
    expect(digests).toHaveLength(0);
    const later = buildDigests([mk('1', 'Milk', '2026-09-29')], NOW, { hour: 18 });
    expect(later).toHaveLength(1);
    expect(later[0].body).toContain('Milk today');
  });

  it('groups several items and truncates the list', () => {
    const items = ['Apples', 'Bread', 'Cheese', 'Dates', 'Eggs'].map((n, i) => mk(String(i), n, '2026-10-01'));
    const [first] = buildDigests(items, NOW, { hour: 9 });
    expect(first.title).toBe('5 items need using up');
    expect(first.body).toBe('Apples tomorrow · Bread tomorrow · Cheese tomorrow · +2 more. Tap for meal ideas.');
    expect(first.itemIds).toHaveLength(5);
  });

  it('ignores used items and items outside the horizon', () => {
    const items = [
      mk('1', 'Used', '2026-10-01', { status: 'used', resolvedOn: '2026-09-29' }),
      mk('2', 'Far away', '2027-03-01'),
    ];
    expect(buildDigests(items, NOW, { hour: 9 })).toHaveLength(0);
  });

  it('never exceeds the platform cap on pending notifications', () => {
    const items = Array.from({ length: 200 }, (_, i) => mk(String(i), `Item ${i}`, `2026-10-${String((i % 14) + 1).padStart(2, '0')}`));
    expect(buildDigests(items, NOW, { hour: 9, horizonDays: 14 }).length).toBeLessThanOrEqual(15);
  });

  it('flags items needing attention within 2 days, including expired ones', () => {
    const list = needsAttention(
      [mk('1', 'a', '2026-09-27'), mk('2', 'b', '2026-10-01'), mk('3', 'c', '2026-10-02')],
      NOW,
    );
    expect(list.map((i) => i.id)).toEqual(['1', '2']);
  });
});

describe('meals', () => {
  const fridge = [
    mk('1', 'Eggs', '2026-10-12', { category: 'dairy' }),
    mk('2', 'Spinach', '2026-09-30', { category: 'produce' }),
    mk('3', 'Cheddar cheese', '2026-11-01', { category: 'dairy' }),
    mk('4', 'Chicken thighs', '2026-09-29', { category: 'meat' }),
    mk('5', 'Bell pepper', '2026-10-04', { category: 'produce' }),
    mk('6', 'Old milk', '2026-09-20', { category: 'dairy' }),
  ];
  const prefs = { diet: 'none', servings: 2 } as const;

  it('never suggests items that are already past their date', () => {
    expect(suggestible(fridge, NOW).map((i) => i.id)).not.toContain('6');
    const meals = localSuggestions(fridge, prefs, NOW);
    expect(meals.flatMap((m) => m.uses)).not.toContain('Old milk');
  });

  it('proposes meals that use what is on hand and ranks the most urgent items first', () => {
    const meals = localSuggestions(fridge, prefs, NOW);
    expect(meals.length).toBeGreaterThan(0);
    const scores = meals.map((m) => mealScore(m, fridge, NOW));
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    // Omelet needs eggs; nothing in the list may use ingredients that are not tracked.
    const tracked = new Set(fridge.map((i) => i.name));
    for (const meal of meals) for (const used of meal.uses) expect(tracked.has(used)).toBe(true);
  });

  it('requires the essential ingredients', () => {
    const noEggs = fridge.filter((i) => i.id !== '1');
    const titles = localSuggestions(noEggs, prefs, NOW).map((m) => m.title);
    expect(titles).not.toContain('Loaded omelet');
    expect(titles).not.toContain('French toast');
  });

  it('respects diets', () => {
    const veg = filterForDiet(fridge, 'vegetarian').map((i) => i.name);
    expect(veg).not.toContain('Chicken thighs');
    expect(veg).toContain('Eggs');
    const vegan = filterForDiet(fridge, 'vegan').map((i) => i.name);
    expect(vegan).toEqual(['Spinach', 'Bell pepper']);
    expect(filterForDiet(fridge, 'dairy-free').map((i) => i.name)).not.toContain('Cheddar cheese');
    const meals = localSuggestions(fridge, { diet: 'vegetarian', servings: 2 }, NOW);
    expect(meals.flatMap((m) => m.uses)).not.toContain('Chicken thighs');
  });

  it('treats plant milks as dairy-free and corn tortillas as gluten-free', () => {
    const items = [
      mk('a', 'Oat milk', '2026-10-10', { category: 'dairy' }),
      mk('b', 'Corn tortillas', '2026-10-10', { category: 'bakery' }),
      mk('c', 'Flour tortillas', '2026-10-10', { category: 'bakery' }),
    ];
    expect(filterForDiet(items, 'dairy-free').map((i) => i.id)).toContain('a');
    expect(filterForDiet(items, 'gluten-free').map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('scores AI meals by matching used items to inventory, fuzzily', () => {
    const ai: Meal = {
      id: 'x', title: 'Chicken & spinach', summary: '', minutes: 20, servings: 2, source: 'ai', steps: [],
      uses: ['chicken thighs', 'baby spinach', 'Unknown thing'], extras: [],
    };
    expect(mealScore(ai, fridge, NOW)).toBe(urgencyWeight(0) + urgencyWeight(1));
    const other: Meal = { ...ai, id: 'y', uses: ['Eggs'] };
    expect(rankMeals([other, ai], fridge, NOW).map((m) => m.id)).toEqual(['x', 'y']);
  });

  it('changes the cache key when inventory, prefs or the day change', () => {
    const a = suggestionKey(fridge, prefs, NOW);
    expect(suggestionKey([...fridge].reverse(), prefs, NOW)).toBe(a);
    expect(suggestionKey(fridge.slice(1), prefs, NOW)).not.toBe(a);
    expect(suggestionKey(fridge, { ...prefs, diet: 'vegan' }, NOW)).not.toBe(a);
    expect(suggestionKey(fridge, prefs, new Date(2026, 8, 30, 10))).not.toBe(a);
  });
});

describe('local billing (trial rules)', () => {
  const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);

  it('has no access before the trial starts', () => {
    expect(computeLocalEntitlement({ trialStartedOn: null, paidThrough: null }, NOW)).toEqual(NO_ENTITLEMENT);
    expect(isUnlocked(NO_ENTITLEMENT)).toBe(false);
  });

  it(`lasts ${TRIAL_DAYS} days: day 13 is still trial, day 14 is locked`, () => {
    const state = { trialStartedOn: '2026-09-01', paidThrough: null };
    const day1 = computeLocalEntitlement(state, at(2026, 9, 1));
    expect(day1).toMatchObject({ status: 'trial', daysRemaining: 14, endsOn: '2026-09-15' });
    expect(computeLocalEntitlement(state, at(2026, 9, 14))).toMatchObject({ status: 'trial', daysRemaining: 1 });
    const locked = computeLocalEntitlement(state, at(2026, 9, 15));
    expect(locked.status).toBe('expired');
    expect(isUnlocked(locked)).toBe(false);
  });

  it('a paid period unlocks access and beats an ended trial', () => {
    const state = { trialStartedOn: '2026-01-01', paidThrough: '2026-10-20' };
    expect(computeLocalEntitlement(state, NOW)).toMatchObject({ status: 'active', daysRemaining: 21 });
  });

  it('locks again once the paid period lapses', () => {
    const state = { trialStartedOn: '2026-01-01', paidThrough: '2026-09-28' };
    expect(computeLocalEntitlement(state, NOW).status).toBe('expired');
  });
});

describe('meals: ingredient sanity', () => {
  const prefs = { diet: 'none', servings: 2 } as const;

  it('does not treat berries as vegetables', () => {
    const items = [
      mk('a', 'Pasta', '2027-01-01', { category: 'grains', location: 'pantry' }),
      mk('b', 'Strawberries', '2026-10-01', { category: 'produce' }),
      mk('c', 'Baby spinach', '2026-10-01', { category: 'produce' }),
    ];
    const pasta = localSuggestions(items, prefs, NOW).find((m) => m.title === 'Use-it-up pasta');
    expect(pasta?.uses).toEqual(['Pasta', 'Baby spinach']);
  });

  it('does not cook leftovers as if they were raw ingredients', () => {
    const items = [mk('a', 'Leftover pasta', '2026-10-01', { category: 'leftovers' })];
    expect(localSuggestions(items, prefs, NOW).map((m) => m.title)).not.toContain('Use-it-up pasta');
  });

  it('still uses leftover rice for fried rice', () => {
    const items = [mk('a', 'Leftover rice', '2026-10-01', { category: 'leftovers' })];
    expect(localSuggestions(items, prefs, NOW).map((m) => m.title)).toContain('Fried rice');
  });
});

describe('trial-ending reminder', () => {
  const opts = { price: '$9.99', endsLabel: 'Tue, Oct 13', trialName: '2-week' };

  it('fires two days before the trial ends, at the chosen hour', () => {
    const r = buildTrialReminder('2026-10-13', NOW, opts);
    expect(r).not.toBeNull();
    expect([r!.fireAt.getMonth(), r!.fireAt.getDate(), r!.fireAt.getHours()]).toEqual([9, 11, 10]);
    expect(r!.title).toBe('Your free trial ends in 2 days');
    expect(r!.body).toBe('Your 2-week trial ends Tue, Oct 13. After that it is $9.99/month unless you cancel in your account settings.');
  });

  it('falls back to one day before when the two-day mark has passed', () => {
    // 11 Oct 10:00 is the two-day mark for a trial ending on the 13th; it has just passed.
    const r = buildTrialReminder('2026-10-13', new Date(2026, 9, 11, 10, 30), opts);
    expect(r?.title).toBe('Your free trial ends tomorrow');
    expect([r!.fireAt.getDate(), r!.fireAt.getHours()]).toEqual([12, 10]);
  });

  it('does not remind once it is too late, or when there is no trial', () => {
    expect(buildTrialReminder('2026-10-13', new Date(2026, 9, 12, 11, 0), opts)).toBeNull();
    expect(buildTrialReminder('2026-10-13', new Date(2026, 9, 13, 8, 0), opts)).toBeNull();
    expect(buildTrialReminder(null, NOW, opts)).toBeNull();
  });
});
