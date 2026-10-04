import { todayISO } from './dates';
import { active, daysLeft, normalizeName, sortByExpiry } from './expiry';
import { rolesFor, type Role } from './ingredients';
import { mealNutrition, type Portion } from './nutrition';
import { RECIPES, type Cond, type Course, type Line, type Recipe, type Slot } from './recipes';
import type { Diet, Meal, MealPrefs, PantryItem } from './types';

// ---------------------------------------------------------------------------
// Diet filtering
// ---------------------------------------------------------------------------

type Tag = 'meat' | 'dairy' | 'egg' | 'gluten' | 'honey';

const PLANT_MILK = /\b(oat|almond|soy|soya|coconut|plant|vegan|cashew|rice|hemp|pea|macadamia|hazelnut) (milk|drink|beverage|cream|yogh?urt|cheese|butter|creamer)\b/;

/** Plant-based versions of meat and dairy foods ("veggie sausages", "vegan mayo", "Quorn mince"). */
const PLANT_BASED = /\b(vegan|veggie|vegetarian|plant[- ]based|meatless|meat[- ]free|dairy[- ]free|quorn|beyond|impossible|tofu|soy|soya|seitan|tempeh|jackfruit)\b/;

function itemTags(item: PantryItem): Tag[] {
  const name = item.name.toLowerCase();
  const tags: Tag[] = [];
  const plant = PLANT_BASED.test(name);
  if ((item.category === 'meat' || item.category === 'seafood') && !plant) tags.push('meat');
  if (
    !plant &&
    /\b(chicken|beef|pork|bacon|sausages?|ham|turkey|lamb|veal|venison|duck|steak|mince|salami|pepperoni|prosciutto|chorizo|pancetta|lardons|gelatine?|lard|bone broth|salmon|fish|shrimp|prawns?|tuna|sardines?|anchov(y|ies)|crab|lobster|scallops?|mussels|clams|oysters|squid|worcestershire|caesar)\b/.test(name)
  ) {
    tags.push('meat');
  }
  if (!plant && /\b(eggs?|mayo|mayonnaise|aioli)\b/.test(name)) tags.push('egg');
  if (/\bhoney\b/.test(name) && !/\bhoneydew\b/.test(name)) tags.push('honey');
  if (
    (item.category === 'dairy' || /\b(milk|yogh?urt|cheese|butter|cream|kefir|ghee|custard|paneer|halloumi|mozzarella|feta|parmesan|ricotta|mascarpone|gelato|whey)\b/.test(name)) &&
    !/\beggs?\b/.test(name) &&
    !PLANT_MILK.test(name) &&
    !plant &&
    // Nut and seed butters are not dairy.
    !/\b(peanut|almond|cashew|hazelnut|nut|seed|apple|cocoa) butter\b/.test(name)
  ) {
    tags.push('dairy');
  }
  if (
    /\b(bread|breadcrumbs|panko|bagel|bun|roll|baguette|sourdough|ciabatta|focaccia|croissant|brioche|muffin|crumpet|naan|pita|pitta|flatbread|wrap|tortilla|pasta|spaghetti|penne|macaroni|linguine|fettuccine|fusilli|rigatoni|orzo|lasagn[ae]|ravioli|tortellini|gnocchi|noodle|ramen|udon|flour|dough|pizza|cereal|granola|cracker|pretzel|cookie|biscuit|cake|brownie|pie|waffle|pancake|couscous|bulgur|barley|farro|spelt|rye|seitan|beer|soy sauce|teriyaki|hoisin|dumpling|crouton)s?\b/.test(name) &&
    !/\b(corn|rice|gluten.?free|buckwheat)\b/.test(name)
  ) {
    tags.push('gluten');
  }
  return tags;
}

