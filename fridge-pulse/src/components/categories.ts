import type { Category, StorageLocation } from '../lib/types';

export const CATEGORY_EMOJI: Record<Category, string> = {
  // A basket rather than a lettuce: for fruit and vegetables without their own emoji
  // (plums, ginger, asparagus) a neutral "produce" glyph is better than a wrong one.
  produce: '\u{1F9FA}',
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
 * First match wins, so order matters: compound foods ("peanut butter", "fish sauce", "milk chocolate",
 * "spaghetti squash") must come before the single words they contain. Every glyph is Unicode 13 or
 * older (iOS 14.2 and Android 11 and up); a few (bell pepper, blueberry, olive, flatbread) need those
 * versions. `__tests__/emoji-accuracy.test.ts` pins the behaviour for about two hundred foods.
 */
const HOT_PEPPER = '\u{1F336}\uFE0F';
const CONDIMENT = '\u{1F9C2}';
const NAME_EMOJI: [RegExp, string][] = [
  // --- sauces, spreads and dips first: "fish sauce" is not fish, "salad dressing" is not salad
  [/\b(hot sauce|sriracha|tabasco|chil(li|i) sauce)\b/, HOT_PEPPER],
  [/\b(soy|fish|oyster|bbq|barbecue|worcestershire|teriyaki|hoisin) sauce\b|\bworcestershire\b/, CONDIMENT],
  [/\b(salad )?dressing\b|\b(vinaigrette|vinegar|mayo|mayonnaise|aioli|relish|tahini|hummus|tzatziki|dips?)\b|\bmustard\b(?! greens)/, CONDIMENT],
  [/\b(ketchup|salsa|pasta sauce|marinara|tomato sauce|pizza sauce)\b/, '\u{1F345}'],
  [/\bguacamole\b/, '\u{1F951}'],
  [/\bpesto\b/, '\u{1F33F}'],
  [/\bmaple syrup\b/, '\u{1F341}'],
  [/\b(jam|jelly|marmalade|preserves)\b/, '\u{1F36F}'],
  [/\b(pickles?|gherkins?)\b/, '\u{1F952}'],
  // --- compound and look-alike foods
  [/\b(sushi|sashimi)\b/, '\u{1F363}'],
  [/\bcrab ?cakes?\b/, '\u{1F980}'],
  [/\b(fish|salmon|tuna) ?cakes?\b/, '\u{1F41F}'],
  [/\b(garlic|banana|zucchini|pumpkin|corn) bread\b/, '\u{1F35E}'],
  [/\b(ice cream|gelato|sorbet|frozen yogh?urt)\b/, '\u{1F368}'],
  [/\b(custard|pudding|flan)\b/, '\u{1F36E}'],
  [/\b(peanut|almond|cashew|hazelnut|nut) butter\b/, '\u{1F95C}'],
  [/\b(black|white|cayenne|ground) pepper\b|\b(chil(li|i)|red pepper) flakes\b|\bpeppercorns?\b/, CONDIMENT],
  [/\b(pepper ?jack|monterey jack)\b/, '\u{1F9C0}'],
  [/\b(milk|dark|white|baking) chocolate\b|\bchocolate (chips|spread|bars?)\b/, '\u{1F36B}'],
  [/\bcoconut (milk|cream|water)\b/, '\u{1F965}'],
  [/\b(oat|almond|soy|rice|cashew|plant) (milk|drink|creamer)\b/, '\u{1F95B}'],
  [/\b(hot ?dog|hamburger|burger) buns?\b/, '\u{1F35E}'],
  [/\bhot ?dogs?\b/, '\u{1F32D}'],
  [/\bjuice\b/, '\u{1F9C3}'],
  [/\b(soup|stew|curry|broth|stock|chili con carne)\b/, '\u{1F372}'],
  [/\b(salads?|coleslaw|slaw)\b/, '\u{1F957}'],
  [/\bpies?\b/, '\u{1F967}'],
  [/\b(pumpkins?|butternut( squash)?|(acorn|winter|spaghetti|kabocha) squash)\b/, '\u{1F383}'],
  [/\b(rice cakes?|rice crackers?)\b/, '\u{1F358}'],
  [/\b(english muffins?|crumpets?)\b/, '\u{1F35E}'],
  [/\b(cupcakes?|muffins?)\b/, '\u{1F9C1}'],
  [/\b(cheesecake|cakes?|brownies?)\b/, '\u{1F370}'],
  [/\b(granola|protein|cereal|energy|snack) bars?\b/, '\u{1F968}'],
  [/\b(cereal|corn ?flakes|granola|muesli|oats?|oatmeal|porridge)\b/, '\u{1F963}'],
  [/\b(crackers?|pretzels?|chips|crisps|nachos)\b/, '\u{1F968}'],
  [/\b(tortillas?|wraps?|pita|flatbread|naan)\b/, '\u{1FAD3}'],
  [/\b(noodles?|ramen|pho|udon|soba)\b/, '\u{1F35C}'],
  [/\b(pasta|spaghetti|macaroni|penne|lasagn[ae]|ravioli)\b/, '\u{1F35D}'],
  [/\b(egg ?plants?|aubergines?)\b/, '\u{1F346}'],
  [/\bpizza\b/, '\u{1F355}'],
  [/\b(burger patties|patties|meatballs?)\b/, '\u{1F969}'],
  [/\bburgers?\b/, '\u{1F354}'],
  [/\bsandwich(es)?\b/, '\u{1F96A}'],
  [/\b(french )?fries\b/, '\u{1F35F}'],
  [/\b(tuna|salmon|swordfish) steaks?\b/, '\u{1F41F}'],
  // --- fruit
  [/\bstrawberr(y|ies)\b/, '\u{1F353}'],
  [/\b(blueberr(y|ies)|blackberr(y|ies))\b/, '\u{1FAD0}'],
  [/\b(raspberr(y|ies)|cranberr(y|ies)|redcurrants?|berries)\b/, '\u{1F353}'],
  [/\bpineapples?\b/, '\u{1F34D}'],
  [/\bbananas?\b/, '\u{1F34C}'],
  [/\bapples?\b/, '\u{1F34E}'],
  [/\b(oranges?|clementines?|tangerines?|mandarins?|grapefruits?)\b/, '\u{1F34A}'],
  [/\b(lemons?|limes?)\b/, '\u{1F34B}'],
  [/\b(grapes?|raisins?|sultanas?)\b/, '\u{1F347}'],
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
  [/\b(carrots?|parsnips?)\b/, '\u{1F955}'],
  [/\b(broccoli|broccolini|cauliflower)\b/, '\u{1F966}'],
  [/\b(cucumbers?|zucchini|courgettes?)\b/, '\u{1F952}'],
  [/\b(chil(li|i)(es)?|jalape[nñ]os?|habaneros?)\b/, HOT_PEPPER],
  [/\b(peppers?|capsicums?)\b/, '\u{1FAD1}'],
  [/\b(onions?|shallots?|scallions?|leeks?)\b/, '\u{1F9C5}'],
  [/\bgarlic\b/, '\u{1F9C4}'],
  [/\b(sweet potato(es)?|yams?)\b/, '\u{1F360}'],
  [/\bpotato(es)?\b/, '\u{1F954}'],
  [/\bmushrooms?\b/, '\u{1F344}'],
  [/\b(sweet ?corn|corn)\b/, '\u{1F33D}'],
  [/\bolives?\b/, '\u{1FAD2}'],
  [/\b(spinach|lettuce|kale|arugula|rocket|greens|chard|cabbage|bok ?choy|pak choi|watercress|collards?|brussels sprouts)\b/, '\u{1F96C}'],
  [/\b(basil|cilantro|coriander|parsley|dill|mint|chives|rosemary|thyme|sage|oregano|tarragon|herbs?)\b/, '\u{1F33F}'],
  // --- dairy and eggs
  [/\beggs?\b/, '\u{1F95A}'],
  [/\b(cheese|cheddar|mozzarella|parmesan|feta|brie|camembert|gouda|ricotta|halloumi|swiss|provolone|mascarpone|burrata|manchego|gruy[eè]re|emmental|pecorino|havarti|paneer)\b/, '\u{1F9C0}'],
  [/\b(butter|margarine|ghee)\b/, '\u{1F9C8}'],
  [/\b(milk|yogh?urt|kefir|cream|creamer)\b/, '\u{1F95B}'],
  // --- meat and seafood (bacon before poultry so "turkey bacon" is bacon)
  [/\bbacon\b/, '\u{1F953}'],
  [/\b(chicken|turkey|duck)\b/, '\u{1F357}'],
  [/\b(sausages?|bratwurst|frankfurters?|chorizo|kielbasa)\b/, '\u{1F32D}'],
  [/\b(ham|salami|pepperoni|prosciutto|cold cuts|ribs?|roast|brisket|drumsticks?)\b/, '\u{1F356}'],
  [/\b(beef|steaks?|pork|lamb|mince|veal|venison)\b/, '\u{1F969}'],
  [/\b(shrimps?|prawns?)\b/, '\u{1F990}'],
  [/\bcrabs?\b/, '\u{1F980}'],
  [/\blobsters?\b/, '\u{1F99E}'],
  [/\b(squid|calamari|octopus)\b/, '\u{1F991}'],
  [/\b(oysters?|mussels?|clams?|scallops?|cockles?)\b/, '\u{1F9AA}'],
  [/\b(salmon|fish|tuna|cod|tilapia|trout|sardines?|haddock|halibut|mackerel|sea bass|anchov(y|ies))\b/, '\u{1F41F}'],
  // --- bakery, grains, sweets
  [/\bbagels?\b/, '\u{1F96F}'],
  [/\b(bread|breadcrumbs|bread crumbs|sourdough|baguettes?|buns?|toast|brioche|rolls?)\b/, '\u{1F35E}'],
  [/\bcroissants?\b/, '\u{1F950}'],
  [/\bwaffles?\b/, '\u{1F9C7}'],
  [/\bpancakes?\b/, '\u{1F95E}'],
  [/\b(cookies?|biscuits?)\b/, '\u{1F36A}'],
  [/\b(donuts?|doughnuts?)\b/, '\u{1F369}'],
  [/\b(rice|quinoa|couscous)\b/, '\u{1F35A}'],
  [/\bhoney\b/, '\u{1F36F}'],
  [/\bchocolate\b/, '\u{1F36B}'],
  [/\bpopcorn\b/, '\u{1F37F}'],
  [/\b(peanuts?|almonds?|walnuts?|cashews?|pistachios?|hazelnuts?|pecans?|nuts?|trail mix)\b/, '\u{1F95C}'],
  // --- drinks
  [/\bcoffee\b/, '☕'],
  [/\biced tea\b/, '\u{1F964}'],
  [/\b(tea|matcha)\b/, '\u{1F375}'],
  [/\bbeers?\b/, '\u{1F37A}'],
  [/\b(prosecco|champagne|cava|sparkling wine)\b/, '\u{1F942}'],
  [/\bwine\b/, '\u{1F377}'],
  // --- leftovers last, so "leftover pasta" still shows pasta
  [/\b(takeout|take-out|takeaway)\b/, '\u{1F961}'],
  [/\bleftovers?\b/, '\u{1F372}'],
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
