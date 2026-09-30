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

/**
 * First match wins, so prepared and processed foods come before the ingredients they are named
 * after: "leftover pasta" is cooked food (days), not dry pasta (a year); "peanut butter" is not
 * butter; "fish sauce" is not fish. Where sources disagree the shorter figure is used, because an
 * early reminder costs less than a late one. `__tests__/shelflife-scan.test.ts` pins these.
 */
const RULES: Rule[] = [
  { re: /\b(sushi|sashimi|poke)\b/, days: { fridge: 1, pantry: 0 } },
  // Opened cans keep a few days in the fridge; unopened they last well over a year.
  { re: /\b(canned|tinned|can of|tin of|chopped tomatoes|tomato paste|tomato pur[eé]e)\b/, days: { fridge: 4, pantry: 540, freezer: 90 } },
  // Sauces, spreads and dips
  { re: /\b(pasta sauce|marinara|tomato sauce|pizza sauce)\b/, days: { fridge: 7, pantry: 365, freezer: 180 } },
  { re: /\b(hummus|guacamole|tzatziki|dips?)\b/, days: { fridge: 7, pantry: 0, freezer: 60 } },
  { re: /\b(salsa|pesto)\b/, days: { fridge: 10, freezer: 90 } },
  { re: /\b(peanut|almond|cashew|hazelnut|nut|seed) butter\b|\btahini\b/, days: { pantry: 90, fridge: 180 } },
  { re: /\b(mayo|mayonnaise|aioli|dressing|vinaigrette)\b/, days: { fridge: 60, pantry: 90 } },
  {
    re: /\b(ketchup|mustard|soy sauce|fish sauce|oyster sauce|hot sauce|sriracha|bbq sauce|barbecue sauce|worcestershire|teriyaki|hoisin|jam|jelly|marmalade|preserves|chutney|vinegar|relish|pickles?|capers)\b/,
    days: { fridge: 120, pantry: 180 },
  },
  { re: /\bolives\b/, days: { fridge: 14, pantry: 365 } },
  { re: /\boils?\b/, days: { pantry: 180, fridge: 180 } },
  { re: /\bhoney\b/, days: { pantry: 730, fridge: 730 } },
  { re: /\bsyrup\b/, days: { fridge: 365, pantry: 365 } },
  // Seasonings and baking staples
  {
    re: /\b(salt|sugar(?! snap)|black pepper|white pepper|peppercorns?|spices?|seasoning|cinnamon|paprika|cumin|nutmeg|turmeric|cayenne|chil(li|i) (powder|flakes)|red pepper flakes|baking (soda|powder)|vanilla extract|ground (coriander|cumin|ginger|cinnamon|nutmeg|cloves|turmeric|cardamom)|dried (herbs|oregano|basil|thyme|parsley|rosemary))\b/,
    days: { pantry: 730, fridge: 730, freezer: 730 },
  },
  { re: /\b(milk|dark|white|baking) chocolate\b|\bchocolate (chips|spread|bars?)\b|^chocolate$/, days: { pantry: 180, fridge: 180, freezer: 365 } },
  // Cooked and prepared food
  {
    re: /\b(leftovers?|cooked|takeout|take-out|takeaway|soups?|stews?|curry|curries|chili con carne|casseroles?|lasagn[ae]|broth|stock|rotisserie|pulled pork|fried rice|(egg|spring) rolls|(potato|pasta|macaroni|egg|chicken|tuna|rice|bean) salad|coleslaw|slaw)\b/,
    days: { fridge: 4, freezer: 90 },
  },
  // Frozen food: fine for months frozen, a few days once thawed. Frozen desserts do not survive thawing.
  { re: /\b(ice cream|gelato|sorbet|frozen yogh?urt|ice pops?|popsicles?)\b/, days: { freezer: 60, fridge: 0, pantry: 0 } },
  { re: /\bfrozen\b/, days: { freezer: 120, fridge: 3, pantry: 0 } },
  // Drinks (before fruit, so "orange juice" is juice)
  { re: /\bsmoothies?\b/, days: { fridge: 2, freezer: 90 } },
  { re: /\b(juice|lemonade|iced tea|coconut water)\b/, days: { fridge: 7, pantry: 180, freezer: 180 } },
  { re: /\bcold brew\b/, days: { fridge: 10 } },
  { re: /\b(prosecco|champagne|cava|sparkling wine)\b/, days: { fridge: 3, pantry: 365 } },
  { re: /\bwine\b/, days: { fridge: 5, pantry: 365 } },
  { re: /\b(oat|almond|soy|rice|cashew|coconut|hemp|nut|plant) (milk|drink|creamer)\b/, days: { fridge: 7, pantry: 180, freezer: 90 } },
  // Snacks, nuts and dried fruit (before potato, tortilla and rice)
  {
    re: /\b(chips|crisps|crackers?|pretzels?|popcorn|cookies|rice cakes?|rice crackers?|granola bars?|protein bars?|trail mix)\b/,
    days: { pantry: 60, fridge: 60, freezer: 180 },
  },
  {
    re: /\b(nuts?|almonds?|walnuts?|cashews?|pecans?|pistachios?|peanuts?|hazelnuts?|macadamias?|raisins?|sultanas?|dried fruit|dates)\b/,
    days: { pantry: 120, fridge: 180, freezer: 365 },
  },
  // Seafood
  { re: /\bsmoked (salmon|fish|trout|mackerel)\b/, days: { fridge: 7, freezer: 60 } },
  {
    re: /\b(salmon|tuna|fish|cod|tilapia|haddock|halibut|trout|sea bass|mackerel|sardines?|anchov(y|ies)|shrimps?|prawns?|scallops?|mussels|clams|oysters|squid|calamari|octopus|crabs?|lobsters?)\b/,
    days: { fridge: 2, freezer: 150 },
  },
  // Bakery (before meat and produce, so "hot dog buns" and "garlic bread" are bread)
  { re: /\b(bread|bagels?|buns?|rolls?|baguettes?|sourdough|croissants?|muffins?|crumpets?|brioche)\b/, days: { pantry: 4, fridge: 8, freezer: 90 } },
  { re: /\b(cheesecake|cakes?|brownies?|pastr(y|ies)|donuts?|doughnuts?|pies?)\b/, days: { pantry: 3, fridge: 5, freezer: 90 } },
  { re: /\bdough\b/, days: { fridge: 4, freezer: 90, pantry: 0 } },
  // Dairy (plant milks and nut butters are handled above)
  {
    re: /\b(cream cheese|cottage cheese|goat cheese|ricotta|mozzarella|burrata|feta|brie|camembert|mascarpone|halloumi|paneer)\b/,
    days: { fridge: 14, freezer: 90 },
  },
  {
    re: /\b(cheddar|parmesan|gouda|swiss|provolone|monterey jack|pepper ?jack|manchego|gruy[eè]re|emmental|pecorino|havarti|colby|cheese)\b/,
    days: { fridge: 42, freezer: 180 },
  },
  { re: /\b(butter|margarine|ghee)\b/, days: { fridge: 60, freezer: 270, pantry: 2 } },
  { re: /\b(yogh?urt|kefir|sour cream)\b/, days: { fridge: 14 } },
  { re: /\b(custard|pudding)\b/, days: { fridge: 4 } },
  { re: /\b(heavy cream|whipping cream|double cream|single cream|half and half|cream)\b/, days: { fridge: 10, freezer: 90 } },
  { re: /\bmilk\b/, days: { fridge: 7, freezer: 90 } },
  { re: /\b(veggie|vegan|plant-based|meatless) (burgers?|sausages?|patties|mince)\b/, days: { fridge: 4, freezer: 120 } },
  // Meat (bacon before poultry so "turkey bacon" is bacon; cured and deli meats before the raw cuts)
  { re: /\bbacon\b/, days: { fridge: 7, freezer: 30 } },
  { re: /\b(salami|pepperoni)\b/, days: { fridge: 21, freezer: 60 } },
  { re: /\b(ham|deli|prosciutto|lunch meat|cold cuts|turkey slices|sliced turkey)\b/, days: { fridge: 5, freezer: 60 } },
  {
    re: /\b(ground (beef|turkey|pork|chicken|lamb)|mince|minced|burger patties|patties|meatballs?)\b/,
    days: { fridge: 2, freezer: 120 },
  },
  { re: /\b(chicken|turkey|duck)\b/, days: { fridge: 2, freezer: 270 } },
  { re: /\b(hot ?dogs?|frankfurters?|wieners?)\b/, days: { fridge: 7, freezer: 60 } },
  // Raw sausages keep 1-2 days, pre-cooked ones about a week.
  { re: /\b(sausages?|bratwurst|chorizo|kielbasa)\b/, days: { fridge: 3, freezer: 60 } },
  { re: /\b(beef|steak|pork|lamb|veal|venison|roast|ribs|brisket)\b/, days: { fridge: 4, freezer: 180 } },
  { re: /\btofu\b/, days: { fridge: 5, freezer: 150 } },
  { re: /\btempeh\b/, days: { fridge: 10, freezer: 150 } },
  { re: /\b(tortillas?|wraps?|pitas?|naan|flatbreads?)\b/, days: { pantry: 7, fridge: 21, freezer: 180 } },
  // Produce
  { re: /\b(lettuce|spinach|arugula|rocket|kale|greens|salad|salad mix|mesclun|watercress|bok ?choy|pak choi|chard|sprouts)\b/, days: { fridge: 5, freezer: 240 } },
  { re: /\b(strawberr|raspberr|blueberr|blackberr|berries|grapes|cherr)/, days: { fridge: 5, freezer: 240 } },
  { re: /\bbananas?\b/, days: { pantry: 5, fridge: 7, freezer: 90 } },
  { re: /\bavocados?\b/, days: { pantry: 4, fridge: 5 } },
  { re: /\bapples?\b/, days: { fridge: 28, pantry: 7 } },
  { re: /\b(oranges?|clementines?|mandarins?|tangerines?|grapefruits?|lemons?|limes?)\b/, days: { fridge: 21, pantry: 7 } },
  { re: /\bfigs?\b/, days: { fridge: 3, pantry: 1 } },
  { re: /\btomato/, days: { fridge: 7, pantry: 5 } },
  { re: /\b(pumpkins?|butternut|(acorn|winter|spaghetti|kabocha) squash)\b/, days: { pantry: 60, fridge: 30 } },
  { re: /\b(cucumbers?|zucchini|courgettes?|squash)\b/, days: { fridge: 7, pantry: 4 } },
  { re: /\b(peppers?|capsicum)\b/, days: { fridge: 10, pantry: 4 } },
  { re: /\bcarrots?\b/, days: { fridge: 28, pantry: 7 } },
  { re: /\b(broccoli|cauliflower|asparagus|green beans?)\b/, days: { fridge: 5, freezer: 240 } },
  { re: /\bmushrooms?\b/, days: { fridge: 5 } },
  { re: /\b(potato|potatoes|sweet potato|yams?)\b/, days: { pantry: 30, fridge: 30 } },
  { re: /\b(cilantro|coriander|parsley|basil|mint|dill|herbs?|chives|rosemary|thyme|sage|oregano|tarragon|scallions?|green onions?|spring onions?)\b/, days: { fridge: 7, freezer: 180 } },
  { re: /\b(onions?|shallots?)\b/, days: { pantry: 30, fridge: 30 } },
  { re: /\bgarlic\b/, days: { pantry: 60, fridge: 90 } },
  { re: /\bginger\b/, days: { fridge: 21, pantry: 7 } },
  { re: /\b(celery|cabbage|beets?|beetroot|parsnips?|turnips?|radish(es)?|leeks?)\b/, days: { fridge: 14 } },
  // Grains (after cooked food, snacks and plant milks; before eggs, so "egg noodles" are noodles)
  { re: /\b(fresh (pasta|noodles)|ravioli|tortellini|gnocchi)\b/, days: { fridge: 3, freezer: 60 } },
  {
    re: /\b(pasta|spaghetti|penne|macaroni|noodles?|rice|quinoa|oats?|oatmeal|cereal|granola|flour|couscous|breadcrumbs|lentils)\b/,
    days: { pantry: 365, fridge: 365, freezer: 365 },
  },
  { re: /\beggs?\b/, days: { fridge: 28, pantry: 7 } },
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
    // Compound names that contain a misleading word ("peanut butter" is not dairy).
    [/\b((peanut|almond|cashew|hazelnut|nut|seed|apple) butter|\w+ sauce|ketchup|mayo|mayonnaise|dressing|jam|honey|syrup|hummus|salsa|pesto|chutney|oil|vinegar|salt|sugar(?! snap)|black pepper)\b/, 'condiments'],
    [/\b(ice cream|pepper ?jack|monterey jack|frozen yogh?urt)\b/, 'dairy'],
    [/\b(soup|stew|curry|leftover|cooked|takeout|lasagn[ae]|casserole)\b/, 'leftovers'],
    [/\b(chips|crisps|crackers|cookies|popcorn|pretzels|chocolate(?! milk)|rice cakes?|granola bars?)\b/, 'snacks'],
    [/\b(juice|smoothie|lemonade|coffee|tea|wine|beer|oat milk|almond milk|soy milk)\b/, 'drinks'],
    [/\b(egg noodles|noodles?|pasta|spaghetti)\b/, 'grains'],
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
