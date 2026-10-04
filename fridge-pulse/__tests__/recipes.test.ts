/**
 * The built-in recipe library and the ingredient roles behind it. The lists of sweet, savoury and
 * leftover foods here are written independently of `src/lib/ingredients.ts`, so a rule change that
 * lets ice cream into a soup (the bug this file was written for) fails here.
 */
import { FOOD_CATALOG } from '../src/lib/foodCatalog';
import { ROLES, rolesFor, type Role } from '../src/lib/ingredients';
import {
  adaptText,
  displayName,
  fillRecipe,
  filterForDiet,
  indexRoles,
  localSuggestions,
  MAX_USES,
  mealScore,
  plausibleMeal,
  singular,
  slotAccepts,
  suggestible,
  toMeal,
} from '../src/lib/meals';
import { RECIPES, type Line, type Recipe, type Slot } from '../src/lib/recipes';
import type { Category, Diet, PantryItem } from '../src/lib/types';
import { mk, NOW } from '../test-utils/helpers';

const prefs = { diet: 'none', servings: 2 } as const;

/** Foods not in the catalog that some recipes are built around. */
const EXTRA: [string, Category][] = [
  ['Falafel', 'other'],
  ['Paneer', 'dairy'],
  ['Gnocchi', 'grains'],
  ['Spinach ravioli', 'grains'],
  ['Arborio rice', 'grains'],
  ['Strawberry yogurt', 'dairy'],
  ['Whipped cream', 'dairy'],
  ['Vegan cheese', 'dairy'],
  ['Lamb mince', 'meat'],
  ['Refried beans', 'canned'],
  ['Cooked chicken', 'meat'],
  ['Leftover roast potatoes', 'leftovers'],
  ['Anchovies', 'canned'],
  ['Red curry paste', 'condiments'],
  ['Sesame seeds', 'snacks'],
];

const kitchen: PantryItem[] = [
  ...FOOD_CATALOG.map((f, n) => mk(`c${n}`, f.name, `2026-10-${String((n % 25) + 1).padStart(2, '0')}`, { category: f.category })),
  ...EXTRA.map(([name, category], n) => mk(`x${n}`, name, `2026-10-${String((n % 25) + 2).padStart(2, '0')}`, { category })),
];
const index = indexRoles(kitchen);
const food = (name: string) => {
  const item = kitchen.find((i) => i.name === name);
  if (!item) throw new Error(`not in the test kitchen: ${name}`);
  return item;
};
const slotsOf = (r: Recipe): Slot[] => [...r.needs, ...(r.anyOf ?? []), ...(r.optional ?? [])];
const accepts = (slot: Slot, item: PantryItem) => slotAccepts(slot, item, index.get(item.id) ?? []);
const lineText = (l: Line) => (typeof l === 'string' ? l : l.text);
const conditions = (l: Line) => (typeof l === 'string' ? [] : [l.if ?? [], l.unless ?? []].flat());

