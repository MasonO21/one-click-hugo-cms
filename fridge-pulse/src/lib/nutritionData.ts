/**
 * Nutrition per 100 g for the catalog's foods (src/lib/foodCatalog.ts), with a typical portion.
 *
 * Generated from USDA FoodData Central, SR Legacy (public domain), as published in the TempoLife food
 * database (tempolife.app, CC-BY-4.0). Each line names the SR Legacy food it comes from. Portions are
 * common household measures. Columns: kcal, protein g, carbs g, fat g, fibre g, portion, portion g.
 *
 * Foods in UNMEASURED have no close SR Legacy entry (or vary too much to give one figure), so the app
 * shows no estimate for them rather than a wrong one.
 */
export type NutritionRow = [kcal: number, protein: number, carbs: number, fat: number, fiber: number, portion: string, grams: number];

export const NUTRITION: Record<string, NutritionRow> = {
  'Apples': [52, 0.3, 13.8, 0.2, 2.4, '1 medium', 182], // Apples, raw, with skin
  'Green apples': [58, 0.4, 13.6, 0.2, 2.8, '1 medium', 182], // Apples, raw, granny smith, with skin
  'Apricots': [48, 1.4, 11.1, 0.4, 2, '1 apricot', 35], // Apricots, raw
  'Avocados': [160, 2, 8.5, 14.7, 6.7, 'half an avocado', 100], // Avocados, raw
  'Bananas': [89, 1.1, 22.8, 0.3, 2.6, '1 medium', 118], // Bananas, raw
  'Blackberries': [43, 1.4, 9.6, 0.5, 5.3, '1 cup', 144], // Blackberries, raw
  'Blueberries': [57, 0.7, 14.5, 0.3, 2.4, '1 cup', 148], // Blueberries, raw
  'Cantaloupe': [34, 0.8, 8.2, 0.2, 0.9, '1 cup, diced', 156], // Melons, cantaloupe, raw
  'Cherries': [63, 1.1, 16, 0.2, 2.1, '1 cup, pitted', 154], // Cherries, sweet, raw
  'Clementines': [47, 0.9, 12, 0.2, 1.7, '1 fruit', 74], // Clementines, raw
  'Coconut': [354, 3.3, 15.2, 33.5, 9, '1 oz', 28], // Nuts, coconut meat, raw
  'Cranberries': [46, 0.5, 12, 0.1, 3.6, '1 cup', 100], // Cranberries, raw
  'Dates': [277, 1.8, 75, 0.2, 6.7, '1 date', 24], // Dates, medjool
  'Figs': [74, 0.8, 19.2, 0.3, 2.9, '1 medium', 50], // Figs, raw
  'Grapefruit': [42, 0.8, 10.7, 0.1, 1.6, 'half a grapefruit', 123], // Grapefruit, raw, pink and red, all areas
  'Grapes': [69, 0.7, 18.1, 0.2, 0.9, '1 cup', 151], // Grapes, red or green (European type, such as Thompson seedless), raw
  'Honeydew melon': [36, 0.5, 9.1, 0.1, 0.8, '1 cup, diced', 170], // Melons, honeydew, raw
  'Kiwi': [61, 1.1, 14.7, 0.5, 3, '1 fruit', 69], // Kiwifruit, green, raw
  'Lemons': [29, 1.1, 9.3, 0.3, 2.8, '1 lemon', 58], // Lemons, raw, without peel
  'Limes': [30, 0.7, 10.5, 0.2, 2.8, '1 lime', 67], // Limes, raw
  'Mandarins': [53, 0.8, 13.3, 0.3, 1.8, '1 medium', 88], // Tangerines, (mandarin oranges), raw
  'Mangoes': [60, 0.8, 15, 0.4, 1.6, '1 cup, pieces', 165], // Mangos, raw
  'Melon': [34, 0.8, 8.2, 0.2, 0.9, '1 cup, diced', 156], // Melons, cantaloupe, raw
  'Nectarines': [44, 1.1, 10.6, 0.3, 1.7, '1 medium', 142], // Nectarines, raw
  'Oranges': [47, 0.9, 11.8, 0.1, 2.4, '1 medium', 131], // Oranges, raw
  'Papaya': [43, 0.5, 10.8, 0.3, 1.7, '1 cup, pieces', 145], // Papayas, raw
  'Passion fruit': [97, 2.2, 23.4, 0.7, 10.4, '1 fruit', 18], // Passion-fruit, (granadilla), purple, raw
  'Peaches': [39, 0.9, 9.5, 0.3, 1.5, '1 medium', 150], // Peaches, yellow, raw
  'Pears': [57, 0.4, 15.2, 0.1, 3.1, '1 medium', 178], // Pears, raw
  'Pineapple': [50, 0.5, 13.1, 0.1, 1.4, '1 cup, chunks', 165], // Pineapple, raw
  'Plums': [46, 0.7, 11.4, 0.3, 1.4, '1 plum', 66], // Plums, raw
  'Pomegranate': [83, 1.7, 18.7, 1.2, 4, 'half a cup of seeds', 87], // Pomegranates, raw
  'Raspberries': [52, 1.2, 11.9, 0.7, 6.5, '1 cup', 123], // Raspberries, raw
  'Rhubarb': [21, 0.9, 4.5, 0.2, 1.8, '1 cup, diced', 122], // Rhubarb, raw
  'Strawberries': [32, 0.7, 7.7, 0.3, 2, '1 cup, halves', 152], // Strawberries, raw
  'Tangerines': [53, 0.8, 13.3, 0.3, 1.8, '1 medium', 88], // Tangerines, (mandarin oranges), raw
  'Watermelon': [30, 0.6, 7.6, 0.2, 0.4, '1 cup, diced', 152], // Watermelon, raw
  'Artichokes': [47, 3.3, 10.5, 0.2, 5.4, '1 medium', 128], // Artichokes, (globe or french), raw
  'Arugula': [25, 2.6, 3.7, 0.7, 1.6, '1 cup', 20], // Arugula, raw
  'Rocket': [25, 2.6, 3.7, 0.7, 1.6, '1 cup', 20], // Arugula, raw
  'Asparagus': [20, 2.2, 3.9, 0.1, 2.1, '6 spears', 96], // Asparagus, raw
  'Aubergine': [25, 1, 5.9, 0.2, 3, '1 cup, cubed', 82], // Eggplant, raw
  'Eggplant': [25, 1, 5.9, 0.2, 3, '1 cup, cubed', 82], // Eggplant, raw
  'Baby carrots': [35, 0.6, 8.2, 0.1, 2.9, '10 baby carrots', 100], // Carrots, baby, raw
  'Baby spinach': [23, 2.9, 3.6, 0.4, 2.2, '1 cup', 30], // Spinach, raw
  'Basil': [23, 3.2, 2.7, 0.6, 1.6, '2 tbsp, chopped', 5], // Basil, fresh
  'Bean sprouts': [30, 3, 5.9, 0.2, 1.8, '1 cup', 104], // Mung beans, mature seeds, sprouted, raw
  'Beets': [43, 1.6, 9.6, 0.2, 2.8, '1 beet', 82], // Beets, raw
  'Beetroot': [43, 1.6, 9.6, 0.2, 2.8, '1 beet', 82], // Beets, raw
  'Bell peppers': [20, 0.9, 4.6, 0.2, 1.7, '1 medium', 119], // Peppers, sweet, green, raw
  'Red peppers': [26, 1, 6, 0.3, 2.1, '1 medium', 119], // Peppers, sweet, red, raw
  'Bok choy': [13, 1.5, 2.2, 0.2, 1, '1 cup, shredded', 70], // Cabbage, chinese (pak-choi), raw
  'Broccoli': [34, 2.8, 6.6, 0.4, 2.6, '1 cup, chopped', 91], // Broccoli, raw
  'Brussels sprouts': [43, 3.4, 9, 0.3, 3.8, '1 cup', 88], // Brussels sprouts, raw
  'Butternut squash': [45, 1, 11.7, 0.1, 2, '1 cup, cubed', 140], // Squash, winter, butternut, raw
  'Cabbage': [25, 1.3, 5.8, 0.1, 2.5, '1 cup, shredded', 70], // Cabbage, raw
  'Red cabbage': [31, 1.4, 7.4, 0.2, 2.1, '1 cup, shredded', 70], // Cabbage, red, raw
  'Carrots': [41, 0.9, 9.6, 0.2, 2.8, '1 medium', 61], // Carrots, raw
  'Cauliflower': [25, 1.9, 5, 0.3, 2, '1 cup', 107], // Cauliflower, raw
  'Celery': [14, 0.7, 3, 0.2, 1.6, '1 stalk', 40], // Celery, raw
  'Cherry tomatoes': [18, 0.9, 3.9, 0.2, 1.2, '1 cup', 149], // Tomatoes, red, ripe, raw
  'Chili peppers': [40, 1.9, 8.8, 0.4, 1.5, '1 pepper', 45], // Peppers, hot chili, red, raw
  'Chives': [30, 3.3, 4.4, 0.7, 2.5, '1 tbsp', 3], // Chives, raw
  'Cilantro': [23, 2.1, 3.7, 0.5, 2.8, 'a quarter cup', 4], // Coriander (cilantro) leaves, raw
  'Coriander': [23, 2.1, 3.7, 0.5, 2.8, 'a quarter cup', 4], // Coriander (cilantro) leaves, raw
  'Corn on the cob': [86, 3.3, 18.7, 1.4, 2, '1 ear (kernels)', 90], // Corn, sweet, yellow, raw
  'Sweetcorn': [86, 3.3, 18.7, 1.4, 2, 'half a cup', 77], // Corn, sweet, yellow, raw
  'Courgette': [17, 1.2, 3.1, 0.3, 1, '1 medium', 196], // Squash, summer, zucchini, raw
  'Zucchini': [17, 1.2, 3.1, 0.3, 1, '1 medium', 196], // Squash, summer, zucchini, raw
  'Cucumber': [15, 0.7, 3.6, 0.1, 0.5, '1 cup, sliced', 104], // Cucumber, with peel, raw
  'Dill': [43, 3.5, 7, 1.1, 2.1, '5 sprigs', 1], // Dill weed, fresh
  'Edamame': [121, 11.9, 8.9, 5.2, 5.2, '1 cup', 155], // Edamame, frozen, prepared
  'Fennel': [31, 1.2, 7.3, 0.2, 3.1, '1 cup, sliced', 87], // Fennel, bulb, raw
  'Garlic': [149, 6.4, 33.1, 0.5, 2.1, '1 clove', 3], // Garlic, raw
  'Ginger': [80, 1.8, 17.8, 0.8, 2, '1 tsp', 2], // Ginger root, raw
  'Green beans': [31, 1.8, 7, 0.2, 2.7, '1 cup', 100], // Beans, snap, green, raw
  'Green onions': [32, 1.8, 7.3, 0.2, 2.6, '1 medium', 15], // Onions, spring or scallions, raw
  'Spring onions': [32, 1.8, 7.3, 0.2, 2.6, '1 medium', 15], // Onions, spring or scallions, raw
  'Scallions': [32, 1.8, 7.3, 0.2, 2.6, '1 medium', 15], // Onions, spring or scallions, raw
  'Iceberg lettuce': [14, 0.9, 3, 0.1, 1.2, '1 cup, shredded', 72], // Lettuce, iceberg, raw
  'Jalapeños': [29, 0.9, 6.5, 0.4, 2.8, '1 pepper', 14], // Peppers, jalapeno, raw
  'Kale': [35, 2.9, 4.4, 1.5, 4.1, '1 cup, chopped', 21], // Kale, raw
  'Leeks': [61, 1.5, 14.2, 0.3, 1.8, '1 leek', 89], // Leeks, (bulb and lower leaf-portion), raw
  'Lettuce': [15, 1.4, 2.9, 0.2, 1.3, '1 cup, shredded', 36], // Lettuce, green leaf, raw
  'Romaine lettuce': [17, 1.2, 3.3, 0.3, 2.1, '1 cup, shredded', 47], // Lettuce, cos or romaine, raw
  'Mint': [44, 3.3, 8.4, 0.7, 6.8, '2 tbsp', 3], // Spearmint, fresh
  'Mixed salad': [15, 1.4, 2.9, 0.2, 1.3, '1 cup', 36], // Lettuce, green leaf, raw
  'Salad greens': [15, 1.4, 2.9, 0.2, 1.3, '1 cup', 36], // Lettuce, green leaf, raw
  'Mushrooms': [22, 3.1, 3.3, 0.3, 1, '1 cup, pieces', 70], // Mushrooms, white, raw
  'Okra': [33, 1.9, 7.5, 0.2, 3.2, '1 cup', 100], // Okra, raw
  'Onions': [40, 1.1, 9.3, 0.1, 1.7, '1 medium', 110], // Onions, raw
  'Red onions': [40, 1.1, 9.3, 0.1, 1.7, '1 medium', 110], // Onions, raw
  'Parsley': [36, 3, 6.3, 0.8, 3.3, '2 tbsp', 8], // Parsley, fresh
  'Parsnips': [75, 1.2, 18, 0.3, 4.9, '1 cup, sliced', 133], // Parsnips, raw
  'Potatoes': [77, 2.1, 17.5, 0.1, 2.1, '1 medium', 213], // Potatoes, flesh and skin, raw
  'Pumpkin': [26, 1, 6.5, 0.1, 0.5, '1 cup, cubed', 116], // Pumpkin, raw
  'Radishes': [16, 0.7, 3.4, 0.1, 1.6, '5 radishes', 23], // Radishes, raw
  'Rosemary': [131, 3.3, 20.7, 5.9, 14.1, '1 tbsp', 2], // Rosemary, fresh
  'Shallots': [72, 2.5, 16.8, 0.1, 3.2, '1 tbsp, chopped', 10], // Shallots, raw
  'Snap peas': [42, 2.8, 7.6, 0.2, 2.6, '1 cup', 63], // Peas, edible-podded, raw
  'Snow peas': [42, 2.8, 7.6, 0.2, 2.6, '1 cup', 63], // Peas, edible-podded, raw
  'Spinach': [23, 2.9, 3.6, 0.4, 2.2, '1 cup', 30], // Spinach, raw
  'Sweet potatoes': [86, 1.6, 20.1, 0.1, 3, '1 medium', 130], // Sweet potato, raw, unprepared
  'Thyme': [101, 5.6, 24.5, 1.7, 14, '1 tsp', 1], // Thyme, fresh
  'Tomatoes': [18, 0.9, 3.9, 0.2, 1.2, '1 medium', 123], // Tomatoes, red, ripe, raw
  'Turnips': [28, 0.9, 6.4, 0.1, 1.8, '1 cup, cubed', 130], // Turnips, raw
  'Watercress': [11, 2.3, 1.3, 0.1, 0.5, '1 cup', 34], // Watercress, raw
  'Frozen peas': [77, 5.2, 13.6, 0.4, 4.5, 'half a cup', 67], // Peas, green, frozen, unprepared
  'Frozen corn': [88, 3, 20.7, 0.8, 2.1, 'half a cup', 66], // Corn, sweet, yellow, frozen, kernels cut off cob
  'Frozen spinach': [29, 3.6, 4.2, 0.6, 2.9, 'half a cup', 78], // Spinach, frozen, chopped or leaf, unprepared
  'Frozen berries': [51, 0.4, 12.2, 0.6, 2.7, '1 cup', 155], // Blueberries, frozen, unsweetened
  'Frozen mixed vegetables': [72, 3.3, 13.5, 0.5, 4, 'half a cup', 68], // Vegetables, mixed, frozen, unprepared
  'Milk': [61, 3.2, 4.8, 3.3, 0, '1 cup', 244], // Milk, whole, 3.25% milkfat, with added vitamin D
  'Whole milk': [61, 3.2, 4.8, 3.3, 0, '1 cup', 244], // Milk, whole, 3.25% milkfat, with added vitamin D
  'Skim milk': [34, 3.4, 5, 0.1, 0, '1 cup', 245], // Milk, nonfat, fluid, with added vitamin A and vitamin D (fat free or skim)
  'Semi-skimmed milk': [50, 3.3, 4.8, 2, 0, '1 cup', 244], // Milk, reduced fat, fluid, 2% milkfat, with added vitamin A and vitamin D
  '2% milk': [50, 3.3, 4.8, 2, 0, '1 cup', 244], // Milk, reduced fat, fluid, 2% milkfat, with added vitamin A and vitamin D
  'Lactose-free milk': [50, 3.3, 4.8, 2, 0, '1 cup', 244], // Milk, reduced fat, fluid, 2% milkfat, with added vitamin A and vitamin D
  'Buttermilk': [40, 3.3, 4.8, 1.1, 0, '1 cup', 245], // Milk, buttermilk, fluid, cultured, lowfat
  'Heavy cream': [340, 2.8, 2.8, 36.1, 0, '1 tbsp', 15], // Cream, fluid, heavy whipping
  'Whipping cream': [340, 2.8, 2.8, 36.1, 0, '1 tbsp', 15], // Cream, fluid, heavy whipping
  'Double cream': [340, 2.8, 2.8, 36.1, 0, '1 tbsp', 15], // Cream, fluid, heavy whipping
  'Single cream': [195, 3, 3.7, 19.1, 0, '1 tbsp', 15], // Cream, fluid, light (coffee cream or table cream)
  'Half and half': [131, 3.1, 4.3, 11.5, 0, '1 tbsp', 15], // Cream, fluid, half and half
  'Sour cream': [198, 2.4, 4.6, 19.4, 0, '2 tbsp', 24], // Cream, sour, cultured
  'Crème fraîche': [340, 2.8, 2.8, 36.1, 0, '1 tbsp', 15], // Cream, fluid, heavy whipping
  'Yogurt': [63, 5.3, 7, 1.6, 0, 'three quarters of a cup', 170], // Yogurt, plain, low fat
  'Greek yogurt': [73, 10, 3.9, 1.9, 0, 'three quarters of a cup', 170], // Yogurt, Greek, plain, lowfat
  'Plain yogurt': [63, 5.3, 7, 1.6, 0, 'three quarters of a cup', 170], // Yogurt, plain, low fat
  'Kefir': [43, 3.8, 4.8, 1, 0, '1 cup', 243], // Kefir, lowfat, plain, LIFEWAY
  'Butter': [717, 0.9, 0.1, 81.1, 0, '1 tbsp', 14], // Butter, salted
  'Unsalted butter': [717, 0.9, 0.1, 81.1, 0, '1 tbsp', 14], // Butter, without salt
  'Margarine': [717, 0.2, 0.7, 80.7, 0, '1 tbsp', 14], // Margarine, 80% fat, composite, stick, with salt
  'Eggs': [143, 12.6, 0.7, 9.5, 0, '1 large egg', 50], // Egg, whole, raw, fresh
  'Free-range eggs': [143, 12.6, 0.7, 9.5, 0, '1 large egg', 50], // Egg, whole, raw, fresh
  'Cheese': [403, 22.9, 3.4, 33.3, 0, '1 oz', 28], // Cheese, cheddar
  'Cheddar cheese': [403, 22.9, 3.4, 33.3, 0, '1 oz', 28], // Cheese, cheddar
  'Mozzarella': [299, 22.2, 2.4, 22.1, 0, '1 oz', 28], // Cheese, mozzarella, whole milk
  'Parmesan': [392, 35.8, 3.2, 25, 0, '1 oz', 28], // Cheese, parmesan, hard
  'Feta': [265, 14.2, 3.9, 21.5, 0, '1 oz', 28], // Cheese, feta
  'Goat cheese': [264, 18.5, 0, 21.1, 0, '1 oz', 28], // Cheese, goat, soft type
  'Brie': [334, 20.8, 0.5, 27.7, 0, '1 oz', 28], // Cheese, brie
  'Camembert': [300, 19.8, 0.5, 24.3, 0, '1 oz', 28], // Cheese, camembert
  'Swiss cheese': [393, 27, 1.4, 31, 0, '1 oz', 28], // Cheese, swiss
  'Gouda': [356, 24.9, 2.2, 27.4, 0, '1 oz', 28], // Cheese, gouda
  'Cottage cheese': [81, 10.5, 4.8, 2.3, 0, 'half a cup', 113], // Cheese, cottage, lowfat, 2% milkfat
  'Cream cheese': [350, 6.2, 5.5, 34.4, 0, '2 tbsp', 29], // Cheese, cream
  'Ricotta': [150, 7.5, 7.3, 10.2, 0, 'half a cup', 124], // Cheese, ricotta, whole milk
  'Blue cheese': [353, 21.4, 2.3, 28.7, 0, '1 oz', 28], // Cheese, blue
  'Provolone': [351, 25.6, 2.1, 26.6, 0, '1 oz', 28], // Cheese, provolone
  'Monterey Jack': [373, 24.5, 0.7, 30.3, 0, '1 oz', 28], // Cheese, monterey
  'Pepper jack': [373, 24.5, 0.7, 30.3, 0, '1 oz', 28], // Cheese, monterey
  'String cheese': [295, 23.8, 5.6, 19.8, 0, '1 stick', 28], // Cheese, mozzarella, low moisture, part-skim
  'Shredded cheese': [403, 22.9, 3.4, 33.3, 0, 'a quarter cup', 28], // Cheese, cheddar
  'Sliced cheese': [403, 22.9, 3.4, 33.3, 0, '1 slice', 21], // Cheese, cheddar
  'American cheese': [366, 18.1, 4.8, 30.7, 0, '1 slice', 21], // Cheese, pasteurized process, American, fortified with vitamin D
  'Ice cream': [207, 3.5, 23.6, 11, 0.7, 'half a cup', 66], // Ice creams, vanilla
  'Frozen yogurt': [159, 4, 24.2, 5.6, 0, 'half a cup', 72], // Frozen yogurts, vanilla, soft-serve
  'Custard': [104, 5, 11, 4.6, 0, 'half a cup', 113], // Desserts, egg custard, baked, prepared-from-recipe
  'Pudding': [130, 1.5, 22.6, 3.8, 0, '1 snack cup', 113], // Puddings, vanilla
  'Chicken': [120, 22.5, 0, 2.6, 0, '1 breast', 170], // Chicken, broiler or fryers, breast, skinless, boneless
  'Chicken breast': [120, 22.5, 0, 2.6, 0, '1 breast', 170], // Chicken, broiler or fryers, breast, skinless, boneless
  'Chicken thighs': [121, 19.7, 0, 4.1, 0, '1 boneless thigh', 100], // Chicken, dark meat, thigh, meat only, raw
  'Chicken wings': [191, 17.5, 0, 12.9, 0, '1 wing, without bone', 34], // Chicken, wing, meat and skin, raw
  'Chicken drumsticks': [161, 18.1, 0.1, 9.2, 0, '1 drumstick, without bone', 75], // Chicken, drumstick, meat and skin, raw
  'Whole chicken': [215, 18.6, 0, 15.1, 0, '100 g', 100], // Chicken, meat and skin, raw
  'Rotisserie chicken': [137, 28, 0, 2.8, 0, '3 oz', 85], // Chicken, rotisserie, original seasoning, breast, meat only
  'Ground beef': [254, 17.2, 0, 20, 0, '4 oz', 113], // Beef, ground, 80% lean meat / 20% fat, raw
  'Beef mince': [254, 17.2, 0, 20, 0, '4 oz', 113], // Beef, ground, 80% lean meat / 20% fat, raw
  'Ground turkey': [150, 18.7, 0, 8.3, 0, '4 oz', 113], // Turkey, ground, 93% lean, 7% fat, raw
  'Ground pork': [263, 16.9, 0, 21.2, 0, '4 oz', 113], // Pork, fresh, ground, raw
  'Ground chicken': [143, 17.4, 0, 8.1, 0, '4 oz', 113], // Chicken, ground, raw
  'Steak': [201, 20.3, 0, 12.7, 0, '6 oz', 170], // Beef, top sirloin, steak, raw
  'Stewing beef': [128, 21.8, 0.2, 4.5, 0, '4 oz', 113], // Beef, chuck for stew, raw
  'Beef brisket': [253, 18.4, 0.6, 19.1, 0, '4 oz', 113], // Beef, brisket, whole, raw
  'Roast beef': [115, 18.6, 0.6, 3.7, 0, '2 oz', 56], // Roast beef, deli style, prepackaged, sliced
  'Pork chops': [170, 20.7, 0, 9, 0, '1 chop, without bone', 140], // Pork, fresh, loin, center loin (chops), bone-in
  'Pork tenderloin': [109, 21, 0, 2.2, 0, '4 oz', 113], // Pork, fresh, loin, tenderloin, raw
  'Pork loin': [198, 19.7, 0, 12.6, 0, '4 oz', 113], // Pork, fresh, loin, whole, raw
  'Pork shoulder': [236, 17.2, 0, 18, 0, '4 oz', 113], // Pork, fresh, shoulder, whole, raw
  'Pulled pork': [230, 25.3, 0, 13.5, 0, '3 oz', 85], // Pork, fresh, shoulder, whole, cooked
  'Pork ribs': [277, 15.5, 0, 23.4, 0, '4 oz', 113], // Pork, fresh, spareribs, raw
  'Lamb chops': [279, 17.2, 0, 22.8, 0, '1 chop, without bone', 90], // Lamb, loin, raw
  'Lamb': [209, 18.5, 0, 14.4, 0, '4 oz', 113], // Lamb, leg, whole (shank and sirloin), raw
  'Bacon': [393, 13.7, 0, 37.1, 0, '1 slice, raw', 28], // Pork, cured, bacon, unprepared
  'Turkey bacon': [226, 15.9, 1.9, 16.9, 0, '1 slice, raw', 15], // Bacon, turkey, unprepared
  'Sausages': [288, 15.4, 0.9, 24.8, 0, '1 link', 68], // Pork sausage, link/patty, unprepared
  'Italian sausage': [290, 13.9, 3, 24.3, 0, '1 link', 113], // Sausage, Italian, pork, mild, raw
  'Breakfast sausage': [327, 12.9, 4.6, 28.2, 0, '2 links', 45], // Sausage, breakfast sausage, beef, pre-cooked, unprepared
  'Chorizo': [296, 13.6, 3.8, 25.1, 0, '2 oz', 56], // Sausage, pork, chorizo, link or ground, raw
  'Bratwurst': [333, 13.7, 2.9, 29.2, 0, '1 link', 85], // Bratwurst, pork, cooked
  'Hot dogs': [315, 11.7, 3, 28.1, 0, '1 hot dog', 45], // Frankfurter, beef, unheated
  'Ham': [164, 16.6, 3.6, 8.8, 1.3, '2 oz', 56], // Ham, sliced, regular (approximately 11% fat)
  'Sliced ham': [164, 16.6, 3.6, 8.8, 1.3, '2 slices', 56], // Ham, sliced, regular (approximately 11% fat)
  'Deli turkey': [106, 14.8, 2.2, 3.8, 0, '2 oz', 56], // Turkey breast, sliced, prepackaged
  'Turkey breast': [114, 23.7, 0.1, 1.5, 0, '4 oz', 113], // Turkey, whole, breast, meat only, raw
  'Salami': [336, 21.9, 2.4, 25.9, 0, '1 oz', 28], // Salami, cooked, beef and pork
  'Pepperoni': [504, 19.3, 1.2, 46.3, 0, '1 oz', 28], // Pepperoni, beef and pork, sliced
  'Meatballs': [286, 14.4, 8.1, 22.2, 2.3, '3 meatballs', 85], // Meatballs, frozen, Italian style
  'Burger patties': [254, 17.2, 0, 20, 0, '1 patty', 113], // Beef, ground, 80% lean meat / 20% fat, raw
  'Duck breast': [135, 18.3, 0.9, 6, 0, '1 breast', 150], // Duck, domesticated, meat only, raw
  'Salmon': [208, 20.4, 0, 13.4, 0, '1 fillet', 150], // Fish, salmon, Atlantic, farmed, raw
  'Salmon fillets': [208, 20.4, 0, 13.4, 0, '1 fillet', 150], // Fish, salmon, Atlantic, farmed, raw
  'Smoked salmon': [117, 18.3, 0, 4.3, 0, '2 oz', 56], // Fish, salmon, chinook, smoked
  'Tuna steak': [109, 24.4, 0, 0.5, 0, '1 steak', 150], // Fish, tuna, fresh, yellowfin, raw
  'Cod': [82, 17.8, 0, 0.7, 0, '1 fillet', 150], // Fish, cod, Atlantic, raw
  'Tilapia': [96, 20.1, 0, 1.7, 0, '1 fillet', 115], // Fish, tilapia, raw
  'Haddock': [74, 16.3, 0, 0.5, 0, '1 fillet', 150], // Fish, haddock, raw
  'Halibut': [91, 18.6, 0, 1.3, 0, '1 fillet', 150], // Fish, halibut, Atlantic and Pacific, raw
  'Trout': [141, 19.9, 0, 6.2, 0, '1 fillet', 120], // Fish, trout, rainbow, farmed, raw
  'Sea bass': [97, 18.4, 0, 2, 0, '1 fillet', 130], // Fish, sea bass, mixed species, raw
  'Shrimp': [85, 20.1, 0, 0.5, 0, '3 oz', 85], // Crustaceans, shrimp, raw
  'Prawns': [85, 20.1, 0, 0.5, 0, '3 oz', 85], // Crustaceans, shrimp, raw
  'Scallops': [69, 12.1, 3.2, 0.5, 0, '3 oz', 85], // Mollusks, scallop, mixed species, raw
  'Crab': [87, 18.1, 0, 1.1, 0, '3 oz', 85], // Crustaceans, crab, blue, raw
  'Lobster': [77, 16.5, 0, 0.8, 0, '3 oz', 85], // Crustaceans, lobster, northern, raw
  'Mussels': [86, 11.9, 3.7, 2.2, 0, '3 oz', 85], // Mollusks, mussel, blue, raw
  'Clams': [86, 14.7, 3.6, 1, 0, '3 oz', 85], // Mollusks, clam, mixed species, raw
  'Oysters': [51, 5.7, 2.7, 1.7, 0, '6 oysters', 84], // Mollusks, oyster, eastern, wild, raw
  'Squid': [92, 15.6, 3.1, 1.4, 0, '3 oz', 85], // Mollusks, squid, mixed species, raw
  'Fish sticks': [277, 11, 21.7, 16.2, 1.5, '3 sticks', 84], // Fish, fish sticks, frozen, prepared
  'Fish fingers': [277, 11, 21.7, 16.2, 1.5, '3 fingers', 84], // Fish, fish sticks, frozen, prepared
  'Bread': [266, 8.9, 49.4, 3.3, 2.7, '1 slice', 25], // Bread, white
  'White bread': [266, 8.9, 49.4, 3.3, 2.7, '1 slice', 25], // Bread, white
  'Whole wheat bread': [252, 12.5, 42.7, 3.5, 6, '1 slice', 32], // Bread, whole-wheat
  'Sourdough bread': [272, 10.8, 51.9, 2.4, 2.2, '1 slice', 32], // Bread, french or vienna
  'Rye bread': [259, 8.5, 48.3, 3.3, 5.8, '1 slice', 32], // Bread, rye
  'Baguette': [272, 10.8, 51.9, 2.4, 2.2, 'a 2-inch piece', 32], // Bread, french or vienna
  'Bagels': [264, 10.6, 52.4, 1.3, 1.6, '1 bagel', 98], // Bagels, plain, with calcium propionate
  'English muffins': [235, 7.7, 46, 1.8, 2.7, '1 muffin', 57], // English muffins, plain, with calcium propionate
  'Croissants': [406, 8.2, 45.8, 21, 2.6, '1 medium', 57], // Croissants, butter
  'Hamburger buns': [279, 9.8, 50.1, 3.9, 1.8, '1 bun', 44], // Rolls, hamburger or hotdog, plain
  'Hot dog buns': [279, 9.8, 50.1, 3.9, 1.8, '1 bun', 44], // Rolls, hamburger or hotdog, plain
  'Dinner rolls': [310, 10.9, 52, 6.5, 2, '1 roll', 28], // Rolls, dinner, plain
  'Pita bread': [275, 9.1, 55.7, 1.2, 2.2, '1 pita', 60], // Bread, pita, white
  'Naan': [291, 9.6, 50.4, 5.7, 2.2, '1 piece', 90], // Bread, naan, plain, refrigerated
  'Flour tortillas': [306, 8.2, 49.4, 8, 3.5, '1 tortilla', 49], // Tortillas, ready-to-bake or -fry, flour, refrigerated
  'Corn tortillas': [218, 5.7, 44.6, 2.9, 6.3, '1 tortilla', 26], // Tortillas, ready-to-bake or -fry, corn
  'Wraps': [306, 8.2, 49.4, 8, 3.5, '1 wrap', 49], // Tortillas, ready-to-bake or -fry, flour, refrigerated
  'Muffins': [375, 4.5, 53, 16.1, 1.1, '1 medium', 113], // Muffins, blueberry
  'Donuts': [426, 5.2, 50.8, 22.9, 1.5, '1 medium', 47], // Doughnuts, cake-type, plain, sugared or glazed
  'Cake': [379, 3.2, 55.4, 17.8, 1.5, '1 slice', 64], // Cake, yellow, with chocolate frosting, in-store bakery
  'Brownies': [405, 4.8, 63.9, 16.3, 2.1, '1 brownie', 56], // Cookies, brownies
  'Brioche': [287, 9.5, 47.8, 6, 2.3, '1 slice', 40], // Bread, egg
  'Frozen waffles': [285, 6.5, 43, 9.7, 2.2, '1 waffle', 35], // Waffles, plain, frozen, ready-to-heat
  'Leftover pizza': [268, 10.4, 29, 12.3, 2.2, '1 slice', 107], // Pizza, cheese topping, regular crust, frozen, cooked
  'Leftover pasta': [158, 5.8, 30.9, 0.9, 1.8, '1 cup', 140], // Pasta, cooked, without added salt
  'Leftover rice': [130, 2.7, 28.2, 0.3, 0.4, '1 cup', 158], // Rice, white, long-grain, cooked
  'Pizza': [268, 10.4, 29, 12.3, 2.2, '1 slice', 107], // Pizza, cheese topping, regular crust, frozen, cooked
  'Almond milk': [15, 0.4, 1.3, 1, 0.2, '1 cup', 262], // Beverages, almond milk, unsweetened, shelf stable
  'Soy milk': [54, 3.3, 6.3, 1.8, 0.6, '1 cup', 243], // Soymilk, original and vanilla, unfortified
  'Orange juice': [49, 0.7, 11.5, 0.1, 0.3, '1 cup', 249], // Orange juice, chilled
  'Apple juice': [46, 0.1, 11.3, 0.1, 0.2, '1 cup', 248], // Apple juice, canned or bottled, unsweetened, without added ascorbic acid
  'Cranberry juice': [54, 0, 13.5, 0.1, 0, '1 cup', 253], // Cranberry juice cocktail, bottled
  'Lemonade': [40, 0.1, 10.4, 0, 0, '1 cup', 248], // Lemonade, frozen concentrate, white, prepared with water
  'Iced tea': [45, 0, 10.8, 0.2, 0, '1 cup', 240], // Beverages, tea, black, ready-to-drink, lemon
  'Coffee': [1, 0.1, 0, 0, 0, '1 cup', 237], // Beverages, coffee, brewed, prepared with tap water
  'Cold brew coffee': [1, 0.1, 0, 0, 0, '1 cup', 237], // Beverages, coffee, brewed, prepared with tap water
  'Tea': [1, 0, 0.3, 0, 0, '1 cup', 237], // Beverages, tea, black, brewed, prepared with tap water
  'Green tea': [1, 0.2, 0, 0, 0, '1 cup', 245], // Beverages, tea, green, brewed
  'Sparkling water': [0, 0, 0, 0, 0, '1 can', 355], // no energy or macronutrients
  'Soda': [41, 0, 10.6, 0, 0, '1 can', 368], // Beverages, carbonated, cola, without caffeine
  'Coconut water': [19, 0.7, 3.7, 0.2, 1.1, '1 cup', 240], // Nuts, coconut water (liquid from coconuts)
  'Beer': [43, 0.5, 3.6, 0, 0, '1 can', 356], // Alcoholic beverage, beer, all
  'White wine': [82, 0.1, 2.6, 0, 0, '1 glass', 147], // Alcoholic beverage, wine, table, white
  'Red wine': [85, 0.1, 2.6, 0, 0, '1 glass', 147], // Alcoholic beverage, wine, table, red
  'Rosé wine': [83, 0.1, 2.7, 0, 0, '1 glass', 147], // Alcoholic beverage, wine, table, all
  'Prosecco': [82, 0.1, 2.6, 0, 0, '1 glass', 125], // Alcoholic beverage, wine, table, white
  'Ketchup': [101, 1, 27.4, 0.1, 0.3, '1 tbsp', 17], // Catsup
  'Mustard': [60, 3.7, 5.8, 3.3, 4, '1 tsp', 5], // Mustard, prepared, yellow
  'Dijon mustard': [60, 3.7, 5.8, 3.3, 4, '1 tsp', 5], // Mustard, prepared, yellow
  'Mayonnaise': [680, 1, 0.6, 74.9, 0, '1 tbsp', 14], // Salad dressing, mayonnaise
  'Soy sauce': [53, 8.1, 4.9, 0.6, 0.8, '1 tbsp', 16], // Soy sauce made from soy and wheat (shoyu)
  'Hot sauce': [11, 0.5, 1.8, 0.4, 0.3, '1 tsp', 5], // Sauce, ready-to-serve, pepper or hot
  'Sriracha': [93, 1.9, 19.2, 0.9, 2.2, '1 tsp', 6], // Sauce, hot chile, sriracha
  'BBQ sauce': [172, 0.8, 40.8, 0.6, 0.9, '2 tbsp', 36], // Sauce, barbecue
  'Salad dressing': [240, 0.4, 12.1, 21.1, 0, '2 tbsp', 29], // Salad dressing, italian dressing, commercial
  'Ranch dressing': [430, 1.3, 5.9, 44.5, 0, '2 tbsp', 30], // Salad dressing, ranch dressing
  'Olive oil': [884, 0, 0, 100, 0, '1 tbsp', 14], // Oil, olive, salad or cooking
  'Vegetable oil': [884, 0, 0, 100, 0, '1 tbsp', 14], // Oil, canola
  'Balsamic vinegar': [88, 0.5, 17, 0, 0, '1 tbsp', 16], // Vinegar, balsamic
  'Honey': [304, 0.3, 82.4, 0, 0.2, '1 tbsp', 21], // Honey
  'Maple syrup': [260, 0, 67, 0.1, 0, '1 tbsp', 20], // Syrups, maple
  'Jam': [278, 0.4, 68.9, 0.1, 1.1, '1 tbsp', 20], // Jams and preserves
  'Peanut butter': [598, 22.2, 22.3, 51.4, 5, '2 tbsp', 32], // Peanut butter, smooth style, with salt
  'Almond butter': [614, 21, 18.8, 55.5, 10.3, '2 tbsp', 32], // Nuts, almond butter, plain, with salt added
  'Chocolate spread': [539, 5.4, 62.4, 29.7, 5.4, '2 tbsp', 37], // Chocolate-flavored hazelnut spread
  'Pesto': [418, 9.8, 10.1, 37.6, 1.8, '2 tbsp', 32], // Sauce, pesto, ready-to-serve, refrigerated
  'Salsa': [29, 1.5, 6.6, 0.2, 1.9, '2 tbsp', 36], // Sauce, salsa, ready-to-serve
  'Hummus': [237, 7.8, 15, 17.8, 5.5, '2 tbsp', 30], // Hummus, commercial
  'Relish': [130, 0.4, 35.1, 0.5, 1.1, '1 tbsp', 15], // Pickle relish, sweet
  'Pickles': [12, 0.5, 2.4, 0.3, 1, '1 spear', 35], // Pickles, cucumber, dill or kosher dill
  'Olives': [116, 0.8, 6, 10.9, 1.6, '5 olives', 22], // Olives, ripe, canned (small-extra large)
  'Tahini': [595, 17, 21.2, 53.8, 9.3, '1 tbsp', 15], // Seeds, sesame butter, tahini, from roasted and toasted kernels (most common type)
  'Pasta sauce': [50, 1.4, 7.4, 1.6, 1.8, 'half a cup', 132], // Sauce, pasta, spaghetti/marinara, ready-to-serve
  'Worcestershire sauce': [77, 0, 19.2, 0, 0, '1 tsp', 6], // Sauce, worcestershire
  'Fish sauce': [35, 5.1, 3.6, 0, 0, '1 tbsp', 18], // Sauce, fish, ready-to-serve
  'Teriyaki sauce': [89, 5.9, 15.6, 0, 0.1, '1 tbsp', 18], // Sauce, teriyaki, ready-to-serve
  'Salt': [0, 0, 0, 0, 0, '1 tsp', 6], // no energy or macronutrients
  'Black pepper': [251, 10.4, 64, 3.3, 25.3, '1 tsp', 2], // Spices, pepper, black
  'Sugar': [387, 0, 100, 0, 0, '1 tsp', 4], // Sugars, granulated
  'Brown sugar': [380, 0.1, 98.1, 0, 0, '1 tsp', 4], // Sugars, brown
  'Rice': [365, 7.1, 80, 0.7, 1.3, 'a quarter cup, dry', 46], // Rice, white, long-grain, raw
  'Basmati rice': [365, 7.1, 80, 0.7, 1.3, 'a quarter cup, dry', 46], // Rice, white, long-grain, raw
  'Jasmine rice': [365, 7.1, 80, 0.7, 1.3, 'a quarter cup, dry', 46], // Rice, white, long-grain, raw
  'Brown rice': [367, 7.5, 76.3, 3.2, 3.6, 'a quarter cup, dry', 46], // Rice, brown, long-grain, raw
  'Pasta': [371, 13, 74.7, 1.5, 3.2, '2 oz, dry', 56], // Pasta, dry
  'Spaghetti': [371, 13, 74.7, 1.5, 3.2, '2 oz, dry', 56], // Pasta, dry
  'Penne': [371, 13, 74.7, 1.5, 3.2, '2 oz, dry', 56], // Pasta, dry
  'Macaroni': [371, 13, 74.7, 1.5, 3.2, '2 oz, dry', 56], // Pasta, dry
  'Egg noodles': [384, 14.2, 71.3, 4.4, 3.3, '2 oz, dry', 56], // Noodles, egg, dry
  'Ramen noodles': [440, 10.2, 60.3, 17.6, 2.9, '1 block', 81], // Soup, ramen noodle, any flavor, dry
  'Rice noodles': [364, 6, 80.2, 0.6, 1.6, '2 oz, dry', 56], // Rice noodles, dry
  'Quinoa': [368, 14.1, 64.2, 6.1, 7, 'a quarter cup, dry', 43], // Quinoa, uncooked
  'Couscous': [376, 12.8, 77.4, 0.6, 5, 'a quarter cup, dry', 43], // Couscous, dry
  'Rolled oats': [379, 13.2, 67.7, 6.5, 10.1, 'half a cup, dry', 40], // Cereals, oats, regular and quick, not fortified, dry
  'Oatmeal': [379, 13.2, 67.7, 6.5, 10.1, 'half a cup, dry', 40], // Cereals, oats, regular and quick, not fortified, dry
  'Granola': [489, 13.7, 53.9, 24.3, 8.9, 'half a cup', 61], // Cereals ready-to-eat, granola, homemade
  'Flour': [364, 10.3, 76.3, 1, 2.7, 'a quarter cup', 31], // Wheat flour, white, all-purpose
  'Breadcrumbs': [395, 13.4, 72, 5.3, 4.5, 'a quarter cup', 27], // Bread, crumbs, dry, grated, plain
  'Lentils': [352, 24.6, 63.4, 1.1, 10.7, 'a quarter cup, dry', 48], // Lentils, raw
  'Dried beans': [333, 23.6, 60, 0.8, 24.9, 'a quarter cup, dry', 46], // Beans, kidney, all types, mature seeds, raw
  'Canned tomatoes': [16, 0.8, 3.5, 0.3, 1.9, 'half a cup', 120], // Tomatoes, red, ripe, canned, packed in tomato juice
  'Chopped tomatoes': [16, 0.8, 3.5, 0.3, 1.9, 'half a cup', 120], // Tomatoes, red, ripe, canned, packed in tomato juice
  'Tomato paste': [82, 4.3, 18.9, 0.5, 4.1, '1 tbsp', 16], // Tomato products, canned, paste, without salt added
  'Canned tuna': [86, 19.4, 0, 1, 0, '1 can, drained', 142], // Fish, tuna, light, canned in water, drained solids
  'Canned beans': [124, 8, 21.5, 1.1, 5.5, 'half a cup', 128], // Beans, kidney, red, mature seeds, canned
  'Black beans': [91, 6, 16.6, 0.3, 6.9, 'half a cup', 120], // Beans, black, mature seeds, canned, low sodium
  'Kidney beans': [124, 8, 21.5, 1.1, 5.5, 'half a cup', 128], // Beans, kidney, red, mature seeds, canned
  'Chickpeas': [139, 7.1, 22.5, 2.8, 6.4, 'half a cup', 120], // Chickpeas (garbanzo beans, bengal gram), mature seeds, canned, drained solids
  'Baked beans': [94, 4.8, 21.1, 0.4, 4.1, 'half a cup', 127], // Beans, baked, canned, plain or vegetarian
  'Canned corn': [67, 2.3, 14.3, 1.2, 2, 'half a cup', 82], // Corn, sweet, yellow, canned, whole kernel
  'Coconut milk': [197, 2, 2.8, 21.3, 0, 'a quarter cup', 56], // Nuts, coconut milk, canned (liquid expressed from grated meat and water)
  'Chicken broth': [6, 0.6, 0.4, 0.2, 0, '1 cup', 240], // Soup, chicken broth, ready-to-serve
  'Vegetable stock': [5, 0.2, 0.9, 0.1, 0, '1 cup', 240], // Soup, vegetable broth, ready to serve
  'Beef broth': [7, 1.1, 0, 0.2, 0, '1 cup', 240], // Soup, beef broth or bouillon canned, ready-to-serve
  'Sardines': [208, 24.6, 0, 11.5, 0, '1 can, drained', 92], // Fish, sardine, Atlantic, canned in oil, drained solids with bone
  'Crackers': [510, 6.6, 61.3, 26.4, 2.3, '5 crackers', 16], // Crackers, standard snack-type
  'Potato chips': [532, 6.4, 53.8, 34, 3.1, '1 oz', 28], // Snacks, potato chips, plain, salted
  'Crisps': [532, 6.4, 53.8, 34, 3.1, '1 oz', 28], // Snacks, potato chips, plain, salted
  'Tortilla chips': [472, 7.1, 67.8, 20.7, 5.4, '1 oz', 28], // Snacks, tortilla chips, plain, white corn, salted
  'Pretzels': [384, 10, 80.4, 2.9, 3.4, '1 oz', 28], // Snacks, pretzels, hard, plain, salted
  'Popcorn': [387, 12.9, 77.8, 4.5, 14.5, '1 cup', 8], // Snacks, popcorn, air-popped
  'Cookies': [492, 5.1, 65.4, 24.7, 2, '1 cookie', 16], // Cookies, chocolate chip, higher fat
  'Granola bars': [471, 10.1, 64.4, 19.8, 5.3, '1 bar', 25], // Snacks, granola bars, hard, plain
  'Dark chocolate': [598, 7.8, 45.9, 42.6, 10.9, '1 oz', 28], // Chocolate, dark, 70-85% cacao solids
  'Milk chocolate': [535, 7.7, 59.4, 29.7, 3.4, '1 oz', 28], // Candies, milk chocolate
  'Almonds': [579, 21.2, 21.6, 49.9, 12.5, '1 oz', 28], // Nuts, almonds
  'Cashews': [553, 18.2, 30.2, 43.9, 3.3, '1 oz', 28], // Nuts, cashew nuts, raw
  'Walnuts': [654, 15.2, 13.7, 65.2, 6.7, '1 oz', 28], // Nuts, walnuts, english
  'Peanuts': [567, 25.8, 16.1, 49.2, 8.5, '1 oz', 28], // Peanuts, all types, raw
  'Pistachios': [560, 20.2, 27.2, 45.3, 10.6, '1 oz', 28], // Nuts, pistachio nuts, raw
  'Mixed nuts': [594, 17.3, 25.4, 51.5, 9, '1 oz', 28], // Nuts, mixed nuts, dry roasted, with peanuts, with salt added
  'Trail mix': [462, 13.8, 44.9, 29.4, 0, '1 oz', 28], // Snacks, trail mix
  'Raisins': [299, 3.3, 79.3, 0.3, 4.5, '1 small box', 43], // Raisins, dark, seedless
  'Rice cakes': [387, 8.2, 81.5, 2.8, 4.2, '1 cake', 9], // Snacks, rice cakes, brown rice, plain, unsalted
  'Tofu': [144, 17.3, 2.8, 8.7, 2.3, 'half a cup', 126], // Tofu, raw, firm, prepared with calcium sulfate
  'Tempeh': [192, 20.3, 7.6, 10.8, 0, 'half a cup', 83], // Tempeh
  'Veggie burgers': [177, 15.7, 14.3, 6.3, 4.9, '1 patty', 70], // Veggie burgers or soyburgers, unprepared
  'Frozen pizza': [268, 10.4, 29, 12.3, 2.2, '1 slice', 107], // Pizza, cheese topping, regular crust, frozen, cooked
};

export const UNMEASURED: readonly string[] = [
  'Halloumi',
  'Mascarpone',
  'Prosciutto',
  'Crumpets',
  'Pizza dough',
  'Leftovers',
  'Leftover curry',
  'Soup',
  'Chicken soup',
  'Stew',
  'Lasagna',
  'Casserole',
  'Takeout',
  'Oat milk',
  'Ground coffee',
  'Coffee beans',
  'Kombucha',
  'Smoothie',
  'Guacamole',
  'Tzatziki',
  'Cereal',
  'Canned soup',
  'Protein bars',
];
