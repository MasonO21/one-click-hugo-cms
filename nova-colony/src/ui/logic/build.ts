/**
 * Pure helpers for build mode: footprint snapping, ghost cells, cost scaling, readable reasons.
 */
import type { ResourceBag } from '../../data/schema';
import { bagEntries } from '../../core/bag';
import { rotatedSize } from '../../core/constants';

export interface Cell {
  x: number;
  z: number;
}

/** Min-corner cell so that the footprint is centred on the cursor cell (cx, cz). */
export function snapFootprint(cx: number, cz: number, size: [number, number], rot: number): Cell {
  const [w, h] = rotatedSize(size, rot);
  return { x: cx - Math.floor((w - 1) / 2), z: cz - Math.floor((h - 1) / 2) };
}

/** Every cell covered by a footprint whose min corner is (x, z). */
export function footprintCells(x: number, z: number, size: [number, number], rot: number): Cell[] {
  const [w, h] = rotatedSize(size, rot);
  const out: Cell[] = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out.push({ x: x + i, z: z + j });
  return out;
}

/** Rotate a blueprint offset by `rot` quarter turns. */
export function rotateOffset(dx: number, dz: number, rot: number): Cell {
  let x = dx;
  let z = dz;
  for (let i = 0; i < ((rot % 4) + 4) % 4; i++) {
    const nx = -z;
    z = x;
    x = nx;
  }
  return { x, z };
}

export function scaleBag(bag: ResourceBag, n: number): ResourceBag {
  const out: ResourceBag = {};
  for (const [k, v] of bagEntries(bag)) out[k] = v * n;
  return out;
}

export function sumBags(bags: ResourceBag[]): ResourceBag {
  const out: ResourceBag = {};
  for (const b of bags) for (const [k, v] of bagEntries(b)) out[k] = (out[k] ?? 0) + v;
  return out;
}

/** "Need 12 more Wood" style text for the first missing resource. */
export function missingText(missing: ResourceBag, nameOf: (id: string) => string): string | null {
  const e = bagEntries(missing);
  if (!e.length) return null;
  const [id, n] = e[0];
  const more = e.length > 1 ? ` (+${e.length - 1} more)` : '';
  return `Need ${Math.ceil(n)} more ${nameOf(id)}${more}`;
}

/** Total refund when removing a building: base cost plus everything spent on level-ups. */
export function refundEstimate(base: ResourceBag, level: number, levelCostMult: number | undefined, refundFraction = 1): ResourceBag {
  const m = levelCostMult ?? 1;
  let factor = 0;
  for (let l = 0; l < Math.max(1, level); l++) factor += Math.pow(m, l);
  const out: ResourceBag = {};
  for (const [k, v] of bagEntries(base)) out[k] = Math.floor(v * factor * refundFraction);
  return out;
}

/** Axis-aligned screen rect from two corner points. */
export function rectFrom(ax: number, ay: number, bx: number, by: number): { x: number; y: number; w: number; h: number } {
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
}

export function pointInRect(px: number, py: number, r: { x: number; y: number; w: number; h: number }): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}
