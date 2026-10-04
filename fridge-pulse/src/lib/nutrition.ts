import { FOOD_CATALOG } from './foodCatalog';
import { NUTRITION } from './nutritionData';
import { catalogPattern, guessCategory, plain, singularLast } from './shelfLife';
import type { Category, Meal, MealNutrition } from './types';

/** Energy and macronutrients: kcal and grams. */
export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface FoodNutrition {
  /** The catalog food the figures belong to ("Bananas" for "Organic bananas"). */
  food: string;
  per100g: Macros;
  /** A typical portion, as a household measure. */
  portion: { label: string; grams: number };
}

const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

/**
 * Words in front of a food that change what is in it: "dried apricots" are not apricots, "chocolate
 * milk" is not milk, "fried rice" is not dry rice. A name with one of these only gets figures when the
 * catalog lists it as it is.
 */
const CHANGED =
  /\b(fried|deep fried|breaded|battered|crumbed|coated|glazed|candied|sugared|frosted|iced|chocolate|choc|strawberry|vanilla|caramel|toffee|honey|maple|syrup|sweetened|flavou?red|stuffed|creamy|creamed|cheesy|buttered|curried|bbq|barbecue|teriyaki|sweet and sour|crispy|dried|dehydrated|canned|tinned|pickled|candy|cooked|leftovers?|instant|mix|powder(ed)?|condensed|evaporated|light|lite|low fat|reduced fat|fat free|nonfat|skinny|diet|zero|sugar free|keto|protein|vegan|veggie|plant based|meat free|meatless|soup|sauce|pie|cake|bars?|salad|sandwich(es)?|wrap|bites)\b/;

/** Pack sizes and counts at the end of a scanned name: "Ground beef 80/20", "Milk 2l", "Eggs x12". */
const TRAILING_SIZE = /(\s+(x\s?\d+|\d+([./]\d+)?\s?(%|g|kg|lb|lbs|oz|ml|l|ltr|pk|pack|ct|pcs)?))+$/;

let table: { exact: Map<string, string>; rules: { re: RegExp; food: string }[] } | null = null;

function lookupTable() {
  if (!table) {
    const exact = new Map<string, string>();
    for (const f of FOOD_CATALOG) exact.set(singularLast(plain(f.name)), f.name);
    // Longest first, so "Chicken breast" is tried before "Chicken".
    const rules = [...FOOD_CATALOG].sort((a, b) => b.name.length - a.name.length).map((f) => ({ re: catalogPattern(f.name), food: f.name }));
    table = { exact, rules };
  }
  return table;
}

function rowFor(food: string): FoodNutrition | null {
  const row = NUTRITION[food];
  if (!row) return null;
  const [kcal, protein, carbs, fat, fiber, label, grams] = row;
  return { food, per100g: { kcal, protein, carbs, fat, fiber }, portion: { label, grams } };
}

const CATEGORY_OF = new Map<string, Category>(FOOD_CATALOG.map((f) => [f.name, f.category]));
const cache = new Map<string, FoodNutrition | null>();

/**
 * USDA figures for a food by name: a catalog food by its own name (any case, singular or plural), or
 * the catalog food a name ends with when the words in front do not change it ("Organic baby spinach",
 * "Kirkland chicken breast"). Null when the app has no trustworthy figure.
 */
export function nutritionFor(name: string): FoodNutrition | null {
  const key = plain(name);
  if (cache.has(key)) return cache.get(key) ?? null;
  const found = lookup(key, name);
  if (cache.size > 2000) cache.clear();
  cache.set(key, found);
  return found;
}