const FORBIDDEN: Record<Diet, Tag[]> = {
  none: [],
  vegetarian: ['meat'],
  vegan: ['meat', 'dairy', 'egg', 'honey'],
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

/** Each food's culinary roles, worked out once per call. */
export type RoleIndex = Map<string, Set<Role>>;

export function indexRoles(pool: PantryItem[]): RoleIndex {
  return new Map(pool.map((i) => [i.id, new Set(rolesFor(i))]));
}

/** A recipe with tracked food assigned to its slots. */
export interface FilledRecipe {
  recipe: Recipe;
  /** Slot key to the foods in it, soonest to expire first. */
  slots: Map<string, PantryItem[]>;
  /** Roles the used foods filled their slots as. */
  roles: Set<Role>;
  chosen: PantryItem[];
}

const FROZEN = /\bfrozen\b/i;
/** One idea never marks more than this many items used: optional extras stop here. */
export const MAX_USES = 8;

/** Whether a food can go in a slot: it has one of the slot's roles (and is fresh when it must be). */
export function slotAccepts(slot: Slot, item: Pick<PantryItem, 'name' | 'category'>, roles: Iterable<Role> = rolesFor(item)): boolean {
  if (slot.fresh && FROZEN.test(item.name)) return false;
  const have = new Set(roles);
  return slot.roles.some((r) => have.has(r));
}

/**
 * Fills a recipe's slots from the pool, soonest-expiring food first. Null when a required slot
 * cannot be filled. Two items with the same name count once.
 */
interface Entry {
  item: PantryItem;
  name: string;
  /** Position soonest-to-expire first. */
  rank: number;
}

/**
 * The pool soonest-first and grouped by role, worked out once per pool and role index (every recipe
 * fills from the same ones), so a slot only looks at food that could fill it.
 */
const prepared = new WeakMap<RoleIndex, { pool: PantryItem[]; byRole: Map<Role, Entry[]> }>();
function byRole(pool: PantryItem[], index: RoleIndex): Map<Role, Entry[]> {
  const cached = prepared.get(index);
  if (cached && cached.pool === pool) return cached.byRole;
  const groups = new Map<Role, Entry[]>();
  sortByExpiry(pool).forEach((item, rank) => {
    const entry = { item, name: normalizeName(item.name), rank };
    for (const role of index.get(item.id) ?? []) {
      const list = groups.get(role);
      if (list) list.push(entry);
      else groups.set(role, [entry]);
    }
  });
  prepared.set(index, { pool, byRole: groups });
  return groups;
}

export function fillRecipe(recipe: Recipe, pool: PantryItem[], index: RoleIndex = indexRoles(pool)): FilledRecipe | null {
  const groups = byRole(pool, index);
  const used = new Set<string>();
  const slots = new Map<string, PantryItem[]>();
  const roles = new Set<Role>();
  const chosen: PantryItem[] = [];

  const take = (slot: Slot, optional = false): boolean => {
    // Everything with one of the slot's roles, soonest to expire first.
    const seen = new Set<string>();
    const candidates: Entry[] = [];
    for (const role of slot.roles) {
      for (const entry of groups.get(role) ?? []) {
        if (seen.has(entry.item.id)) continue;
        seen.add(entry.item.id);
        candidates.push(entry);
      }
    }
    if (slot.roles.length > 1) candidates.sort((a, b) => a.rank - b.rank);
    const names = new Set<string>();
    const hits: PantryItem[] = [];
    for (const { item, name } of candidates) {
      if (used.has(item.id) || names.has(name) || (slot.fresh && FROZEN.test(item.name))) continue;
      names.add(name);
      hits.push(item);
    }
    const room = optional ? MAX_USES - chosen.length : Infinity;
    if (hits.length < (slot.min ?? 1) || room < (slot.min ?? 1)) return false;
    const picked = hits.slice(0, Math.min(slot.max ?? 1, room));
    for (const item of picked) {
      used.add(item.id);
      const have = index.get(item.id);
      for (const r of slot.roles) if (have?.has(r)) roles.add(r);
    }
    slots.set(slot.key, picked);
    chosen.push(...picked);
    return true;
  };

  for (const slot of recipe.needs) if (!take(slot)) return null;
  if (recipe.anyOf) {
    // Fill every alternative that can be filled; at least one must be.
    const filled = recipe.anyOf.map((slot) => take(slot));
    if (!filled.some(Boolean)) return null;
  }
  for (const slot of recipe.optional ?? []) take(slot, true);
  return { recipe, slots, roles, chosen };
}

function holds(cond: Cond, filled: FilledRecipe): boolean {
  const list = Array.isArray(cond) ? cond : [cond];
  return list.some((c) => (c.startsWith('@') ? filled.roles.has(c.slice(1) as Role) : (filled.slots.get(c)?.length ?? 0) > 0));
}

function applies(line: Line, filled: FilledRecipe): boolean {
  if (typeof line === 'string') return true;
  return (line.if === undefined || holds(line.if, filled)) && (line.unless === undefined || !holds(line.unless, filled));
}

/** Words that keep their capital in the middle of a sentence. */
const PROPER = /^(American|Greek|Italian|French|English|Swiss|Monterey|Dijon|Thai|Spanish|Mexican|Japanese|Chinese|Korean|Indian|Brussels|Parma|Serrano|Cumberland|Toulouse|Granny|Yukon|Maris|Kalamata|Black Forest|Philadelphia)\b/;

/** "Bell peppers" reads "bell peppers" mid-sentence; "BBQ sauce" and "Greek yogurt" keep their capitals. */
export function displayName(name: string): string {
  const t = name.trim().replace(/\s+/g, ' ');
  return /^[A-Z][a-z]/.test(t) && !PROPER.test(t) ? t[0].toLowerCase() + t.slice(1) : t;
}

/** "a", "a and b", "a, b and c". */
export function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Keeps a leading capital when swapping words at the start of a line. */
function sameCase(original: string, replacement: string): string {
  return /^[A-Z]/.test(original) ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
}

type Rewrite = [RegExp, string | ((match: string, ...groups: string[]) => string)];

const MEATLESS: Rewrite[] = [
  [/\bfish sauce \(or soy sauce\)|\bfish sauce or soy sauce\b|\bfish sauce\b/gi, (m) => sameCase(m, 'soy sauce')],
  [/\bWorcestershire sauce\b/gi, (m) => sameCase(m, 'soy sauce')],
  [/\boyster or hoisin sauce\b/gi, (m) => sameCase(m, 'hoisin sauce')],
  [/\b(?:(chicken|beef|fish|bone|beef or vegetable|vegetable|veggie) )?(stock|broth)\b/gi, (m, kind?: string) => (kind && /^(vegetable|veggie)$/i.test(kind) ? m : sameCase(m, 'vegetable stock'))],
];

const NO_DAIRY: Rewrite[] = [
  [/\bbutter or (olive )?oil\b/gi, (m, olive?: string) => sameCase(m, `${olive ?? ''}oil`)],
  [/\b(olive )?oil or butter\b/gi, (m, olive?: string) => sameCase(m, `${olive ?? ''}oil`)],
  [/\b(?:(peanut|nut|almond|cashew|vegan|plant|apple|cocoa) )?butter\b/gi, (m, kind?: string) => (kind ? m : sameCase(m, 'vegan butter'))],
  [/\b(?:(plant|oat|almond|soy|coconut|rice|dairy-free) )?milk\b/gi, (m, kind?: string) => (kind ? m : sameCase(m, 'plant milk'))],
  [/\b(?:(ice|sour|whipped|coconut|oat|soy|heavy|single|double|whipping) )?cream( cheese)?\b/gi, (m, kind?: string, cheese?: string) => {
    if (cheese) return sameCase(m, 'dairy-free cream cheese');
    if (kind && /^(coconut|oat|soy)$/i.test(kind)) return m;
    if (kind && /^(ice|sour|whipped)$/i.test(kind)) return sameCase(m, `dairy-free ${kind.toLowerCase()} cream`);
    return sameCase(m, 'oat cream');
  }],
  [/\b(?:(dairy-free|coconut|soy|vegan|plant) )?yogh?urt\b/gi, (m, kind?: string) => (kind ? m : sameCase(m, 'dairy-free yogurt'))],
  [/\bparmesan( or pecorino)?\b/gi, (m) => sameCase(m, 'nutritional yeast')],
];

const VEGAN_ONLY: Rewrite[] = [
  [/\bhoney or (maple syrup|brown sugar|sugar)\b/gi, (m, other: string) => sameCase(m, other === 'maple syrup' ? 'maple syrup' : `maple syrup or ${other}`)],
  [/\bhoney\b/gi, (m) => sameCase(m, 'maple syrup')],
  [/\b(?:(vegan) )?mayonnaise\b/gi, (m, kind?: string) => (kind ? m : sameCase(m, 'vegan mayonnaise'))],
];

const GLUTEN_FREE: Rewrite[] = [
  [/\b(?:(gluten-free) )?(soy sauce|teriyaki sauce|hoisin sauce|oyster or hoisin sauce|Worcestershire sauce|breadcrumbs|gravy granules|flour)\b/gi, (m, gf?: string) => (gf ? m : sameCase(m, `gluten-free ${m.toLowerCase().replace(/^worcestershire/, 'Worcestershire')}`))],
];

const REWRITES: Record<Diet, Rewrite[]> = {
  none: [],
  vegetarian: MEATLESS,
  vegan: [...MEATLESS, ...NO_DAIRY, ...VEGAN_ONLY],
  'dairy-free': NO_DAIRY,
  'gluten-free': GLUTEN_FREE,
};

/** Recipe wording for a diet: "milk" becomes "plant milk" for vegans, "stock" "vegetable stock" for vegetarians. */
export function adaptText(text: string, diet: Diet): string {
  return REWRITES[diet].reduce((t, [re, to]) => t.replace(re, to as (m: string, ...g: string[]) => string), text);
}

const PLACEHOLDER = /\{([\w-]+)(?::(one))?(?:\|([^}]*))?\}/g;

