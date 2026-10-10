/**
 * Wave planning (InvasionDef -> timed spawn queue on the colony ring) and reward scaling.
 * Pure-ish helpers: they read game state/data and use game.rng, but never mutate state.
 */
import { CELL, HALF_WORLD } from '../../core/constants';
import type { Game } from '../../core/Game';
import type { CombatState } from '../../core/state';
import type { InvasionDef, Reward } from '../../data/schema';
import { TUNE } from './types';
import { shapeCounts } from './raidShape';

export type SpawnItem = CombatState['spawnQueue'][number];

export interface WavePlan {
  /** Sorted by `at` DESCENDING (the system pops due spawns from the end). */
  queue: SpawnItem[];
  /** HP multiplier for invaders (compensates when content has no table for the colony tier yet). */
  hpScale: number;
  /** Spawn directions (radians, 0 = +X, PI/2 = +Z) — UI may show arrows. */
  directions: number[];
}

/** How many tiers the invasion table lags behind the colony tier (content fallback). */
export function tierLag(game: Game, inv: InvasionDef): number {
  return Math.max(0, game.state.colony.tier - inv.tier);
}

/** Count multiplier for the next wave: waveScaling per wave survived at this tier (+ lag fallback). */
export function waveCountScale(game: Game, inv: InvasionDef): number {
  const c = game.state.combat;
  return (1 + game.data.balance.waveScaling * c.waveAtTier) * (1 + 0.35 * tierLag(game, inv));
}

/** Point on the spawn ring at `angle`, nudged onto walkable ground when possible. */
export function ringPoint(game: Game, cx: number, cz: number, radius: number, angle: number): { x: number; z: number } {
  const world = game.sys.world;
  const lim = HALF_WORLD - CELL;
  for (let k = 0; k < 16; k++) {
    // 0, +1, -1, +2, -2 ... angular steps, then slightly further out
    const step = ((k + 1) >> 1) * (k & 1 ? 1 : -1);
    const a = angle + step * 0.12;
    const r = radius + (k >= 10 ? (k - 9) * CELL : 0);
    const x = Math.max(-lim, Math.min(lim, cx + Math.cos(a) * r));
    const z = Math.max(-lim, Math.min(lim, cz + Math.sin(a) * r));
    let ok = true;
    try {
      ok = world.walkable(x, z);
    } catch {
      ok = true; // world not generated (tests / stubs): any ground is fine
    }
    if (ok) return { x, z };
  }
  return {
    x: Math.max(-lim, Math.min(lim, cx + Math.cos(angle) * radius)),
    z: Math.max(-lim, Math.min(lim, cz + Math.sin(angle) * radius)),
  };
}

/**
 * Compose the next invasion wave starting at playTime `startAt`, around the colony center (cx, cz).
 * Groups keep their direction so attacks read clearly; 1–3 directions (more at higher tiers). Counts are shaped by
 * ./raidShape (a tier's first raid previews new alien types; no raid outgrows the previous one by more than 25%).
 * `bias` (radians, same convention as `directions`) orients the first direction, e.g. toward the
 * player's turrets during the first waves so the tutorial attack walks into the defenses.
 * `minRingCells` pushes the spawn ring out to (at most) the flow-field edge, e.g. past the turrets' reach.
 */
