/**
 * QA helpers for the pacing bot (scripts/pacing-bot.mjs --saves / --soak):
 *
 *  - `rebaseSave`: move a save made on the bot's simulated calendar (it starts on 2026-10-12) to another moment, so
 *    it loads on a real device as if the player had just closed the app (or was away for a while). Every epoch-ms
 *    timer moves by the same amount and every local "YYYY-MM-DD" day key by the same number of local days.
 *  - `exportSave`: the localStorage envelope ("NCS1:<crc>:<json>", platform/saveCodec) of a running game.
 *  - `scanState`: numbers that are not finite (NaN / Infinity where a finite value belongs) and the size of every
 *    list and keyed record, to spot state that grows without bound over weeks of play.
 */
import type { Game } from '../../src/core/Game';
import { serializeState, type GameState } from '../../src/core/state';
import { dateKey } from '../../src/core/format';
import { wrapSave } from '../../src/platform/saveCodec';

const DAY_MS = 86_400_000;
const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Local day key `days` days after `key` (DST-safe: noon to noon). */
export function shiftDayKey(key: string, days: number): string {
  const m = DAY_KEY.exec(key);
  if (!m) return key;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days, 12, 0, 0, 0);
  return dateKey(d.getTime());
}

/** Whole local days from the day of `a` to the day of `b`. */
function dayDiff(a: number, b: number): number {
  const ka = DAY_KEY.exec(dateKey(a))!;
  const kb = DAY_KEY.exec(dateKey(b))!;
  const ua = Date.UTC(Number(ka[1]), Number(ka[2]) - 1, Number(ka[3]));
  const ub = Date.UTC(Number(kb[1]), Number(kb[2]) - 1, Number(kb[3]));
  return Math.round((ub - ua) / DAY_MS);
}

/**
 * Rebase a parsed save so its last tick lands on `lastTickAt` (epoch ms). Epoch-ms numbers between a day before the
 * save was created and 90 days after its last tick move with it; day keys move by the number of local days between
 * the old and the new last tick. Game numbers never reach epoch-ms magnitudes, so nothing else is touched.
 * Mutates and returns `state`.
 */
export function rebaseSave<T extends Pick<GameState, 'createdAt' | 'lastTickAt'>>(state: T, lastTickAt: number): T {
  const from = state.lastTickAt;
  const delta = lastTickAt - from;
  const days = dayDiff(from, lastTickAt);
  const lo = Math.min(state.createdAt, from) - DAY_MS;
  const hi = from + 90 * DAY_MS;
  const walk = (v: unknown): unknown => {
    if (typeof v === 'number') return v >= lo && v <= hi ? v + delta : v;
    if (typeof v === 'string') return DAY_KEY.test(v) ? shiftDayKey(v, days) : v;
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) v[i] = walk(v[i]);
      return v;
    }
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      for (const k of Object.keys(o)) o[k] = walk(o[k]);
      return o;
    }
    return v;
  };
  walk(state);
  return state;
}

/** The localStorage envelope of a running game's save, optionally rebased so its last tick is `lastTickAt`. */
export function exportSave(game: Game, lastTickAt?: number): string {
  const json = serializeState(game.state);
  if (lastTickAt === undefined) return wrapSave(json);
  const raw = JSON.parse(json) as GameState;
  return wrapSave(JSON.stringify(rebaseSave(raw, lastTickAt)));
}

export interface StateScan {
  /** Paths of numbers that are NaN or +-Infinity where a finite value belongs. */
  nonFinite: string[];
  /** Length of every list and key count of every record, by path (list items collapse to `[]`, summed). */
  sizes: Record<string, number>;
}

/** Numbers that may legitimately be +Infinity ("never": no raid scheduled, a node under a building); saved as 1e300. */
const INFINITY_OK = new Set(['combat.nextAt', 'world.depleted{}']);

/** Keyed records whose keys are ids or names (their children collapse to `{}`); objects with numeric or 40+ keys too. */
const RECORDS = new Set([
  'world.pois',
  'world.depleted',
  'missions.progress',
  'missions.counters',
  'achievements.unlocked',
  'achievements.claimed',
  'wishes.bonds',
  'wishes.moods',
  'crafting.crafted',
  'player.items',
  'resources.amounts',
  'resources.lifetime',
]);

/**
 * Walk a state (in memory, where NaN survives; JSON turns it into null) for non-finite numbers and collection sizes:
 * every list's length and every object's key count by path.
 */
export function scanState(state: unknown): StateScan {
  const nonFinite: string[] = [];
  const sizes: Record<string, number> = {};
  const add = (p: string, n: number) => (sizes[p] = (sizes[p] ?? 0) + n);
  const walk = (v: unknown, path: string, depth: number): void => {
    if (typeof v === 'number') {
      if (!Number.isFinite(v) && !(v === Infinity && INFINITY_OK.has(path))) nonFinite.push(`${path}=${v}`);
      return;
    }
    if (depth > 12 || !v || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      add(path, v.length);
      for (const item of v) walk(item, `${path}[]`, depth + 1);
      return;
    }
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o);
    if (path) add(`${path}{}`, keys.length);
    const record = RECORDS.has(path) || keys.length >= 40 || (keys.length > 0 && keys.every((k) => /^\d+$/.test(k)));
    for (const k of keys) walk(o[k], record ? `${path}{}` : path ? `${path}.${k}` : k, depth + 1);
  };
  walk(state, '', 0);
  return { nonFinite, sizes };
}
