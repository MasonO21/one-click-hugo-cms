import type { ModifierStat, Rarity } from './schema';

/**
 * Exploration that keeps paying off: tier-scaled POI loot and region surveys (sim/world/poiLoot.ts, sim/survey.ts).
 *
 * POI LOOT. A point of interest is worth `minutes` of a reference colony's output at the colony's CURRENT tier (the
 * expedition value model, data/expeditions.ts `reference`), so a ruin opened at Steel is worth the walk just like one
 * opened at Wood. The goods come from the POI's own `yields` (its flavour: a wreck is parts and electronics, a supply
 * cache is food and basics), `picks` of them per haul, chosen by weight:
 *  - goods the colony has outgrown weigh less (ExpeditionRules relevance), goods one tier ahead show up at half
 *    weight (a peek at what comes next) and anything further ahead never does;
 *  - each good is valued at the colony's tier and never brings more than 60% of its storage (like chest cards).
 * Items, Nova, colonists and season XP of the POI's own `reward` come on top, unchanged.
 * A long sweep thins out: past LOOT_FRESH_PER_HOUR points of interest opened within an hour (real time), each further
 * haul's goods shrink (LOOT_THIN_STEP, never below LOOT_THIN_FLOOR), so restocking caches top the colony up instead of
 * replacing its production for a player who farms every cache on the planet with a hover bike.
 * Restocking (PoiDef.respawn > 0) runs on an absolute clock, so time away counts. One-off story POIs (vaults, ruins,
 * labs, cabins, rescues) stay one-off.
 *
 * REGION SURVEY. Every region has a survey meter: how much of its land is charted (fog revealed; 90% counts as all of
 * it), how many of its points of interest were explored, and how many of its kinds of resource node went into the
 * field guide. Milestones at 25 / 50 / 75 / 100% wait on the Map for a tap on Claim: a cache of the region's goods,
 * a survivor who lives out there, a keepsake cosmetic, and finally a permanent perk.
 */

export interface PoiLootDef {
  /** Worth in minutes of a reference colony's output at the colony's tier. */
  minutes: number;
  /** Most goods in one haul (picked by weight without repeats). */
  picks: number;
  /** Themed goods by weight ('rp' = research points). */
  yields: Record<string, number>;
}

export const POI_LOOT: Record<string, PoiLootDef> = {
  // ---- caches (restock)
  supply_cache: { minutes: 2.5, picks: 3, yields: { food: 3, water: 1.5, wood: 2, stone: 2, fiber: 1.5, steel: 1.5, electronics: 1, energy_cell: 0.6, alloy: 0.5, titanium: 0.3 } },
  hidden_stash: { minutes: 3, picks: 2, yields: { iron: 2, copper: 2, coal: 1.5, fiber: 1, crystal: 1, steel: 1.2, electronics: 1, alloy: 1, nano: 0.4, titanium: 0.4 } },
  titanium_cache: { minutes: 6, picks: 3, yields: { titanium: 3, nano: 1.5, energy_cell: 1.5, alloy: 1 } },
  mining_outpost: { minutes: 5, picks: 3, yields: { iron: 3, copper: 3, coal: 2, stone: 1, steel: 2, crystal: 1, alloy: 0.8, titanium: 0.8 } },
  crashed_ship: { minutes: 5, picks: 3, yields: { iron: 2, copper: 2, electronics: 2.5, steel: 2, energy_cell: 1, alloy: 1, rp: 1 } },
  derelict_freighter: { minutes: 8, picks: 3, yields: { steel: 1.5, electronics: 2, copper: 1, alloy: 2, energy_cell: 1.5, nano: 1, titanium: 1, rp: 1 } },
  alien_nest: { minutes: 5, picks: 2, yields: { biomass: 3, crystal: 2, fiber: 1, nano: 0.5 } },
  hive_nest: { minutes: 10, picks: 3, yields: { biomass: 2, crystal: 2, alloy: 1.5, nano: 1.5 } },
  // ---- one-off structures and lore
  abandoned_cabin: { minutes: 6, picks: 3, yields: { wood: 3, fiber: 2, food: 2, stone: 1, iron: 1, steel: 1, electronics: 0.6, alloy: 0.4 } },
  alien_ruin: { minutes: 10, picks: 2, yields: { rp: 6, crystal: 2, alloy: 1, nano: 0.5 } },
  ancient_vault: { minutes: 20, picks: 3, yields: { rp: 5, crystal: 2, alloy: 2, energy_cell: 1, nano: 1 } },
  research_outpost: { minutes: 10, picks: 2, yields: { rp: 5, electronics: 3, steel: 1 } },
  frozen_lab: { minutes: 15, picks: 3, yields: { rp: 5, electronics: 2, energy_cell: 2, crystal: 1 } },
  toxic_lab: { minutes: 10, picks: 3, yields: { biomass: 3, rp: 4, electronics: 1, nano: 0.5 } },
  // ---- rescues: the survivor is the reward; they bring their pack along
  survivor_camp: { minutes: 2, picks: 2, yields: { food: 2, water: 1, fiber: 1, wood: 1, steel: 0.5, electronics: 0.3 } },
  stranded_scientists: { minutes: 5, picks: 2, yields: { rp: 4, electronics: 1, crystal: 1, energy_cell: 0.5 } },
};

