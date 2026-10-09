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
  // deco_zen_garden
  deco({ id: 'zen_garden', name: 'Zen Rock Garden', icon: '🪨', cosmetic: 'deco_zen_garden', description: 'Raked gravel, three weathered stones and a stone lantern. The quietest corner of the colony.', size: [2, 2], cost: { stone: 14, wood: 6 }, model: 'zen_garden', comfort: 2, solid: true }),
  deco({ id: 'bonsai_stand', name: 'Bonsai Stand', icon: '🌲', cosmetic: 'deco_zen_garden', description: 'A patient little pine on a cedar stand. The botanist has been shaping it since landing day.', size: [1, 1], cost: { wood: 6, fiber: 4 }, model: 'bonsai_stand', comfort: 1, entertainment: 1 }),
  // deco_harvest
  deco({ id: 'harvest_display', name: 'Harvest Display', icon: '🎃', cosmetic: 'deco_harvest', description: 'Heirloom pumpkins, hay bales and crates of the season\'s best produce, lit by a lantern on a hook.', size: [2, 2], cost: { fiber: 10, wood: 8 }, model: 'harvest_display', comfort: 2 }),
  deco({ id: 'hay_bales', name: 'Hay Bale Stack', icon: '🌾', cosmetic: 'deco_harvest', description: 'Sun-warm bales stacked by the fields, a pitchfork left leaning against them. Good for a sit-down.', size: [1, 1], cost: { fiber: 10 }, model: 'hay_bales', comfort: 1, entertainment: 1 }),
  // deco_lantern_festival
  deco({ id: 'lantern_arch', name: 'Lantern Arch', icon: '🏮', cosmetic: 'deco_lantern_festival', description: 'A lacquered timber gate hung with paper lanterns. Walking under it feels like festival night.', size: [2, 1], cost: { wood: 12, fiber: 6 }, model: 'lantern_arch', comfort: 2, solid: false }),
  deco({ id: 'lantern_string', name: 'Lantern String', icon: '🪔', cosmetic: 'deco_lantern_festival', description: 'Two posts and a sagging rope of paper lanterns that glow warm all night.', size: [2, 1], cost: { wood: 8, fiber: 4 }, model: 'lantern_string', comfort: 1 }),
  // deco_holo_trees
  deco({ id: 'holo_tree', name: 'Holo Tree', icon: '🌳', cosmetic: 'deco_holo_trees', description: 'A shimmering hologram of an Earth oak, projected from a riveted brass planter.', size: [1, 1], cost: { stone: 8, wood: 4 }, model: 'holo_tree', comfort: 2 }),
  // deco_campfire_lounge
  deco({ id: 'campfire_lounge', name: 'Campfire Lounge', icon: '🔥', cosmetic: 'deco_campfire_lounge', description: 'A stone fire pit, log benches, a kettle on the tripod and string lights overhead. Stories get told here.', size: [2, 2], cost: { wood: 14, stone: 8 }, model: 'campfire_lounge', comfort: 2, entertainment: 1 }),
  // deco_meteor_fountain
  deco({ id: 'meteor_fountain', name: 'Meteorite Fountain', icon: '☄️', cosmetic: 'deco_meteor_fountain', description: 'A stone basin round a meteorite that fell near the landing site. Its veins still glow faintly at night.', size: [2, 2], cost: { stone: 20, wood: 4 }, model: 'meteor_fountain', comfort: 3, entertainment: 1, solid: true }),
];