export function planWave(game: Game, startAt: number, cx: number, cz: number, bias: number | null = null, minRingCells = 0): WavePlan {
  const { data, rng } = game;
  const st = game.state;
  const c = st.combat;
  const tier = st.colony.tier;
  const out: WavePlan = { queue: [], hpScale: 1, directions: [] };
  if (!data.invasions.length) return out;
  const inv = data.invasion(tier);
  const scale = waveCountScale(game, inv);
  out.hpScale = 1 + 0.5 * tierLag(game, inv);

  const minDirs = tier >= 3 ? 2 : 1;
  const maxDirs = tier === 0 ? 1 : tier < 3 ? 2 : 3;
  const nDirs = rng.int(minDirs, maxDirs);
  const base = bias ?? rng.range(0, Math.PI * 2);
  for (let i = 0; i < nDirs; i++) out.directions.push(base + (i * Math.PI * 2) / nDirs + rng.range(-0.35, 0.35));

  // Spawn just outside the turrets' reach (but inside the flow field) so attackers are seen walking in
  // instead of melting on the spawn ring of a fully fortified late-game colony.
  const baseRing = st.colony.radius + TUNE.SPAWN_RING_EXTRA;
  const ring = Math.min(Math.max(baseRing, minRingCells), st.colony.radius + TUNE.FIELD_MARGIN - 1) * CELL;
  let lastDelay = 0;
  const bossDue = !!inv.boss && !!data.alien(inv.boss.alien) && inv.boss.every > 0 && (c.waveAtTier + 1) % inv.boss.every === 0;
  // a tier's first raid previews its new alien types, and no raid outgrows the last one by more than RAID_GROWTH
  const counts = shapeCounts(
    game,
    inv,
    inv.groups.map((g) => (data.alien(g.alien) ? Math.max(1, Math.round(g.count * scale)) : 0)),
    bossDue ? 1 : 0,
  );
  inv.groups.forEach((g, gi) => {
    const count = counts[gi];
    if (!data.alien(g.alien) || count <= 0) return;
    const dir = out.directions[gi % nDirs];
    // big late-game groups arrive as a swarm (within GROUP_WINDOW seconds) instead of a one-by-one trickle
    // that a fortified colony shreds before two aliens are ever on screen together
    const stagger = Math.min(TUNE.STAGGER, TUNE.GROUP_WINDOW / count);
    lastDelay = Math.max(lastDelay, g.delay + count * stagger);
    for (let i = 0; i < count; i++) {
      const p = ringPoint(game, cx, cz, ring, dir + rng.range(-0.22, 0.22));
      out.queue.push({ alien: g.alien, at: startAt + g.delay + i * stagger + rng.range(0, 0.6), x: p.x, z: p.z });
    }
  });

  if (bossDue && inv.boss) {
    const p = ringPoint(game, cx, cz, ring, out.directions[0]);
    out.queue.push({ alien: inv.boss.alien, at: startAt + lastDelay + 6, x: p.x, z: p.z });
  }

  out.queue.sort((a, b) => a.at - b.at);
  if (out.queue.length > TUNE.MAX_WAVE) out.queue.length = TUNE.MAX_WAVE;
  out.queue.reverse();
  return out;
}

/**
 * Multiply the numeric parts of a reward (resources, rp, xp, nova). Rounds and never drops a positive
 * amount to 0. Items only scale by whole multiples (x2 when doubled), never below their base count.
 */
export function scaleReward(r: Reward, mult: number, novaMult = mult): Reward {
  const out: Reward = { ...r };
  const scale = (v: number, m: number) => (v > 0 ? Math.max(1, Math.round(v * m)) : v);
  if (r.resources) {
    out.resources = {};
    for (const [k, v] of Object.entries(r.resources)) if (typeof v === 'number') out.resources[k] = scale(v, mult);
  }
  if (r.items) {
    out.items = {};
    const whole = Math.max(1, Math.floor(mult));
    for (const [k, v] of Object.entries(r.items)) out.items[k] = scale(v, whole);
  }
  if (r.rp) out.rp = scale(r.rp, mult);
  if (r.xp) out.xp = scale(r.xp, mult);
  if (r.nova) out.nova = scale(r.nova, novaMult);
  return out;
}

/**
 * Victory chest for the wave that just ended: base InvasionDef.reward scaled by tier (content lag),
 * wave size, `modifier('invasionReward')`, the start-early bonus and a kill bonus; halved on a breach.
 * Nova is only affected by the breach halving (premium currency stays predictable).
 */
export function victoryReward(game: Game, kills: number, bonus: number, breach: boolean): Reward {
  if (!game.data.invasions.length) return {};
  const inv = game.data.invasion(game.state.colony.tier);
  const killBonus = Math.min(0.5, kills * 0.015);
  let mult = (1 + 0.75 * tierLag(game, inv)) * waveCountScale(game, inv) * (1 + bonus) * (1 + killBonus);
  mult *= game.sys.economy.modifier('invasionReward');
  if (breach) mult *= 0.5;
  return scaleReward(inv.reward, mult, breach ? 0.5 : 1);
}
