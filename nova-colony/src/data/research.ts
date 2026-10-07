import type { ResearchDef } from './schema';

/** Technology tree (seed — expanded by the content pass to cover all categories & tiers). */
export const RESEARCH: ResearchDef[] = [
  {
    id: 'tier_reinforced', name: 'Reinforced Wood', icon: '🪵', category: 'construction', tier: 0, cost: 25, requires: [], pos: [0, 0],
    description: 'Lash and brace timber. Unlocks the Reinforced Wood colony tier.',
  },
  {
    id: 'sharper_tools', name: 'Sharper Tools', icon: '🪓', category: 'exploration', tier: 0, cost: 15, requires: [], pos: [0, 0],
    description: 'Gather 25% more from every node.', effects: [{ stat: 'gatherYield', add: 0.25 }],
  },
  {
    id: 'tier_stone', name: 'Masonry', icon: '🪨', category: 'construction', tier: 1, cost: 120, requires: ['tier_reinforced'], pos: [1, 0],
    description: 'Cut and stack stone. Unlocks the Stone colony tier.',
  },
];
