import type { Category, StorageLocation } from './types';

/**
 * How many days food typically keeps, per storage place, in the state a household usually has it:
 * fresh produce, meat and fish as bought; dry goods opened; leftovers cooked. Where it is kept tells us
 * the rest: a jar, carton or can that needs refrigerating once opened is opened in the fridge and
 * unopened in the cupboard. Freezer figures are for best quality (frozen food stays safe, but quality
 * fades).
 *
 * Every figure sits inside the range given by USDA FoodKeeper, the FDA refrigerator and freezer chart
 * and FSIS guidance for that food; `__tests__/shelflife-reference.test.ts` checks about 400 foods in all
 * three places against an independently compiled reference. Where the guidance gives a range, the
 * shorter end is preferred for perishables, because an early reminder costs less than a late one.
 * They are estimates for a reminder app, not food-safety guarantees; the app labels them and lets
 * people edit them.
 */
type Days = Record<StorageLocation, number>;

/** Fallbacks for foods no rule recognises. Deliberately conservative. */
const CATEGORY_DEFAULTS: Record<Category, Days> = {
  produce: { fridge: 5, freezer: 180, pantry: 1 },
  dairy: { fridge: 7, freezer: 60, pantry: 0 },
  meat: { fridge: 2, freezer: 120, pantry: 0 },
  seafood: { fridge: 2, freezer: 90, pantry: 0 },
  bakery: { fridge: 7, freezer: 60, pantry: 3 },
  leftovers: { fridge: 3, freezer: 60, pantry: 0 },
  drinks: { fridge: 7, freezer: 90, pantry: 180 },
  condiments: { fridge: 90, freezer: 90, pantry: 90 },
  grains: { fridge: 365, freezer: 365, pantry: 365 },
  canned: { fridge: 3, freezer: 60, pantry: 730 },
  snacks: { fridge: 30, freezer: 30, pantry: 30 },
  other: { fridge: 7, freezer: 60, pantry: 30 },
};

interface Rule {
  re: RegExp;
  days: Days;
  /** Freezing ruins it or is advised against (lettuce, eggs in the shell, mayonnaise, soft cheese, fizzy drinks). */
  noFreeze?: boolean;
  /** Describes jarred, bottled or canned food, so it also applies to items filed as canned. */
  packaged?: boolean;
}

const d = (fridge: number, freezer: number, pantry: number): Days => ({ fridge, freezer, pantry });
/** For food that does not freeze well: time in the freezer buys nothing over the fridge. */
const nf = (re: RegExp, fridge: number, pantry: number): Rule => ({ re, days: d(fridge, fridge, pantry), noFreeze: true });
const r = (re: RegExp, days: Days): Rule => ({ re, days });
/** Marks rules about jars, bottles and cans. */
const pk = (rule: Rule): Rule => ({ ...rule, packaged: true });

/**
 * First match wins, so prepared and processed foods come before the ingredients they are named after:
 * "leftover pasta" is cooked food, "peanut butter" is not butter, "fish sauce" is not fish, "canned
 * tomatoes" are not fresh tomatoes.
 */
