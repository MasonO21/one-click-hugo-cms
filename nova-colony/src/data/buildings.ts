import type { BuildingDef } from './schema';

/**
 * Building catalogue for the full Wood -> Titanium journey (~150 defs).
 *
 * Structure pieces are tier-agnostic (material tier chosen per instance and upgradeable); facilities unlock by
 * colony tier + research. Rates are per minute at level 1. Design rules used below:
 *  - "Refinery of tier N+1's material unlocks in tier N" so every tier-up cost is reachable (smelter in Stone,
 *    alloy foundry + electronics in Steel, cell plant + nanoforge in Alloy, titanium drill/refinery in Nano).
 *  - Gatherers (workers.required:true) -> machines (required:false, +25%/worker) -> drones (fully automated).
 *  - Comfort/entertainment scale with the colony size expected at each tier (3 -> 50+ colonists).
 *  - Power consumers carry a negative `power` from Steel on; generation always out-scales a typical build-out.
 */

/** Defaults: 4s build, 200 hp, single level, solid. */
function d(
  def: Pick<BuildingDef, 'id' | 'name' | 'icon' | 'category' | 'description' | 'size' | 'unlockTier' | 'cost' | 'model'> & Partial<BuildingDef>,
): BuildingDef {
  return { buildTime: 4, hp: 200, maxLevel: 1, solid: true, ...def };
}

/** Level presets (maxLevel, levelCostMult, levelEffect). */
const PROD = { maxLevel: 5, levelCostMult: 1.8, levelEffect: 0.5 };
const STORE = { maxLevel: 5, levelCostMult: 1.8, levelEffect: 1 };
const HOME = { maxLevel: 3, levelCostMult: 2, levelEffect: 0.5 };
const GEN = { maxLevel: 3, levelCostMult: 1.8, levelEffect: 0.5 };
const GUN = { maxLevel: 5, levelCostMult: 1.8, levelEffect: 0.4 };
const LAB = { maxLevel: 3, levelCostMult: 2, levelEffect: 0.5 };

