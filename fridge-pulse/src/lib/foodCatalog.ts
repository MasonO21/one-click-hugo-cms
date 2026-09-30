import type { Category, StorageLocation } from './types';

export interface CatalogFood {
  name: string;
  category: Category;
  /** Everyday groceries rank first among equally good matches. */
  staple: boolean;
  /** Where it is kept regardless of the location picked for the rest of the list (ice cream lives in the freezer). */
  keptIn?: StorageLocation;
}

/**
 * Common groceries offered as suggestions while someone types an item name.
 * Regional names are listed separately (Zucchini and Courgette) so people find the word they use.
 * `__tests__/suggest.test.ts` checks the list for duplicates, categories and sensible estimates.
 */
const GROUPS: [Category, string][] = [
  [
    'produce',
    'Apples|Green apples|Apricots|Avocados|Bananas|Blackberries|Blueberries|Cantaloupe|Cherries|Clementines|Coconut|Cranberries|Dates|Figs|Grapefruit|Grapes|Honeydew melon|Kiwi|Lemons|Limes|Mandarins|Mangoes|Melon|Nectarines|Oranges|Papaya|Passion fruit|Peaches|Pears|Pineapple|Plums|Pomegranate|Raspberries|Rhubarb|Strawberries|Tangerines|Watermelon|' +
      'Artichokes|Arugula|Rocket|Asparagus|Aubergine|Eggplant|Baby carrots|Baby spinach|Basil|Bean sprouts|Beets|Beetroot|Bell peppers|Red peppers|Bok choy|Broccoli|Brussels sprouts|Butternut squash|Cabbage|Red cabbage|Carrots|Cauliflower|Celery|Cherry tomatoes|Chili peppers|Chives|Cilantro|Coriander|Corn on the cob|Sweetcorn|Courgette|Zucchini|Cucumber|Dill|Edamame|Fennel|Garlic|Ginger|Green beans|Green onions|Spring onions|Scallions|Iceberg lettuce|Jalapeños|Kale|Leeks|Lettuce|Romaine lettuce|Mint|Mixed salad|Salad greens|Mushrooms|Okra|Onions|Red onions|Parsley|Parsnips|Potatoes|Pumpkin|Radishes|Rosemary|Shallots|Snap peas|Snow peas|Spinach|Sweet potatoes|Thyme|Tomatoes|Turnips|Watercress|' +
      'Frozen peas|Frozen corn|Frozen spinach|Frozen berries|Frozen mixed vegetables',
  ],
  [
    'dairy',
    'Milk|Whole milk|Skim milk|Semi-skimmed milk|2% milk|Lactose-free milk|Oat milk|Almond milk|Soy milk|Buttermilk|Heavy cream|Whipping cream|Double cream|Single cream|Half and half|Sour cream|Crème fraîche|Yogurt|Greek yogurt|Plain yogurt|Kefir|Butter|Unsalted butter|Margarine|Eggs|Free-range eggs|' +
      'Cheese|Cheddar cheese|Mozzarella|Parmesan|Feta|Goat cheese|Brie|Camembert|Swiss cheese|Gouda|Halloumi|Cottage cheese|Cream cheese|Ricotta|Mascarpone|Blue cheese|Provolone|Monterey Jack|Pepper jack|String cheese|Shredded cheese|Sliced cheese|American cheese|' +
      'Ice cream|Frozen yogurt|Custard|Pudding',
  ],
  [
    'meat',
    'Chicken|Chicken breast|Chicken thighs|Chicken wings|Chicken drumsticks|Whole chicken|Rotisserie chicken|Ground beef|Beef mince|Ground turkey|Ground pork|Ground chicken|Steak|Stewing beef|Beef brisket|Roast beef|Pork chops|Pork tenderloin|Pork loin|Pork shoulder|Pulled pork|Pork ribs|Lamb chops|Lamb|Bacon|Turkey bacon|Sausages|Italian sausage|Breakfast sausage|Chorizo|Bratwurst|Hot dogs|Ham|Sliced ham|Deli turkey|Turkey breast|Salami|Pepperoni|Prosciutto|Meatballs|Burger patties|Duck breast',
  ],
  [
    'seafood',
    'Salmon|Salmon fillets|Smoked salmon|Tuna steak|Cod|Tilapia|Haddock|Halibut|Trout|Sea bass|Shrimp|Prawns|Scallops|Crab|Lobster|Mussels|Clams|Oysters|Squid|Fish sticks|Fish fingers',
  ],
  [
    'bakery',
    'Bread|White bread|Whole wheat bread|Sourdough bread|Rye bread|Baguette|Bagels|English muffins|Croissants|Hamburger buns|Hot dog buns|Dinner rolls|Pita bread|Naan|Flour tortillas|Corn tortillas|Wraps|Muffins|Donuts|Cake|Brownies|Crumpets|Brioche|Pizza dough|Frozen waffles',
  ],
  [
    'leftovers',
    'Leftovers|Leftover pizza|Leftover pasta|Leftover rice|Leftover curry|Soup|Chicken soup|Stew|Lasagna|Casserole|Takeout|Pizza|Frozen pizza',
  ],
  [
    'drinks',
    'Orange juice|Apple juice|Cranberry juice|Lemonade|Iced tea|Coffee|Ground coffee|Coffee beans|Cold brew coffee|Tea|Green tea|Sparkling water|Soda|Kombucha|Coconut water|Smoothie|Beer|White wine|Red wine|Rosé wine|Prosecco',
  ],
  [
    'condiments',
    'Ketchup|Mustard|Dijon mustard|Mayonnaise|Soy sauce|Hot sauce|Sriracha|BBQ sauce|Salad dressing|Ranch dressing|Olive oil|Vegetable oil|Balsamic vinegar|Honey|Maple syrup|Jam|Peanut butter|Almond butter|Chocolate spread|Pesto|Salsa|Hummus|Guacamole|Tzatziki|Relish|Pickles|Olives|Tahini|Pasta sauce|Worcestershire sauce|Fish sauce|Teriyaki sauce|Salt|Black pepper|Sugar|Brown sugar',
  ],
  [
    'grains',
    'Rice|Basmati rice|Jasmine rice|Brown rice|Pasta|Spaghetti|Penne|Macaroni|Egg noodles|Ramen noodles|Rice noodles|Quinoa|Couscous|Rolled oats|Oatmeal|Cereal|Granola|Flour|Breadcrumbs|Lentils|Dried beans',
  ],
  [
    'canned',
    'Canned tomatoes|Chopped tomatoes|Tomato paste|Canned tuna|Canned beans|Black beans|Kidney beans|Chickpeas|Baked beans|Canned corn|Coconut milk|Chicken broth|Vegetable stock|Beef broth|Canned soup|Sardines',
  ],
  [
    'snacks',
    'Crackers|Potato chips|Crisps|Tortilla chips|Pretzels|Popcorn|Cookies|Granola bars|Protein bars|Dark chocolate|Milk chocolate|Almonds|Cashews|Walnuts|Peanuts|Pistachios|Mixed nuts|Trail mix|Raisins|Rice cakes',
  ],
  ['other', 'Tofu|Tempeh|Veggie burgers'],
];

