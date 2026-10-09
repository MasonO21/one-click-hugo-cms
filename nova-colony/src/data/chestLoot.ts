import type { CosmeticRarity } from './schema';

/**
 * Nova cache loot tables (rolled by sim/chests.ts; the in-game odds sheet is computed from these SAME tables).
 *
 * Every card of a chest rolls two things independently:
 *  - its QUALITY (common … mythic: the glow on the card and how generous it is), from `quality`;
 *  - its KIND (resources, boost, helpful item, colonist, a little Nova, cosmetic), from `kinds`.
 * A cosmetic card's rarity is its quality capped at the chest's own rarity (a Supply Cache only ever holds common
 * cosmetics, mythic ones only come from the Nova Core). Guarantees (sim/chests.ts) lift one card when a chest
 * rolled none good enough; the pity timer turns one card into a cosmetic.
 *
 * Weights are written as percentages (each table sums to 100) so the tables read like the odds they disclose.
 */

export type ChestCardKind = 'resources' | 'boost' | 'item' | 'colonist' | 'nova' | 'cosmetic';

export interface ChestLootTable {
  /** Per-card quality weights (a rarity left out never rolls). */
  quality: Partial<Record<CosmeticRarity, number>>;
  /** Per-card kind weights. */
  kinds: Record<ChestCardKind, number>;
}

export const CHEST_LOOT: Record<string, ChestLootTable> = {
  chest_supply: {
    quality: { common: 80, rare: 17, epic: 3 },
    kinds: { resources: 44, boost: 14, item: 22, colonist: 5, nova: 7, cosmetic: 8 },
  },
  chest_explorer: {
    quality: { common: 58, rare: 32, epic: 8, legendary: 2 },
    kinds: { resources: 38, boost: 15, item: 20, colonist: 7, nova: 7, cosmetic: 13 },
  },
  chest_prospector: {
    quality: { common: 44, rare: 34, epic: 17, legendary: 5 },
    kinds: { resources: 34, boost: 15, item: 18, colonist: 8, nova: 7, cosmetic: 18 },
  },
  chest_relic: {
    quality: { common: 34, rare: 35, epic: 21, legendary: 10 },
    kinds: { resources: 30, boost: 14, item: 18, colonist: 9, nova: 7, cosmetic: 22 },
  },
  chest_nova: {
    quality: { common: 24, rare: 33, epic: 26, legendary: 13, mythic: 4 },
    kinds: { resources: 26, boost: 14, item: 16, colonist: 10, nova: 8, cosmetic: 26 },
  },
};

/** Minutes of a reference colony's output (at the player's tier) one resource card is worth, by quality. */
export const RESOURCE_MINUTES: Record<CosmeticRarity, number> = { common: 5, rare: 10, epic: 20, legendary: 40, mythic: 80 };
/** Goods on one resource card, by quality. */
export const RESOURCE_GOODS: Record<CosmeticRarity, number> = { common: 1, rare: 1, epic: 2, legendary: 2, mythic: 2 };

/** Timed boost on a boost card, by quality. */
export const BOOST_BY_QUALITY: Record<CosmeticRarity, { mult: number; minutes: number }> = {
  common: { mult: 1.5, minutes: 10 },
  rare: { mult: 2, minutes: 10 },
  epic: { mult: 2, minutes: 20 },
  legendary: { mult: 2, minutes: 45 },
  mythic: { mult: 2, minutes: 90 },
};

/** Nova on a "little Nova" card, by quality. */
export const NOVA_BY_QUALITY: Record<CosmeticRarity, number> = { common: 5, rare: 10, epic: 20, legendary: 40, mythic: 80 };

/** Colonist rarity on a colonist card (colonists top out at legendary). */
export const COLONIST_BY_QUALITY: Record<CosmeticRarity, 'common' | 'rare' | 'epic' | 'legendary'> = {
  common: 'common',
  rare: 'rare',
  epic: 'epic',
  legendary: 'legendary',
  mythic: 'legendary',
};

/**
 * Helpful items by card quality. `crate` = the supply crate of the colony's tier (TIER_CRATES), so a crate is always
 * full of goods the colony can use right now. `min` / `max`: colony tiers the entry is offered at.
 */
export interface ChestItemOption {
  item: string;
  n: number;
  min?: number;
  max?: number;
}
export const TIER_CRATE = 'crate';
export const TIER_CRATES = ['supply_crate', 'defense_crate', 'ore_bundle', 'tech_crate', 'alloy_crate', 'nano_crate', 'titan_crate'];

export const ITEMS_BY_QUALITY: Record<CosmeticRarity, ChestItemOption[]> = {
  common: [
    { item: 'bandage', n: 3, max: 1 },
    { item: 'herbal_salve', n: 2, min: 1, max: 2 },
    { item: 'medkit', n: 1, min: 2 },
    { item: 'research_chip', n: 1, min: 1 },
    { item: 'rations_crate', n: 1 },
    { item: 'timber_bundle', n: 1, max: 2 },
    { item: 'stone_bundle', n: 1, max: 2 },
    { item: TIER_CRATE, n: 1 },
  ],
  rare: [
    { item: 'medkit', n: 2, min: 1 },
    { item: 'stim_pack', n: 1, min: 3 },
    { item: 'research_chip', n: 2, min: 1 },
    { item: 'mystery_crate', n: 1 },
    { item: TIER_CRATE, n: 1 },
    { item: 'helper_drone', n: 1 },
    { item: 'worker_drone', n: 1 },
  ],
  epic: [
    { item: TIER_CRATE, n: 2 },
    { item: 'worker_drone', n: 2 },
    { item: 'science_drone', n: 1, min: 1 },
    { item: 'colonist_crate', n: 1 },
    { item: 'data_core', n: 1, min: 3 },
    { item: 'stim_pack', n: 3, min: 3 },
  ],
  legendary: [
    { item: TIER_CRATE, n: 3 },
    { item: 'swarm_drone', n: 1 },
    { item: 'data_core', n: 2, min: 3 },
    { item: 'colonist_crate', n: 2 },
    { item: 'nano_injector', n: 2, min: 5 },
  ],
  mythic: [
    { item: TIER_CRATE, n: 5 },
    { item: 'swarm_drone', n: 2 },
    { item: 'quantum_chip', n: 1, min: 5 },
    { item: 'colonist_crate', n: 3 },
  ],
};

/**
 * A typical Nova price per cosmetic rarity (the catalogue's bands: common 120–250, rare 300–450, epic 500–900,
 * legendary 1000+, mythic chest-only). A cosmetic card that finds nothing left to give refunds DUPLICATE_SHARE of it.
 */
export const TYPICAL_COSMETIC_NOVA: Record<CosmeticRarity, number> = { common: 200, rare: 400, epic: 750, legendary: 1200, mythic: 2400 };
export const DUPLICATE_SHARE = 0.4;
/**
 * Nova handed back by one chest (Nova cards + duplicate refunds) stays within this share of its price, so a chest is
 * never a way to turn Nova into more Nova (refunds shrink once the budget is used; a floor keeps them visible).
 */
export const CHEST_NOVA_BUDGET = 0.5;
export const MIN_REFUND = 5;

/** Every Nth Explorer-or-better cache in a row without a new cosmetic guarantees one. */
export const COSMETIC_PITY = 10;

/** The chest the first successful defense at each colony tier adds to the victory spoils. */
export const FIRST_DEFENSE_CHEST = 'chest_supply';
