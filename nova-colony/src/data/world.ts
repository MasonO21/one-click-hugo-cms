import type { BiomeDef, NodeDef, PoiDef } from './schema';

/**
 * Regions. Crash Valley is centered on the origin and must contain the full Titanium colony radius
 * (48 cells) plus a margin. Others ring around it; Titanium Highlands is the far end-game region.
 */
export const BIOMES: BiomeDef[] = [
  {
    id: 'crash_valley', name: 'Crash Valley', description: 'Peaceful grasslands where your pod came down.', ground: ['#6fbf5a', '#9bd66b'], tint: '#bfe8ff',
    unlock: {}, center: { angle: 0, dist: 0 }, size: 1.6, relief: 1.5, mood: 'calm',
    nodes: [{ node: 'tree_round', density: 0.05 }, { node: 'rock', density: 0.025 }, { node: 'bush_berry', density: 0.02 }, { node: 'fiber_grass', density: 0.03 }],
    props: ['grass', 'flower', 'pebble'], pois: [{ poi: 'supply_cache', count: 3 }, { poi: 'beacon', count: 1 }],
  },
  {
    id: 'pinewood_forest', name: 'Pinewood Forest', description: 'Towering alien pines, berries and abandoned cabins.', ground: ['#3f8a4a', '#5aa35a'], tint: '#cde8c8',
    unlock: {}, center: { angle: 135, dist: 0.62 }, size: 1, relief: 4, mood: 'warm',
    nodes: [{ node: 'tree_pine', density: 0.12 }, { node: 'bush_berry', density: 0.03 }, { node: 'rock', density: 0.02 }],
    props: ['fern', 'mushroom', 'log'], pois: [{ poi: 'survivor_camp', count: 2 }, { poi: 'supply_cache', count: 3 }, { poi: 'beacon', count: 1 }],
  },
  {
    id: 'crystal_canyon', name: 'Crystal Canyon', description: 'Glittering canyons humming with alien crystals.', ground: ['#8a7bc4', '#b6a8e8'], tint: '#e3d8ff',
    unlock: { tier: 2 }, center: { angle: 0, dist: 0.66 }, size: 1, relief: 7, mood: 'mystic',
    nodes: [{ node: 'crystal_cluster', density: 0.05 }, { node: 'rock', density: 0.04 }, { node: 'ore_copper', density: 0.02 }],
    props: ['crystal_shard', 'spire'], pois: [{ poi: 'crashed_ship', count: 2 }, { poi: 'beacon', count: 1 }],
  },
  {
    id: 'red_desert', name: 'Red Desert', description: 'Rust-red dunes rich in metals.', ground: ['#d9895a', '#efb27a'], tint: '#ffe0c4',
    unlock: { tier: 1 }, center: { angle: 270, dist: 0.64 }, size: 1.1, relief: 3, mood: 'warm',
    nodes: [{ node: 'ore_iron', density: 0.04 }, { node: 'ore_copper', density: 0.03 }, { node: 'coal_seam', density: 0.03 }, { node: 'rock', density: 0.03 }],
    props: ['cactus', 'bones', 'dune_rock'], pois: [{ poi: 'crashed_ship', count: 2 }, { poi: 'survivor_camp', count: 1 }, { poi: 'beacon', count: 1 }],
  },
  {
    id: 'toxic_marsh', name: 'Toxic Marsh', description: 'Glowing bogs full of strange biomass.', ground: ['#5b7f3a', '#87a84a'], tint: '#d8f5b0',
    unlock: { tier: 3 }, center: { angle: 210, dist: 0.7 }, size: 0.9, relief: 1, mood: 'eerie',
    nodes: [{ node: 'bio_pod', density: 0.05 }, { node: 'tree_round', density: 0.03 }],
    props: ['reed', 'glow_mushroom', 'bubble'], pois: [{ poi: 'alien_nest', count: 2 }, { poi: 'survivor_camp', count: 1 }, { poi: 'beacon', count: 1 }],
  },
  {
    id: 'frozen_ridge', name: 'Frozen Ridge', description: 'Icy peaks hiding rare ores and research outposts.', ground: ['#d6e4f0', '#f4f8fc'], tint: '#e8f4ff',
    unlock: { tier: 4 }, center: { angle: 90, dist: 0.68 }, size: 1, relief: 9, mood: 'cold',
    nodes: [{ node: 'ice_ore', density: 0.04 }, { node: 'ore_iron', density: 0.02 }, { node: 'crystal_cluster', density: 0.015 }],
    props: ['ice_spike', 'snow_rock'], pois: [{ poi: 'research_outpost', count: 2 }, { poi: 'beacon', count: 1 }],
  },
  {
    id: 'alien_ruins', name: 'Alien Ruins', description: 'Ancient structures pulsing with forgotten technology.', ground: ['#6e6a8a', '#9690b4'], tint: '#d4ccff',
    unlock: { tier: 4 }, center: { angle: 45, dist: 0.74 }, size: 0.9, relief: 4, mood: 'mystic',
    nodes: [{ node: 'crystal_cluster', density: 0.03 }, { node: 'scrap_pile', density: 0.03 }],
    props: ['ruin_pillar', 'glyph_stone'], pois: [{ poi: 'alien_ruin', count: 4 }, { poi: 'beacon', count: 1 }],
  },
  {
    id: 'titanium_highlands', name: 'Titanium Highlands', description: 'Silver plateaus where titanium breaks the surface.', ground: ['#9aa6b4', '#c8d2de'], tint: '#eef4ff',
    unlock: { tier: 5 }, center: { angle: 315, dist: 0.8 }, size: 0.9, relief: 8, mood: 'epic',
    nodes: [{ node: 'titanium_deposit', density: 0.05 }, { node: 'rock', density: 0.03 }],
    props: ['metal_spire', 'boulder'], pois: [{ poi: 'crashed_ship', count: 1 }, { poi: 'beacon', count: 1 }],
  },
];

