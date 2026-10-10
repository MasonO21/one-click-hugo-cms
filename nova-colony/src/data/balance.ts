import type { BalanceDef } from './schema';

/**
 * Global balance constants. The cost side of the four-week pacing lives in data/pacing.ts; tests/data.pacing.test.ts and
 * the pacing bot (scripts/pacing-bot.mjs) check the schedule: an engaged player (five 20-minute sessions a day) reaches
 * Stone at the end of day 1, Steel on day 3, Alloy on day 6-7, Nano on day 13-14 and Titanium in about four weeks.
 */
export const BALANCE: BalanceDef = {
  dayLength: 720,
  offlineHours: 8,
  /**
   * The colony keeps working at a relaxed pace while the app is closed. Five short sessions a day leave it closed
   * ~93% of the time, so Welcome Back would otherwise out-earn playing: at this rate it is about a third of a day's
   * income (the target is <= 40% from Stone on), and the Welcome Back ad still doubles it...
   */
  offlineEfficiency: 0.1,
  /** ...after the first ten minutes away, which run at full speed (an app switch or a quick break costs nothing). */
  offlineFullMinutes: 10,
  /** Welcome Back and rewards may overflow storage up to 2x capacity — returning should always feel generous. */
  offlineStorageMult: 2,
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
  /** Legacy (the board used to reroll on this timer); arrivals now follow recruitArrivalMinutes. */
  recruitRefreshMinutes: 60,
  /** A new survivor answers the radio this often while a seat on the board is free, by tier (sim/colony/recruitBoard.ts). */
  recruitArrivalMinutes: [20, 200, 900, 2880, 10080, 20160, 720],
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
  /** Counts scale by 1 + waveScaling x wavesAtThisTier (kept gentle: long tiers must never snowball)... */
  waveScaling: 0.08,
  /** ...and only the first few raids of a tier grow them (a tier lasts days; the turrets keep growing instead). */
  waveScalingWaves: 4,
  eventIntervalMin: 480,
  eventIntervalMax: 900,
  removeRefund: 1,
  freeCrateHours: 4,
};
