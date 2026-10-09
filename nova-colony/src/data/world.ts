import type { BiomeDef, NodeDef, PoiDef } from './schema';

/**
 * Regions. Crash Valley is centered on the origin and must contain the full Titanium colony radius
 * (48 cells) plus a margin. Others ring around it; Titanium Highlands is the far end-game region.
 * Biomes unlock gradually with the colony tier (Pinewood Forest is open from the start).
 */
export const BIOMES: BiomeDef[] = [
  {
    id: 'crash_valley', name: 'Crash Valley', description: 'Peaceful grasslands where your pod came down. Gentle hills, bubble trees and a scattering of supply drops.', ground: ['#6fbf5a', '#9bd66b'], tint: '#bfe8ff',
    unlock: {}, center: { angle: 0, dist: 0 }, size: 1.6, relief: 1.5, mood: 'calm',
    nodes: [{ node: 'tree_round', density: 0.05 }, { node: 'rock', density: 0.025 }, { node: 'bush_berry', density: 0.02 }, { node: 'fiber_grass', density: 0.03 }, { node: 'boulder_big', density: 0.004 }],
    props: ['grass', 'flower', 'pebble', 'meadow_tuft', 'bush_small', 'meadow_tuft', 'flower', 'crystal_shard'], pois: [{ poi: 'supply_cache', count: 4 }, { poi: 'hidden_stash', count: 2 }, { poi: 'abandoned_cabin', count: 1 }, { poi: 'beacon', count: 1 }],
  },
  {
    id: 'pinewood_forest', name: 'Pinewood Forest', description: 'Towering alien pines, glowing berries, abandoned cabins and the odd survivor camp.', ground: ['#3f8a4a', '#5aa35a'], tint: '#cde8c8',
    unlock: {}, center: { angle: 135, dist: 0.62 }, size: 1, relief: 4, mood: 'warm',
    nodes: [{ node: 'tree_pine', density: 0.12 }, { node: 'tree_ancient', density: 0.006 }, { node: 'bush_berry', density: 0.03 }, { node: 'bush_glow', density: 0.012 }, { node: 'rock', density: 0.02 }, { node: 'fiber_grass', density: 0.015 }],
    props: ['fern', 'mushroom', 'log', 'fern', 'bush_small', 'mushroom', 'grass', 'crystal_shard'], pois: [{ poi: 'survivor_camp', count: 2 }, { poi: 'supply_cache', count: 3 }, { poi: 'abandoned_cabin', count: 3 }, { poi: 'hidden_stash', count: 2 }, { poi: 'beacon', count: 1 }],
  },
  {
    id: 'crystal_canyon', name: 'Crystal Canyon', description: 'Glittering canyons humming with alien crystals. The walls sing when the wind blows.', ground: ['#8a7bc4', '#b6a8e8'], tint: '#e3d8ff',
    unlock: { tier: 2 }, center: { angle: 0, dist: 0.66 }, size: 1, relief: 7, mood: 'mystic',
    nodes: [{ node: 'crystal_cluster', density: 0.05 }, { node: 'crystal_geode', density: 0.006 }, { node: 'rock', density: 0.04 }, { node: 'ore_copper', density: 0.02 }, { node: 'ore_iron', density: 0.01 }],
    props: ['crystal_shard', 'spire', 'pebble', 'crystal_shard', 'grass'], pois: [{ poi: 'crashed_ship', count: 2 }, { poi: 'hidden_stash', count: 2 }, { poi: 'alien_ruin', count: 1 }, { poi: 'beacon', count: 1 }],
  },
  {
    id: 'red_desert', name: 'Red Desert', description: 'Rust-red dunes rich in metals, wrecks and wandering survivors.', ground: ['#d9895a', '#efb27a'], tint: '#ffe0c4',
    unlock: { tier: 1 }, center: { angle: 270, dist: 0.64 }, size: 1.1, relief: 3, mood: 'warm',
    nodes: [{ node: 'ore_iron', density: 0.04 }, { node: 'ore_iron_rich', density: 0.006 }, { node: 'ore_copper', density: 0.03 }, { node: 'ore_copper_rich', density: 0.004 }, { node: 'coal_seam', density: 0.03 }, { node: 'rock', density: 0.03 }],
    props: ['cactus', 'bones', 'dune_rock', 'cactus_ball', 'cactus_ball'], pois: [{ poi: 'crashed_ship', count: 2 }, { poi: 'survivor_camp', count: 1 }, { poi: 'mining_outpost', count: 2 }, { poi: 'hidden_stash', count: 2 }, { poi: 'beacon', count: 1 }],
  },
  {
    id: 'toxic_marsh', name: 'Toxic Marsh', description: 'Glowing bogs full of strange biomass, bubbling pools and sleepy alien nests.', ground: ['#5b7f3a', '#87a84a'], tint: '#d8f5b0',
    unlock: { tier: 3 }, center: { angle: 210, dist: 0.7 }, size: 0.9, relief: 1, mood: 'eerie',
    nodes: [{ node: 'bio_pod', density: 0.05 }, { node: 'bio_bloom', density: 0.008 }, { node: 'tree_round', density: 0.03 }, { node: 'fiber_grass', density: 0.03 }],
    props: ['reed', 'glow_mushroom', 'bubble', 'fern', 'reed'], pois: [{ poi: 'alien_nest', count: 2 }, { poi: 'survivor_camp', count: 1 }, { poi: 'toxic_lab', count: 1 }, { poi: 'hidden_stash', count: 1 }, { poi: 'beacon', count: 1 }],
  },
  {
    id: 'frozen_ridge', name: 'Frozen Ridge', description: 'Icy peaks hiding rare ores, stranded scientists and abandoned research outposts.', ground: ['#d6e4f0', '#f4f8fc'], tint: '#e8f4ff',
    unlock: { tier: 4 }, center: { angle: 90, dist: 0.68 }, size: 1, relief: 9, mood: 'cold',
    nodes: [{ node: 'ice_ore', density: 0.04 }, { node: 'ore_iron', density: 0.02 }, { node: 'crystal_cluster', density: 0.015 }, { node: 'rock', density: 0.02 }],
    props: ['ice_spike', 'snow_rock', 'snow_bush', 'snow_bush'], pois: [{ poi: 'research_outpost', count: 2 }, { poi: 'frozen_lab', count: 2 }, { poi: 'stranded_scientists', count: 1 }, { poi: 'hidden_stash', count: 2 }, { poi: 'beacon', count: 1 }],
  },
  {
    id: 'alien_ruins', name: 'Alien Ruins', description: 'Ancient structures pulsing with forgotten technology. Something old is still awake in here.', ground: ['#6e6a8a', '#9690b4'], tint: '#d4ccff',
    unlock: { tier: 4 }, center: { angle: 45, dist: 0.74 }, size: 0.9, relief: 4, mood: 'mystic',
    nodes: [{ node: 'crystal_cluster', density: 0.03 }, { node: 'crystal_geode', density: 0.005 }, { node: 'scrap_pile', density: 0.04 }],
    props: ['ruin_pillar', 'glyph_stone', 'meadow_tuft', 'bush_small', 'crystal_shard'], pois: [{ poi: 'alien_ruin', count: 4 }, { poi: 'ancient_vault', count: 2 }, { poi: 'stranded_scientists', count: 1 }, { poi: 'hive_nest', count: 1 }, { poi: 'beacon', count: 1 }],
  },
  {
    id: 'titanium_highlands', name: 'Titanium Highlands', description: 'Silver plateaus where titanium breaks the surface. The sky here feels close enough to touch.', ground: ['#9aa6b4', '#c8d2de'], tint: '#eef4ff',
    unlock: { tier: 5 }, center: { angle: 315, dist: 0.8 }, size: 0.9, relief: 8, mood: 'epic',
    nodes: [{ node: 'titanium_deposit', density: 0.05 }, { node: 'titanium_rich', density: 0.006 }, { node: 'rock', density: 0.03 }, { node: 'scrap_pile', density: 0.01 }],
    props: ['metal_spire', 'boulder', 'grass', 'pebble', 'meadow_tuft'], pois: [{ poi: 'derelict_freighter', count: 1 }, { poi: 'titanium_cache', count: 3 }, { poi: 'hive_nest', count: 1 }, { poi: 'beacon', count: 1 }],
  },
];

