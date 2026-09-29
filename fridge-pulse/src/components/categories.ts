import type { Category, StorageLocation } from '../lib/types';

export const CATEGORY_EMOJI: Record<Category, string> = {
  produce: '🥬',
  dairy: '🥛',
  meat: '🍗',
  seafood: '🐟',
  bakery: '🍞',
  leftovers: '🍲',
  drinks: '🥤',
  condiments: '🧂',
  grains: '🌾',
  canned: '🥫',
  snacks: '🍿',
  other: '📦',
};

const NAME_EMOJI: [RegExp, string][] = [
  [/\bstrawberr/, '🍓'],
  [/\b(blueberr|blackberr|raspberr|berries)/, '🫐'],
  [/\bpineapple/, '🍍'],
  [/\bbananas?\b/, '🍌'],
  [/\bapples?\b/, '🍎'],
  [/\b(oranges?|clementines?|tangerines?)\b/, '🍊'],
  [/\b(lemons?|limes?)\b/, '🍋'],
  [/\bgrapes?\b/, '🍇'],
  [/\bavocados?\b/, '🥑'],
  [/\btomato/, '🍅'],
  [/\bcarrots?\b/, '🥕'],
  [/\bbroccoli\b/, '🥦'],
  [/\b(cucumbers?|zucchini)\b/, '🥒'],
  [/\b(peppers?|capsicum)\b/, '🫑'],
  [/\b(onions?|shallots?)\b/, '🧅'],
  [/\bgarlic\b/, '🧄'],
  [/\b(potato|potatoes|yams?)\b/, '🥔'],
  [/\bmushrooms?\b/, '🍄'],
  [/\bcorn\b/, '🌽'],
  [/\b(spinach|lettuce|kale|arugula|salad|greens)\b/, '🥬'],
  [/\beggs?\b/, '🥚'],
  [/\bcheese/, '🧀'],
  [/\bbutter\b/, '🧈'],
  [/\b(milk|yogh?urt|kefir|cream)\b/, '🥛'],
  [/\b(chicken|turkey|duck)\b/, '🍗'],
  [/\bbacon\b/, '🥓'],
  [/\b(beef|steak|pork|lamb|ham|sausages?)\b/, '🥩'],
  [/\b(salmon|fish|tuna|cod|shrimp|prawns?)\b/, '🐟'],
  [/\b(bread|sourdough|baguette|bagels?|buns?)\b/, '🍞'],
  [/\b(tortillas?|wraps?|pita)\b/, '🫓'],
  [/\b(pasta|spaghetti|noodles?|macaroni)\b/, '🍝'],
  [/\b(rice|quinoa)\b/, '🍚'],
  [/\bpizza\b/, '🍕'],
  [/\b(soup|stew|curry|leftovers?)\b/, '🍲'],
  [/\bjuice\b/, '🧃'],
  [/\bcoffee\b/, '☕'],
  [/\b(peanuts?|nuts?)\b/, '🥜'],
  [/\bhoney\b/, '🍯'],
  [/\bchocolate\b/, '🍫'],
];

/** A friendlier glyph than the category default when the name is recognisable. */
export function emojiFor(name: string, category: Category): string {
  const lower = name.toLowerCase();
  return NAME_EMOJI.find(([re]) => re.test(lower))?.[1] ?? CATEGORY_EMOJI[category];
}

export const LOCATION_LABEL: Record<StorageLocation, string> = {
  fridge: 'Fridge',
  freezer: 'Freezer',
  pantry: 'Pantry',
};

export const LOCATIONS: StorageLocation[] = ['fridge', 'freezer', 'pantry'];