function lookup(key: string, name: string): FoodNutrition | null {
  if (!key) return null;
  const { exact, rules } = lookupTable();
  const direct = exact.get(singularLast(key));
  if (direct) return rowFor(direct);
  const text = key.replace(TRAILING_SIZE, '').trim();
  const sized = exact.get(singularLast(text));
  if (sized) return rowFor(sized);
  // The catalog food the name ends with, and only when nothing in front changes it.
  for (const { re, food } of rules) {
    re.lastIndex = 0;
    let end = -1;
    let start = -1;
    for (const m of text.matchAll(re)) {
      end = m.index + m[0].length;
      start = m.index;
    }
    if (end !== text.length) continue;
    if (CHANGED.test(text.slice(0, start))) return null;
    // "Cauliflower rice" ends with rice but is a vegetable.
    if (guessCategory(name) !== CATEGORY_OF.get(food)) return null;
    return rowFor(food);
  }
  return null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function scaleMacros(per100g: Macros, grams: number): Macros {
  const f = grams / 100;
  return {
    kcal: Math.round(per100g.kcal * f),
    protein: round1(per100g.protein * f),
    carbs: round1(per100g.carbs * f),
    fat: round1(per100g.fat * f),
    fiber: round1(per100g.fiber * f),
  };
}

export function portionMacros(n: FoodNutrition): Macros {
  return scaleMacros(n.per100g, n.portion.grams);
}

const GRAMS_PER: Record<string, number> = { g: 1, gram: 1, grams: 1, kg: 1000, oz: 28.35, lb: 453.6, lbs: 453.6, pound: 453.6, pounds: 453.6 };

/**
 * Portions that are one whole thing you count, so "3" of them is three portions: fruit, vegetables,
 * eggs. Bread or chicken breasts are left out because "1" of those usually means a loaf or a pack.
 */
const COUNTED = /^1 (medium|large egg|fruit|lemon|lime|apricot|plum|beet|leek)$/;

/**
 * How much food a quantity stands for, in grams, when it can be told: a weight ("500 g", "1.5 lb",
 * "2 x 250g"), a count of whole fruit, vegetables or eggs ("6", "6 pcs", "1 dozen"). Null otherwise
 * ("1 carton", "half").
 */
export function quantityGrams(quantity: string, n: FoodNutrition): number | null {
  const q = quantity.trim().toLowerCase();
  const weight = /^(?:(\d+(?:\.\d+)?)\s*[x×]\s*)?(\d+(?:\.\d+)?)\s*(g|grams?|kg|oz|lbs?|pounds?)$/.exec(q);
  if (weight) {
    const packs = weight[1] ? Number(weight[1]) : 1;
    const grams = Math.round(packs * Number(weight[2]) * GRAMS_PER[weight[3]]);
    return grams > 0 ? grams : null;
  }
  if (!COUNTED.test(n.portion.label)) return null;
  const dozen = /^(\d+)?\s*dozen$/.exec(q);
  const count = dozen ? (dozen[1] ? Number(dozen[1]) : 1) * 12 : Number(/^(\d+)\s*(?:x|pcs?|pieces?|ct|count)?$/.exec(q)?.[1] ?? NaN);
  return count > 0 && count <= 60 ? Math.round(count * n.portion.grams) : null;
}

// ---------------------------------------------------------------------------
// Meals
// ---------------------------------------------------------------------------

/** Cooking fat named in a recipe's extras: half a tablespoon a serving. */
const COOKING_FAT = /^(olive oil|oil|butter|vegetable oil)\b/i;

export interface Portion {
  name: string;
  /** Typical portions of it in one serving. */
  portions: number;
}

/**
 * Per-serving estimate for a meal from what goes into it: each food at its typical portion times how
 * much of one goes into a serving. Foods without figures are left out and counted, so the card can say
 * the estimate covers four of five ingredients. Null when nothing could be counted.
 */
export function mealNutrition(parts: Portion[], extras: string[] = []): MealNutrition | null {
  let sum = { ...ZERO };
  let counted = 0;
  for (const { name, portions } of parts) {
    const n = nutritionFor(name);
    if (!n) continue;
    counted++;
    sum = add(sum, scaleMacros(n.per100g, n.portion.grams * portions));
  }
  if (counted === 0) return null;
  // Oil or butter for cooking: listed among the extras, not tracked.
  const fat = extras.map((e) => COOKING_FAT.exec(e.trim())?.[1]).find(Boolean);
  if (fat) {
    const n = nutritionFor(fat.toLowerCase() === 'oil' ? 'Vegetable oil' : fat);
    if (n) sum = add(sum, scaleMacros(n.per100g, 7));
  }
  return { kcal: Math.round(sum.kcal), protein: Math.round(sum.protein), carbs: Math.round(sum.carbs), fat: Math.round(sum.fat), counted, total: parts.length };
}

function add(a: Macros, b: Macros): Macros {
  return { kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat, fiber: a.fiber + b.fiber };
}

/** "540 kcal", "12 g protein": whole numbers, with one decimal under 10 g. */
export function formatGrams(g: number): string {
  return `${g < 10 && g % 1 !== 0 ? g.toFixed(1) : Math.round(g)} g`;
}

/** A serving this rich in protein gets a "High protein" tag. */
export const HIGH_PROTEIN_G = 25;

/** The figures a card shows: energy and the three macros. */
export type MacroValues = Pick<Macros, 'kcal' | 'protein' | 'carbs' | 'fat'>;

/** Share of the energy from protein, carbs and fat (4, 4 and 9 kcal a gram), as whole percentages. */
export function energySplit({ protein, carbs, fat }: MacroValues): [number, number, number] {
  const parts = [protein * 4, carbs * 4, fat * 9];
  const total = parts[0] + parts[1] + parts[2];
  if (total <= 0) return [0, 0, 0];
  const p = Math.round((parts[0] / total) * 100);
  const c = Math.round((parts[1] / total) * 100);
  return [p, c, 100 - p - c];
}

/** Where a meal's per-serving figures come from, and what they leave out. */
export function nutritionNote(meal: Pick<Meal, 'source' | 'nutrition'>): string {
  const n = meal.nutrition;
  if (!n) return '';
  if (meal.source === 'ai') return 'Estimate for one serving of this recipe.';
  const part = n.counted !== undefined && n.total !== undefined && n.counted < n.total ? ` (${n.counted} of ${n.total} ingredients; the rest have no figures yet)` : '';
  return `Estimate from USDA figures for typical portions${part}.`;
}

/**
 * The trust boundary for a meal's figures from the server: four sensible numbers whose energy roughly
 * matches the macros (4 kcal a gram of protein or carbs, 9 of fat), or nothing.
 */
export function toMealNutrition(raw: unknown): MealNutrition | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : null);
  const kcal = num(r.kcal, 4000);
  const protein = num(r.protein, 400);
  const carbs = num(r.carbs, 600);
  const fat = num(r.fat, 300);
  if (kcal === null || protein === null || carbs === null || fat === null || kcal === 0) return null;
  const fromMacros = protein * 4 + carbs * 4 + fat * 9;
  // Alcohol and rounding account for some gap; a wide one means the numbers are not about the same food.
  if (Math.abs(fromMacros - kcal) > Math.max(60, kcal * 0.35)) return null;
  return { kcal, protein, carbs, fat };
}
