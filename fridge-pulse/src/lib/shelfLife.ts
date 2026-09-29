import type { Category, StorageLocation } from './types';

/**
 * Rough "keeps for about N days once opened / bought fresh" figures, in the
 * spirit of the USDA FoodKeeper. They are estimates for a reminder app, not
 * food-safety guarantees; the UI labels them as estimates and lets people edit.
 */
type Days = Record<StorageLocation, number>;

const CATEGORY_DEFAULTS: Record<Category, Days> = {
  produce: { fridge: 7, freezer: 240, pantry: 5 },
  dairy: { fridge: 14, freezer: 90, pantry: 1 },
  meat: { fridge: 3, freezer: 180, pantry: 0 },
  seafood: { fridge: 2, freezer: 150, pantry: 0 },
  bakery: { fridge: 8, freezer: 90, pantry: 4 },
  leftovers: { fridge: 4, freezer: 90, pantry: 0 },
  drinks: { fridge: 21, freezer: 180, pantry: 90 },
  condiments: { fridge: 90, freezer: 180, pantry: 180 },
  grains: { fridge: 180, freezer: 365, pantry: 365 },
  canned: { fridge: 5, freezer: 90, pantry: 540 },
  snacks: { fridge: 60, freezer: 180, pantry: 90 },
  other: { fridge: 14, freezer: 90, pantry: 30 },
};

interface Rule {
  re: RegExp;
  days: Partial<Days>;
}

/** First match wins, so more specific patterns come first. */
const RULES: Rule[] = [
  { re: /\b(lettuce|spinach|arugula|kale|greens|salad mix|mesclun)\b/, days: { fridge: 5, freezer: 240 } },
  { re: /\b(strawberr|raspberr|blueberr|blackberr|berries|grapes|cherr)/, days: { fridge: 5, freezer: 240 } },
  { re: /\bbananas?\b/, days: { pantry: 5, fridge: 7, freezer: 90 } },
  { re: /\bavocados?\b/, days: { pantry: 4, fridge: 5 } },
  { re: /\b(apples?|oranges?|clementines?|grapefruit)\b/, days: { fridge: 28, pantry: 7 } },
  { re: /\b(lemons?|limes?)\b/, days: { fridge: 21, pantry: 7 } },
  { re: /\btomato/, days: { fridge: 7, pantry: 5 } },
  { re: /\b(cucumbers?|zucchini|squash)\b/, days: { fridge: 7, pantry: 4 } },
  { re: /\b(peppers?|capsicum)\b/, days: { fridge: 10, pantry: 4 } },
  { re: /\bcarrots?\b/, days: { fridge: 28, pantry: 7 } },
  { re: /\b(broccoli|cauliflower|asparagus|green beans?)\b/, days: { fridge: 5, freezer: 240 } },
  { re: /\bmushrooms?\b/, days: { fridge: 5 } },
  { re: /\b(potato|potatoes|sweet potato|yams?)\b/, days: { pantry: 30, fridge: 30 } },
  { re: /\b(onions?|shallots?)\b/, days: { pantry: 30, fridge: 30 } },
  { re: /\bgarlic\b/, days: { pantry: 60, fridge: 90 } },
  { re: /\b(cilantro|parsley|basil|mint|dill|herbs?|chives|scallions?|green onions?)\b/, days: { fridge: 7, freezer: 180 } },
  { re: /\b(celery|cabbage|beets?)\b/, days: { fridge: 14 } },
  { re: /\b(milk|oat milk|almond milk|soy milk)\b/, days: { fridge: 7, freezer: 90 } },
  { re: /\b(yogh?urt|kefir|sour cream)\b/, days: { fridge: 14 } },
  { re: /\b(cream cheese|cottage cheese|ricotta|mozzarella|feta)\b/, days: { fridge: 14, freezer: 90 } },
  { re: /\b(cheddar|parmesan|gouda|swiss|cheese)\b/, days: { fridge: 42, freezer: 180 } },
  { re: /\bbutter\b/, days: { fridge: 60, freezer: 270, pantry: 2 } },
  { re: /\b(heavy cream|half and half|cream)\b/, days: { fridge: 10, freezer: 90 } },
  { re: /\beggs?\b/, days: { fridge: 28, pantry: 7 } },
  { re: /\b(ground (beef|turkey|pork|chicken)|mince)\b/, days: { fridge: 2, freezer: 120 } },
  { re: /\b(chicken|turkey|duck)\b/, days: { fridge: 2, freezer: 270 } },
  { re: /\b(beef|steak|pork|lamb|roast|ribs)\b/, days: { fridge: 4, freezer: 180 } },
  { re: /\b(bacon)\b/, days: { fridge: 7, freezer: 30 } },
  { re: /\b(sausages?|hot dogs?)\b/, days: { fridge: 5, freezer: 60 } },
  { re: /\b(ham|deli|salami|turkey slices|lunch meat)\b/, days: { fridge: 5, freezer: 60 } },
  { re: /\b(salmon|tuna steak|fish|cod|tilapia|shrimp|prawns?|scallops?)\b/, days: { fridge: 2, freezer: 150 } },
  { re: /\btofu\b/, days: { fridge: 5, freezer: 150 } },
  { re: /\b(hummus|guacamole|salsa|dip)\b/, days: { fridge: 7 } },
  { re: /\b(tortillas?|wraps?|pita)\b/, days: { pantry: 7, fridge: 21, freezer: 180 } },
  { re: /\b(bread|bagels?|buns?|rolls?|baguette|sourdough)\b/, days: { pantry: 4, fridge: 8, freezer: 90 } },
  { re: /\b(juice|smoothie)\b/, days: { fridge: 7, pantry: 180 } },
  { re: /\b(pasta|spaghetti|noodles?|rice|quinoa|oats?|cereal|flour|couscous)\b/, days: { pantry: 365, fridge: 365, freezer: 365 } },
  { re: /\b(ketchup|mustard|mayo|mayonnaise|soy sauce|hot sauce|jam|jelly|dressing|vinegar)\b/, days: { fridge: 120, pantry: 180 } },
  { re: /\b(leftovers?|cooked|takeout|soup|stew|curry)\b/, days: { fridge: 4, freezer: 90 } },
];

