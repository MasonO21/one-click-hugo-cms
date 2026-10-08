import type { BuildingDef } from './schema';

/**
 * Exclusive decor unlocked by `kind: 'decoration'` cosmetics (data/monetization.ts COSMETICS). Each
 * cosmetic unlocks one or two of these in Build › Decor (`BuildingDef.cosmetic`); until the colony
 * owns that cosmetic the card shows locked with a Wardrobe hint and placement is refused.
 *
 * Design promise: they are cosmetic first. Their comfort / entertainment is never better than the
 * free decor of the same tier (lantern, flower bed, log bench, herb garden), they cost a handful of
 * basic resources and they unlock nothing else, so owning them only makes the colony prettier.
 */
function deco(def: Pick<BuildingDef, 'id' | 'name' | 'icon' | 'description' | 'size' | 'cost' | 'model' | 'cosmetic'> & Partial<BuildingDef>): BuildingDef {
  return { category: 'decor', unlockTier: 0, buildTime: 1.5, hp: 80, maxLevel: 1, solid: false, ...def };
}

export const COSMETIC_DECOR: BuildingDef[] = [
  // deco_gnome_garden
  deco({ id: 'garden_gnome', name: 'Garden Gnome', icon: '🧙', cosmetic: 'deco_gnome_garden', description: 'A rosy-cheeked gnome who guards the flower beds. Nobody has ever seen him move. Nobody.', size: [1, 1], cost: { wood: 6, stone: 6 }, model: 'gnome', comfort: 1, entertainment: 1 }),
  deco({ id: 'toadstool_ring', name: 'Toadstool Ring', icon: '🍄', cosmetic: 'deco_gnome_garden', description: 'A fairy ring of spotty toadstools. Colonists swear it hums on full moons.', size: [2, 2], cost: { fiber: 12, wood: 4 }, model: 'toadstool_ring', comfort: 2 }),
  // deco_pumpkin_patch
  deco({ id: 'pumpkin_patch', name: 'Pumpkin Patch', icon: '🎃', cosmetic: 'deco_pumpkin_patch', description: 'Plump orange pumpkins on curly vines. One of them is suspiciously large.', size: [2, 2], cost: { fiber: 10, wood: 6 }, model: 'pumpkin_patch', comfort: 2 }),
  deco({ id: 'hay_bale', name: 'Cozy Hay Bale', icon: '🌾', cosmetic: 'deco_pumpkin_patch', description: 'A sun-warm hay bale with a scarecrow hat on top. Prime napping real estate.', size: [1, 1], cost: { fiber: 10 }, model: 'hay_bale', comfort: 1, entertainment: 1 }),
  // deco_lantern_festival
  deco({ id: 'lantern_arch', name: 'Lantern Arch', icon: '🏮', cosmetic: 'deco_lantern_festival', description: 'A wooden arch hung with glowing paper lanterns. Walking under it feels like a festival.', size: [2, 1], cost: { wood: 12, fiber: 6 }, model: 'lantern_arch', comfort: 2, solid: false }),
  deco({ id: 'lantern_string', name: 'Lantern String', icon: '🪔', cosmetic: 'deco_lantern_festival', description: 'Two posts and a swoop of little lanterns that glow warm all night.', size: [2, 1], cost: { wood: 8, fiber: 4 }, model: 'lantern_string', comfort: 1 }),
  // deco_holo_trees
  deco({ id: 'holo_tree', name: 'Holo Tree', icon: '🌳', cosmetic: 'deco_holo_trees', description: 'A shimmering hologram of an Earth oak, projected from a little brass planter.', size: [1, 1], cost: { stone: 8, wood: 4 }, model: 'holo_tree', comfort: 2 }),
  // deco_teddy_picnic
  deco({ id: 'teddy_picnic', name: 'Teddy Picnic', icon: '🧸', cosmetic: 'deco_teddy_picnic', description: 'A checked blanket, a basket of snacks and a very large, very soft teddy bear.', size: [2, 2], cost: { fiber: 12, food: 6 }, model: 'teddy_picnic', comfort: 2, entertainment: 1 }),
  // deco_star_fountain
  deco({ id: 'star_fountain', name: 'Wishing Star Fountain', icon: '⛲', cosmetic: 'deco_star_fountain', description: 'A sparkling pool crowned with a golden star. Toss in a pebble and make a wish.', size: [2, 2], cost: { stone: 20, wood: 4 }, model: 'star_fountain', comfort: 3, entertainment: 1, solid: true }),
];