const STAPLES = new Set(
  (
    'Apples|Avocados|Bananas|Blueberries|Grapes|Lemons|Strawberries|Broccoli|Bell peppers|Carrots|Cucumber|Garlic|Lettuce|Mushrooms|Onions|Potatoes|Spinach|Tomatoes|' +
    'Milk|Whole milk|Oat milk|Yogurt|Greek yogurt|Butter|Eggs|Cheese|Cheddar cheese|Ice cream|Mozzarella|Cream cheese|Sour cream|Heavy cream|' +
    'Chicken|Chicken breast|Chicken thighs|Ground beef|Bacon|Sausages|Ham|Salmon|Shrimp|Bread|Flour tortillas|Leftovers|Orange juice|Coffee|Ketchup|Mayonnaise|Hummus|Rice|Pasta|Tofu'
  ).split('|'),
);

const ALWAYS_FROZEN = /\b(frozen|ice cream|fish sticks|fish fingers|veggie burgers)\b/i;

export const FOOD_CATALOG: CatalogFood[] = GROUPS.flatMap(([category, names]) =>
  names.split('|').map((name) => ({
    name,
    category,
    staple: STAPLES.has(name),
    ...(ALWAYS_FROZEN.test(name) ? { keptIn: 'freezer' as const } : {}),
  })),
);