export const NODES: NodeDef[] = [
  // ---- tier-0 tools (toolTier 0..1)
  { id: 'tree_round', name: 'Bubble Tree', model: 'tree_round', drop: { wood: 3 }, hits: 5, respawn: 90, toolTier: 0, scale: 1, solid: true },
  { id: 'tree_pine', name: 'Spire Pine', model: 'tree_pine', drop: { wood: 4 }, hits: 6, respawn: 100, toolTier: 0, scale: 1.2, solid: true },
  { id: 'tree_ancient', name: 'Ancient Spire', model: 'tree_pine', drop: { wood: 14, fiber: 4 }, hits: 10, respawn: 300, toolTier: 0, scale: 2, solid: true },
  { id: 'bush_berry', name: 'Berry Bush', model: 'bush', drop: { food: 2, fiber: 1 }, hits: 4, respawn: 60, toolTier: 0, scale: 1, solid: false },
  { id: 'bush_glow', name: 'Glowberry Bush', model: 'bush', drop: { food: 5, fiber: 2 }, hits: 4, respawn: 120, toolTier: 0, scale: 1.2, solid: false },
  { id: 'fiber_grass', name: 'Fiber Grass', model: 'fiber_grass', drop: { fiber: 2 }, hits: 3, respawn: 45, toolTier: 0, scale: 1, solid: false },
  { id: 'rock', name: 'Boulder', model: 'rock', drop: { stone: 3 }, hits: 5, respawn: 120, toolTier: 0, scale: 1, solid: true },
  { id: 'boulder_big', name: 'Mega Boulder', model: 'rock', drop: { stone: 10 }, hits: 9, respawn: 240, toolTier: 0, scale: 1.8, solid: true },
  // ---- toolTier 1: metals
  { id: 'ore_iron', name: 'Iron Vein', model: 'ore_iron', drop: { iron: 2, stone: 1 }, hits: 6, respawn: 150, toolTier: 1, scale: 1, solid: true },
  { id: 'ore_iron_rich', name: 'Rich Iron Vein', model: 'ore_iron', drop: { iron: 6, stone: 2 }, hits: 9, respawn: 280, toolTier: 1, scale: 1.4, solid: true },
  { id: 'ore_copper', name: 'Copper Vein', model: 'ore_copper', drop: { copper: 2, stone: 1 }, hits: 6, respawn: 150, toolTier: 1, scale: 1, solid: true },
  { id: 'ore_copper_rich', name: 'Rich Copper Vein', model: 'ore_copper', drop: { copper: 6, stone: 2 }, hits: 9, respawn: 280, toolTier: 1, scale: 1.4, solid: true },
  { id: 'coal_seam', name: 'Coal Seam', model: 'coal', drop: { coal: 3 }, hits: 5, respawn: 140, toolTier: 1, scale: 1, solid: true },
  // ---- toolTier 2: crystals, biomass, frost ore, alien scrap
  { id: 'crystal_cluster', name: 'Crystal Cluster', model: 'crystal', drop: { crystal: 2 }, hits: 6, respawn: 200, toolTier: 2, scale: 1, solid: true },
  { id: 'crystal_geode', name: 'Crystal Geode', model: 'crystal', drop: { crystal: 6 }, hits: 9, respawn: 400, toolTier: 2, scale: 1.6, solid: true },
  { id: 'bio_pod', name: 'Bio Pod', model: 'bio_pod', drop: { biomass: 2, fiber: 1 }, hits: 4, respawn: 150, toolTier: 2, scale: 1, solid: false },
  { id: 'bio_bloom', name: 'Glowing Bloom', model: 'bio_pod', drop: { biomass: 6, fiber: 2 }, hits: 6, respawn: 260, toolTier: 2, scale: 1.4, solid: false },
  { id: 'ice_ore', name: 'Frost Ore', model: 'ice_ore', drop: { iron: 2, copper: 1, water: 3 }, hits: 6, respawn: 180, toolTier: 2, scale: 1, solid: true },
  { id: 'scrap_pile', name: 'Alien Scrap', model: 'scrap', drop: { electronics: 1, steel: 1 }, hits: 5, respawn: 220, toolTier: 2, scale: 1, solid: true },
  // ---- toolTier 3: titanium
  { id: 'titanium_deposit', name: 'Titanium Deposit', model: 'titanium', drop: { titanium: 1 }, hits: 8, respawn: 260, toolTier: 3, scale: 1.1, solid: true },
  { id: 'titanium_rich', name: 'Rich Titanium Vein', model: 'titanium', drop: { titanium: 4 }, hits: 11, respawn: 440, toolTier: 3, scale: 1.5, solid: true },
];

