import type { ModifierStat } from './schema';

/**
 * Research Mastery: repeatable research for the long tail (sim/mastery.ts has the rules, ResearchSystem spends the
 * points, econ/modifiers.ts applies the bonus).
 *
 * The tech tree runs dry for most of a tier while research points pile up (the audit saw 7k–200k unspent mid-game and
 * 1M by Titanium). Mastery turns that backlog into small, lasting bonuses a builder cares about. Six lines open from
 * the Stone tier: each level adds `per` to one modifier stat and costs MASTERY_GROWTH times the level before, from a
 * `base` sized to a few minutes of research at the tier where the line opens. Levels have no cap; past
 * MASTERY_SOFT_CAP each level gives half its bonus, and the cost keeps growing, so it stays a long goal after Titanium.
 */
export interface MasteryLine {
  id: string;
  name: string;
  /** Emoji fallback. */
  icon: string;
  /** ResearchDef id whose painted icon the line borrows (art/research/<id>.webp). */
  art: string;
  stat: ModifierStat;
  /** Bonus per level (0.03 = +3%). */
  per: number;
  /** Colony tier the line opens at. */
  tier: number;
  /** RP cost of level 1. */
  base: number;
  /** What the bonus does, for "+12% <label>". */
  label: string;
  blurb: string;
}

/** Each level costs this much more than the one before. */
export const MASTERY_GROWTH = 1.5;
/** From the level after this one, each level adds half its bonus. */
export const MASTERY_SOFT_CAP = 20;
export const MASTERY_SOFT_FACTOR = 0.5;

export const MASTERY_LINES: MasteryLine[] = [
  { id: 'production', name: 'Production', icon: '🏭', art: 'mass_production', stat: 'production', per: 0.03, tier: 2, base: 300, label: 'production', blurb: 'Every producer in the colony makes a little more.' },
  { id: 'logistics', name: 'Logistics', icon: '📦', art: 'automated_logistics', stat: 'storage', per: 0.05, tier: 2, base: 300, label: 'storage', blurb: 'Tighter stacking: every store holds more.' },
  { id: 'construction', name: 'Construction', icon: '🏗️', art: 'scaffolding', stat: 'buildSpeed', per: 0.05, tier: 2, base: 250, label: 'build speed', blurb: 'Better jigs and drills. Everything goes up faster.' },
  { id: 'defense', name: 'Defense', icon: '🛡️', art: 'machine_guns', stat: 'turretDamage', per: 0.03, tier: 3, base: 900, label: 'turret damage', blurb: 'Tuned barrels and sharper targeting for every turret.' },
  { id: 'crew', name: 'Crew', icon: '🧑‍🔧', art: 'recruitment_drive', stat: 'workSpeed', per: 0.03, tier: 3, base: 900, label: 'colonist work speed', blurb: 'Training and good habits: colonists work a little faster.' },
  { id: 'expeditions', name: 'Expeditions', icon: '🧭', art: 'heavy_haulers', stat: 'expeditionHaul', per: 0.04, tier: 3, base: 900, label: 'expedition haul', blurb: 'Better maps and packing. Squads bring more home.' },
];
