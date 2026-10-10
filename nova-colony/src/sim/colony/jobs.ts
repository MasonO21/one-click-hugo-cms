/**
 * Jobs: worker slots, auto-assignment and manual assignment.
 *
 * Planning rules (fill order):
 *   1. Manual colonists keep their (valid) workplace and occupy slots first.
 *   2. Required-worker buildings are staffed before optional ones.
 *   3. Within a group, jobs that make what the next tier-up still lacks come first and jobs whose every output store
 *      is full come last (with more jobs than hands, nobody chops wood for a full shed while the iron mine stands
 *      empty); otherwise the build order.
 *   4. Within that, specialty matches are placed first, then anyone fills the leftovers.
 *   5. Skill breaks ties; currently-assigned workers get a stability bonus so jobs never flip-flop.
 * `BuildingInstance.workers` is kept in sync here (it is the construction agent's slice, but the arrays are ours).
 */
import type { Game } from '../../core/Game';
import type { Colonist, Id } from '../../core/state';
import type { Layout, Place } from './layout';

/** Worth a bit more than one skill star: a one-star lead never displaces an incumbent, a two-star lead does. */
const STABILITY = 15;

function score(c: Colonist, p: Place): number {
  const dx = c.x - p.x;
  const dz = c.z - p.z;
  return c.skill * 10 + (c.workplace === p.id ? STABILITY : 0) - Math.sqrt(dx * dx + dz * dz) / 50;
}

/** Make `BuildingInstance.workers` mirror colonists' `workplace` for every worker building. */
export function syncWorkers(layout: Layout, colonists: Colonist[]): void {
  const by = new Map<Id, Id[]>();
  for (const c of colonists) {
    if (c.workplace == null) continue;
    const a = by.get(c.workplace);
    if (a) a.push(c.id);
    else by.set(c.workplace, [c.id]);
  }
  for (const p of layout.byId.values()) {
    if (!p.def.workers) continue;
    const want = by.get(p.id) ?? [];
    const have = p.b.workers;
    if (!have || have.length !== want.length || have.some((v, i) => v !== want[i])) p.b.workers = want;
  }
}

/** What the next tier-up still lacks, re-read once a minute of play (jobs do not shuffle every time a store ticks). */
const lackingCache = new WeakMap<Game, { at: number; set: Set<string> }>();
function lackingFor(game: Game): Set<string> {
  const now = game.state.playTime;
  const hit = lackingCache.get(game);
  if (hit && now - hit.at < 60 && now >= hit.at) return hit.set;
  const set = new Set<string>();
  const next = game.sys.progression?.next?.();
  if (next) for (const [r, n] of Object.entries(next.cost)) if (game.sys.economy.amount(r) < (n ?? 0)) set.add(r);
  lackingCache.set(game, { at: now, set });
  return set;
}

/**
 * Jobs in need order: outputs the next tier-up still lacks first, then the rest, then those whose every output store
 * is full (stable within each band: the build order). Only matters when there are more jobs than hands.
 */
function byNeed(game: Game, group: Place[]): Place[] {
  if (group.length < 2) return group;
  const eco = game.sys.economy;
  const lacking = lackingFor(game);
  const band = (p: Place): number => {
    const out = p.def.produces;
    if (!out) return 1;
    const ks = Object.keys(out);
    if (ks.some((r) => lacking.has(r) && !eco.isFull(r))) return 0;
    return ks.length && ks.every((r) => eco.isFull(r)) ? 2 : 1;
  };
  const bands: Place[][] = [[], [], []];
  for (const p of group) bands[band(p)].push(p);
  return bands[0].length === group.length || bands[1].length === group.length ? group : [...bands[0], ...bands[1], ...bands[2]];
}

function emitAssigned(game: Game, c: Colonist): void {
  game.bus.emit('colonist:assigned', { id: c.id, workplace: c.workplace });
}

/**
 * Validate every assignment against the layout, then re-plan non-manual colonists.
 * Returns the number of colonists whose workplace changed.
 */
