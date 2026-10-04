/**
 * Nutrition figures: the USDA table behind them, matching a food name to it, and the per-serving
 * estimates on meal ideas.
 */
import { FOOD_CATALOG } from '../src/lib/foodCatalog';
import { fillRecipe, indexRoles, localSuggestions, toMeal } from '../src/lib/meals';
import {
  energySplit,
  formatGrams,
  mealNutrition,
  nutritionFor,
  nutritionNote,
  portionMacros,
  quantityGrams,
  scaleMacros,
  toMealNutrition,
} from '../src/lib/nutrition';
import { NUTRITION, UNMEASURED } from '../src/lib/nutritionData';
import { RECIPES } from '../src/lib/recipes';
import type { PantryItem } from '../src/lib/types';
import { mk, NOW } from '../test-utils/helpers';

const prefs = { diet: 'none', servings: 2 } as const;

describe('the USDA table', () => {
  const rows = Object.entries(NUTRITION);

  it('covers every catalog food, or says why not', () => {
    const names = FOOD_CATALOG.map((f) => f.name);
    const missing = names.filter((n) => !(n in NUTRITION) && !UNMEASURED.includes(n));
    expect(missing).toEqual([]);
    expect(rows.map(([n]) => n).filter((n) => !names.includes(n))).toEqual([]);
    expect(UNMEASURED.filter((n) => n in NUTRITION)).toEqual([]);
    expect(rows.length).toBeGreaterThan(350);
  });

  it('has figures that add up: energy matches the macros, and 100 g holds at most 100 g', () => {
    for (const [name, [kcal, protein, carbs, fat, fiber, portion, grams]] of rows) {
      const where = { name };
      expect({ ...where, ok: protein >= 0 && carbs >= 0 && fat >= 0 && fiber >= 0 }).toEqual({ ...where, ok: true });
      expect({ ...where, ok: protein + carbs + fat <= 100.5 }).toEqual({ ...where, ok: true });
      expect({ ...where, ok: fiber <= carbs + 0.5 }).toEqual({ ...where, ok: true });
      // Atwater factors, with fibre at 2 kcal a gram. Alcohol, and the acids in citrus and vinegar, give
      // energy the macros do not show.
      const fromMacros = protein * 4 + (carbs - fiber) * 4 + fiber * 2 + fat * 9;
      const other = /wine|beer|prosecco|lemon|lime|vinegar/i.test(name);
      if (!other) expect({ ...where, gap: Math.abs(fromMacros - kcal) <= Math.max(12, kcal * 0.15) }).toEqual({ ...where, gap: true });
      expect({ ...where, ok: portion.length > 0 && grams > 0 && grams <= 400 }).toEqual({ ...where, ok: true });
    }
  });

  // Figures as published in USDA SR Legacy, typed in by hand: a wrong row in the table fails here.
  it.each([
    ['Bananas', 89, 1.1, 22.8, 0.3],
    ['Eggs', 143, 12.6, 0.7, 9.5],
    ['Chicken breast', 120, 22.5, 0, 2.6],
    ['Olive oil', 884, 0, 0, 100],
    ['Whole milk', 61, 3.2, 4.8, 3.3],
    ['Butter', 717, 0.9, 0.1, 81.1],
    ['Avocados', 160, 2, 8.5, 14.7],
    ['Broccoli', 34, 2.8, 6.6, 0.4],
    ['Apples', 52, 0.3, 13.8, 0.2],
    ['Rice', 365, 7.1, 80, 0.7],
    ['Pasta', 371, 13, 74.7, 1.5],
    ['Peanut butter', 597, 22.2, 22.3, 51.4],
  ] as const)('%s per 100 g matches USDA', (name, kcal, protein, carbs, fat) => {
    const [k, p, c, f] = NUTRITION[name]!;
    expect(Math.abs(k - kcal)).toBeLessThanOrEqual(4);
    expect(Math.abs(p - protein)).toBeLessThanOrEqual(0.6);
    expect(Math.abs(c - carbs)).toBeLessThanOrEqual(0.6);
    expect(Math.abs(f - fat)).toBeLessThanOrEqual(1.1);
  });

  it('gives sensible portions', () => {
    const portion = (name: string) => portionMacros(nutritionFor(name)!);
    expect(portion('Bananas').kcal).toBeGreaterThan(90);
    expect(portion('Bananas').kcal).toBeLessThan(120);
    expect(portion('Eggs').protein).toBeGreaterThan(5.5);
    expect(portion('Olive oil').fat).toBe(14);
    expect(nutritionFor('Pasta')!.portion.label).toMatch(/dry/);
  });
});

