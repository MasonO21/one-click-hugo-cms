import type { BalanceDef } from './schema';

/**
 * Global balance constants. Pacing targets (engaged player, online + offline) are validated in
 * tests/data.pacing.test.ts: Reinforced ~15 min, Stone ~1 h, Steel ~3 h, Alloy ~6 h, Nano ~12 h, Titanium ~24-30 h.
 */
export const BALANCE: BalanceDef = {
  dayLength: 720,
  offlineHours: 8,
  /** Offline is slightly slower than online so playing still feels good, and the Welcome Back ad doubles it. */
  offlineEfficiency: 0.8,
  /** Welcome Back may overflow storage up to 3x capacity — returning should always feel generous. */
  offlineStorageMult: 3,
  /** Labs bank about two hours of research points while you are away (Welcome Back says when they filled up). */
  offlineResearchMinutes: 120,
  autosaveSeconds: 20,
  playerSpeed: 7,
  playerHp: 100,
  /** Seconds between manual gather hits: snappy, but a tree still takes a few satisfying swings. */
  gatherInterval: 0.7,
  interactRange: 3.2,
  backpackCapacity: 80,
  colonistSpeed: 3.2,
  foodPerColonistPerMin: 0.5,
  waterPerColonistPerMin: 0.5,
  happiness: {
    base: 30,
    bed: 15,
    food: 12,
    water: 12,
    power: 6,
    comfortPerPoint: 2,
    comfortMax: 10,
    entertainmentPerPoint: 2,
    entertainmentMax: 8,
    safety: 5,
    medical: 2,
  },
  specialtyBonus: 0.5,
  skillBonusPerLevel: 0.15,
  recruitCandidates: 3,
  recruitRefreshMinutes: 60,
  recruitCost: {
    common: { food: 25 },
    rare: { food: 80, water: 50, wood: 40 },
    epic: { food: 220, water: 150, electronics: 25 },
    legendary: { food: 700, water: 450, crystal: 60 },
  },
  firstInvasionDelay: 1200,
  warningSeconds: 120,
  repairDelay: 3,
  repairRate: 0.08,
  /** Counts scale by 1 + waveScaling x wavesAtThisTier (kept gentle: long tiers must never snowball). */
  waveScaling: 0.08,
  eventIntervalMin: 480,
  eventIntervalMax: 900,
  removeRefund: 1,
  freeCrateHours: 4,
};
