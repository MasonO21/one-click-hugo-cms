import type { ResourceDef } from './schema';

export const RESOURCES: ResourceDef[] = [
  // basic
  { id: 'wood', name: 'Wood', icon: '🪵', color: '#b5793f', category: 'basic', baseCapacity: 200, sort: 1, description: 'Chopped from trees. The backbone of every young colony.' },
  { id: 'stone', name: 'Stone', icon: '🪨', color: '#9aa3ad', category: 'basic', baseCapacity: 200, sort: 2, description: 'Mined from rocks. Sturdy and plentiful.' },
  { id: 'fiber', name: 'Fiber', icon: '🌿', color: '#8fc95a', category: 'basic', baseCapacity: 150, sort: 3, description: 'Plant fibers for rope, cloth and reinforcements.' },
  { id: 'food', name: 'Food', icon: '🍎', color: '#ef6b5b', category: 'basic', baseCapacity: 150, sort: 4, description: 'Keeps colonists fed and happy.' },
  { id: 'water', name: 'Water', icon: '💧', color: '#4fb3f6', category: 'basic', baseCapacity: 150, sort: 5, description: 'Clean water for colonists and crops.' },
  // intermediate
  { id: 'iron', name: 'Iron', icon: '⛓️', color: '#c9a48b', category: 'intermediate', baseCapacity: 100, sort: 6, description: 'Iron ore, smelted into steel.' },
  { id: 'copper', name: 'Copper', icon: '🟠', color: '#e08a4c', category: 'intermediate', baseCapacity: 100, sort: 7, description: 'Conductive metal used for wiring and electronics.' },
  { id: 'coal', name: 'Coal', icon: '⚫', color: '#4a4a52', category: 'intermediate', baseCapacity: 100, sort: 8, description: 'Fuel for smelters and generators.' },
  { id: 'steel', name: 'Steel', icon: '🔩', color: '#aeb9c7', category: 'intermediate', baseCapacity: 80, sort: 9, description: 'Strong refined metal for industrial construction.' },
  { id: 'electronics', name: 'Electronics', icon: '🔌', color: '#5fd4a0', category: 'intermediate', baseCapacity: 60, sort: 10, description: 'Circuits and components for machines.' },
  { id: 'biomass', name: 'Biomass', icon: '🧫', color: '#9be36b', category: 'intermediate', baseCapacity: 60, sort: 11, description: 'Strange glowing organics from the Toxic Marsh.' },
  // advanced
  { id: 'crystal', name: 'Alien Crystal', icon: '💎', color: '#b48cff', category: 'advanced', baseCapacity: 50, sort: 12, description: 'Humming crystals that store enormous energy.' },
  { id: 'alloy', name: 'Advanced Alloy', icon: '🛡️', color: '#7fc8e8', category: 'advanced', baseCapacity: 40, sort: 13, description: 'Crystal-infused steel. Light and nearly indestructible.' },
  { id: 'energy_cell', name: 'Energy Cell', icon: '🔋', color: '#ffd84a', category: 'advanced', baseCapacity: 40, sort: 14, description: 'Portable power for advanced machines and weapons.' },
  { id: 'nano', name: 'Nano-Material', icon: '✨', color: '#5ef2ff', category: 'advanced', baseCapacity: 30, sort: 15, description: 'Self-assembling material from nano-forges.' },
  { id: 'titanium', name: 'Titanium', icon: '🌟', color: '#e8eef6', category: 'advanced', baseCapacity: 30, sort: 16, description: 'The ultimate building material, found in the Titanium Highlands.' },
];
