/**
 * Pacing bot navigation: grid pathfinding over the real world (terrain, water, locked regions, buildings and solid
 * resource nodes) and joystick steering along the path, exactly like a thumb on the virtual stick would. Not a test.
 */
import type { Game } from '../../src/core/Game';
import { CELL, WORLD_CELLS, cellCenter, cellOf } from '../../src/core/constants';

const N = WORLD_CELLS;

export interface Pt {
  x: number;
  z: number;
}

/** Binary min-heap of cell indices keyed by a Float64 score array. */
class Heap {
  private a: number[] = [];
  constructor(private readonly key: Float64Array) {}
  get size(): number {
    return this.a.length;
  }
  clear(): void {
    this.a.length = 0;
  }
  push(i: number): void {
    const a = this.a;
    const k = this.key;
    a.push(i);
    let c = a.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (k[a[p]] <= k[a[c]]) break;
      [a[p], a[c]] = [a[c], a[p]];
      c = p;
    }
  }
  pop(): number {
    const a = this.a;
    const k = this.key;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let p = 0;
      for (;;) {
        const l = p * 2 + 1;
        const r = l + 1;
        let m = p;
        if (l < a.length && k[a[l]] < k[a[m]]) m = l;
        if (r < a.length && k[a[r]] < k[a[m]]) m = r;
        if (m === p) break;
        [a[p], a[m]] = [a[m], a[p]];
        p = m;
      }
    }
    return top;
  }
}

export class Nav {
  private readonly nodeBlock = new Uint8Array(N * N);
  private nodeBlockAt = -1e9;
  private readonly g = new Float64Array(N * N);
  private readonly f = new Float64Array(N * N);
  private readonly from = new Int32Array(N * N);
  private readonly stamp = new Int32Array(N * N);
  /** Walkability looked up during one search (state does not change mid-search): 1 walkable, 2 blocked. */
  private readonly walk = new Uint8Array(N * N);
  private readonly walkStamp = new Int32Array(N * N);
  /** 4-connected components of walkable cells (0 = blocked), rebuilt lazily when what can change walkability did. */
  private readonly comp = new Int32Array(N * N);
  private compKey = '';
  private readonly fill: number[] = [];
  private run = 1;
  private readonly heap = new Heap(this.f);

  constructor(private readonly game: Game) {}

