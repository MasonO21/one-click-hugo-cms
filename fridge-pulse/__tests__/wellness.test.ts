/**
 * Goals, the food log, health app writes, money from receipts and the weekly score.
 */
import { act } from 'react-test-renderer';
import type { HealthProvider, NutritionSample } from '../src/health/types';
import { addDays, todayISO } from '../src/lib/dates';
import { clampServings, dayTotals, entryFromFood, entryFromMeal, entryTotals, formatServings, lastDays, quickEntry, type LogEntry } from '../src/lib/foodLog';
import { cmToFeetInches, feetInchesToCm, lbToKg, NO_PROFILE, parseNumber, restingKcal, targetsFor, type Profile } from '../src/lib/goals';
import { byProtein } from '../src/lib/meals';
import { cleanCurrency, cleanPrice, formatMoney, moneyThisMonth } from '../src/lib/money';
import { nutritionFor } from '../src/lib/nutrition';
import { draftToItem, toDrafts } from '../src/lib/scan';
import type { Meal } from '../src/lib/types';
import { weeklyScore } from '../src/lib/weekly';
import { resolveItems } from '../src/store/actions';
import { useFoodLog } from '../src/store/foodLog';
import { setHealthForTesting, useHealth } from '../src/store/health';
import { useInventory } from '../src/store/inventory';
import { addToLog, changeServings, logWithUndo, removeFromLog } from '../src/store/logActions';
import { useSnackbar } from '../src/store/snackbar';
import { mk, NOW } from '../test-utils/helpers';

jest.mock('expo-haptics', () => ({ notificationAsync: jest.fn(async () => {}), NotificationFeedbackType: {} }));

const profile = (over: Partial<Profile>): Profile => ({ ...NO_PROFILE, ...over });
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('goals', () => {
  it('sets protein from body weight and the goal', () => {
    expect(targetsFor(profile({ weightKg: 80 }))).toMatchObject({ protein: 80, proteinPerKg: 1, proteinRange: [65, 130], kcal: null });
    expect(targetsFor(profile({ weightKg: 80, goal: 'muscle' }))?.protein).toBe(130);
    expect(targetsFor(profile({ weightKg: 60, goal: 'lose' }))?.protein).toBe(95);
    // Active people and older adults need more.
    expect(targetsFor(profile({ weightKg: 80, activity: 'moderate' }))?.proteinPerKg).toBe(1.3);
    expect(targetsFor(profile({ weightKg: 80, age: 70 }))?.proteinPerKg).toBe(1.2);
  });

  it('works out calories with Mifflin-St Jeor when height and age are given', () => {
    expect(restingKcal(80, 180, 30, 'male')).toBe(1780);
    expect(targetsFor(profile({ weightKg: 80, heightCm: 180, age: 30, sex: 'male', activity: 'moderate' }))?.kcal).toBe(2760);
    // Without a sex, the average of the two equations.
    expect(restingKcal(80, 180, 30, 'unspecified')).toBe(1697);
  });

  it('never suggests eating below resting energy or the floor, and leaves teenagers to a professional', () => {
    const lose = targetsFor(profile({ weightKg: 60, heightCm: 165, age: 35, sex: 'female', activity: 'sedentary', goal: 'lose' }))!;
    expect(lose.kcal).toBe(1300);
    const teen = targetsFor(profile({ weightKg: 55, heightCm: 165, age: 16 }))!;
    expect(teen.kcal).toBeNull();
    expect(teen.kcalMissing).toMatch(/adults/);
  });

  it('needs a believable weight', () => {
    expect(targetsFor(profile({ weightKg: null }))).toBeNull();
    expect(targetsFor(profile({ weightKg: 12 }))).toBeNull();
    expect(targetsFor(profile({ weightKg: 900 }))).toBeNull();
  });

  it('converts units and reads typed numbers', () => {
    expect(lbToKg(176)).toBeCloseTo(79.83, 1);
    expect(cmToFeetInches(180)).toEqual({ feet: 5, inches: 11 });
    expect(feetInchesToCm(5, 11)).toBeCloseTo(180.34, 1);
    expect(parseNumber('72,5')).toBe(72.5);
    expect(parseNumber('72 kg')).toBeNull();
    expect(parseNumber('')).toBeNull();
  });
});

