/**
 * Nova caches (sim side; "chests" in code): what is inside a cache, granting it exactly once, the cosmetic pity timer, the odds the
 * Shop discloses, and the chests a free player earns. The opening scene is pure presentation (ui/chest/ChestScene.ts):
 * everything is granted the moment a chest is opened, then `chest:opened` hands the cards to the UI, so skipping or
 * closing the scene (or the app) can never lose or repeat a reward.
 *
 * A chest reveals `ChestDef.cards` reward cards. Each card rolls a QUALITY and a KIND from data/chestLoot.ts:
 *  - resources: 1–2 goods the colony uses at its CURRENT tier, worth a few minutes of a reference colony's output
 *    (the expedition value model), never more than a share of the storage they land in;
 *  - boost: production / research / gather;
 *  - item: medkits, drones, research chips, the supply crate of the colony's tier…;
 *  - colonist, a little Nova, or a cosmetic (unowned, `chest: true`, rarity capped at the chest's).
 * Guarantees: Explorer's Case ≥ 1 rare+, Prospector's Vault ≥ 1 epic+, Ancient Relic ≥ 1 legendary; Nova Core: its core
 * card is a mythic cosmetic (while any is left to find) plus ≥ 1 legendary+ card. Pity: the 10th Explorer-or-better cache in a row without a new cosmetic
 * brings one. A cosmetic never drops twice: with none left at a rarity it steps down, with none left at all it turns
 * into Nova (DUPLICATE_SHARE of a typical price, within the chest's Nova budget).
 *
 * Rolls are pure functions of (context, chest, Rng); the system passes the game's seeded RNG.
 * OWNER: chests agent. Writes state.liveops.chests and grants through Game.grant.
 */
import { System } from './System';
import { Rng } from '../core/rng';
import { MAX_TIER } from '../core/constants';
import { bagEntries } from '../core/bag';
import type { DataRegistry } from '../data';
import type { ChestDef, CosmeticDef, CosmeticRarity, Reward } from '../data/schema';
import { niceAmount, referenceValuePerHour, valueAt } from './expedition/rules';
import {
  BOOST_BY_QUALITY,
  CHEST_LOOT,
  CHEST_NOVA_BUDGET,
  COLONIST_BY_QUALITY,
  COSMETIC_PITY,
  DUPLICATE_SHARE,
  FIRST_DEFENSE_CHEST,
  ITEMS_BY_QUALITY,
  MIN_REFUND,
  NOVA_BY_QUALITY,
  RESOURCE_GOODS,
  RESOURCE_MINUTES,
  TIER_CRATE,
  TIER_CRATES,
  TYPICAL_COSMETIC_NOVA,
  type ChestCardKind,
  type ChestLootTable,
} from '../data/chestLoot';

export type { ChestCardKind } from '../data/chestLoot';

// ---------------------------------------------------------------------------------------------- save + events

/** Persistent chest state (state.liveops.chests; older saves get it on load, see normalizeChestSave). */
export interface ChestSave {
  /** Explorer-or-better caches opened in a row without a new cosmetic (the pity timer, see COSMETIC_PITY). */
  pity: number;
  /** Lifetime chests opened, by chest id. */
  opened: Record<string, number>;
  /** Colony tiers whose first won defense already paid its Supply Cache. */
  defended: number[];
}

declare module '../core/state' {
  interface LiveOpsState {
    /** Nova chests (sim/chests.ts). Optional in the type: saves from before chests get it in ChestSystem.onLoad. */
    chests?: ChestSave;
  }
}

/** What the opening scene shows. */
export interface ChestOpened {
  /** ChestDef id, or for the quicker crate variant the crate's ItemDef id. */
  chest: string;
  variant: 'chest' | 'crate';
  /** In reveal order (best last). Already granted. */
  cards: ChestCard[];
  /** Bought and opened in the Shop, or opened from the inventory. */
  via: 'shop' | 'inventory';
}