describe('finding the figures for a food', () => {
  it.each([
    ['Bananas', 'Bananas'],
    ['banana', 'Bananas'],
    ['TOMATOES', 'Tomatoes'],
    ['Organic bananas', 'Bananas'],
    ['Organic baby spinach', 'Baby spinach'],
    ['Kirkland chicken breast', 'Chicken breast'],
    ['Frozen chicken breasts', 'Chicken breast'],
    ['Large free-range eggs', 'Free-range eggs'],
    ['Ground beef 80/20', 'Ground beef'],
    ['Eggs x12', 'Eggs'],
    ['Whole milk 2l', 'Whole milk'],
    ['Crème fraîche', 'Crème fraîche'],
    ['Baby bella mushrooms', 'Mushrooms'],
    ['Rotisserie chicken', 'Rotisserie chicken'],
  ])('%s -> %s', (name, food) => {
    expect(nutritionFor(name)?.food).toBe(food);
  });

  // Better no figure than a wrong one.
  it.each([
    'Dried apricots',
    'Chocolate milk',
    'Strawberry yogurt',
    'Fried rice',
    'Cauliflower rice',
    'Zucchini noodles',
    'Peanut butter cups',
    'Fish cakes',
    'Light mayonnaise',
    'Vegan cheese',
    'Veggie sausages',
    'Chicken soup',
    'Leftover chicken',
    'Oat milk',
    'Gochujang',
    'Widget',
    '',
  ])('%s has no figures', (name) => {
    expect(nutritionFor(name)).toBeNull();
  });
});

describe('how much food a quantity is', () => {
  const bananas = nutritionFor('Bananas')!;
  const eggs = nutritionFor('Eggs')!;
  const bread = nutritionFor('Bread')!;
  it.each([
    ['500 g', bananas, 500],
    ['1.5 kg', bananas, 1500],
    ['2 x 250g', bananas, 500],
    ['1 lb', bananas, 454],
    ['8 oz', bananas, 227],
    ['6', bananas, 708],
    ['6 pcs', bananas, 708],
    ['12', eggs, 600],
    ['1 dozen', eggs, 600],
    ['2 dozen', eggs, 1200],
  ] as const)('%s', (quantity, n, grams) => {
    expect(quantityGrams(quantity, n)).toBe(grams);
  });

  it('does not guess at packs, loaves or vague amounts', () => {
    expect(quantityGrams('1 carton', eggs)).toBeNull();
    expect(quantityGrams('half', bananas)).toBeNull();
    expect(quantityGrams('1', bread)).toBeNull();
    expect(quantityGrams('0 g', bananas)).toBeNull();
    expect(quantityGrams('500', bananas)).toBeNull();
  });

  it('scales figures to a weight', () => {
    expect(scaleMacros(nutritionFor('Bananas')!.per100g, 200)).toEqual({ kcal: 178, protein: 2.2, carbs: 45.6, fat: 0.6, fiber: 5.2 });
  });
});

