import type { MissionDef } from './schema';

/**
 * Main chain = the guided first 15 minutes, then a gentle story through all tiers.
 * Timeline target (see docs/DESIGN.md "First 15 minutes"):
 *   0-2 gather wood · 2-4 shelter · 4-6 campfire + storage · 6-8 rescue survivor ·
 *   8-10 colonist works logging camp · 10-12 first turret · 12 warning · 13 attack ·
 *   14 reward chest · 15 Reinforced Wood research available.
 */
export const FIRST_MISSION = 'm01_wood';

export const MISSIONS: MissionDef[] = [
  {
    id: 'm01_wood', chain: 'main', name: 'Timber!', description: 'Gather 15 Wood from the bubble trees near your pod.',
    type: 'gather', target: 'wood', count: 15, reward: { resources: { wood: 10 }, xp: 10 }, next: ['m02_shelter'],
    hint: 'Walk up to a tree — you will chop it automatically.', guide: { kind: 'node', ref: 'tree_round' },
  },
  {
    id: 'm02_shelter', chain: 'main', name: 'A Roof Overhead', description: 'Build a Lean-to Shelter.',
    type: 'build', target: 'shelter', count: 1, reward: { resources: { wood: 15, stone: 10 }, xp: 15 }, next: ['m03_campfire'],
    hint: 'Open the Build menu and place a Lean-to Shelter.', guide: { kind: 'build_menu', ref: 'shelter' },
  },
  {
    id: 'm03_campfire', chain: 'main', name: 'Warm Glow', description: 'Gather some stone and build a Campfire.',
    type: 'build', target: 'campfire', count: 1, reward: { resources: { food: 15 }, xp: 15 }, next: ['m04_storage'],
    hint: 'Mine a boulder for stone, then build a Campfire.', guide: { kind: 'build_menu', ref: 'campfire' },
  },
  {
    id: 'm04_storage', chain: 'main', name: 'Stash It', description: 'Build a Storage Crate.',
    type: 'build', target: 'storage_crate', count: 1, reward: { resources: { wood: 20 }, xp: 15 }, next: ['m05_rescue'],
    hint: 'Storage increases how much you can hold.', guide: { kind: 'build_menu', ref: 'storage_crate' },
    onComplete: { spawnSurvivor: true },
  },
  {
    id: 'm05_rescue', chain: 'main', name: 'Not Alone', description: 'A survivor signal! Rescue them from their camp.',
    type: 'rescue', target: '*', count: 1, reward: { resources: { food: 20, water: 20 }, xp: 25 }, next: ['m06_logging'],
    hint: 'Follow the marker to the survivor camp and tap Rescue.', guide: { kind: 'poi', ref: 'survivor_camp' },
    onComplete: { celebrate: 'Your first colonist joined!' },
  },
  {
    id: 'm06_logging', chain: 'main', name: 'Many Hands', description: 'Build a Logging Camp — your colonist will work it automatically.',
    type: 'build', target: 'logging_camp', count: 1, reward: { resources: { stone: 20, fiber: 10 }, xp: 20 }, next: ['m07_assign'],
    hint: 'Build a Logging Camp near some trees.', guide: { kind: 'build_menu', ref: 'logging_camp' },
  },
  {
    id: 'm07_assign', chain: 'main', name: 'Put to Work', description: 'Have a colonist working a job.',
    type: 'assign', target: '*', count: 1, reward: { resources: { wood: 25 }, xp: 15 }, next: ['m08_turret'],
    hint: 'Colonists take free jobs automatically. Tap a building to manage workers.', guide: { kind: 'building', ref: 'logging_camp' },
  },
  {
    id: 'm08_turret', chain: 'main', name: 'Something Stirs', description: 'Strange noises at night... Build a Scrap Turret.',
    type: 'build', target: 'scrap_turret', count: 1, reward: { resources: { wood: 20, stone: 20 }, xp: 20 }, next: ['m09_defend'],
    hint: 'Place the turret between your camp and the wilds.', guide: { kind: 'build_menu', ref: 'scrap_turret' },
    onComplete: { attack: { delay: 20, warning: 60 } },
  },
  {
    id: 'm09_defend', chain: 'main', name: 'First Contact', description: 'Defend the colony from the alien attack.',
    type: 'defend', target: '*', count: 1, reward: { rp: 25, resources: { wood: 60, stone: 40 }, nova: 10, xp: 50 }, next: ['m10_research'],
    hint: 'Stand near your turret — it fires twice as fast with you beside it!', guide: { kind: 'building', ref: 'scrap_turret' },
    onComplete: { celebrate: 'Colony defended!' },
  },
  {
    id: 'm10_research', chain: 'main', name: 'Stronger Timber', description: 'Research Reinforced Wood.',
    type: 'research', target: 'tier_reinforced', count: 1, reward: { resources: { fiber: 40 }, xp: 25 }, next: ['m11_tier1'],
    hint: 'Open Research and unlock Reinforced Wood.', guide: { kind: 'ui', ref: 'research' },
  },
  {
    id: 'm11_tier1', chain: 'main', name: 'A Real Settlement', description: 'Upgrade your colony to Reinforced Wood.',
    type: 'tier', target: '*', count: 1, reward: { nova: 15, xp: 60, resources: { wood: 100, stone: 60 } }, next: [],
    hint: 'Tap your Command Center and upgrade the colony tier.', guide: { kind: 'building', ref: 'command_center' },
    onComplete: { celebrate: 'Reinforced Wood tier reached! The colony expands.' },
  },
  // side missions (always available alongside the main chain)
  { id: 's_farm', chain: 'side', name: 'Green Thumb', description: 'Build a Berry Patch.', type: 'build', target: 'berry_patch', count: 1, reward: { resources: { food: 30 }, xp: 10 } },
  { id: 's_water', chain: 'side', name: 'Rainy Day', description: 'Build a Rain Collector.', type: 'build', target: 'rain_collector', count: 1, reward: { resources: { water: 30 }, xp: 10 } },
  // daily pool
  { id: 'd_gather_wood', chain: 'daily', name: 'Daily: Lumberjack', description: 'Gather 200 Wood.', type: 'gather', target: 'wood', count: 200, reward: { nova: 3, xp: 40 } },
  { id: 'd_kill', chain: 'daily', name: 'Daily: Pest Control', description: 'Defeat 15 aliens.', type: 'kill', target: '*', count: 15, reward: { nova: 3, xp: 40 } },
  { id: 'd_build', chain: 'daily', name: 'Daily: Builder', description: 'Build 10 structures.', type: 'build', target: '*', count: 10, reward: { nova: 3, xp: 40 } },
];

export const DAILY_MISSION_POOL = ['d_gather_wood', 'd_kill', 'd_build'];
