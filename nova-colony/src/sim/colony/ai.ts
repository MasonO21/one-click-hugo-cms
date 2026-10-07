/**
 * Colonist daily-life AI — charming but cheap.
 *
 * Every colonist owns a tiny `Brain`. DECISIONS ("what should I be doing and where?") run on a staggered
 * schedule (~once per 1-1.5 s per colonist, randomly offset, so only a handful of colonists think per frame);
 * MOVEMENT is a few multiplications per frame: straight-line steering when the way is clear, otherwise a bounded grid
 * A* (`path.ts`, string-pulled into a few waypoints, cached per start/goal cell, a couple of searches per frame) that
 * routes around walls, rooms and big facilities through doors/gates. One-axis wall sliding stays as the safety net and
 * a teleport to the goal is the last resort when no path exists (e.g. a bed in a sealed room) or the colonist is stuck
 * > 3 s. Colonists far from the player/camera skip walking entirely and snap to their destination.
 *
 * Priorities each decision: combat (guards man their post, everyone else shelters) > night (sleep in bed, or
 * around the campfire/core) > midday meal break (once per day) > work (at the workplace, with visible
 * gathering trips for gatherers/miners and field pacing for farmers) > relax near campfires/decor.
 */
import type { Game } from '../../core/Game';
import type { Colonist, ColonistActivity, Id } from '../../core/state';
import type { WorldNode } from '../world';
import { WORLD_CELLS, cellCenter, cellOf } from '../../core/constants';
import { approachAngle, clamp } from '../../core/math';
import type { Layout, Place } from './layout';
import { gainWorkXp } from './skills';
import { PathFinder, R_BUDGET, R_FOUND, R_NONE, R_RUNNING } from './path';

/** Colonists farther than this (world units) from the player (and overview camera focus) are simulated coarsely. */
export const NEAR_RANGE = 60;
const NEAR2 = NEAR_RANGE * NEAR_RANGE;
/** Work-trip radius around the workplace: ~8 cells. */
const NODE_RANGE = 8 * 2;
/** Only emit chop/mine effects for colonists this close to the player (keeps audio/VFX cheap). */
const FX_RANGE2 = 35 * 35;
/** Emit `colonist:workHit` (presentation only) for visible gathering work near the player. */
const EMIT_WORK_FX = true;

const M_RELAX = 0;
const M_WORK = 1;
const M_MEAL = 2;
const M_SLEEP = 3;
const M_SHELTER = 4;
const M_GUARD = 5;

const PH_SITE = 0;
const PH_NODE = 1;
const PH_FIELD = 2;

const ST_SITE = 0;
const ST_NODES = 1;
const ST_FIELD = 2;

/** Movement routing state of a brain. */
const P_DIRECT = 0; // straight-line steering (line of sight clear, or last-resort fallback)
const P_WAIT = 1; // waiting for a path search (a frame or two)
const P_FOLLOW = 2; // following waypoints

/**
 * Pathing budgets per frame: searches started, A* node expansions (a big detour is simply sliced over a few frames:
 * 1500 expansions ~ 0.3-0.5 ms) and path re-validations.
 */
const MAX_SEARCHES = 4;
const FRAME_EXPAND_BUDGET = 1500;
const MAX_REVALIDATE = 8;
/** Re-plans allowed per walk before falling back to plain steering. */
const MAX_REPLANS = 4;
/** Path cache lifetime (play seconds) and size cap. */
const CACHE_TTL = 20;
const CACHE_TTL_PARTIAL = 30;
const CACHE_MAX = 400;
/** No-progress seconds before the last-resort teleport (plain steering / after a partial path). */
const STUCK_DIRECT = 3;
const STUCK_FINAL = 1.5;
/** Longest a colonist stands waiting for a path before walking straight instead (s). */
const MAX_WAIT = 4;

interface CachedPath {
  kind: number;
  wp: Float32Array;
  at: number;
  enter: number;
}

/** Professions with outdoor routines (ProfessionId is a schema union, not free-form content). */
const NODE_JOBS = new Set<string>(['gatherer', 'miner']);
const FIELD_JOBS = new Set<string>(['farmer']);

interface Brain {
  mode: number;
  arg: number;
  nextThink: number;
  moving: boolean;
  act: ColonistActivity;
  gx: number;
  gz: number;
  hasFace: boolean;
  fx: number;
  fz: number;
  /** Building the colonist may walk into (bed, core) — its cells are not obstacles for them. */
  bld: number;
  stay: number;
  until: number;
  stuck: number;
  /** Closest distance to the goal reached on the current walk (oscillation-proof stuck detection). */
  best: number;
  /** Seconds spent on the current walk and the most it may take before teleporting. */
  walkT: number;
  walkMax: number;
  /** Persistent slide direction (+1/-1) while skirting an obstacle. */
  slideDir: number;
  slideUntil: number;
  /** Routing: P_* state, waypoint list (x,z pairs; shared with the cache, never mutated), cursor and count. */
  pst: number;
  wp: Float32Array | null;
  wpi: number;
  wpn: number;
  /** R_* kind of the followed path (R_FOUND, or a partial path to the closest reachable cell). */
  pkind: number;
  replans: number;
  /** Path epoch the waypoints were last validated against. */
  pver: number;
  queued: boolean;
  /** Seconds spent waiting for the current path request. */
  waitT: number;
  /** Seconds without progress before the teleport fallback. */
  stuckMax: number;
  speed: number;
  phase: number;
  node: number;
  nodeModel: string;
  hitT: number;
  lastMealDay: number;
  mealAt: number;
  mealDone: boolean;
  /** Personal offset so colonists never stack on exactly the same spot. */
  ox: number;
  oz: number;
}

