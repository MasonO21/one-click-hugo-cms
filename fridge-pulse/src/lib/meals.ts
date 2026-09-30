import { todayISO } from './dates';
import { active, daysLeft, normalizeName, sortByExpiry } from './expiry';
import type { Diet, Meal, MealPrefs, PantryItem } from './types';

// ---------------------------------------------------------------------------
// Diet filtering
// ---------------------------------------------------------------------------

type Tag = 'meat' | 'dairy' | 'egg' | 'gluten';

const PLANT_MILK = /\b(oat|almond|soy|coconut|plant|vegan|cashew|rice)\b/;

function itemTags(item: PantryItem): Tag[] {
  const name = item.name.toLowerCase();
  const tags: Tag[] = [];
  if (item.category === 'meat' || item.category === 'seafood') tags.push('meat');
  if (/\b(chicken|beef|pork|bacon|sausages?|ham|turkey|lamb|veal|venison|duck|steak|mince|salami|pepperoni|prosciutto|chorizo|salmon|fish|shrimp|prawns?|tuna|sardines?|anchov(y|ies)|crab|lobster|scallops?|mussels|clams|oysters|squid)\b/.test(name)) tags.push('meat');
  if (/\beggs?\b/.test(name)) tags.push('egg');
  if (
    (item.category === 'dairy' || /\b(milk|yogh?urt|cheese|butter|cream|kefir|ghee)\b/.test(name)) &&
    !/\beggs?\b/.test(name) &&
    !PLANT_MILK.test(name) &&
    // Nut and seed butters are not dairy.
    !/\b(peanut|almond|cashew|hazelnut|nut|seed|apple|cocoa) butter\b/.test(name)
  ) {
    tags.push('dairy');
  }
  if (
    /\b(bread|breadcrumbs|bagel|bun|roll|baguette|sourdough|croissant|brioche|muffin|crumpet|naan|pita|wrap|tortilla|pasta|spaghetti|penne|macaroni|lasagn[ae]|ravioli|tortellini|gnocchi|noodle|ramen|udon|flour|dough|pizza|cereal|granola|cracker|pretzel|cookie|biscuit|cake|brownie|pie|waffle|pancake|couscous|bulgur|barley|beer)s?\b/.test(name) &&
    !/\b(corn|rice|gluten.?free)\b/.test(name)
  ) {
    tags.push('gluten');
  }
  return tags;
}

const FORBIDDEN: Record<Diet, Tag[]> = {
  none: [],
  vegetarian: ['meat'],
  vegan: ['meat', 'dairy', 'egg'],
  'gluten-free': ['gluten'],
  'dairy-free': ['dairy'],
};

export function filterForDiet(items: PantryItem[], diet: Diet): PantryItem[] {
  const banned = FORBIDDEN[diet];
  if (banned.length === 0) return items;
  return items.filter((i) => !itemTags(i).some((t) => banned.includes(t)));
}

