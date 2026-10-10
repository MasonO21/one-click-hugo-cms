import { PACING, pace, roundCost, scaleBag } from './pacing';
import type { AlienDef, InvasionDef } from './schema';

/**
 * Aliens: the seven spec types plus tougher late-game variants (same model, new colour/stats) and three bosses.
 * Alien HP does not scale per tier, so later tiers lean on heavier variants and bigger groups. Flyers first appear
 * at tier 4 (anti-air research is available from tier 3; MG turrets and missiles also hit air).
 */
export const ALIENS: AlienDef[] = [
  // ------------------------------------------------------------------ the seven classics
  {
    id: 'crawler', name: 'Crawler', model: 'crawler', color: '#7be04a', scale: 0.7, hp: 30, speed: 1.6, damage: 6, attackRate: 1, range: 0.7,
    prefers: 'any', drop: { fiber: 2 }, description: 'Small, fast and more curious than dangerous.',
  },
  {
    id: 'spitter', name: 'Spitter', model: 'spitter', color: '#c56cf0', scale: 0.9, hp: 45, speed: 1.1, damage: 8, attackRate: 0.6, range: 5, ranged: true,
    prefers: 'defense', drop: { biomass: 1, fiber: 2 }, description: 'Lobs acidic goo at defenses from range.',
  },
  {
    id: 'brute', name: 'Brute', model: 'brute', color: '#e07a4a', scale: 1.5, hp: 260, speed: 0.8, damage: 28, attackRate: 0.5, range: 0.9,
    prefers: 'wall', drop: { stone: 6, fiber: 4 }, description: 'Big, grumpy and fond of headbutting walls. Slow enough to shoot all day.',
  },
  {
    id: 'burrower', name: 'Burrower', model: 'burrower', color: '#b8905a', scale: 1, hp: 120, speed: 1.3, damage: 16, attackRate: 0.8, range: 0.8, burrow: true,
    prefers: 'any', drop: { iron: 4, coal: 3 }, description: 'Pops up from underground right inside your colony. Keep a turret near the middle.',
  },
  {
    id: 'flyer', name: 'Flyer', model: 'flyer', color: '#5ec8f2', scale: 0.9, hp: 100, speed: 2.4, damage: 10, attackRate: 1, range: 1, flying: true,
    prefers: 'any', drop: { fiber: 4, electronics: 1 }, description: 'Swoops over your walls like they are not even there. Bring anti-air.',
  },
  {
    id: 'queen', name: 'Swarm Queen', model: 'queen', color: '#f06aa8', scale: 2, hp: 1100, speed: 0.7, damage: 24, attackRate: 0.6, range: 1.2,
    spawns: { alien: 'crawler', every: 8, count: 3 }, prefers: 'core', drop: { biomass: 20, crystal: 4 }, description: 'A regal, dramatic matriarch who keeps summoning little crawlers. Take her down first.',
  },
  {
    id: 'titan', name: 'Titan', model: 'titan', color: '#c24a3a', scale: 3.2, hp: 6000, speed: 0.55, damage: 110, attackRate: 0.4, range: 1.8,
    prefers: 'wall', drop: { steel: 40, crystal: 10, alloy: 5 }, description: 'A mountain of muscle that thumps along flattening walls. A truly magnificent target.',
  },

  // ------------------------------------------------------------------ tougher variants (same silhouettes, scarier colours)
  {
    id: 'razor_crawler', name: 'Razor Crawler', model: 'crawler', color: '#e0d44a', scale: 0.85, hp: 110, speed: 2, damage: 12, attackRate: 1.4, range: 0.7,
    prefers: 'any', drop: { fiber: 3, iron: 2 }, description: 'A crawler with spiky armor and a bad attitude. Very quick.',
  },
  {
    id: 'acid_spitter', name: 'Acid Spitter', model: 'spitter', color: '#9cf04a', scale: 1.15, hp: 160, speed: 1, damage: 18, attackRate: 0.7, range: 6, ranged: true,
    prefers: 'defense', drop: { biomass: 3, copper: 3 }, description: 'Glows radioactive green and sneers from far away.',
  },
  {
    id: 'deep_burrower', name: 'Deep Burrower', model: 'burrower', color: '#8a6a9a', scale: 1.4, hp: 480, speed: 1.2, damage: 40, attackRate: 0.7, range: 1, burrow: true,
    prefers: 'defense', drop: { iron: 10, coal: 8, crystal: 1 }, description: 'Tunnels up from way below with a lot of attitude and teeth.',
  },
  {
    id: 'stormwing', name: 'Stormwing', model: 'flyer', color: '#6a7cf2', scale: 1.4, hp: 420, speed: 2.6, damage: 28, attackRate: 1, range: 1.2, flying: true,
    prefers: 'defense', drop: { electronics: 3, energy_cell: 1 }, description: 'A huge, crackling flyer with lightning in its wings.',
  },

  // ------------------------------------------------------------------ bosses (approachable and very rewarding)
  {
    id: 'elder_brute', name: 'Elder Brute', model: 'brute', color: '#a8402a', scale: 2.5, hp: 2200, speed: 0.7, damage: 70, attackRate: 0.5, range: 1.1, boss: true,
    prefers: 'wall', drop: { stone: 80, iron: 60, steel: 15 }, description: 'The grandfather of all brutes. Wears a necklace of old turret bolts.',
  },
  {
    id: 'hive_mother', name: 'Hive Mother', model: 'queen', color: '#d03a8a', scale: 3, hp: 9000, speed: 0.6, damage: 60, attackRate: 0.6, range: 1.4, boss: true,
    spawns: { alien: 'razor_crawler', every: 7, count: 4 }, prefers: 'core', drop: { biomass: 80, crystal: 30, nano: 3 }, description: 'The Swarm Queen of queens. Her brood never stops, so neither should your turrets.',
  },
  {
    id: 'titan_prime', name: 'Titan Prime', model: 'titan', color: '#7a2a8a', scale: 4.6, hp: 40000, speed: 0.5, damage: 250, attackRate: 0.4, range: 2.2, boss: true,
    prefers: 'core', drop: { titanium: 20, nano: 10, energy_cell: 20 }, description: 'The final, colossal guardian of the planet. Bring everything you have and enjoy the fireworks.',
  },
];