/** "Lemons" -> "lemon" for "a squeeze of lemon juice". */
export function singular(name: string): string {
  return name.replace(/\w+$/, (w) =>
    /ies$/i.test(w) ? `${w.slice(0, -3)}y` : /(o|ch|sh|x)es$/i.test(w) ? w.slice(0, -2) : /[^s]s$/i.test(w) ? w.slice(0, -1) : w,
  );
}

/**
 * A recipe line for this meal: placeholders become the foods used ("{veg}" -> "spinach and bell
 * peppers", "{stock|stock}" -> the tracked broth or the word "stock"), and the wording suits the diet.
 * Names the person typed are never rewritten.
 */
export function renderLine(text: string, filled: FilledRecipe, diet: Diet): string {
  const parts: string[] = [];
  let last = 0;
  for (const m of text.matchAll(PLACEHOLDER)) {
    parts.push(adaptText(text.slice(last, m.index), diet));
    const items = filled.slots.get(m[1]) ?? [];
    const names = uniqueUses(items.map((i) => (m[2] ? singular(displayName(i.name)) : displayName(i.name))));
    parts.push(items.length > 0 ? listNames(uniqueUses(names)) : adaptText(m[3] ?? '', diet));
    last = m.index + m[0].length;
  }
  parts.push(adaptText(text.slice(last), diet));
  return parts.join('');
}