declare module '../core/events' {
  interface GameEvents {
    'chest:bought': { chest: string; nova: number; open: boolean };
    /** A chest or crate is about to be opened (the UI raises the scene first, so the grants' toasts wait behind it). */
    'chest:opening': { chest: string; variant: 'chest' | 'crate' };
    /** A chest or crate was opened and everything in it granted; the UI plays the opening scene. */
    'chest:opened': ChestOpened;
  }
}

// ---------------------------------------------------------------------------------------------- cards

export const CARD_RARITIES: readonly CosmeticRarity[] = ['common', 'rare', 'epic', 'legendary', 'mythic'];
export const CARD_KINDS: readonly ChestCardKind[] = ['resources', 'boost', 'item', 'colonist', 'nova', 'cosmetic'];

/** 0 = common … 4 = mythic (unknown → 0). */
export function rarityRank(r: string | undefined): number {
  const i = CARD_RARITIES.indexOf(r as CosmeticRarity);
  return i < 0 ? 0 : i;
}

/** A card's face: a chest card kind, or (crates) research points, season XP or a vehicle. */
export type ChestCardFace = ChestCardKind | 'rp' | 'xp' | 'vehicle';

export interface ChestCard {
  kind: ChestCardFace;
  /** The card's glow; for a cosmetic, the cosmetic's own rarity. */
  rarity: CosmeticRarity;
  /** Exactly what this card granted. */
  reward: Reward;
  /** Cosmetic cards: the new cosmetic, or for a duplicate refund one already owned that it stands for. */
  cosmetic?: string;
  /** A cosmetic card with nothing new left to give: Nova instead. */
  dupe?: boolean;
  /** Why the card is at least this good: the cache's guarantee, the Nova Core's core card, or the pity timer. */
  lift?: 'guarantee' | 'core' | 'pity';
  /** Colonist cards, once granted: who joined. */
  colonist?: { id: number; name: string; specialty: string };
}

export interface LootContext {
  data: DataRegistry;
  /** Colony tier (sizes resources, picks tier crates). */
  tier: number;
  /** Cosmetics already owned (never dropped again). */
  owned: readonly string[];
  /** Storage capacity per resource: a resource card never brings more than STORAGE_SHARE of it. */
  capacity?: (id: string) => number;
  /** The pity counter before this chest (ChestSave.pity). */
  pity?: number;
}

export interface ChestRoll {
  cards: ChestCard[];
  /** The pity counter after this chest. */
  pity: number;
  /** New cosmetics among the cards. */
  newCosmetics: number;
}

/** A resource card never brings more than this share of the storage it lands in (the rest would spill). */
export const STORAGE_SHARE = 0.6;

const sum = (o: Partial<Record<string, number>>): number => Object.values(o).reduce<number>((s, v) => s + (v ?? 0), 0);

export function lootTable(chestId: string): ChestLootTable {
  return CHEST_LOOT[chestId] ?? CHEST_LOOT.chest_supply;
}

/** Cosmetics that can drop from chests at a rarity. */
export function chestCosmetics(data: DataRegistry, rarity: CosmeticRarity): CosmeticDef[] {
  return data.cosmetics.filter((c) => c.chest && c.rarity === rarity);
}

/** Weighted pick from `[value, weight]` pairs (weights ≤ 0 never win). */
function weighted<T>(rng: Rng, list: readonly (readonly [T, number])[]): T {
  const total = list.reduce((s, [, w]) => s + Math.max(0, w), 0);
  let r = rng.next() * total;
  for (const [v, w] of list) {
    if (w <= 0) continue;
    r -= w;
    if (r < 0) return v;
  }
  for (let i = list.length - 1; i >= 0; i--) if (list[i][1] > 0) return list[i][0];
  return list[list.length - 1][0];
}

