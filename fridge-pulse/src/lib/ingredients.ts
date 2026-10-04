import type { PantryItem } from './types';

/**
 * What a food can do in a recipe. A recipe slot asks for roles ("a vegetable that roasts", "a cheese
 * that melts"), never for a category or a loose word match, so ice cream can never land in a soup
 * because its name contains "cream", and strawberries never count as a vegetable.
 *
 * Foods get roles from the ordered table below. A food the table does not know gets none and is
 * simply left out of the built-in recipes (the AI ideas still see it).
 */
export const ROLES = [
  // Vegetables, by how they are cooked.
  'veg-raw', // chopped into a salad
  'veg-sandwich', // sliced into a sandwich or wrap
  'veg-dip', // raw sticks for dipping
  'veg-stirfry',
  'veg-filling', // folded into eggs, quesadillas and pizzas
  'veg-pasta',
  'veg-roast',
  'veg-soup',
  'veg-curry',
  'taco-topping',
  'salad-leaves',
  'cooking-greens',
  'lettuce-cup',
  // Flavour.
  'onion',
  'onion-raw',
  'spring-onion',
  'garlic',
  'ginger',
  'herb', // any fresh herb
  'herb-soft', // leafy herbs scattered over at the end
  'herb-woody', // thyme, rosemary and sage, cooked in
  'basil',
  'cilantro',
  'parsley',
  'dill',
  'mint',
  'chives',
  'citrus',
  'chili',
  // Particular vegetables some recipes are built around.
  'potato',
  'sweet-potato',
  'tomato',
  'avocado',
  'cucumber',
  'cabbage',
  'mushroom',
  'zucchini',
  'eggplant',
  'bell-pepper',
  'carrot',
  'celery',
  'broccoli',
  'cauliflower',
  'squash',
  'corn',
  'sweetcorn', // kernels, ready to stir in
  'peas',
  'green-beans',
  'asparagus',
  'spinach',
  'kale',
  'leek',
  'beets',
  'bean-sprouts',
  'brussels',
  'edamame',
  // Fruit.
  'fruit-fresh', // eaten as it is: fruit salad, toppings
  'fruit-smoothie',
  'fruit-bake', // crumbles and compotes
  'banana',
  'apple',
  'berries',
  'mango',
  'cheese-fruit', // grapes, apples, pears and figs next to cheese
  'dried-fruit',
  // Dairy and eggs.
  'milk', // dairy or plant milk
  'buttermilk',
  'yogurt', // plain: savoury or sweet
  'yogurt-sweet', // any yogurt, for sweet dishes
  'kefir',
  'cream', // for cooking
  'whipping-cream', // cream that can be whipped for a dessert
  'whipped-cream', // ready to spoon on a dessert
  'sour-cream',
  'cream-cheese',
  'butter',
  'cheese-melt',
  'cheese-grate',
  'cheese-crumble',
  'cheese-soft',
  'cheese-board',
  'mozzarella',
  'halloumi',
  'paneer',
  'egg',
  // Sweet things: only ever used in desserts and drinks.
  'ice-cream',
  'custard',
  'cake',
  'cookies',
  'chocolate',
  'chocolate-spread',
  'jam',
  'sweetener',
  // Bread and starch.
  'bread',
  'crusty-bread',
  'bun',
  'hotdog-bun',
  'bagel',
  'english-muffin',
  'croissant',
  'flatbread',
  'tortilla',
  'corn-tortilla',
  'pizza-dough',
  'waffles',
  'pasta',
  'filled-pasta',
  'gnocchi',
  'noodles',
  'rice-noodles',
  'ramen',
  'rice',
  'risotto-rice', // short or medium grain
  'grain',
  'oats',
  'granola',
  'flour',
  'breadcrumbs',
  'tortilla-chips',
  'crackers',
  // Meat.
  'chicken', // boneless pieces
  'chicken-bone-in',
  'whole-chicken',
  'chicken-wings',
  'ground-meat',
  'steak',
  'stew-meat',
  'pork-chops',
  'lamb-chops',
  'ribs',
  'duck',
  'bacon',
  'sausage',
  'chorizo',
  'ham',
  'deli-meat',
  'cured-meat',
  'hot-dogs',
  'meatballs',
  'burger-patty',
  // Fish and seafood.
  'salmon',
  'fish',
  'white-fish',
  'smoked-salmon',
  'shrimp',
  'mussels',
  'seafood',
  'canned-fish',
  'sardines',
  'anchovies',
  'fish-sticks',
  // Plant protein.
  'tofu',
  'tempeh',
  'veggie-burger',
  'falafel',
  'beans',
  'refried-beans',
  'chickpeas',
  'lentils',
  'baked-beans',
  // Jars, tins and the cupboard.
  'tinned-tomato',
  'tomato-paste',
  'pasta-sauce',
  'coconut-milk',
  'stock',
  'salsa',
  'pesto',
  'hummus',
  'guacamole',
  'tzatziki',
  'curry-paste',
  'bbq-sauce',
  'mayo',
  'dressing',
  'peanut-butter',
  'tahini',
  'olives',
  'pickles',
  'nuts',
  'asian-nuts', // peanuts and cashews, for stir-fries
  'seeds',
  'coffee',
  'juice',
  'wine',
  // Cooked food that can be used again.
  'cooked-rice',
  'cooked-chicken',
  'cooked-meat',
  'cooked-potato',
  'cooked-pasta',
] as const;

export type Role = (typeof ROLES)[number];

// Common role sets.
const LEAVES: Role[] = ['salad-leaves', 'veg-sandwich'];
const BERRY: Role[] = ['berries', 'fruit-fresh', 'fruit-bake', 'fruit-smoothie'];
const STONE_FRUIT: Role[] = ['fruit-fresh', 'fruit-bake', 'fruit-smoothie'];
const TROPICAL: Role[] = ['fruit-fresh', 'fruit-smoothie'];
const MELTING: Role[] = ['cheese-melt', 'cheese-board'];
const ROOT: Role[] = ['veg-roast', 'veg-soup'];
const NONE: Role[] = [];

/**
 * First the rule whose match ends furthest right wins (the last word of a name is usually what it
 * is: "strawberry yogurt" is a yogurt, "honey roast ham" is ham, "chicken soup" is soup). When two
 * rules end at the same place the earlier one wins, so compound names ("peanut butter", "ice
 * cream", "green beans") come before the words they end with.
 */
