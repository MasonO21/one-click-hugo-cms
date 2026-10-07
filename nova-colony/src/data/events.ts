import type { WorldEventDef } from './schema';

export const WORLD_EVENTS: WorldEventDef[] = [
  { id: 'supply_drop', name: 'Supply Drop', icon: '🪂', kind: 'drop', minTier: 0, weight: 3, duration: 600, description: 'A supply pod is falling nearby!', poi: 'supply_cache', reward: { resources: { wood: 80, stone: 60, food: 40, water: 40 }, nova: 2, xp: 20 } },
  { id: 'meteor_crash', name: 'Meteor Crash', icon: '☄️', kind: 'meteor', minTier: 1, weight: 2, duration: 900, description: 'A meteor full of crystals crashed in the wilds.', reward: { resources: { crystal: 15, iron: 30 }, xp: 30 } },
];