/**
 * One table per colony tier. Counts are multiplied by 1 + BalanceDef.waveScaling x wavesAtThisTier. Rewards are
 * the base victory chest (x2 with the bonus-spoils ad). Bosses join every Nth wave.
 */
const AUTHORED_INVASIONS: InvasionDef[] = [
  {
    tier: 0,
    groups: [
      { alien: 'crawler', count: 5, delay: 0 },
      { alien: 'crawler', count: 3, delay: 12 },
    ],
    reward: { resources: { wood: 120, stone: 80, fiber: 40 }, rp: 20, nova: 1, xp: 50 },
  },
  {
    tier: 1,
    groups: [
      { alien: 'crawler', count: 6, delay: 0 },
      { alien: 'crawler', count: 5, delay: 14 },
      { alien: 'spitter', count: 2, delay: 26 },
      { alien: 'brute', count: 1, delay: 40 },
    ],
    reward: { resources: { wood: 240, stone: 160, fiber: 100, food: 60 }, rp: 45, nova: 1, xp: 70 },
  },
  {
    tier: 2,
    groups: [
      { alien: 'crawler', count: 8, delay: 0 },
      { alien: 'crawler', count: 6, delay: 14 },
      { alien: 'spitter', count: 4, delay: 24 },
      { alien: 'brute', count: 2, delay: 36 },
    ],
    boss: { alien: 'elder_brute', every: 5 },
    reward: { resources: { stone: 320, iron: 120, coal: 70, wood: 200, food: 80 }, rp: 90, nova: 2, xp: 90 },
  },
  {
    tier: 3,
    groups: [
      { alien: 'crawler', count: 14, delay: 0 },
      { alien: 'razor_crawler', count: 12, delay: 12 },
      { alien: 'spitter', count: 6, delay: 22 },
      { alien: 'brute', count: 6, delay: 32 },
      { alien: 'burrower', count: 5, delay: 45 },
    ],
    boss: { alien: 'elder_brute', every: 4 },
    reward: { resources: { steel: 120, iron: 220, copper: 130, coal: 90, stone: 300, electronics: 20 }, rp: 180, nova: 2, xp: 110 },
  },
  {
    tier: 4,
    groups: [
      { alien: 'crawler', count: 12, delay: 0 },
      { alien: 'razor_crawler', count: 10, delay: 10 },
      { alien: 'spitter', count: 6, delay: 18 },
      { alien: 'acid_spitter', count: 4, delay: 24 },
      { alien: 'flyer', count: 6, delay: 28 },
      { alien: 'brute', count: 4, delay: 30 },
      { alien: 'burrower', count: 5, delay: 40 },
      { alien: 'queen', count: 1, delay: 60 },
    ],
    boss: { alien: 'hive_mother', every: 5 },
    reward: { resources: { alloy: 55, steel: 200, electronics: 60, crystal: 40, copper: 140 }, rp: 380, nova: 3, xp: 140 },
  },
  {
    tier: 5,
    groups: [
      { alien: 'crawler', count: 16, delay: 0 },
      { alien: 'razor_crawler', count: 14, delay: 10 },
      { alien: 'acid_spitter', count: 8, delay: 20 },
      { alien: 'flyer', count: 8, delay: 24 },
      { alien: 'brute', count: 6, delay: 28 },
      { alien: 'burrower', count: 6, delay: 36 },
      { alien: 'deep_burrower', count: 3, delay: 42 },
      { alien: 'stormwing', count: 3, delay: 44 },
      { alien: 'queen', count: 2, delay: 55 },
      { alien: 'titan', count: 1, delay: 90 },
    ],
    boss: { alien: 'hive_mother', every: 4 },
    reward: { resources: { alloy: 120, nano: 25, energy_cell: 50, electronics: 90, crystal: 60 }, rp: 800, nova: 3, xp: 180 },
  },
  {
    tier: 6,
    groups: [
      { alien: 'razor_crawler', count: 24, delay: 0 },
      { alien: 'acid_spitter', count: 12, delay: 12 },
      { alien: 'flyer', count: 12, delay: 20 },
      { alien: 'brute', count: 8, delay: 20 },
      { alien: 'stormwing', count: 8, delay: 26 },
      { alien: 'deep_burrower', count: 6, delay: 30 },
      { alien: 'queen', count: 3, delay: 50 },
      { alien: 'titan', count: 2, delay: 70 },
    ],
    boss: { alien: 'titan_prime', every: 3 },
    reward: { resources: { titanium: 70, nano: 45, energy_cell: 90, alloy: 150, electronics: 120 }, rp: 1800, nova: 4, xp: 240 },
  },
];

/** Victory chests grow with the colony like mission rewards do (data/pacing.ts `missionReward`). */
export const INVASIONS: InvasionDef[] = AUTHORED_INVASIONS.map((inv) => {
  const m = pace(PACING.missionReward, inv.tier);
  if (m === 1) return inv;
  return { ...inv, reward: { ...inv.reward, resources: scaleBag(inv.reward.resources, m), ...(inv.reward.rp ? { rp: roundCost(inv.reward.rp * m) } : {}) } };
});
