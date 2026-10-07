/**
 * Static spatial bucket grid over the resource nodes (CSR layout: no per-node objects, no per-query
 * allocation). Nodes never move, so it is built once after generation.
 */
import { HALF_WORLD, WORLD_SIZE } from '../../core/constants';

export const BUCKET = 8; // world units per bucket
const G = WORLD_SIZE / BUCKET; // buckets per axis

export class NodeGrid {
  private start = new Int32Array(G * G + 1);
  private items = new Int32Array(0);

  /** Build from parallel position arrays. */
  build(xs: ArrayLike<number>, zs: ArrayLike<number>, count: number): void {
    const counts = new Int32Array(G * G + 1);
    const cell = new Int32Array(count);
    for (let i = 0; i < count; i++) {
      const c = this.bucketOf(xs[i], zs[i]);
      cell[i] = c;
      counts[c + 1]++;
    }
    for (let c = 0; c < G * G; c++) counts[c + 1] += counts[c];
    this.start = counts;
    const fill = counts.slice(0, G * G);
    this.items = new Int32Array(count);
    for (let i = 0; i < count; i++) this.items[fill[cell[i]]++] = i;
  }

  private bucketOf(x: number, z: number): number {
    return this.axis(z) * G + this.axis(x);
  }

  private axis(w: number): number {
    const b = Math.floor((w + HALF_WORLD) / BUCKET);
    return b < 0 ? 0 : b >= G ? G - 1 : b;
  }

  /**
   * Write the indices of every node whose bucket overlaps the box into `out` (a superset of the true
   * neighbours — callers do the exact test). Returns the number written (capped at out.length; a full
   * buffer means the result may be truncated).
   */
  collect(minX: number, minZ: number, maxX: number, maxZ: number, out: Int32Array): number {
    const x0 = this.axis(minX);
    const x1 = this.axis(maxX);
    const z0 = this.axis(minZ);
    const z1 = this.axis(maxZ);
    let n = 0;
    const cap = out.length;
    for (let bz = z0; bz <= z1; bz++) {
      for (let bx = x0; bx <= x1; bx++) {
        const b = bz * G + bx;
        const end = this.start[b + 1];
        for (let k = this.start[b]; k < end; k++) {
          if (n >= cap) return n;
          out[n++] = this.items[k];
        }
      }
    }
    return n;
  }
}
