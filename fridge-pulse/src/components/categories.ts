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
  snacks: '\u{1F968}',
  other: '📦',
};

/**
 * First match wins, so order matters: compound foods ("peanut butter", "chicken soup", "orange juice",
 * "ice cream") must come before the single words they contain. Every glyph is Unicode 13 or older
 * (iOS 14.2 and Android 11 and up); a few (bell pepper, blueberry, olive, flatbread) need those versions.
 * `__tests__/emoji-accuracy.test.ts` pins the behaviour for about a hundred foods.
 */
const HOT_PEPPER = '\u{1F336}️';
const NAME_EMOJI: [RegExp, string][] = [
  // --- compound and look-alike foods first
  [/\b(ice cream|gelato|sorbet)\b/, '\u{1F368}'],
  [/\b(peanut|almond|cashew|hazelnut|nut) butter\b/, '\u{1F95C}'],
  [/\b(black|white|cayenne|ground) pepper\b|\b(chil(li|i)|red pepper) flakes\b|\bpeppercorns?\b/, '\u{1F9C2}'],
  [/\b(oat|almond|soy|rice|cashew|coconut|plant) (milk|drink|creamer)\b/, '\u{1F95B}'],
  [/\bhot ?dogs?\b/, '\u{1F32D}'],
  [/\bjuice\b/, '\u{1F9C3}'],
  [/\b(soup|stew|curry|broth|chili con carne)\b/, '\u{1F372}'],
  [/\b(cheesecake|cakes?|cupcakes?|brownies?|muffins?)\b/, '\u{1F370}'],
  [/\b(cereal|corn ?flakes|granola|muesli|oats?|oatmeal|porridge)\b/, '\u{1F963}'],
  [/\b(tortillas?|wraps?|pita|flatbread|naan)\b/, '\u{1FAD3}'],
  [/\b(noodles?|ramen|pho|udon|soba)\b/, '\u{1F35C}'],
  [/\b(pasta|spaghetti|macaroni|penne|lasagn[ae]|ravioli)\b/, '\u{1F35D}'],
  [/\b(egg ?plants?|aubergines?)\b/, '\u{1F346}'],
  [/\bpizza\b/, '\u{1F355}'],
  [/\bburgers?\b/, '\u{1F354}'],
  [/\bsandwich(es)?\b/, '\u{1F96A}'],
  [/\b(french )?fries\b/, '\u{1F35F}'],
  [/\b(crackers?|pretzels?|chips|crisps)\b/, '\u{1F968}'],
  // --- fruit
  [/\bstrawberr(y|ies)\b/, '\u{1F353}'],
  [/\b(blueberr(y|ies)|blackberr(y|ies))\b/, '\u{1FAD0}'],
  [/\b(raspberr(y|ies)|cranberr(y|ies)|redcurrants?|berries)\b/, '\u{1F353}'],
  [/\bpineapples?\b/, '\u{1F34D}'],
  [/\bbananas?\b/, '\u{1F34C}'],
  [/\bapples?\b/, '\u{1F34E}'],
  [/\b(oranges?|clementines?|tangerines?|mandarins?|grapefruits?)\b/, '\u{1F34A}'],
  [/\b(lemons?|limes?)\b/, '\u{1F34B}'],
  [/\bgrapes?\b/, '\u{1F347}'],
  [/\bwatermelons?\b/, '\u{1F349}'],
  [/\b(melons?|cantaloupes?|honeydew)\b/, '\u{1F348}'],
  [/\b(peach(es)?|nectarines?|apricots?)\b/, '\u{1F351}'],
  [/\bpears?\b/, '\u{1F350}'],
  [/\bmang(o|oes|os)\b/, '\u{1F96D}'],
  [/\bkiwi(fruit)?s?\b/, '\u{1F95D}'],
  [/\bcoconuts?\b/, '\u{1F965}'],
  [/\bavocados?\b/, '\u{1F951}'],
  // --- vegetables (tomato before cherry so "cherry tomatoes" is a tomato)
  [/\btomato(es)?\b/, '\u{1F345}'],
  [/\bcherr(y|ies)\b/, '\u{1F352}'],
  [/\bcarrots?\b/, '\u{1F955}'],
  [/\bbroccoli\b/, '\u{1F966}'],
  [/\b(cucumbers?|zucchini|courgettes?)\b/, '\u{1F952}'],
  [/\b(chil(li|i)(es)?|jalape[nñ]os?|habaneros?)\b/, HOT_PEPPER],
  [/\b(peppers?|capsicums?)\b/, '\u{1FAD1}'],
  [/\b(onions?|shallots?)\b/, '\u{1F9C5}'],
  [/\bgarlic\b/, '\u{1F9C4}'],
  [/\b(sweet potato(es)?|yams?)\b/, '\u{1F360}'],
  [/\bpotato(es)?\b/, '\u{1F954}'],
  [/\bmushrooms?\b/, '\u{1F344}'],
  [/\b(sweet ?corn|corn)\b/, '\u{1F33D}'],
  [/\bolives?\b/, '\u{1FAD2}'],
  [/\b(spinach|lettuce|kale|arugula|rocket|salad|greens|chard|cabbage)\b/, '\u{1F96C}'],
  // --- dairy and eggs
  [/\beggs?\b/, '\u{1F95A}'],
  [/\b(cheese|cheddar|mozzarella|parmesan|feta|brie|gouda|ricotta|halloumi|swiss)\b/, '\u{1F9C0}'],
  [/\b(butter|margarine|ghee)\b/, '\u{1F9C8}'],
  [/\b(milk|yogh?urt|kefir|cream|creamer)\b/, '\u{1F95B}'],
  // --- meat and seafood
  [/\b(chicken|turkey|duck)\b/, '\u{1F357}'],
  [/\bbacon\b/, '\u{1F953}'],
  [/\b(sausages?|bratwurst|frankfurters?|chorizo)\b/, '\u{1F32D}'],
  [/\b(ham|salami|pepperoni|prosciutto|ribs?|roast|brisket|drumsticks?)\b/, '\u{1F356}'],
  [/\b(beef|steaks?|pork|lamb|mince)\b/, '\u{1F969}'],
  [/\b(shrimps?|prawns?)\b/, '\u{1F990}'],
  [/\bcrabs?\b/, '\u{1F980}'],
  [/\blobsters?\b/, '\u{1F99E}'],
  [/\b(salmon|fish|tuna|cod|tilapia|trout|sardines?|haddock|mackerel)\b/, '\u{1F41F}'],
  // --- bakery, grains, sweets
  [/\bbagels?\b/, '\u{1F96F}'],
  [/\b(bread|sourdough|baguette|buns?|toast)\b/, '\u{1F35E}'],
  [/\bcroissants?\b/, '\u{1F950}'],
  [/\b(pancakes?|waffles?)\b/, '\u{1F95E}'],
  [/\b(cookies?|biscuits?)\b/, '\u{1F36A}'],
  [/\b(donuts?|doughnuts?)\b/, '\u{1F369}'],
  [/\b(rice|quinoa|couscous)\b/, '\u{1F35A}'],
  [/\bhoney\b/, '\u{1F36F}'],
  [/\bchocolate\b/, '\u{1F36B}'],
  [/\bpopcorn\b/, '\u{1F37F}'],
  [/\b(peanuts?|almonds?|walnuts?|cashews?|pistachios?|hazelnuts?|pecans?|nuts?)\b/, '\u{1F95C}'],
  // --- drinks
  [/\bcoffee\b/, '☕'],
  [/\b(tea|matcha)\b/, '\u{1F375}'],
  [/\bbeers?\b/, '\u{1F37A}'],
  [/\bwine\b/, '\u{1F377}'],
  // --- leftovers last, so "leftover pasta" still shows pasta
  [/\b(leftovers?|takeout|takeaway)\b/, '\u{1F372}'],
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