function styleOf(p: Place): number {
  const job = p.def.workers!.job;
  if (NODE_JOBS.has(job)) return ST_NODES;
  if (FIELD_JOBS.has(job)) return ST_FIELD;
  return ST_SITE;
}

function isGuardPost(p: Place): boolean {
  const w = p.def.workers;
  return !!w && (w.job === 'guard' || (!!p.def.turret && p.def.turret.mannedBy === w.job));
}

export class ColonistAI {
  /** EconomySystem.modifier('colonistSpeed'), refreshed once per second by ColonistSystem. */
  speedMod = 1;

  private readonly brains = new Map<Id, Brain>();
  private readonly nodeCache = new Map<Id, { at: number; list: WorldNode[] }>();
  private readonly f = { day: 1, dayTime: 0, night: false, combat: false, px: 0, pz: 0, cx: 0, cz: 0, overview: false, now: 0 };
  /** choose() results. */
  private pm = 0;
  private pa = -1;
  /** place() results. */
  private rx = 0;
  private rz = 0;

  // ---- pathing
  /** Line-of-sight probe (route / validate / adopt) and the resumable A* (one search at a time, sliced over frames). */
  private readonly probe: PathFinder;
  private readonly sf: PathFinder;
  private readonly pathCache = new Map<number, CachedPath>();
  /** Colonists waiting for a search (FIFO; `qHead` is the next one). */
  private readonly queue: Colonist[] = [];
  private qHead = 0;
  /** The colonist whose search is in progress in `sf` (and what it was for). */
  private actC: Colonist | null = null;
  private actKey = 0;
  private actEnter = -1;
  private actEpoch = 0;
  /** Bumped whenever buildings change: cached paths die, followed paths get re-validated. */
  private epoch = 1;
  private seenVersion = -1;
  private bound = false;
  private searchesLeft = MAX_SEARCHES;
  private expandLeft = FRAME_EXPAND_BUDGET;
  private revalLeft = MAX_REVALIDATE;
  /** Lifetime counters (tests / diagnostics). */
  readonly stats = { searches: 0, cacheHits: 0, replans: 0, expanded: 0, fallbacks: 0 };

  constructor(
    private readonly game: Game,
    private readonly layout: Layout,
  ) {
    this.probe = new PathFinder(game);
    this.sf = new PathFinder(game);
  }

  /** Forget all runtime brains (after a load). */
  reset(): void {
    this.brains.clear();
    this.nodeCache.clear();
    this.pathCache.clear();
    this.queue.length = 0;
    this.qHead = 0;
    this.actC = null;
    this.sf.cancel();
    this.seenVersion = -1;
    this.bind();
  }

  /** Drop cached paths and make every followed path re-validate itself (buildings changed). */
  invalidatePaths(): void {
    this.pathCache.clear();
    this.epoch++;
  }

  /** Number of colonists currently waiting for a path search. */
  get pending(): number {
    return this.queue.length - this.qHead + (this.actC ? 1 : 0);
  }

  private bind(): void {
    if (this.bound) return;
    this.bound = true;
    this.game.bus.on('building:changed', () => {
      this.seenVersion = this.game.derived.buildingsVersion;
      this.invalidatePaths();
    });
  }

  /** Make everyone re-decide soon (night fell, an attack began...). Spread over `spread` seconds. */
  kick(spread = 0.8): void {
    const now = this.game.state.playTime;
    for (const b of this.brains.values()) b.nextThink = now + this.game.rng.next() * spread;
  }

  /** Make one colonist re-decide on the next frame (assigned a new job, ...). */
  poke(id: Id): void {
    const b = this.brains.get(id);
    if (b) b.nextThink = 0;
  }

  // ------------------------------------------------------------------ frame update