const RULES: [RegExp, Role[]][] = [
  // --- Desserts and sweets: kept out of every savoury recipe.
  [/\b(english muffins?|crumpets?)\b/, ['english-muffin']],
  [/\bpasta salad\b|\blasagn[ae]( sheets| noodles)?$|\bmac(aroni)? (and|&|n'?) cheese\b|\bspaghetti hoops\b|\bspaghettios\b|\bbutter chicken\b/, NONE],
  [/\b(ice[- ]?creams?|gelato|frozen yogh?urt|froyo)\b/, ['ice-cream']],
  [/\b(sorbet|sherbet|popsicles?|ice pops?|ice lollies|ice lolly)\b/, NONE],
  [/\b(whipped cream|whipped topping|squirty cream|clotted cream)\b/, ['whipped-cream']],
  [/\bcustards?\b/, ['custard']],
  [/\b(fish|salmon|tuna|cod|crab|shrimp|prawn)[ -]?cakes?\b|\bbreaded fish\b|\bfish (sticks|fingers|goujons)\b/, ['fish-sticks']],
  [/\bgraham crackers?\b/, ['cookies']],
  [/\b(rice|corn) cakes?\b|\boat ?cakes?\b|\b(crackers?|crispbreads?|saltines|water biscuits)\b/, ['crackers']],
  [/\b(sponge|pound|swiss roll|madeira|angel food|layer|birthday|carrot|chocolate|lemon|coffee|fruit) cakes?\b|\b(cakes?|brownies?|blondies?|ladyfingers|savoiardi)\b/, ['cake']],
  [/\b(cookies?|biscotti|digestives?|shortbread|ginger ?snaps?|oreos?)\b/, ['cookies']],
  [
    /\b(pudding|jell-?o|mousse|flan|panna cotta|tiramisu|cheesecake|eclairs?|danish|pastr(y|ies)|donuts?|doughnuts?|cupcakes?|macarons?|candy|candies|sweets|gumm(y|ies)|jelly beans|peanut butter cups|marshmallows?|fudge|toffees?|caramels?|truffles?|muffins?|scones?|croissants? au chocolat|pain au chocolat|pie filling|pie crust|puff pastry|filo|phyllo)\b|\b(tarts?|pies?)$|\b(chocolate|easter|creme|cream) eggs\b|\bscotch eggs?\b/,
    NONE,
  ],
  [/\b(chocolate|hazelnut) spread\b|\bnutella\b/, ['chocolate-spread']],
  [/\b(chocolate|strawberry|banana) milk\b|\bmilkshakes?\b|\bhot chocolate\b|\bcocoa powder\b/, NONE],
  [/\bchocolate( chips?| chunks?| bars?)?\b|\bchoc chips\b|\b(dark|milk|white|baking|cooking) chocolate\b/, ['chocolate']],
  [/\b(jam|jelly|marmalade|preserves|fruit spread|lemon curd|apple butter)\b/, ['jam']],
  [/\b(honey|maple syrup|agave( syrup)?|golden syrup|date syrup|syrup|treacle|molasses)\b/, ['sweetener']],

  // --- Sauces, dips and seasonings. Most are left to the extras list.
  [/\b(pasta|pizza|marinara|tomato|arrabbiata|napoletana|bolognese|vodka) sauce\b|\bmarinara\b/, ['pasta-sauce']],
  [/\b(bbq|barbecue) sauce\b/, ['bbq-sauce']],
  [/\b(curry|tikka|korma|thai (red|green|yellow) curry|red curry|green curry|yellow curry) pastes?\b|\bcurry sauce\b/, ['curry-paste']],
  [/\btomato (paste|puree|purée)\b/, ['tomato-paste']],
  [/\b(garlic|ginger) pastes?\b/, NONE],
  [/\b(\w+ )?sauces?\b|\b(ketchup|mustard|relish|vinegar|oils?|salt|sugar|spices?|seasonings?|powder|flakes|stock powder|gravy|chutney|sriracha|tabasco|worcestershire|gochujang|harissa|miso|tamari|extract|essence|yeast|baking soda|bicarbonate|cornstarch|cornflour|gelatine?|sprinkles)\b|\b\w+ pastes?\b|\b\w+ dips?\b/, NONE],
  [/\b(black|white|ground|cracked|lemon|cayenne) pepper\b|\bpeppercorns?\b|\bground (ginger|cinnamon|cumin|coriander|nutmeg|turmeric)\b/, NONE],
  [/\bdried (herbs|oregano|basil|parsley|thyme|rosemary|dill|mint|sage|chives|chil(l)?ies)\b|\bbay lea(f|ves)\b|\bkaffir lime lea(f|ves)\b|\b(coriander|cumin|fennel|mustard|caraway|nigella) seeds\b/, NONE],
  [/\b(salsa|pico de gallo|salsa verde)\b/, ['salsa']],
  [/\bpesto\b/, ['pesto']],
  [/\b(hummus|houmous)\b/, ['hummus']],
  [/\bguacamole\b/, ['guacamole']],
  [/\b(tzatziki|raita)\b/, ['tzatziki']],
  [/\b(mayo|mayonnaise|aioli)\b/, ['mayo']],
  [/\b(dressing|vinaigrette|ranch|salad cream)\b/, ['dressing']],
  [/\b(peanut|almond|cashew|sunflower( seed)?|nut|hazelnut) butter\b/, ['peanut-butter']],
  [/\btahini\b/, ['tahini']],
  [/\b(olives?|kalamata|capers)\b/, ['olives']],
  [/\b(pickles?|gherkins?|cornichons|sauerkraut|kimchi|pickled \w+)\b/, ['pickles']],

  // --- Drinks.
  [/\b(coconut) (milk|drink) (beverage|drink)\b|\b(oat|almond|soy|soya|rice|cashew|hemp|pea|macadamia|hazelnut|plant|vegan)[ -]?(milk|drink|beverage)\b/, ['milk']],
  [/\bcoconut (milk|cream)\b|\bcreamed coconut\b/, ['coconut-milk']],
  [/\b(lemon|lime) juice\b/, ['citrus']],
  [/\b(tomato|vegetable|veggie|carrot|celery|beet|beetroot|pickle|clam) juice\b|\bv8\b/, NONE],
  [/\bjuice\b|\bcoconut water\b/, ['juice']],
  [/\b(cold brew|espresso|coffee)( beans| grounds| pods)?\b|\bground coffee\b|\binstant coffee\b/, ['coffee']],
  [/\b(coffee )?creamer\b/, NONE],
  [/\b(white|red|cooking|rice) wine\b|\b(dry sherry|marsala|rosé|rose wine|wine)\b/, ['wine']],
  [/\b(prosecco|champagne|cava|sparkling wine|beer|lager|ale|cider|kombucha|soda|cola|coke|lemonade|iced tea|tea|water|smoothies?|energy drinks?|sports drinks?)\b/, NONE],

  // --- Dairy and eggs.
  [/\bbuttermilk\b/, ['buttermilk']],
  [/\b(evaporated|condensed|powdered|dried) milk\b/, NONE],
  [/\bmilk\b/, ['milk']],
  [/\b(kefir|drinking yogh?urt|yogh?urt drinks?|lassi|yakult|ayran)\b/, ['kefir']],
  [
    /\b(strawberry|vanilla|raspberry|peach|cherry|blueberry|honey|lemon|mango|fruit|fruity|chocolate|coconut|caramel|key lime|banana|berry|mixed berry|flavou?red|kids'?|squeezable|tropical|apricot|toffee|coffee) (greek |icelandic )?(yogh?urts?|skyr)\b/,
    ['yogurt-sweet'],
  ],
  [/\b(yogh?urts?|skyr|labneh|quark|fromage frais)\b/, ['yogurt', 'yogurt-sweet']],
  [/\b(sour cream|soured cream)\b/, ['sour-cream']],
  [/\b(creme fraiche|crème fraîche|crema)\b/, ['cream', 'sour-cream']],
  [/\b(cream cheese|neufchatel|philadelphia)\b/, ['cream-cheese']],
  [/\bmascarpone\b/, ['cream', 'whipped-cream']],
  [/\b(half and half|half-and-half|single cream|light cream|cooking cream|oat cream|soy cream)\b/, ['cream']],
  [/\b(heavy|whipping|double|thickened|heavy whipping)? ?cream\b/, ['cream', 'whipping-cream']],
  [/\b(salted |unsalted |garlic |vegan |plant )?butter\b|\b(ghee|margarine|baking spread|butter spread)\b/, ['butter']],
  [/\b(parmesan|parmigiano( reggiano)?|pecorino( romano)?|grana padano|romano|asiago)( cheese)?\b/, ['cheese-grate', 'cheese-board']],
  [/\b(feta|cotija|queso fresco)( cheese)?\b/, ['cheese-crumble']],
  [/\b(goat'?s? cheese|chevre|chèvre|blue cheese|gorgonzola|stilton|roquefort|danish blue)\b/, ['cheese-crumble', 'cheese-board']],
  [/\b(burrata|bocconcini|buffalo mozzarella|fresh mozzarella)\b/, ['mozzarella']],
  [/\bmozzarella( cheese)?\b/, ['mozzarella', 'cheese-melt']],
  [/\b(ricotta|cottage cheese|cottage|curd cheese)\b/, ['cheese-soft']],
  [/\bhalloumi( cheese)?\b/, ['halloumi']],
  [/\bpaneer\b/, ['paneer']],
  [/\b(brie|camembert|manchego|comte|comté|jarlsberg|wensleydale|red leicester|double gloucester|emmental|emmentaler|gruyere|gruyère|swiss|gouda|edam|cheddar|havarti|fontina|provolone|muenster|colby|monterey jack|pepper ?jack|raclette|taleggio)( cheese)?\b/, MELTING],
  [/\b(shredded|grated|sliced|american|mexican|pizza|string|vegan|melting|mild|mature|sharp|block of|block) cheeses?\b|\bcheese (slices|singles|blend)\b|\bcheese strings?\b/, ['cheese-melt']],
  [/\b(cheese spread|spreadable cheese|cheese sauce|nacho cheese|laughing cow|babybel|cheese puffs|cheese straws)\b/, NONE],
  [/\bcheeses?\b/, MELTING],
  [/\b(egg noodles?)\b/, ['noodles']],
  [/\b(egg|spring|sausage|cinnamon|swiss|sushi|cabbage) rolls?\b|\begg salad\b|\begg custard\b/, NONE],
  [/\beggs?\b|\begg whites\b|\bliquid egg\b/, ['egg']],

  // --- Bread and baked goods.
  [/\b(garlic|banana|zucchini|courgette|corn|pumpkin|monkey|ginger|cheese) bread\b|\bcornbread\b|\bbread (pudding|mix|sauce)\b/, NONE],
  [/\bbread ?crumbs\b|\bpanko\b/, ['breadcrumbs']],
  [/\b(pita|pitta|naan|lavash|chapatis?|rotis?|parathas?|flatbreads?|flat breads?|pita pockets)( bread)?\b/, ['flatbread']],
  [/\btortilla chips\b|\bnacho chips\b|\btostitos\b|\bdoritos\b/, ['tortilla-chips']],
  [/\b(corn|maize) tortillas?\b|\btaco shells?\b|\btostadas?\b/, ['corn-tortilla']],
  [/\b(flour |soft |whole ?wheat |wholemeal |spinach |low carb |gluten[- ]free )?(tortillas?|wraps?|burrito wraps?|tortilla wraps?)\b/, ['tortilla']],
  [/\bhot ?dog (buns?|rolls?)\b/, ['hotdog-bun']],
  [/\b(sub|hoagie|baguette|panini|ciabatta) rolls?\b/, ['bun', 'crusty-bread']],
  [/\b(hamburger|burger|brioche|slider|kaiser|bread|dinner|soft|potato|sesame) (buns?|rolls?)\b|\b(buns|rolls|bread roll|bun)\b/, ['bun']],
  [/\bbagels?\b/, ['bagel']],
  [/\bcroissants?\b/, ['croissant']],
  [/\bpizza (dough|bases?|crusts?)\b/, ['pizza-dough']],
  [/\b(waffles?|pancakes|crepes|crêpes)\b/, ['waffles']],
  [/\b(sourdough|baguettes?|ciabatta|focaccia|boule|bloomer|batard)( bread| loaf| loaves)?\b|\b(french|italian|crusty|rustic|artisan|cob|country) (bread|loaf)\b/, ['bread', 'crusty-bread']],
  [/\b(bread|loaf|toast|brioche|challah|rye|multigrain|wholemeal|white sliced|sandwich bread)\b/, ['bread']],

  // --- Pasta, noodles, rice and grains.
  [/\b(rice noodles?|rice vermicelli|vermicelli|rice sticks|pad thai noodles|glass noodles|cellophane noodles|pho noodles)\b/, ['rice-noodles', 'noodles']],
  [/\b(ramen|instant noodles|cup noodles?|pot noodles?|maggi|top ramen)( noodles)?\b/, ['ramen', 'noodles']],
  [/\b(noodles?|udon|soba|lo mein|chow mein|hokkien|yakisoba)\b/, ['noodles']],
  [/\b(ravioli|tortellini|tortelloni|agnolotti|cappelletti|mezzelune)\b/, ['filled-pasta']],
  [/\bgnocchi\b/, ['gnocchi']],
  [/\b(pasta|spaghetti|spaghettini|linguine|fettuccine|fettuccini|tagliatelle|pappardelle|penne|rigatoni|fusilli|farfalle|macaroni|orecchiette|conchiglie|rotini|ziti|bucatini|angel hair|capellini|orzo|egg pasta|campanelle|cavatappi|gemelli|radiatori)\b/, ['pasta']],
  [/\b(fried rice|rice pudding|rice paper|rice krispies|rice crispies|rice cereal|puffed rice)\b/, NONE],
  [/\b(microwave|instant|minute|precooked|pre-cooked|ready|cooked) rice\b|\brice pouch\b/, ['cooked-rice']],
  [/\bcauliflower rice\b/, ['cauliflower', 'veg-stirfry']],
  [/\b(basmati|jasmine|brown|long[- ]grain|wild|black|red|parboiled|easy[- ]cook) rice\b|\b(basmati|jasmine|long grain|wild rice)\b/, ['rice']],
  [/\b(rice|arborio|carnaroli|vialone nano|risotto rice|sushi rice|pudding rice|short[- ]grain rice|calrose)\b/, ['rice', 'risotto-rice']],
  [/\b(quinoa|couscous|bulgur|bulghur|farro|pearl barley|barley|freekeh|millet|spelt grains)\b/, ['grain']],
  [/\b(granola|muesli)\b/, ['granola']],
  [/\b(oats|oatmeal|porridge oats|rolled oats|steel[- ]cut oats|porridge)\b/, ['oats']],
  [/\b(flour|all[- ]purpose|self[- ]raising flour|plain flour)\b/, ['flour']],
  [/\b(potato chips|crisps|chips|fries|french fries|wedges|hash browns|tater tots|onion rings|pretzels|popcorn|pork rinds|cracklings|jerky|granola bars?|protein bars?|cereal bars?|bars|snacks|trail mix|cereal|cornflakes)\b/, NONE],

  // --- Poultry.
  [/\b(rotisserie|roast|roasted|grilled|cooked|shredded|pulled|smoked|leftover) (chicken|turkey)( breast| meat| strips| pieces)?\b/, ['cooked-chicken']],
  [/\b(chicken|turkey) (nuggets|kievs?|dippers|popcorn|goujons|liver|livers|hearts|giblets|pie|salad|curry|soup|gravy)\b|\bpopcorn chicken\b/, NONE],
  [/\b(veggie|vegan|vegetable|plant[- ]based|bean|black bean|quinoa|halloumi|mushroom|falafel|beyond|impossible) (burgers?|patties)\b|\bveggie burgers?\b/, ['veggie-burger']],
  [/\b(chicken|turkey|beef|lamb|pork) (burgers?|patties)\b/, ['burger-patty']],
  [/\b(chicken|turkey|pork|beef|lamb|veggie|vegan|plant[- ]based|meat|soy|quorn) (mince|ground)\b|\b(ground|minced) (chicken|turkey|pork|beef|lamb|veal|bison|venison|meat)\b|\bmince\b|\bhamburger meat\b|\bminced beef\b|\bveggie crumbles\b/, ['ground-meat']],
  [/\bwhole (roasting )?chickens?\b|\bspatchcock(ed)? chicken\b|\broasting chicken\b/, ['whole-chicken']],
  [/\bchicken (wings?|wingettes|flats)\b|\bwings\b/, ['chicken-wings']],
  [/\bchicken (drumsticks?|legs?|leg quarters|quarters|thighs bone[- ]in)\b|\bdrumsticks\b|\bbone[- ]in chicken( thighs)?\b/, ['chicken-bone-in']],
  [/\b(turkey|chicken) bacon\b/, ['bacon']],
  [/\b(turkey|chicken) (sausages?|hot dogs|franks)\b/, ['sausage']],
  [/\b(deli|sliced|smoked|lunch|lunchmeat) (turkey|chicken)\b|\bturkey slices\b|\bchicken slices\b/, ['deli-meat']],
  [/\b(chicken|turkey)( breasts?| thighs?| tenders?| tenderloins?| fillets?| strips| cutlets?| pieces| steaks?| escalopes?| breast fillets| thigh fillets| meat| diced)?\b|\bquorn( pieces)?\b|\bvegan chicken\b/, ['chicken']],

  // --- Meat.
  [/\b(beef|turkey|pork) jerky\b|\bbiltong\b/, NONE],
  [/\b(beef|bone|chicken|vegetable|veggie|fish|lamb|ham) (broth|stock|bouillon|stock cubes?)\b|\b(broth|stock|bouillon|stock cubes?)\b/, ['stock']],
  [/\bcorned beef\b|\bpulled (pork|beef)\b|\bpot roast\b|\bleftover (beef|pork|lamb|roast|meat|steak|brisket|ham)\b/, ['cooked-meat']],
  [/\broast beef\b|\bpastrami\b|\bbologna\b|\bdeli meats?\b|\blunch ?meats?\b|\bcold cuts\b/, ['deli-meat', 'cooked-meat']],
  [/\b(prosciutto|parma ham|serrano( ham)?|jamon|jamón|speck|bresaola|coppa)\b/, ['cured-meat', 'deli-meat']],
  [/\b(salami|pepperoni|soppressata|mortadella|nduja|'nduja|summer sausage)\b/, ['cured-meat', 'deli-meat']],
  [/\bchorizo\b/, ['chorizo', 'sausage', 'cured-meat']],
  [/\b(pancetta|lardons|guanciale|bacon|streaky|back bacon|bacon bits)\b/, ['bacon']],
  [/\b(hot ?dogs?|frankfurters?|wieners?|franks)\b/, ['hot-dogs']],
  [/\b(sausages?|bratwursts?|brats|kielbasa|andouille|bangers|links|merguez|chipolatas?|boerewors|cumberland)\b/, ['sausage']],
  [/\bcanadian bacon\b|\bgammon\b|\bham (steaks?|hock|slices)\b|\b(honey|smoked|sliced|baked|cooked|deli|black forest|virginia|honey roast|honey baked|leg) ham\b|\bham\b/, ['ham', 'deli-meat']],
  [/\bmeatballs?\b|\bkofta\b/, ['meatballs']],
  [/\b(burgers?|hamburgers?|patties|beef patties)\b/, ['burger-patty']],
  [/\b(short ribs|stewing (beef|steak|lamb)|stew meat|stewing meat|beef chunks|chuck( steak| roast)?|brisket|beef shin|oxtail|beef joint|roasting joint|pork (shoulder|belly|butt|joint)|lamb (shoulder|leg|shank|shanks|neck|joint)|leg of lamb|diced (beef|lamb|pork)|goat|mutton)\b/, ['stew-meat']],
  [/\b(pork|lamb|beef|venison)? ?ribs\b|\bspare ?ribs\b|\bbaby back\b/, ['ribs']],
  [/\blamb (chops?|cutlets?|rack|loin chops)\b|\brack of lamb\b/, ['lamb-chops']],
  [/\bpork (chops?|loin|tenderloin|medallions|steaks?|fillets?|escalopes?|cutlets?)\b|\bpork\b/, ['pork-chops']],
  [/\blamb\b/, ['stew-meat']],
  [/\bduck( breasts?| legs?)?\b/, ['duck']],

  // --- Fish and seafood.
  [/\b(smoked|hot[- ]smoked|cold[- ]smoked) (salmon|trout|mackerel)\b|\blox\b|\bgravlax\b/, ['smoked-salmon']],
  [/\b(canned|tinned|tin of|can of|chunk light|albacore) (tuna|salmon)\b|\btuna (chunks|in (brine|oil|water|spring water|olive oil))\b|\bsalmon in (brine|water)\b/, ['canned-fish']],
  [/\b(sardines|pilchards|kippers?|herrings?|mackerel)\b/, ['sardines']],
  [/\banchov(y|ies)\b/, ['anchovies']],
  [/\btuna (steaks?|fillets?|loins?)\b|\bahi\b|\bfresh tuna\b|\bswordfish\b/, ['fish']],
  [/\btuna\b/, ['canned-fish']],
  [/\b(salmon|trout|arctic char|steelhead)( fillets?| steaks?| sides?| portions)?\b/, ['salmon', 'fish']],
  [/\b(cod|haddock|pollock|pollack|tilapia|halibut|sea bass|seabass|bream|snapper|hake|sole|plaice|catfish|basa|mahi[- ]?mahi|monkfish|barramundi|white fish|whitefish|coley|grouper|branzino|fish fillets?|fish)\b/, ['fish', 'white-fish']],
  [/\b(shrimps?|prawns?|king prawns|tiger prawns|scallops?|langoustines?|crawfish|crayfish)\b/, ['shrimp']],
  [/\b(mussels|clams|cockles|vongole)\b/, ['mussels']],
  [/\b(crab( meat)?|crab sticks|imitation crab|surimi|lobster|squid|calamari|octopus|seafood mix|mixed seafood|seafood)\b/, ['seafood']],
  [/\b(oysters|caviar|roe)\b/, NONE],

  // --- Beef last, so "tuna steak" and "salmon steak" stay fish.
  [/\b(steaks?|sirloin|ribeye|rib-eye|rib eye|flank|skirt|strip loin|striploin|t-bone|porterhouse|filet mignon|fillet steak|minute steak|beef strips|stir[- ]fry beef|flat iron|tri-tip|hanger|bavette|rump)\b/, ['steak']],
  [/\bbeef\b|\bveal\b|\bvenison\b|\bbison\b/, ['stew-meat']],

  // --- Plant protein, beans and lentils.
  [/\bsilken tofu\b/, NONE],
  [/\btofu( puffs)?\b|\bbean ?curd\b/, ['tofu']],
  [/\b(tempeh|seitan)\b/, ['tempeh']],
  [/\bfalafels?\b/, ['falafel']],
  [/\bbaked beans\b|\bbeans in (tomato )?sauce\b/, ['baked-beans']],
  [/\brefried beans\b/, ['refried-beans']],
  [/\b(green|string|french|runner|snap) beans\b|\bharicots? verts\b/, ['green-beans', 'veg-stirfry', 'veg-roast', 'veg-soup', 'veg-pasta', 'veg-curry']],
  [/\b(broad|fava) beans\b/, ['veg-soup', 'veg-pasta', 'veg-filling']],
  [/\b(coffee|jelly|vanilla|cocoa|cacao) beans?\b/, NONE],
  [/\bdried (beans|chickpeas|lentils)\b/, NONE],
  [/\b(chickpeas|chick peas|garbanzos?( beans)?)\b/, ['chickpeas']],
  [/\b(lentils?|split peas|dal|dhal)\b/, ['lentils']],
  [/\bbean sprouts\b|\bbeansprouts\b|\bmung bean sprouts\b/, ['bean-sprouts', 'veg-stirfry']],
  [/\b(black|kidney|pinto|cannellini|white|navy|butter|lima|borlotti|mixed|black[- ]eyed|haricot|great northern|adzuki|aduki|mung) (beans|peas)\b|\bbeans\b/, ['beans']],
  [/\bedamame\b/, ['edamame', 'veg-stirfry', 'veg-raw']],

  // --- Prepared dishes: already a meal.
  [
    /\b(soups?|stews?|chowder|bisque|gumbo|chili con carne|casseroles?|pizzas?|quiche|takeout|take-out|takeaway|sushi|dumplings?|gyoza|burritos?|enchiladas?|sandwich(es)?|tacos|nachos|risotto|paella|stir[- ]?fry|meatloaf|tikka masala|butter chicken|biryani|pad thai|kebabs?|samosas?|pasties|curry|curries|lasagn[ae]|leftovers?|ready meals?|frozen meals?|tv dinners?|dinner)\b|^chili$/,
    NONE,
  ],
  [/\b(fruit|tropical fruit) salad\b|\bfruit cocktail\b/, ['fruit-smoothie', 'fruit-fresh']],
  [/\b(mixed|green|garden|side|bagged|baby leaf|leaf|spring|house) salad\b|\bsalad (leaves|greens|mix|bag|kit|bowl)\b|\b(spring mix|mesclun|baby leaves|mixed leaves|mixed greens)\b|^salad$/, LEAVES],
  [/\b\w+ salad\b|\b(cole)?slaw\b/, NONE],

  // --- Leaves and greens.
  [/\b(lamb'?s lettuce|mache|corn salad)\b/, LEAVES],
  [/\b(romaine|iceberg|little gem)( lettuce| hearts?)?\b|\b(cos|butter|bibb|boston|butterhead|leaf|green leaf|red leaf|oak leaf) lettuce\b|\blettuces?\b/, ['salad-leaves', 'lettuce-cup', 'veg-sandwich', 'taco-topping']],
  [/\b(arugula|rocket|watercress|frisee|endive|radicchio|baby kale)\b/, LEAVES],
  [/\bspinach\b/, ['spinach', 'salad-leaves', 'veg-sandwich', 'cooking-greens', 'veg-filling', 'veg-pasta', 'veg-curry', 'veg-stirfry', 'veg-soup']],
  [/\b(kale|cavolo nero|lacinato|tuscan kale)\b/, ['kale', 'cooking-greens', 'veg-soup', 'veg-pasta', 'veg-stirfry', 'veg-curry']],
  [/\b(swiss chard|rainbow chard|chard|collard greens|collards|spring greens|mustard greens|turnip greens|beet greens|greens)\b/, ['cooking-greens', 'veg-soup', 'veg-pasta', 'veg-filling']],
  [/\b(bok choy|bok choi|pak choi|pak choy|choy sum|gai lan|chinese broccoli|tatsoi)\b/, ['cooking-greens', 'veg-stirfry', 'veg-soup']],

  // --- Vegetables.
  [/\b(red|green|white|savoy|napa|chinese|pointed|sweetheart|hispi)? ?cabbages?\b/, ['cabbage', 'veg-raw', 'veg-stirfry', 'veg-roast', 'veg-soup', 'taco-topping']],
  [/\b(alfalfa|broccoli|pea|radish|sunflower) (sprouts|shoots)\b|\bmicrogreens\b|\bpea shoots\b/, ['veg-sandwich', 'veg-raw']],
  [/\b(brussels? sprouts?|sprouts)\b/, ['brussels', 'veg-roast']],
  [/\b(broccoli|broccolini|tenderstem|broccoli florets|purple sprouting)\b/, ['broccoli', 'veg-stirfry', 'veg-roast', 'veg-soup', 'veg-pasta', 'veg-filling', 'veg-curry', 'veg-dip']],
  [/\bcauliflowers?( florets)?\b|\bromanesco\b/, ['cauliflower', 'veg-roast', 'veg-soup', 'veg-curry', 'veg-stirfry', 'veg-dip']],
  [/\b(baby |rainbow |heritage )?carrots?\b/, ['carrot', 'veg-raw', 'veg-dip', 'veg-stirfry', 'veg-roast', 'veg-soup', 'veg-curry']],
  [/\bcelery( sticks| hearts)?\b/, ['celery', 'veg-raw', 'veg-dip', 'veg-soup', 'veg-stirfry']],
  [/\bceleriac\b|\bcelery root\b/, ROOT],
  [/\b(english |mini |persian |baby |snacking )?cucumbers?\b|\bcukes\b/, ['cucumber', 'veg-raw', 'veg-sandwich', 'veg-dip']],
  [/\bsun[- ]?dried tomato(es)?\b/, ['veg-pasta', 'veg-filling', 'veg-raw']],
  [/\b(cherry|grape|plum|baby plum|cocktail|sweet|mini) tomato(es)?\b|\btomatoes on the vine\b/, ['tomato', 'veg-raw', 'veg-sandwich', 'veg-dip', 'taco-topping', 'veg-filling', 'veg-pasta', 'veg-roast', 'veg-soup']],
  [/\b(chopped|diced|crushed|canned|tinned|plum|peeled|whole peeled|stewed|san marzano|fire[- ]roasted) tomato(es)?\b|\bpassata\b|\b(can|tin) of tomato(es)?\b/, ['tinned-tomato']],
  [/\btomato(es)?\b|\bbeefsteak\b|\broma\b|\bheirloom tomato(es)?\b/, ['tomato', 'veg-raw', 'veg-sandwich', 'taco-topping', 'veg-filling', 'veg-pasta', 'veg-roast', 'veg-soup', 'veg-curry']],
  [/\broasted (red )?peppers\b|\bpiquillo\b|\bpimientos?\b/, ['veg-sandwich', 'veg-pasta', 'veg-filling']],
  [/\b(jalape(n|ñ)os?|chil(l)?ies|chil(l)?i peppers?|chiles?|habaneros?|serranos?|scotch bonnets?|bird'?s[- ]eye|thai chil(l)?is?|red chil(l)?is?|green chil(l)?is?|chilli|fresno|poblanos?)\b/, ['chili', 'taco-topping']],
  [/\b(bell|sweet|red|green|yellow|orange|mini|romano|bell) peppers?\b|\bcapsicums?\b|\bpeppers?\b/, ['bell-pepper', 'veg-raw', 'veg-sandwich', 'veg-dip', 'taco-topping', 'veg-stirfry', 'veg-filling', 'veg-pasta', 'veg-roast', 'veg-soup', 'veg-curry']],
  [/\b(spring onions?|green onions?|scallions?|salad onions?)\b/, ['spring-onion', 'onion-raw', 'veg-stirfry', 'veg-filling', 'taco-topping', 'veg-raw']],
  [/\b(red|purple|spanish) onions?\b/, ['onion', 'onion-raw', 'veg-sandwich', 'taco-topping', 'veg-roast', 'veg-soup', 'veg-stirfry', 'veg-filling', 'veg-pasta', 'veg-curry']],
  [/\bshallots?\b/, ['onion', 'onion-raw', 'veg-soup', 'veg-pasta', 'veg-filling', 'veg-curry', 'veg-roast']],
  [/\b(yellow|white|brown|sweet|vidalia|cooking|pearl|baby)? ?onions?\b/, ['onion', 'veg-roast', 'veg-soup', 'veg-stirfry', 'veg-filling', 'veg-pasta', 'veg-curry']],
  [/\bleeks?\b/, ['leek', 'veg-soup', 'veg-roast', 'veg-filling', 'veg-pasta']],
  [/\b(garlic|garlic cloves|wild garlic|garlic scapes|black garlic)\b/, ['garlic']],
  [/\b(ginger|ginger root|galangal|lemongrass|lemon grass)\b/, ['ginger']],
  [/\b(sweet potato(es)?|yams?|kumara)\b/, ['sweet-potato', 'veg-roast', 'veg-soup', 'veg-curry']],
  [/\b(potato(es)?|russets?|yukon golds?|maris pipers?|king edwards?|new potatoes|baby potatoes|fingerlings?|spuds)\b/, ['potato', 'veg-roast', 'veg-soup', 'veg-curry']],
  [/\b(summer|yellow) squash\b|\b(zucchinis?|zucchini|courgettes?)\b/, ['zucchini', 'veg-stirfry', 'veg-roast', 'veg-soup', 'veg-filling', 'veg-pasta', 'veg-curry']],
  [/\bspaghetti squash\b/, ['squash', 'veg-roast']],
  [/\b(butternut|acorn|kabocha|delicata|winter|hubbard)( squash)?\b|\bsquash\b|\bpumpkins?\b/, ['squash', 'veg-roast', 'veg-soup', 'veg-curry', 'veg-pasta']],
  [/\b(eggplants?|aubergines?|brinjal)\b/, ['eggplant', 'veg-roast', 'veg-stirfry', 'veg-curry', 'veg-pasta']],
  [/\b(button|cremini|crimini|chestnut|portobello|portabella|shiitake|oyster|enoki|wild|baby bella|king oyster|porcini)? ?mushrooms?\b/, ['mushroom', 'veg-stirfry', 'veg-filling', 'veg-pasta', 'veg-roast', 'veg-soup', 'veg-curry']],
  [/\bcorn on the cob\b|\bcorn cobs?\b|\bears of corn\b/, ['corn', 'veg-roast', 'veg-soup']],
  [/\bbaby corn\b/, ['veg-stirfry']],
  [/\bcreamed corn\b|\bcream[- ]style corn\b/, ['corn', 'sweetcorn', 'veg-soup']],
  [/\b(sweetcorn|sweet corn|corn kernels|canned corn|frozen corn|corn)\b/, ['corn', 'sweetcorn', 'veg-stirfry', 'veg-soup', 'taco-topping', 'veg-filling', 'veg-raw']],
  [/\b(sugar snap|snap|snow|mange ?tout|mangetout) peas\b|\bmangetout\b|\bsugar snaps\b/, ['veg-stirfry', 'veg-raw', 'veg-dip']],
  [/\b(garden |petit |petits )?(peas|pois)\b/, ['peas', 'veg-stirfry', 'veg-soup', 'veg-pasta', 'veg-filling', 'veg-curry']],
  [/\basparagus( spears| tips)?\b/, ['asparagus', 'veg-roast', 'veg-stirfry', 'veg-pasta', 'veg-filling']],
  [/\b(beetroots?|beets?)\b/, ['beets', 'veg-roast', 'veg-soup']],
  [/\bradish(es)?\b|\bdaikon\b/, ['veg-raw', 'veg-dip', 'taco-topping']],
  [/\bfennel( bulbs?)?\b/, ['veg-raw', 'veg-roast', 'veg-soup']],
  [/\b(parsnips?|turnips?|rutabagas?|swedes?|kohlrabi)\b/, ROOT],
  [/\bokra\b/, ['veg-curry', 'veg-stirfry', 'veg-soup']],
  [/\bartichokes?( hearts)?\b/, ['veg-pasta', 'veg-filling']],
  [/\bwater chestnuts\b|\bbamboo shoots\b/, ['veg-stirfry']],
  [/\b(stir[- ]fry|wok) (veg|vegetables|mix)\b/, ['veg-stirfry']],
  [/\b(root) (veg|vegetables)\b/, ROOT],
  [/\b(mixed )?(vegetables|veg|veggies)\b|\bmixed veg\b/, ['veg-stirfry', 'veg-soup', 'veg-filling', 'veg-pasta', 'veg-curry']],
  [/\bavocados?\b/, ['avocado']],

  // --- Herbs and citrus.
  [/\b(thai |sweet |genovese )?basil( leaves)?\b/, ['herb', 'herb-soft', 'basil']],
  [/\b(flat[- ]leaf |curly |italian )?parsley\b/, ['herb', 'herb-soft', 'parsley']],
  [/\bcilantro\b|\b(fresh )?coriander( leaves)?\b/, ['herb', 'herb-soft', 'cilantro']],
  [/\bdill\b/, ['herb', 'herb-soft', 'dill']],
  [/\b(fresh |garden )?mint( leaves)?\b/, ['herb', 'herb-soft', 'mint']],
  [/\bchives\b/, ['herb', 'herb-soft', 'chives']],
  [/\b(tarragon|chervil|lemon balm|herbs|fresh herbs|mixed herbs)\b/, ['herb', 'herb-soft']],
  [/\b(thyme|rosemary|sage|oregano|marjoram|savory)\b/, ['herb', 'herb-woody']],
  [/\b(lemons?|limes?|key limes?|meyer lemons?)\b/, ['citrus']],

  // --- Fruit.
  [/\b(raisins|sultanas|currants|prunes|dried (fruit|apricots|figs|mango|cranberries|cherries|apples?|blueberries)|craisins)\b/, ['dried-fruit']],
  [/\b(medjool )?dates\b/, ['dried-fruit', 'fruit-smoothie']],
  [/\b(oranges?|clementines?|mandarins?|tangerines?|satsumas?|blood oranges?|navel oranges?|cuties)\b/, TROPICAL],
  [/\bgrapefruits?\b|\bpomelos?\b/, ['fruit-fresh']],
  [/\bplantains?\b/, NONE],
  [/\bbananas?\b/, ['banana', 'fruit-smoothie', 'fruit-fresh']],
  [/\b(green |red |granny smith |gala |fuji |honeycrisp |pink lady |braeburn |cooking )?apples?\b/, ['apple', 'fruit-fresh', 'fruit-bake', 'fruit-smoothie', 'cheese-fruit']],
  [/\bpears?\b/, ['fruit-fresh', 'fruit-bake', 'fruit-smoothie', 'cheese-fruit']],
  [/\b(cranberries|gooseberries|red currants|blackcurrants|sour cherries|rhubarb)\b/, ['fruit-bake']],
  [/\b(strawberr(y|ies)|raspberr(y|ies)|blueberr(y|ies)|blackberr(y|ies)|boysenberr(y|ies)|loganberr(y|ies)|mulberr(y|ies)|mixed berries|berries)\b/, BERRY],
  [/\bcherr(y|ies)\b/, STONE_FRUIT],
  [/\bgrapes?\b/, ['fruit-fresh', 'cheese-fruit', 'fruit-smoothie']],
  [/\b(peach(es)?|nectarines?|plums?|apricots?|greengages?|damsons?)\b/, STONE_FRUIT],
  [/\b(mangoes|mangos|mango)\b/, ['mango', 'fruit-fresh', 'fruit-smoothie']],
  [/\b(pineapples?|kiwis?|kiwi ?fruit|papayas?|passion ?fruits?|dragon ?fruits?|lychees?|guavas?|persimmons?|star ?fruit|cantaloupes?|honeydew( melon)?|watermelons?|melons?|galia)\b/, TROPICAL],
  [/\bpomegranates?( seeds)?\b/, ['fruit-fresh']],
  [/\bfigs?\b/, ['fruit-fresh', 'cheese-fruit', 'fruit-bake']],
  [/\b(fresh |frozen |mixed )?fruits?\b/, ['fruit-smoothie', 'fruit-fresh']],
  [/\bcoconuts?\b/, NONE],

  // --- Nuts and seeds.
  [/\b(peanuts|cashews?|cashew nuts)\b/, ['nuts', 'asian-nuts']],
  [/\b(almonds|walnuts|pecans|hazelnuts|pistachios|pine nuts|macadamias?|brazil nuts|mixed nuts|nuts)\b/, ['nuts']],
  [/\b(sunflower|pumpkin|chia|flax|linseeds?|sesame|hemp|poppy) seeds\b|\bpepitas\b|\bseeds\b/, ['seeds']],
];

/** Each rule as a quick yes/no test plus a global copy for finding where its last match ends. */
const COMPILED = RULES.map(([re, roles]) => ({ test: re, all: new RegExp(re.source, 'g'), roles }));

/** Roles lost when a food is frozen: it can be cooked, not eaten raw. */
const RAW_ONLY = new Set<Role>(['veg-raw', 'veg-sandwich', 'veg-dip', 'salad-leaves', 'lettuce-cup', 'taco-topping', 'fruit-fresh', 'cheese-fruit']);

function tidy(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\u2019`]/g, "'")
      // Package sizes and counts say nothing about the food.
      .replace(/\b\d+(\.\d+)?\s*(g|kg|ml|l|oz|lb|lbs|pack|pk|x)\b/g, ' ')
      .replace(/\bbeans in (tomato )?sauce\b/, 'baked beans')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** "Tuna in brine", "peaches in syrup": the packing liquid is not the food, but it means a tin. */
const PACKED_IN = /\s+in\s+(brine|oil|olive oil|sunflower oil|water|spring water|tomato sauce|sauce|syrup|light syrup|juice|own juice)$/;

/** The roles from the table for one name, without the cooked or frozen adjustments. */
function tableRoles(lower: string): readonly Role[] {
  // "Chicken breast with lemon" is chicken: what follows "with" is flavouring.
  const head = (lower.split(/\s+with\s+/)[0] ?? lower).replace(PACKED_IN, '');
  let best: readonly Role[] = NONE;
  let bestEnd = -1;
  for (const { test, all, roles } of COMPILED) {
    if (!test.test(head)) continue;
    all.lastIndex = 0;
    let end = -1;
    for (let m = all.exec(head); m; m = all.exec(head)) {
      end = Math.max(end, m.index + m[0].length);
      if (m[0].length === 0) all.lastIndex++;
    }
    if (end > bestEnd) {
      bestEnd = end;
      best = roles;
    }
  }
  // Fish in a tin is tinned fish, whatever kind it is.
  if (PACKED_IN.test(lower) && best.includes('salmon')) return ['canned-fish'];
  return best;
}

const DISH =
  /\b(butter chicken|soups?|stews?|curry|curries|chili|chilli|pie|lasagn[ae]|casserole|pizza|salad|sandwich|burrito|nuggets|tikka|masala|stir[- ]?fry|fried rice|risotto|paella|biryani|pad thai|takeout|takeaway|mac(aroni)? (and|&|n'?) cheese|bake|gratin|enchiladas?|tacos?|kebabs?|sushi|dumplings?)\b/;

/** Leftovers and cooked food that can go into a new dish. */
function cookedRoles(lower: string): Role[] | null {
  if (DISH.test(lower)) return [];
  if (/\brice\b/.test(lower) && !/\brice noodles?\b/.test(lower)) return ['cooked-rice'];
  if (/\b(pasta|spaghetti|penne|macaroni|fusilli|rigatoni|linguine|noodles?)\b/.test(lower)) return ['cooked-pasta'];
  if (/\b(chicken|turkey)\b/.test(lower)) return ['cooked-chicken'];
  if (/\b(potato(es)?|mash|mashed|roasties)\b/.test(lower)) return ['cooked-potato'];
  if (/\b(beef|pork|lamb|steak|brisket|roast|meat|ham)\b/.test(lower)) return ['cooked-meat'];
  return null;
}

/** Roles by name and category: a fridge changes little between one screen and the next. */
const cache = new Map<string, Role[]>();
const CACHE_LIMIT = 2000;

/** Everything a food can do in the built-in recipes. Unknown food gets no roles. */
export function rolesFor(item: Pick<PantryItem, 'name' | 'category'>): Role[] {
  const key = `${item.category}|${item.name}`;
  const hit = cache.get(key);
  if (hit) return [...hit];
  const roles = computeRoles(item);
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, roles);
  return [...roles];
}

function computeRoles(item: Pick<PantryItem, 'name' | 'category'>): Role[] {
  const lower = tidy(item.name);
  if (!lower) return [];
  if (item.category === 'leftovers' || /\bleftovers?\b/.test(lower)) {
    // A leftover is a cooked dish: it is never chopped into a salad or roasted again.
    return cookedRoles(lower) ?? [];
  }
  // A frozen pizza or a ready meal is dinner already.
  if (/\bfrozen\b/.test(lower) && /\b(pizzas?|meals?|dinners?|lasagn[ae]|burritos?|pies?|curry|entrees?)\b/.test(lower)) return [];
  // Cooked chicken, rice and potatoes go where leftovers go. Cooked ham and roast beef are
  // sliced meats, and cooked shrimp or beetroot are used as they are.
  if (/\b(cooked|rotisserie|grilled|roasted|roast|shredded|pulled|precooked|mashed)\b/.test(lower) && !/\b(ham|roast beef)\b/.test(lower)) {
    const cooked = cookedRoles(lower);
    if (cooked && cooked.length > 0) return cooked;
  }
  const roles = [...tableRoles(lower)];
  if (/\bfrozen\b/.test(lower)) return roles.filter((r) => !RAW_ONLY.has(r));
  return roles;
}

/** True when the food has any of the roles. */
export function hasRole(item: Pick<PantryItem, 'name' | 'category'>, wanted: readonly Role[]): boolean {
  const roles = rolesFor(item);
  return wanted.some((r) => roles.includes(r));
}