  /** Solid resource nodes (trees, boulders, veins) as blocked cells; refreshed every few seconds of play. */
  private refreshNodes(): void {
    const now = this.game.state.playTime;
    if (now - this.nodeBlockAt < 5) return;
    this.nodeBlockAt = now;
    this.nodeBlock.fill(0);
    const w = this.game.sys.world;
    const depleted = this.game.state.world.depleted;
    for (const n of w.gen.nodes) {
      const r = w.nodeRadius(n.i);
      if (r <= 0.35 || depleted[n.i] !== undefined) continue;
      const cx0 = cellOf(n.x - r * 0.7);
      const cx1 = cellOf(n.x + r * 0.7);
      const cz0 = cellOf(n.z - r * 0.7);
      const cz1 = cellOf(n.z + r * 0.7);
      for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) if (cx >= 0 && cz >= 0 && cx < N && cz < N) this.nodeBlock[cz * N + cx] = 1;
    }
  }

  hover(): boolean {
    const v = this.game.sys.player.vehicleDef();
    return !!v?.hover;
  }

  /** Can the player stand in / walk through this cell? */
  walkable(cx: number, cz: number, hover = this.hover()): boolean {
    if (cx < 0 || cz < 0 || cx >= N || cz >= N) return false;
    if (this.game.sys.world.terrainCode(cx, cz, hover) !== 0) return false;
    if (this.game.sys.buildings.blocked(cx, cz, 'player')) return false;
    return this.nodeBlock[cz * N + cx] === 0;
  }

  /** Rebuild the component map when buildings, regions, the node mask or the vehicle changed (same tick: reuse). */
  private components(hover: boolean): Int32Array {
    const g = this.game;
    const key = `${g.state.playTime}|${this.nodeBlockAt}|${hover}|${g.derived.buildingsVersion}|${g.state.world.regionsUnlocked.length}|${g.state.buildings.list.length}`;
    if (key === this.compKey) return this.comp;
    this.compKey = key;
    const comp = this.comp;
    comp.fill(-1);
    let id = 0;
    const stack = this.fill;
    for (let i = 0; i < N * N; i++) {
      if (comp[i] !== -1) continue;
      if (!this.walkable(i % N, (i / N) | 0, hover)) {
        comp[i] = 0;
        continue;
      }
      id++;
      comp[i] = id;
      stack.length = 0;
      stack.push(i);
      while (stack.length) {
        const c = stack.pop()!;
        const cx = c % N;
        const cz = (c / N) | 0;
        for (let k = 0; k < 4; k++) {
          const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
          const nz = cz + (k === 2 ? 1 : k === 3 ? -1 : 0);
          if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
          const ni = nz * N + nx;
          if (comp[ni] !== -1) continue;
          if (!this.walkable(nx, nz, hover)) {
            comp[ni] = 0;
            continue;
          }
          comp[ni] = id;
          stack.push(ni);
        }
      }
    }
    return comp;
  }

  /**
   * Can any goal cell inside `box` be reached from the start cell at all? (Diagonal steps need both side cells free,
   * so reachability is plain 4-connectivity of walkable cells: the start's free side neighbours name the components.)
   */
  private anyReachable(sx: number, sz: number, goal: (cx: number, cz: number) => boolean, box: [number, number, number, number], hover: boolean): boolean {
    const comp = this.components(hover);
    const starts = new Set<number>();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = sx + dx;
      const nz = sz + dz;
      if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
      const c = comp[nz * N + nx];
      if (c > 0) starts.add(c);
    }
    if (!starts.size) return false;
    for (let cz = Math.max(0, box[1]); cz <= Math.min(N - 1, box[3]); cz++) {
      for (let cx = Math.max(0, box[0]); cx <= Math.min(N - 1, box[2]); cx++) {
        if (starts.has(comp[cz * N + cx]) && goal(cx, cz)) return true;
      }
    }
    return false;
  }

  /**
   * Shortest path from a world point to the nearest cell satisfying `goal` (A* toward `aim` when given, else
   * Dijkstra). Returns world-space waypoints (cell centres, thinned) or null. `goalBox` (cells, inclusive) bounds the
   * goal: a search that has not found it after a short while first checks the goal is reachable at all, so an
   * unreachable target costs one flood fill instead of a search over the whole reachable map (same answers).
   */
  path(fromX: number, fromZ: number, goal: (cx: number, cz: number) => boolean, aim?: Pt, maxExpand = 70000, goalBox?: [number, number, number, number]): Pt[] | null {
    this.refreshNodes();
    const hover = this.hover();
    const run = ++this.run;
    const sx = cellOf(fromX);
    const sz = cellOf(fromZ);
    const start = sz * N + sx;
    const ax = aim ? cellOf(aim.x) : 0;
    const az = aim ? cellOf(aim.z) : 0;
    const h = (cx: number, cz: number) => {
      if (!aim) return 0;
      const dx = Math.abs(cx - ax);
      const dz = Math.abs(cz - az);
      return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
    };
    this.heap.clear();
    this.stamp[start] = run;
    this.g[start] = 0;
    this.f[start] = h(sx, sz);
    this.from[start] = -1;
    this.heap.push(start);
    let expanded = 0;
    let found = -1;
    // memoised walkable(): a cell is asked about up to 24 times per search (same answers, a lot faster)
    const walk = this.walk;
    const walkStamp = this.walkStamp;
    const ok = (x: number, z: number): boolean => {
      if (x < 0 || z < 0 || x >= N || z >= N) return false;
      const i = z * N + x;
      if (walkStamp[i] === run) return walk[i] === 1;
      walkStamp[i] = run;
      const w = this.walkable(x, z, hover);
      walk[i] = w ? 1 : 2;
      return w;
    };
    let checked = !goalBox;
    while (this.heap.size) {
      const cur = this.heap.pop();
      const cx = cur % N;
      const cz = (cur / N) | 0;
      if (goal(cx, cz)) {
        found = cur;
        break;
      }
      if (++expanded > maxExpand) break;
      if (!checked && expanded > 2000) {
        checked = true;
        if (!this.anyReachable(sx, sz, goal, goalBox!, hover)) break;
      }
      const gc = this.g[cur];
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (!ok(nx, nz)) continue;
          if (dx && dz && (!ok(cx + dx, cz) || !ok(cx, cz + dz))) continue;
          const ni = nz * N + nx;
          const ng = gc + (dx && dz ? 1.414 : 1);
          if (this.stamp[ni] === run && this.g[ni] <= ng) continue;
          this.stamp[ni] = run;
          this.g[ni] = ng;
          this.f[ni] = ng + h(nx, nz);
          this.from[ni] = cur;
          this.heap.push(ni);
        }
      }
    }
    if (found < 0) return null;
    const cells: number[] = [];
    for (let c = found; c >= 0; c = this.from[c]) cells.push(c);
    cells.reverse();
    const pts: Pt[] = [];
    for (let k = 1; k < cells.length; k++) {
      // thin straight runs: keep turns and every 3rd cell
      const last = k === cells.length - 1;
      if (!last && k % 3 !== 0) {
        const a = cells[k - 1];
        const b = cells[k];
        const c = cells[k + 1];
        if (b - a === c - b) continue;
      }
      pts.push({ x: cellCenter(cells[k] % N), z: cellCenter((cells[k] / N) | 0) });
    }
    return pts;
  }

  /** Straight line walkable for a body of radius ~0.65 (cell samples every half unit, plus both sides). */
  clearLine(x0: number, z0: number, x1: number, z1: number): boolean {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return true;
    const nx = -dz / len;
    const nz = dx / len;
    const hover = this.hover();
    // the first metre is where the body already is (it may overlap a rock's cell): only check ahead of it
    for (let t = Math.min(1, len); t <= len; t += 0.5) {
      const x = x0 + (dx * t) / len;
      const z = z0 + (dz * t) / len;
      for (const o of [0, 0.65, -0.65]) if (!this.walkable(cellOf(x + nx * o), cellOf(z + nz * o), hover)) return false;
    }
    return true;
  }

  /** Path to stand within `range` world units of a point (e.g. a resource node or a POI). */
  pathNear(fromX: number, fromZ: number, x: number, z: number, range: number): Pt[] | null {
    const r = range - CELL * 0.75;
    const rr = Math.max(0.9, r);
    const box: [number, number, number, number] = [cellOf(x - rr) - 1, cellOf(z - rr) - 1, cellOf(x + rr) + 1, cellOf(z + rr) + 1];
    return this.path(fromX, fromZ, (cx, cz) => Math.hypot(cellCenter(cx) - x, cellCenter(cz) - z) <= rr, { x, z }, 70000, box);
  }
}

