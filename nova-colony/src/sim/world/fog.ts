/**
 * Fog of war: a 64x64 bitset, each bit = 4x4 cells (8x8 world units), persisted as base64 in
 * `state.world.fog`. Revealing is cheap and only touches the few bits around the player.
 */
import { CELL, HALF_WORLD, WORLD_CELLS } from '../../core/constants';

export const FOG_SIZE = 64;
const FOG_UNIT = (WORLD_CELLS * CELL) / FOG_SIZE; // world units per fog bit (8)
const BYTES = (FOG_SIZE * FOG_SIZE) / 8;

export class Fog {
  readonly bits = new Uint8Array(BYTES);

  /** Fog bit coordinate of a world position on one axis (clamped). */
  static axis(w: number): number {
    const f = Math.floor((w + HALF_WORLD) / FOG_UNIT);
    return f < 0 ? 0 : f >= FOG_SIZE ? FOG_SIZE - 1 : f;
  }

  isRevealedBit(fx: number, fz: number): boolean {
    const i = fz * FOG_SIZE + fx;
    return (this.bits[i >> 3] & (1 << (i & 7))) !== 0;
  }

  revealed(x: number, z: number): boolean {
    return this.isRevealedBit(Fog.axis(x), Fog.axis(z));
  }

  /** Reveal every fog bit whose centre lies within `radius` world units. Returns the number of newly revealed bits. */
  reveal(x: number, z: number, radius: number): number {
    const x0 = Fog.axis(x - radius);
    const x1 = Fog.axis(x + radius);
    const z0 = Fog.axis(z - radius);
    const z1 = Fog.axis(z + radius);
    const r2 = radius * radius;
    let added = 0;
    for (let fz = z0; fz <= z1; fz++) {
      const cz = (fz + 0.5) * FOG_UNIT - HALF_WORLD - z;
      for (let fx = x0; fx <= x1; fx++) {
        const cx = (fx + 0.5) * FOG_UNIT - HALF_WORLD - x;
        // a bit counts when its centre or the nearest point of its square is inside the disc (generous = nicer)
        const nx = Math.max(0, Math.abs(cx) - FOG_UNIT / 2);
        const nz = Math.max(0, Math.abs(cz) - FOG_UNIT / 2);
        if (nx * nx + nz * nz > r2 * 0.6) continue;
        const i = fz * FOG_SIZE + fx;
        const m = 1 << (i & 7);
        if (!(this.bits[i >> 3] & m)) {
          this.bits[i >> 3] |= m;
          added++;
        }
      }
    }
    return added;
  }

  /** Number of revealed bits (for exploration %). */
  count(): number {
    let n = 0;
    for (let i = 0; i < BYTES; i++) {
      let b = this.bits[i];
      while (b) {
        n += b & 1;
        b >>= 1;
      }
    }
    return n;
  }

  encode(): string {
    let s = '';
    for (let i = 0; i < BYTES; i++) s += String.fromCharCode(this.bits[i]);
    return btoa(s);
  }

  /** Load from base64 (empty / malformed input yields a fully fogged map). */
  decode(b64: string): void {
    this.bits.fill(0);
    if (!b64) return;
    try {
      const s = atob(b64);
      for (let i = 0; i < BYTES && i < s.length; i++) this.bits[i] = s.charCodeAt(i) & 255;
    } catch {
      this.bits.fill(0);
    }
  }
}