describe('protein at very high weights', () => {
  it('keeps the range around the capped target, and the per-kg figure true to it', () => {
    for (const weightKg of [60, 80, 160, 200, 220, 300]) {
      for (const goal of ['lose', 'maintain', 'muscle', 'gain'] as const) {
        const t = targetsFor({ ...NO_PROFILE, weightKg, goal })!;
        expect(t.proteinRange[0]).toBeLessThanOrEqual(t.protein);
        expect(t.proteinRange[1]).toBeGreaterThanOrEqual(t.protein);
        expect(t.protein).toBeLessThanOrEqual(250);
        expect(Math.abs(t.proteinPerKg * weightKg - t.protein)).toBeLessThanOrEqual(weightKg * 0.05 + 5);
      }
    }
  });
});

describe('prices', () => {
  it('does not keep a fraction of a cent as a price of nothing', () => {
    expect([cleanPrice(0.004), cleanPrice(0.005), cleanPrice(1.234), cleanPrice(9999.999), cleanPrice(-1)]).toEqual([null, 0.01, 1.23, null, null]);
  });
});

describe('food log entries', () => {
  const meal = { title: 'Omelette', nutrition: { kcal: 366, protein: 20, carbs: 4, fat: 30 } };

  it('makes entries from meals, foods and typed figures', () => {
    expect(entryFromMeal({ title: 'Soup', nutrition: null })).toBeNull();
    expect(entryFromMeal(meal)).toMatchObject({ title: 'Omelette', kind: 'meal', servings: 1, perServing: { kcal: 366, protein: 20 } });
    const banana = entryFromFood('Bananas', nutritionFor('Bananas')!);
    expect(banana).toMatchObject({ kind: 'food', portion: '1 medium (118 g)', perServing: { kcal: 105 } });
    expect(quickEntry('Protein shake', { kcal: null, protein: 30, carbs: 5, fat: 2 })).toMatchObject({ perServing: { kcal: 158, protein: 30 } });
    expect(quickEntry('Oops', { kcal: 50000, protein: null, carbs: null, fat: null })).toBeNull();
    expect(quickEntry('Nothing', { kcal: null, protein: null, carbs: null, fat: null })).toBeNull();
  });

  it('adds up servings and days', () => {
    expect(entryTotals({ perServing: meal.nutrition, servings: 1.5 })).toEqual({ kcal: 549, protein: 30, carbs: 6, fat: 45 });
    const entries = [
      { id: 'a', day: '2026-09-29', at: 1, title: 'A', kind: 'quick', portion: '1', servings: 2, perServing: { kcal: 100, protein: 10, carbs: 1, fat: 1 } },
      { id: 'b', day: '2026-09-29', at: 2, title: 'B', kind: 'quick', portion: '1', servings: 1, perServing: { kcal: 50, protein: 5, carbs: 0, fat: 0 } },
      { id: 'c', day: '2026-09-28', at: 3, title: 'C', kind: 'quick', portion: '1', servings: 1, perServing: { kcal: 999, protein: 99, carbs: 0, fat: 0 } },
    ] as LogEntry[];
    expect(dayTotals(entries, '2026-09-29')).toEqual({ kcal: 250, protein: 25, carbs: 2, fat: 2, entries: 2 });
    expect(lastDays(3, '2026-10-01')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01']);
  });

  it('keeps servings sensible and reads them the way people say them', () => {
    expect(clampServings(0)).toBe(0.5);
    expect(clampServings(1.3)).toBe(1.5);
    expect(clampServings(500)).toBe(20);
    expect([0.5, 1, 1.5, 2].map(formatServings)).toEqual(['½', '1', '1½', '2']);
  });
});

/** A health app that remembers what it was given. */
function fakeHealth() {
  const saved = new Map<string, NutritionSample>();
  let n = 0;
  const provider: HealthProvider = {
    kind: 'apple',
    name: 'Apple Health',
    isAvailable: async () => true,
    requestAccess: async () => true,
    readDays: async (days) => days.map((day, i) => ({ day, steps: i % 2 ? 9000 : 3000, activeKcal: 300, workoutMinutes: i === 0 ? 30 : 0, workouts: i === 0 ? 1 : 0 })),
    writeNutrition: async (s) => {
      const id = `hk-${++n}`;
      saved.set(id, s);
      return [id];
    },
    deleteNutrition: async (ids) => {
      for (const id of ids) saved.delete(id);
    },
  };
  return { provider, saved };
}

describe('logging food, with the health app', () => {
  beforeEach(() => {
    act(() => {
      useFoodLog.getState().clear();
      useInventory.getState().clear();
      useHealth.setState({ connected: false, writeFood: true, days: [], error: null });
    });
  });
  afterAll(() => setHealthForTesting(null));

  it('reads the week once connected, and saves logged food to it', async () => {
    const { provider, saved } = fakeHealth();
    setHealthForTesting(provider);
    await act(async () => {
      await useHealth.getState().connect();
    });
    expect(useHealth.getState().connected).toBe(true);
    expect(useHealth.getState().days).toHaveLength(7);

    act(() => {
      logWithUndo({ title: 'Bananas', kind: 'food', portion: '1 medium', servings: 1, perServing: { kcal: 105, protein: 1.3, carbs: 27, fat: 0.4 } });
    });
    await act(flush);
    expect(saved.size).toBe(1);
    expect([...saved.values()][0]).toMatchObject({ title: 'Bananas', kcal: 105 });
    expect(useFoodLog.getState().entries[0]!.healthIds).toEqual(['hk-1']);
    expect(useSnackbar.getState().snack?.message).toBe('Logged Bananas (105 kcal)');

    // Undo takes it out of the log and the health app.
    await act(async () => {
      useSnackbar.getState().snack?.action?.onPress();
      await flush();
    });
    expect(useFoodLog.getState().entries).toHaveLength(0);
    expect(saved.size).toBe(0);
  });

  it('rewrites the health app once servings stop changing', async () => {
    jest.useFakeTimers();
    const { provider, saved } = fakeHealth();
    setHealthForTesting(provider);
    useHealth.setState({ connected: true });
    let id = '';
    await act(async () => {
      id = addToLog({ title: 'Omelette', kind: 'meal', portion: '1 serving', servings: 1, perServing: { kcal: 366, protein: 20, carbs: 4, fat: 30 } })!.id;
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => {
      changeServings(id, 1.5);
      changeServings(id, 2);
    });
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();
    });
    jest.useRealTimers();
    await act(flush);
    expect(useFoodLog.getState().entries[0]!.servings).toBe(2);
    expect([...saved.values()].map((s) => s.kcal)).toEqual([732]);
  });

  it('keeps the log on the phone when not connected or saving is off', async () => {
    const { provider, saved } = fakeHealth();
    setHealthForTesting(provider);
    act(() => {
      addToLog({ title: 'A', kind: 'quick', portion: '1', servings: 1, perServing: { kcal: 100, protein: 1, carbs: 1, fat: 1 } });
    });
    useHealth.setState({ connected: true, writeFood: false });
    act(() => {
      addToLog({ title: 'B', kind: 'quick', portion: '1', servings: 1, perServing: { kcal: 100, protein: 1, carbs: 1, fat: 1 } });
    });
    await act(flush);
    expect(saved.size).toBe(0);
    expect(useFoodLog.getState().entries).toHaveLength(2);
    act(() => {
      removeFromLog(useFoodLog.getState().entries[0]!.id);
    });
    expect(useFoodLog.getState().entries).toHaveLength(1);
  });

  it('"I made this" logs a serving, and one Undo takes back both', () => {
    const today = todayISO();
    act(() => useInventory.getState().addItems([mk('e', 'Eggs', addDays(today, 2), { category: 'dairy' })]));
    act(() => {
      const logged = addToLog(entryFromMeal({ title: 'Omelette', nutrition: { kcal: 366, protein: 20, carbs: 4, fat: 30 } })!);
      resolveItems(useInventory.getState().items, 'used', { mealTitle: 'Omelette', logged });
    });
    expect(useSnackbar.getState().snack?.message).toMatch(/used in Omelette.*Logged Omelette \(366 kcal\)/);
    expect(useFoodLog.getState().entries).toHaveLength(1);
    act(() => useSnackbar.getState().snack?.action?.onPress());
    expect(useFoodLog.getState().entries).toHaveLength(0);
    expect(useInventory.getState().items[0]!.status).toBe('active');
  });
});