describe('meal estimates', () => {
  it('adds up typical portions per serving, with cooking oil from the extras', () => {
    const n = mealNutrition(
      [
        { name: 'Chicken breast', portions: 1 },
        { name: 'Broccoli', portions: 1 },
        { name: 'Rice', portions: 1 },
      ],
      ['Olive oil', 'Salt'],
    )!;
    // 204 + 31 + 168 + 62 (7 g oil).
    expect(n.kcal).toBeGreaterThan(450);
    expect(n.kcal).toBeLessThan(480);
    expect(n.protein).toBe(Math.round(38.25 + 2.5 + 3.3));
    expect(n).toMatchObject({ counted: 3, total: 3 });
  });

  it('says what it left out, and gives nothing when it knows nothing', () => {
    expect(mealNutrition([{ name: 'Eggs', portions: 1 }, { name: 'Gochujang', portions: 1 }])).toMatchObject({ counted: 1, total: 2 });
    expect(mealNutrition([{ name: 'Gochujang', portions: 1 }])).toBeNull();
    expect(nutritionNote({ source: 'local', nutrition: { kcal: 1, protein: 0, carbs: 0, fat: 0, counted: 1, total: 2 } })).toMatch(/1 of 2 ingredients/);
    expect(nutritionNote({ source: 'local', nutrition: { kcal: 1, protein: 0, carbs: 0, fat: 0, counted: 2, total: 2 } })).not.toMatch(/of 2/);
    expect(nutritionNote({ source: 'ai', nutrition: { kcal: 1, protein: 0, carbs: 0, fat: 0 } })).toMatch(/one serving/);
  });

  const kitchen: PantryItem[] = FOOD_CATALOG.map((f, n) => mk(`c${n}`, f.name, `2026-10-${String((n % 25) + 1).padStart(2, '0')}`, { category: f.category }));
  const index = indexRoles(kitchen);

  it('gives every built-in recipe a believable figure per serving', () => {
    const odd: string[] = [];
    let estimated = 0;
    for (const recipe of RECIPES) {
      const filled = fillRecipe(recipe, kitchen, index);
      if (!filled) continue;
      const meal = toMeal(filled, prefs);
      if (!meal.nutrition) continue;
      estimated++;
      const { kcal, protein, carbs, fat } = meal.nutrition;
      const [low, high] = recipe.course === 'main' ? [100, 1200] : recipe.course === 'drink' ? [20, 800] : [30, 1000];
      if (kcal < low || kcal > high) odd.push(`${recipe.id}: ${kcal} kcal`);
      // The figures belong together (wine adds energy the macros do not show).
      if (meal.uses.some((u) => /wine|beer/i.test(u))) continue;
      if (Math.abs(protein * 4 + carbs * 4 + fat * 9 - kcal) > Math.max(25, kcal * 0.15)) odd.push(`${recipe.id}: macros do not match ${kcal} kcal`);
    }
    expect(odd).toEqual([]);
    expect(estimated).toBeGreaterThan(RECIPES.length * 0.9);
  });

  it('puts the estimate on offline ideas', () => {
    const items = [
      mk('a', 'Chicken thighs', '2026-09-30', { category: 'meat' }),
      mk('b', 'Bell peppers', '2026-10-01', { category: 'produce' }),
      mk('c', 'Rice', '2027-01-01', { category: 'grains' }),
      mk('d', 'Onions', '2026-10-10', { category: 'produce' }),
    ];
    const meals = localSuggestions(items, prefs, NOW);
    expect(meals.length).toBeGreaterThan(0);
    for (const m of meals) expect(m.nutrition?.kcal).toBeGreaterThan(0);
  });
});

describe('figures from the server', () => {
  it('keeps sensible numbers, rounded', () => {
    expect(toMealNutrition({ kcal: 512.4, protein: 31.2, carbs: 48.9, fat: 21.4 })).toEqual({ kcal: 512, protein: 31, carbs: 49, fat: 21 });
  });

  it.each([
    [null],
    ['500 kcal'],
    [{ kcal: 500 }],
    [{ kcal: -5, protein: 1, carbs: 1, fat: 1 }],
    [{ kcal: 0, protein: 0, carbs: 0, fat: 0 }],
    [{ kcal: 9000, protein: 100, carbs: 1000, fat: 300 }],
    [{ kcal: Number.NaN, protein: 1, carbs: 1, fat: 1 }],
    // Energy that has nothing to do with the macros.
    [{ kcal: 1200, protein: 10, carbs: 10, fat: 5 }],
  ])('drops %p', (raw) => {
    expect(toMealNutrition(raw)).toBeNull();
  });
});

describe('display helpers', () => {
  it('splits the energy between the macros', () => {
    expect(energySplit({ kcal: 0, protein: 25, carbs: 50, fat: 0 })).toEqual([33, 67, 0]);
    expect(energySplit({ kcal: 0, protein: 0, carbs: 0, fat: 0 })).toEqual([0, 0, 0]);
    const s = energySplit({ kcal: 500, protein: 31, carbs: 49, fat: 21 });
    expect(s[0] + s[1] + s[2]).toBe(100);
  });

  it('formats grams', () => {
    expect(formatGrams(0.3)).toBe('0.3 g');
    expect(formatGrams(4)).toBe('4 g');
    expect(formatGrams(22.8)).toBe('23 g');
  });
});
