/**
 * RoomDetector — finds enclosed rooms for automatic roofs.
 *
 * Algorithm (runs only when buildings changed, at most once per frame):
 *  1. Take the bounding box of all wall-like pieces, padded by one cell so its border is open air.
 *  2. Flood-fill "outside" (4-connected) from every border cell; wall-like cells block.
 *  3. Every cell not reached and not a wall is interior. Group interiors into 4-connected components;
 *     components up to `maxCells` become rooms — larger enclosures are courtyards and stay unroofed.
 *  4. Roof cells = interior cells + the wall-like cells bounding them (8-neighbourhood, so corners
 *     are covered too).
 *
 * Scratch buffers are reused between runs (grown on demand) to avoid garbage.
 */
import { WORLD_CELLS, cellIndex } from '../../core/constants';
import type { Id } from '../../core/state';
import { FLOOR, OBJECT, type BuildGrid } from './grid';

export interface Room {
  id: number;
  /** Interior cells (cellIndex). */
  cells: number[];
  /** Buildings standing on interior cells (both layers). */
  buildings: Id[];
}

export interface CellRect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

const UNKNOWN = 0;
const WALL = 1;
const OUTSIDE = 2;
const INSIDE = 3;

export class RoomDetector {
  /** Room id per world cell (0 = not inside a room). */
  readonly roomOf = new Int32Array(WORLD_CELLS * WORLD_CELLS);
  private mark = new Uint8Array(0);
  private queue = new Int32Array(0);
  private touched: number[] = [];

  /**
   * Recompute rooms for the given wall bounding box (null = no walls).
   * Clears and refills `roofCells` in place; returns the new room list.
   */
  compute(grid: BuildGrid, wallBox: CellRect | null, roofCells: Set<number>, maxCells: number): Room[] {
    for (const c of this.touched) this.roomOf[c] = 0;
    this.touched.length = 0;
    roofCells.clear();
    if (!wallBox) return [];

    const x0 = Math.max(0, wallBox.x0 - 1);
    const z0 = Math.max(0, wallBox.z0 - 1);
    const x1 = Math.min(WORLD_CELLS - 1, wallBox.x1 + 1);
    const z1 = Math.min(WORLD_CELLS - 1, wallBox.z1 + 1);
    const w = x1 - x0 + 1;
    const h = z1 - z0 + 1;
    const n = w * h;
    if (this.mark.length < n) {
      this.mark = new Uint8Array(n);
      this.queue = new Int32Array(n);
    }
    const mark = this.mark;
    const queue = this.queue;
    const walls = grid.walls;

    for (let lz = 0; lz < h; lz++) {
      const row = cellIndex(x0, z0 + lz);
      for (let lx = 0; lx < w; lx++) mark[lz * w + lx] = walls[row + lx] ? WALL : UNKNOWN;
    }

    // 1) flood the outside from the border
    let tail = 0;
    const seed = (i: number) => {
      if (mark[i] === UNKNOWN) {
        mark[i] = OUTSIDE;
        queue[tail++] = i;
      }
    };
    for (let lx = 0; lx < w; lx++) {
      seed(lx);
      seed((h - 1) * w + lx);
    }
    for (let lz = 0; lz < h; lz++) {
      seed(lz * w);
      seed(lz * w + w - 1);
    }
    this.flood(0, tail, w, h, OUTSIDE);

    // 2) interior components
    const rooms: Room[] = [];
    for (let start = 0; start < n; start++) {
      if (mark[start] !== UNKNOWN) continue;
      mark[start] = INSIDE;
      queue[0] = start;
      const size = this.flood(0, 1, w, h, INSIDE);
      if (size > maxCells) continue; // courtyard, not a room
      const id = rooms.length + 1;
      const cells: number[] = new Array(size);
      const ids = new Set<Id>();
      for (let k = 0; k < size; k++) {
        const li = queue[k];
        const cx = x0 + (li % w);
        const cz = z0 + ((li / w) | 0);
        const ci = cellIndex(cx, cz);
        cells[k] = ci;
        this.roomOf[ci] = id;
        this.touched.push(ci);
        roofCells.add(ci);
        const f = grid.layers[FLOOR][ci];
        const o = grid.layers[OBJECT][ci];
        if (f) ids.add(f);
        if (o) ids.add(o);
        // bounding walls (8-neighbourhood) are roofed too
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx;
            const nz = cz + dz;
            if (nx < 0 || nz < 0 || nx >= WORLD_CELLS || nz >= WORLD_CELLS) continue;
            const ni = cellIndex(nx, nz);
            if (walls[ni]) roofCells.add(ni);
          }
        }
      }
      rooms.push({ id, cells, buildings: [...ids] });
    }
    return rooms;
  }

  /**
   * BFS over the local box starting with queue[head..tail). Newly reached UNKNOWN cells get `as`.
   * Returns the number of cells that passed through the queue (the component size when head=0).
   */
  private flood(head: number, tail: number, w: number, h: number, as: number): number {
    const mark = this.mark;
    const queue = this.queue;
    while (head < tail) {
      const i = queue[head++];
      const lx = i % w;
      const lz = (i / w) | 0;
      if (lx > 0 && mark[i - 1] === UNKNOWN) {
        mark[i - 1] = as;
        queue[tail++] = i - 1;
      }
      if (lx < w - 1 && mark[i + 1] === UNKNOWN) {
        mark[i + 1] = as;
        queue[tail++] = i + 1;
      }
      if (lz > 0 && mark[i - w] === UNKNOWN) {
        mark[i - w] = as;
        queue[tail++] = i - w;
      }
      if (lz < h - 1 && mark[i + w] === UNKNOWN) {
        mark[i + w] = as;
        queue[tail++] = i + w;
      }
    }
    return tail;
  }
}
