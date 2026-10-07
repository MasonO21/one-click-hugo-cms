/**
 * Save validation, repair and versioned migrations.
 *
 * Load pipeline:  parse -> validateMarkers (is this really a Nova Colony save?) -> run migrations
 * (version N -> N+1 ...) -> deepFill (add any fields newer builds introduced) -> repair (fix NaN /
 * junk entries). A save that fails the marker check is treated as corrupt and the SaveManager falls
 * back to a backup — repair is only ever applied to something that is recognisably a real save, so
 * an empty `{}` can never silently replace hours of progress.
 *
 * To change the save format: bump SAVE_VERSION in core/constants.ts and register a migration that
 * upgrades a version-(N) object to version N+1 in MIGRATIONS[N].
 *
 * OWNER: meta agent.
 */
import { SAVE_VERSION } from '../core/constants';
import { createInitialState, type GameState } from '../core/state';

/** Upgrades a raw save of version `from` to version `from + 1` (may mutate and return the same object). */
export type Migration = (raw: any) => any;

/** Registered migrations keyed by the version they upgrade FROM. (None yet: v1 is the first format.) */
export const MIGRATIONS: Record<number, Migration> = {};

const isObj = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Cheap structural check that this is a recognisable save. Returns an error message or null. */
export function validateMarkers(raw: unknown): string | null {
  if (!isObj(raw)) return 'save is not an object';
  if (!isNum(raw.seed)) return 'missing seed';
  if (!isNum(raw.playTime)) return 'missing playTime';
  if (!isNum(raw.createdAt)) return 'missing createdAt';
  if (!isObj(raw.resources) || !isObj(raw.resources.amounts)) return 'missing resources';
  if (!isObj(raw.buildings) || !Array.isArray(raw.buildings.list)) return 'missing buildings';
  if (!isObj(raw.colonists) || !Array.isArray(raw.colonists.list)) return 'missing colonists';
  if (!isObj(raw.colony)) return 'missing colony';
  return null;
}

/** Validation used on the save path: refuse to overwrite a good save with a broken state. */
export function validateState(s: unknown): string | null {
  const err = validateMarkers(s);
  if (err) return err;
  const st = s as GameState;
  if (!isNum(st.lastTickAt)) return 'lastTickAt is not a number';
  return null;
}

function clone<T>(v: T): T {
  if (Array.isArray(v)) return v.map(clone) as T;
  if (isObj(v)) {
    const o: Record<string, any> = {};
    for (const k of Object.keys(v)) o[k] = clone(v[k]);
    return o as T;
  }
  return v;
}

/** Add keys missing from `target` and replace values whose basic type no longer fits the defaults. */
export function deepFill(target: Record<string, any>, defaults: Record<string, any>): void {
  for (const key of Object.keys(defaults)) {
    const d = defaults[key];
    const t = target[key];
    if (t === undefined) {
      target[key] = clone(d);
    } else if (d === null) {
      continue; // nullable slot, anything goes
    } else if (Array.isArray(d)) {
      if (!Array.isArray(t)) target[key] = clone(d);
    } else if (isObj(d)) {
      if (!isObj(t)) target[key] = clone(d);
      else deepFill(t, d);
    } else if (typeof t !== typeof d) {
      // numbers that were serialized as null (NaN) land here too
      target[key] = d;
    }
  }
}

function fixDict(d: Record<string, any> | undefined, min = 0): void {
  if (!d) return;
  for (const k of Object.keys(d)) {
    if (!isNum(d[k])) delete d[k];
    else if (d[k] < min) d[k] = min;
  }
}

/** Remove junk entries and non-finite numbers from an otherwise valid save. */
export function repairState(s: GameState): void {
  s.buildings.list = s.buildings.list.filter((b) => isObj(b) && typeof b.def === 'string' && isNum(b.x) && isNum(b.z));
  s.colonists.list = s.colonists.list.filter((c) => isObj(c) && isNum(c.id));
  fixDict(s.resources.amounts);
  fixDict(s.resources.lifetime);
  fixDict(s.player.items);
  fixDict(s.player.backpack);
  fixDict(s.crafting.crafted);
  fixDict(s.missions.counters);
  fixDict(s.missions.progress);
  if (!isNum(s.liveops.nova) || s.liveops.nova < 0) s.liveops.nova = 0;
  if (!isNum(s.lastTickAt)) s.lastTickAt = s.createdAt;
  if (s.playTime < 0) s.playTime = 0;
  s.buildings.nextId = Math.max(isNum(s.buildings.nextId) ? s.buildings.nextId : 1, 1 + s.buildings.list.reduce((m, b) => Math.max(m, isNum(b.id) ? b.id : 0), 0));
}

export interface MigrateOptions {
  /** Target version (default SAVE_VERSION). */
  target?: number;
  /** Migration table (default MIGRATIONS) — injectable for tests. */
  migrations?: Record<number, Migration>;
}

/** Bring a raw parsed save up to date. Throws if it is not recognisably a save. */
export function migrateState(raw: unknown, opts: MigrateOptions = {}): GameState {
  const bad = validateMarkers(raw);
  if (bad) throw new Error(`invalid save: ${bad}`);
  let s = raw as Record<string, any>;
  const target = opts.target ?? SAVE_VERSION;
  const table = opts.migrations ?? MIGRATIONS;
  let v = isNum(s.version) && s.version >= 1 ? Math.floor(s.version) : 1;
  if (v > target) console.warn(`[save] save version ${v} is newer than this build (${target}); loading best-effort`);
  while (v < target) {
    const m = table[v];
    if (m) s = m(s) ?? s;
    v++;
    s.version = v;
  }
  s.version = Math.max(v, target);
  deepFill(s, createInitialState(s.seed, s.createdAt) as unknown as Record<string, any>);
  const state = s as unknown as GameState;
  repairState(state);
  return state;
}