export const NODES: NodeDef[] = [
  { id: 'tree_round', name: 'Bubble Tree', model: 'tree_round', drop: { wood: 3 }, hits: 5, respawn: 90, toolTier: 0, scale: 1, solid: true },
  { id: 'tree_pine', name: 'Spire Pine', model: 'tree_pine', drop: { wood: 4 }, hits: 6, respawn: 100, toolTier: 0, scale: 1.2, solid: true },
  { id: 'bush_berry', name: 'Berry Bush', model: 'bush', drop: { food: 2, fiber: 1 }, hits: 4, respawn: 60, toolTier: 0, scale: 1, solid: false },
  { id: 'fiber_grass', name: 'Fiber Grass', model: 'fiber_grass', drop: { fiber: 2 }, hits: 3, respawn: 45, toolTier: 0, scale: 1, solid: false },
  { id: 'rock', name: 'Boulder', model: 'rock', drop: { stone: 3 }, hits: 5, respawn: 120, toolTier: 0, scale: 1, solid: true },
  { id: 'ore_iron', name: 'Iron Vein', model: 'ore_iron', drop: { iron: 2, stone: 1 }, hits: 6, respawn: 150, toolTier: 1, scale: 1, solid: true },
  { id: 'ore_copper', name: 'Copper Vein', model: 'ore_copper', drop: { copper: 2, stone: 1 }, hits: 6, respawn: 150, toolTier: 1, scale: 1, solid: true },
  { id: 'coal_seam', name: 'Coal Seam', model: 'coal', drop: { coal: 3 }, hits: 5, respawn: 140, toolTier: 1, scale: 1, solid: true },
  { id: 'crystal_cluster', name: 'Crystal Cluster', model: 'crystal', drop: { crystal: 1 }, hits: 6, respawn: 200, toolTier: 2, scale: 1, solid: true },
  { id: 'bio_pod', name: 'Bio Pod', model: 'bio_pod', drop: { biomass: 2, fiber: 1 }, hits: 4, respawn: 150, toolTier: 2, scale: 1, solid: false },
  { id: 'ice_ore', name: 'Frost Ore', model: 'ice_ore', drop: { iron: 2, copper: 1, water: 3 }, hits: 6, respawn: 180, toolTier: 2, scale: 1, solid: true },
  { id: 'scrap_pile', name: 'Alien Scrap', model: 'scrap', drop: { electronics: 1, steel: 1 }, hits: 5, respawn: 220, toolTier: 2, scale: 1, solid: true },
  { id: 'titanium_deposit', name: 'Titanium Deposit', model: 'titanium', drop: { titanium: 1 }, hits: 8, respawn: 260, toolTier: 3, scale: 1.1, solid: true },
];

export const POIS: PoiDef[] = [
  { id: 'supply_cache', name: 'Supply Cache', kind: 'cache', model: 'cache', icon: '🎁', description: 'A drop-pod cache from the colony ship.', reward: { resources: { wood: 30, stone: 20, fiber: 15, food: 10 }, xp: 10 }, respawn: 1800 },
  { id: 'survivor_camp', name: 'Survivor Camp', kind: 'camp', model: 'camp', icon: '🏕️', description: 'Someone is waving at you!', reward: { colonist: 'common', xp: 25 }, respawn: 0 },
  { id: 'crashed_ship', name: 'Crashed Spacecraft', kind: 'wreck', model: 'wreck', icon: '🚀', description: 'Salvageable wreckage.', reward: { resources: { iron: 40, copper: 25, electronics: 5 }, rp: 15, xp: 30 }, respawn: 3600 },
  { id: 'alien_ruin', name: 'Alien Ruin', kind: 'ruin', model: 'ruin', icon: '🗿', description: 'Ancient glyphs reveal alien technology.', reward: { rp: 60, resources: { crystal: 10 }, nova: 5, xp: 40 }, respawn: 0 },
  { id: 'alien_nest', name: 'Alien Nest', kind: 'nest', model: 'nest', icon: '🪺', description: 'Clear the nest for rare loot.', reward: { resources: { biomass: 30, crystal: 5 }, nova: 3, xp: 40 }, guards: { alien: 'crawler', count: 4 }, respawn: 2400 },
  { id: 'research_outpost', name: 'Abandoned Research Outpost', kind: 'facility', model: 'outpost', icon: '🧪', description: 'Old research data and a stash of parts.', reward: { rp: 80, resources: { electronics: 20 }, xp: 40 }, respawn: 0 },
  { id: 'beacon', name: 'Fast-Travel Beacon', kind: 'beacon', model: 'beacon', icon: '📡', description: 'Activate to fast travel here from the map.', reward: { xp: 15 }, respawn: 0 },
];
