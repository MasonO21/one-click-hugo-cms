import type { ItemDef } from './schema';

export const ITEMS: ItemDef[] = [
  { id: 'survival_tool', name: 'Survival Multitool', icon: '🔧', category: 'tool', slot: 'tool', tier: 0, description: 'Chops, mines and pries. Better than nothing!', stats: { gatherYield: 0, gatherSpeed: 0, toolTier: 1 } },
  { id: 'stone_axe', name: 'Stone Axe', icon: '🪓', category: 'tool', slot: 'tool', tier: 0, description: 'Gathers 50% more.', stats: { gatherYield: 0.5, gatherSpeed: 0.1, toolTier: 1 } },
  { id: 'flare_pistol', name: 'Flare Pistol', icon: '🔫', category: 'weapon', slot: 'weapon', tier: 0, description: 'Emergency pistol from the pod.', stats: { damage: 6, fireRate: 1.5, range: 12, projectile: 'bullet' } },
  { id: 'makeshift_rifle', name: 'Makeshift Rifle', icon: '🔫', category: 'weapon', slot: 'weapon', tier: 0, description: 'Scrap-built rifle. Reliable and loud.', stats: { damage: 12, fireRate: 2, range: 16, projectile: 'bullet' } },
  { id: 'small_backpack', name: 'Small Backpack', icon: '🎒', category: 'backpack', slot: 'backpack', tier: 0, description: 'Carry up to 80 resources.', stats: { capacity: 80 } },
  { id: 'fiber_vest', name: 'Fiber Vest', icon: '🦺', category: 'armor', slot: 'armor', tier: 0, description: '+30 max health.', stats: { hp: 30 } },
  { id: 'bandage', name: 'Bandage', icon: '🩹', category: 'consumable', tier: 0, description: 'Restores 40 health.', use: { heal: 40 } },
  { id: 'supply_crate', name: 'Supply Crate', icon: '🎁', category: 'crate', tier: 0, description: 'Open for resources.', use: { reward: { resources: { wood: 60, stone: 40, fiber: 30, food: 30 } } } },
];