/** A card quality from the table (only rarities ≥ `minRank` when lifting a card for a guarantee). */
export function rollQuality(table: ChestLootTable, rng: Rng, minRank = 0): CosmeticRarity {
  const list = CARD_RARITIES.map((r) => [r, rarityRank(r) >= minRank ? (table.quality[r] ?? 0) : 0] as const);
  if (!list.some(([, w]) => w > 0)) return CARD_RARITIES[Math.min(minRank, CARD_RARITIES.length - 1)];
  return weighted(rng, list);
}

export function rollKind(table: ChestLootTable, rng: Rng, noCosmetic = false): ChestCardKind {
  return weighted(rng, CARD_KINDS.map((k) => [k, noCosmetic && k === 'cosmetic' ? 0 : table.kinds[k]] as const));
}

/** The best card quality a chest guarantees (Nova Core: besides its core card). */
export function guaranteedRank(chest: ChestDef): number {
  return chest.rarity === 'mythic' ? rarityRank('legendary') : rarityRank(chest.rarity);
}

/** Does the chest count for (and benefit from) the cosmetic pity timer? Explorer's Case and better. */
export function pityCounts(chest: ChestDef): boolean {
  return rarityRank(chest.rarity) >= rarityRank('rare');
}

// ---------------------------------------------------------------------------------------------- card contents

function clampTier(t: number): number {
  return Math.max(0, Math.min(MAX_TIER, Math.floor(t) || 0));
}

/** What one roll has handed out so far: the Nova budget left, and the goods already on a resource card. */
interface RollState {
  left: number;
  goods: Set<string>;
}

function resourceCard(ctx: LootContext, q: CosmeticRarity, rng: Rng, roll?: RollState): ChestCard {
  const rules = ctx.data.expeditionRules;
  const t = Math.min(clampTier(ctx.tier), rules.reference.length - 1);
  const ref = rules.reference[t] ?? {};
  const value = (referenceValuePerHour(rules, t) * RESOURCE_MINUTES[q]) / 60;
  // what a colony at this tier makes and uses, weighted by its share of the output (never research points)
  let pool = Object.keys(ref)
    .sort()
    .filter((k) => k !== 'rp' && (ref[k] ?? 0) > 0 && !!ctx.data.resource(k) && valueAt(rules, t, k) > 0)
    .filter((k) => !ctx.capacity || ctx.capacity(k) > 0)
    // a good already on another card of this chest is much less likely again (variety)
    .map((k) => [k, (ref[k] ?? 0) * valueAt(rules, t, k) * (roll?.goods.has(k) ? 0.12 : 1)] as [string, number]);
  if (!pool.length) pool = [['wood', 1]];
  const goods: string[] = [];
  for (let i = 0; i < RESOURCE_GOODS[q] && pool.length; i++) {
    const k = weighted(rng, pool);
    goods.push(k);
    roll?.goods.add(k);
    pool = pool.filter(([x]) => x !== k);
  }
  const resources: Record<string, number> = {};
  for (const k of goods) {
    let n = niceAmount(value / goods.length / Math.max(1e-6, valueAt(rules, t, k)));
    const cap = ctx.capacity?.(k);
    if (cap != null && cap > 0) n = Math.min(n, Math.max(1, niceAmount(cap * STORAGE_SHARE)));
    resources[k] = Math.max(1, n);
  }
  return { kind: 'resources', rarity: q, reward: { resources } };
}

function boostCard(ctx: LootContext, q: CosmeticRarity, rng: Rng): ChestCard {
  const t = clampTier(ctx.tier);
  const kind = weighted(rng, [
    ['production', 50],
    ['research', t >= 1 ? 30 : 0],
    ['gather', t <= 2 ? 30 : 15],
  ] as const);
  const b = BOOST_BY_QUALITY[q];
  return { kind: 'boost', rarity: q, reward: { boost: { kind, mult: b.mult, minutes: b.minutes } } };
}

/** The supply crate that suits a colony tier. */
export function tierCrate(tier: number): string {
  return TIER_CRATES[Math.min(clampTier(tier), TIER_CRATES.length - 1)];
}