export const MAX_SHELF_LIFE_DAYS = 730;

export function estimateShelfLifeDays(
  name: string,
  category: Category,
  location: StorageLocation,
): number {
  const lower = name.toLowerCase();
  const rule = RULES.find((r) => r.re.test(lower));
  const fromRule = rule?.days[location];
  const days = fromRule ?? CATEGORY_DEFAULTS[category][location];
  return Math.min(Math.max(Math.round(days), 0), MAX_SHELF_LIFE_DAYS);
}

/** Best-effort category guess for manually typed items. */
export function guessCategory(name: string): Category {
  const lower = name.toLowerCase();
  const rules: [RegExp, Category][] = [
    [/\b(lettuce|spinach|kale|tomato|cucumber|pepper|carrot|broccoli|onion|garlic|potato|apple|banana|berr|lemon|lime|avocado|mushroom|herb|celery|cabbage|fruit|veg)/, 'produce'],
    [/\b(milk|yogh?urt|cheese|butter|cream|eggs?|kefir)\b/, 'dairy'],
    [/\b(chicken|beef|pork|steak|bacon|sausage|ham|turkey|lamb|deli)\b/, 'meat'],
    [/\b(salmon|fish|shrimp|prawn|cod|tuna|scallop)\b/, 'seafood'],
    [/\b(bread|bagel|bun|roll|tortilla|wrap|pita|cake|muffin)\b/, 'bakery'],
    [/\b(leftover|cooked|takeout|soup|stew|curry)\b/, 'leftovers'],
    [/\b(juice|soda|water|beer|wine|coffee|tea|kombucha)\b/, 'drinks'],
    [/\b(ketchup|mustard|mayo|sauce|jam|dressing|vinegar|oil|spice)\b/, 'condiments'],
    [/\b(rice|pasta|noodle|quinoa|oats?|cereal|flour|couscous|beans?|lentil)\b/, 'grains'],
    [/\b(canned|can of|tinned)\b/, 'canned'],
    [/\b(chips|crackers|cookies|nuts|granola|snack|chocolate)\b/, 'snacks'],
  ];
  return rules.find(([re]) => re.test(lower))?.[1] ?? 'other';
}
