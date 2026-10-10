/**
 * Raid shaping and the scouting report: the first raid of each colony tier used to be the hardest one of the tier
 * (the audit saw 20 aliens at Stone jump to 43 at Steel, with twelve brand-new Razor Crawlers among them).
 *
 *  - Growth cap: a raid is at most RAID_GROWTH x the size of the previous one, so a tier-up eases into the new
 *    invasion table over a few raids instead of jumping straight to it (within a tier, waveScaling grows raids by
 *    a few percent each, well under the cap).
 *  - Previews: in the first raid at a new tier, alien types the colony has never faced come as one or two scouts
 *    only (one for the heavy ones), so the player meets them before a full group arrives.
 *  - Scouting report: the warning names those new types and what helps against them ("Razor Crawlers ahead:
 *    Machine-Gun Turrets help"), picked from what the colony can build at its tier.
 *
 * Pure helpers over game state and data (no RNG, no mutation): the wave planner, the warning toast and the HUD
 * banner all read the same answer.
 */
import type { Game } from '../../core/Game';
import type { AlienDef, InvasionDef } from '../../data/schema';
import type { DataRegistry } from '../../data';

declare module '../../core/state' {
  interface CombatState {
    /** Aliens planned for the last raid (groups + boss, not queen broods): the next raid grows at most RAID_GROWTH x this. */
    lastWaveSize?: number;
  }
}

/** A raid is at most this many times the size of the previous one. */
export const RAID_GROWTH = 1.25;
/** New alien types in the first raid at a tier: at most this many of each... */
export const PREVIEW_COUNT = 2;
/** ...and one of the heavy ones (this much HP or more). */
export const PREVIEW_HEAVY_HP = 400;

/**
 * What helps against each alien, best first: the first one the colony can build at its tier is named. `tip` replaces
 * the building when there is nothing to build for it (burrowers), and closes the line when none is available yet.
 */
const COUNTERS: Record<string, { use: string[]; tip: string }> = {
  crawler: { use: ['scrap_turret', 'spike_trap'], tip: 'any turret will do' },
  spitter: { use: ['guard_tower', 'crossfire_tower', 'mg_turret'], tip: 'long-range turrets outshoot them' },
  brute: { use: ['spike_trap', 'log_trap', 'guard_tower'], tip: 'traps slow them down' },
  burrower: { use: [], tip: 'keep a turret near the core' },
  flyer: { use: ['aa_gun', 'mg_turret', 'heavy_sentry', 'missile_turret'], tip: 'anti-air turrets shoot them down' },
  queen: { use: ['missile_turret', 'cannon_turret', 'heavy_sentry'], tip: 'heavy turrets take her down first' },
  titan: { use: ['cannon_turret', 'missile_turret', 'plasma_turret', 'railgun'], tip: 'heavy turrets hit hardest' },
  razor_crawler: { use: ['mg_turret', 'sentry_gun', 'flamethrower', 'heavy_sentry'], tip: 'fast-firing turrets help' },
  acid_spitter: { use: ['missile_turret', 'heavy_sentry', 'mg_turret'], tip: 'long-range turrets outshoot them' },
  deep_burrower: { use: [], tip: 'keep turrets near the core' },
  stormwing: { use: ['flak_battery', 'aa_gun', 'laser_turret'], tip: 'anti-air turrets shoot them down' },
};

export interface ScoutEntry {
  alien: string;
  /** "Razor Crawlers", "A Swarm Queen". */
  label: string;
  /** How many come in this raid. */
  count: number;
  /** Building named as the counter (null: the tip stands alone). */
  counter: string | null;
  /** "Machine-Gun Turrets help" / "keep a turret near the core". */
  advice: string;
}

/** "Razor Crawler" -> "Razor Crawlers", "Heavy Sentry" -> "Heavy Sentries". */
export function plural(name: string): string {
  if (/[^aeiou]y$/i.test(name)) return name.slice(0, -1) + 'ies';
  if (/s$/i.test(name)) return name;
  return name + 's';
}