function itemCard(ctx: LootContext, q: CosmeticRarity, rng: Rng): ChestCard {
  const t = clampTier(ctx.tier);
  const options = ITEMS_BY_QUALITY[q]
    .filter((o) => (o.min ?? 0) <= t && t <= (o.max ?? MAX_TIER))
    .map((o) => ({ id: o.item === TIER_CRATE ? tierCrate(t) : o.item, n: o.n }))
    .filter((o) => !!ctx.data.item(o.id));
  const pick = options.length ? options[Math.floor(rng.next() * options.length)] : { id: tierCrate(t), n: 1 };
  return { kind: 'item', rarity: q, reward: { items: { [pick.id]: pick.n } } };
}

/**
 * A cosmetic card: an unowned chest cosmetic of the card's quality capped at the chest's rarity, stepping down a rarity
 * at a time; `up` (the pity timer) also looks above the rolled rarity, up to the cap. Nothing left: a Nova refund.
 */
function cosmeticCard(ctx: LootContext, owned: Set<string>, q: CosmeticRarity, cap: number, rng: Rng, budget: RollState, up = false): ChestCard {
  const top = Math.min(rarityRank(q), cap);
  const order: number[] = [];
  for (let r = top; r >= 0; r--) order.push(r);
  if (up) for (let r = top + 1; r <= cap; r++) order.push(r);
  for (const r of order) {
    const pool = chestCosmetics(ctx.data, CARD_RARITIES[r]).filter((c) => !owned.has(c.id));
    if (!pool.length) continue;
    const c = pool[Math.floor(rng.next() * pool.length)];
    owned.add(c.id);
    return { kind: 'cosmetic', rarity: c.rarity, reward: { cosmetic: c.id }, cosmetic: c.id };
  }
  const rarity = CARD_RARITIES[top];
  const nova = duplicateRefund(rarity, budget);
  const stand = chestCosmetics(ctx.data, rarity);
  const shown = stand.length ? stand[Math.floor(rng.next() * stand.length)].id : undefined;
  return { kind: 'cosmetic', rarity, reward: { nova }, dupe: true, cosmetic: shown };
}

/** Nova for a cosmetic card that found nothing new: DUPLICATE_SHARE of a typical price, within the chest's budget. */
export function duplicateRefund(rarity: CosmeticRarity, budget: { left: number }): number {
  const full = Math.round(TYPICAL_COSMETIC_NOVA[rarity] * DUPLICATE_SHARE);
  const nova = Math.max(MIN_REFUND, Math.min(full, Math.floor(budget.left)));
  budget.left -= nova;
  return nova;
}

/** Any unowned chest cosmetic at or below a rarity rank? */
function anyCosmeticLeft(data: DataRegistry, owned: Set<string>, cap: number): boolean {
  return data.cosmetics.some((c) => c.chest && rarityRank(c.rarity) <= cap && !owned.has(c.id));
}

function makeCard(ctx: LootContext, kind: ChestCardKind, q: CosmeticRarity, cap: number, owned: Set<string>, budget: RollState, rng: Rng): ChestCard {
  switch (kind) {
    case 'resources':
      return resourceCard(ctx, q, rng, budget);
    case 'boost':
      return boostCard(ctx, q, rng);
    case 'item':
      return itemCard(ctx, q, rng);
    case 'colonist':
      return { kind: 'colonist', rarity: q, reward: { colonist: COLONIST_BY_QUALITY[q] } };
    case 'nova': {
      // a little Nova, inside the chest's Nova budget (shared with duplicate refunds)
      const nova = Math.min(NOVA_BY_QUALITY[q], Math.max(MIN_REFUND, Math.floor(budget.left)));
      budget.left -= nova;
      return { kind: 'nova', rarity: q, reward: { nova } };
    }
    case 'cosmetic':
      return cosmeticCard(ctx, owned, q, cap, rng, budget);
  }
}

const isNewCosmetic = (c: ChestCard) => c.kind === 'cosmetic' && !c.dupe;