export function autoAssign(game: Game, layout: Layout, colonists: Colonist[]): number {
  const changedList: Colonist[] = [];
  const occ = new Map<Id, number>();
  const pool: Colonist[] = [];

  // 1. validate; manual colonists reserve their slots; colonists away on an expedition hold no job at all
  for (const c of colonists) {
    if (c.away) {
      if (c.workplace != null) {
        c.workplace = null;
        changedList.push(c);
      }
      continue;
    }
    if (c.workplace != null) {
      const p = layout.byId.get(c.workplace);
      if (!p || !p.usable || !p.def.workers) {
        c.workplace = null;
        if (c.manual) c.manual = false; // their building is gone/off: hand back to automation
        changedList.push(c);
      }
    }
    if (c.manual) {
      if (c.workplace != null) {
        const p = layout.byId.get(c.workplace)!;
        const n = occ.get(p.id) ?? 0;
        if (n >= p.def.workers!.slots) {
          c.workplace = null; // over capacity (should not happen) — release the extra
          c.manual = false;
          changedList.push(c);
          pool.push(c);
        } else occ.set(p.id, n + 1);
      }
      continue; // manual (assigned or deliberately idle): never in the pool
    }
    pool.push(c);
  }

  // 2. plan the pool
  const plan = new Map<Colonist, Id>();
  const left = pool.slice();
  const fill = (p: Place, onlySpecialty: boolean) => {
    const open = p.def.workers!.slots - (occ.get(p.id) ?? 0);
    if (open <= 0 || left.length === 0) return;
    const cand = onlySpecialty ? left.filter((c) => c.specialty === p.def.workers!.job) : left.slice();
    if (!cand.length) return;
    cand.sort((a, b) => score(b, p) - score(a, p));
    const take = Math.min(open, cand.length);
    for (let i = 0; i < take; i++) {
      const c = cand[i];
      plan.set(c, p.id);
      left.splice(left.indexOf(c), 1);
    }
    occ.set(p.id, (occ.get(p.id) ?? 0) + take);
  };
  for (const group of [layout.required, layout.optional]) {
    const ordered = byNeed(game, group);
    for (const p of ordered) fill(p, true);
    for (const p of ordered) fill(p, false);
  }

  // 3. apply the diff
  for (const c of pool) {
    const to = plan.get(c) ?? null;
    if (c.workplace !== to) {
      c.workplace = to;
      if (!changedList.includes(c)) changedList.push(c);
    }
  }
  syncWorkers(layout, colonists);
  for (const c of changedList) emitAssigned(game, c);
  return changedList.length;
}

/**
 * Manually assign (or, with null, manually idle) a colonist. The assignment is locked against auto-assign.
 * When the building is full, a non-manual worker is bumped to make room; if every worker there is manual
 * the request fails.
 */
export function assignManual(game: Game, layout: Layout, colonists: Colonist[], c: Colonist, buildingId: Id | null): boolean {
  if (c.away && buildingId !== null) {
    fail(game, `${c.name.split(' ')[0]} is away on an expedition`);
    return false;
  }
  if (buildingId === null) {
    const had = c.workplace;
    c.workplace = null;
    c.manual = true;
    syncWorkers(layout, colonists);
    if (had !== null) emitAssigned(game, c);
    return true;
  }
  const p = layout.byId.get(buildingId);
  if (!p || !p.usable || !p.def.workers) {
    fail(game, 'That building has no jobs');
    return false;
  }
  if (c.workplace === buildingId) {
    c.manual = true;
    return true;
  }
  const here = colonists.filter((o) => o.workplace === buildingId && o !== c);
  if (here.length >= p.def.workers.slots) {
    const bump = here.filter((o) => !o.manual).sort((a, b) => score(a, p) - score(b, p))[0];
    if (!bump) {
      fail(game, 'All worker slots are taken');
      return false;
    }
    bump.workplace = null;
    emitAssigned(game, bump);
  }
  c.workplace = buildingId;
  c.manual = true;
  syncWorkers(layout, colonists);
  emitAssigned(game, c);
  return true;
}

function fail(game: Game, text: string): void {
  game.toast(text, 'warning');
  game.bus.emit('sfx', { id: 'ui_error' });
}