const RULES: Rule[] = [
  nf(/\b(sushi|sashimi|poke)\b/, 1, 0),
  // Canned and tinned food: unopened in the cupboard, a few days once opened.
  pk(r(/\b(tomato paste|tomato pur[eé]e)\b/, d(5, 90, 540))),
  pk(r(/\b(chopped tomatoes|(canned|tinned) tomatoes)\b/, d(5, 60, 540))),
  pk(r(/\btomato soup\b/, d(4, 60, 540))),
  // Cartons of broth and stock: unopened in the cupboard, days once opened.
  pk(r(/\b(broth|stock)\b(?! cubes?)/, d(4, 60, 365))),
  pk(r(/\b(canned|tinned|can of|tin of)\b/, d(3, 60, 730))),
  pk(r(/\bcoconut (milk|cream)\b/, d(5, 60, 730))),
  pk(r(/\bapple ?sauce\b/, d(10, 60, 365))),
  // Sauces, spreads and dips
  pk(r(/\b(pasta sauce|marinara|tomato sauce|pizza sauce)\b/, d(4, 180, 365))),
  pk(r(/\bguacamole\b/, d(3, 90, 0))),
  pk(nf(/\btzatziki\b/, 4, 0)),
  pk(r(/\b(hummus|dips?)\b/, d(7, 60, 0))),
  pk(r(/\bsalsa\b/, d(14, 45, 365))),
  pk(r(/\bpesto\b/, d(5, 90, 180))),
  pk(nf(/\b(peanut|almond|cashew|hazelnut|nut|seed) butter\b/, 90, 90)),
  pk(nf(/\btahini\b/, 180, 90)),
  pk(nf(/\b(chocolate|hazelnut) spread\b/, 60, 60)),
  pk(nf(/\b(ranch|caesar|blue cheese|creamy) dressing\b/, 45, 90)),
  pk(nf(/\b(mayo|mayonnaise|aioli)\b/, 60, 90)),
  pk(nf(/\b(dressing|vinaigrette)\b/, 60, 180)),
  pk(nf(/\bketchup\b/, 180, 30)),
  pk(nf(/\bmustard\b(?! greens)/, 365, 30)),
  pk(nf(/\b(soy sauce|tamari)\b/, 365, 60)),
  pk(nf(/\b(fish sauce|worcestershire)\b/, 365, 365)),
  pk(nf(/\b(hot sauce|sriracha|tabasco|chil(li|i) sauce)\b/, 180, 120)),
  pk(nf(/\b(bbq|barbecue) sauce\b/, 120, 365)),
  pk(nf(/\b(oyster|hoisin) sauce\b/, 90, 365)),
  pk(nf(/\bteriyaki sauce\b/, 60, 365)),
  pk(nf(/\b(jam|jelly|marmalade|preserves)\b/, 180, 365)),
  pk(nf(/\brelish\b/, 90, 365)),
  pk(nf(/\b(pickles?|gherkins?|chutney|capers)\b/, 60, 365)),
  pk(nf(/\bolives\b/, 14, 365)),
  pk(r(/\bvinegar\b/, d(730, 730, 730))),
  pk(r(/\boils?\b/, d(180, 180, 180))),
  pk(r(/\bhoney\b/, d(730, 730, 730))),
  pk(r(/\bmaple syrup\b|\bsyrup\b/, d(365, 730, 365))),
  // Seasonings and baking staples keep for years; tracking them is only about quality.
  r(/\bbrown sugar\b/, d(365, 365, 365)),
  r(
    /\b(salt|sugar(?! snap)|black pepper|white pepper|peppercorns?|spices?|seasoning|cinnamon|paprika|cumin|nutmeg|turmeric|cayenne|chil(li|i) (powder|flakes)|red pepper flakes|baking (soda|powder)|vanilla extract|ground (coriander|cumin|ginger|cinnamon|nutmeg|cloves|turmeric|cardamom)|dried (herbs|oregano|basil|thyme|parsley|rosemary)|(garlic|onion|curry|chil(li|i)) powder|stock cubes?|bouillon)\b/,
    d(730, 730, 730),
  ),
  r(/\b(milk|dark|white|baking) chocolate\b|\bchocolate (chips|bars?)\b|^chocolate$/, d(180, 180, 180)),
  nf(/\bcurry paste\b/, 30, 0),
  r(/\bdough\b/, d(4, 90, 0)),
  // Frozen food: best quality for months frozen, a couple of days once thawed.
  r(/\b(ice cream|gelato|sorbet|frozen yogh?urt|ice pops?|popsicles?)\b/, d(0, 60, 0)),
  r(/\bfrozen (peas|corn|spinach|berries|fruit|vegetables|veg|mixed vegetables|broccoli|green beans|mango|edamame)\b/, d(3, 300, 0)),
  r(/\bfrozen (waffles|pancakes)\b/, d(3, 60, 0)),
  r(/\bfrozen\b/, d(2, 90, 0)),
  // Cooked and prepared food
  nf(/\b(potato|pasta|macaroni|egg|chicken|tuna|rice|bean) salad\b|\b(cole)?slaw\b/, 4, 0),
  r(
    /\b(leftovers?|cooked|takeout|take-out|takeaway|soups?|stews?|curry|curries|chili con carne|casseroles?|lasagn[ae]|broth|stock|rotisserie|pulled pork|fried rice|(egg|spring) rolls|pizza)\b/,
    d(4, 60, 0),
  ),
  // Drinks (before fruit, so "orange juice" is juice)
  r(/\bsmoothies?\b/, d(2, 60, 0)),
  r(/\b(juice|lemonade)\b/, d(7, 300, 180)),
  nf(/\biced tea\b/, 5, 180),
  r(/\bcoconut water\b/, d(3, 60, 180)),
  r(/\bcold brew\b/, d(10, 60, 0)),
  // Dry coffee and tea: the fridge adds nothing (it only lends odours), so it counts the same as the cupboard.
  r(/\bcreamer\b/, d(14, 60, 0)),
  r(/\b(coffee beans|ground coffee|coffee)\b/, d(30, 60, 30)),
  r(/\b(tea|matcha)\b/, d(180, 180, 180)),
  nf(/\bkombucha\b/, 7, 0),
  nf(/\b(sparkling water|seltzer|soda water|tonic)\b/, 270, 270),
  nf(/\b(soda|cola|soft drinks?|pop|ginger ale|root beer)\b/, 180, 180),
  nf(/\b(beer|lager|ale|cider)\b/, 180, 120),
  nf(/\b(prosecco|champagne|cava|sparkling wine)\b/, 2, 365),
  nf(/\bwine\b/, 4, 730),
  nf(/\b(oat|almond|soy|rice|cashew|hemp|nut|plant) (milk|drink|creamer)\b/, 7, 180),
  // Snacks, nuts and dried fruit, as opened packs (before potato, tortilla and rice)
  r(/\b(chips|crisps|popcorn|nachos)\b/, d(14, 14, 14)),
  r(/\b(rice cakes?|rice crackers?)\b/, d(14, 14, 14)),
  r(/\bcrackers?\b/, d(30, 30, 30)),
  r(/\bpretzels?\b/, d(21, 21, 21)),
  r(/\b(cookies|biscuits)\b/, d(21, 90, 21)),
  r(/\b(granola|protein|cereal|energy|snack) bars?\b/, d(90, 90, 90)),
  r(/\btrail mix\b/, d(90, 180, 60)),
  r(/\b(granola|muesli)\b/, d(60, 120, 60)),
  r(/\b(cereal|corn ?flakes)\b/, d(60, 60, 60)),
  r(/\balmonds?\b/, d(180, 365, 90)),
  r(/\b(nuts?|walnuts?|cashews?|pecans?|pistachios?|peanuts?|hazelnuts?|macadamias?)\b/, d(180, 365, 60)),
  r(/\b(raisins?|sultanas?|dried fruit|prunes?|dried apricots?|dates)\b/, d(180, 365, 120)),
  // Seafood (fatty fish keeps 2-3 months frozen, lean fish 6-8)
  r(/\bsmoked (salmon|fish|trout|mackerel)\b/, d(7, 60, 0)),
  r(/\b(fish sticks|fish fingers|breaded fish)\b/, d(2, 180, 0)),
  r(/\b(crab|lobster|fish|salmon)[ -]?cakes?\b/, d(2, 60, 0)),
  r(/\b(crabs?|lobsters?)\b/, d(2, 90, 0)),
  r(/\b(mussels|clams|oysters|cockles)\b/, d(2, 60, 0)),
  r(/\b(shrimps?|prawns?|scallops?)\b/, d(2, 150, 0)),
  r(/\b(squid|calamari|octopus)\b/, d(2, 120, 0)),
  r(/\b(salmon|tuna|trout|mackerel|sardines?|anchov(y|ies)|herring|swordfish)\b/, d(2, 60, 0)),
  r(/\b(cod|tilapia|haddock|halibut|sea bass|pollock|sole|flounder|hake|catfish|snapper)\b/, d(2, 180, 0)),
  r(/\bfish\b/, d(2, 90, 0)),
  // Bakery (before meat and produce, so "hot dog buns" and "garlic bread" are bread)
  r(/\bgarlic bread\b/, d(4, 60, 0)),
  r(/\b(baguettes?|french bread)\b/, d(3, 60, 2)),
  r(/\bcroissants?\b/, d(6, 45, 2)),
  r(/\b(donuts?|doughnuts?)\b/, d(5, 45, 2)),
  r(/\benglish muffins?\b/, d(7, 60, 4)),
  r(/\b(muffins?|crumpets?|brioche|scones?)\b/, d(6, 60, 3)),
  r(/\b(pitas?|naan|flatbreads?)\b/, d(5, 90, 3)),
  r(/\bsourdough\b/, d(6, 90, 4)),
  r(/\b(bread|bagels?|buns?|rolls?|loaf)\b/, d(8, 90, 4)),
  r(/\bpies?\b/, d(3, 90, 2)),
  r(/\bcheesecake\b/, d(5, 60, 0)),
  r(/\b(cakes?|brownies?|pastr(y|ies))\b/, d(5, 60, 2)),
  // Dairy (plant milks and nut butters are handled above)
  r(/\bstring cheese\b/, d(21, 180, 0)),
  r(/\b(shredded|grated) cheese\b/, d(7, 90, 0)),
  r(/\bsliced cheese\b/, d(10, 90, 0)),
  nf(/\b(american cheese|processed cheese|cheese slices)\b/, 21, 0),
  nf(/\b(cream cheese|sour cream)\b/, 14, 0),
  nf(/\bmascarpone\b/, 4, 0),
  nf(/\b(cottage cheese|ricotta|cr[eè]me fra[iî]che)\b/, 7, 0),
  r(/\b(mozzarella|burrata|halloumi|paneer)\b/, d(5, 180, 0)),
  r(/\b(brie|camembert|goat cheese|chevre|feta)\b/, d(7, 90, 0)),
  r(/\b(parmesan|parmigiano|pecorino|grana padano)\b/, d(42, 180, 0)),
  r(/\b(cheddar|swiss|gouda|provolone|monterey jack|pepper ?jack|manchego|gruy[eè]re|emmental|havarti|colby|blue cheese|cheese)\b/, d(21, 180, 0)),
  r(/\bmargarine\b/, d(120, 365, 0)),
  r(/\b(butter|ghee)\b/, d(60, 270, 2)),
  r(/\b(yogh?urt)\b/, d(10, 45, 0)),
  r(/\bkefir\b/, d(7, 60, 0)),
  nf(/\b(custard|pudding)\b/, 3, 0),
  nf(/\bsingle cream\b/, 4, 0),
  r(/\b(half and half|double cream|light cream)\b/, d(4, 90, 0)),
  r(/\b(heavy cream|whipping cream|cream)\b/, d(10, 90, 0)),
  r(/\bbuttermilk\b/, d(14, 90, 0)),
  r(/\bmilk\b/, d(7, 90, 0)),
  // Meat (bacon before poultry so "turkey bacon" is bacon; cured and deli meats before raw cuts)
  r(/\b(veggie|vegan|plant-based|meatless) (burgers?|sausages?|patties|mince)\b/, d(4, 120, 0)),
  r(/\bbacon\b/, d(7, 30, 0)),
  r(/\b(salami|pepperoni)\b/, d(21, 60, 0)),
  r(/\b(ham|deli|prosciutto|lunch meat|cold cuts|turkey slices|sliced turkey|roast beef)\b/, d(5, 60, 0)),
  r(/\b(ground (beef|turkey|pork|chicken|lamb)|mince|minced|burger patties|patties|meatballs?|stew(ing)? (beef|meat)|stewing steak)\b/, d(2, 120, 0)),
  r(/\bwhole (chicken|turkey|duck)\b/, d(2, 365, 0)),
  r(/\b(chicken|turkey|duck)\b/, d(2, 270, 0)),
  r(/\b(hot ?dogs?|frankfurters?|wieners?)\b/, d(7, 60, 0)),
  // Raw sausages keep 1-2 days (including fresh chorizo); cured ones longer, but the shorter figure is safer.
  r(/\b(sausages?|bratwurst|chorizo|kielbasa)\b/, d(2, 60, 0)),
  r(/\b(beef|steak|pork|lamb|veal|venison|roast|ribs|brisket|chops?)\b/, d(4, 180, 0)),
  r(/\btofu\b/, d(5, 150, 0)),
  r(/\btempeh\b/, d(10, 150, 0)),
  r(/\b(tortillas?|wraps?)\b/, d(21, 180, 7)),
  // Produce. Most of it wilts within a day at room temperature; the hardy exceptions have their own pantry figures.
  r(/\bbrussels sprouts\b/, d(5, 300, 1)),
  nf(/\b(bean sprouts|alfalfa sprouts|sprouts)\b/, 2, 0),
  nf(/\b(iceberg|romaine)\b/, 7, 1),
  nf(/\bwatercress\b/, 3, 0),
  nf(/\b(lettuce|arugula|rocket|salad greens|salad mix|mixed salad|mesclun|salad)\b/, 5, 0),
  r(/\b(spinach|kale|chard|collards?|greens|bok ?choy|pak choi)\b/, d(5, 240, 0)),
  r(/\bstrawberr/, d(5, 240, 1)),
  r(/\b(raspberr|blackberr|mulberr|berries)/, d(3, 240, 1)),
  r(/\bblueberr/, d(7, 240, 1)),
  r(/\bcranberr/, d(28, 300, 2)),
  r(/\bgrapes?\b/, d(7, 240, 1)),
  r(/\bcherr(y|ies)\b(?! tomato)/, d(5, 240, 1)),
  r(/\bbananas?\b/, d(7, 90, 5)),
  r(/\bavocados?\b/, d(5, 120, 4)),
  r(/\bapples?\b/, d(28, 240, 7)),
  r(/\b(oranges?|clementines?|mandarins?|tangerines?|grapefruits?|lemons?|limes?)\b/, d(21, 120, 7)),
  r(/\b(peach(es)?|nectarines?|plums?|apricots?)\b/, d(4, 240, 2)),
  r(/\bpineapples?\b/, d(5, 180, 2)),
  r(/\bwatermelons?\b/, d(14, 240, 7)),
  r(/\bpomegranates?\b/, d(30, 240, 7)),
  r(/\bcoconuts?\b/, d(14, 180, 7)),
  r(/\bfigs?\b/, d(3, 240, 1)),
  r(/\b(cantaloupes?|honeydew|melons?)\b/, d(7, 240, 3)),
  r(/\bkiwi(fruit)?s?\b/, d(7, 180, 3)),
  r(/\bpassion ?fruits?\b/, d(7, 240, 3)),
  r(/\b(mang(o|oes|os)|papayas?)\b/, d(5, 240, 3)),
  r(/\bpears?\b/, d(5, 240, 3)),
  r(/\brhubarb\b/, d(7, 240, 1)),
  r(/\btomato/, d(7, 180, 5)),
  r(/\b(pumpkins?|butternut|(acorn|winter|spaghetti|kabocha) squash)\b/, d(10, 240, 60)),
  r(/\b(zucchini|courgettes?|summer squash|squash)\b/, d(5, 240, 1)),
  nf(/\bcucumbers?\b/, 5, 1),
  r(/\b(chil(li|i)(es)?|jalape[nñ]os?|habaneros?|chil(li|i) peppers?)\b/, d(7, 180, 3)),
  r(/\b(peppers?|capsicum)\b/, d(10, 180, 2)),
  r(/\bbaby carrots\b/, d(14, 300, 1)),
  r(/\bcarrots?\b/, d(21, 300, 4)),
  r(/\b(broccoli|cauliflower)\b/, d(5, 300, 1)),
  r(/\basparagus\b/, d(3, 240, 1)),
  r(/\b(green beans?|snap peas|snow peas|sugar snap peas|peas|runner beans)\b/, d(4, 240, 1)),
  r(/\b(okra|edamame)\b/, d(3, 240, 0)),
  r(/\b(corn on the cob|sweet ?corn|corn)\b/, d(2, 240, 1)),
  r(/\bmushrooms?\b/, d(5, 300, 1)),
  // Sweet potatoes should not be refrigerated raw (the core hardens); the fridge figure is for quality only.
  r(/\b(sweet potato(es)?|yams?)\b/, d(14, 300, 28)),
  r(/\bpotato(es)?\b/, d(21, 300, 30)),
  r(/\b(rosemary|thyme|sage|oregano)\b/, d(14, 120, 2)),
  r(/\bbasil\b/, d(5, 120, 3)),
  r(/\b(cilantro|coriander|parsley|mint|dill|herbs?|chives|tarragon)\b/, d(7, 120, 1)),
  r(/\b(scallions?|green onions?|spring onions?)\b/, d(7, 120, 1)),
  r(/\bleeks?\b/, d(10, 120, 1)),
  r(/\b(onions?|shallots?)\b/, d(30, 180, 30)),
  r(/\bgarlic\b/, d(14, 180, 60)),
  r(/\bginger\b/, d(21, 120, 7)),
  r(/\bcelery\b/, d(10, 240, 1)),
  r(/\bfennel\b/, d(5, 240, 1)),
  r(/\b(cabbage)\b/, d(14, 240, 2)),
  nf(/\bradish(es)?\b/, 14, 1),
  r(/\b(beets?|beetroot|parsnips?|turnips?|rutabagas?|swedes?)\b/, d(14, 240, 3)),
  r(/\b(artichokes?)\b/, d(5, 240, 1)),
  r(/\b(egg ?plants?|aubergines?)\b/, d(5, 180, 2)),
  // Grains, as opened dry packs (after cooked food and snacks; before eggs, so "egg noodles" are noodles)
  r(/\b(fresh (pasta|noodles)|ravioli|tortellini|gnocchi)\b/, d(3, 60, 0)),
  r(/\bbrown rice\b/, d(180, 365, 180)),
  r(/\bbreadcrumbs\b|\bbread crumbs\b|\bpanko\b/, d(180, 180, 180)),
  r(/\b(instant )?ramen\b/, d(180, 180, 180)),
  r(/\b(pasta|spaghetti|penne|macaroni|noodles?|rice|quinoa|oats?|oatmeal|couscous|flour|lentils|dried beans|polenta|bulgur|barley)\b/, d(365, 365, 365)),
  nf(/\beggs?\b/, 28, 0),
];