/** Alien types (group aliens) of every invasion table below `inv`'s tier. */
function seenBefore(data: DataRegistry, inv: InvasionDef): Set<string> {
  const seen = new Set<string>();
  for (const t of data.invasions) {
    if (t.tier >= inv.tier) continue;
    for (const g of t.groups) seen.add(g.alien);
    const spawn = (id: string) => data.alien(id)?.spawns?.alien;
    for (const g of t.groups) {
      const s = spawn(g.alien);
      if (s) seen.add(s);
    }
  }
  return seen;
}

/**
 * Alien types in `inv` that no lower-tier table brings (table order). Empty for the lowest table: the very first
 * raid is the tutorial's and needs no scouts.
 */
export function newAlienTypes(data: DataRegistry, inv: InvasionDef): string[] {
  if (!data.invasions.some((t) => t.tier < inv.tier)) return [];
  const seen = seenBefore(data, inv);
  const out: string[] = [];
  for (const g of inv.groups) if (!seen.has(g.alien) && !out.includes(g.alien) && data.alien(g.alien)) out.push(g.alien);
  return out;
}

/** Scouts of a new type in a tier's first raid. */
export function previewCount(def: AlienDef | undefined): number {
  return def && def.hp >= PREVIEW_HEAVY_HP ? 1 : PREVIEW_COUNT;
}

/** The coming raid is the first at this colony tier (and not the tutorial's very first one). */
export function isFirstAtTier(game: Game): boolean {
  return game.state.combat.waveAtTier === 0 && game.state.combat.wave > 0;
}

/** Planned size of an invasion table at its base counts (old saves have no lastWaveSize yet). */
function baseSize(inv: InvasionDef): number {
  let n = 0;
  for (const g of inv.groups) n += Math.max(1, g.count);
  return n;
}

/** The size the next raid grows from: the last raid's, or (old saves, first raid at a tier) the previous table's. */
export function previousSize(game: Game, inv: InvasionDef): number | null {
  const c = game.state.combat;
  if (typeof c.lastWaveSize === 'number' && c.lastWaveSize > 0) return c.lastWaveSize;
  if (!isFirstAtTier(game)) return null;
  let prev: InvasionDef | null = null;
  for (const t of game.data.invasions) if (t.tier < inv.tier && (!prev || t.tier > prev.tier)) prev = t;
  return prev ? baseSize(prev) : null;
}

/**
 * Shape the per-group counts of the next raid (in place, same order as `inv.groups`): new types become previews in
 * the first raid at a tier, then the whole raid is held to RAID_GROWTH x the previous one (previews kept, the
 * familiar groups scaled down evenly, every group keeps at least one). `extra`: planned aliens outside the groups
 * (the boss).
 */
export function shapeCounts(game: Game, inv: InvasionDef, counts: number[], extra = 0): number[] {
  const data = game.data;
  const preview = new Array<boolean>(counts.length).fill(false);
  if (isFirstAtTier(game)) {
    const fresh = new Set(newAlienTypes(data, inv));
    const budget = new Map<string, number>();
    inv.groups.forEach((g, i) => {
      if (!fresh.has(g.alien) || counts[i] <= 0) return;
      const left = budget.get(g.alien) ?? previewCount(data.alien(g.alien));
      const n = Math.max(0, Math.min(counts[i], left));
      budget.set(g.alien, left - n);
      counts[i] = n;
      preview[i] = true;
    });
  }
  const prev = previousSize(game, inv);
  if (prev == null) return counts;
  const cap = Math.max(1, Math.floor(prev * RAID_GROWTH)) - extra;
  let fixed = 0;
  let free = 0;
  counts.forEach((n, i) => {
    if (preview[i]) fixed += n;
    else free += n;
  });
  if (fixed + free <= cap || free <= 0) return counts;
  // largest remainder: the familiar groups share what is left of the cap in proportion (each keeps at least one)
  const room = Math.max(0, cap - fixed);
  const k = room / free;
  const frac: { i: number; f: number }[] = [];
  let used = 0;
  counts.forEach((n, i) => {
    if (preview[i] || n <= 0) return;
    const exact = n * k;
    counts[i] = Math.max(1, Math.floor(exact));
    used += counts[i];
    frac.push({ i, f: exact - Math.floor(exact) });
  });
  frac.sort((a, b) => b.f - a.f || a.i - b.i);
  for (const { i } of frac) {
    if (used >= room) break;
    counts[i]++;
    used++;
  }
  return counts;
}

