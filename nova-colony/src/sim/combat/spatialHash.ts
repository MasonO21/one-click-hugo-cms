/**
 * AlienHash — uniform-grid spatial hash over the whole world for alien queries (turret targeting,
 * splash, traps, separation). Rebuilt once per frame in O(n) with typed-array linked lists, so it
 * never allocates after warm-up. Indices refer to positions in `state.combat.aliens` at rebuild time;
 * the combat loop only removes aliens after all queries of the frame are done.
 */
import { HALF_WORLD, WORLD_SIZE } from '../../core/constants';
import type { Alien } from '../../core/state';
import { HIT_AIR, HIT_GROUND } from './types';

/** Can this alien currently be hit by something with `mask`? */
export function targetable(a: Alien, mask: number): boolean {
  if (a.state === 'dying' || a.retreat || a.hp <= 0) return false;
  if (a.y < -0.35) return false; // still underground
  return (a.air ? HIT_AIR : HIT_GROUND) & mask ? true : false;
}

export class AlienHash {
  /** Bucket edge length in world units. */
  readonly bucket: number;
  readonly dim: number;
  private readonly head: Int32Array;
  private next = new Int32Array(256);
  private list: Alien[] = [];

  constructor(bucket = 8) {
    this.bucket = bucket;
    this.dim = Math.ceil(WORLD_SIZE / bucket);
    this.head = new Int32Array(this.dim * this.dim).fill(-1);
  }

  private bx(x: number): number {
    const b = Math.floor((x + HALF_WORLD) / this.bucket);
    return b < 0 ? 0 : b >= this.dim ? this.dim - 1 : b;
  }

  /** Re-index all aliens (call once per frame before queries). */
  rebuild(aliens: Alien[]): void {
    this.head.fill(-1);
    this.list = aliens;
    if (this.next.length < aliens.length) this.next = new Int32Array(Math.max(aliens.length, this.next.length * 2));
    for (let i = 0; i < aliens.length; i++) {
      const a = aliens[i];
      const k = this.bx(a.z) * this.dim + this.bx(a.x);
      this.next[i] = this.head[k];
      this.head[k] = i;
    }
  }

  /**
   * Nearest targetable alien (by `mask`) whose body is within `r` of (x, z), or null.
   * Distance is measured to the body edge so big aliens are hit at the rim.
   */
  nearest(x: number, z: number, r: number, mask: number): Alien | null {
    const list = this.list;
    const pad = 3; // max body radius we care about
    const x0 = this.bx(x - r - pad);
    const x1 = this.bx(x + r + pad);
    const z0 = this.bx(z - r - pad);
    const z1 = this.bx(z + r + pad);
    let best: Alien | null = null;
    let bestD = Infinity;
    for (let bz = z0; bz <= z1; bz++) {
      for (let bx = x0; bx <= x1; bx++) {
        for (let i = this.head[bz * this.dim + bx]; i !== -1; i = this.next[i]) {
          const a = list[i];
          if (!targetable(a, mask)) continue;
          const dx = a.x - x;
          const dz = a.z - z;
          const reach = r + (a.rad ?? 0.5);
          const d2 = dx * dx + dz * dz;
          if (d2 <= reach * reach && d2 < bestD) {
            bestD = d2;
            best = a;
          }
        }
      }
    }
    return best;
  }

  /**
   * Collect aliens whose center is within `r` (+ their radius) of (x, z) into `out` (no filtering
   * besides distance). Returns the count; `out` is reused by the caller to avoid allocations.
   * Stops after `max` results.
   */
  query(x: number, z: number, r: number, out: Alien[], max = 64): number {
    const list = this.list;
    const pad = 3;
    const x0 = this.bx(x - r - pad);
    const x1 = this.bx(x + r + pad);
    const z0 = this.bx(z - r - pad);
    const z1 = this.bx(z + r + pad);
    let n = 0;
    for (let bz = z0; bz <= z1; bz++) {
      for (let bx = x0; bx <= x1; bx++) {
        for (let i = this.head[bz * this.dim + bx]; i !== -1; i = this.next[i]) {
          const a = list[i];
          const dx = a.x - x;
          const dz = a.z - z;
          const reach = r + (a.rad ?? 0.5);
          if (dx * dx + dz * dz <= reach * reach) {
            out[n++] = a;
            if (n >= max) return n;
          }
        }
      }
    }
    return n;
  }
}