/** Small deterministic generator so the random kitchens are the same on every run. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('recipe library', () => {
  it('has a large library with unique ids and titles', () => {
    expect(RECIPES.length).toBeGreaterThanOrEqual(150);
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
    expect(new Set(RECIPES.map((r) => r.title)).size).toBe(RECIPES.length);
  });

  it.each(RECIPES.map((r) => [r.id, r] as const))('%s: conditions and placeholders all refer to its own slots', (_id, recipe) => {
    const slots = slotsOf(recipe);
    const keys = new Set(slots.map((s) => s.key));
    expect(keys.size).toBe(slots.length);
    const roles = new Set(slots.flatMap((s) => s.roles));
    for (const line of [...recipe.steps, ...recipe.extras]) {
      for (const c of conditions(line)) {
        if (c.startsWith('@')) expect({ line: lineText(line), role: roles.has(c.slice(1) as Role) }).toEqual({ line: lineText(line), role: true });
        else expect({ line: lineText(line), key: keys.has(c) }).toEqual({ line: lineText(line), key: true });
      }
      for (const m of lineText(line).matchAll(/\{([\w-]+)(?::one)?(?:\|[^}]*)?\}/g)) {
        expect({ line: lineText(line), key: keys.has(m[1]) }).toEqual({ line: lineText(line), key: true });
      }
    }
    expect(recipe.steps.length).toBeGreaterThanOrEqual(1);
    expect(recipe.summary).toMatch(/^[A-Z].*\.$/);
  });

  it('gives every role to some food and asks for every role in some recipe', () => {
    const given = new Set(kitchen.flatMap((i) => [...(index.get(i.id) ?? [])]));
    const asked = new Set(RECIPES.flatMap((r) => slotsOf(r).flatMap((s) => s.roles)));
    expect(ROLES.filter((r) => !given.has(r))).toEqual([]);
    expect(ROLES.filter((r) => !asked.has(r))).toEqual([]);
  });

  it('can make every recipe from a well-stocked kitchen', () => {
    const impossible = RECIPES.filter((r) => fillRecipe(r, kitchen, index) === null).map((r) => r.id);
    expect(impossible).toEqual([]);
  });

  it('writes clean steps whatever is on hand', () => {
    const random = rng(7);
    const problems: string[] = [];
    for (const recipe of RECIPES) {
      for (let run = 0; run < 25; run++) {
        // A random third of the kitchen; every 5th run only what the recipe needs.
        const pool = run % 5 === 0 ? kitchen.filter((i) => recipe.needs.some((s) => accepts(s, i)) && random() < 0.5) : kitchen.filter(() => random() < 0.33);
        const filled = fillRecipe(recipe, pool, index);
        if (!filled) continue;
        const meal = toMeal(filled, prefs);
        const required = recipe.needs.reduce((n, s) => n + (s.max ?? 1), 0) + (recipe.anyOf ?? []).reduce((n, s) => n + (s.max ?? 1), 0);
        if (meal.uses.length > Math.max(MAX_USES, required)) problems.push(`${recipe.id}: uses ${meal.uses.length}`);
        if (new Set(meal.uses).size !== meal.uses.length) problems.push(`${recipe.id}: repeats ${meal.uses.join(', ')}`);
        for (const text of [...meal.steps, ...meal.extras]) {
          if (/[{}]|\s{2}|\s[.,;:]|\bthe the\b|\(\s|\s\)|^\s|\s$/.test(text) || !/^[A-Z0-9]/.test(text)) problems.push(`${recipe.id}: "${text}"`);
        }
        for (const text of meal.steps) if (!/[.)]$/.test(text)) problems.push(`${recipe.id}: no full stop: "${text}"`);
        // A tracked food is not also on the shopping list of extras.
        for (const extra of meal.extras) if (meal.uses.some((u) => u.toLowerCase() === extra.toLowerCase())) problems.push(`${recipe.id}: extra ${extra} is tracked`);
      }
    }
    expect([...new Set(problems)]).toEqual([]);
  });

  it('names the food actually used in the steps', () => {
    const items = [mk('1', 'Spinach', '2026-09-30', { category: 'produce' }), mk('2', 'Bell peppers', '2026-10-01', { category: 'produce' })];
    const stirFry = localSuggestions(items, prefs, NOW).find((m) => m.title === 'Clear-the-crisper stir-fry');
    expect(stirFry?.steps.join(' ')).toContain('spinach and bell peppers');
    expect(displayName('Greek yogurt')).toBe('Greek yogurt');
    expect(displayName('BBQ sauce')).toBe('BBQ sauce');
    expect(displayName('American cheese')).toBe('American cheese');
    expect(displayName('Bell peppers')).toBe('bell peppers');
    expect(singular('Lemons')).toBe('Lemon');
    expect(singular('Key limes')).toBe('Key lime');
  });
});

describe('ingredient sense', () => {
  // Written by hand, independently of the role table.
  const SWEET_ONLY = [
    'Ice cream', 'Frozen yogurt', 'Custard', 'Pudding', 'Cake', 'Brownies', 'Donuts', 'Muffins', 'Cookies', 'Dark chocolate',
    'Milk chocolate', 'Chocolate spread', 'Jam', 'Honey', 'Maple syrup', 'Granola bars', 'Strawberry yogurt', 'Whipped cream',
    'Frozen waffles', 'Lemonade', 'Smoothie', 'Soda',
  ];
  const FRUIT = [
    'Apples', 'Bananas', 'Strawberries', 'Blueberries', 'Raspberries', 'Grapes', 'Oranges', 'Mangoes', 'Peaches', 'Pears', 'Pineapple',
    'Kiwi', 'Melon', 'Watermelon', 'Cherries', 'Plums', 'Clementines', 'Figs', 'Apricots', 'Nectarines', 'Frozen berries', 'Raisins', 'Dates',
  ];
  const SAVORY_ONLY = [
    'Chicken breast', 'Ground beef', 'Bacon', 'Sausages', 'Ham', 'Salmon', 'Shrimp', 'Canned tuna', 'Onions', 'Garlic', 'Leeks', 'Potatoes',
    'Broccoli', 'Cabbage', 'Cauliflower', 'Mushrooms', 'Bell peppers', 'Tomatoes', 'Cucumber', 'Lettuce', 'Cheddar cheese', 'Parmesan', 'Feta',
    'Chicken broth', 'Soy sauce', 'Ketchup', 'Mustard', 'Hot sauce', 'Mayonnaise', 'Pickles', 'Olives', 'Salsa', 'Hummus', 'Pesto',
    'Pasta sauce', 'Canned tomatoes', 'Black beans', 'Tortilla chips', 'Pasta', 'Rice noodles', 'Bok choy', 'Chili peppers',
  ];
  const LEFTOVER_DISHES = ['Leftovers', 'Leftover pizza', 'Leftover curry', 'Soup', 'Chicken soup', 'Stew', 'Lasagna', 'Casserole', 'Takeout', 'Pizza', 'Frozen pizza'];
  /** Savoury recipes where fruit is part of the dish, and the slots that may take it. */
  const FRUIT_IN_SAVORY: Record<string, string[]> = {
    coleslaw: ['apple'],
    waldorf: ['apple', 'fruit'],
    'pork-apples': ['apple'],
    'kale-salad': ['fruit'],
    'strawberry-salad': ['berries'],
    duck: ['fruit'],
    'snack-board': ['fruit'],
  };
  /** Savoury recipes with a sweet glaze or a jam on the side. */
  const SWEET_IN_SAVORY: Record<string, string[]> = {
    'glazed-carrots': ['Honey', 'Maple syrup'],
    brussels: ['Honey', 'Maple syrup'],
    'snack-board': ['Jam'],
  };

  const savory = RECIPES.filter((r) => r.taste === 'savory');
  const sweet = RECIPES.filter((r) => r.taste === 'sweet');

  it('never puts ice cream in a soup, or in any savoury dish', () => {
    const items = [
      mk('1', 'Ice cream', '2026-09-30', { category: 'dairy' }),
      mk('2', 'Carrots', '2026-10-01', { category: 'produce' }),
      mk('3', 'Potatoes', '2026-10-02', { category: 'produce' }),
      mk('4', 'Onions', '2026-10-10', { category: 'produce' }),
      mk('5', 'Heavy cream', '2026-10-03', { category: 'dairy' }),
    ];
    const ideas = localSuggestions(items, prefs, NOW, 100);
    const soup = ideas.find((m) => m.title === 'Everything-in soup');
    expect(soup?.uses).toEqual(expect.arrayContaining(['Carrots', 'Potatoes', 'Onions']));
    expect(soup?.uses).not.toContain('Ice cream');
    const withIceCream = ideas.filter((m) => m.uses.includes('Ice cream')).map((m) => m.title);
    expect(withIceCream.length).toBeGreaterThan(0);
    for (const title of withIceCream) expect(RECIPES.find((r) => r.title === title)?.taste).toBe('sweet');
    for (const r of savory) for (const slot of slotsOf(r)) expect(accepts(slot, food('Ice cream'))).toBe(false);
  });

  it('keeps sweet things out of savoury dishes', () => {
    const found: Record<string, string[]> = {};
    for (const r of savory) {
      for (const name of SWEET_ONLY) {
        if (slotsOf(r).some((slot) => accepts(slot, food(name)))) (found[r.id] ??= []).push(name);
      }
    }
    expect(found).toEqual(SWEET_IN_SAVORY);
  });

  it('puts fruit in savoury dishes only where a cook would', () => {
    for (const r of savory) {
      for (const slot of slotsOf(r)) {
        const fruit = FRUIT.filter((name) => accepts(slot, food(name)));
        if (fruit.length > 0) expect({ recipe: r.id, slot: slot.key, allowed: FRUIT_IN_SAVORY[r.id]?.includes(slot.key) ?? false }).toEqual({ recipe: r.id, slot: slot.key, allowed: true });
      }
    }
  });

  it('keeps savoury things out of desserts, sweet breakfasts and drinks', () => {
    const found: string[] = [];
    for (const r of sweet) for (const name of SAVORY_ONLY) if (slotsOf(r).some((slot) => accepts(slot, food(name)))) found.push(`${r.id}: ${name}`);
    expect(found).toEqual([]);
  });

  it('never cooks a finished dish into a new one', () => {
    for (const r of RECIPES) for (const slot of slotsOf(r)) for (const name of LEFTOVER_DISHES) expect({ r: r.id, name, ok: accepts(slot, food(name)) }).toEqual({ r: r.id, name, ok: false });
  });

  it('leaves seasonings and drinks to the extras list', () => {
    for (const name of ['Ketchup', 'Mustard', 'Soy sauce', 'Salt', 'Sugar', 'Olive oil', 'Black pepper', 'Balsamic vinegar', 'Fish sauce', 'Beer', 'Soda', 'Tea']) {
      expect({ name, roles: rolesFor(food(name)) }).toEqual({ name, roles: [] });
    }
  });

  it.each([
    ['Peanut butter', ['peanut-butter'], ['butter']],
    ['Unsalted butter', ['butter'], []],
    ['Ice cream', ['ice-cream'], ['cream', 'whipping-cream']],
    ['Sour cream', ['sour-cream'], ['cream']],
    ['Heavy cream', ['cream', 'whipping-cream'], ['ice-cream']],
    ['Cream cheese', ['cream-cheese'], ['cheese-melt', 'cream']],
    ['Egg noodles', ['noodles'], ['egg']],
    ['Eggplant', ['eggplant'], ['egg']],
    ['Chocolate eggs', [], ['egg', 'chocolate']],
    ['Honey roast ham', ['ham'], ['sweetener']],
    ['Butter beans', ['beans'], ['butter']],
    ['Green beans', ['green-beans'], ['beans']],
    ['Coffee beans', ['coffee'], ['beans']],
    ['Chicken broth', ['stock'], ['chicken']],
    ['Pasta sauce', ['pasta-sauce'], ['pasta']],
    ['Tortilla chips', ['tortilla-chips'], ['tortilla']],
    ['Salad dressing', ['dressing'], ['salad-leaves']],
    ['Pork chops', ['pork-chops'], ['lamb-chops']],
    ['Strawberry yogurt', ['yogurt-sweet'], ['yogurt']],
    ['Greek yogurt', ['yogurt', 'yogurt-sweet'], []],
    ['Tuna steak', ['fish'], ['steak', 'canned-fish']],
    ['Canned tuna', ['canned-fish'], ['fish']],
    ['Smoked salmon', ['smoked-salmon'], ['salmon']],
    ['Frozen spinach', ['cooking-greens'], ['salad-leaves']],
    ['Kale', ['cooking-greens'], ['salad-leaves']],
    ['Leftover rice', ['cooked-rice'], ['rice']],
    ['Leftover pasta', ['cooked-pasta'], ['pasta']],
    ['Rotisserie chicken', ['cooked-chicken'], ['chicken']],
    ['Hot dog buns', ['hotdog-bun'], ['hot-dogs']],
    ['Cherry tomatoes', ['tomato'], ['fruit-fresh']],
    ['Lemons', ['citrus'], ['fruit-smoothie', 'fruit-fresh']],
    ['Corn on the cob', ['corn'], ['sweetcorn']],
    ['Basmati rice', ['rice'], ['risotto-rice']],
    ['Arborio rice', ['risotto-rice'], []],
    ['Coconut milk', ['coconut-milk'], ['milk']],
    ['Oat milk', ['milk'], []],
    ['Pepperoni', ['cured-meat'], ['bell-pepper']],
    ['Veggie burgers', ['veggie-burger'], ['burger-patty']],
    ['Rice cakes', ['crackers'], ['cake']],
    ['English muffins', ['english-muffin'], []],
    ['Frozen berries', ['berries', 'fruit-bake'], ['fruit-fresh']],
    ['Avocados', ['avocado'], ['fruit-fresh', 'fruit-smoothie']],
  ] as const)('%s', (name, has, hasNot) => {
    const roles = rolesFor({ name, category: 'other' });
    for (const r of has) expect({ name, role: r, has: roles.includes(r) }).toEqual({ name, role: r, has: true });
    for (const r of hasNot) expect({ name, role: r, has: roles.includes(r) }).toEqual({ name, role: r, has: false });
  });

  it.each([
    ['Chocolate ice cream', ['ice-cream']],
    ['Graham crackers', ['cookies']],
    ['Fish cakes', ['fish-sticks']],
    ['Pickled jalapeños', ['pickles']],
    ['Naan bread', ['flatbread']],
    ['Garlic bread', []],
    ['Chicken noodle soup', []],
    ['Cream of mushroom soup', []],
    ['Tuna in brine', ['canned-fish']],
    ['Salmon in water', ['canned-fish']],
    ['Beans in tomato sauce', ['baked-beans']],
    ['Chicken breast with lemon', ['chicken']],
    ['2 lb ground beef', ['ground-meat']],
    ['Vegan sausages', ['sausage']],
    ['Mashed potatoes', ['cooked-potato']],
    ['Cooked shrimp', ['shrimp']],
  ] as const)('reads "%s" as a cook would', (name, roles) => {
    expect(rolesFor({ name, category: 'other' })).toEqual(roles);
  });
});