/**
 * Roll a chest's cards (pure: same context, chest and RNG state → same cards). Returned in reveal order: rising
 * rarity, cosmetics after other cards of their rarity, so the best one comes last.
 */
export function rollChest(ctx: LootContext, chest: ChestDef, rng: Rng): ChestRoll {
  const table = lootTable(chest.id);
  const n = Math.max(1, Math.floor(chest.cards) || 1);
  const cap = rarityRank(chest.rarity);
  const owned = new Set(ctx.owned);
  const budget: RollState = { left: Math.floor(chest.nova * CHEST_NOVA_BUDGET), goods: new Set() };

  // 1) quality + kind per card; the Nova Core's first card is its core: a mythic cosmetic
  const slots: { q: CosmeticRarity; kind: ChestCardKind; lift?: ChestCard['lift'] }[] = [];
  if (chest.rarity === 'mythic') slots.push({ q: 'mythic', kind: 'cosmetic', lift: 'core' });
  while (slots.length < n) slots.push({ q: rollQuality(table, rng), kind: rollKind(table, rng) });

  // 2) the guarantee: none of the (non-core) cards good enough → lift one at random
  const min = guaranteedRank(chest);
  const free = () => slots.map((_, i) => i).filter((i) => slots[i].lift !== 'core');
  if (min > 0) {
    const idx = free();
    if (idx.length && !idx.some((i) => rarityRank(slots[i].q) >= min)) {
      const i = idx[Math.floor(rng.next() * idx.length)];
      slots[i].q = rollQuality(table, rng, min);
      slots[i].lift = 'guarantee';
    }
  }

  // 3) contents, in order (cosmetics drawn so far are no longer available)
  const cards: ChestCard[] = slots.map((s) => {
    const c = makeCard(ctx, s.kind, s.q, cap, owned, budget, rng);
    if (s.lift) c.lift = s.lift;
    return c;
  });

  // 4) pity: the 10th Explorer-or-better cache in a row without a new cosmetic turns its best card into one
  const counts = pityCounts(chest);
  if (counts && (ctx.pity ?? 0) >= COSMETIC_PITY - 1 && !cards.some(isNewCosmetic) && anyCosmeticLeft(ctx.data, owned, cap)) {
    let best = -1;
    cards.forEach((c, i) => {
      if (c.lift === 'core') return;
      if (best < 0 || rarityRank(c.rarity) > rarityRank(cards[best].rarity)) best = i;
    });
    if (best >= 0) {
      const old = cards[best];
      if (old.reward.nova) budget.left += old.reward.nova;
      const c = cosmeticCard(ctx, owned, old.rarity, cap, rng, budget, true);
      c.lift = 'pity';
      cards[best] = c;
    }
  }

  // 5) a cosmetic that had to step down a rarity can undo the guarantee: lift another card (never into a cosmetic)
  if (min > 0) {
    const ok = () => cards.some((c) => c.lift !== 'core' && rarityRank(c.rarity) >= min);
    if (!ok()) {
      // prefer a card that is not a new cosmetic; when every card is one (all stepped down), give the last one back
      const open = cards.map((_, i) => i).filter((i) => cards[i].lift !== 'core' && cards[i].lift !== 'pity');
      const plain = open.filter((i) => !isNewCosmetic(cards[i]));
      const idx = plain.length ? plain : open;
      if (idx.length) {
        const i = idx[idx.length - 1];
        const old = cards[i];
        if (old.reward.nova) budget.left += old.reward.nova;
        if (isNewCosmetic(old) && old.cosmetic) owned.delete(old.cosmetic);
        const c = makeCard(ctx, rollKind(table, rng, true), rollQuality(table, rng, min), cap, owned, budget, rng);
        c.lift = 'guarantee';
        cards[i] = c;
      }
    }
  }

  const newCosmetics = cards.filter(isNewCosmetic).length;
  let pity = Math.max(0, Math.floor(ctx.pity ?? 0));
  if (counts) pity = newCosmetics > 0 || !anyCosmeticLeft(ctx.data, owned, cap) ? 0 : pity + 1;
  return { cards: revealOrder(cards), pity, newCosmetics };
}

