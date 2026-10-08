/**
 * Nova Shop logic: what each item costs right now, whether it can be bought (and why not), daily caps, and the
 * purchase itself. Items are data (data/novaShop.ts); everything here only accelerates something the colony gets
 * for free anyway, so the design promise holds.
 *
 * Rules:
 *  - Nova is spent only once the effect is certain (a merchant that finds no spot, a spin that cannot run… cost
 *    nothing). Every spend goes through `liveops.spendNova`, which emits `nova:spent` (analytics `nova_spent`).
 *  - Daily caps count per local day (`dateKey(game.now())`), in `liveops.novaShop` — optional, so older saves
 *    load as "nothing bought today".
 *  - The expedition rush prices itself by the time left on the trip it would bring home.
 *
 * Confirmation for big spends (>= NOVA_CONFIRM_AT) is the UI's job (ui/panels/shop/novaShopTab.ts).
 */
import type { Game } from '../core/Game';
import type { Expedition } from '../core/state';
import type { Reward } from '../data/schema';
import { EXPEDITION_RUSH, NOVA_SHOP, type NovaShopItemDef } from '../data/novaShop';
import { dateKey } from '../core/format';
import { crateReward, scaleReward } from './meta/util';
import { seasonTrackXp } from './seasonBonus';

declare module '../core/state' {
  interface LiveOpsState {
    /** Nova Shop purchases today (daily caps). */
    novaShop?: { date: string; counts: Record<string, number> };
  }
}

export interface NovaOffer {
  def: NovaShopItemDef;
  /** Price right now (the expedition rush follows the time left). */
  price: number;
  /** Purchases left today (Infinity without a cap). */
  left: number;
  /** Can be bought right now (enough Nova included). */
  ok: boolean;
  /** Why not (null when ok). "Not enough Nova" comes last, so a real blocker always shows first. */
  reason: string | null;
  /** A short live detail ("Pine Ridge · 42m left", "Level 12 → 13", "+180 of each basic"). */
  detail: string | null;
  /** What it would give (caches), for the card's chips. */
  reward?: Reward;
}

export interface NovaBuyResult {
  ok: boolean;
  reason?: string;
  price?: number;
  /** spin: the winning segment (the wheel animates onto it). */
  spin?: number;
  /** cache: what was granted. */
  reward?: Reward;
}

export function novaShopItem(id: string): NovaShopItemDef | undefined {
  return NOVA_SHOP.find((d) => d.id === id);
}

/** Price to bring an expedition home now, by seconds left. */
export function expeditionRushPrice(secondsLeft: number): number {
  const minutes = Math.max(0, secondsLeft) / 60;
  return Math.max(EXPEDITION_RUSH.base, Math.ceil(EXPEDITION_RUSH.base + minutes * EXPEDITION_RUSH.perMinute));
}

/** Bought today (local day). */
export function novaBoughtToday(game: Game, id: string): number {
  const ns = game.state.liveops.novaShop;
  return ns && ns.date === dateKey(game.now()) ? (ns.counts[id] ?? 0) : 0;
}

function record(game: Game, id: string): void {
  const lo = game.state.liveops;
  const today = dateKey(game.now());
  if (!lo.novaShop || lo.novaShop.date !== today) lo.novaShop = { date: today, counts: {} };
  lo.novaShop.counts[id] = (lo.novaShop.counts[id] ?? 0) + 1;
}

/** The trip a rush would bring home: the one due back soonest (a specific id when given). */
export function rushTarget(game: Game, expeditionId?: number): Expedition | null {
  const out = game.sys.expeditions.out();
  if (expeditionId != null) return out.find((e) => e.id === expeditionId) ?? null;
  let best: Expedition | null = null;
  for (const e of out) if (!best || e.endsAt < best.endsAt) best = e;
  return best;
}

/** Supplies in a cache: `crates` free crates' worth for the colony's tier (no season XP: that has its own item). */
export function cacheReward(game: Game, def: NovaShopItemDef): Reward {
  const base = scaleReward(crateReward(game.data, game.state.colony.tier), def.crates ?? 1);
  return { resources: base.resources };
}

/** The best wandering merchant the colony's tier can call (null below the first one's tier). */
function merchantDef(game: Game) {
  const tier = game.state.colony.tier;
  let best: ReturnType<Game['data']['worldEvent']> = undefined;
  for (const d of game.data.worldEvents) if (d.kind === 'merchant' && d.minTier <= tier && (!best || d.minTier > best.minTier)) best = d;
  return best ?? null;
}