describe('suggestions', () => {
  it('offers lots of ideas from a well-stocked kitchen', () => {
    expect(localSuggestions(kitchen, prefs, NOW, 500).length).toBeGreaterThanOrEqual(150);
  });

  it('keeps each page of six varied and ranked by how much expiring food it uses', () => {
    const pool = filterForDiet(suggestible(kitchen, NOW), prefs.diet);
    const ideas = localSuggestions(kitchen, prefs, NOW, 30);
    for (let page = 0; page < 5; page++) {
      const meals = ideas.slice(page * 6, page * 6 + 6);
      const scores = meals.map((m) => mealScore(m, pool, NOW));
      expect([...scores].sort((a, b) => b - a)).toEqual(scores);
      const families = meals.map((m) => RECIPES.find((r) => r.title === m.title)!.family);
      for (const f of new Set(families)) expect(families.filter((x) => x === f).length).toBeLessThanOrEqual(2);
    }
    // The first page is the same whether one page or several are asked for.
    expect(localSuggestions(kitchen, prefs, NOW).map((m) => m.id)).toEqual(ideas.slice(0, 6).map((m) => m.id));
  });

  it('never lists the same idea twice', () => {
    const ideas = localSuggestions(kitchen, prefs, NOW, 500);
    expect(new Set(ideas.map((m) => m.id)).size).toBe(ideas.length);
  });
});