describe('money from receipts', () => {
  const today = '2026-09-29';
  const priced = (id: string, status: 'used' | 'wasted', price: number, resolvedOn: string, expiresOn = resolvedOn, currency = 'USD') =>
    mk(id, id, expiresOn, { status, resolvedOn, price, currency });

  it('adds up what was rescued and thrown out this month, from real prices only', () => {
    const m = moneyThisMonth(
      [
        priced('a', 'used', 3.49, '2026-09-28', '2026-09-29'), // rescued: used a day before its date
        priced('b', 'used', 2, '2026-09-10', '2026-10-20'), // used, not a rescue
        priced('c', 'wasted', 4.5, '2026-09-20'),
        priced('d', 'wasted', 9, '2026-08-31'), // last month
        mk('e', 'No price', '2026-09-20', { status: 'wasted', resolvedOn: '2026-09-20' }),
      ],
      today,
    )!;
    expect(m).toEqual({ currency: 'USD', rescued: 3.49, used: 5.49, wasted: 4.5, priced: 3 });
    expect(moneyThisMonth([mk('x', 'x', '2026-09-30')], today)).toBeNull();
  });

  it('uses the most common currency when there are several', () => {
    const m = moneyThisMonth([priced('a', 'wasted', 2, '2026-09-20', '2026-09-20', 'GBP'), priced('b', 'wasted', 3, '2026-09-21', '2026-09-21', 'GBP'), priced('c', 'wasted', 9, '2026-09-21', '2026-09-21', 'EUR')], today)!;
    expect(m).toMatchObject({ currency: 'GBP', wasted: 5, priced: 2 });
  });

  it('checks prices and currencies, and formats money', () => {
    expect([cleanPrice(3.456), cleanPrice(0), cleanPrice(-1), cleanPrice(20000), cleanPrice('3')]).toEqual([3.46, null, null, null, null]);
    expect([cleanCurrency('usd'), cleanCurrency('US'), cleanCurrency(3)]).toEqual(['USD', null, null]);
    expect(formatMoney(23, 'USD')).toMatch(/23/);
    expect(formatMoney(23, 'USD')).not.toMatch(/\.00/);
    expect(formatMoney(3.5, 'GBP')).toMatch(/3\.50/);
  });

  it('carries receipt prices onto saved items, and ignores prices on shelf photos', () => {
    const line = { name: 'Milk', category: 'dairy' as const, quantity: '1', shelfLifeDays: 7, labelExpiryDate: null, confidence: 'high' as const, keptIn: 'fridge' as const, price: 3.49 };
    const [receipt] = toDrafts({ items: [line], currency: 'USD', purchaseDate: null }, 'fridge', [], NOW, 'receipt');
    expect(draftToItem(receipt!, 'x', NOW)).toMatchObject({ price: 3.49, currency: 'USD' });
    const [shelf] = toDrafts({ items: [line] }, 'fridge', [], NOW);
    expect(draftToItem(shelf!, 'y', NOW).price).toBeUndefined();
  });
});