/** Joystick driver following a path of waypoints (camera yaw 0: right = +X, up = -Z). */
export class Mover {
  path: Pt[] = [];
  private idx = 0;
  private best = Infinity;
  private stuck = 0;
  /** Final destination and how close counts as arrived. */
  dest: Pt | null = null;
  near = 1;

  constructor(
    private readonly game: Game,
    private readonly nav?: Nav,
  ) {}

  set(path: Pt[], dest: Pt, near: number): void {
    this.path = path;
    this.idx = 0;
    this.dest = dest;
    this.near = near;
    this.best = Infinity;
    this.stuck = 0;
  }

  clear(): void {
    this.path = [];
    this.dest = null;
    this.release();
  }

  release(): void {
    this.game.input.moveX = 0;
    this.game.input.moveY = 0;
  }

  get active(): boolean {
    return this.dest != null;
  }

  /** Steer one frame. Returns 'arrived', 'stuck' or 'moving'. */
  step(dt: number): 'arrived' | 'stuck' | 'moving' {
    const g = this.game;
    const p = g.state.player;
    if (!this.dest) return 'arrived';
    g.view.camera.yaw = 0;
    const dd = Math.hypot(this.dest.x - p.x, this.dest.z - p.z);
    if (dd <= this.near) {
      this.release();
      return 'arrived';
    }
    const speed = g.sys.player.speed();
    // reached the waypoint: next one; then look ahead to the furthest waypoint in plain sight (no corner cutting)
    // a fast vehicle covers several metres per step: "reached" scales with the step so it never orbits a waypoint
    const reach = Math.max(1.0, speed * dt * 0.8);
    while (this.idx < this.path.length - 1 && Math.hypot(this.path[this.idx].x - p.x, this.path[this.idx].z - p.z) < reach) this.idx++;
    if (this.nav) {
      for (let k = Math.min(this.path.length - 1, this.idx + 6); k > this.idx; k--) {
        if (this.nav.clearLine(p.x, p.z, this.path[k].x, this.path[k].z)) {
          this.idx = k;
          break;
        }
      }
    }
    const wp = this.path[this.idx] ?? this.dest;
    const dx = wp.x - p.x;
    const dz = wp.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    // slow down onto the final waypoint so a fast vehicle does not orbit it
    const last = this.idx >= this.path.length - 1;
    const mag = last ? Math.min(1, Math.max(0.35, d / Math.max(2, speed * 0.4))) : 1;
    g.input.moveX = (dx / d) * mag;
    g.input.moveY = (-dz / d) * mag;
    if (dd < this.best - 0.25) {
      this.best = dd;
      this.stuck = 0;
    } else this.stuck += dt;
    if (this.stuck > 5) {
      this.release();
      return 'stuck';
    }
    return 'moving';
  }
}