const lineText = (line: Line) => (typeof line === 'string' ? line : line.text);

/**
 * Typical portions per serving for foods whose listed portion is one of several on a plate: two eggs
 * in an omelette, two slices in a sandwich, a few wings.
 */
const PORTIONS_PER_SERVING: Partial<Record<Role, number>> = {
  egg: 2,
  bread: 2,
  'crusty-bread': 2,
  tortilla: 2,
  'corn-tortilla': 2,
  bacon: 2,
  sausage: 2,
  'chicken-wings': 5,
  'chicken-bone-in': 2,
  cookies: 2,
};

/**
 * How many typical portions of each food go into one serving: about one from each slot the recipe
 * needs (a little more, shared, when the slot holds several foods), half as much from an optional slot.
 */
export function servingPortions(filled: FilledRecipe): Portion[] {
  const { recipe } = filled;
  const slots = new Map([...recipe.needs, ...(recipe.anyOf ?? []), ...(recipe.optional ?? [])].map((slot) => [slot.key, slot]));
  const optional = new Set((recipe.optional ?? []).map((slot) => slot.key));
  const parts: Portion[] = [];
  for (const [key, items] of filled.slots) {
    if (items.length === 0) continue;
    const share = ((optional.has(key) ? 0.5 : 1) * Math.min(1 + 0.5 * (items.length - 1), 2)) / items.length;
    for (const item of items) {
      const have = new Set(rolesFor(item));
      const role = slots.get(key)?.roles.find((r) => have.has(r));
      parts.push({ name: item.name, portions: share * ((role && PORTIONS_PER_SERVING[role]) || 1) });
    }
  }
  return parts;
}