/** Rising rarity; within a rarity, cosmetics last (the core card is always the finale). */
export function revealOrder(cards: ChestCard[]): ChestCard[] {
  const key = (c: ChestCard) => rarityRank(c.rarity) * 10 + (c.lift === 'core' ? 5 : 0) + (isNewCosmetic(c) ? 2 : c.kind === 'cosmetic' ? 1 : 0);
  return cards
    .map((c, i) => ({ c, i }))
    .sort((a, b) => key(a.c) - key(b.c) || a.i - b.i)
    .map((x) => x.c);
}

// ---------------------------------------------------------------------------------------------- crates

/** One card per part of a fixed crate reward (the quicker crate variant of the scene). */
export function crateCards(data: DataRegistry, reward: Reward): ChestCard[] {
  const cards: ChestCard[] = [];
  for (const [k, v] of bagEntries(reward.resources)) cards.push({ kind: 'resources', rarity: 'common', reward: { resources: { [k]: v } } });
  for (const [id, n] of Object.entries(reward.items ?? {})) if (n > 0) cards.push({ kind: 'item', rarity: 'common', reward: { items: { [id]: n } } });
  if (reward.rp) cards.push({ kind: 'rp', rarity: 'common', reward: { rp: reward.rp } });
  if (reward.xp) cards.push({ kind: 'xp', rarity: 'common', reward: { xp: reward.xp } });
  if (reward.nova) cards.push({ kind: 'nova', rarity: 'rare', reward: { nova: reward.nova } });
  if (reward.boost) cards.push({ kind: 'boost', rarity: 'rare', reward: { boost: reward.boost } });
  if (reward.colonist) cards.push({ kind: 'colonist', rarity: reward.colonist, reward: { colonist: reward.colonist } });
  if (reward.cosmetic) cards.push({ kind: 'cosmetic', rarity: data.cosmetic(reward.cosmetic)?.rarity ?? 'rare', reward: { cosmetic: reward.cosmetic }, cosmetic: reward.cosmetic });
  if (reward.vehicle) cards.push({ kind: 'vehicle', rarity: 'epic', reward: { vehicle: reward.vehicle } });
  return revealOrder(cards);
}

// ---------------------------------------------------------------------------------------------- odds (disclosure)

export interface ChestOdds {
  chest: string;
  cards: number;
  /** Cards rolled from the tables (Nova Core: all but its core card). */
  rolled: number;
  /** Per rolled card, in percent: the rarity it shows (its glow)… */
  quality: { rarity: CosmeticRarity; pct: number }[];
  /** …its kind… */
  kinds: { kind: ChestCardKind; pct: number }[];
  /** …and the chance it is a cosmetic of each rarity (quality capped at the chest's rarity; sums to the cosmetic kind). */
  cosmetics: { rarity: CosmeticRarity; pct: number }[];
  /** The best quality guaranteed in every chest (0 = none). */
  guaranteed: number;
  /** The Nova Core's core card (a mythic cosmetic) besides the rolled ones. */
  core: boolean;
  pity: boolean;
}

/** The odds the Shop shows before purchase, computed from the very tables `rollChest` rolls. */
export function chestOdds(chest: ChestDef): ChestOdds {
  const table = lootTable(chest.id);
  const qTotal = sum(table.quality) || 1;
  const kTotal = sum(table.kinds) || 1;
  const cap = rarityRank(chest.rarity);
  const rolled = CARD_RARITIES.map((r) => ((table.quality[r] ?? 0) / qTotal) * 100);
  const kinds = CARD_KINDS.map((k) => ({ kind: k, pct: (table.kinds[k] / kTotal) * 100 }));
  const pCos = table.kinds.cosmetic / kTotal;
  // a cosmetic card's rarity is its quality capped at the chest's rarity
  const cos = CARD_RARITIES.map((_, r) => (r > cap ? 0 : rolled.reduce((s, p, q) => s + (Math.min(q, cap) === r ? p : 0), 0) * pCos));
  const cosmetics = CARD_RARITIES.map((rarity, r) => ({ rarity, pct: cos[r] })).filter((x) => x.pct > 0);
  // the rarity a card shows: other kinds keep the rolled quality, cosmetics the capped one
  const quality = CARD_RARITIES.map((rarity, r) => ({ rarity, pct: (1 - pCos) * rolled[r] + cos[r] })).filter((x) => x.pct > 0);
  const core = chest.rarity === 'mythic';
  return { chest: chest.id, cards: chest.cards, rolled: chest.cards - (core ? 1 : 0), quality, kinds, cosmetics, guaranteed: guaranteedRank(chest), core, pity: pityCounts(chest) };
}

