/**
 * Colony Spirit & Festivals (sim/colony/spirit.ts): what a happy colony is worth once happiness tops out.
 *
 * From the Reinforced tier on, average happiness sits at 92–100, so decor, entertainment, medical care and the wish
 * mood bonus stopped mattering. Spirit gives them a job again: while the colony's average happiness is above
 * `threshold`, a 0..`full` meter fills during online play; when it is full, a Festival starts.
 *
 * Fill per online minute = perMinute × excess × (1 + amenity + medical + friendship), where
 *  - excess     = (happiness − threshold) / (100 − threshold), 0..1;
 *  - amenity    = decor + entertainment points per colonist × amenityPerPoint (up to amenityMax);
 *  - medical    = medical points × medicalPerPoint (up to medicalMax);
 *  - friendship = friendship hearts in the colony × perHeart (up to heartsMax);
 * and every granted wish adds `wish` at once.
 *
 * Sized with the pacing bot (tests/pacing): an engaged colony (happiness 98–100, 2–5 decor points per colonist, a
 * wish every 15–20 min) holds a festival every ~45–55 online minutes from Stone to Alloy and every ~40 at Nano, as
 * decor and friendships grow; a colony that ignores comfort and wishes every ~90. It fills online only: a festival is
 * something you are there for (it never waits at login or passes while the app is closed), and offline income stays
 * one tuned stream (balance.offlineHours / offlineResearchMinutes).
 */
export const SPIRIT_RULES = {
  /** Meter size. */
  full: 100,
  /** Average happiness above which the meter fills. */
  threshold: 75,
  /** Points per online minute at 100 happiness with no boosts. */
  perMinute: 1.2,
  amenityPerPoint: 0.1,
  amenityMax: 0.6,
  medicalPerPoint: 0.05,
  medicalMax: 0.15,
  perHeart: 0.02,
  heartsMax: 0.3,
  /** Points per granted wish. */
  wish: 10,
  /** Colony tier the meter opens at (the guided first session stays quiet). */
  minTier: 1,
  festival: {
    /** Online seconds. */
    seconds: 600,
    /** Production multiplier while it lasts (online only, like the ad boosts). */
    production: 1.25,
    /**
     * Tier supply crates in the festival chest (sim/chests.ts tierCrate), plus a Supply Cache from this tier on every
     * `cacheEvery`-th festival (a colony holds dozens over the weeks: its colonists and Nova cards stay a treat).
     */
    crates: 2,
    cacheFromTier: 2,
    cacheEvery: 5,
    /** Season XP. */
    xp: 40,
  },
} as const;

export type SpiritRules = typeof SPIRIT_RULES;
