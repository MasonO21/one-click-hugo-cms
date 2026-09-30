import { freezesWell } from './shelfLife';
import type { Category, StorageLocation } from './types';

/**
 * Short storage tips shown on an item, in plain words. Every tip follows USDA / FSIS or FDA consumer
 * guidance; nothing here is a hunch. First match wins within each group.
 */
interface Tip {
  re?: RegExp;
  categories?: Category[];
  where?: StorageLocation[];
  text: string;
}

const COOKED = /\b(leftovers?|cooked|takeout|takeaway|soups?|stews?|curry|casserole|lasagn[ae]|rotisserie|pizza|fried rice|pulled pork)\b/;

const TIPS: Tip[] = [
  // Safety first
  { re: /\b(chicken|turkey|duck)\b/, categories: ['meat'], where: ['fridge'], text: 'Keep raw poultry sealed on the bottom shelf so juices cannot drip onto other food. Cook or freeze it within 1 to 2 days.' },
  { re: /\b(ground|mince|minced|patties|burger)\b/, categories: ['meat'], where: ['fridge'], text: 'Ground meat spoils faster than whole cuts: cook or freeze it within 1 to 2 days.' },
  { categories: ['meat'], where: ['fridge'], text: 'Store raw meat on the bottom shelf, in its packaging or a sealed container, away from ready-to-eat food.' },
  { categories: ['meat', 'seafood'], where: ['freezer'], text: 'Thaw it in the fridge (or in cold water, changed every 30 minutes), never on the counter.' },
  { categories: ['seafood'], where: ['fridge'], text: 'Keep fish and shellfish in the coldest part of the fridge and cook them within 1 to 2 days.' },
  { re: COOKED, where: ['fridge'], text: 'Chill leftovers within 2 hours of cooking and reheat them until steaming hot (165°F / 74°C).' },
  { re: /\beggs?\b/, where: ['pantry'], text: 'In the US, eggs are washed and must be kept in the fridge.' },
  { re: /\beggs?\b/, where: ['fridge'], text: 'Keep eggs in their carton on a shelf rather than in the door, where it is warmer.' },
  { re: /\b(sweet potato(es)?|yams?)\b/, text: 'Store sweet potatoes in a cool, dark cupboard, not the fridge: the cold hardens their core.' },
  { re: /\b(cream cheese|cottage cheese|ricotta|mascarpone|brie|camembert|goat cheese|feta|mozzarella|yogh?urt|sour cream)\b/, text: 'If you see mould on soft cheese or yogurt, throw it out: it can spread below the surface.' },
  { re: /\b(cheddar|parmesan|gouda|swiss|provolone|jack|manchego|gruy[eè]re|emmental|cheese)\b/, text: 'Mould on hard cheese can be cut away: remove at least 1 inch (2.5 cm) around it. Wrap the cheese in wax or baking paper so it can breathe.' },
  { categories: ['canned'], where: ['pantry'], text: 'Throw out cans that are bulging, leaking or badly dented.' },
  { categories: ['canned'], where: ['fridge'], text: 'Move what is left in an opened can into a covered container before refrigerating.' },
  // Keeping it fresh longer
  { re: /\bmilk\b/, where: ['fridge'], text: 'Keep milk on a shelf, not in the door, where it stays colder.' },
  { re: /\bbananas?\b/, text: 'Ripen bananas on the counter. Once ripe, the fridge slows them down: the skin darkens but the fruit stays good.' },
  { re: /\bavocados?\b/, text: 'Ripen avocados on the counter, then move them to the fridge to keep them a few more days.' },
  { re: /\btomato(es)?\b/, text: 'Whole tomatoes taste best kept at room temperature; refrigerate them once cut or very ripe.' },
  { re: /\bpotato(es)?\b/, text: 'Keep potatoes somewhere cool, dark and dry, and away from onions, which make them sprout.' },
  { re: /\b(onions?|shallots?)\b/, text: 'Keep whole onions in a cool, dry, airy place, away from potatoes.' },
  { re: /\bgarlic\b/, text: 'Keep whole garlic bulbs in a cool, dry, dark place; they last longest unbroken.' },
  { re: /\b(strawberr|raspberr|blackberr|blueberr|berries|cherr|grapes?)/, text: 'Wash berries and grapes only just before eating, and keep them dry in a breathable container.' },
  { re: /\b(lettuce|spinach|kale|arugula|rocket|salad|greens|chard)\b/, text: 'Store leafy greens dry, loosely wrapped in a paper towel, in the crisper drawer.' },
  { re: /\bbasil\b/, text: 'Keep basil at room temperature with its stems in water; the fridge turns the leaves black.' },
  { re: /\b(cilantro|coriander|parsley|dill|mint|herbs?)\b/, text: 'Stand soft herbs in a glass of water, loosely covered, in the fridge.' },
  { re: /\bmushrooms?\b/, text: 'Keep mushrooms in a paper bag rather than plastic so they do not turn slimy.' },
  { re: /\bapples?\b/, text: 'Apples give off a gas that ripens other produce faster; keep them in their own drawer.' },
  { re: /\b(carrots?|beets?|beetroot|radish(es)?|turnips?)\b/, text: 'Cut off leafy tops before storing; they draw moisture out of the roots.' },
  { re: /\b(bread|bagels?|buns?|rolls?|sourdough|baguettes?|loaf)\b/, where: ['fridge'], text: 'The fridge makes bread go stale faster. Freeze what you will not eat in a few days instead.' },
  { re: /\b(bread|bagels?|buns?|rolls?|sourdough|baguettes?|loaf)\b/, where: ['pantry'], text: 'Keep bread in a bread bag at room temperature, and freeze slices you will not get to in time.' },
];

/** Jars, cartons and bottles that need the fridge once opened. */
const CHILL_ONCE_OPENED =
  /\b(mayo|mayonnaise|dressing|jam|jelly|marmalade|preserves|pickles?|relish|olives|pesto|salsa|pasta sauce|marinara|bbq sauce|barbecue sauce|teriyaki|oyster sauce|hoisin|maple syrup|broth|stock|juice|lemonade|oat milk|almond milk|soy milk|coconut water|iced tea)\b/;

/** Up to two tips for this food where it is kept. */
export function storageTips(name: string, category: Category, location: StorageLocation): string[] {
  const lower = name.toLowerCase();
  const out: string[] = [];
  if (location === 'pantry' && CHILL_ONCE_OPENED.test(lower)) out.push('Once opened, keep it in the fridge.');
  for (const tip of TIPS) {
    if (out.length >= 2) break;
    if (tip.where && !tip.where.includes(location)) continue;
    if (tip.categories && !tip.categories.includes(category)) continue;
    if (tip.re && !tip.re.test(lower)) continue;
    if (!tip.re && !tip.categories) continue;
    out.push(tip.text);
  }
  if (location === 'freezer' && out.length < 2) {
    out.push(
      freezesWell(name, category)
        ? 'Frozen food stays safe at 0°F (-18°C); the date here is for best quality.'
        : 'This does not freeze well: the texture suffers once thawed. Use it from the fridge if you can.',
    );
  }
  if (out.length === 0 && location === 'fridge') out.push('Keep your fridge at 40°F (4°C) or colder.');
  return out.slice(0, 2);
}