/** Goods one tier ahead of the colony weigh this much (a peek at what comes next). */
export const LOOT_AHEAD_WEIGHT = 0.5;
/** A loot good never brings more than this share of its storage. */
export const LOOT_STORAGE_SHARE = 0.6;
/** Haul size wobble (± this share). */
export const LOOT_VARIANCE = 0.1;
/** Full hauls per rolling hour of real time; past that the goods thin out: 1 / (1 + extra / LOOT_THIN_STEP). */
export const LOOT_FRESH_PER_HOUR = 6;
export const LOOT_THIN_STEP = 4;
export const LOOT_THIN_FLOOR = 0.2;

// ---------------------------------------------------------------------------------------------- region survey

export const SURVEY = {
  /** How the meter is made up (sums to 1). */
  weights: { charted: 0.5, pois: 0.35, specimens: 0.15 },
  /** Share of a region's land that counts as fully charted (shorelines and far corners stay forgiving). */
  chartFull: 0.9,
  /** A fog square (4x4 cells) belongs to the region with most of its dry land; it needs this many dry cells. */
  minLandCells: 4,
  /** Node kinds rarer than this in a region stay out of its field guide (one might sit under the colony). */
  minSpecimens: 3,
  /** Milestones (percent). */
  milestones: [25, 50, 75, 100] as const,
  titles: ['Scouted', 'Surveyed', 'Charted', 'Mastered'] as const,
  /** Nova on each milestone (the 75% keepsake is a cosmetic). */
  nova: [3, 5, 0, 10] as const,
  /** Season XP on each milestone. */
  xp: [30, 50, 80, 120] as const,
  /** The 75% keepsake when the colony already owns it. */
  ownedCosmeticNova: 40,
  /** 25%: the region cache is worth this many minutes of colony output. */
  cacheMinutes: 15,
};

export interface SurveyPerk {
  title: string;
  /** "+5% crystal production" */
  text: string;
  stats?: { stat: ModifierStat; add: number }[];
  /** Extra expedition squads (once the Radio Tower sends any). */
  expeditionSlots?: number;
}

export interface RegionSurveyDef {
  region: string;
  /** 25%: a cache of the region's goods (tier-scaled like POI loot). */
  cache: { picks: number; yields: Record<string, number> };
  /** 50%: a survivor who has been living out here. */
  colonist: Rarity;
  survivor: string;
  /** 75%: a keepsake cosmetic (Nova when it is already owned). */
  cosmetic: string;
  /** 100%: a permanent perk. */
  perk: SurveyPerk;
}