describe('diets', () => {
  /**
   * Rendered text with the tracked names taken out (those passed the diet filter already). The word
   * "cheese" is fine in an idea that uses a tracked vegan cheese.
   */
  function texts(diet: Diet): string[] {
    return localSuggestions(kitchen, { diet, servings: 2 }, NOW, 500).flatMap((m) => {
      const names = m.uses.map((u) => u.toLowerCase()).sort((a, b) => b.length - a.length);
      const veganCheese = m.uses.includes('Vegan cheese');
      return [m.summary, ...m.extras, ...m.steps].map((t) => {
        const plain = names.reduce((s, n) => s.split(n).join('#'), t.toLowerCase());
        return veganCheese ? plain.replace(/\bcheese\b/g, '#') : plain;
      });
    });
  }
  const offending = (list: string[], allowed: RegExp, banned: RegExp) => list.map((t) => t.replace(allowed, '#')).filter((t) => banned.test(t));

  it('vegetarian ideas need no meat or fish from the shops', () => {
    expect(offending(texts('vegetarian'), /$^/g, /\b(fish sauce|chicken stock|beef stock|chicken broth|anchov\w*|worcestershire|gelatine?|bacon|pancetta)\b/)).toEqual([]);
  });

  it('vegan ideas need no animal products', () => {
    const allowed = /\b(peanut|almond|cashew|nut|vegan|plant) butter\b|\b(plant|coconut|oat|almond|soy) milk\b|\b(oat|coconut) cream\b|\bdairy-free (cream cheese|sour cream|whipped cream|ice cream|yogurt)\b|\bvegan mayonnaise\b|\bbuttery\b/g;
    expect(offending(texts('vegan'), allowed, /\b(butter|milk|cream|yogh?urt|parmesan|cheese|ghee|honey|mayonnaise|eggs?|fish sauce|bacon)\b/)).toEqual([]);
  });

  it('dairy-free ideas need no dairy', () => {
    const allowed = /\b(peanut|almond|cashew|nut|vegan|plant) butter\b|\b(plant|coconut|oat|almond|soy) milk\b|\b(oat|coconut) cream\b|\bdairy-free (cream cheese|sour cream|whipped cream|ice cream|yogurt)\b|\bbuttery\b|\bcoconut milk\b/g;
    expect(offending(texts('dairy-free'), allowed, /\b(butter|milk|cream|yogh?urt|parmesan|ghee)\b/)).toEqual([]);
  });

  it('gluten-free ideas ask for gluten-free versions', () => {
    const allowed = /\bgluten-free (soy sauce|flour|breadcrumbs|teriyaki sauce|hoisin sauce|oyster or hoisin sauce|worcestershire sauce|gravy granules)\b/g;
    expect(offending(texts('gluten-free'), allowed, /\b(soy sauce|flour|breadcrumbs|teriyaki sauce|hoisin sauce|worcestershire sauce|gravy granules)\b/)).toEqual([]);
  });

  it('rewrites wording for the diet but never the names people typed', () => {
    expect(adaptText('Butter or oil', 'vegan')).toBe('Oil');
    expect(adaptText('Whisk in a splash of milk and a knob of butter.', 'dairy-free')).toBe('Whisk in a splash of plant milk and a knob of vegan butter.');
    expect(adaptText('Stock (4 cups / 1 litre)', 'vegetarian')).toBe('Vegetable stock (4 cups / 1 litre)');
    expect(adaptText('Chicken stock (8 cups / 2 litres)', 'vegan')).toBe('Vegetable stock (8 cups / 2 litres)');
    expect(adaptText('Fish sauce or soy sauce', 'vegetarian')).toBe('Soy sauce');
    expect(adaptText('Honey or brown sugar', 'vegan')).toBe('Maple syrup or brown sugar');
    expect(adaptText('Soy sauce', 'gluten-free')).toBe('Gluten-free soy sauce');
    expect(adaptText('Peanut butter and coconut milk', 'vegan')).toBe('Peanut butter and coconut milk');
    const items = [mk('1', 'Oat milk', '2026-10-01', { category: 'drinks' }), mk('2', 'Rolled oats', '2027-01-01', { category: 'grains' })];
    const porridge = localSuggestions(items, { diet: 'vegan', servings: 2 }, NOW).find((m) => m.title === 'Warm fruit porridge');
    expect(porridge?.steps[0]).toContain('of the oat milk');
  });
});