/** Estimates never exceed two years; past that, "keeps a year or more" is all anyone needs to know. */
export const MAX_SHELF_LIFE_DAYS = 730;

function ruleFor(name: string): Rule | undefined {
  const lower = name.toLowerCase();
  return RULES.find((rule) => rule.re.test(lower));
}

function ruleForItem(name: string, category: Category): Rule | undefined {
  const rule = ruleFor(name);
  // "Tuna" or "Peaches" filed as canned are cans: the fresh-food figures do not apply.
  if (rule && category === 'canned' && !rule.packaged) return undefined;
  return rule;
}

export function estimateShelfLifeDays(name: string, category: Category, location: StorageLocation): number {
  const rule = ruleForItem(name, category);
  const days = rule ? rule.days[location] : CATEGORY_DEFAULTS[category][location];
  return Math.min(Math.max(Math.round(days), 0), MAX_SHELF_LIFE_DAYS);
}

/**
 * The figure from a food-specific rule, or null when the food is only known by its category. Used to
 * rein in an AI estimate that is longer than the guidance for a food we recognise.
 */
export function knownShelfLifeDays(name: string, category: Category, location: StorageLocation): number | null {
  const rule = ruleForItem(name, category);
  return rule ? Math.min(rule.days[location], MAX_SHELF_LIFE_DAYS) : null;
}