/** Items that may go into a meal suggestion: tracked, and not past their date. */
export function suggestible(items: PantryItem[], now: Date = new Date()): PantryItem[] {
  return active(items).filter((i) => daysLeft(i, now) >= 0);
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

/** How much using an item now matters: sooner expiry weighs more. */
export function urgencyWeight(days: number): number {
  if (days <= 0) return 6;
  if (days <= 3) return 4;
  if (days <= 7) return 2;
  return 1;
}

export function matchTracked(name: string, items: PantryItem[]): PantryItem | undefined {
  const n = normalizeName(name);
  if (!n) return undefined;
  const named = items.filter((i) => normalizeName(i.name) !== '');
  return (
    named.find((i) => normalizeName(i.name) === n) ??
    named.find((i) => n.includes(normalizeName(i.name)) || normalizeName(i.name).includes(n))
  );
}

/** A meal's ingredient list without repeats (the AI, or two tracked "Carrots", can name one twice). */
export function uniqueUses(uses: string[]): string[] {
  const seen = new Set<string>();
  return uses.filter((u) => {
    const k = normalizeName(u);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function mealScore(meal: Meal, items: PantryItem[], now: Date = new Date()): number {
  const seen = new Set<string>();
  let score = 0;
  for (const name of meal.uses) {
    const item = matchTracked(name, items);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    score += urgencyWeight(daysLeft(item, now));
  }
  return score;
}

export function rankMeals(meals: Meal[], items: PantryItem[], now: Date = new Date()): Meal[] {
  return meals
    .map((meal) => ({ meal, score: mealScore(meal, items, now) }))
    .sort((a, b) => b.score - a.score || a.meal.extras.length - b.meal.extras.length || a.meal.minutes - b.meal.minutes)
    .map(({ meal }) => meal);
}

/** Stable key for caching suggestions: changes when relevant inventory, prefs or the day changes. */
export function suggestionKey(items: PantryItem[], prefs: MealPrefs, now: Date = new Date()): string {
  // Name and category too: renaming a misread "Chicken thighs" to "Tofu" must bring new ideas.
  const ids = suggestible(items, now)
    .map((i) => `${i.id}:${i.expiresOn}:${normalizeName(i.name)}:${i.category}`)
    .sort()
    .join(',');
  return `${todayISO(now)}|${prefs.diet}|${prefs.servings}|${ids}`;
}

// ---------------------------------------------------------------------------
// Local (offline) recipe ideas
// ---------------------------------------------------------------------------

interface Slot {
  label: string;
  test: (i: PantryItem) => boolean;
  /** Minimum distinct matching items (default 1). */
  min?: number;
  /** Maximum items to use (default 2). */
  max?: number;
  /** Allow leftovers (cooked food) to fill this slot. Off by default: they are not raw ingredients. */
  leftovers?: boolean;
}

interface Recipe {
  id: string;
  title: string;
  summary: string;
  minutes: number;
  extras: string[];
  steps: string[];
  required: Slot[];
  optional?: Slot[];
}

const name = (re: RegExp) => (i: PantryItem) => re.test(i.name.toLowerCase());
const cat = (...c: PantryItem['category'][]) => (i: PantryItem) => c.includes(i.category);
const any = (...tests: ((i: PantryItem) => boolean)[]) => (i: PantryItem) => tests.some((t) => t(i));

const isEgg = name(/\beggs?\b/);
const isCheese = name(/\bcheese|cheddar|parmesan|mozzarella|feta\b/);
const FRUIT = /\b(bananas?|apples?|grapes?|oranges?|clementines?|mango|peach|pears?|lemons?|limes?|melon|pineapple|kiwi|plums?|cherr)|berr/;
const isVeg = (i: PantryItem) => i.category === 'produce' && !FRUIT.test(i.name.toLowerCase());
const isFruit = (i: PantryItem) => i.category === 'produce' && !isVeg(i);
const isMeat = any(cat('meat'), name(/\b(chicken|beef|pork|bacon|sausage|ham|turkey)\b/));
const isTortilla = name(/\b(tortillas?|wraps?)\b/);
const isBread = name(/\b(bread|bagels?|sourdough|baguettes?|buns?|rolls?|brioche)\b/);
const isPasta = name(/\b(pasta|spaghetti|noodles?|penne|macaroni)\b/);
const isRice = any(name(/\brice\b/), name(/\bquinoa\b/));
const isGreens = name(/\b(lettuce|spinach|arugula|kale|greens|salad)\b/);
const isMilky = name(/\b(milk|yogh?urt|kefir)\b/);

const RECIPES: Recipe[] = [
  {
    id: 'omelet',
    title: 'Loaded omelet',
    summary: 'Eggs folded around whatever veg and cheese needs using.',
    minutes: 10,
    extras: ['Butter or oil', 'Salt', 'Pepper'],
    steps: [
      'Whisk 2-3 eggs per person with a pinch of salt.',
      'Saute the chopped veg in a little butter or oil until soft, 2-3 minutes.',
      'Pour in the eggs and cook gently until nearly set.',
      'Add cheese or other fillings, fold, and serve.',
    ],
    required: [{ label: 'eggs', test: isEgg, max: 1 }],
    optional: [
      { label: 'veg', test: isVeg, max: 3 },
      { label: 'cheese', test: isCheese, max: 1 },
      { label: 'ham', test: name(/\b(ham|bacon|sausage)\b/), max: 1 },
    ],
  },
  {
    id: 'stir-fry',
    title: 'Clear-the-crisper stir-fry',
    summary: 'Fast, hot pan, any mix of vegetables plus a protein.',
    minutes: 20,
    extras: ['Soy sauce', 'Oil', 'Garlic or ginger (optional)'],
    steps: [
      'Slice everything small and even so it cooks quickly.',
      'Heat oil in a wide pan until shimmering; cook protein first and set aside.',
      'Stir-fry the hardest veg first, then softer ones, 4-6 minutes total.',
      'Return the protein, add soy sauce, and toss for a minute. Serve over rice or noodles.',
    ],
    required: [{ label: 'veg', test: isVeg, min: 2, max: 4 }],
    optional: [
      { label: 'protein', test: any(isMeat, name(/\b(tofu|shrimp|prawns?)\b/)), max: 1 },
      { label: 'starch', test: any(isRice, isPasta), max: 1 },
    ],
  },
  {
    id: 'fried-rice',
    title: 'Fried rice',
    summary: 'Turns leftover rice and odds and ends into dinner.',
    minutes: 15,
    extras: ['Soy sauce', 'Oil'],
    steps: [
      'Heat oil in a large pan over high heat.',
      'Cook diced veg and any protein for 3-4 minutes.',
      'Push to the side, scramble an egg if you have one, then add the rice.',
      'Toss with soy sauce until the rice is hot and slightly crisp.',
    ],
    required: [{ label: 'rice', test: any(isRice, name(/\brice\b/)), max: 1, leftovers: true }],
    optional: [
      { label: 'egg', test: isEgg, max: 1 },
      { label: 'veg', test: isVeg, max: 3 },
      { label: 'protein', test: isMeat, max: 1 },
    ],
  },
  {
    id: 'soup',
    title: 'Everything-in soup',
    summary: 'Simmer tired vegetables into something warm.',
    minutes: 35,
    extras: ['Stock or water', 'Olive oil', 'Salt', 'Pepper'],
    steps: [
      'Dice the veg. Soften onion or the firmest veg in oil for 5 minutes.',
      'Add the rest, cover with stock or water, and simmer 20 minutes.',
      'Blend for a smooth soup or leave it chunky. Season to taste.',
    ],
    required: [{ label: 'veg', test: isVeg, min: 2, max: 5 }],
    optional: [{ label: 'cream', test: name(/\b(cream|yogh?urt)\b/), max: 1 }],
  },
  {
    id: 'smoothie',
    title: 'Rescue smoothie',
    summary: 'Ripe fruit plus milk or yogurt, blended.',
    minutes: 5,
    extras: ['Ice (optional)', 'Honey (optional)'],
    steps: ['Add fruit and milk or yogurt to a blender.', 'Blend until smooth, adding ice or honey to taste.'],
    required: [
      { label: 'fruit', test: isFruit, max: 3 },
      { label: 'milk or yogurt', test: isMilky, max: 1 },
    ],
  },
  {
    id: 'quesadilla',
    title: 'Crispy quesadillas',
    summary: 'Tortillas, cheese, and whatever else is nearby.',
    minutes: 12,
    extras: ['Oil or butter'],
    steps: [
      'Fill half of each tortilla with cheese and chopped fillings.',
      'Fold and cook in a lightly oiled pan 2-3 minutes per side until crisp.',
      'Slice and serve with salsa or sour cream.',
    ],
    required: [
      { label: 'tortillas', test: isTortilla, max: 1 },
      { label: 'cheese', test: isCheese, max: 1 },
    ],
    optional: [
      { label: 'protein', test: isMeat, max: 1 },
      { label: 'veg', test: isVeg, max: 2 },
    ],
  },
  {
    id: 'pasta',
    title: 'Use-it-up pasta',
    summary: 'Pasta tossed with sauteed veg and a little cheese.',
    minutes: 20,
    extras: ['Olive oil', 'Garlic', 'Salt', 'Pepper'],
    steps: [
      'Boil pasta in well-salted water until just tender; save a cup of the water.',
      'Saute garlic and chopped veg in olive oil until soft.',
      'Toss the pasta in the pan with a splash of pasta water until glossy.',
      'Finish with cheese and pepper.',
    ],
    required: [{ label: 'pasta', test: isPasta, max: 1 }],
    optional: [
      { label: 'veg', test: isVeg, max: 3 },
      { label: 'cheese', test: isCheese, max: 1 },
      { label: 'protein', test: any(name(/\b(sausage|bacon|ham|chicken)\b/)), max: 1 },
    ],
  },
  {
    id: 'salad',
    title: 'Big fridge salad',
    summary: 'Greens first, then whatever else needs eating.',
    minutes: 10,
    extras: ['Olive oil', 'Vinegar or lemon', 'Salt'],
    steps: [
      'Tear the greens into a large bowl.',
      'Add chopped veg, cheese, and any cooked protein or egg.',
      'Dress with oil, vinegar or lemon, and salt just before serving.',
    ],
    required: [{ label: 'greens', test: isGreens, max: 1 }],
    optional: [
      { label: 'veg', test: (i) => isVeg(i) && !isGreens(i), max: 3 },
      { label: 'cheese', test: isCheese, max: 1 },
      { label: 'protein', test: any(isMeat, isEgg), max: 1 },
    ],
  },
  {
    id: 'french-toast',
    title: 'French toast',
    summary: 'Day-old bread plus eggs and milk.',
    minutes: 15,
    extras: ['Butter', 'Cinnamon', 'Maple syrup (optional)'],
    steps: [
      'Whisk eggs with a splash of milk and cinnamon.',
      'Soak bread slices for a few seconds per side.',
      'Fry in butter until golden on both sides. Top with fruit or syrup.',
    ],
    required: [
      { label: 'bread', test: isBread, max: 1 },
      { label: 'eggs', test: isEgg, max: 1 },
    ],
    optional: [
      { label: 'milk', test: name(/\bmilk\b/), max: 1 },
      { label: 'fruit', test: isFruit, max: 2 },
    ],
  },
  {
    id: 'roast',
    title: 'Sheet-pan roast',
    summary: 'One pan, high heat, minimal cleanup.',
    minutes: 40,
    extras: ['Olive oil', 'Salt', 'Pepper', 'Dried herbs (optional)'],
    steps: [
      'Heat the oven to 425F / 220C.',
      'Cut veg and protein into similar-sized pieces, toss with oil, salt, and pepper.',
      'Roast on a single layer for 25-35 minutes, turning once, until browned and cooked through.',
    ],
    required: [{ label: 'veg', test: isVeg, min: 2, max: 4 }],
    optional: [{ label: 'protein', test: any(isMeat, name(/\b(salmon|fish)\b/)), max: 1 }],
  },
  {
    id: 'tacos',
    title: 'Quick tacos',
    summary: 'Tortillas with a savory filling and fresh toppings.',
    minutes: 20,
    extras: ['Taco seasoning or cumin', 'Salsa (optional)'],
    steps: [
      'Brown the filling with seasoning until cooked through.',
      'Warm the tortillas in a dry pan.',
      'Fill and top with chopped veg, cheese, and salsa.',
    ],
    required: [
      { label: 'tortillas', test: isTortilla, max: 1 },
      { label: 'filling', test: any(isMeat, name(/\b(beans?|tofu)\b/)), max: 1 },
    ],
    optional: [
      { label: 'veg', test: isVeg, max: 2 },
      { label: 'cheese', test: isCheese, max: 1 },
    ],
  },
  {
    id: 'grain-bowl',
    title: 'Grain bowl',
    summary: 'Rice or quinoa topped with veg and protein.',
    minutes: 25,
    extras: ['Olive oil or dressing', 'Salt'],
    steps: [
      'Cook or reheat the grain.',
      'Roast or saute the veg and warm any protein.',
      'Pile onto the grain and finish with a drizzle of dressing.',
    ],
    required: [
      { label: 'grain', test: isRice, max: 1 },
      { label: 'veg', test: isVeg, max: 3 },
    ],
    optional: [{ label: 'protein', test: any(isMeat, isEgg, name(/\btofu\b/)), max: 1 }],
  },
];

function fillSlot(slot: Slot, pool: PantryItem[], used: Set<string>): PantryItem[] {
  const hits = sortByExpiry(
    pool.filter((i) => !used.has(i.id) && (slot.leftovers || i.category !== 'leftovers') && slot.test(i)),
  );
  if (hits.length < (slot.min ?? 1)) return [];
  return hits.slice(0, slot.max ?? 2);
}

export function localSuggestions(
  items: PantryItem[],
  prefs: MealPrefs,
  now: Date = new Date(),
  limit = 6,
): Meal[] {
  const pool = filterForDiet(suggestible(items, now), prefs.diet);
  const meals: Meal[] = [];

  for (const recipe of RECIPES) {
    const used = new Set<string>();
    const chosen: PantryItem[] = [];
    let feasible = true;

    for (const slot of recipe.required) {
      const hits = fillSlot(slot, pool, used);
      if (hits.length === 0) {
        feasible = false;
        break;
      }
      hits.forEach((h) => used.add(h.id));
      chosen.push(...hits);
    }
    if (!feasible) continue;

    for (const slot of recipe.optional ?? []) {
      const hits = fillSlot(slot, pool, used);
      hits.forEach((h) => used.add(h.id));
      chosen.push(...hits);
    }

    meals.push({
      id: `local-${recipe.id}`,
      title: recipe.title,
      summary: recipe.summary,
      minutes: recipe.minutes,
      servings: prefs.servings,
      uses: uniqueUses(chosen.map((c) => c.name)),
      extras: recipe.extras,
      steps: recipe.steps,
      source: 'local',
    });
  }

  return rankMeals(meals, pool, now).slice(0, limit);
}