const RARITY_NAME: Record<CosmeticRarity, string> = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', mythic: 'Mythic' };

/** Short guarantee line for the chest's Shop card. */
export function guaranteeLine(chest: ChestDef): string {
  if (chest.rarity === 'mythic') return 'Mythic cosmetic + legendary find';
  const r = rarityRank(chest.rarity);
  if (r === 0) return 'Everyday field supplies';
  if (r === rarityRank('legendary')) return 'A legendary find guaranteed';
  return `${RARITY_NAME[chest.rarity]} or better guaranteed`;
}

// ---------------------------------------------------------------------------------------------- system

/** Old / damaged saves: a valid ChestSave from whatever is there. */
export function normalizeChestSave(raw: unknown): ChestSave {
  const o = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const pity = typeof o.pity === 'number' && Number.isFinite(o.pity) ? Math.max(0, Math.floor(o.pity)) : 0;
  const opened: Record<string, number> = {};
  if (o.opened && typeof o.opened === 'object' && !Array.isArray(o.opened)) {
    for (const [k, v] of Object.entries(o.opened as Record<string, unknown>)) if (typeof v === 'number' && Number.isFinite(v) && v > 0) opened[k] = Math.floor(v);
  }
  const defended = Array.isArray(o.defended) ? [...new Set(o.defended.filter((t): t is number => Number.isInteger(t) && t >= 0 && t <= MAX_TIER))] : [];
  return { pity, opened, defended };
}

export class ChestSystem extends System {
  override onLoad(): void {
    this.save();
  }

  /** The chest save, created / repaired on first use. */
  save(): ChestSave {
    const lo = this.game.state.liveops;
    const cur = lo.chests;
    if (cur && typeof cur.pity === 'number' && cur.opened && Array.isArray(cur.defended)) return cur;
    return (lo.chests = normalizeChestSave(cur));
  }

  def(id: string): ChestDef | undefined {
    return this.game.data.chest(id);
  }

  /** Unopened chests of a kind in the inventory. */
  owned(id: string): number {
    return this.game.state.player.items[id] ?? 0;
  }

  /** Every unopened Nova chest in the inventory. */
  ownedTotal(): number {
    return this.game.data.chests.reduce((s, c) => s + this.owned(c.id), 0);
  }

  canAfford(id: string): boolean {
    const def = this.def(id);
    return !!def && def.nova > 0 && this.game.state.liveops.nova >= def.nova;
  }

  /** Chests until the pity timer guarantees a cosmetic (1 = the next Explorer-or-better cache). */
  pityLeft(): number {
    return Math.max(1, COSMETIC_PITY - this.save().pity);
  }

  odds(id: string): ChestOdds | null {
    const def = this.def(id);
    return def ? chestOdds(def) : null;
  }

  /**
   * Buy a chest with Nova: open it at once (the Shop's "Buy & open", returns its cards) or keep it in the inventory
   * (returns []). Null when it is not for sale or the Nova is short (nothing is spent).
   */
  buy(id: string, open = true): ChestCard[] | null {
    const g = this.game;
    const def = this.def(id);
    if (!def || def.nova <= 0) return null;
    if (!g.sys.liveops.spendNova(def.nova, `chest:${id}`)) return null;
    g.bus.emit('chest:bought', { chest: id, nova: def.nova, open });
    if (!open) {
      g.sys.player.addItem(id, 1);
      g.bus.emit('sfx', { id: 'coin' });
      return [];
    }
    return this.openDef(def, 'shop');
  }

