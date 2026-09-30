import type { Category } from '../src/lib/types';

/**
 * Every row is a food name as a person (or the AI) might write it, the category the app would
 * assign, and the glyph a shopper would expect. Tricky names are included on purpose: compound
 * foods, look-alike words, and names where a shorter word appears inside a longer food.
 */
export const HOT_PEPPER = '\u{1F336}\uFE0F';

export const FOOD_CASES: [string, Category, string][] = [
  // fruit
  ['Strawberries', 'produce', '🍓'], ['Blueberries', 'produce', '🫐'], ['Raspberries', 'produce', '🍓'], ['Blackberries', 'produce', '🫐'], ['Cranberries', 'produce', '🍓'], ['Bananas', 'produce', '🍌'],
  ['Apples', 'produce', '🍎'], ['Pineapple', 'produce', '🍍'], ['Oranges', 'produce', '🍊'], ['Clementines', 'produce', '🍊'],
  ['Lemons', 'produce', '🍋'], ['Limes', 'produce', '🍋'], ['Grapes', 'produce', '🍇'], ['Watermelon', 'produce', '🍉'],
  ['Cantaloupe', 'produce', '🍈'], ['Peaches', 'produce', '🍑'], ['Pears', 'produce', '🍐'], ['Cherries', 'produce', '🍒'],
  ['Mango', 'produce', '🥭'], ['Kiwi', 'produce', '🥝'], ['Avocados', 'produce', '🥑'], ['Coconut', 'produce', '🥥'],
  // vegetables
  ['Tomatoes', 'produce', '🍅'], ['Cherry tomatoes', 'produce', '🍅'], ['Carrots', 'produce', '🥕'], ['Broccoli', 'produce', '🥦'],
  ['Cucumber', 'produce', '🥒'], ['Zucchini', 'produce', '🥒'], ['Bell peppers', 'produce', '🫑'], ['Red pepper', 'produce', '🫑'],
  ['Jalapeno', 'produce', HOT_PEPPER], ['Chili peppers', 'produce', HOT_PEPPER], ['Onions', 'produce', '🧅'], ['Garlic', 'produce', '🧄'],
  ['Potatoes', 'produce', '🥔'], ['Sweet potato', 'produce', '🍠'], ['Mushrooms', 'produce', '🍄'], ['Sweetcorn', 'produce', '🌽'],
  ['Corn on the cob', 'produce', '🌽'], ['Baby spinach', 'produce', '🥬'], ['Romaine lettuce', 'produce', '🥬'], ['Kale', 'produce', '🥬'],
  ['Eggplant', 'produce', '🍆'], ['Aubergine', 'produce', '🍆'], ['Olives', 'canned', '🫒'],
  // dairy and eggs
  ['Whole milk', 'dairy', '🥛'], ['Oat milk', 'dairy', '🥛'], ['Greek yogurt', 'dairy', '🥛'], ['Sour cream', 'dairy', '🥛'],
  ['Buttermilk', 'dairy', '🥛'], ['Butter', 'dairy', '🧈'], ['Margarine', 'dairy', '🧈'], ['Cheddar cheese', 'dairy', '🧀'],
  ['Cream cheese', 'dairy', '🧀'], ['Mozzarella', 'dairy', '🧀'], ['Eggs', 'dairy', '🥚'], ['Free-range eggs', 'dairy', '🥚'],
  ['Ice cream', 'snacks', '🍨'], ['Cheesecake', 'bakery', '🍰'],
  // meat and fish
  ['Chicken thighs', 'meat', '🍗'], ['Turkey breast', 'meat', '🍗'], ['Bacon', 'meat', '🥓'], ['Ground beef', 'meat', '🥩'],
  ['Pork chops', 'meat', '🥩'], ['Steak', 'meat', '🥩'], ['Sausages', 'meat', '🌭'], ['Bratwurst', 'meat', '🌭'], ['Ham', 'meat', '🍖'], ['Salami', 'meat', '🍖'], ['Pork ribs', 'meat', '🍖'], ['Hot dogs', 'meat', '🌭'],
  ['Salmon fillets', 'seafood', '🐟'], ['Tuna', 'canned', '🐟'], ['Cod', 'seafood', '🐟'], ['Shrimp', 'seafood', '🦐'],
  ['Prawns', 'seafood', '🦐'], ['Crab', 'seafood', '🦀'], ['Lobster tail', 'seafood', '🦞'],
  // bakery, grains, pasta
  ['Sourdough bread', 'bakery', '🍞'], ['Bagels', 'bakery', '🥯'], ['Flour tortillas', 'bakery', '🫓'], ['Corn tortillas', 'bakery', '🫓'],
  ['Pita', 'bakery', '🫓'], ['Croissants', 'bakery', '🥐'], ['Pizza', 'leftovers', '🍕'], ['Spaghetti', 'grains', '🍝'],
  ['Egg noodles', 'grains', '🍜'], ['Ramen', 'grains', '🍜'], ['Macaroni', 'grains', '🍝'], ['Basmati rice', 'grains', '🍚'], ['Quinoa', 'grains', '🍚'],
  ['Cornflakes', 'grains', '🥣'], ['Rolled oats', 'grains', '🥣'], ['Granola', 'snacks', '🥣'],
  // prepared food, condiments, snacks, drinks
  ['Chicken soup', 'leftovers', '🍲'], ['Tomato soup', 'canned', '🍲'], ['Beef stew', 'leftovers', '🍲'], ['Chicken curry', 'leftovers', '🍲'],
  ['Leftover lasagna', 'leftovers', '🍝'], ['Leftover roast', 'leftovers', '🍖'], ['Takeout', 'leftovers', '🥡'],
  ['Peanut butter', 'condiments', '🥜'], ['Almond butter', 'condiments', '🥜'], ['Almonds', 'snacks', '🥜'], ['Honey', 'condiments', '🍯'],
  ['Black pepper', 'condiments', '🧂'], ['Dark chocolate', 'snacks', '🍫'], ['Orange juice', 'drinks', '🧃'], ['Apple juice', 'drinks', '🧃'],
  ['Coffee beans', 'drinks', '☕'], ['Green tea', 'drinks', '🍵'], ['Beer', 'drinks', '🍺'], ['Red wine', 'drinks', '🍷'],
  ['Popcorn', 'snacks', '🍿'], ['Crackers', 'snacks', '🥨'], ['Pretzels', 'snacks', '🥨'], ['Potato chips', 'snacks', '🥨'], ['Mixed snacks', 'snacks', '🥨'],
  // Added with typing suggestions: every one of these is offered by the suggestion list, and each was a
  // wrong or misleading glyph before (a lettuce for plums, a milk glass for milk chocolate, a fish for fish sauce).
  ['Plums', 'produce', '🧺'], ['Pomegranate', 'produce', '🧺'], ['Figs', 'produce', '🧺'], ['Ginger', 'produce', '🧺'], ['Asparagus', 'produce', '🧺'],
  ['Green beans', 'produce', '🧺'], ['Radishes', 'produce', '🧺'], ['Celery', 'produce', '🧺'], ['Sugar snap peas', 'produce', '🧺'],
  ['Cauliflower', 'produce', '🥦'], ['Parsnips', 'produce', '🥕'], ['Pumpkin', 'produce', '🎃'], ['Butternut squash', 'produce', '🎃'], ['Spaghetti squash', 'produce', '🎃'],
  ['Scallions', 'produce', '🧅'], ['Leeks', 'produce', '🧅'], ['Bok choy', 'produce', '🥬'], ['Brussels sprouts', 'produce', '🥬'],
  ['Basil', 'produce', '🌿'], ['Cilantro', 'produce', '🌿'], ['Mixed salad', 'produce', '🥗'], ['Pasta salad', 'leftovers', '🥗'], ['Raisins', 'snacks', '🍇'],
  ['Pepper jack', 'dairy', '🧀'], ['Monterey Jack', 'dairy', '🧀'], ['Camembert', 'dairy', '🧀'], ['Provolone', 'dairy', '🧀'], ['Mascarpone', 'dairy', '🧀'],
  ['Frozen yogurt', 'dairy', '🍨'], ['Custard', 'dairy', '🍮'], ['Chocolate milk', 'dairy', '🥛'], ['Milk chocolate', 'snacks', '🍫'], ['Chocolate chips', 'snacks', '🍫'],
  ['Coconut milk', 'canned', '🥥'], ['Coconut water', 'drinks', '🥥'], ['Almond milk', 'dairy', '🥛'],
  ['Turkey bacon', 'meat', '🥓'], ['Tuna steak', 'seafood', '🐟'], ['Burger patties', 'meat', '🥩'], ['Meatballs', 'meat', '🥩'],
  ['Oysters', 'seafood', '🦪'], ['Mussels', 'seafood', '🦪'], ['Squid', 'seafood', '🦑'], ['Crab cakes', 'seafood', '🦀'], ['Sushi', 'leftovers', '🍣'],
  ['English muffins', 'bakery', '🍞'], ['Muffins', 'bakery', '🧁'], ['Hot dog buns', 'bakery', '🍞'], ['Hamburger buns', 'bakery', '🍞'], ['Garlic bread', 'bakery', '🍞'],
  ['Breadcrumbs', 'grains', '🍞'], ['Frozen waffles', 'bakery', '🧇'], ['Apple pie', 'bakery', '🥧'], ['Rice cakes', 'snacks', '🍘'],
  ['Tortilla chips', 'snacks', '🥨'], ['Granola bars', 'snacks', '🥨'], ['Trail mix', 'snacks', '🥜'],
  ['Ketchup', 'condiments', '🍅'], ['Pasta sauce', 'condiments', '🍅'], ['Salsa', 'condiments', '🍅'], ['Hot sauce', 'condiments', HOT_PEPPER], ['Guacamole', 'condiments', '🥑'],
  ['Pesto', 'condiments', '🌿'], ['Maple syrup', 'condiments', '🍁'], ['Strawberry jam', 'condiments', '🍯'], ['Pickles', 'condiments', '🥒'],
  ['Salad dressing', 'condiments', '🧂'], ['Fish sauce', 'condiments', '🧂'], ['Oyster sauce', 'condiments', '🧂'], ['Red wine vinegar', 'condiments', '🧂'], ['Hummus', 'condiments', '🧂'],
  ['Prosecco', 'drinks', '🥂'], ['Iced tea', 'drinks', '🥤'],
];