/**
 * False for food that freezing ruins or that guidance says not to freeze: salad leaves, cucumber, eggs in
 * the shell, mayonnaise and most sauces, soft cheeses, cream-based desserts, fizzy drinks.
 */
export function freezesWell(name: string, category: Category): boolean {
  const rule = ruleForItem(name, category);
  if (rule) return !rule.noFreeze;
  // Unknown sauces and drinks: freezing is not advised. Anything canned is only frozen once opened and
  // moved to another container, which is fine.
  return category !== 'condiments' && category !== 'drinks';
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

const COUNTER_PRODUCE =
  /\b(bananas?|potato(es)?|sweet potato(es)?|yams?|onions?|shallots?|garlic|tomato(es)?|avocados?|pumpkins?|butternut|(acorn|winter|spaghetti|kabocha) squash|watermelons?|pineapples?|coconuts?|mang(o|oes|os))\b/;
const COLD_DRINKS = /\b(juice|milk|lemonade|smoothies?|kombucha|cold brew|creamer|iced tea)\b/;

/**
 * Where a food usually goes when you get home with it, for putting shopping away: bananas and
 * potatoes on the counter or in the cupboard, milk and meat in the fridge, frozen peas in the freezer.
 */
export function usualPlace(name: string, category: Category): StorageLocation {
  const lower = name.toLowerCase();
  if (/\b(frozen|ice cream|gelato|sorbet|ice pops?|popsicles?|fish sticks|fish fingers)\b/.test(lower)) return 'freezer';
  switch (category) {
    case 'produce':
      return COUNTER_PRODUCE.test(lower) && !/\b(cherry tomatoes|cut|sliced|chopped)\b/.test(lower) ? 'pantry' : 'fridge';
    case 'dairy':
    case 'meat':
    case 'seafood':
    case 'leftovers':
      return 'fridge';
    case 'drinks':
      return COLD_DRINKS.test(lower) ? 'fridge' : 'pantry';
    case 'other':
      return estimateShelfLifeDays(name, category, 'pantry') >= 14 && ruleFor(name) ? 'pantry' : 'fridge';
    default:
      // Bakery, grains, canned food, condiments and snacks live in the cupboard unless they must be chilled.
      return estimateShelfLifeDays(name, category, 'pantry') === 0 ? 'fridge' : 'pantry';
  }
}

/**
 * Freezing as a rescue: for food due within three days that freezes well, how long it would keep if
 * frozen today. Null when freezing would not help (it freezes badly, is already frozen, or gains little).
 */
export function freezeRescueDays(item: { name: string; category: Category; location: StorageLocation }, daysLeft: number): number | null {
  if (item.location === 'freezer' || daysLeft < 0 || daysLeft > 3) return null;
  if (!freezesWell(item.name, item.category)) return null;
  const frozen = estimateShelfLifeDays(item.name, item.category, 'freezer');
  const here = estimateShelfLifeDays(item.name, item.category, item.location);
  return frozen >= 30 && frozen >= here * 2 ? frozen : null;
}