/** Most protein per serving first; ideas without figures go last, in their original order. */
export function byProtein(meals: Meal[]): Meal[] {
  return meals
    .map((m, i) => ({ m, i }))
    .sort((a, b) => (b.m.nutrition?.protein ?? -1) - (a.m.nutrition?.protein ?? -1) || a.i - b.i)
    .map(({ m }) => m);
}

/** Turns a filled recipe into a meal suggestion. */
export function toMeal(filled: FilledRecipe, prefs: MealPrefs): Meal {
  const { recipe } = filled;
  const render = (lines: Line[]) => lines.filter((l) => applies(l, filled)).map((l) => renderLine(lineText(l), filled, prefs.diet));
  // "Garlic" is not an extra to buy when tracked garlic fills the garlic slot.
  const tracked = (line: Line) => (filled.slots.get(lineText(line).toLowerCase())?.length ?? 0) > 0;
  const extras = render(recipe.extras.filter((l) => !tracked(l)));
  return {
    id: `local-${recipe.id}`,
    title: recipe.title,
    summary: adaptText(recipe.summary, prefs.diet),
    minutes: recipe.minutes,
    servings: prefs.servings,
    uses: uniqueUses(filled.chosen.map((c) => c.name)),
    extras,
    steps: render(recipe.steps),
    source: 'local',
    nutrition: mealNutrition(servingPortions(filled), extras),
  };
}

/** Main dishes first when two ideas use the food equally well. */
const COURSE_ORDER: Record<Course, number> = { main: 0, breakfast: 1, side: 2, snack: 2, dessert: 3, drink: 3 };
/** Ideas per page, and how many of one family a page may hold. */
const PAGE = 6;
const PER_FAMILY = 2;

/**
 * Offline meal ideas from the built-in recipes, best first: the ones that use the most food that is
 * about to expire. Each page of six holds at most two of a kind (two pastas, two soups), so the list
 * stays varied; within a page the order is strictly by score.
 */