describe('the weekly score', () => {
  const today = '2026-09-29';
  const log = (day: string, protein: number): LogEntry => ({ id: day, day, at: 0, title: 'x', kind: 'quick', portion: '1', servings: 1, perServing: { kcal: protein * 4, protein, carbs: 0, fat: 0 } });

  it('scores only what can be counted', () => {
    const empty = weeklyScore({ items: [], log: [], proteinTarget: null, activity: null, today });
    expect(empty.score).toBeNull();
    expect(empty.parts.map((p) => p.hint)).toEqual([expect.stringMatching(/Mark food/), expect.stringMatching(/protein goal/), expect.stringMatching(/health app/)]);

    const items = [mk('a', 'A', today, { status: 'used', resolvedOn: today }), mk('b', 'B', today, { status: 'used', resolvedOn: '2026-09-27' }), mk('c', 'C', today, { status: 'wasted', resolvedOn: '2026-09-26' }), mk('d', 'D', today, { status: 'wasted', resolvedOn: '2026-09-10' })];
    const food = weeklyScore({ items, log: [], proteinTarget: null, activity: null, today });
    expect(food.parts[0]).toMatchObject({ detail: '2 used, 1 thrown out' });
    expect(food.score).toBe(67);
  });

  it('counts protein days and active days', () => {
    const days = lastDays(7, today);
    const entries = [log(days[6]!, 130), log(days[5]!, 120), log(days[4]!, 40)];
    const activity = days.map((day, i) => ({ day, steps: i < 3 ? 9000 : 1000, activeKcal: 0, workoutMinutes: i === 6 ? 25 : 0, workouts: i === 6 ? 1 : 0 }));
    const w = weeklyScore({ items: [], log: entries, proteinTarget: 130, activity, today });
    const [, protein, active] = w.parts;
    expect(protein).toMatchObject({ detail: '2 of 7 days' });
    expect(protein!.ratio).toBeCloseTo(2 / 7);
    expect(active).toMatchObject({ detail: '4 of 5', ratio: 0.8 });
    expect(w.score).toBe(Math.round(((2 / 7 + 0.8) / 2) * 100));
  });
});