  /** Open one chest from the inventory (Inventory › Open, the scene's "Open another"). Null when none is owned. */
  open(id: string): ChestCard[] | null {
    const def = this.def(id);
    if (!def || this.owned(id) <= 0) return null;
    if (!this.game.sys.player.removeItem(id, 1)) return null;
    return this.openDef(def, 'inventory');
  }

  /** Roll, grant every card (exactly once, right now) and hand the cards to the opening scene. */
  private openDef(def: ChestDef, via: ChestOpened['via']): ChestCard[] {
    const g = this.game;
    const save = this.save();
    g.bus.emit('chest:opening', { chest: def.id, variant: 'chest' });
    const roll = rollChest(
      {
        data: g.data,
        tier: g.state.colony.tier,
        owned: g.state.liveops.cosmetics.owned,
        capacity: (k) => g.sys.economy.capacity(k),
        pity: save.pity,
      },
      def,
      g.rng,
    );
    save.pity = roll.pity;
    save.opened[def.id] = (save.opened[def.id] ?? 0) + 1;
    for (const c of roll.cards) this.grantCard(c, 'chest', def.id);
    g.bus.emit('chest:opened', { chest: def.id, variant: 'chest', cards: roll.cards, via });
    return roll.cards;
  }

  /**
   * A fixed-reward crate from the inventory (player.useItem has already taken it out): granted here, exactly once
   * (source 'crate', named after the crate), then the scene's quicker crate variant shows what was inside.
   */
  openCrate(itemId: string, reward: Reward): ChestCard[] {
    const g = this.game;
    g.bus.emit('chest:opening', { chest: itemId, variant: 'crate' });
    const before = new Set(g.state.colonists.list.map((c) => c.id));
    g.grant(reward, 'crate', undefined, undefined, itemId);
    const cards = crateCards(g.data, reward);
    const joined = g.state.colonists.list.find((c) => !before.has(c.id));
    const card = cards.find((c) => c.kind === 'colonist');
    if (joined && card) card.colonist = { id: joined.id, name: joined.name, specialty: joined.specialty };
    g.bus.emit('chest:opened', { chest: itemId, variant: 'crate', cards, via: 'inventory' });
    return cards;
  }

  private grantCard(card: ChestCard, source: string, item: string): void {
    const g = this.game;
    if (!card.reward.colonist) {
      g.grant(card.reward, source, undefined, undefined, item);
      return;
    }
    const before = new Set(g.state.colonists.list.map((c) => c.id));
    g.grant(card.reward, source, undefined, undefined, item);
    const joined = g.state.colonists.list.find((c) => !before.has(c.id));
    if (joined) card.colonist = { id: joined.id, name: joined.name, specialty: joined.specialty };
  }

  /**
   * Combat hook (sim/combat.ts endAttack): the first won defense at each colony tier adds a Supply Cache to the
   * victory spoils (shown on the victory card, granted with them). Returns true when it did.
   */
  firstDefense(reward: Reward): boolean {
    const g = this.game;
    const save = this.save();
    const tier = g.state.colony.tier;
    if (save.defended.includes(tier) || !this.def(FIRST_DEFENSE_CHEST) || !g.data.item(FIRST_DEFENSE_CHEST)) return false;
    save.defended.push(tier);
    const items = { ...(reward.items ?? {}) };
    items[FIRST_DEFENSE_CHEST] = (items[FIRST_DEFENSE_CHEST] ?? 0) + 1;
    reward.items = items;
    const def = this.def(FIRST_DEFENSE_CHEST)!;
    g.toast(`${def.icon} A ${def.name} in the spoils. Open it from your Inventory`, 'reward', undefined, 'inventory');
    return true;
  }
}
