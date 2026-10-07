import type { RecipeDef } from './schema';

export const RECIPES: RecipeDef[] = [
  { id: 'r_stone_axe', name: 'Stone Axe', category: 'tools', station: 'workbench', inputs: { wood: 15, stone: 10, fiber: 5 }, outputs: { items: { stone_axe: 1 } }, time: 5, unlockTier: 0 },
  { id: 'r_makeshift_rifle', name: 'Makeshift Rifle', category: 'weapons', station: 'workbench', inputs: { wood: 25, stone: 20, fiber: 10 }, outputs: { items: { makeshift_rifle: 1 } }, time: 8, unlockTier: 0 },
  { id: 'r_fiber_vest', name: 'Fiber Vest', category: 'armor', station: 'workbench', inputs: { fiber: 25, wood: 5 }, outputs: { items: { fiber_vest: 1 } }, time: 6, unlockTier: 0 },
  { id: 'r_bandage', name: 'Bandage', category: 'medical', station: 'hand', inputs: { fiber: 5 }, outputs: { items: { bandage: 1 } }, time: 2, unlockTier: 0 },
  { id: 'r_roast_berries', name: 'Roast Berries', category: 'food', station: 'campfire', inputs: { wood: 2 }, outputs: { resources: { food: 6 } }, time: 4, unlockTier: 0 },
];