function fmtLeft(seconds: number): string {
  const m = Math.ceil(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m left` : `${m}m left`;
}

/** Live status of one item (null for an unknown id). */
export function novaOffer(game: Game, id: string, opts: { expedition?: number } = {}): NovaOffer | null {
  const def = novaShopItem(id);
  if (!def) return null;
  const g = game;
  const lo = g.sys.liveops;
  const used = novaBoughtToday(g, id);
  const left = def.dailyCap > 0 ? Math.max(0, def.dailyCap - used) : Infinity;
  let price = def.nova;
  let reason: string | null = null;
  let detail: string | null = null;
  let reward: Reward | undefined;

  switch (def.kind) {
    case 'boost': {
      const b = def.boost!;
      const secs = lo.boostSecondsLeft(b.kind);
      if (secs > 0 && lo.boostMultiplier(b.kind) >= b.mult) detail = `Running · adds ${b.minutes >= 60 ? `${b.minutes / 60} h` : `${b.minutes} min`}`;
      break;
    }
    case 'expedition': {
      const e = rushTarget(g, opts.expedition);
      if (!e) reason = g.sys.expeditions.unlocked() ? 'No squad is out right now' : 'Build a Radio Tower for expeditions';
      else {
        const secs = g.sys.expeditions.secondsLeft(e);
        price = expeditionRushPrice(secs);
        detail = `${g.sys.expeditions.nameOf(e)} · ${fmtLeft(secs)}`;
      }
      break;
    }
    case 'cache':
      reward = cacheReward(g, def);
      break;
    case 'recruit':
      if (g.sys.colonists.freeBeds() <= 0) reason = 'Build a bed for them first';
      break;
    case 'recruit_refresh':
      if (!g.sys.colonists.boardAvailable()) reason = 'Build a recruitment board first';
      break;
    case 'merchant': {
      const m = merchantDef(g);
      if (!m) {
        const first = Math.min(...g.data.worldEvents.filter((d) => d.kind === 'merchant').map((d) => d.minTier));
        reason = `Merchants visit from the ${g.data.tier(first)?.name ?? `tier ${first}`} tier`;
      } else if (g.state.world.events.some((ev) => g.data.worldEvent(ev.def)?.kind === 'merchant' && ev.endsAt > g.state.playTime)) reason = 'A merchant is already here';
      else detail = m.name;
      break;
    }
    case 'spin':
      if (g.data.spinSegments.length === 0) reason = 'The wheel is resting';
      break;
    case 'season_level': {
      const s = g.state.liveops.season;
      const season = g.data.season;
      const lvl = lo.seasonLevel();
      if (lvl < season.levels.length) detail = `Level ${lvl} → ${lvl + 1}`;
      else if (s.premium && season.bonus) detail = 'Next bonus chest';
      else reason = 'Season track complete';
      break;
    }
  }
  if (!reason && left <= 0) reason = 'Sold out for today: back tomorrow';
  if (!reason && g.state.liveops.nova < price) reason = 'Not enough Nova Crystals';
  return { def, price, left, ok: reason == null, reason, detail, reward };
}

/** Every item's live status, in catalogue order. */
export function novaOffers(game: Game): NovaOffer[] {
  return NOVA_SHOP.map((d) => novaOffer(game, d.id)!);
}

/** Season XP a "skip a level" adds right now (to the next level, or the next bonus chest past the end). */
export function skipLevelXp(game: Game): number {
  const season = game.data.season;
  const xp = game.state.liveops.season.xp;
  const track = seasonTrackXp(season);
  if (xp < track) return (Math.floor(xp / season.xpPerLevel) + 1) * season.xpPerLevel - xp;
  const per = season.bonus?.xp ?? 0;
  return per > 0 ? per - ((xp - track) % per) : 0;
}

/**
 * Buy an item: checks, applies, then charges (nothing is charged when the effect could not happen).
 * `opts.expedition` picks the trip to rush (default: the one due back soonest).
 */
export function buyNovaItem(game: Game, id: string, opts: { expedition?: number } = {}): NovaBuyResult {
  const offer = novaOffer(game, id, opts);
  if (!offer) return { ok: false, reason: 'Unknown item' };
  if (!offer.ok) return { ok: false, reason: offer.reason ?? 'Not available' };
  const g = game;
  const def = offer.def;
  const price = offer.price;
  const result: NovaBuyResult = { ok: true, price };
  let done = false;

  switch (def.kind) {
    case 'boost': {
      const b = def.boost!;
      g.sys.liveops.activateBoost(b.kind, b.mult, b.minutes); // toasts "⚡ 2× Production for 60 min"
      done = true;
      break;
    }
    case 'expedition': {
      const e = rushTarget(g, opts.expedition);
      if (e) {
        e.endsAt = Math.min(e.endsAt, g.now());
        g.sys.expeditions.checkReturns(); // squad home, haul waiting at the Radio Tower
        done = e.status === 'back';
      }
      break;
    }
    case 'cache': {
      const reward = offer.reward ?? cacheReward(g, def);
      g.grant(reward, 'nova_shop');
      result.reward = reward;
      done = true;
      break;
    }
    case 'recruit':
      g.sys.colonists.grant(def.rarity ?? 'epic');
      g.toast(`🧑‍🚀 An ${def.rarity ?? 'epic'} colonist has joined your colony!`, 'reward');
      done = true;
      break;
    case 'recruit_refresh':
      g.sys.colonists.refreshCandidates(true);
      g.toast('🧑‍🚀 New recruits have arrived', 'success');
      done = true;
      break;
    case 'merchant': {
      const m = merchantDef(g);
      const ev = m ? g.sys.worldEvents.spawn(m.id) : null;
      if (ev) {
        g.toast(`🛒 ${m!.name} is on the way. Look for the cart on your map!`, 'reward');
        done = true;
      } else result.reason = 'The merchant could not find a spot. Try again in a moment';
      break;
    }
    case 'spin': {
      const idx = g.sys.liveops.bonusSpin();
      if (idx != null) {
        result.spin = idx;
        done = true;
      }
      break;
    }
    case 'season_level': {
      const xp = skipLevelXp(g);
      if (xp > 0) {
        g.sys.liveops.addXp(xp);
        done = true;
      }
      break;
    }
  }

  if (!done) return { ok: false, reason: result.reason ?? 'Not available right now' };
  // can't fail: the offer checked the balance and nothing above spends Nova
  g.sys.liveops.spendNova(price, `nova_shop:${def.id}`);
  record(g, def.id);
  g.bus.emit('sfx', { id: 'reward' });
  return result;
}
