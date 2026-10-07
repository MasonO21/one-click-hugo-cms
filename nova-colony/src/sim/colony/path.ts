/**
 * Colonist pathfinding — a bounded, allocation-light grid A* over the build grid.
 *
 *  - 8-connected, no corner cutting (a diagonal step needs both orthogonal cells free).
 *  - Passability = `BuildingSystem.blocked(cx, cz, 'colonist')` (doors / gates / floors are passable, walls and solid
 *    facilities are not) + `WorldSystem.walkable` (water, locked regions). The footprint of the destination building
 *    (a bed, the core...) and of the building the colonist currently stands in are passable too, as are the start and
 *    goal cells themselves.
 *  - The search window is the start/goal box plus a margin (united with the colony box when it touches the colony),
 *    with a hard expansion budget. Weighted heuristic (x1.2) keeps detours around big walled bases cheap.
 *  - The raw cell chain is string-pulled with a clearance-aware line-of-sight test into a handful of waypoints.
 *  - All big buffers are module-level typed arrays shared by every instance (searches never interleave), stamped with
 *    a generation counter so nothing is cleared between searches. The only per-search allocation is the waypoint list.
 *
 * Pure of rendering; the only game access is through `game.sys.buildings` / `game.sys.world` (looked up per call, so
 * test doubles are honoured).
 */
import type { Game } from '../../core/Game';
import { WORLD_CELLS, cellCenter, cellOf, rotatedSize } from '../../core/constants';

const N = WORLD_CELLS;
const CELLS = N * N;

/** Search outcome kinds. */
export const R_NONE = 0; // cannot move anywhere closer (enclosed start)
export const R_FOUND = 1; // complete path to the goal cell
export const R_BEST = 2; // goal unreachable inside the window: path to the closest reachable cell
export const R_BUDGET = 3; // expansion budget hit: path to the most promising cell found so far

/** Hard cap on node expansions per search (~0.3-0.6 ms worst case on a phone). */
export const MAX_EXPAND = 6000;
/** Cells added around the start/goal box. */
const MARGIN = 10;
/** Heuristic weight (numerator / 5): 6/5 = 1.2. */
const HW_NUM = 6;
const HW_DEN = 5;
/** Line-of-sight sampling step and body clearance, in world units. */
const LOS_STEP = 0.5;
const LOS_CLEAR = 0.6;
/** The first/last stretch of a line is exempt from the side-lane clearance (colonists stand next to buildings). */
const LOS_EDGE = 1.0;

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DZ = [0, 0, 1, -1, 1, -1, 1, -1];
const COST = [10, 10, 10, 10, 14, 14, 14, 14];

const HEAP_CAP = MAX_EXPAND * 8 + 16;
const CHAIN_CAP = MAX_EXPAND + 8;

// Shared scratch (lazily allocated: most games never need a path).
let stamp: Uint32Array; // cell touched by the current search
let closed: Uint32Array; // cell expanded by the current search
let memo: Uint32Array; // (gen << 1) | passable
let gScore: Int32Array;
let parent: Int32Array;
let heapKey: Int32Array;
let heapVal: Int32Array;
let chain: Int32Array;
let turn: Int32Array;
let scratchWp: Float32Array;
let allocated = false;
let GEN = 0;

function alloc(): void {
  if (allocated) return;
  allocated = true;
  stamp = new Uint32Array(CELLS);
  closed = new Uint32Array(CELLS);
  memo = new Uint32Array(CELLS);
  gScore = new Int32Array(CELLS);
  parent = new Int32Array(CELLS);
  heapKey = new Int32Array(HEAP_CAP);
  heapVal = new Int32Array(HEAP_CAP);
  chain = new Int32Array(CHAIN_CAP);
  turn = new Int32Array(CHAIN_CAP);
  scratchWp = new Float32Array(CHAIN_CAP * 2);
}

const EMPTY = new Float32Array(0);

export class PathFinder {
  /** Waypoints (x,z pairs, cell centres, excluding the start, ending at the goal / closest cell) of the last find(). */
  wp: Float32Array = EMPTY;
  /** Node expansions spent by the last find(). */
  expanded = 0;

