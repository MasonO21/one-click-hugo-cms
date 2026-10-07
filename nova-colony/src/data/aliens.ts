import type { AlienDef, InvasionDef } from './schema';

export const ALIENS: AlienDef[] = [
  {
    id: 'crawler', name: 'Crawler', model: 'crawler', color: '#7be04a', scale: 0.7, hp: 30, speed: 1.6, damage: 6, attackRate: 1, range: 0.7,
    prefers: 'any', drop: { fiber: 2 }, description: 'Small, fast and more curious than dangerous.',
  },
  {
    id: 'spitter', name: 'Spitter', model: 'spitter', color: '#c56cf0', scale: 0.9, hp: 45, speed: 1.1, damage: 8, attackRate: 0.6, range: 5, ranged: true,
    prefers: 'defense', drop: { biomass: 1, fiber: 2 }, description: 'Lobs acidic goo at defenses from range.',
  },
];

export const INVASIONS: InvasionDef[] = [
  {
    tier: 0,
    groups: [
      { alien: 'crawler', count: 5, delay: 0 },
      { alien: 'crawler', count: 3, delay: 12 },
    ],
    reward: { resources: { wood: 120, stone: 80, fiber: 40 }, rp: 20, nova: 5, xp: 50 },
  },
];