export function localSuggestions(items: PantryItem[], prefs: MealPrefs, now: Date = new Date(), limit = PAGE): Meal[] {
  const pool = filterForDiet(suggestible(items, now), prefs.diet);
  if (pool.length === 0) return [];
  const index = indexRoles(pool);

  // The same score as mealScore (first tracked item with each name), without searching the pool per use.
  const firstByName = new Map<string, PantryItem>();
  for (const i of pool) {
    const n = normalizeName(i.name);
    if (n && !firstByName.has(n)) firstByName.set(n, i);
  }
  const score = (uses: string[]) => {
    const seen = new Set<string>();
    let total = 0;
    for (const use of uses) {
      const item = firstByName.get(normalizeName(use));
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      total += urgencyWeight(daysLeft(item, now));
    }
    return total;
  };

  const ranked = RECIPES.map((recipe, order) => ({ recipe, order, filled: fillRecipe(recipe, pool, index) }))
    .filter((r): r is { recipe: Recipe; order: number; filled: FilledRecipe } => r.filled !== null)
    .map((r) => {
      const uses = uniqueUses(r.filled.chosen.map((c) => c.name));
      return { ...r, uses: uses.length, score: score(uses) };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        COURSE_ORDER[a.recipe.course] - COURSE_ORDER[b.recipe.course] ||
        b.uses - a.uses ||
        a.order - b.order,
    );

  type Ranked = (typeof ranked)[number];
  const position = new Map<Ranked, number>(ranked.map((r, i) => [r, i]));
  const out: Ranked[] = [];
  let rest = ranked;
  while (out.length < limit && rest.length > 0) {
    const page = new Set<Ranked>();
    const perFamily = new Map<string, number>();
    for (const r of rest) {
      if (page.size >= PAGE) break;
      const n = perFamily.get(r.recipe.family) ?? 0;
      if (n >= PER_FAMILY) continue;
      perFamily.set(r.recipe.family, n + 1);
      page.add(r);
    }
    // Not enough variety to fill the page: top it up with the best of the rest.
    for (const r of rest) {
      if (page.size >= PAGE) break;
      page.add(r);
    }
    out.push(...[...page].sort((a, b) => position.get(a)! - position.get(b)!));
    rest = rest.filter((r) => !page.has(r));
  }
  // Only the ideas returned are written out.
  return out.slice(0, limit).map((r) => toMeal(r.filled, prefs));
}

// ---------------------------------------------------------------------------
// AI ideas: a last check
// ---------------------------------------------------------------------------

/** Roles of food that only belongs in desserts, sweet breakfasts and drinks. */
const SWEET_ONLY = new Set<Role>(['ice-cream', 'custard', 'cake', 'cookies', 'chocolate', 'chocolate-spread', 'jam', 'sweetener', 'whipped-cream', 'yogurt-sweet']);
const SAVORY_TITLE =
  /\b(soups?|stews?|chowder|salads?|pasta|spaghetti|linguine|penne|noodles?|ramen|curry|dal|stir[- ]?fry|fried rice|risotto|pizzas?|tacos?|burritos?|quesadillas?|enchiladas?|fajitas?|nachos|omelet(te)?s?|frittata|shakshuka|chili|casserole|traybake|roast|sandwich(es)?|wraps?|burgers?|hash|gratin|lasagn[ae]|skillet)\b/i;
const SWEET_TITLE =
  /\b(ice cream|sundaes?|cakes?|pies?|crumble|crisp|cobbler|cookies?|desserts?|sweet|chocolate|pudding|smoothies?|shakes?|parfait|waffles?|pancakes?|french toast|muffins?|trifle|tarts?|compote|fruit salad|affogato|float|bark|nice cream)\b/i;

/**
 * False for an AI idea that puts a dessert-only food into a savoury dish ("Ice cream in vegetable
 * soup"). The prompt forbids it; this catches the rare idea that slips through.
 */
export function plausibleMeal(meal: Pick<Meal, 'title' | 'uses'>, items: PantryItem[]): boolean {
  if (!SAVORY_TITLE.test(meal.title) || SWEET_TITLE.test(meal.title)) return true;
  return !meal.uses.some((name) => {
    const item = matchTracked(name, items);
    if (!item) return false;
    const roles = rolesFor(item);
    return roles.length > 0 && roles.every((r) => SWEET_ONLY.has(r));
  });
}
