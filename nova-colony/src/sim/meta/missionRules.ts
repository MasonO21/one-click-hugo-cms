/**
 * Pure mission rules: how bus events map to mission targets, how "live" missions read state,
 * retroactive credit for out-of-order play, and deterministic daily selection.
 * OWNER: meta agent.
 */
import type { Game } from '../../core/Game';
import type { MissionDef, MissionType } from '../../data/schema';
import type { BuildingInstance } from '../../core/state';
import type { DataRegistry } from '../../data';
import { Rng } from '../../core/rng';
import { hashString } from './util';

export const DAILY_COUNT = 3;

/** Mission types computed from current state instead of event counting. */
const LIVE: ReadonlySet<MissionType> = new Set<MissionType>(['have_building', 'colonists', 'assign', 'tier', 'power']);

export function isLiveType(t: MissionType): boolean {
  return LIVE.has(t);
}

/** Does an event that produced `keys` count toward a mission with this `target`? */
export function targetMatches(target: string, keys: readonly string[]): boolean {
  return target === '*' || keys.includes(target);
}

/** Does a building instance match a mission target (def id, `category:<cat>` or `*`)? */
export function buildingMatches(game: Game, b: BuildingInstance, target: string): boolean {
  if (target === '*') return true;
  if (target.startsWith('category:')) return game.data.building(b.def)?.category === target.slice(9);
  return b.def === target;
}

/** Completed (not under construction) buildings matching a target. */
export function countBuildings(game: Game, target: string): number {
  let n = 0;
  for (const b of game.state.buildings.list) if (b.status !== 'building' && buildingMatches(game, b, target)) n++;
  return n;
}

/** Current value of a live-type mission. */
export function liveValue(game: Game, def: MissionDef): number {
  const s = game.state;
  switch (def.type) {
    case 'have_building':
      return countBuildings(game, def.target);
    case 'colonists':
      return s.colonists.list.length;
    case 'assign': {
      let n = 0;
      for (const c of s.colonists.list) if (c.workplace != null) n++;
      return n;
    }
    case 'tier':
      return s.colony.tier;
    case 'power':
      return Math.floor(game.derived.power.produced);
    default:
      return 0;
  }
}

/**
 * Credit a mission already earns from state at activation time, so a player who does things out of
 * order (builds the campfire before the shelter, researches early...) is never stuck on a one-shot
 * event that already happened. Daily missions never get retroactive credit.
 */
export function retroValue(game: Game, def: MissionDef): number {
  // granted wishes are counted for the whole colony's life (the chain picks up where the player already is)
  if (def.type === 'wish' && def.chain !== 'daily') return game.state.missions.counters[`wish:${def.target}`] ?? 0;
  if (def.chain === 'daily' || def.target === '*') return 0;
  const s = game.state;
  switch (def.type) {
    case 'build':
      return countBuildings(game, def.target);
    case 'research':
      return s.research.completed.includes(def.target) ? 1 : 0;
    case 'discover':
      return s.world.regionsDiscovered.includes(def.target) ? 1 : 0;
    case 'equip':
      return Object.values(s.player.equip).includes(def.target) ? 1 : 0;
    case 'craft':
      return s.crafting.crafted[def.target] ?? 0;
    case 'upgrade': {
      let n = 0;
      for (const b of s.buildings.list) if (buildingMatches(game, b, def.target)) n += Math.max(0, b.level - 1);
      return n;
    }
    case 'expedition':
      // expeditions are counted by the lifetime counters (launch / collect / frontier / region / destination)
      return s.missions.counters[`expedition:${def.target}`] ?? 0;
    default:
      return 0;
  }
}

/**
 * The colony tier a mission's goal first becomes doable at: the unlock tier of the building to build / have / upgrade,
 * of the recipe to craft, or of the recipe that makes the item to equip (a research gate counts with its own tier).
 * 0 when nothing gates it (a category, `*`, an unknown id, kills, loot...).
 */
export function goalTier(data: DataRegistry, def: MissionDef): number {
  const researchTier = (id?: string): number => (id ? (data.researchDef(id)?.tier ?? 0) : 0);
  switch (def.type) {
    case 'build':
    case 'have_building':
    case 'upgrade': {
      const b = data.building(def.target);
      return b ? Math.max(b.unlockTier, researchTier(b.research)) : 0;
    }
    case 'craft': {
      const r = data.recipe(def.target);
      return r ? Math.max(r.unlockTier, researchTier(r.research)) : 0;
    }
    case 'equip': {
      let t = Infinity;
      for (const r of data.recipes) if (r.outputs.items?.[def.target]) t = Math.min(t, Math.max(r.unlockTier, researchTier(r.research)));
      return Number.isFinite(t) ? t : 0;
    }
    default:
      return 0;
  }
}

/**
 * Bosses a defeated boss also counts for: every boss that first leads an invasion at a lower tier ("Defeat an Elder
 * Brute" is done by beating the Hive Mother that leads the raids once the colony has moved on). Elder Brutes only
 * come up to Steel and Hive Mothers up to Nano, so a colony that tiers up first could otherwise never finish the
 * step, nor the side chain behind it.
 */
export function lesserBosses(data: DataRegistry, alien: string): string[] {
  const firstTier = (id: string): number => {
    let t = Infinity;
    for (const inv of data.invasions) if (inv.boss?.alien === id) t = Math.min(t, inv.tier);
    return t;
  };
  const mine = firstTier(alien);
  if (!data.alien(alien)?.boss || !Number.isFinite(mine)) return [];
  const out: string[] = [];
  for (const inv of data.invasions) {
    const b = inv.boss?.alien;
    if (b && b !== alien && !out.includes(b) && firstTier(b) < mine) out.push(b);
  }
  return out;
}

/** Deterministic daily selection: same date => same missions for every player. */
export function pickDailies(pool: readonly string[], date: string, count = DAILY_COUNT): string[] {
  const rng = new Rng(hashString(`nova-daily:${date}`));
  return rng.shuffle([...pool]).slice(0, count);
}