export const POIS: PoiDef[] = [
  // ---- caches & structures
  { id: 'supply_cache', name: 'Supply Cache', kind: 'cache', model: 'cache', icon: '🎁', description: 'A drop-pod cache from the colony ship.', reward: { resources: { wood: 30, stone: 20, fiber: 15, food: 10 }, xp: 10 }, respawn: 1800 },
  { id: 'hidden_stash', name: 'Hidden Stash', kind: 'cache', model: 'cache', icon: '🗝️', description: 'Someone buried a stash under a very obvious rock. Finders keepers!', reward: { resources: { iron: 30, copper: 20, coal: 20, fiber: 30 }, items: { medkit: 1 }, xp: 25 }, respawn: 0 },
  { id: 'abandoned_cabin', name: 'Abandoned Cabin', kind: 'structure', model: 'camp', icon: '🏚️', description: 'A dusty cabin with a still-warm kettle. The owners left in a hurry.', reward: { resources: { wood: 60, fiber: 40, food: 40 }, items: { bandage: 2, herbal_salve: 1 }, xp: 20 }, respawn: 0 },
  { id: 'mining_outpost', name: 'Abandoned Mining Outpost', kind: 'facility', model: 'outpost', icon: '⛏️', description: 'A rusty mining camp with crates of ore still stacked by the door.', reward: { resources: { iron: 80, copper: 60, coal: 60, steel: 15 }, xp: 30 }, respawn: 3600 },
  { id: 'titanium_cache', name: 'Titanium Cache', kind: 'cache', model: 'cache', icon: '🧰', description: 'A sealed survey crate stuffed with gleaming titanium and nano-material.', reward: { resources: { titanium: 40, nano: 15, energy_cell: 20 }, xp: 100 }, respawn: 7200 },
  // ---- survivors
  { id: 'survivor_camp', name: 'Survivor Camp', kind: 'camp', model: 'camp', icon: '🏕️', description: 'Someone is waving at you!', reward: { colonist: 'common', xp: 25 }, respawn: 0 },
  { id: 'stranded_scientists', name: 'Stranded Scientists', kind: 'camp', model: 'camp', icon: '🧑‍🔬', description: 'Two scientists and a very sad telescope. They would love a ride home.', reward: { colonist: 'rare', rp: 60, xp: 50 }, respawn: 0 },
  // ---- wrecks
  { id: 'crashed_ship', name: 'Crashed Spacecraft', kind: 'wreck', model: 'wreck', icon: '🚀', description: 'Salvageable wreckage.', reward: { resources: { iron: 60, copper: 40, electronics: 10, steel: 10 }, rp: 20, xp: 30 }, respawn: 3600 },
  { id: 'derelict_freighter', name: 'Derelict Freighter', kind: 'wreck', model: 'wreck', icon: '🚢', description: 'An enormous cargo hauler, abandoned mid-journey. Its holds are full.', reward: { resources: { steel: 120, electronics: 60, copper: 100, alloy: 25 }, rp: 90, xp: 70 }, respawn: 5400 },
  // ---- ancient & research
  { id: 'alien_ruin', name: 'Alien Ruin', kind: 'ruin', model: 'ruin', icon: '🗿', description: 'Ancient glyphs reveal alien technology.', reward: { rp: 80, resources: { crystal: 10 }, nova: 5, xp: 40 }, respawn: 0 },
  { id: 'ancient_vault', name: 'Ancient Vault', kind: 'ruin', model: 'ruin', icon: '🏛️', description: 'A sealed vault older than the stars. It hums when you get close.', reward: { rp: 260, resources: { crystal: 30, alloy: 15 }, nova: 10, xp: 90 }, respawn: 0 },
  { id: 'research_outpost', name: 'Abandoned Research Outpost', kind: 'facility', model: 'outpost', icon: '🧪', description: 'Old research data and a stash of parts.', reward: { rp: 110, resources: { electronics: 25 }, xp: 40 }, respawn: 0 },
  { id: 'frozen_lab', name: 'Frozen Laboratory', kind: 'facility', model: 'outpost', icon: '🧊', description: 'A lab frozen in time. The coffee is still hot, somehow.', reward: { rp: 180, resources: { electronics: 40, energy_cell: 8 }, items: { research_chip: 2 }, xp: 70 }, respawn: 0 },
  { id: 'toxic_lab', name: 'Overgrown Bio-Lab', kind: 'facility', model: 'outpost', icon: '🧬', description: 'A greenhouse lab that got a little too enthusiastic. Everything is glowing.', reward: { resources: { biomass: 50, electronics: 15 }, rp: 90, xp: 50 }, respawn: 0 },
  // ---- nests
  { id: 'alien_nest', name: 'Alien Nest', kind: 'nest', model: 'nest', icon: '🪺', description: 'Clear the nest for rare loot.', reward: { resources: { biomass: 30, crystal: 5 }, nova: 3, xp: 40 }, guards: { alien: 'crawler', count: 4 }, respawn: 2400 },
  { id: 'hive_nest', name: 'Hive Nest', kind: 'nest', model: 'nest', icon: '🕸️', description: 'A big, buzzing hive guarded by brutes. The loot inside smells amazing.', reward: { resources: { biomass: 80, crystal: 30, alloy: 15 }, nova: 8, xp: 90 }, guards: { alien: 'brute', count: 3 }, respawn: 4800 },
  // ---- beacons
  { id: 'beacon', name: 'Fast-Travel Beacon', kind: 'beacon', model: 'beacon', icon: '📡', description: 'Activate to fast travel here from the map.', reward: { xp: 15 }, respawn: 0 },
  // ---- temporary world-event markers (their value comes from the event's own reward)
  { id: 'supply_pod', name: 'Falling Supply Pod', kind: 'cache', model: 'cache', icon: '🪂', description: 'A supply pod parachuting in. Grab it!', reward: { xp: 5 }, respawn: 0 },
  { id: 'meteor_crater', name: 'Meteor Crater', kind: 'wreck', model: 'wreck', icon: '☄️', description: 'A smoking crater glittering with crystals.', reward: { xp: 5 }, respawn: 0 },
  { id: 'wreck_signal', name: 'Derelict Spacecraft', kind: 'wreck', model: 'wreck', icon: '🛰️', description: 'A silent spacecraft with its lights still on.', reward: { xp: 5 }, respawn: 0 },
  { id: 'distress_beacon', name: 'Distress Signal', kind: 'camp', model: 'camp', icon: '🆘', description: 'Someone out there is signalling for help.', reward: { xp: 5 }, respawn: 0 },
  { id: 'rogue_nest', name: 'Rogue Alien Nest', kind: 'nest', model: 'nest', icon: '🪺', description: 'A freshly dug nest full of twitchy aliens.', reward: { xp: 5 }, guards: { alien: 'crawler', count: 6 }, respawn: 0 },
  { id: 'merchant_caravan', name: 'Merchant Caravan', kind: 'camp', model: 'camp', icon: '🛒', description: 'A colorful caravan with a very suspicious amount of sparkle.', reward: { xp: 5 }, respawn: 0 },
  { id: 'ancient_obelisk', name: 'Ancient Obelisk', kind: 'structure', model: 'ruin', icon: '🔺', description: 'A glowing obelisk. It only wakes up when it feels like it.', reward: { xp: 10 }, respawn: 0 },
];