  private gen = 0;
  // context set by begin()
  private bs!: Game['sys']['buildings'];
  private world!: Game['sys']['world'];
  private terrain = false;
  private scx = -1;
  private scz = -1;
  private gcx = -1;
  private gcz = -1;
  // passable building footprints (cell rects, inclusive; empty when x0 > x1)
  private ex0 = 1;
  private ex1 = 0;
  private ez0 = 1;
  private ez1 = 0;
  private sx0 = 1;
  private sx1 = 0;
  private sz0 = 1;
  private sz1 = 0;
  // search window
  private wx0 = 0;
  private wx1 = 0;
  private wz0 = 0;
  private wz1 = 0;
  private hn = 0;

  constructor(private readonly game: Game) {}

  // ------------------------------------------------------------------ context

  /**
   * Start a query context: which building footprint may be entered (`enter`, or -1), the start cell (always
   * passable; the building under it is passable too, so colonists can leave a bed) and the goal cell.
   */
  begin(enter: number, scx: number, scz: number, gcx: number, gcz: number): void {
    alloc();
    if (++GEN >= 0x3fffffff) {
      GEN = 1;
      stamp.fill(0);
      closed.fill(0);
      memo.fill(0);
    }
    this.gen = GEN;
    const g = this.game;
    const bs = (this.bs = g.sys.buildings);
    const world = (this.world = g.sys.world);
    const wg = world.gen as { water?: unknown; regionMap?: unknown } | undefined;
    this.terrain = !!wg && !!wg.water && !!wg.regionMap;
    this.scx = scx;
    this.scz = scz;
    this.gcx = gcx;
    this.gcz = gcz;
    this.ex0 = this.sx0 = 1;
    this.ex1 = this.sx1 = 0;
    this.ez0 = this.sz0 = 1;
    this.ez1 = this.sz1 = 0;
    if (enter >= 0) this.rectOf(enter, true);
    if (scx >= 0 && scz >= 0 && scx < N && scz < N && bs.blocked(scx, scz, 'colonist')) {
      const at = bs.at(scx, scz);
      if (at) this.rectOf(at.id, false);
    }
  }

  private rectOf(id: number, isEnter: boolean): void {
    const bs = this.bs;
    const b = bs.get(id);
    if (!b) return;
    const def = bs.def(b);
    if (!def) return;
    const [w, h] = rotatedSize(def.size, b.rot);
    if (isEnter) {
      this.ex0 = b.x;
      this.ex1 = b.x + w - 1;
      this.ez0 = b.z;
      this.ez1 = b.z + h - 1;
    } else {
      this.sx0 = b.x;
      this.sx1 = b.x + w - 1;
      this.sz0 = b.z;
      this.sz1 = b.z + h - 1;
    }
  }

  /** Can a colonist stand on this cell (in the current context)? Memoised per context. */
  open(cx: number, cz: number): boolean {
    if (cx < 0 || cz < 0 || cx >= N || cz >= N) return false;
    const i = cz * N + cx;
    const m = memo[i];
    if (m >>> 1 === this.gen) return (m & 1) === 1;
    const v = this.compute(cx, cz);
    memo[i] = ((this.gen << 1) | (v ? 1 : 0)) >>> 0;
    return v;
  }

  private compute(cx: number, cz: number): boolean {
    if ((cx === this.scx && cz === this.scz) || (cx === this.gcx && cz === this.gcz)) return true;
    if (this.bs.blocked(cx, cz, 'colonist')) {
      const inEnter = cx >= this.ex0 && cx <= this.ex1 && cz >= this.ez0 && cz <= this.ez1;
      const inStart = cx >= this.sx0 && cx <= this.sx1 && cz >= this.sz0 && cz <= this.sz1;
      if (!inEnter && !inStart) return false;
    }
    if (this.terrain && !this.world.walkable(cellCenter(cx), cellCenter(cz))) return false;
    return true;
  }

  // ------------------------------------------------------------------ line of sight