describe('AI ideas', () => {
  const items = [
    mk('1', 'Ice cream', '2026-10-01', { category: 'dairy' }),
    mk('2', 'Carrots', '2026-10-01', { category: 'produce' }),
    mk('3', 'Strawberry yogurt', '2026-10-01', { category: 'dairy' }),
    mk('4', 'Greek yogurt', '2026-10-01', { category: 'dairy' }),
    mk('5', 'Chicken thighs', '2026-10-01', { category: 'meat' }),
  ];

  it('drops an idea that puts dessert food into a savoury dish', () => {
    expect(plausibleMeal({ title: 'Creamy carrot soup', uses: ['Carrots', 'Ice cream'] }, items)).toBe(false);
    expect(plausibleMeal({ title: 'Chicken curry', uses: ['Chicken thighs', 'Strawberry yogurt'] }, items)).toBe(false);
  });

  it('keeps sensible ideas, sweet or savoury', () => {
    expect(plausibleMeal({ title: 'Creamy carrot soup', uses: ['Carrots', 'Greek yogurt'] }, items)).toBe(true);
    expect(plausibleMeal({ title: 'Chicken curry', uses: ['Chicken thighs', 'Greek yogurt'] }, items)).toBe(true);
    expect(plausibleMeal({ title: 'Strawberry milkshake', uses: ['Ice cream', 'Strawberry yogurt'] }, items)).toBe(true);
    expect(plausibleMeal({ title: 'Ice cream sandwiches', uses: ['Ice cream'] }, items)).toBe(true);
  });
});
