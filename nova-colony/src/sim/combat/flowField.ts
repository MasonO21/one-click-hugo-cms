/**
 * FlowField — shortest paths over a bounded square cell grid around the colony toward goal cells (the
 * core footprint). Every cell stores the next cell on its cheapest path, so hundreds of aliens path in
 * O(1) per frame. All storage is typed arrays, reused across rebuilds.
 *
 * Cell costs: 0 = impassable (water / unwalkable), 1 = open ground, >1 = blocked by a building that
 * aliens bash through (BASH_COST). `occ` holds the id of the alien-blocking building on a cell (0 = none).
 * Diagonal steps are only allowed when both orthogonal neighbours are open ground (no corner cutting).
 *
 * Solver: Dijkstra with Dial's bucket queue. Edge weights are small integers (ORTHO / DIAG × the cost of
 * the cell being crossed), so a circular array of buckets replaces the heap: O(cells × 8), no log factor.
 * `dist` is therefore in "path units" (ORTHO per open orthogonal step).
 */
import { CELL, HALF_WORLD } from '../../core/constants';

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DZ = [0, 0, 1, -1, 1, -1, 1, -1];
/** Integer step weights (7/5 ≈ √2). */
export const ORTHO = 5;
export const DIAG = 7;

export const COST_BLOCKED = 0;
export const COST_OPEN = 1;

export class FlowField {
  /** Min-corner cell of the grid. */
  ox = 0;
  oz = 0;
  /** Grid edge length in cells. */
  n = 0;
  cost = new Uint8Array(0);
  occ = new Int32Array(0);
  /** Path cost to the nearest goal (path units), Infinity when unreachable. */
  dist = new Float32Array(0);
  next = new Int32Array(0);
  /** True once solve() ran for the current layout. */
  ready = false;
  /** Bumped on every solve (debug / render overlays). */
  version = 0;

  // Dial's bucket queue: per-bucket singly linked lists of entries (lazy deletion of stale entries)
  private bucketHead = new Int32Array(0);
  private entIdx = new Int32Array(0);
  private entNext = new Int32Array(0);

  /** Resize (if needed) and reset the grid to open ground with no occupants. */
  reset(ox: number, oz: number, n: number): void {
    const size = n * n;
    if (this.cost.length !== size) {
      this.cost = new Uint8Array(size);
      this.occ = new Int32Array(size);
      this.dist = new Float32Array(size);
      this.next = new Int32Array(size);
    }
    this.ox = ox;
    this.oz = oz;
    this.n = n;
    this.cost.fill(COST_OPEN);
    this.occ.fill(0);
    this.ready = false;
  }

  /** Grid index of a cell, or -1 outside. */
  idx(cx: number, cz: number): number {
    const x = cx - this.ox;
    const z = cz - this.oz;
    if (x < 0 || z < 0 || x >= this.n || z >= this.n) return -1;
    return z * this.n + x;
  }

  /** Grid index at a world position, or -1 outside. */
  idxAt(wx: number, wz: number): number {
    return this.idx(Math.floor((wx + HALF_WORLD) / CELL), Math.floor((wz + HALF_WORLD) / CELL));
  }

  /** World-space center of a grid index. */
  centerX(i: number): number {
    return (this.ox + (i % this.n) + 0.5) * CELL - HALF_WORLD;
  }
  centerZ(i: number): number {
    return (this.oz + Math.floor(i / this.n) + 0.5) * CELL - HALF_WORLD;
  }

  /** Is the world position on a cell that blocks movement (building or impassable)? Outside = free. */
  blockedAt(wx: number, wz: number): boolean {
    if (!this.ready) return false;
    const i = this.idxAt(wx, wz);
    return i >= 0 && this.cost[i] !== COST_OPEN;
  }

  /** Compute dist/next for every cell from the goal cells (grid indices). */
  solve(goals: ArrayLike<number>, goalCount: number): void {
    const n = this.n;
    const size = n * n;
    const { cost, dist, next } = this;
    dist.fill(Infinity);
    next.fill(-1);

    let maxCost = 1;
    for (let i = 0; i < size; i++) if (cost[i] > maxCost) maxCost = cost[i];
    // tentative distances in the queue span <= DIAG * maxCost: a power-of-two ring of buckets covers it
    let B = 1;
    while (B <= DIAG * maxCost) B <<= 1;
    const mask = B - 1;
    if (this.bucketHead.length < B) this.bucketHead = new Int32Array(B);
    const head = this.bucketHead;
    head.fill(-1, 0, B);
    const cap = size * 8 + goalCount + 8;
    if (this.entIdx.length < cap) {
      this.entIdx = new Int32Array(cap);
      this.entNext = new Int32Array(cap);
    }
    const entIdx = this.entIdx;
    const entNext = this.entNext;
    let ents = 0;
    let queued = 0;

    for (let k = 0; k < goalCount; k++) {
      const g = goals[k];
      if (g < 0 || g >= size || dist[g] === 0) continue;
      dist[g] = 0;
      entIdx[ents] = g;
      entNext[ents] = head[0];
      head[0] = ents++;
      queued++;
    }

    let cur = 0;
    while (queued > 0) {
      const b = cur & mask;
      const e = head[b];
      if (e === -1) {
        cur++;
        continue;
      }
      head[b] = entNext[e];
      queued--;
      const i = entIdx[e];
      if (dist[i] !== cur) continue; // stale entry (improved later)
      const ix = i % n;
      const iz = (i - ix) / n;
      for (let d = 0; d < 8; d++) {
        const jx = ix + DX[d];
        const jz = iz + DZ[d];
        if (jx < 0 || jz < 0 || jx >= n || jz >= n) continue;
        const j = jz * n + jx;
        const cj = cost[j];
        if (cj === COST_BLOCKED) continue;
        let w: number;
        if (d >= 4) {
          if (cost[iz * n + jx] !== COST_OPEN || cost[jz * n + ix] !== COST_OPEN) continue;
          w = DIAG * cj;
        } else w = ORTHO * cj;
        const nd = cur + w;
        if (nd < dist[j]) {
          dist[j] = nd;
          next[j] = i;
          const nb = nd & mask;
          entIdx[ents] = j;
          entNext[ents] = head[nb];
          head[nb] = ents++;
          queued++;
        }
      }
    }
    this.ready = true;
    this.version++;
  }
}