  /**
   * Is the straight segment walkable for a colonist with a small body? Samples the centre line and two side lanes
   * `clear` world units away (the lanes are skipped within LOS_EDGE of both ends).
   */
  lineClear(ax: number, az: number, bx: number, bz: number, clear = LOS_CLEAR): boolean {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 1e-6) return this.open(cellOf(ax), cellOf(az));
    const steps = Math.max(1, Math.ceil(len / LOS_STEP));
    const sx = dx / steps;
    const sz = dz / steps;
    const ox = (-dz / len) * clear;
    const oz = (dx / len) * clear;
    const edge = Math.ceil(LOS_EDGE / LOS_STEP);
    let px = ax;
    let pz = az;
    let c0 = -1;
    let c1 = -1;
    let c2 = -1;
    for (let s = 0; s <= steps; s++, px += sx, pz += sz) {
      const cx = cellOf(px);
      const cz = cellOf(pz);
      const k0 = cz * N + cx;
      if (k0 !== c0) {
        if (!this.open(cx, cz)) return false;
        c0 = k0;
      }
      if (s < edge || s > steps - edge) continue;
      const ax1 = cellOf(px + ox);
      const az1 = cellOf(pz + oz);
      const k1 = az1 * N + ax1;
      if (k1 !== c1) {
        if (!this.open(ax1, az1)) return false;
        c1 = k1;
      }
      const ax2 = cellOf(px - ox);
      const az2 = cellOf(pz - oz);
      const k2 = az2 * N + ax2;
      if (k2 !== c2) {
        if (!this.open(ax2, az2)) return false;
        c2 = k2;
      }
    }
    return true;
  }

  // ------------------------------------------------------------------ search

  /**
   * A* from the start position to the goal position (call begin() first). Returns an R_* kind and leaves the
   * waypoints in `this.wp` (a fresh Float32Array the caller may keep).
   * (ccx, ccz, radius): the colony box in cells — included in the window when the trip touches the colony.
   */
  find(sx: number, sz: number, gx: number, gz: number, ccx: number, ccz: number, radius: number): number {
    const scx = this.scx;
    const scz = this.scz;
    const gcx = this.gcx;
    const gcz = this.gcz;
    this.wp = EMPTY;
    this.expanded = 0;
    if (scx === gcx && scz === gcz) return R_NONE;

    // window
    let x0 = Math.min(scx, gcx) - MARGIN;
    let x1 = Math.max(scx, gcx) + MARGIN;
    let z0 = Math.min(scz, gcz) - MARGIN;
    let z1 = Math.max(scz, gcz) + MARGIN;
    const reach = radius + 6;
    const near = (x: number, z: number) => Math.abs(x - ccx) <= reach && Math.abs(z - ccz) <= reach;
    if (near(scx, scz) || near(gcx, gcz)) {
      x0 = Math.min(x0, ccx - radius - 3);
      x1 = Math.max(x1, ccx + radius + 3);
      z0 = Math.min(z0, ccz - radius - 3);
      z1 = Math.max(z1, ccz + radius + 3);
    }
    this.wx0 = Math.max(0, x0);
    this.wx1 = Math.min(N - 1, x1);
    this.wz0 = Math.max(0, z0);
    this.wz1 = Math.min(N - 1, z1);

    const gen = this.gen;
    const start = scz * N + scx;
    const goal = gcz * N + gcx;
    gScore[start] = 0;
    parent[start] = -1;
    stamp[start] = gen;
    let bestI = start;
    let bestH = this.heur(scx, scz, gcx, gcz);
    const startH = bestH;
    this.hn = 0;
    this.push(start, bestH * 4096 + Math.min(bestH, 4095));

    let kind = R_BEST;
    let exp = 0;
    while (this.hn > 0) {
      const cur = this.pop();
      if (closed[cur] === gen) continue;
      closed[cur] = gen;
      if (cur === goal) {
        kind = R_FOUND;
        break;
      }
      if (++exp > MAX_EXPAND || this.hn > HEAP_CAP - 9) {
        kind = R_BUDGET;
        break;
      }
      const cx = cur % N;
      const cz = (cur - cx) / N;
      const gc = gScore[cur];
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k];
        const nz = cz + DZ[k];
        if (nx < this.wx0 || nx > this.wx1 || nz < this.wz0 || nz > this.wz1) continue;
        if (k >= 4 && (!this.open(nx, cz) || !this.open(cx, nz))) continue; // no corner cutting
        if (!this.open(nx, nz)) continue;
        const ni = nz * N + nx;
        if (closed[ni] === gen) continue;
        const ng = gc + COST[k];
        if (stamp[ni] === gen && ng >= gScore[ni]) continue;
        stamp[ni] = gen;
        gScore[ni] = ng;
        parent[ni] = cur;
        const h = this.heur(nx, nz, gcx, gcz);
        if (h < bestH) {
          bestH = h;
          bestI = ni;
        }
        this.push(ni, (ng + h) * 4096 + Math.min(h, 4095));
      }
    }
    this.expanded = exp;

    let target = goal;
    if (kind !== R_FOUND) {
      target = bestI;
      if (target === start || bestH >= startH) return R_NONE; // nowhere closer to go
    }

    // chain: target ... start
    let n = 0;
    for (let i = target; i !== -1 && n < CHAIN_CAP; i = parent[i]) chain[n++] = i;
    this.wp = this.pull(sx, sz, n);
    return kind;
  }

  /** Weighted octile distance (cost units). */
  private heur(x: number, z: number, gx: number, gz: number): number {
    let dx = x - gx;
    let dz = z - gz;
    if (dx < 0) dx = -dx;
    if (dz < 0) dz = -dz;
    const mn = dx < dz ? dx : dz;
    return (((dx + dz) * 10 - mn * 6) * HW_NUM) / HW_DEN | 0;
  }

  private push(node: number, key: number): void {
    let i = this.hn++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapKey[p] <= key) break;
      heapKey[i] = heapKey[p];
      heapVal[i] = heapVal[p];
      i = p;
    }
    heapKey[i] = key;
    heapVal[i] = node;
  }

  private pop(): number {
    const top = heapVal[0];
    const n = --this.hn;
    if (n > 0) {
      const key = heapKey[n];
      const val = heapVal[n];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && heapKey[c + 1] < heapKey[c]) c++;
        if (heapKey[c] >= key) break;
        heapKey[i] = heapKey[c];
        heapVal[i] = heapVal[c];
        i = c;
      }
      heapKey[i] = key;
      heapVal[i] = val;
    }
    return top;
  }

  /**
   * chain[n-1] is the start cell, chain[0] the target. Drop collinear nodes, then string-pull from the exact start
   * position: each waypoint is the farthest turning point still visible from the previous one.
   */
  private pull(sx: number, sz: number, n: number): Float32Array {
    // path order p[k] = chain[n-1-k], k = 0..m
    const m = n - 1;
    if (m < 1) return EMPTY;
    let t = 0;
    let pdx = 0;
    let pdz = 0;
    for (let k = 1; k <= m; k++) {
      const a = chain[n - k]; // p[k-1]
      const b = chain[n - 1 - k]; // p[k]
      const ax = a % N;
      const bx = b % N;
      const dx = bx - ax;
      const dz = (b - bx) / N - (a - ax) / N;
      if (k > 1 && (dx !== pdx || dz !== pdz)) turn[t++] = a; // direction changed at p[k-1]
      pdx = dx;
      pdz = dz;
    }
    turn[t++] = chain[0]; // target
    // greedy visibility pull over the turning points
    let cnt = 0;
    let ax = sx;
    let az = sz;
    let i = 0;
    while (i < t) {
      let j = i;
      while (j + 1 < t) {
        const nx = cellCenter(turn[j + 1] % N);
        const nz = cellCenter(Math.floor(turn[j + 1] / N));
        if (!this.lineClear(ax, az, nx, nz)) break;
        j++;
      }
      const cx = turn[j] % N;
      const cz = Math.floor(turn[j] / N);
      ax = cellCenter(cx);
      az = cellCenter(cz);
      scratchWp[cnt * 2] = ax;
      scratchWp[cnt * 2 + 1] = az;
      cnt++;
      i = j + 1;
    }
    return scratchWp.slice(0, cnt * 2);
  }
}