describe('protein-first ideas', () => {
  it('puts the most protein first and ideas without figures last', () => {
    const meal = (id: string, protein: number | null) => ({ id, title: id, nutrition: protein === null ? null : { kcal: 1, protein, carbs: 0, fat: 0 } }) as Meal;
    expect(byProtein([meal('a', 10), meal('b', null), meal('c', 40), meal('d', 10)]).map((m) => m.id)).toEqual(['c', 'a', 'd', 'b']);
  });
});

describe('the health app while a write is slow', () => {
  afterEach(() => {
    jest.useRealTimers();
    setHealthForTesting(null);
  });

  it('keeps one sample when the servings change before the first write has finished', async () => {
    jest.useFakeTimers();
    const samples = new Map<string, number>();
    let n = 0;
    setHealthForTesting({
      kind: 'apple',
      name: 'Apple Health',
      isAvailable: async () => true,
      requestAccess: async () => true,
      readDays: async () => [],
      writeNutrition: (s: NutritionSample) =>
        new Promise((done) =>
          setTimeout(() => {
            const id = `h${++n}`;
            samples.set(id, s.kcal);
            done([id]);
          }, 1500),
        ),
      deleteNutrition: async (ids: string[]) => {
        ids.forEach((id) => samples.delete(id));
      },
    } as HealthProvider);
    act(() => {
      useHealth.setState({ connected: true, writeFood: true });
    });
    let id = '';
    act(() => {
      id = addToLog({ title: 'Toast', kind: 'quick', portion: '1 serving', servings: 1, perServing: { kcal: 100, protein: 5, carbs: 10, fat: 2 } })!.id;
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(200);
      changeServings(id, 2);
      await jest.advanceTimersByTimeAsync(5000);
    });
    expect([...samples.values()]).toEqual([200]);
    expect(useFoodLog.getState().entries.find((e) => e.id === id)?.healthIds).toEqual([...samples.keys()]);
    act(() => {
      useFoodLog.getState().clear();
      useHealth.setState({ connected: false });
    });
  });
});
