/**
 * Pure grid geometry helpers for construction: drag-to-build lines and blueprint layout rotation.
 * No game state — unit-testable in isolation.
 */
import { rotatedSize } from '../../core/constants';
import type { Blueprint } from '../../core/state';

export type Rot = 0 | 1 | 2 | 3;

export interface Cell {
  x: number;
  z: number;
}

/**
 * Cells covered by a drag from (x0,z0) to (x1,z1), ordered from the start cell.
 *
 * - Mostly-straight drags (the minor axis moved at most 1 cell, or less than a quarter of the major
 *   axis) snap to a straight line along the dominant axis — forgiving for thumbs on a phone.
 * - Clearly diagonal drags become an L: along the dominant axis first, then along the other axis to
 *   the end cell (the corner cell appears once). Two L-drags make a closed room.
 */
export function lineCells(x0: number, z0: number, x1: number, z1: number): Cell[] {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const adx = Math.abs(dx);
  const adz = Math.abs(dz);
  const sx = Math.sign(dx);
  const sz = Math.sign(dz);
  const xMajor = adx >= adz;
  const major = xMajor ? adx : adz;
  const minor = xMajor ? adz : adx;
  const out: Cell[] = [];

  if (minor <= 1 || minor * 4 <= major) {
    // straight line along the dominant axis (end projected onto it)
    for (let i = 0; i <= major; i++) out.push(xMajor ? { x: x0 + sx * i, z: z0 } : { x: x0, z: z0 + sz * i });
    return out;
  }

  // L-shape: dominant leg first, then the other leg (corner shared)
  if (xMajor) {
    for (let i = 0; i <= adx; i++) out.push({ x: x0 + sx * i, z: z0 });
    for (let i = 1; i <= adz; i++) out.push({ x: x1, z: z0 + sz * i });
  } else {
    for (let i = 0; i <= adz; i++) out.push({ x: x0, z: z0 + sz * i });
    for (let i = 1; i <= adx; i++) out.push({ x: x0 + sx * i, z: z1 });
  }
  return out;
}

/** A blueprint part after layout rotation, with its rotated footprint size. */
export interface LayoutPart {
  def: string;
  dx: number;
  dz: number;
  rot: Rot;
  tier: number;
  /** Footprint in cells after the part's own rotation. */
  w: number;
  h: number;
}

export interface Layout {
  parts: LayoutPart[];
  /** Bounding size of the whole layout in cells. */
  w: number;
  h: number;
}

/**
 * Rotate a blueprint layout by `rot` quarter turns. One step equals +90° about +Y (three.js
 * `rotation.y = rot·π/2`), which maps a point (x, z) to (z, −x): the same direction a building's own
 * `rot` turns, so every part's `rot` advances by one per step and stays consistent with the layout.
 * Offsets are re-normalised so the layout's min corner stays at (0, 0).
 */
export function rotateLayout(parts: Blueprint['parts'], sizeOf: (def: string) => [number, number], rot: number): Layout {
  let w = 0;
  let h = 0;
  let list: LayoutPart[] = parts.map((p) => {
    const [pw, ph] = rotatedSize(sizeOf(p.def), p.rot);
    return { def: p.def, dx: p.dx, dz: p.dz, rot: p.rot, tier: p.tier, w: pw, h: ph };
  });
  // normalise (saved blueprints already start at 0,0 — be tolerant of hand-edited ones)
  let minX = Infinity;
  let minZ = Infinity;
  for (const p of list) {
    minX = Math.min(minX, p.dx);
    minZ = Math.min(minZ, p.dz);
  }
  if (!list.length) return { parts: [], w: 0, h: 0 };
  for (const p of list) {
    p.dx -= minX;
    p.dz -= minZ;
    w = Math.max(w, p.dx + p.w);
    h = Math.max(h, p.dz + p.h);
  }

  const steps = ((rot % 4) + 4) % 4;
  for (let s = 0; s < steps; s++) {
    list = list.map((p) => ({
      ...p,
      dx: p.dz,
      dz: w - p.dx - p.w,
      w: p.h,
      h: p.w,
      rot: ((p.rot + 1) % 4) as Rot,
    }));
    const t = w;
    w = h;
    h = t;
  }
  return { parts: list, w, h };
}