/** The building (id) named as the counter to an alien: the first the colony can build now, else at its tier. */
export function counterFor(game: Game, alien: string): string | null {
  const def = game.data.alien(alien);
  const list = COUNTERS[alien]?.use ?? fallbackCounters(game, def);
  const tier = game.state.colony.tier;
  let atTier: string | null = null;
  for (const id of list) {
    const b = game.data.building(id);
    if (!b || b.unlockTier > tier) continue;
    if (game.sys.buildings.isUnlocked(id)) return id;
    atTier ??= id;
  }
  return atTier;
}

/** Content without a COUNTERS entry: the colony's turrets that suit the alien's traits. */
function fallbackCounters(game: Game, def: AlienDef | undefined): string[] {
  if (!def || (def.burrow && !def.flying)) return [];
  const turrets = game.data.buildings.filter((b) => b.turret && (!def.flying || b.turret.antiAir) && !(b.turret.airOnly && !def.flying));
  const score = (b: (typeof turrets)[number]) => {
    const t = b.turret!;
    if (def.ranged) return t.range;
    if (def.hp >= PREVIEW_HEAVY_HP) return t.damage;
    return t.fireRate;
  };
  return turrets.sort((a, b) => score(b) - score(a)).map((b) => b.id);
}

/** The advice half of a scout line: "Machine-Gun Turrets help", or the tip. */
function adviceFor(game: Game, alien: string): { counter: string | null; advice: string } {
  const counter = counterFor(game, alien);
  const def = game.data.alien(alien);
  if (counter) return { counter, advice: `${plural(game.data.building(counter)?.name ?? counter)} help` };
  return { counter: null, advice: COUNTERS[alien]?.tip ?? (def?.flying ? 'anti-air turrets shoot them down' : 'more turrets help') };
}

/**
 * The scouting report for the coming raid: the alien types the colony has never faced, when it is the first raid at
 * a new tier (empty otherwise). The counts are the previews the raid will bring.
 */
export function scoutReport(game: Game): ScoutEntry[] {
  const data = game.data;
  if (!data.invasions.length || !isFirstAtTier(game)) return [];
  const inv = data.invasion(game.state.colony.tier);
  const out: ScoutEntry[] = [];
  for (const id of newAlienTypes(data, inv)) {
    const def = data.alien(id);
    if (!def) continue;
    const count = previewCount(def);
    const { counter, advice } = adviceFor(game, id);
    out.push({ alien: id, label: count === 1 ? `A ${def.name}` : plural(def.name), count, counter, advice });
  }
  return out;
}

/** "Razor Crawlers ahead: Machine-Gun Turrets help" (the HUD banner shows the first entry). */
export function scoutLine(e: ScoutEntry): string {
  return `${e.label} ahead: ${e.advice}`;
}

/** The warning toast: "Scouts spotted Razor Crawlers (Machine-Gun Turrets help) and Burrowers (keep a turret near the core)." */
export function scoutToast(entries: readonly ScoutEntry[]): string | null {
  if (!entries.length) return null;
  const parts = entries.slice(0, 3).map((e) => `${e.label.replace(/^A /, 'a ')} (${e.advice})`);
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `Scouts spotted ${list}.`;
}
