/**
 * Pure wish rules (no state mutation): deterministic rolls, how much a Give wish asks for, the thank-you gift, who is
 * likely to wish for what, and the friendship perks the colonist system reads (happiness / productivity).
 * OWNER: wishes.
 */
import type { Game } from '../../core/Game';
import type { Colonist } from '../../core/state';
import type { DataRegistry } from '../../data';
import type { Reward, ResourceBag, WishDef, WishRules } from '../../data/schema';
import { Rng } from '../../core/rng';
import { WISH_RULES } from '../../data/wishes';

/** Salts for the independent rolls made per wish number. */
export const ROLL = { delay: 1, colonist: 2, wish: 3, gift: 4 } as const;

/** Rules from the data registry (a registry built from partial test data falls back to the shipped rules). */
export function wishRules(data: DataRegistry): WishRules {
  return data.wishRules ?? WISH_RULES;
}

/**
 * The roll for wish number `n` of a colony: a pure function of the save seed, the counter and the purpose, so
 * reloading a save never re-rolls a wish (no save-scumming) and two colonies with the same seed agree.
 */
export function wishRng(seed: number, n: number, salt: number): Rng {
  let h = (seed ^ 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = (h + Math.imul(n + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h + Math.imul(salt, 0x27d4eb2f)) >>> 0;
  return new Rng((h ^ (h >>> 16)) >>> 0);
}

/** Seconds until the next wish: `first` uses the shorter opening delay. */
export function nextDelay(rules: WishRules, seed: number, n: number, first: boolean): number {
  const [lo, hi] = first ? rules.firstDelay : rules.interval;
  return wishRng(seed, n, ROLL.delay).range(lo, hi);
}

/** A friendly round number: 7, 35, 120, 3,450. */
export function niceAmount(v: number): number {
  if (!(v > 0)) return 0;
  if (v < 20) return Math.max(1, Math.round(v));
  if (v < 100) return Math.round(v / 5) * 5;
  if (v < 1000) return Math.round(v / 10) * 10;
  return Math.round(v / 50) * 50;
}

/** Rounds down to the same friendly steps (used for storage caps). */
function niceFloor(v: number): number {
  if (!(v > 0)) return 0;
  if (v < 20) return Math.floor(v);
  if (v < 100) return Math.floor(v / 5) * 5;
  if (v < 1000) return Math.floor(v / 10) * 10;
  return Math.floor(v / 50) * 50;
}

/** A reference colony's output per minute of `res` at `tier` (the pacing model's planned economy). */
export function referenceRate(data: DataRegistry, tier: number, res: string): number {
  const ref = data.expeditionRules?.reference ?? [];
  const row = ref[Math.max(0, Math.min(ref.length - 1, Math.floor(tier)))];
  return Math.max(0, row?.[res] ?? 0);
}

/**
 * How much a Give wish asks for at `tier`: `minutes` of the reference colony's output, at least `giveMin`, never more
 * than `giveCapShare` of the storage the colony has for it. 0 = cannot be asked (no such output, or too little room).
 */
export function giveAmount(data: DataRegistry, def: WishDef, tier: number, capacity: number): number {
  const r = wishRules(data);
  const per = referenceRate(data, tier, def.target);
  if (!(per > 0)) return 0;
  let n = Math.max(r.giveMin, niceAmount(per * (def.minutes ?? r.giveMinutes)));
  if (Number.isFinite(capacity)) {
    const cap = niceFloor(Math.max(0, capacity) * r.giveCapShare);
    if (cap < r.giveMin) return 0;
    n = Math.min(n, cap);
  }
  return n;
}

/**
 * The thank-you gift for a granted wish: two resources from the tier's pool worth `reward.minutes` of the reference
 * colony's output together, a little season XP, and now and then 1–2 Nova. Deterministic from the wish's seed.
 */
export function thankYouGift(data: DataRegistry, tier: number, seed: number): Reward {
  const r = wishRules(data);
  const rng = new Rng(seed);
  const pools = r.reward.pool;
  const t = Math.max(0, Math.min(pools.length - 1, Math.floor(tier)));
  const pool = (pools[t] ?? []).filter((id) => referenceRate(data, t, id) > 0);
  const picks = rng.shuffle([...pool]).slice(0, 2);
  const resources: ResourceBag = {};
  for (const id of picks) {
    const n = niceAmount((referenceRate(data, t, id) * r.reward.minutes) / Math.max(1, picks.length));
    if (n > 0) resources[id] = Math.max(5, n);
  }
  const out: Reward = {};
  if (Object.keys(resources).length) out.resources = resources;
  if (r.reward.xp > 0) out.xp = r.reward.xp;
  if (rng.chance(r.reward.novaChance)) out.nova = rng.int(r.reward.nova[0], r.reward.nova[1]);
  return out;
}

/** Pool weight of a wish for a colonist: more likely when their specialty or current job, or their trait, likes it. */
export function likeWeight(rules: WishRules, def: WishDef, c: Pick<Colonist, 'specialty' | 'trait'>, job: string | null): number {
  let w = Math.max(0, def.weight);
  const likes = def.likes;
  if (!likes) return w;
  if (likes.professions?.some((p) => p === c.specialty || p === job)) w *= rules.likeBonus.profession;
  if (likes.traits?.includes(c.trait)) w *= rules.likeBonus.trait;
  return w;
}

/** `text` with the amount filled in. */
export function wishText(def: WishDef, need: number): string {
  return def.text.replace(/\{n\}/g, need.toLocaleString('en-US'));
}

// ---------------------------------------------------------------- friendship (read by the colonist system)

/** Friendship hearts with a colonist (0..rules.hearts). */
export function heartsOf(game: Game, id: number): number {
  const v = game.state.wishes?.bonds?.[id];
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(wishRules(game.data).hearts, Math.floor(v))) : 0;
}

/** "Wish granted!" happiness a colonist still feels (0 once it has worn off). */
export function wishMood(game: Game, c: Pick<Colonist, 'id'>): number {
  const until = game.state.wishes?.moods?.[c.id];
  return typeof until === 'number' && game.now() < until ? wishRules(game.data).mood.value : 0;
}

/** Permanent happiness of a Best friend (0 below the heart threshold). */
export function friendHappiness(game: Game, c: Pick<Colonist, 'id'>): number {
  const p = wishRules(game.data).perks;
  return heartsOf(game, c.id) >= p.bestFriendsHearts ? p.bestFriendsHappiness : 0;
}

/** Extra productivity at their job from friendship (0.05 = +5%). */
export function friendProductivity(game: Game, c: Pick<Colonist, 'id'>): number {
  const p = wishRules(game.data).perks;
  return heartsOf(game, c.id) >= p.productivityHearts ? p.productivity : 0;
}