  update(dt: number): void {
    const g = this.game;
    const st = g.state;
    const list = st.colonists.list;
    if (list.length === 0) return;
    const f = this.f;
    const now = st.playTime;
    f.now = now;
    f.day = st.time.day;
    f.dayTime = st.time.dayTime;
    f.night = g.isNight();
    const ph = st.combat.phase;
    f.combat = ph === 'warning' || ph === 'attack';
    f.px = st.player.x;
    f.pz = st.player.z;
    const cam = g.view.camera;
    f.overview = cam.mode === 'overview';
    f.cx = cam.tx;
    f.cz = cam.tz;

    // pathing housekeeping: invalidate on structural changes (also catches edits that bypass the event), spend this
    // frame's search budget on queued requests first, then let new decisions use what is left
    this.bind();
    const ver = g.derived.buildingsVersion;
    if (ver !== this.seenVersion) {
      this.seenVersion = ver;
      this.invalidatePaths();
    }
    this.searchesLeft = MAX_SEARCHES;
    this.expandLeft = FRAME_EXPAND_BUDGET;
    this.revalLeft = MAX_REVALIDATE;
    this.drive();

    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      let br = this.brains.get(c.id);
      if (!br) br = this.make(c, now);
      if (now >= br.nextThink) {
        br.nextThink = now + 1 + g.rng.next() * 0.5;
        this.think(c, br, now);
      }
      this.step(c, br, dt, now);
      if (c.activity === 'working') this.work(c, br, dt, now);
    }
  }

  private make(c: Colonist, now: number): Brain {
    const rng = this.game.rng;
    const ang = c.id * 2.399963;
    const rad = 0.35 + ((c.id * 0.7548) % 1) * 0.65;
    if (!Number.isFinite(c.x) || !Number.isFinite(c.z)) {
      const core = this.layout.core;
      c.x = core?.x ?? 0;
      c.z = core?.z ?? 0;
    }
    const br: Brain = {
      mode: -1,
      arg: -2,
      nextThink: now + rng.next() * 1.2,
      moving: false,
      act: 'idle',
      gx: c.x,
      gz: c.z,
      hasFace: false,
      fx: 0,
      fz: 0,
      bld: -1,
      stay: 0,
      until: 0,
      stuck: 0,
      best: Infinity,
      walkT: 0,
      walkMax: 30,
      slideDir: 0,
      slideUntil: 0,
      pst: P_DIRECT,
      wp: null,
      wpi: 0,
      wpn: 0,
      pkind: R_FOUND,
      replans: 0,
      pver: 0,
      queued: false,
      waitT: 0,
      stuckMax: STUCK_DIRECT,
      speed: this.game.data.balance.colonistSpeed,
      phase: PH_SITE,
      node: -1,
      nodeModel: '',
      hitT: 0,
      lastMealDay: -1,
      mealAt: 0.46 + rng.next() * 0.1,
      mealDone: false,
      ox: Math.cos(ang) * rad,
      oz: Math.sin(ang) * rad,
    };
    this.brains.set(c.id, br);
    return br;
  }

  // ------------------------------------------------------------------ decisions

  private think(c: Colonist, br: Brain, now: number): void {
    const trait = this.game.data.trait(c.trait);
    br.speed = this.game.data.balance.colonistSpeed * (1 + (trait?.speed ?? 0)) * this.speedMod;
    this.choose(c, br);
    if (this.pm !== br.mode || this.pa !== br.arg) {
      br.mode = this.pm;
      br.arg = this.pa;
      this.enter(c, br);
    } else if (!br.moving && now >= br.until) {
      this.advance(c, br, now);
    }
  }

  /** Decide the desired mode into this.pm / this.pa. */
  private choose(c: Colonist, br: Brain): void {
    const f = this.f;
    const wp = c.workplace != null ? this.layout.byId.get(c.workplace) : undefined;
    const post = wp && wp.usable && wp.def.workers ? wp : undefined;
    if (f.combat) {
      if (post && isGuardPost(post)) {
        this.pm = M_GUARD;
        this.pa = post.id;
      } else {
        this.pm = M_SHELTER;
        this.pa = c.bed ?? -1;
      }
      return;
    }
    if (f.night) {
      this.pm = M_SLEEP;
      this.pa = c.bed ?? -1;
      return;
    }
    if (br.mode === M_MEAL && !br.mealDone) {
      this.pm = M_MEAL;
      this.pa = br.arg;
      return;
    }
    if (br.lastMealDay !== f.day && f.dayTime >= br.mealAt && f.dayTime < 0.7) {
      this.pm = M_MEAL;
      this.pa = -1;
      return;
    }
    if (post) {
      this.pm = M_WORK;
      this.pa = post.id;
      return;
    }
    this.pm = M_RELAX;
    this.pa = -1;
  }

  private enter(c: Colonist, br: Brain): void {
    br.node = -1;
    switch (br.mode) {
      case M_SLEEP:
        this.goBed(c, br, 'sleeping');
        break;
      case M_SHELTER:
        this.goBed(c, br, 'sheltering');
        break;
      case M_GUARD:
        this.goPost(c, br);
        break;
      case M_MEAL:
        br.mealDone = false;
        this.goMeal(c, br);
        break;
      case M_WORK:
        br.phase = PH_SITE;
        this.pickWork(c, br);
        break;
      default:
        this.goRelax(c, br);
    }
  }

  /** The current stay has elapsed: pick the next step of the routine. */
  private advance(c: Colonist, br: Brain, now: number): void {
    switch (br.mode) {
      case M_MEAL:
        br.mealDone = true;
        br.lastMealDay = this.f.day;
        this.choose(c, br);
        br.mode = this.pm;
        br.arg = this.pa;
        this.enter(c, br);
        break;
      case M_WORK:
        this.pickWork(c, br);
        break;
      case M_RELAX:
        this.goRelax(c, br);
        break;
      default:
        br.until = now + 5; // sleeping/sheltering/guarding hold their place
    }
  }

  // ------------------------------------------------------------------ goals

  private core(): { x: number; z: number; id: number; hw: number; hd: number } {
    const c = this.layout.core;
    return c ? { x: c.x, z: c.z, id: c.id, hw: c.hw, hd: c.hd } : { x: 0, z: 0, id: -1, hw: 3, hd: 3 };
  }

  private goBed(c: Colonist, br: Brain, act: ColonistActivity): void {
    const home = c.bed != null ? this.layout.byId.get(c.bed) : undefined;
    if (home && home.usable) {
      const ex = Math.max(0, home.hw * 0.6);
      const ez = Math.max(0, home.hd * 0.6);
      this.setGoal(c, br, home.x + clamp(br.ox, -ex, ex), home.z + clamp(br.oz, -ez, ez), home.id, act, Infinity, false, 0, 0);
      return;
    }
    const core = this.core();
    if (act === 'sheltering') {
      // no bed: shelter inside the core
      this.setGoal(c, br, core.x + clamp(br.ox, -core.hw * 0.6, core.hw * 0.6), core.z + clamp(br.oz, -core.hd * 0.6, core.hd * 0.6), core.id, act, Infinity, false, 0, 0);
      return;
    }
    // no bed: sleep in a ring around the campfire (or the core)
    const spot: { x: number; z: number; hw: number; hd: number } = this.nearest(this.layout.meals, core.x, core.z) ?? core;
    const r = Math.hypot(spot.hw, spot.hd) + 1 + Math.hypot(br.ox, br.oz);
    const a = Math.atan2(br.oz, br.ox) + c.id;
    this.setGoal(c, br, spot.x + Math.cos(a) * r, spot.z + Math.sin(a) * r, -1, act, Infinity, true, spot.x, spot.z);
  }

  private goPost(c: Colonist, br: Brain): void {
    const p = this.layout.byId.get(br.arg);
    if (!p) return this.goRelax(c, br);
    const core = this.core();
    const slot = Math.max(0, p.b.workers.indexOf(c.id));
    // stand on the outward side of the tower (away from the core), facing outward
    const out = Math.atan2(p.x - core.x, p.z - core.z) + ((slot + 1) >> 1) * 0.7 * (slot % 2 ? 1 : -1);
    const r = Math.hypot(p.hw, p.hd) + 0.7;
    const gx = p.x + Math.sin(out) * r;
    const gz = p.z + Math.cos(out) * r;
    this.setGoal(c, br, gx, gz, -1, 'working', Infinity, true, gx + Math.sin(out) * 4, gz + Math.cos(out) * 4);
  }

  private goMeal(c: Colonist, br: Brain): void {
    const core = this.core();
    const spot: { x: number; z: number; hw: number; hd: number } = this.nearest(this.layout.meals, c.x, c.z) ?? core;
    const r = Math.hypot(spot.hw, spot.hd) + 0.7 + Math.hypot(br.ox, br.oz) * 0.8;
    const a = Math.atan2(br.oz, br.ox) + c.id * 0.37;
    this.setGoal(c, br, spot.x + Math.cos(a) * r, spot.z + Math.sin(a) * r, -1, 'eating', this.game.rng.range(12, 20), true, spot.x, spot.z);
  }

  private goRelax(c: Colonist, br: Brain): void {
    const rng = this.game.rng;
    const spots = this.layout.relax;
    if (spots.length) {
      // sample a few decor/campfire spots, take the closest — keeps long walks rare and decisions O(1)
      let best: Place | null = null;
      let bd = Infinity;
      for (let i = 0; i < 3; i++) {
        const p = spots[Math.floor(rng.next() * spots.length)];
        const d = (p.x - c.x) * (p.x - c.x) + (p.z - c.z) * (p.z - c.z);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      if (best) {
        const a = rng.next() * Math.PI * 2;
        const r = (best.def.solid ? Math.hypot(best.hw, best.hd) : 0.4) + 0.6 + rng.next() * 0.9;
        this.setGoal(c, br, best.x + Math.cos(a) * r, best.z + Math.sin(a) * r, -1, 'relaxing', rng.range(10, 22), true, best.x, best.z);
        return;
      }
    }
    // nothing to enjoy yet: potter around the core
    const core = this.core();
    const a = rng.next() * Math.PI * 2;
    const r = Math.hypot(core.hw, core.hd) + 1.5 + rng.next() * 3;
    this.setGoal(c, br, core.x + Math.cos(a) * r, core.z + Math.sin(a) * r, -1, 'idle', rng.range(6, 14), false, 0, 0);
  }

  /** Next step of a workday for the colonist's workplace. */
  private pickWork(c: Colonist, br: Brain): void {
    const p = this.layout.byId.get(br.arg);
    if (!p || !p.def.workers) return this.goRelax(c, br);
    const style = styleOf(p);
    if (style === ST_NODES) {
      if (br.phase !== PH_NODE) {
        const n = this.pickNode(p);
        if (n) {
          this.nodeGoal(c, br, p, n);
          return;
        }
        this.fieldGoal(c, br, p); // no resource nearby: pace around the site instead
        return;
      }
      br.phase = PH_SITE; // back from a trip: work at the site for a moment
      br.node = -1;
      this.siteGoal(c, br, p, this.game.rng.range(2.5, 4.5));
      return;
    }
    if (style === ST_FIELD) {
      this.fieldGoal(c, br, p);
      return;
    }
    br.phase = PH_SITE;
    this.siteGoal(c, br, p, Infinity);
  }

  private siteGoal(c: Colonist, br: Brain, p: Place, stay: number): void {
    if (!p.def.solid) {
      // walk-in buildings (fields, benches...): work inside the footprint
      this.setGoal(c, br, p.x + clamp(br.ox, -p.hw * 0.7, p.hw * 0.7), p.z + clamp(br.oz, -p.hd * 0.7, p.hd * 0.7), -1, 'working', stay, true, p.x, p.z);
      return;
    }
    const core = this.core();
    const idx = p.b.workers.indexOf(c.id);
    const slot = idx >= 0 ? idx : c.id % 4;
    const a = Math.atan2(core.x - p.x, core.z - p.z) + ((slot + 1) >> 1) * 0.7 * (slot % 2 ? 1 : -1);
    const r = Math.hypot(p.hw, p.hd) + 0.7;
    this.setGoal(c, br, p.x + Math.sin(a) * r, p.z + Math.cos(a) * r, -1, 'working', stay, true, p.x, p.z);
  }

  /** Farmers (and gatherers without a resource nearby) pace around their field/site. */
  private fieldGoal(c: Colonist, br: Brain, p: Place): void {
    const rng = this.game.rng;
    br.phase = PH_FIELD;
    br.node = -1;
    const stay = rng.range(5, 10);
    if (!p.def.solid) {
      const x = p.x + (rng.next() * 2 - 1) * p.hw * 0.75;
      const z = p.z + (rng.next() * 2 - 1) * p.hd * 0.75;
      const a = rng.next() * Math.PI * 2;
      this.setGoal(c, br, x, z, -1, 'working', stay, true, x + Math.cos(a), z + Math.sin(a));
      return;
    }
    const a = rng.next() * Math.PI * 2;
    const r = Math.hypot(p.hw, p.hd) + 0.8;
    this.setGoal(c, br, p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, -1, 'working', stay, true, p.x, p.z);
  }

  private nodeGoal(c: Colonist, br: Brain, p: Place, n: WorldNode): void {
    br.phase = PH_NODE;
    br.node = n.i;
    br.nodeModel = this.game.data.node(n.def)?.model ?? n.def;
    const dx = p.x - n.x;
    const dz = p.z - n.z;
    const d = Math.hypot(dx, dz) || 1;
    // stand ~1.4 units in front of the node, on the side facing the workplace
    this.setGoal(c, br, n.x + (dx / d) * 1.4 + br.ox * 0.3, n.z + (dz / d) * 1.4 + br.oz * 0.3, -1, 'working', this.game.rng.range(5, 9), true, n.x, n.z);
  }

  /** A non-depleted resource node near the workplace that yields what the building produces. */
  private pickNode(p: Place): WorldNode | null {
    const list = this.nodesFor(p);
    if (!list.length) return null;
    const world = this.game.sys.world;
    const rng = this.game.rng;
    const span = Math.min(6, list.length);
    for (let t = 0; t < 4; t++) {
      const n = list[Math.floor(rng.next() * span)];
      if (!world.isDepleted(n.i)) return n;
    }
    return null;
  }

  private nodesFor(p: Place): WorldNode[] {
    const now = this.f.now;
    const hit = this.nodeCache.get(p.id);
    if (hit && now - hit.at < 25) return hit.list;
    const out: WorldNode[] = [];
    const gen = this.game.sys.world.gen as { nodes?: WorldNode[] } | undefined;
    const produces = Object.keys(p.def.produces ?? {});
    if (gen?.nodes && produces.length) {
      const data = this.game.data;
      const range = NODE_RANGE + Math.max(p.hw, p.hd);
      const scored: { n: WorldNode; d: number }[] = [];
      for (const n of gen.nodes) {
        const dx = n.x - p.x;
        if (dx > range || dx < -range) continue;
        const dz = n.z - p.z;
        if (dz > range || dz < -range) continue;
        const d = Math.hypot(dx, dz);
        if (d > range) continue;
        const def = data.node(n.def);
        if (!def) continue;
        for (const k of produces) {
          if ((def.drop[k] ?? 0) > 0) {
            scored.push({ n, d });
            break;
          }
        }
      }
      scored.sort((a, b) => a.d - b.d);
      for (let i = 0; i < Math.min(10, scored.length); i++) out.push(scored[i].n);
    }
    this.nodeCache.set(p.id, { at: now, list: out });
    return out;
  }

  private nearest(spots: Place[], x: number, z: number): Place | null {
    let best: Place | null = null;
    let bd = Infinity;
    for (const p of spots) {
      const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ movement

  private isFar(x: number, z: number): boolean {
    const f = this.f;
    let dx = x - f.px;
    let dz = z - f.pz;
    if (dx * dx + dz * dz <= NEAR2) return false;
    if (f.overview) {
      dx = x - f.cx;
      dz = z - f.cz;
      if (dx * dx + dz * dz <= NEAR2) return false;
    }
    return true;
  }

  private blocked(cx: number, cz: number, enter: number): boolean {
    const bs = this.game.sys.buildings;
    if (!bs.blocked(cx, cz, 'colonist')) return false;
    if (enter >= 0) {
      const at = bs.at(cx, cz);
      if (at && at.id === enter) return false;
    }
    return true;
  }

  /**
   * Moving from cell o into the blocked cell n: is the colonist already standing inside that very building (leaving a
   * bed, pacing inside a footprint)? Then the move is fine. Anything else (a free cell or another building) means the
   * colonist is about to walk into an obstacle.
   */
  private sameSolid(ocx: number, ocz: number, ncx: number, ncz: number, enter: number): boolean {
    if (!this.blocked(ocx, ocz, enter)) return false;
    const bs = this.game.sys.buildings;
    const a = bs.at(ocx, ocz);
    return !!a && a === bs.at(ncx, ncz);
  }

  /** Nudge a target out of obstacles (writes this.rx / this.rz). */
  private place(x: number, z: number, enter: number): void {
    this.rx = x;
    this.rz = z;
    const cx = cellOf(x);
    const cz = cellOf(z);
    if (!this.blocked(cx, cz, enter)) return;
    for (let r = 1; r <= 3; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (!this.blocked(cx + dx, cz + dz, enter)) {
            this.rx = cellCenter(cx + dx);
            this.rz = cellCenter(cz + dz);
            return;
          }
        }
      }
    }
  }

  private setGoal(
    c: Colonist,
    br: Brain,
    x: number,
    z: number,
    enter: number,
    act: ColonistActivity,
    stay: number,
    hasFace: boolean,
    fx: number,
    fz: number,
  ): void {
    this.place(x, z, enter);
    // Re-issuing the walk already in progress must not reset the stuck/teleport timers.
    const same = br.moving && Math.abs(br.gx - this.rx) < 0.5 && Math.abs(br.gz - this.rz) < 0.5;
    br.gx = this.rx;
    br.gz = this.rz;
    br.bld = enter;
    br.act = act;
    br.stay = stay;
    br.hasFace = hasFace;
    br.fx = fx;
    br.fz = fz;
    if (!same) {
      br.stuck = 0;
      br.best = Infinity;
      br.walkT = 0;
      br.slideDir = 0;
      br.slideUntil = 0;
      br.replans = 0;
      br.waitT = 0;
      br.stuckMax = STUCK_DIRECT;
      br.pst = P_DIRECT;
      br.wp = null;
      br.wpi = br.wpn = 0;
      if (this.actC === c) this.dropActive(); // its search was for the previous goal
    }
    c.tx = br.gx;
    c.tz = br.gz;
    const dx = br.gx - c.x;
    const dz = br.gz - c.z;
    if (dx * dx + dz * dz < 0.0625) {
      this.arrive(c, br);
      return;
    }
    // simulation LOD: far from the player/camera nobody needs to see the walk
    const farFrom = this.isFar(c.x, c.z);
    if (farFrom) {
      if (this.isFar(br.gx, br.gz)) {
        c.x = br.gx;
        c.z = br.gz;
        this.arrive(c, br);
        return;
      }
      const d = Math.hypot(dx, dz);
      if (d > 30) {
        c.x = br.gx - (dx / d) * 30;
        c.z = br.gz - (dz / d) * 30;
      }
    }
    if (!same) br.walkMax = (Math.hypot(br.gx - c.x, br.gz - c.z) / Math.max(0.5, br.speed)) * 2.5 + 8;
    br.moving = true;
    c.activity = 'walking';
    if (!same) this.route(c, br);
  }

  // ------------------------------------------------------------------ pathing

  /** Decide how this walk gets to its goal: straight if the line is clear, otherwise via a (cached/queued) A* path. */
  private route(c: Colonist, br: Brain): void {
    const scx = cellOf(c.x);
    const scz = cellOf(c.z);
    const gcx = cellOf(br.gx);
    const gcz = cellOf(br.gz);
    if (scx === gcx && scz === gcz) return;
    const probe = this.probe;
    probe.begin(br.bld, scx, scz, gcx, gcz);
    if (probe.lineClear(c.x, c.z, br.gx, br.gz)) return; // open ground: plain steering
    br.pst = P_WAIT;
    if (this.fromCache(c, br)) return;
    this.enqueue(c, br);
    this.drive(); // small searches finish right away within the frame budget
  }

  private key(c: Colonist, br: Brain): number {
    const W = WORLD_CELLS;
    return (cellOf(c.z) * W + cellOf(c.x)) * (W * W) + cellOf(br.gz) * W + cellOf(br.gx);
  }

  /** Adopt a fresh-enough cached path for this (start cell, goal cell), if one exists and fits from here. */
  private fromCache(c: Colonist, br: Brain): boolean {
    if (br.replans > 0) return false; // a re-plan wants a new look, not the path that just failed
    const hit = this.pathCache.get(this.key(c, br));
    if (!hit || hit.enter !== br.bld || this.f.now - hit.at > (hit.kind === R_FOUND ? CACHE_TTL : CACHE_TTL_PARTIAL)) return false;
    if (!this.adopt(c, br, hit.kind, hit.wp, true)) return false; // probe context is the caller's
    this.stats.cacheHits++;
    return true;
  }

  private enqueue(c: Colonist, br: Brain): void {
    if (br.queued) return;
    br.queued = true;
    this.queue.push(c);
  }

  private dropActive(): void {
    const c = this.actC;
    if (!c) return;
    this.actC = null;
    this.sf.cancel();
    const br = this.brains.get(c.id);
    if (br) br.queued = false;
  }

  /**
   * Spend this frame's search budget: continue the search in progress, then start queued requests (oldest first).
   * Big detours are sliced over frames; colonists waiting for a path just stand for a moment.
   */
  private drive(): void {
    for (let guard = 0; guard < 24 && this.expandLeft > 0; guard++) {
      if (!this.actC && !this.startNext()) return;
      const c = this.actC;
      if (!c) continue; // served from the cache; look at the next one
      const sf = this.sf;
      const kind = sf.advance(this.expandLeft);
      this.expandLeft -= sf.last + 4;
      this.stats.expanded += sf.last;
      if (kind === R_RUNNING) return;
      this.finishActive(c, kind);
    }
  }

  /** Pop the next live request: from the cache if possible, else start a search for it. false = queue empty / no budget. */
  private startNext(): boolean {
    const q = this.queue;
    while (this.qHead < q.length) {
      const c = q[this.qHead];
      const br = this.brains.get(c.id);
      if (!br || br.pst !== P_WAIT || !br.moving) {
        if (br) br.queued = false;
        this.qHead++;
        continue;
      }
      this.probe.begin(br.bld, cellOf(c.x), cellOf(c.z), cellOf(br.gx), cellOf(br.gz));
      if (this.fromCache(c, br)) {
        br.queued = false;
        this.qHead++;
        return true;
      }
      if (this.searchesLeft <= 0) return false;
      this.searchesLeft--;
      this.qHead++;
      this.actC = c;
      this.beginSearch(c, br);
      return true;
    }
    q.length = 0;
    this.qHead = 0;
    return false;
  }

  private beginSearch(c: Colonist, br: Brain): void {
    const core = this.core();
    const sf = this.sf;
    sf.begin(br.bld, cellOf(c.x), cellOf(c.z), cellOf(br.gx), cellOf(br.gz));
    sf.startSearch(c.x, c.z, cellOf(core.x), cellOf(core.z), this.game.state.colony.radius);
    this.actKey = this.key(c, br);
    this.actEnter = br.bld;
    this.actEpoch = this.epoch;
    this.stats.searches++;
  }

  /** The search for `c` is done: cache the result and send the colonist on its way. */
  private finishActive(c: Colonist, kind: number): void {
    this.actC = null;
    const br = this.brains.get(c.id);
    if (!br) return;
    br.queued = false;
    const wp = this.sf.wp;
    // buildings may have changed while the search ran over several frames: then the result is not cached and the
    // colonist re-validates the path (and re-plans if needed) on its first step
    const stale = this.actEpoch !== this.epoch;
    if (!stale) {
      if (this.pathCache.size >= CACHE_MAX) this.pathCache.clear();
      this.pathCache.set(this.actKey, { kind, wp, at: this.f.now, enter: this.actEnter });
    }
    if (br.pst !== P_WAIT || !br.moving) return;
    this.probe.begin(br.bld, cellOf(c.x), cellOf(c.z), cellOf(br.gx), cellOf(br.gz));
    this.adopt(c, br, kind, wp, false);
    if (stale && (br.pst as number) === P_FOLLOW) br.pver = this.actEpoch;
  }

  /** Start following a path (or fall back to plain steering when there is none). false = rejected (cached path unusable here). */
  private adopt(c: Colonist, br: Brain, kind: number, wp: Float32Array, validate: boolean): boolean {
    const pf = this.probe;
    const n = wp.length >> 1;
    br.best = Infinity;
    br.stuck = 0;
    br.pver = this.epoch;
    if (kind === R_NONE || n === 0) {
      // nowhere to walk to: plain steering, short fuse before the last-resort teleport
      this.stats.fallbacks++;
      br.pst = P_DIRECT;
      br.wp = null;
      br.wpi = br.wpn = 0;
      br.stuckMax = STUCK_FINAL;
      return true;
    }
    if (validate && !pf.lineClear(c.x, c.z, wp[0], wp[1])) return false;
    let m = n;
    if (kind === R_FOUND) {
      // the last waypoint is the goal cell's centre: drop it (and more) when the exact goal is visible sooner
      while (m > 0) {
        const px = m >= 2 ? wp[(m - 2) * 2] : c.x;
        const pz = m >= 2 ? wp[(m - 2) * 2 + 1] : c.z;
        if (!pf.lineClear(px, pz, br.gx, br.gz)) break;
        m--;
      }
    }
    br.pst = P_FOLLOW;
    br.wp = wp;
    br.wpi = 0;
    br.wpn = m;
    br.pkind = kind;
    let len = 0;
    let px = c.x;
    let pz = c.z;
    for (let i = 0; i < m; i++) {
      len += Math.hypot(wp[i * 2] - px, wp[i * 2 + 1] - pz);
      px = wp[i * 2];
      pz = wp[i * 2 + 1];
    }
    len += Math.hypot(br.gx - px, br.gz - pz);
    br.walkMax = br.walkT + (len / Math.max(0.5, br.speed)) * 2.5 + 8;
    return true;
  }

  /** Is the remaining path still walkable (buildings changed since it was planned)? */
  private pathValid(c: Colonist, br: Brain): boolean {
    const wp = br.wp;
    if (!wp) return false;
    const pf = this.probe;
    pf.begin(br.bld, cellOf(c.x), cellOf(c.z), cellOf(br.gx), cellOf(br.gz));
    let px = c.x;
    let pz = c.z;
    for (let i = br.wpi; i < br.wpn; i++) {
      const x = wp[i * 2];
      const z = wp[i * 2 + 1];
      if (!pf.lineClear(px, pz, x, z, 0.3)) return false;
      px = x;
      pz = z;
    }
    return br.pkind !== R_FOUND || pf.lineClear(px, pz, br.gx, br.gz, 0.3);
  }

  /** The path is no good any more: plan again from where the colonist stands (never reusing cached paths). */
  private replan(c: Colonist, br: Brain): void {
    this.stats.replans++;
    br.replans++;
    br.waitT = 0;
    br.pst = P_WAIT;
    br.wp = null;
    br.wpi = br.wpn = 0;
    br.best = Infinity;
    br.stuck = 0;
    this.enqueue(c, br);
    this.drive();
  }

  /** A partial path ran out of waypoints: budget-limited ones continue from here, unreachable goals go last-resort. */
  private endOfPartial(c: Colonist, br: Brain): void {
    if (br.pkind === R_BUDGET && br.replans < 1) {
      this.replan(c, br);
      return;
    }
    this.stats.fallbacks++;
    br.pst = P_DIRECT;
    br.wp = null;
    br.stuckMax = STUCK_FINAL;
    br.best = Infinity;
    br.stuck = 0;
  }

  private arrive(c: Colonist, br: Brain): void {
    if (this.actC === c) this.dropActive();
    br.moving = false;
    br.pst = P_DIRECT;
    br.wp = null;
    br.stuck = 0;
    c.activity = br.act;
    c.tx = c.x;
    c.tz = c.z;
    br.until = this.f.now + br.stay;
    br.hitT = this.f.now + 0.4 + this.game.rng.next() * 0.6;
  }

  private step(c: Colonist, br: Brain, dt: number, now: number): void {
    if (!br.moving) {
      if (br.hasFace && c.activity !== 'sleeping') c.rot = approachAngle(c.rot, Math.atan2(br.fx - c.x, br.fz - c.z), 6 * dt);
      return;
    }
    if (br.pst === P_WAIT) {
      // waiting a few frames for a path search; if the queue is somehow clogged, just start walking
      br.waitT += dt;
      br.walkT += dt;
      if (br.waitT > MAX_WAIT) {
        br.pst = P_DIRECT;
        br.waitT = 0;
      }
      return;
    }
    const maxStep = br.speed * dt * (this.f.combat ? 1.5 : 1);
    // current steering target: the next waypoint of the path, or the goal itself
    let tx = br.gx;
    let tz = br.gz;
    let mid = false;
    if (br.pst === P_FOLLOW) {
      if (br.pver !== this.epoch && this.revalLeft > 0) {
        // buildings changed since this path was planned: make sure it is still walkable (a few per frame)
        this.revalLeft--;
        br.pver = this.epoch;
        if (!this.pathValid(c, br)) {
          this.replan(c, br);
          return;
        }
      }
      const wp = br.wp!;
      const reach = Math.max(0.16, maxStep * maxStep * 2.25);
      while (br.wpi < br.wpn) {
        const wx = wp[br.wpi * 2] - c.x;
        const wz = wp[br.wpi * 2 + 1] - c.z;
        if (wx * wx + wz * wz > reach) break;
        br.wpi++;
        br.best = Infinity;
        br.stuck = 0;
      }
      if (br.wpi < br.wpn) {
        tx = wp[br.wpi * 2];
        tz = wp[br.wpi * 2 + 1];
        mid = true;
      } else if (br.pkind !== R_FOUND) {
        this.endOfPartial(c, br);
        if ((br.pst as number) !== P_DIRECT) return; // re-planning: continue next frame
      }
    }
    const dx = tx - c.x;
    const dz = tz - c.z;
    const d2 = dx * dx + dz * dz;
    if (!mid && d2 < 0.0625) {
      c.x = br.gx;
      c.z = br.gz;
      this.arrive(c, br);
      return;
    }
    const d = Math.sqrt(d2);
    const stepLen = Math.min(d, maxStep);
    let nx = c.x + (dx / d) * stepLen;
    let nz = c.z + (dz / d) * stepLen;

    // obstacle sliding (only when crossing into a new cell)
    const ocx = cellOf(c.x);
    const ocz = cellOf(c.z);
    const ncx = cellOf(nx);
    const ncz = cellOf(nz);
    if ((ncx !== ocx || ncz !== ocz) && this.blocked(ncx, ncz, br.bld) && !this.sameSolid(ocx, ocz, ncx, ncz, br.bld)) {
      if (br.pst === P_FOLLOW && br.replans < MAX_REPLANS) {
        this.replan(c, br); // the way is blocked (unexpectedly): plan again instead of sliding
        return;
      }
      this.slide(c, br, dx, dz, stepLen, now, ocx, ocz, ncx, ncz);
      nx = this.rx;
      nz = this.rz;
    } else if (now >= br.slideUntil) br.slideDir = 0;

    // stuck detection: no real progress toward the target for a few seconds (also catches sliding back and forth),
    // or a walk that takes absurdly long -> teleport to the goal (last resort)
    br.walkT += dt;
    if (d < br.best - 0.25) {
      br.best = d;
      br.stuck = 0;
    } else br.stuck += dt;
    if (br.stuck > br.stuckMax || br.walkT > br.walkMax) {
      c.x = br.gx;
      c.z = br.gz;
      this.arrive(c, br);
      return;
    }

    c.x = nx;
    c.z = nz;
    c.rot = approachAngle(c.rot, Math.atan2(dx, dz), 12 * dt);
  }

  /**
   * The straight step runs into a blocked cell. Slide along the obstacle (writes this.rx / this.rz):
   * diagonal approaches keep whichever single axis is free; head-on approaches slide toward the nearest gap
   * (probed up to 10 cells either way) and keep that direction for a few seconds so they never jitter.
   */
  private slide(c: Colonist, br: Brain, dx: number, dz: number, stepLen: number, now: number, ocx: number, ocz: number, ncx: number, ncz: number): void {
    this.rx = c.x;
    this.rz = c.z;
    const enter = br.bld;
    const xCross = ncx !== ocx;
    const zCross = ncz !== ocz;
    if (xCross && zCross) {
      const freeX = !this.blocked(ncx, ocz, enter);
      const freeZ = !this.blocked(ocx, ncz, enter);
      if (freeX && (Math.abs(dx) >= Math.abs(dz) || !freeZ)) {
        this.rx = c.x + Math.sign(dx) * stepLen;
        return;
      }
      if (freeZ) {
        this.rz = c.z + Math.sign(dz) * stepLen;
        return;
      }
    }
    // blocked head-on along `acrossX`; slide along the other axis
    const acrossX = xCross && (!zCross || Math.abs(dx) >= Math.abs(dz));
    let dir = now < br.slideUntil ? br.slideDir : 0;
    if (dir === 0) {
      let kp = 99;
      let kn = 99;
      for (let k = 1; k <= 10 && (kp === 99 || kn === 99); k++) {
        if (kp === 99 && !(acrossX ? this.blocked(ncx, ocz + k, enter) : this.blocked(ocx + k, ncz, enter))) kp = k;
        if (kn === 99 && !(acrossX ? this.blocked(ncx, ocz - k, enter) : this.blocked(ocx - k, ncz, enter))) kn = k;
      }
      if (kp === 99 && kn === 99) return; // enclosed: stand still, the stuck timer teleports us
      const pref = Math.sign(acrossX ? dz : dx) || 1;
      dir = kp < kn ? 1 : kn < kp ? -1 : pref;
      br.slideDir = dir;
      br.slideUntil = now + 3;
    }
    const sx = acrossX ? c.x : c.x + dir * stepLen;
    const sz = acrossX ? c.z + dir * stepLen : c.z;
    const scx = cellOf(sx);
    const scz = cellOf(sz);
    if ((scx === ocx && scz === ocz) || !this.blocked(scx, scz, enter)) {
      this.rx = sx;
      this.rz = sz;
    } else br.slideDir = -dir; // the wall continues this way: try the other
  }

  // ------------------------------------------------------------------ working

  private work(c: Colonist, br: Brain, dt: number, now: number): void {
    gainWorkXp(this.game, c, dt);
    if (EMIT_WORK_FX && br.node >= 0 && now >= br.hitT) {
      br.hitT = now + 0.9 + this.game.rng.next() * 0.5;
      const dx = c.x - this.f.px;
      const dz = c.z - this.f.pz;
      if (dx * dx + dz * dz < FX_RANGE2) {
        // visual/audio only — production is the economy's job. (fx/fz = the node's position.)
        this.game.bus.emit('colonist:workHit', { id: c.id, node: br.node, model: br.nodeModel, x: br.fx, z: br.fz });
      }
    }
  }
}