const prod = (ids: string[], add = 0.05) => ids.map((id) => ({ stat: `production:${id}` as ModifierStat, add }));

export const REGION_SURVEYS: RegionSurveyDef[] = [
  {
    region: 'crash_valley',
    cache: { picks: 3, yields: { food: 2, wood: 2, stone: 2, fiber: 1, steel: 1, electronics: 0.6, alloy: 0.4, titanium: 0.3 } },
    colonist: 'rare',
    survivor: 'A fellow crash survivor who has been living off the land.',
    cosmetic: 'deco_meteor_fountain',
    perk: { title: 'Valley Know-how', text: '+5% food and water production', stats: prod(['food', 'water']) },
  },
  {
    region: 'pinewood_forest',
    cache: { picks: 3, yields: { wood: 3, fiber: 2, food: 2, steel: 1, alloy: 0.5, biomass: 0.5 } },
    colonist: 'rare',
    survivor: 'A trapper who knows every trail through the pines.',
    cosmetic: 'deco_campfire_lounge',
    perk: { title: 'Forest Lore', text: '+5% wood and fiber production', stats: prod(['wood', 'fiber']) },
  },
  {
    region: 'red_desert',
    cache: { picks: 3, yields: { iron: 2, copper: 2, coal: 1.5, steel: 2, alloy: 0.8, titanium: 0.5 } },
    colonist: 'rare',
    survivor: 'A prospector with a map of every dry well.',
    cosmetic: 'outfit_nomad',
    perk: { title: 'Desert Prospecting', text: '+5% iron, copper and coal production', stats: prod(['iron', 'copper', 'coal']) },
  },
  {
    region: 'crystal_canyon',
    cache: { picks: 3, yields: { crystal: 2.5, copper: 1, iron: 1, electronics: 1, energy_cell: 0.8 } },
    colonist: 'rare',
    survivor: 'A geologist who hums along with the canyon walls.',
    cosmetic: 'frame_geode',
    perk: { title: 'Crystal Resonance', text: '+5% crystal production', stats: prod(['crystal']) },
  },
  {
    region: 'toxic_marsh',
    cache: { picks: 3, yields: { biomass: 3, fiber: 1, electronics: 0.8, nano: 1, alloy: 0.5 } },
    colonist: 'rare',
    survivor: 'A botanist who swears the bog glows friendlier at night.',
    cosmetic: 'pet_lumen_moth',
    perk: { title: 'Bog Botany', text: '+5% biomass production', stats: prod(['biomass']) },
  },
  {
    region: 'frozen_ridge',
    cache: { picks: 3, yields: { rp: 2, electronics: 2, energy_cell: 1.5, crystal: 1 } },
    colonist: 'epic',
    survivor: 'A glaciologist who missed the last shuttle home.',
    cosmetic: 'colonist_parkas',
    perk: { title: 'Ridge Relay', text: '+1 expedition squad', expeditionSlots: 1 },
  },
  {
    region: 'alien_ruins',
    cache: { picks: 3, yields: { rp: 3, crystal: 1.5, alloy: 1.5, nano: 1 } },
    colonist: 'epic',
    survivor: 'A linguist halfway through translating the glyphs.',
    cosmetic: 'outfit_observatory',
    perk: { title: 'Ancient Insight', text: '+5% research', stats: [{ stat: 'research', add: 0.05 }] },
  },
  {
    region: 'titanium_highlands',
    cache: { picks: 3, yields: { titanium: 3, nano: 1.5, energy_cell: 1, alloy: 1 } },
    colonist: 'epic',
    survivor: 'A surveyor who planted the first claim flags up here.',
    cosmetic: 'ride_carbon_gold',
    perk: { title: 'Highland Claims', text: '+5% titanium production', stats: prod(['titanium']) },
  },
];

export function regionSurveyDef(region: string): RegionSurveyDef | undefined {
  return REGION_SURVEYS.find((r) => r.region === region);
}
