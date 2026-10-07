/**
 * Integer-hash value noise for world generation.
 *
 * Unlike `core/rng.hash2` this is built purely from 32-bit integer ops (`Math.imul`, shifts), so the same
 * seed yields bit-identical results on every JS engine (V8 / JavaScriptCore) — required so cloud saves,
 * which key depleted nodes by generated index, stay consistent across devices. Only +,-,*,/ and sqrt are
 * used on the float side (all correctly rounded by IEEE-754).
 */

/** 32-bit lattice hash. */
export function hash32(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Lattice hash mapped to [0, 1). */
export function hashf(x: number, y: number, seed: number): number {
  return hash32(x, y, seed) / 4294967296;
}

/** Smooth 2D value noise in [0, 1). */
export function vnoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hashf(xi, yi, seed);
  const b = hashf(xi + 1, yi, seed);
  const c = hashf(xi, yi + 1, seed);
  const d = hashf(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal value noise in [0, 1). */
export function fbm2(x: number, y: number, seed: number, octaves: number): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(x * freq, y * freq, seed + i * 101);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** Ridged fractal noise in [0, 1]: sharp crests (used for canyon walls and ridge lines). */
export function ridged2(x: number, y: number, seed: number, octaves: number): number {
  const n = fbm2(x, y, seed, octaves);
  const r = 1 - Math.abs(2 * n - 1);
  return r * r;
}

/** Fold an arbitrary seed into a small positive integer that mixes well with the lattice hash. */
export function seedMix(seed: number, salt: number): number {
  return hash32(seed | 0, salt | 0, 0x51ed270b) | 0;
}
