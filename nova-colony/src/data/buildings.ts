import type { BuildingDef } from './schema';

/**
 * Building catalogue. Structure pieces are tier-agnostic (material tier chosen per instance and
 * upgradeable); facilities unlock by colony tier/research. Rates are per minute.
 */
export const BUILDINGS: BuildingDef[] = [
  // ------------------------------------------------------------------ core
  {
    id: 'command_center', name: 'Command Center', icon: '🛰️', category: 'utility', core: true,
    description: 'Your crashed escape pod — the heart of the colony. Upgrade it to advance your colony tier.',
    size: [3, 3], unlockTier: 0, cost: {}, buildTime: 0, hp: 1500, maxLevel: 1, solid: true, model: 'command_center',
    storage: { wood: 100, stone: 100, fiber: 50, food: 50, water: 50 }, research_rate: 1, housing: 1, maxCount: 1,
  },

  // ------------------------------------------------------------------ structure pieces
  { id: 'floor', name: 'Floor', icon: '⬜', category: 'structure', piece: 'floor', description: 'A floor tile. Enclose floors with walls to make a roofed room.', size: [1, 1], unlockTier: 0, cost: {}, costMult: 0.5, buildTime: 0.6, hp: 80, maxLevel: 1, solid: false, model: 'floor' },
  { id: 'wall', name: 'Wall', icon: '🧱', category: 'structure', piece: 'wall', description: 'Drag to build walls. Enclosed rooms get automatic roofs.', size: [1, 1], unlockTier: 0, cost: {}, costMult: 1, buildTime: 1, hp: 160, maxLevel: 1, solid: true, model: 'wall' },
  { id: 'door', name: 'Door', icon: '🚪', category: 'structure', piece: 'door', description: 'Colonists pass through. Aliens cannot.', size: [1, 1], unlockTier: 0, cost: {}, costMult: 1.2, buildTime: 1, hp: 140, maxLevel: 1, solid: false, model: 'door' },
  { id: 'window', name: 'Window', icon: '🪟', category: 'structure', piece: 'window', description: 'A wall with a view. Lets warm light out at night.', size: [1, 1], unlockTier: 0, cost: { fiber: 2 }, costMult: 1.1, buildTime: 1, hp: 120, maxLevel: 1, solid: true, model: 'window' },
  { id: 'fence', name: 'Fence', icon: '🪵', category: 'structure', piece: 'fence', description: 'A low fence to mark paths and farms.', size: [1, 1], unlockTier: 0, cost: {}, costMult: 0.4, buildTime: 0.5, hp: 60, maxLevel: 1, solid: true, model: 'fence' },
  { id: 'gate', name: 'Gate', icon: '⛩️', category: 'structure', piece: 'gate', description: 'A reinforced gate in your perimeter.', size: [1, 1], unlockTier: 1, cost: {}, costMult: 2, buildTime: 2, hp: 300, maxLevel: 1, solid: false, model: 'gate' },

  // ------------------------------------------------------------------ tier 0 facilities
  {
    id: 'shelter', name: 'Lean-to Shelter', icon: '⛺', category: 'housing', description: 'A cozy wooden shelter with two beds.',
    size: [2, 2], unlockTier: 0, cost: { wood: 20 }, buildTime: 4, hp: 200, maxLevel: 3, levelCostMult: 2, levelEffect: 0.5, solid: true, model: 'bunkhouse',
    housing: 2, comfort: 1,
  },
  {
    id: 'campfire', name: 'Campfire', icon: '🔥', category: 'food', description: 'Warmth, light and roasted berries. Colonists love it.',
    size: [1, 1], unlockTier: 0, cost: { wood: 10, stone: 5 }, buildTime: 3, hp: 100, maxLevel: 1, solid: true, model: 'campfire',
    entertainment: 2, produces: { food: 2 }, station: 'campfire',
  },
  {
    id: 'storage_crate', name: 'Storage Crate', icon: '📦', category: 'storage', description: 'Adds storage for basic resources.',
    size: [1, 1], unlockTier: 0, cost: { wood: 15 }, buildTime: 3, hp: 120, maxLevel: 5, levelCostMult: 1.8, levelEffect: 1, solid: true, model: 'crate',
    storage: { wood: 150, stone: 150, fiber: 100, food: 100, water: 100 },
  },
  {
    id: 'berry_patch', name: 'Berry Patch', icon: '🫐', category: 'food', description: 'A small farm plot. Farmers make it grow faster.',
    size: [2, 2], unlockTier: 0, cost: { wood: 15, fiber: 10 }, buildTime: 4, hp: 80, maxLevel: 5, levelCostMult: 1.7, levelEffect: 0.5, solid: false, model: 'farm_plot',
    produces: { food: 3 }, workers: { slots: 1, job: 'farmer', required: false },
  },
  {
    id: 'rain_collector', name: 'Rain Collector', icon: '🌧️', category: 'water', description: 'Collects rainwater automatically.',
    size: [1, 1], unlockTier: 0, cost: { wood: 15, fiber: 5 }, buildTime: 3, hp: 80, maxLevel: 5, levelCostMult: 1.7, levelEffect: 0.5, solid: true, model: 'rain_collector',
    produces: { water: 3 },
  },
  {
    id: 'workbench', name: 'Crafting Table', icon: '🪚', category: 'crafting', description: 'Craft tools, weapons and supplies.',
    size: [2, 1], unlockTier: 0, cost: { wood: 20, stone: 10 }, buildTime: 4, hp: 120, maxLevel: 1, solid: true, model: 'workbench',
    station: 'workbench', maxCount: 1,
  },
  {
    id: 'logging_camp', name: 'Logging Camp', icon: '🪓', category: 'production', description: 'A gatherer chops nearby trees for you, even while you are away.',
    size: [2, 2], unlockTier: 0, cost: { wood: 25, stone: 10 }, buildTime: 5, hp: 150, maxLevel: 5, levelCostMult: 1.8, levelEffect: 0.5, solid: true, model: 'logging_camp',
    produces: { wood: 6, fiber: 2 }, workers: { slots: 2, job: 'gatherer', required: true },
  },
  {
    id: 'quarry', name: 'Stone Quarry', icon: '⛏️', category: 'production', description: 'A miner cuts stone from the ground.',
    size: [2, 2], unlockTier: 0, cost: { wood: 30 }, buildTime: 5, hp: 150, maxLevel: 5, levelCostMult: 1.8, levelEffect: 0.5, solid: true, model: 'quarry',
    produces: { stone: 5 }, workers: { slots: 2, job: 'miner', required: true },
  },
  {
    id: 'research_desk', name: 'Research Desk', icon: '📓', category: 'research', description: 'Study the alien world. Scientists generate research points.',
    size: [1, 1], unlockTier: 0, cost: { wood: 25, stone: 15 }, buildTime: 4, hp: 100, maxLevel: 3, levelCostMult: 2, levelEffect: 0.5, solid: true, model: 'research_desk',
    research_rate: 3, workers: { slots: 1, job: 'scientist', required: false },
  },
  {
    id: 'spin_wheel', name: 'Lucky Wheel', icon: '🎡', category: 'utility', description: 'A salvaged reward wheel. One free spin every day!',
    size: [1, 1], unlockTier: 0, cost: { wood: 10 }, buildTime: 2, hp: 100, maxLevel: 1, maxCount: 1, solid: true, model: 'spin_wheel', spinWheel: true,
  },
  { id: 'lamp_post', name: 'Lantern', icon: '🏮', category: 'decor', description: 'Warm light. Colonists find it comforting.', size: [1, 1], unlockTier: 0, cost: { wood: 5, fiber: 2 }, buildTime: 1, hp: 50, maxLevel: 1, solid: false, model: 'lamp', comfort: 1 },
  { id: 'flower_bed', name: 'Flower Bed', icon: '🌼', category: 'decor', description: 'Alien flowers in neat rows.', size: [1, 1], unlockTier: 0, cost: { fiber: 6 }, buildTime: 1, hp: 30, maxLevel: 1, solid: false, model: 'plant', comfort: 1 },

  // ------------------------------------------------------------------ tier 0 defense
  { id: 'barricade', name: 'Wooden Barricade', icon: '🚧', category: 'defense', description: 'Sharpened logs that slow aliens down.', size: [1, 1], unlockTier: 0, cost: { wood: 8 }, buildTime: 1.5, hp: 220, maxLevel: 1, solid: true, model: 'barricade' },
  { id: 'spike_trap', name: 'Spike Trap', icon: '📌', category: 'defense', description: 'Hurts and slows aliens that walk over it.', size: [1, 1], unlockTier: 0, cost: { wood: 10, stone: 5 }, buildTime: 2, hp: 100, maxLevel: 3, levelCostMult: 1.8, levelEffect: 0.5, solid: false, model: 'spikes', trap: { dps: 8, slow: 0.3 } },
  {
    id: 'scrap_turret', name: 'Scrap Turret', icon: '🔫', category: 'defense', description: 'A hand-cranked turret built from pod scrap. Fires twice as fast when you stand next to it.',
    size: [1, 1], unlockTier: 0, cost: { wood: 30, stone: 20 }, buildTime: 5, hp: 250, maxLevel: 5, levelCostMult: 1.8, levelEffect: 0.4, solid: true, model: 'turret_basic',
    turret: { range: 7, damage: 9, fireRate: 1.6, projectile: 'bullet', manual: true },
  },
];