export const BUILDINGS: BuildingDef[] = [
  // ================================================================== core
  {
    id: 'command_center', name: 'Command Center', icon: '🛰️', category: 'utility', core: true,
    description: 'Your crashed escape pod — the heart of the colony. Upgrade it to advance your colony tier.',
    size: [3, 3], unlockTier: 0, cost: {}, buildTime: 0, hp: 1500, maxLevel: 1, solid: true, model: 'command_center',
    storage: { wood: 100, stone: 100, fiber: 50, food: 50, water: 50 }, research_rate: 1, housing: 1, maxCount: 1,
  },

  // ================================================================== structure pieces (tier-agnostic)
  { id: 'floor', name: 'Floor', icon: '⬜', category: 'structure', piece: 'floor', description: 'A floor tile. Enclose floors with walls to make a roofed room.', size: [1, 1], unlockTier: 0, cost: {}, costMult: 0.5, buildTime: 0.6, hp: 80, maxLevel: 1, solid: false, model: 'floor' },
  { id: 'wall', name: 'Wall', icon: '🧱', category: 'structure', piece: 'wall', description: 'Drag to build walls. Enclosed rooms get automatic roofs.', size: [1, 1], unlockTier: 0, cost: {}, costMult: 1, buildTime: 1, hp: 160, maxLevel: 1, solid: true, model: 'wall' },
  { id: 'door', name: 'Door', icon: '🚪', category: 'structure', piece: 'door', description: 'Colonists pass through. Aliens cannot.', size: [1, 1], unlockTier: 0, cost: {}, costMult: 1.2, buildTime: 1, hp: 140, maxLevel: 1, solid: false, model: 'door' },
  { id: 'window', name: 'Window', icon: '🪟', category: 'structure', piece: 'window', description: 'A wall with a view. Lets warm light out at night.', size: [1, 1], unlockTier: 0, cost: { fiber: 2 }, costMult: 1.1, buildTime: 1, hp: 120, maxLevel: 1, solid: true, model: 'window' },
  { id: 'fence', name: 'Fence', icon: '🪵', category: 'structure', piece: 'fence', description: 'A low fence to mark paths and farms.', size: [1, 1], unlockTier: 0, cost: {}, costMult: 0.4, buildTime: 0.5, hp: 60, maxLevel: 1, solid: true, model: 'fence' },
  { id: 'gate', name: 'Gate', icon: '⛩️', category: 'structure', piece: 'gate', description: 'A reinforced gate in your perimeter.', size: [1, 1], unlockTier: 1, cost: {}, costMult: 2, buildTime: 2, hp: 300, maxLevel: 1, solid: false, model: 'gate' },
  d({ id: 'platform', name: 'Raised Platform', icon: '🟫', category: 'structure', piece: 'platform', description: 'A sturdy raised deck. Stack them for lookouts and rooftop gardens.', size: [1, 1], unlockTier: 1, research: 'scaffolding', cost: {}, costMult: 0.8, buildTime: 0.8, hp: 120, solid: false, model: 'platform' }),
  d({ id: 'stairs', name: 'Stairs', icon: '🪜', category: 'structure', piece: 'stairs', description: 'A few steps up to a platform. Colonists love a good view.', size: [1, 1], unlockTier: 1, research: 'scaffolding', cost: {}, costMult: 1.2, buildTime: 1, hp: 120, solid: false, model: 'stairs' }),
  d({ id: 'pillar', name: 'Support Pillar', icon: '🏛️', category: 'structure', piece: 'pillar', description: 'A tall pillar that holds up big roofs and looks great doing it.', size: [1, 1], unlockTier: 1, research: 'scaffolding', cost: {}, costMult: 0.6, buildTime: 0.8, hp: 200, solid: true, model: 'pillar' }),
  d({ id: 'electric_door', name: 'Sliding Door', icon: '🚪', category: 'structure', piece: 'door', description: 'Whooshes open for colonists, stays shut for aliens. Very satisfying.', size: [1, 1], unlockTier: 3, research: 'steel_frames', cost: { copper: 4 }, costMult: 2, buildTime: 1.5, hp: 300, solid: false, model: 'door', power: -2 }),
  d({ id: 'reinforced_gate', name: 'Reinforced Gate', icon: '⛩️', category: 'structure', piece: 'gate', description: 'A massive perimeter gate on heavy hinges. Takes a beating.', size: [1, 1], unlockTier: 3, research: 'steel_frames', cost: {}, costMult: 3, buildTime: 2.5, hp: 700, solid: false, model: 'gate' }),
  d({ id: 'auto_gate', name: 'Automated Gate', icon: '🛂', category: 'structure', piece: 'gate', description: 'Opens itself for friendly faces and slams shut on trouble.', size: [1, 1], unlockTier: 4, research: 'alloy_architecture', cost: { electronics: 4 }, costMult: 3.5, buildTime: 3, hp: 1100, solid: false, model: 'gate', power: -4 }),
  d({ id: 'glass_wall', name: 'Crystal Glass Wall', icon: '🔷', category: 'structure', piece: 'window', description: 'A shimmering wall of crystal glass. See the stars, keep the aliens out.', size: [1, 1], unlockTier: 4, research: 'alloy_architecture', cost: { crystal: 2 }, costMult: 1.4, buildTime: 1.2, hp: 260, solid: true, model: 'window' }),
  d({ id: 'phase_door', name: 'Phase Door', icon: '🌀', category: 'structure', piece: 'door', description: 'A shimmering energy door that dissolves as you approach.', size: [1, 1], unlockTier: 6, research: 'titan_living', cost: { nano: 1 }, costMult: 2.5, buildTime: 1.5, hp: 900, solid: false, model: 'door', power: -3 }),

  // ================================================================== TIER 0 — Wood (the humble camp)
  d({
    id: 'shelter', name: 'Lean-to Shelter', icon: '⛺', category: 'housing', description: 'A cozy wooden shelter with two beds.',
    size: [2, 2], unlockTier: 0, cost: { wood: 50 }, buildTime: 4, hp: 200, ...HOME, levelCostMult: 2, model: 'bunkhouse',
    housing: 2, comfort: 1,
  }),
  d({
    id: 'campfire', name: 'Campfire', icon: '🔥', category: 'food', description: 'Warmth, light and roasted berries. Colonists love it.',
    size: [1, 1], unlockTier: 0, cost: { wood: 20, stone: 20 }, buildTime: 3, hp: 100, model: 'campfire',
    entertainment: 2, comfort: 1, produces: { food: 2 }, station: 'campfire',
  }),
  d({
    id: 'storage_crate', name: 'Storage Crate', icon: '📦', category: 'storage', description: 'Adds storage for basic resources.',
    size: [1, 1], unlockTier: 0, cost: { wood: 15 }, buildTime: 3, hp: 120, ...STORE, model: 'crate',
    storage: { wood: 150, stone: 150, fiber: 100, food: 100, water: 100 },
  }),
  d({
    id: 'berry_patch', name: 'Berry Patch', icon: '🫐', category: 'food', description: 'A small farm plot. Farmers make it grow faster.',
    size: [2, 2], unlockTier: 0, cost: { wood: 15, fiber: 10 }, buildTime: 4, hp: 80, ...PROD, levelCostMult: 1.7, solid: false, model: 'farm_plot',
    produces: { food: 3 }, workers: { slots: 1, job: 'farmer', required: false },
  }),
  d({
    id: 'rain_collector', name: 'Rain Collector', icon: '🌧️', category: 'water', description: 'Collects rainwater automatically.',
    size: [1, 1], unlockTier: 0, cost: { wood: 15, fiber: 5 }, buildTime: 3, hp: 80, ...PROD, levelCostMult: 1.7, model: 'rain_collector',
    produces: { water: 3 },
  }),
  d({
    id: 'workbench', name: 'Crafting Table', icon: '🪚', category: 'crafting', description: 'Craft tools, weapons and supplies.',
    size: [2, 1], unlockTier: 0, cost: { wood: 20, stone: 10 }, buildTime: 4, hp: 120, model: 'workbench',
    station: 'workbench', maxCount: 1,
  }),
  d({
    id: 'logging_camp', name: 'Logging Camp', icon: '🪓', category: 'production', description: 'A gatherer chops nearby trees for you, even while you are away.',
    size: [2, 2], unlockTier: 0, cost: { wood: 80, stone: 40 }, buildTime: 5, hp: 150, ...PROD, model: 'logging_camp',
    produces: { wood: 6, fiber: 2 }, workers: { slots: 2, job: 'gatherer', required: true },
  }),
  d({
    id: 'quarry', name: 'Stone Quarry', icon: '⛏️', category: 'production', description: 'A miner cuts stone from the ground.',
    size: [2, 2], unlockTier: 0, cost: { wood: 30 }, buildTime: 5, hp: 150, ...PROD, model: 'quarry',
    produces: { stone: 5 }, workers: { slots: 2, job: 'miner', required: true },
  }),
  d({
    id: 'research_desk', name: 'Research Desk', icon: '📓', category: 'research', description: 'Study the alien world. Scientists generate research points.',
    size: [1, 1], unlockTier: 0, cost: { wood: 25, stone: 15 }, buildTime: 4, hp: 100, ...LAB, model: 'research_desk',
    research_rate: 3, workers: { slots: 1, job: 'scientist', required: false },
  }),
  d({
    id: 'spin_wheel', name: 'Lucky Wheel', icon: '🎡', category: 'utility', description: 'A salvaged reward wheel. One free spin every day!',
    size: [1, 1], unlockTier: 0, cost: { wood: 10 }, buildTime: 2, hp: 100, maxCount: 1, model: 'spin_wheel', spinWheel: true, comfort: 1, entertainment: 1,
  }),
  d({ id: 'lamp_post', name: 'Lantern', icon: '🏮', category: 'decor', description: 'Warm light. Colonists find it comforting.', size: [1, 1], unlockTier: 0, cost: { wood: 5, fiber: 2 }, buildTime: 1, hp: 50, solid: false, model: 'lamp', comfort: 1 }),
  d({ id: 'flower_bed', name: 'Flower Bed', icon: '🌼', category: 'decor', description: 'Alien flowers in neat rows.', size: [1, 1], unlockTier: 0, cost: { fiber: 6 }, buildTime: 1, hp: 30, solid: false, model: 'plant', comfort: 1 }),
  d({ id: 'log_bench', name: 'Log Bench', icon: '🪑', category: 'decor', description: 'A bench carved from a single log. Perfect for watching the sunset.', size: [1, 1], unlockTier: 0, cost: { wood: 8 }, buildTime: 1.5, hp: 60, solid: false, model: 'bench', comfort: 1, entertainment: 1 }),

  // ---- tier 0 defense
  d({ id: 'barricade', name: 'Wooden Barricade', icon: '🚧', category: 'defense', description: 'Sharpened logs that slow aliens down.', size: [1, 1], unlockTier: 0, cost: { wood: 8 }, buildTime: 1.5, hp: 220, model: 'barricade' }),
  d({ id: 'spike_trap', name: 'Spike Trap', icon: '📌', category: 'defense', description: 'Hurts and slows aliens that walk over it.', size: [1, 1], unlockTier: 0, cost: { wood: 10, stone: 5 }, buildTime: 2, hp: 100, maxLevel: 3, levelCostMult: 1.8, levelEffect: 0.5, solid: false, model: 'spikes', trap: { dps: 8, slow: 0.3 } }),
  d({
    id: 'scrap_turret', name: 'Scrap Turret', icon: '🔫', category: 'defense', description: 'A hand-cranked turret built from pod scrap. Fires twice as fast when you stand next to it.',
    size: [1, 1], unlockTier: 0, cost: { wood: 80, stone: 60 }, buildTime: 5, hp: 250, ...GUN, model: 'turret_basic',
    turret: { range: 7, damage: 9, fireRate: 1.6, projectile: 'bullet', manual: true },
  }),

  // ================================================================== TIER 1 — Reinforced Wood (a real settlement)
  d({
    id: 'cabin', name: 'Timber Cabin', icon: '🏡', category: 'housing', description: 'A snug log cabin with four bunks and a tiny porch. Smells like pine.',
    size: [3, 2], unlockTier: 1, research: 'scaffolding', cost: { wood: 70, fiber: 25 }, buildTime: 6, hp: 320, ...HOME, model: 'bunkhouse',
    housing: 4, comfort: 2,
  }),
  d({
    id: 'storage_shed', name: 'Storage Shed', icon: '🛖', category: 'storage', description: 'A proper shed with shelves. Holds three times what a crate does.',
    size: [2, 2], unlockTier: 1, cost: { wood: 60, fiber: 20 }, buildTime: 5, hp: 260, maxLevel: 4, levelCostMult: 1.8, levelEffect: 1, model: 'warehouse',
    storage: { wood: 450, stone: 450, fiber: 300, food: 250, water: 250 },
  }),
  d({
    id: 'water_tank', name: 'Water Tank', icon: '🛢️', category: 'storage', description: 'A big wooden cistern. Never run dry between rainstorms again.',
    size: [2, 2], unlockTier: 1, research: 'water_storage', cost: { wood: 50, fiber: 30 }, buildTime: 5, hp: 220, ...STORE, maxLevel: 4, model: 'tank',
    storage: { water: 800 },
  }),
  d({
    id: 'larder', name: 'Larder', icon: '🧺', category: 'storage', description: 'Cool shelves for berries, roots and jerky. Keeps the pantry full.',
    size: [2, 2], unlockTier: 1, research: 'crop_rotation', cost: { wood: 50, fiber: 20 }, buildTime: 5, hp: 220, ...STORE, maxLevel: 4, model: 'food_storage',
    storage: { food: 650 },
  }),
  d({
    id: 'veggie_farm', name: 'Veggie Farm', icon: '🥕', category: 'food', description: 'Neat rows of carrots, squash and glow-beans. Farmers adore it.',
    size: [3, 2], unlockTier: 1, research: 'crop_rotation', cost: { wood: 40, fiber: 25 }, buildTime: 5, hp: 120, ...PROD, levelCostMult: 1.7, solid: false, model: 'farm_plot',
    produces: { food: 9 }, workers: { slots: 2, job: 'farmer', required: false },
  }),
  d({
    id: 'sawmill', name: 'Sawmill', icon: '🪚', category: 'production', description: 'A water-wheel saw that turns logs into planks at a satisfying whirr.',
    size: [3, 2], unlockTier: 1, research: 'logging_efficiency', cost: { wood: 60, stone: 30 }, buildTime: 6, hp: 260, ...PROD, model: 'logging_camp',
    produces: { wood: 16, fiber: 4 }, workers: { slots: 2, job: 'gatherer', required: true },
  }),
  d({
    id: 'garage', name: 'Garage', icon: '🚗', category: 'utility', description: 'Build and park vehicles here. Wheels make the whole planet feel smaller.',
    size: [3, 3], unlockTier: 1, research: 'engine_basics', cost: { wood: 120, stone: 60, fiber: 40 }, buildTime: 8, hp: 400, model: 'garage',
    station: 'garage', garage: true, maxCount: 2, workers: { slots: 1, job: 'mechanic', required: false },
  }),
  d({
    id: 'radio_tower', name: 'Radio Tower', icon: '📻', category: 'utility', description: 'Broadcasts a friendly hello across the stars. Opens the recruitment board and, from the Stone tier, sends expeditions out.',
    size: [2, 2], unlockTier: 1, research: 'radio_comms', cost: { wood: 80, stone: 40, fiber: 30 }, buildTime: 6, hp: 260, model: 'radio_tower',
    recruit: true, expeditions: true, maxCount: 1, comfort: 1,
  }),
  d({
    id: 'guard_tower', name: 'Guard Tower', icon: '🗼', category: 'defense', description: 'A lookout with a bow and a view. Station a guard for +50% damage.',
    size: [2, 2], unlockTier: 1, research: 'watchtowers', cost: { wood: 70, stone: 40 }, buildTime: 6, hp: 380, ...GUN, model: 'guard_tower',
    turret: { range: 9, damage: 14, fireRate: 1.5, projectile: 'arrow', mannedBy: 'guard' }, workers: { slots: 1, job: 'guard', required: false },
  }),
  d({
    id: 'log_trap', name: 'Swinging Log Trap', icon: '🪵', category: 'defense', description: 'A big log on a rope. Aliens walk in, the log walks out. Boing.',
    size: [1, 1], unlockTier: 1, research: 'watchtowers', cost: { wood: 30, fiber: 10 }, buildTime: 2.5, hp: 140, maxLevel: 3, levelCostMult: 1.8, levelEffect: 0.5, solid: false, model: 'spikes',
    trap: { dps: 16, slow: 0.4 },
  }),
  d({ id: 'herb_garden', name: 'Herb Spiral Garden', icon: '🌿', category: 'decor', description: 'A spiral of fragrant alien herbs. The whole camp smells lovely.', size: [2, 2], unlockTier: 1, research: 'community_spirit', cost: { fiber: 30, wood: 10 }, buildTime: 3, hp: 60, solid: false, model: 'garden', comfort: 3 }),
  d({ id: 'banner', name: 'Colony Banner', icon: '🚩', category: 'decor', description: 'Your colony colors, fluttering proudly in the alien breeze.', size: [1, 1], unlockTier: 1, research: 'community_spirit', cost: { fiber: 10, wood: 5 }, buildTime: 1.5, hp: 50, solid: false, model: 'banner', comfort: 2 }),

  // ================================================================== TIER 2 — Stone (the colony looks permanent)
  d({
    id: 'stone_lodge', name: 'Stone Lodge', icon: '🏠', category: 'housing', description: 'A thick-walled lodge with a hearth in every room. Six bedrooms of pure coziness.',
    size: [3, 3], unlockTier: 2, research: 'mason_trade', cost: { stone: 90, wood: 40 }, buildTime: 8, hp: 700, ...HOME, model: 'bunkhouse',
    housing: 6, comfort: 3,
  }),
  d({
    id: 'warehouse', name: 'Stone Warehouse', icon: '🏚️', category: 'storage', description: 'Cavernous and cool. Stores basics and raw ores by the cartload.',
    size: [3, 3], unlockTier: 2, research: 'mason_trade', cost: { stone: 120, wood: 60 }, buildTime: 8, hp: 700, ...STORE, maxLevel: 4, model: 'warehouse',
    storage: { wood: 1000, stone: 1000, fiber: 600, food: 600, water: 500, iron: 400, copper: 300, coal: 300 },
  }),
  d({
    id: 'ore_silo', name: 'Ore Silo', icon: '🏗️', category: 'storage', description: 'A tall stone silo for iron, copper and coal.',
    size: [2, 2], unlockTier: 2, research: 'basic_mining', cost: { stone: 90, iron: 20 }, buildTime: 6, hp: 600, ...STORE, maxLevel: 4, model: 'silo',
    storage: { iron: 1200, copper: 900, coal: 900, steel: 500 },
  }),
  d({
    id: 'greenhouse', name: 'Greenhouse', icon: '🌱', category: 'food', description: 'A sun-warmed glasshouse of leafy greens. Needs a little water, repays in feasts.',
    size: [3, 3], unlockTier: 2, research: 'greenhouse_design', cost: { stone: 60, wood: 50, fiber: 40 }, buildTime: 7, hp: 300, ...PROD, levelCostMult: 1.7, solid: false, model: 'greenhouse',
    produces: { food: 22 }, consumes: { water: 5 }, workers: { slots: 2, job: 'farmer', required: false },
  }),
  d({
    id: 'kitchen', name: 'Colony Kitchen', icon: '🍳', category: 'food', description: 'A real kitchen! Cooks turn raw food into hearty meals that stretch further.',
    size: [2, 2], unlockTier: 2, research: 'culinary_arts', cost: { stone: 60, wood: 40 }, buildTime: 6, hp: 360, ...PROD, levelCostMult: 1.7, model: 'kitchen',
    station: 'kitchen', consumes: { food: 12 }, produces: { food: 20 }, workers: { slots: 1, job: 'cook', required: true }, comfort: 2, entertainment: 1,
  }),
  d({
    id: 'water_pump', name: 'Water Pump', icon: '⛲', category: 'water', description: 'A wind-driven pump drawing clean water from deep underground.',
    size: [2, 2], unlockTier: 2, research: 'water_storage', cost: { stone: 50, wood: 40, iron: 10 }, buildTime: 5, hp: 260, ...PROD, model: 'water_pump',
    produces: { water: 18 }, workers: { slots: 1, job: 'water_tech', required: false },
  }),
  d({
    id: 'iron_mine', name: 'Iron Mine', icon: '⛏️', category: 'production', description: 'A timber-braced shaft into the red hills. Iron by the barrow.',
    size: [2, 2], unlockTier: 2, research: 'basic_mining', cost: { stone: 70, wood: 50 }, buildTime: 7, hp: 400, ...PROD, model: 'mine',
    produces: { iron: 7, stone: 2 }, workers: { slots: 2, job: 'miner', required: true },
  }),
  d({
    id: 'copper_mine', name: 'Copper Mine', icon: '🟠', category: 'production', description: 'Green-streaked rock hides bright copper. Miners whistle while they work.',
    size: [2, 2], unlockTier: 2, research: 'basic_mining', cost: { stone: 70, wood: 50 }, buildTime: 7, hp: 400, ...PROD, model: 'mine',
    produces: { copper: 5, stone: 1 }, workers: { slots: 2, job: 'miner', required: true },
  }),
  d({
    id: 'coal_mine', name: 'Coal Mine', icon: '⚫', category: 'production', description: 'Black gold for your furnaces. Hard hats recommended.',
    size: [2, 2], unlockTier: 2, research: 'basic_mining', cost: { stone: 70, wood: 50 }, buildTime: 7, hp: 400, ...PROD, model: 'mine',
    produces: { coal: 7 }, workers: { slots: 2, job: 'miner', required: true },
  }),
  d({
    id: 'smelter', name: 'Smelter', icon: '🏭', category: 'crafting', description: 'Roaring furnace that melts iron and coal into strong, shiny steel.',
    size: [2, 2], unlockTier: 2, research: 'basic_mining', cost: { stone: 100, iron: 40, coal: 20 }, buildTime: 8, hp: 500, ...PROD, model: 'smelter',
    consumes: { iron: 14, coal: 6 }, produces: { steel: 8 }, workers: { slots: 1, job: 'mechanic', required: true },
  }),
  d({
    id: 'forge', name: 'Forge', icon: '⚒️', category: 'crafting', description: 'Hammer, anvil and a very hot fire. Craft metal tools, armor and gear.',
    size: [2, 2], unlockTier: 2, research: 'workshop_tools', cost: { stone: 60, iron: 20, wood: 30 }, buildTime: 6, hp: 400, model: 'forge',
    station: 'forge', maxCount: 1,
  }),
  d({
    id: 'workshop', name: 'Workshop', icon: '🔨', category: 'crafting', description: 'Benches, vises and a thousand tiny drawers. Where machine parts are born.',
    size: [3, 2], unlockTier: 2, research: 'workshop_tools', cost: { stone: 80, wood: 60, iron: 30 }, buildTime: 7, hp: 400, model: 'workbench',
    station: 'workshop', maxCount: 1, comfort: 1,
  }),
  d({
    id: 'research_lab', name: 'Research Lab', icon: '🧪', category: 'research', description: 'Bubbling flasks and humming scanners. Scientists generate research points much faster here.',
    size: [3, 2], unlockTier: 2, research: 'laboratory_science', cost: { stone: 100, wood: 60, iron: 30 }, buildTime: 8, hp: 400, ...LAB, model: 'research_lab',
    research_rate: 14, workers: { slots: 2, job: 'scientist', required: false },
  }),
  d({
    id: 'med_bay', name: 'Medical Bay', icon: '🩺', category: 'utility', description: 'Clean cots and a friendly doctor. Colonists recover and feel safer.',
    size: [2, 2], unlockTier: 2, research: 'medicine', cost: { stone: 70, wood: 40, fiber: 40 }, buildTime: 6, hp: 400, model: 'med_bay',
    medical: 2, comfort: 1, station: 'med_bay', workers: { slots: 1, job: 'doctor', required: false },
  }),
  d({ id: 'fountain', name: 'Stone Fountain', icon: '⛲', category: 'decor', description: 'Gentle splashing makes the plaza feel like home.', size: [2, 2], unlockTier: 2, research: 'team_building', cost: { stone: 60 }, buildTime: 4, hp: 200, model: 'fountain', comfort: 6, entertainment: 2 }),
  d({ id: 'stone_statue', name: "Founder's Statue", icon: '🗿', category: 'decor', description: 'A noble statue of a very tired, very determined survivor.', size: [1, 1], unlockTier: 2, research: 'team_building', cost: { stone: 80 }, buildTime: 4, hp: 300, model: 'statue', comfort: 5 }),

  // ---- tier 2 defense
  d({ id: 'stone_barricade', name: 'Stone Barricade', icon: '🧱', category: 'defense', description: 'Heaped stone blocks that slow aliens to a crawl and shrug off hits.', size: [1, 1], unlockTier: 2, research: 'crossfire_doctrine', cost: { stone: 14, wood: 4 }, buildTime: 2, hp: 900, model: 'barricade' }),
  d({
    id: 'crossfire_tower', name: 'Crossfire Tower', icon: '🏹', category: 'defense', description: 'Twin crossbows with overlapping arcs. Nothing slips through.',
    size: [2, 2], unlockTier: 2, research: 'crossfire_doctrine', cost: { stone: 90, wood: 40, iron: 20 }, buildTime: 7, hp: 700, ...GUN, model: 'guard_tower',
    turret: { range: 11, damage: 24, fireRate: 2, projectile: 'bullet', mannedBy: 'guard' }, workers: { slots: 1, job: 'guard', required: false },
  }),
  d({
    id: 'sentry_gun', name: 'Sentry Gun', icon: '🤖', category: 'defense', description: 'Your first automatic turret. Tracks, aims and fires all by itself.',
    size: [1, 1], unlockTier: 2, research: 'crossfire_doctrine', cost: { stone: 40, iron: 40, coal: 10 }, buildTime: 5, hp: 450, ...GUN, model: 'turret_basic',
    turret: { range: 9, damage: 10, fireRate: 4, projectile: 'bullet' },
  }),

  // ================================================================== TIER 3 — Steel (industry arrives)
  // ---- power
  d({
    id: 'fuel_generator', name: 'Fuel Generator', icon: '⚡', category: 'power', description: 'Burns coal for steady, rumbling power. The sound of progress.',
    size: [2, 2], unlockTier: 3, research: 'basic_circuits', cost: { steel: 30, iron: 40, copper: 20 }, buildTime: 7, hp: 500, ...GEN, model: 'fuel_generator',
    power: 60, consumes: { coal: 5 }, workers: { slots: 1, job: 'electrician', required: false },
  }),
  d({
    id: 'wind_turbine', name: 'Wind Turbine', icon: '🌬️', category: 'power', description: 'Big graceful blades turning for free power. Quietly lovely.',
    size: [1, 1], unlockTier: 3, research: 'basic_circuits', cost: { steel: 25, copper: 20 }, buildTime: 6, hp: 300, ...GEN, model: 'wind_turbine',
    power: 24, comfort: 1,
  }),
  d({
    id: 'solar_panel', name: 'Solar Panel', icon: '☀️', category: 'power', description: 'Soaks up the alien sun. Cheap, clean and sparkly.',
    size: [2, 2], unlockTier: 3, research: 'basic_circuits', cost: { steel: 20, copper: 15, stone: 10 }, buildTime: 5, hp: 260, ...GEN, model: 'solar_panel',
    power: 20,
  }),
  d({
    id: 'battery_bank', name: 'Battery Bank', icon: '🔋', category: 'power', description: 'Stores sunshine for the night shift and smooths out the grid.',
    size: [1, 1], unlockTier: 3, research: 'basic_circuits', cost: { steel: 15, copper: 12 }, buildTime: 4, hp: 260, ...GEN, model: 'battery',
    power: 5,
  }),
  d({ id: 'power_pylon', name: 'Power Pylon', icon: '🗼', category: 'power', description: 'Tall lattice pylon carrying glowing cables across the colony.', size: [1, 1], unlockTier: 3, research: 'basic_circuits', cost: { steel: 6, copper: 6 }, buildTime: 2, hp: 180, model: 'power_pylon', comfort: 1 }),
  // ---- housing & storage
  d({
    id: 'steel_dorm', name: 'Steel Dormitory', icon: '🏢', category: 'housing', description: 'Clean, bright bunk rooms with real mattresses. Ten beds, zero drafts.',
    size: [3, 3], unlockTier: 3, research: 'steel_frames', cost: { steel: 60, stone: 80, copper: 20 }, buildTime: 9, hp: 1200, ...HOME, model: 'bunkhouse',
    housing: 10, comfort: 6,
  }),
  d({
    id: 'steel_vault', name: 'Steel Vault', icon: '🏦', category: 'storage', description: 'Armored shelves for metals and circuits. Strong enough to keep a secret.',
    size: [3, 3], unlockTier: 3, research: 'steel_frames', cost: { steel: 70, stone: 60, copper: 30 }, buildTime: 9, hp: 1500, ...STORE, maxLevel: 4, model: 'warehouse',
    storage: { iron: 1500, copper: 1200, coal: 1200, steel: 1500, electronics: 800, biomass: 300, crystal: 600, alloy: 400 },
  }),
  d({
    id: 'bulk_silo', name: 'Bulk Silo', icon: '🗄️', category: 'storage', description: 'A towering grain-and-gravel silo. Holds enormous heaps of the basics.',
    size: [2, 2], unlockTier: 3, research: 'steel_frames', cost: { steel: 40, stone: 100 }, buildTime: 7, hp: 1000, ...STORE, maxLevel: 4, model: 'silo',
    storage: { wood: 3000, stone: 3000, fiber: 2000 },
  }),
  // ---- food & water
  d({
    id: 'hydroponics', name: 'Hydroponics Bay', icon: '🥬', category: 'food', description: 'Racks of leafy crops glowing under purple light. Efficient and strangely relaxing.',
    size: [3, 3], unlockTier: 3, research: 'hydroponics_tech', cost: { steel: 40, copper: 20, stone: 40 }, buildTime: 8, hp: 500, ...PROD, levelCostMult: 1.7, solid: false, model: 'hydroponics',
    produces: { food: 48 }, consumes: { water: 9 }, power: -8, workers: { slots: 2, job: 'farmer', required: false },
  }),
  d({
    id: 'purifier', name: 'Water Purifier', icon: '🚰', category: 'water', description: 'Filters the strangest swamp-water into crisp, clean drinking water.',
    size: [2, 2], unlockTier: 3, research: 'filtration', cost: { steel: 35, copper: 20, stone: 20 }, buildTime: 6, hp: 450, ...PROD, model: 'purifier',
    produces: { water: 42 }, power: -8, workers: { slots: 1, job: 'water_tech', required: false },
  }),
  d({
    id: 'bio_digester', name: 'Bio Digester', icon: '🫧', category: 'production', description: 'Composts surplus food into glowing biomass for advanced fabrication.',
    size: [2, 2], unlockTier: 3, research: 'hydroponics_tech', cost: { steel: 30, copper: 15, stone: 30 }, buildTime: 6, hp: 380, ...PROD, model: 'tank',
    consumes: { food: 20, water: 8 }, produces: { biomass: 5 }, power: -6, workers: { slots: 1, job: 'farmer', required: false },
  }),
  // ---- production
  d({
    id: 'auto_harvester', name: 'Automated Harvester', icon: '🚜', category: 'production', description: 'A rolling timber-bot that fells, trims and stacks on its own.',
    size: [3, 3], unlockTier: 3, research: 'electric_drilling', cost: { steel: 50, iron: 40, copper: 20 }, buildTime: 8, hp: 600, ...PROD, model: 'harvester',
    produces: { wood: 52, fiber: 18 }, power: -10, workers: { slots: 1, job: 'gatherer', required: false },
  }),
  d({
    id: 'electric_drill', name: 'Electric Drill Rig', icon: '🔩', category: 'production', description: 'A tireless drill that chews rock and spits out ore. Add a miner for a bonus.',
    size: [2, 2], unlockTier: 3, research: 'electric_drilling', cost: { steel: 45, iron: 30, copper: 25 }, buildTime: 8, hp: 600, ...PROD, model: 'drill',
    produces: { iron: 16, copper: 9, coal: 10, stone: 14 }, power: -14, workers: { slots: 1, job: 'miner', required: false },
  }),
  d({
    id: 'crystal_extractor', name: 'Crystal Extractor', icon: '💎', category: 'production', description: 'Coaxes humming crystals from the rock with resonant pulses.',
    size: [2, 2], unlockTier: 3, research: 'alloy_smelting', cost: { steel: 50, copper: 30, stone: 30 }, buildTime: 8, hp: 500, ...PROD, model: 'drill',
    produces: { crystal: 3 }, power: -12, workers: { slots: 1, job: 'miner', required: false },
  }),
  // ---- refineries & factories
  d({
    id: 'electronics_lab', name: 'Electronics Lab', icon: '🔌', category: 'crafting', description: 'Presses copper and fiber into circuit boards by the hundred.',
    size: [2, 2], unlockTier: 3, research: 'circuitry', cost: { steel: 40, copper: 40, stone: 30 }, buildTime: 7, hp: 450, ...PROD, model: 'electronics_lab',
    consumes: { copper: 8, fiber: 4 }, produces: { electronics: 4 }, power: -10, workers: { slots: 1, job: 'mechanic', required: false },
  }),
  d({
    id: 'alloy_foundry', name: 'Alloy Foundry', icon: '🛡️', category: 'crafting', description: 'Folds crystal dust into molten steel. Out comes light, dazzling alloy.',
    size: [3, 3], unlockTier: 3, research: 'alloy_smelting', cost: { steel: 80, copper: 40, stone: 60 }, buildTime: 9, hp: 700, ...PROD, model: 'forge',
    consumes: { steel: 8, crystal: 5 }, produces: { alloy: 5 }, power: -20, workers: { slots: 1, job: 'mechanic', required: false },
  }),
  d({
    id: 'factory', name: 'Assembly Factory', icon: '🏭', category: 'crafting', description: 'Pick a recipe and watch the conveyors go. Parts and gear made automatically.',
    size: [3, 3], unlockTier: 3, research: 'assembly_lines', cost: { steel: 100, copper: 50, iron: 60 }, buildTime: 10, hp: 900, ...PROD, maxLevel: 3, model: 'factory',
    factory: 'workshop', power: -24, workers: { slots: 2, job: 'mechanic', required: false },
  }),
  d({
    id: 'repair_bay', name: 'Repair Bay', icon: '🔧', category: 'utility', description: 'Engineers patch up scratched walls and dented turrets nearby.',
    size: [2, 2], unlockTier: 3, research: 'circuitry', cost: { steel: 40, copper: 20, stone: 20 }, buildTime: 6, hp: 500, ...LAB, model: 'repair_bay',
    repair: 6, power: -6, workers: { slots: 1, job: 'engineer', required: false },
  }),
  d({
    id: 'clinic', name: 'Colony Clinic', icon: '🏥', category: 'utility', description: 'A bright, quiet clinic with real medical equipment and a calming fish tank.',
    size: [3, 3], unlockTier: 3, research: 'medicine', cost: { steel: 60, stone: 60, electronics: 15 }, buildTime: 9, hp: 800, ...LAB, model: 'medical_center',
    medical: 4, comfort: 3, station: 'med_bay', power: -8, workers: { slots: 2, job: 'doctor', required: false },
  }),
  // ---- research & comfort
  d({
    id: 'observatory', name: 'Stargazer Dome', icon: '🔭', category: 'research', description: 'A rooftop telescope under a brilliant alien sky. Science and romance.',
    size: [2, 2], unlockTier: 3, research: 'recreation', cost: { steel: 40, stone: 50, copper: 20 }, buildTime: 8, hp: 450, ...LAB, model: 'research_lab',
    research_rate: 22, entertainment: 6, comfort: 3, power: -6, workers: { slots: 1, job: 'scientist', required: false },
  }),
  d({ id: 'arcade', name: 'Arcade Cabinet Hall', icon: '🕹️', category: 'decor', description: 'Blinking cabinets salvaged from the colony ship. High scores are taken very seriously.', size: [2, 2], unlockTier: 3, research: 'recreation', cost: { steel: 30, copper: 25, stone: 20 }, buildTime: 6, hp: 300, model: 'arcade', entertainment: 14, power: -4 }),

  // ---- tier 3 defense
  d({
    id: 'mg_turret', name: 'Machine-Gun Turret', icon: '🔫', category: 'defense', description: 'Rat-a-tat-tat! A swivel-mounted machine gun that also chases down flyers.',
    size: [1, 1], unlockTier: 3, research: 'machine_guns', cost: { steel: 40, iron: 30, coal: 10 }, buildTime: 6, hp: 650, ...GUN, model: 'turret_mg',
    turret: { range: 11, damage: 16, fireRate: 8, projectile: 'bullet', antiAir: true, mannedBy: 'guard' }, workers: { slots: 1, job: 'guard', required: false },
  }),
  d({
    id: 'electric_fence', name: 'Electric Fence', icon: '⚡', category: 'defense', description: 'A crackling blue fence. Aliens that touch it get a shocking surprise.',
    size: [1, 1], unlockTier: 3, research: 'electric_fencing', cost: { steel: 8, copper: 6 }, buildTime: 2, hp: 400, maxLevel: 3, levelCostMult: 1.8, levelEffect: 0.5, model: 'electric_fence',
    trap: { dps: 38, slow: 0.5 }, power: -2,
  }),
  d({
    id: 'flamethrower', name: 'Flamethrower Turret', icon: '🔥', category: 'defense', description: 'A short-range roaring jet of flame. Fantastic against crowds.',
    size: [1, 1], unlockTier: 3, research: 'electric_fencing', cost: { steel: 50, coal: 40, iron: 20 }, buildTime: 6, hp: 650, ...GUN, model: 'turret_flame',
    turret: { range: 5, damage: 8, fireRate: 10, projectile: 'flame', splash: 1.2 },
  }),

  // ================================================================== TIER 4 — Advanced Alloy (automation takes over)
  d({
    id: 'geothermal_plant', name: 'Geothermal Plant', icon: '🌋', category: 'power', description: 'Taps the planet’s own warmth for huge, silent, steady power.',
    size: [2, 2], unlockTier: 4, research: 'geothermal_tech', cost: { alloy: 40, steel: 100, copper: 60 }, buildTime: 10, hp: 900, ...GEN, model: 'geothermal',
    power: 210, workers: { slots: 1, job: 'electrician', required: false },
  }),
  d({
    id: 'solar_array', name: 'Solar Array', icon: '🌞', category: 'power', description: 'A field of tracking mirrors that follow the sun like sunflowers.',
    size: [3, 3], unlockTier: 4, research: 'geothermal_tech', cost: { alloy: 30, electronics: 30, steel: 60 }, buildTime: 8, hp: 600, ...GEN, model: 'solar_panel',
    power: 100,
  }),
  d({
    id: 'mining_rig', name: 'Automated Mining Rig', icon: '🛠️', category: 'production', description: 'A towering robotic rig that mines iron, copper, coal and crystal around the clock.',
    size: [3, 3], unlockTier: 4, research: 'automated_mining', cost: { alloy: 40, steel: 120, electronics: 30 }, buildTime: 12, hp: 1200, ...PROD, model: 'drill',
    produces: { iron: 46, copper: 26, coal: 30, stone: 44, crystal: 4 }, power: -45, workers: { slots: 2, job: 'miner', required: false },
  }),
  d({
    id: 'robot_bay', name: 'Robot Assembly Bay', icon: '🤖', category: 'production', description: 'Cheerful hauler-bots roll out to gather wood, stone and fiber. Beep boop.',
    size: [3, 3], unlockTier: 4, research: 'field_robotics', cost: { alloy: 35, steel: 90, electronics: 25 }, buildTime: 10, hp: 900, ...PROD, model: 'robot_bay',
    produces: { wood: 90, stone: 90, fiber: 45 }, power: -18, workers: { slots: 2, job: 'drone_tech', required: false },
  }),
  d({
    id: 'fabricator', name: 'Fabricator Bench', icon: '🧰', category: 'crafting', description: 'Precision tooling for alloy gear, robotic cores and drones.',
    size: [3, 2], unlockTier: 4, research: 'mass_production', cost: { alloy: 30, steel: 80, electronics: 20 }, buildTime: 9, hp: 700, model: 'workbench',
    station: 'fabricator', maxCount: 1, power: -8,
  }),
  d({
    id: 'large_factory', name: 'Large Factory', icon: '🏭', category: 'crafting', description: 'A cathedral of conveyors, arms and sparks. Fully automated cores and gear.',
    size: [4, 3], unlockTier: 4, research: 'mass_production', cost: { alloy: 60, steel: 160, electronics: 40 }, buildTime: 12, hp: 1400, ...PROD, maxLevel: 3, model: 'factory',
    factory: 'fabricator', power: -60, workers: { slots: 3, job: 'mechanic', required: false },
  }),
  d({
    id: 'cell_plant', name: 'Energy Cell Plant', icon: '🔋', category: 'crafting', description: 'Compresses crystal energy into portable cells that power everything advanced.',
    size: [3, 2], unlockTier: 4, research: 'energy_cells', cost: { alloy: 40, steel: 90, electronics: 25 }, buildTime: 9, hp: 700, ...PROD, model: 'electronics_lab',
    consumes: { crystal: 8, copper: 10 }, produces: { energy_cell: 4 }, power: -25, workers: { slots: 1, job: 'mechanic', required: false },
  }),
  d({
    id: 'nanoforge', name: 'Nanoforge', icon: '✨', category: 'crafting', description: 'Swarms of microscopic builders assemble nano-material atom by atom.',
    size: [3, 3], unlockTier: 4, research: 'nano_assembly', cost: { alloy: 60, steel: 100, electronics: 50, crystal: 20 }, buildTime: 12, hp: 900, ...PROD, model: 'nanoforge',
    station: 'nano', consumes: { alloy: 8, biomass: 6 }, produces: { nano: 2 }, power: -40, workers: { slots: 1, job: 'drone_tech', required: false },
  }),
  d({
    id: 'auto_farm', name: 'Automated Farm', icon: '🌾', category: 'food', description: 'Seeders, sprinklers and harvesters working in perfect rhythm. Food, food, food.',
    size: [4, 3], unlockTier: 4, research: 'farm_automation', cost: { alloy: 30, steel: 80, electronics: 20 }, buildTime: 9, hp: 700, ...PROD, levelCostMult: 1.7, solid: false, model: 'hydroponics',
    produces: { food: 120 }, consumes: { water: 20 }, power: -24, workers: { slots: 2, job: 'farmer', required: false },
  }),
  d({
    id: 'industrial_purifier', name: 'Industrial Purifier', icon: '💦', category: 'water', description: 'Massive filtration towers delivering a river of crystal-clear water.',
    size: [3, 3], unlockTier: 4, research: 'industrial_filtration', cost: { alloy: 25, steel: 80, electronics: 15 }, buildTime: 8, hp: 800, ...PROD, model: 'industrial_purifier',
    produces: { water: 110 }, power: -25, workers: { slots: 1, job: 'water_tech', required: false },
  }),
  d({
    id: 'hangar', name: 'Vehicle Hangar', icon: '🛩️', category: 'utility', description: 'A high-bay hangar with a launch pad. Build hover bikes and armored rovers.',
    size: [4, 4], unlockTier: 4, research: 'hover_tech', cost: { alloy: 50, steel: 140, electronics: 30 }, buildTime: 12, hp: 1400, model: 'hangar',
    station: 'hangar', garage: true, maxCount: 1, power: -10, workers: { slots: 1, job: 'mechanic', required: false },
  }),
  d({
    id: 'advanced_lab', name: 'Advanced Research Lab', icon: '🔬', category: 'research', description: 'Holographic whiteboards and mind-bending instruments. Research rate soars.',
    size: [3, 3], unlockTier: 4, research: 'advanced_science', cost: { alloy: 40, steel: 100, electronics: 40 }, buildTime: 10, hp: 900, ...LAB, model: 'advanced_lab',
    research_rate: 48, power: -20, workers: { slots: 3, job: 'scientist', required: false },
  }),
  d({
    id: 'crystal_vault', name: 'Crystal Vault', icon: '🔮', category: 'storage', description: 'A glittering vault for crystals, alloys and energy cells.',
    size: [3, 3], unlockTier: 4, research: 'alloy_architecture', cost: { alloy: 40, steel: 100, electronics: 20 }, buildTime: 9, hp: 1800, ...STORE, maxLevel: 4, model: 'warehouse',
    storage: { crystal: 1000, alloy: 1600, energy_cell: 800, electronics: 1000, steel: 1500, biomass: 500, nano: 400 },
  }),
  d({
    id: 'mega_warehouse', name: 'Mega Warehouse', icon: '🏬', category: 'storage', description: 'Football-field shelving with robot forklifts. Holds absolutely everything basic.',
    size: [4, 4], unlockTier: 4, research: 'alloy_architecture', cost: { alloy: 50, steel: 160, stone: 120 }, buildTime: 12, hp: 2200, ...STORE, maxLevel: 4, model: 'warehouse',
    storage: { wood: 6000, stone: 6000, fiber: 4000, food: 4000, water: 4000, iron: 3500, copper: 3000, coal: 3000 },
  }),
  d({
    id: 'logistics_depot', name: 'Logistics Depot', icon: '📦', category: 'storage', description: 'Sorting robots, conveyor loops and big storage. Logistics workers keep it humming.',
    size: [3, 3], unlockTier: 4, research: 'automated_logistics', cost: { alloy: 45, steel: 120, electronics: 35 }, buildTime: 10, hp: 1300, ...STORE, maxLevel: 4, model: 'warehouse',
    storage: { wood: 3000, stone: 3000, fiber: 2000, iron: 2000, copper: 1500, steel: 1500, electronics: 700 }, power: -15, workers: { slots: 3, job: 'logistics', required: false },
  }),
  d({
    id: 'alloy_habitat', name: 'Alloy Habitat', icon: '🏙️', category: 'housing', description: 'Sleek habitat towers with skylights and tiny balconies. Sixteen beds, great views.',
    size: [3, 3], unlockTier: 4, research: 'alloy_architecture', cost: { alloy: 45, steel: 80, stone: 60 }, buildTime: 11, hp: 1800, ...HOME, model: 'habitat',
    housing: 16, comfort: 10, power: -6,
  }),
  d({ id: 'cinema_pod', name: 'Holo Cinema Pod', icon: '🎬', category: 'decor', description: 'Cuddle up for a holographic blockbuster under a canopy of stars.', size: [3, 3], unlockTier: 4, research: 'recreation', cost: { alloy: 30, steel: 60, electronics: 30 }, buildTime: 9, hp: 500, model: 'arcade', entertainment: 30, comfort: 4, power: -10 }),
  d({ id: 'sculpture_garden', name: 'Sculpture Garden', icon: '🎨', category: 'decor', description: 'Shimmering crystal sculptures among glowing ferns. A cozy place to think.', size: [3, 3], unlockTier: 4, research: 'recreation', cost: { alloy: 20, crystal: 12, stone: 60 }, buildTime: 8, hp: 300, solid: false, model: 'garden', comfort: 22 }),

  // ---- tier 4 defense
  d({
    id: 'missile_turret', name: 'Missile Turret', icon: '🚀', category: 'defense', description: 'Whoosh-boom! Homing missiles that scatter whole packs of aliens.',
    size: [2, 2], unlockTier: 4, research: 'heavy_ordnance', cost: { alloy: 30, steel: 80, electronics: 20 }, buildTime: 8, hp: 900, ...GUN, model: 'turret_missile',
    turret: { range: 13, damage: 80, fireRate: 0.9, projectile: 'missile', splash: 2.5, antiAir: true },
  }),
  d({
    id: 'heavy_sentry', name: 'Heavy Sentry', icon: '🛡️', category: 'defense', description: 'Twin barrels, thick plating and absolutely no chill.',
    size: [2, 2], unlockTier: 4, research: 'heavy_ordnance', cost: { alloy: 35, steel: 100, electronics: 15 }, buildTime: 8, hp: 1600, ...GUN, model: 'turret_heavy',
    turret: { range: 11, damage: 32, fireRate: 6, projectile: 'bullet', antiAir: true, mannedBy: 'guard' }, workers: { slots: 1, job: 'guard', required: false },
  }),
  d({
    id: 'cannon_turret', name: 'Heavy Cannon', icon: '💥', category: 'defense', description: 'One big boom, many small aliens. Ground targets only, very satisfying.',
    size: [2, 2], unlockTier: 4, research: 'heavy_ordnance', cost: { alloy: 40, steel: 120, stone: 40 }, buildTime: 9, hp: 1400, ...GUN, model: 'turret_cannon',
    turret: { range: 14, damage: 190, fireRate: 0.5, projectile: 'cannon', splash: 2 },
  }),
  d({
    id: 'aa_gun', name: 'Anti-Air Gun', icon: '🎯', category: 'defense', description: 'Flak-spitting skyward gun. Flyers drop out of the sky like confetti.',
    size: [1, 1], unlockTier: 4, research: 'anti_air', cost: { alloy: 20, steel: 60, electronics: 10 }, buildTime: 6, hp: 700, ...GUN, model: 'turret_aa',
    turret: { range: 15, damage: 28, fireRate: 5, projectile: 'bullet', antiAir: true, airOnly: true },
  }),
  d({
    id: 'shield_generator', name: 'Shield Generator', icon: '🔰', category: 'defense', description: 'A shimmering blue dome that soaks up damage and recharges between waves.',
    size: [2, 2], unlockTier: 4, research: 'shield_tech', cost: { alloy: 60, electronics: 40, crystal: 20, steel: 60 }, buildTime: 10, hp: 900, ...GEN, model: 'shield_generator',
    shield: { radius: 8, capacity: 900, regen: 25 }, power: -30,
  }),

  // ================================================================== TIER 5 — Nano-Tech (the future is here)
  d({
    id: 'fusion_reactor', name: 'Fusion Reactor', icon: '☢️', category: 'power', description: 'A tiny captive star in a magnetic bottle. Sips crystals, pours out power.',
    size: [3, 3], unlockTier: 5, research: 'fusion_theory', cost: { alloy: 120, nano: 20, electronics: 120, steel: 200 }, buildTime: 14, hp: 1800, ...GEN, model: 'fusion_reactor',
    power: 800, consumes: { crystal: 2 }, workers: { slots: 1, job: 'electrician', required: false },
  }),
  d({
    id: 'drone_hub', name: 'Drone Hub', icon: '🛸', category: 'production', description: 'Swarms of little harvester drones swoop out for wood, stone and fiber. Fully automated.',
    size: [3, 3], unlockTier: 5, research: 'drone_workers', cost: { alloy: 90, nano: 12, electronics: 60 }, buildTime: 12, hp: 1100, ...PROD, model: 'drone_hub',
    produces: { wood: 200, stone: 200, fiber: 100 }, power: -40, workers: { slots: 2, job: 'drone_tech', required: false },
  }),
  d({
    id: 'mining_drone_hub', name: 'Mining Drone Hub', icon: '🛰️', category: 'production', description: 'Burrowing drones carry ore from deep seams. The ground practically hums.',
    size: [3, 3], unlockTier: 5, research: 'drone_workers', cost: { alloy: 110, nano: 16, electronics: 70 }, buildTime: 12, hp: 1300, ...PROD, model: 'drone_hub',
    produces: { iron: 110, copper: 60, coal: 70, crystal: 8 }, power: -60, workers: { slots: 2, job: 'drone_tech', required: false },
  }),
  d({
    id: 'matter_processor', name: 'Matter Processor', icon: '⚗️', category: 'production', description: 'Rearranges rubble and weeds into useful ore. Physics shrugs.',
    size: [3, 3], unlockTier: 5, research: 'matter_conversion', cost: { alloy: 100, nano: 15, electronics: 80 }, buildTime: 12, hp: 1100, ...PROD, model: 'matter_processor',
    consumes: { stone: 100, fiber: 50 }, produces: { iron: 36, copper: 24, coal: 24 }, power: -70, workers: { slots: 1, job: 'drone_tech', required: false },
  }),
  d({
    id: 'titanium_drill', name: 'Titanium Drill', icon: '🌟', category: 'production', description: 'A diamond-tipped monster that bites into the Highlands for raw titanium.',
    size: [3, 3], unlockTier: 5, research: 'titanium_extraction', cost: { alloy: 90, nano: 12, electronics: 60, steel: 120 }, buildTime: 12, hp: 1400, ...PROD, model: 'drill',
    produces: { titanium: 2 }, power: -55, workers: { slots: 1, job: 'miner', required: false },
  }),
  d({
    id: 'titanium_refinery', name: 'Titanium Refinery', icon: '🏭', category: 'crafting', description: 'Smelts steel and crystal under unthinkable pressure into brilliant titanium.',
    size: [3, 3], unlockTier: 5, research: 'titanium_extraction', cost: { alloy: 120, nano: 20, electronics: 80, steel: 160 }, buildTime: 14, hp: 1500, ...PROD, model: 'smelter',
    consumes: { steel: 28, crystal: 8, energy_cell: 3 }, produces: { titanium: 8 }, power: -80, workers: { slots: 1, job: 'mechanic', required: false },
  }),
  d({
    id: 'nano_factory', name: 'Nano Factory', icon: '🏭', category: 'crafting', description: 'Self-assembling nano-lines that print gear and cores while you sleep.',
    size: [4, 3], unlockTier: 5, research: 'drone_workers', cost: { alloy: 110, nano: 25, electronics: 90, steel: 150 }, buildTime: 14, hp: 1800, ...PROD, maxLevel: 3, model: 'factory',
    factory: 'nano', power: -90, workers: { slots: 3, job: 'mechanic', required: false },
  }),
  d({
    id: 'teleporter', name: 'Teleporter Pad', icon: '🌀', category: 'utility', description: 'Step on the pad and appear anywhere you have a pad. No more long walks.',
    size: [2, 2], unlockTier: 5, research: 'teleportation', cost: { alloy: 80, nano: 20, energy_cell: 30, electronics: 40 }, buildTime: 10, hp: 700, model: 'teleporter',
    teleporter: true, power: -50, maxCount: 4, comfort: 1,
  }),
  d({
    id: 'atmo_generator', name: 'Atmospheric Water Generator', icon: '☁️', category: 'water', description: 'Pulls clean water straight out of thin air. Whole lakes appear overnight.',
    size: [3, 3], unlockTier: 5, research: 'atmospheric_harvest', cost: { alloy: 70, nano: 8, electronics: 50 }, buildTime: 10, hp: 900, ...PROD, model: 'atmo_generator',
    produces: { water: 320 }, power: -45, workers: { slots: 1, job: 'water_tech', required: false },
  }),
  d({
    id: 'vertical_farm', name: 'Vertical Farm Tower', icon: '🏗️', category: 'food', description: 'A skyscraper of glowing crop trays. Feeds an entire city block.',
    size: [3, 3], unlockTier: 5, research: 'vertical_agri', cost: { alloy: 60, nano: 6, electronics: 40 }, buildTime: 10, hp: 900, ...PROD, levelCostMult: 1.7, solid: false, model: 'hydroponics',
    produces: { food: 320 }, consumes: { water: 40 }, power: -50, workers: { slots: 2, job: 'farmer', required: false },
  }),
  d({
    id: 'repair_drone_bay', name: 'Repair Drone Bay', icon: '🛠️', category: 'utility', description: 'Little drones zip around fixing every scratch and dent. Zzzzip!',
    size: [2, 2], unlockTier: 5, research: 'drone_workers', cost: { alloy: 60, nano: 10, electronics: 40 }, buildTime: 8, hp: 800, ...LAB, model: 'repair_bay',
    repair: 24, power: -30, workers: { slots: 1, job: 'drone_tech', required: false },
  }),
  d({
    id: 'trauma_center', name: 'Trauma Center', icon: '💉', category: 'utility', description: 'Cutting-edge medical suites with nano-healing beds. Everyone leaves smiling.',
    size: [3, 3], unlockTier: 5, research: 'trauma_medicine', cost: { alloy: 70, nano: 10, electronics: 50 }, buildTime: 10, hp: 1200, ...LAB, model: 'medical_center',
    medical: 6, comfort: 5, station: 'med_bay', power: -20, workers: { slots: 2, job: 'doctor', required: false },
  }),
  d({
    id: 'nano_residence', name: 'Nano Residence', icon: '🏘️', category: 'housing', description: 'Shape-shifting apartments that rearrange themselves to taste. Twenty-four beds.',
    size: [3, 3], unlockTier: 5, research: 'tier_nano', cost: { nano: 12, alloy: 70, steel: 60 }, buildTime: 12, hp: 2600, ...HOME, model: 'habitat',
    housing: 24, comfort: 14, power: -10,
  }),
  d({
    id: 'nano_vault', name: 'Nano Vault', icon: '🔒', category: 'storage', description: 'Folded-space shelving that stores far more than it should.',
    size: [3, 3], unlockTier: 5, research: 'tier_nano', cost: { nano: 15, alloy: 80, electronics: 40 }, buildTime: 10, hp: 2600, ...STORE, maxLevel: 4, model: 'quantum_storage',
    storage: { nano: 1200, titanium: 1200, energy_cell: 1500, alloy: 1500, crystal: 1500, electronics: 1800, steel: 3000, biomass: 800 }, power: -10,
  }),
  d({ id: 'holo_theater', name: 'Holo Theater', icon: '🎭', category: 'decor', description: 'Immersive holographic shows. Whole neighborhoods gather for premieres.', size: [3, 3], unlockTier: 5, research: 'nano_wellness', cost: { alloy: 50, nano: 8, electronics: 40 }, buildTime: 9, hp: 600, model: 'arcade', entertainment: 60, comfort: 6, power: -25 }),
  d({ id: 'neon_park', name: 'Neon Skypark', icon: '🌳', category: 'decor', description: 'Glowing trees, winding paths and floating lanterns. The prettiest park on the planet.', size: [4, 4], unlockTier: 5, research: 'nano_wellness', cost: { alloy: 40, nano: 6, stone: 100 }, buildTime: 9, hp: 400, solid: false, model: 'garden', comfort: 45, entertainment: 10, power: -6 }),

  // ---- tier 5 defense
  d({
    id: 'laser_turret', name: 'Laser Turret', icon: '🔆', category: 'defense', description: 'Pew-pew! A precise beam that never misses. Runs on pure power.',
    size: [1, 1], unlockTier: 5, research: 'energy_weapons', cost: { alloy: 40, energy_cell: 20, nano: 5 }, buildTime: 7, hp: 1100, ...GUN, model: 'turret_laser',
    turret: { range: 13, damage: 26, fireRate: 6, projectile: 'laser', antiAir: true }, power: -15,
  }),
  d({
    id: 'drone_pad', name: 'Combat Drone Pad', icon: '🛩️', category: 'defense', description: 'Launches a squad of little combat drones that buzz after any alien.',
    size: [2, 2], unlockTier: 5, research: 'combat_drones', cost: { alloy: 55, energy_cell: 25, nano: 8, electronics: 30 }, buildTime: 9, hp: 1000, ...GUN, model: 'drone_pad',
    turret: { range: 15, damage: 22, fireRate: 6, projectile: 'drone', antiAir: true }, power: -20, workers: { slots: 1, job: 'drone_tech', required: false },
  }),
  d({
    id: 'arc_barrier', name: 'Arc Barrier', icon: '⚡', category: 'defense', description: 'A wall of live lightning arcs between two pylons. Even flyers feel it.',
    size: [1, 1], unlockTier: 5, research: 'energy_weapons', cost: { alloy: 12, energy_cell: 6, electronics: 8 }, buildTime: 3, hp: 800, maxLevel: 3, levelCostMult: 1.8, levelEffect: 0.5, model: 'electric_fence',
    trap: { dps: 95, slow: 0.6, antiAir: true }, power: -5,
  }),
  d({
    id: 'flak_battery', name: 'Flak Battery', icon: '🎆', category: 'defense', description: 'Skyward bursts that fill the air with shrapnel flowers.',
    size: [2, 2], unlockTier: 5, research: 'barrier_tech', cost: { alloy: 50, nano: 8, electronics: 30 }, buildTime: 8, hp: 1200, ...GUN, model: 'turret_aa',
    turret: { range: 17, damage: 44, fireRate: 3, projectile: 'missile', splash: 2.5, antiAir: true, airOnly: true },
  }),
  d({
    id: 'energy_barrier', name: 'Energy Barrier', icon: '🛡️', category: 'defense', description: 'A towering curtain of glowing shield energy. Shrugs off swarms.',
    size: [2, 2], unlockTier: 5, research: 'barrier_tech', cost: { alloy: 90, nano: 14, energy_cell: 40, electronics: 60 }, buildTime: 12, hp: 1500, ...GEN, model: 'shield_generator',
    shield: { radius: 12, capacity: 3400, regen: 80 }, power: -70,
  }),

  // ================================================================== TIER 6 — Titanium (the super-colony)
  d({
    id: 'fusion_core', name: 'Titanium Fusion Core', icon: '🌟', category: 'power', description: 'A gleaming titanium sun-heart. Powers an entire city and glows beautifully.',
    size: [4, 4], unlockTier: 6, research: 'titanium_fusion', cost: { titanium: 120, nano: 60, energy_cell: 60, alloy: 150 }, buildTime: 16, hp: 3600, ...GEN, model: 'fusion_reactor',
    power: 2600, consumes: { crystal: 3 }, workers: { slots: 2, job: 'electrician', required: false }, comfort: 5,
  }),
  d({
    id: 'titan_skyscraper', name: 'Titanium Skyscraper', icon: '🏙️', category: 'housing', description: 'A gleaming tower of glass and titanium with a rooftop pool. Sixty beds with a view.',
    size: [4, 4], unlockTier: 6, research: 'titan_living', cost: { titanium: 90, nano: 40, alloy: 120 }, buildTime: 18, hp: 5200, ...HOME, model: 'skyscraper',
    housing: 60, comfort: 30, power: -20,
  }),
  d({
    id: 'quantum_storage', name: 'Quantum Storage', icon: '🌌', category: 'storage', description: 'Stores matter as pure information. The warehouse is bigger on the inside.',
    size: [3, 3], unlockTier: 6, research: 'quantum_storage_tech', cost: { titanium: 80, nano: 40, energy_cell: 40 }, buildTime: 14, hp: 4000, ...STORE, maxLevel: 4, model: 'quantum_storage',
    storage: { wood: 12000, stone: 12000, fiber: 8000, food: 8000, water: 8000, iron: 8000, copper: 6000, coal: 6000, steel: 6000, electronics: 4000, biomass: 3000, crystal: 3000, alloy: 3000, energy_cell: 3000, nano: 2500, titanium: 2500 }, power: -25,
  }),
  d({
    id: 'ai_logistics_hub', name: 'AI Logistics Hub', icon: '🧠', category: 'storage', description: 'A thinking warehouse that sorts, stocks and even tidies up the stockpile. Logistics workers supercharge it.',
    size: [3, 3], unlockTier: 6, research: 'ai_core', cost: { titanium: 70, nano: 35, electronics: 120 }, buildTime: 14, hp: 3000, ...PROD, maxLevel: 4, model: 'quantum_storage',
    storage: { wood: 5000, stone: 5000, fiber: 3000, iron: 3000, copper: 2500, coal: 2500, steel: 2500, electronics: 1500 },
    produces: { wood: 120, stone: 120, iron: 50, steel: 12 }, power: -60, workers: { slots: 4, job: 'logistics', required: false },
  }),
  d({
    id: 'titan_factory', name: 'Titan Automated Factory', icon: '🏭', category: 'crafting', description: 'A gleaming mega-factory printing titanium gear on endless glowing belts.',
    size: [5, 4], unlockTier: 6, research: 'titan_manufacturing', cost: { titanium: 100, nano: 50, alloy: 140, electronics: 120 }, buildTime: 18, hp: 4400, ...PROD, maxLevel: 3, model: 'factory',
    factory: 'titan', power: -140, workers: { slots: 4, job: 'mechanic', required: false },
  }),
  d({
    id: 'titan_forge', name: 'Titan Forge', icon: '⚒️', category: 'crafting', description: 'Where legendary titanium gear is hand-finished with a flourish of plasma.',
    size: [3, 3], unlockTier: 6, research: 'titan_manufacturing', cost: { titanium: 60, nano: 30, alloy: 80 }, buildTime: 12, hp: 2400, model: 'forge',
    station: 'titan', maxCount: 1, power: -30,
  }),
  d({
    id: 'quantum_lab', name: 'Quantum Lab', icon: '⚛️', category: 'research', description: 'Where scientists argue with reality and sometimes win. Massive research output.',
    size: [4, 4], unlockTier: 6, research: 'quantum_computing', cost: { titanium: 80, nano: 40, electronics: 150 }, buildTime: 16, hp: 3200, ...LAB, model: 'advanced_lab',
    research_rate: 170, power: -90, workers: { slots: 4, job: 'scientist', required: false },
  }),
  d({
    id: 'teleport_gateway', name: 'Titanium Gateway', icon: '🌠', category: 'utility', description: 'A shimmering archway between worlds. Link to every teleporter in an instant.',
    size: [3, 3], unlockTier: 6, research: 'titan_hover', cost: { titanium: 70, nano: 30, energy_cell: 50 }, buildTime: 12, hp: 2200, model: 'teleporter',
    teleporter: true, power: -100, maxCount: 3, comfort: 3,
  }),
  d({
    id: 'bio_dome', name: 'Bio Dome', icon: '🌍', category: 'food', description: 'A glittering dome of self-running farms and forests. Fully automated abundance.',
    size: [5, 5], unlockTier: 6, research: 'bio_dome_tech', cost: { titanium: 70, nano: 30, alloy: 90 }, buildTime: 16, hp: 2400, ...PROD, levelCostMult: 1.7, solid: false, model: 'greenhouse',
    produces: { food: 900 }, consumes: { water: 70 }, power: -90, workers: { slots: 3, job: 'farmer', required: false }, comfort: 8,
  }),
  d({
    id: 'regen_center', name: 'Regeneration Center', icon: '💠', category: 'utility', description: 'Nano-healing pods and spa pools. Everyone leaves glowing and perfectly rested.',
    size: [3, 3], unlockTier: 6, research: 'titan_living', cost: { titanium: 60, nano: 30, alloy: 70 }, buildTime: 12, hp: 2600, ...LAB, model: 'medical_center',
    medical: 10, comfort: 10, station: 'med_bay', power: -40, workers: { slots: 3, job: 'doctor', required: false },
  }),
  d({
    id: 'titan_repair_array', name: 'Titan Repair Array', icon: '🪄', category: 'utility', description: 'A halo of nano-repair beams that mend damage the moment it happens.',
    size: [3, 3], unlockTier: 6, research: 'titan_manufacturing', cost: { titanium: 60, nano: 30, electronics: 80 }, buildTime: 12, hp: 2800, ...LAB, model: 'repair_bay',
    repair: 80, power: -60, workers: { slots: 2, job: 'drone_tech', required: false },
  }),
  d({ id: 'titan_monument', name: 'Monument of Titans', icon: '🏆', category: 'decor', description: 'A towering titanium statue celebrating everything your colony has achieved.', size: [2, 2], unlockTier: 6, research: 'titan_living', cost: { titanium: 40, nano: 15, alloy: 60 }, buildTime: 10, hp: 2000, model: 'statue', comfort: 60, entertainment: 10 }),
  d({ id: 'sky_garden', name: 'Skyline Garden', icon: '🌸', category: 'decor', description: 'A rooftop paradise of blossoms, fountains and starlit benches above the clouds.', size: [4, 4], unlockTier: 6, research: 'titan_living', cost: { titanium: 30, nano: 12, stone: 120 }, buildTime: 11, hp: 600, solid: false, model: 'garden', comfort: 80, entertainment: 20, power: -8 }),
  d({ id: 'zero_g_arena', name: 'Zero-G Arena', icon: '🎪', category: 'decor', description: 'A floating arena where colonists play anti-gravity ball. The crowd goes wild.', size: [4, 4], unlockTier: 6, research: 'titan_living', cost: { titanium: 50, nano: 20, electronics: 80 }, buildTime: 12, hp: 1400, model: 'arcade', entertainment: 120, comfort: 10, power: -40 }),

  // ---- tier 6 defense
  d({
    id: 'plasma_turret', name: 'Plasma Turret', icon: '🟣', category: 'defense', description: 'Lobs sizzling plasma that melts through armor and splashes the pack.',
    size: [2, 2], unlockTier: 6, research: 'plasma_tech', cost: { titanium: 40, nano: 15, energy_cell: 40 }, buildTime: 10, hp: 2400, ...GUN, model: 'turret_plasma',
    turret: { range: 14, damage: 150, fireRate: 2, projectile: 'plasma', splash: 1.5, antiAir: true }, power: -35,
  }),
  d({
    id: 'railgun', name: 'Railgun Tower', icon: '🔱', category: 'defense', description: 'One crackling bolt tears clean through a whole line of aliens.',
    size: [2, 2], unlockTier: 6, research: 'railgun_tech', cost: { titanium: 55, nano: 20, energy_cell: 50 }, buildTime: 11, hp: 2600, ...GUN, model: 'turret_rail',
    turret: { range: 22, damage: 520, fireRate: 0.6, projectile: 'rail', pierce: 5, antiAir: true }, power: -60,
  }),
  d({
    id: 'titan_cannon', name: 'Titanium Sentry Cannon', icon: '💫', category: 'defense', description: 'A gleaming titanium cannon with a glowing core. Shakes the whole colony when it fires.',
    size: [2, 2], unlockTier: 6, research: 'railgun_tech', cost: { titanium: 50, nano: 18, alloy: 80 }, buildTime: 11, hp: 3400, ...GUN, model: 'turret_cannon',
    turret: { range: 16, damage: 310, fireRate: 1.2, projectile: 'cannon', splash: 2.5, mannedBy: 'guard' }, workers: { slots: 1, job: 'guard', required: false }, power: -25,
  }),
  d({
    id: 'drone_swarm', name: 'Drone Swarm Hive', icon: '🐝', category: 'defense', description: 'Dozens of glowing combat drones swirl out in a deadly, beautiful cloud.',
    size: [2, 2], unlockTier: 6, research: 'drone_swarm_tech', cost: { titanium: 45, nano: 25, energy_cell: 45 }, buildTime: 10, hp: 2000, ...GUN, model: 'drone_pad',
    turret: { range: 18, damage: 34, fireRate: 9, projectile: 'drone', antiAir: true }, power: -45, workers: { slots: 1, job: 'drone_tech', required: false },
  }),
  d({
    id: 'sky_lance', name: 'Sky Lance', icon: '🗡️', category: 'defense', description: 'A long-range laser spear that skewers anything with wings.',
    size: [1, 1], unlockTier: 6, research: 'titan_shielding', cost: { titanium: 30, nano: 10, energy_cell: 25 }, buildTime: 8, hp: 1600, ...GUN, model: 'turret_aa',
    turret: { range: 20, damage: 110, fireRate: 3, projectile: 'laser', antiAir: true, airOnly: true }, power: -30,
  }),
  d({
    id: 'titan_shield', name: 'Titanium Aegis Shield', icon: '🔷', category: 'defense', description: 'A colossal dome of glowing energy that wraps the whole colony in safety.',
    size: [3, 3], unlockTier: 6, research: 'titan_shielding', cost: { titanium: 80, nano: 30, energy_cell: 80, electronics: 100 }, buildTime: 14, hp: 3600, ...GEN, model: 'shield_generator',
    shield: { radius: 18, capacity: 11000, regen: 240 }, power: -140,
  }),
];
