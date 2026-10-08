/**
 * Structure pieces (floor / wall / door / window / fence / gate / pillar / platform / stairs / roof)
 * as tier-styled procedural geometry. Walls and fences are split into a centre "core" (post) and an
 * "arm" reaching to the cell edge so neighbouring pieces visually connect; isolated pieces and
 * build ghosts use the "full" variant.
 *
 * All geometry is centred on the cell (XZ) with the ground at y = 0. Cells are CELL (2) units.
 *
 * Tiling rules (pieces are built by the hundreds, so they stay cheap — ≤ ~1.5× the plain versions):
 *  - an arm spans x = 0.3 .. 1.0 and meets the neighbour's mirrored arm at x = 1.0, so surface detail
 *    is either continuous along X (plank rows, bands, stripes) or symmetric about the cell edge
 *    (half merlons / half blocks that merge into one across the join);
 *  - rivets are 12-tri studs, never spheres; glow strips use SLOT_GLOW so rooms light up at night.
 */
import * as THREE from 'three';
import { GeoBuilder, SLOT_GLASS, SLOT_GLOW } from '../core/GeoBuilder';
import type { TierStyle } from '../core/palette';

export const WALL_H = 3.0;
export const FLOOR_TOP = 0.16;
export const ROOF_Y = WALL_H + 0.3;

export type PieceGeoKey =
  | 'wall_core'
  | 'wall_arm'
  | 'wall_full'
  | 'door'
  | 'window'
  | 'gate'
  | 'fence_core'
  | 'fence_arm'
  | 'fence_full'
  | 'pillar'
  | 'floor'
  | 'platform'
  | 'stairs'
  | 'roof_tile'
  | 'scaffold';

const cache = new Map<string, THREE.BufferGeometry>();

export function pieceGeometry(key: PieceGeoKey, s: TierStyle): THREE.BufferGeometry {
  const ck = `${key}|${s.index}${s.look ? '|' + s.look : ''}`;
  let g = cache.get(ck);
  if (g) return g;
  const b = new GeoBuilder(s.index * 31 + key.length);
  BUILDERS[key](b, s);
  // scaffolds are see-through frames and roof tiles float at ROOF_Y: no ground contact to bake
  g = b.build(key === 'scaffold' ? false : key === 'roof_tile' ? { ground: false, strength: 0.4 } : true);
  cache.set(ck, g);
  return g;
}

/** Ghost/full geometry for a piece kind. */
export function pieceFullKey(piece: string): PieceGeoKey {
  switch (piece) {
    case 'wall': return 'wall_full';
    case 'door': return 'door';
    case 'window': return 'window';
    case 'gate': return 'gate';
    case 'fence': return 'fence_full';
    case 'pillar': return 'pillar';
    case 'platform': return 'platform';
    case 'stairs': return 'stairs';
    case 'roof': return 'roof_tile';
    default: return 'floor';
  }
}

// ----------------------------------------------------------------------------------- helpers

/** Half a merlon centred on the cell edge x = `edge` (the neighbour's half completes it). */
function merlonHalf(b: GeoBuilder, x0: number, x1: number, edge: number, th: number, color: THREE.Color, h = 0.42): void {
  const w = 0.17;
  const cx = edge > (x0 + x1) / 2 ? edge - w / 2 : edge + w / 2;
  b.box(w, h, th + 0.04, cx, WALL_H - 0.1 + h / 2, 0, color, { shade: 0.05 });
}

/**
 * Staggered stone courses from x0 to x1: `rows` courses, even courses of ~0.4-long blocks, odd
 * courses shifted by half a block (half blocks at both ends so the pattern mirrors seamlessly).
 */
function stoneCourses(b: GeoBuilder, s: TierStyle, x0: number, x1: number, th: number, H: number, rows: number, y0 = 0): void {
  const len = x1 - x0;
  const ph = H / rows;
  const n = Math.max(1, Math.round(len / 0.45));
  const bl = len / n;
  for (let i = 0; i < rows; i++) {
    const y = y0 + ph * i + ph / 2;
    const edges: number[] = [x0];
    if (i % 2 === 0) for (let j = 1; j <= n; j++) edges.push(x0 + bl * j);
    else {
      for (let j = 0; j < n; j++) edges.push(x0 + bl * (j + 0.5));
      edges.push(x1);
    }
    for (let j = 0; j < edges.length - 1; j++) {
      const bx0 = edges[j];
      const bx1 = edges[j + 1];
      const col = (i + j) % 3 === 0 ? s.light : (i + j) % 3 === 1 ? s.base : s.dark.clone().lerp(s.base, 0.5);
      b.box(bx1 - bx0 - 0.04, ph - 0.05, th, (bx0 + bx1) / 2, y, 0, col, { shade: 0.07 });
    }
  }
}

/** A wall panel segment from x0 to x1 (along X), thickness `th` (Z), height WALL_H, tier-styled face. */
function panel(b: GeoBuilder, s: TierStyle, x0: number, x1: number, th = 0.6): void {
  const len = x1 - x0;
  const cx = (x0 + x1) / 2;
  const H = WALL_H - 0.1;
  const t = s.index;
  const edge = Math.abs(x1) > Math.abs(x0) ? x1 : x0; // the cell edge end (arms); full panels get both
  const isArm = len < 1.5;
  if (t === 0) {
    // fresh horizontal planks over a dark backing, rope lashing along the top beam
    b.box(len, H, th - 0.08, cx, H / 2, 0, s.dark);
    b.planks(len, H - 0.3, th, cx, (H - 0.3) / 2, 0, 3, s.base, s.light, 'y', 0.05);
    b.box(len, 0.3, th + 0.06, cx, H - 0.15, 0, s.trim, { shade: 0.04 });
    b.box(len, 0.06, th + 0.1, cx, H - 0.3, 0, s.stripe);
  } else if (t === 1) {
    // oiled dark planks, iron bands and a diagonal brace
    b.box(len, H, th - 0.08, cx, H / 2, 0, s.dark);
    b.planks(len, H, th, cx, H / 2, 0, 4, s.base, s.dark.clone().lerp(s.base, 0.4), 'y', 0.05);
    b.box(len, 0.12, th + 0.1, cx, 0.55, 0, s.metal);
    b.box(len, 0.12, th + 0.1, cx, H - 0.45, 0, s.metal);
    b.box(Math.hypot(len, H - 1.0) * 0.96, 0.14, 0.1, cx, H / 2, th / 2 + 0.03, s.trim, { rz: Math.atan2(H - 1.0, len) });
  } else if (t === 2) {
    // three courses of chunky masonry with a crenellated top
    b.box(len, H, th - 0.08, cx, H / 2, 0, s.dark);
    stoneCourses(b, s, x0, x1, th, H, 3);
    if (isArm) merlonHalf(b, x0, x1, edge, th, s.light);
    else for (const e of [x0, x1]) merlonHalf(b, x0, x1, e, th, s.light);
  } else if (t === 3) {
    // riveted steel plate, rust-orange hazard band, crenellated plate top
    b.box(len, H, th, cx, H / 2, 0, s.base, { shade: 0.03 });
    b.box(len - 0.16, H - 0.6, th + 0.08, cx, H / 2 - 0.1, 0, s.light, { shade: 0.02 });
    b.box(len, 0.2, th + 0.1, cx, H - 0.5, 0, s.stripe);
    b.box(len, 0.05, th + 0.12, cx, H - 0.5, 0, s.accent, { slot: SLOT_GLOW });
    b.rivets(2, x0 + 0.1, 0.3, th / 2 + 0.04, 0, H - 1.5, 0, 0.05, s.metal, 'z');
    b.rivets(2, x1 - 0.1, 0.3, th / 2 + 0.04, 0, H - 1.5, 0, 0.05, s.metal, 'z');
    if (isArm) merlonHalf(b, x0, x1, edge, th, s.trim, 0.36);
    else for (const e of [x0, x1]) merlonHalf(b, x0, x1, e, th, s.trim, 0.36);
  } else if (t === 4) {
    // blue-silver alloy frame, white inset panel, orange safety stripe, cyan trim line
    b.box(len, H, th, cx, H / 2, 0, s.base);
    b.box(len - 0.1, H - 0.9, th + 0.1, cx, H / 2 - 0.15, 0, s.light);
    b.box(len, 0.14, th + 0.12, cx, 0.42, 0, s.stripe);
    b.box(len, 0.07, th + 0.12, cx, H - 0.28, 0, s.accent, { slot: SLOT_GLOW });
    b.rivets(1, cx, H - 0.6, th / 2 + 0.05, 0, 0, 0, 0.045, s.metal, 'z');
  } else if (t === 5) {
    // deep teal nano panel with bright cyan seams and a hex node
    b.box(len, H, th, cx, H / 2, 0, s.base);
    b.box(len - 0.14, H - 0.4, th + 0.06, cx, H / 2, 0, s.dark);
    b.box(len, 0.06, th + 0.12, cx, 0.35, 0, s.accent, { slot: SLOT_GLOW });
    b.box(len, 0.06, th + 0.12, cx, H - 0.35, 0, s.accent, { slot: SLOT_GLOW });
    b.box(0.06, H - 0.7, th + 0.12, cx, H / 2, 0, s.accent, { slot: SLOT_GLOW });
    b.shard(0.11, 0.11, cx, H / 2, th / 2 + 0.03, s.accent, { slot: SLOT_GLOW, sz: 0.5 });
  } else {
    // titanium: pearl panels, gold trim bands top and bottom, soft blue energy line
    b.box(len, H, th, cx, H / 2, 0, s.base);
    b.box(len - 0.1, H - 0.7, th + 0.08, cx, H / 2 + 0.06, 0, s.light);
    b.box(len, 0.12, th + 0.14, cx, H - 0.14, 0, s.trim);
    b.box(len, 0.22, th + 0.08, cx, 0.11, 0, s.trim);
    b.box(len - 0.3, 0.06, th + 0.14, cx, H / 2 + 0.06, 0, s.accent, { slot: SLOT_GLOW });
    b.rivets(1, cx, H - 0.42, th / 2 + 0.05, 0, 0, 0, 0.045, s.stripe, 'z');
  }
}

/** A corner post / wall core at the cell centre. */
function post(b: GeoBuilder, s: TierStyle, w = 0.8, h = WALL_H + 0.15): void {
  const t = s.index;
  if (t === 0) {
    b.cyl(w * 0.48, w * 0.55, h, 0, h / 2, 0, s.trim, 7, { shade: 0.04 });
    b.box(w * 0.9, 0.12, w * 0.9, 0, h - 0.4, 0, s.stripe, { ry: 0.3 }); // rope lashing
  } else if (t === 1) {
    b.cyl(w * 0.46, w * 0.55, h - 0.2, 0, (h - 0.2) / 2, 0, s.trim, 7, { shade: 0.04 });
    b.cone(w * 0.46, 0.4, 0, h - 0.2 + 0.2, 0, s.dark, 7); // sharpened log tip
    b.box(w + 0.1, 0.14, w + 0.1, 0, h - 0.7, 0, s.metal);
    b.box(w + 0.1, 0.14, w + 0.1, 0, 0.6, 0, s.metal);
  } else if (t === 2) {
    b.box(w, h, w, 0, h / 2, 0, s.light, { shade: 0.05 });
    b.box(w + 0.18, 0.26, w + 0.18, 0, h + 0.05, 0, s.base, { shade: 0.05 });
    b.box(w * 0.6, 0.3, w * 0.6, 0, h + 0.3, 0, s.light, { shade: 0.05 });
  } else if (t === 3) {
    b.box(w, h, w, 0, h / 2, 0, s.trim);
    b.box(w + 0.12, 0.2, w + 0.12, 0, h, 0, s.metal);
    b.box(w + 0.12, 0.18, w + 0.12, 0, 0.1, 0, s.metal);
    b.box(w + 0.04, 0.2, w + 0.04, 0, h - 0.6, 0, s.stripe);
  } else if (t === 4) {
    b.cyl(w * 0.5, w * 0.5, h, 0, h / 2, 0, s.trim, 6);
    b.cyl(w * 0.56, w * 0.56, 0.1, 0, h - 0.08, 0, s.accent, 6, { slot: SLOT_GLOW });
    b.cyl(w * 0.56, w * 0.56, 0.12, 0, 0.42, 0, s.stripe, 6);
  } else if (t === 5) {
    b.box(w, h, w, 0, h / 2, 0, s.trim);
    b.box(0.08, h - 0.4, w + 0.1, 0, h / 2, 0, s.accent, { slot: SLOT_GLOW });
    b.box(w + 0.1, h - 0.4, 0.08, 0, h / 2, 0, s.accent, { slot: SLOT_GLOW });
    b.box(w * 0.7, 0.12, w * 0.7, 0, h + 0.06, 0, s.accent, { slot: SLOT_GLOW });
  } else {
    b.box(w, h, w, 0, h / 2, 0, s.light);
    b.box(w + 0.1, 0.22, w + 0.1, 0, h + 0.05, 0, s.trim);
    b.box(w + 0.14, 0.12, w + 0.14, 0, 0.3, 0, s.trim);
    b.shard(0.18, 0.3, 0, h + 0.4, 0, s.accent, { slot: SLOT_GLOW });
  }
}

function floorSlab(b: GeoBuilder, s: TierStyle, w: number, d: number, top: number, patterned = true): void {
  const base = top - 0.46;
  const t = s.index;
  b.box(w, 0.46, d, 0, base + 0.23, 0, s.floorAlt);
  if (!patterned) return;
  if (t <= 1) {
    b.planks(w, 0.06, d - 0.06, 0, top, 0, 4, s.floor, s.floorAlt, 'x', 0.05);
  } else if (t === 2) {
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) b.box(w / 2 - 0.08, 0.06, d / 2 - 0.08, -w / 4 + (i * w) / 2, top, -d / 4 + (j * d) / 2, (i + j) % 2 ? s.floor : s.floorAlt, { shade: 0.06 });
  } else if (t === 3) {
    b.box(w - 0.12, 0.06, d - 0.12, 0, top, 0, s.floor);
    b.rivets(2, -(w / 2 - 0.22), top + 0.03, -(d / 2 - 0.22), w - 0.44, 0, 0, 0.045, s.metal, 'y');
    b.rivets(2, -(w / 2 - 0.22), top + 0.03, d / 2 - 0.22, w - 0.44, 0, 0, 0.045, s.metal, 'y');
  } else if (t === 4) {
    b.box(w - 0.1, 0.06, d - 0.1, 0, top, 0, s.floor);
    b.box(w - 0.5, 0.03, 0.08, 0, top + 0.04, 0, s.stripe);
  } else if (t === 5) {
    b.box(w - 0.1, 0.06, d - 0.1, 0, top, 0, s.floor);
    b.box(w - 0.3, 0.03, 0.05, 0, top + 0.04, 0, s.accent, { slot: SLOT_GLOW });
    b.box(0.05, 0.03, d - 0.3, 0, top + 0.04, 0, s.accent, { slot: SLOT_GLOW });
  } else {
    b.box(w - 0.08, 0.06, d - 0.08, 0, top, 0, s.floor);
    b.box(w - 0.6, 0.06, d - 0.6, 0, top + 0.02, 0, s.floorAlt);
    b.box(w - 0.5, 0.03, 0.05, 0, top + 0.06, 0, s.accent, { slot: SLOT_GLOW });
    b.box(0.05, 0.03, d - 0.5, 0, top + 0.06, 0, s.accent, { slot: SLOT_GLOW });
  }
}

/** Palisade stake (reinforced-wood fences): a squared log with a sharpened top. 20 tris. */
function stake(b: GeoBuilder, s: TierStyle, x: number, h: number, w = 0.26): void {
  b.box(w, h, w, x, h / 2, 0, s.trim, { shade: 0.05 });
  b.pyramid(w, 0.22, w, x, h, 0, s.dark);
}

/** Small lamp over a door / gate (glows at night). */
function doorLamp(b: GeoBuilder, s: TierStyle, x: number, y: number, z: number): void {
  b.box(0.16, 0.08, 0.12, x, y + 0.1, z, s.metal);
  b.box(0.14, 0.16, 0.14, x, y - 0.02, z, s.lamp, { slot: SLOT_GLOW });
}

// ----------------------------------------------------------------------------------- builders

const BUILDERS: Record<PieceGeoKey, (b: GeoBuilder, s: TierStyle) => void> = {
  wall_core: (b, s) => post(b, s),
  wall_arm: (b, s) => panel(b, s, 0.3, 1.0),
  wall_full: (b, s) => {
    panel(b, s, -1.0, 1.0);
    post(b, s, 0.7);
  },
  door: (b, s) => {
    const t = s.index;
    const th = 0.6;
    // frame posts & lintel
    b.box(0.34, WALL_H, th, -0.83, WALL_H / 2, 0, s.trim, { shade: 0.03 });
    b.box(0.34, WALL_H, th, 0.83, WALL_H / 2, 0, s.trim, { shade: 0.03 });
    b.box(2.0, WALL_H - 2.35, th, 0, WALL_H - (WALL_H - 2.35) / 2, 0, t === 2 ? s.light : s.base, { shade: 0.03 });
    if (t <= 2) {
      // plank door with iron straps and a knob
      b.planks(1.32, 2.3, 0.18, 0, 1.15, 0, 3, s.dark, s.dark.clone().multiplyScalar(0.85), 'x', 0.03);
      b.box(1.2, 0.1, 0.22, 0, 0.6, 0, s.metal);
      b.box(1.2, 0.1, 0.22, 0, 1.7, 0, s.metal);
      b.box(0.1, 0.1, 0.1, 0.45, 1.15, 0.13, t === 2 ? s.stripe : s.metal, { ry: Math.PI / 4 });
      doorLamp(b, s, -0.55, 2.5, th / 2 + 0.08);
    } else {
      // sliding tech door with a glowing seam and hazard stripes
      b.box(0.62, 2.3, 0.2, -0.34, 1.15, 0, s.machine);
      b.box(0.62, 2.3, 0.2, 0.34, 1.15, 0, s.machine);
      b.box(0.06, 2.1, 0.26, 0, 1.15, 0, s.accent, { slot: SLOT_GLOW });
      b.box(1.3, 0.06, 0.26, 0, 2.28, 0, s.accent, { slot: SLOT_GLOW });
      b.stripes(1.3, 0.12, 0.24, 0, 0.4, 0, 3, s.stripe, s.machineDark, 'x');
      b.box(0.14, 0.14, 0.14, 0.75, 2.6, th / 2 + 0.02, t >= 5 ? s.accent : s.lamp, { slot: SLOT_GLOW, ry: Math.PI / 4 });
    }
  },
  window: (b, s) => {
    const t = s.index;
    const th = 0.6;
    panel(b, s, -1.0, 1.0);
    // cut-in: frame + glass slightly proud of the wall, tier-styled mullions / sill
    b.box(1.3, 1.2, th + 0.16, 0, 1.75, 0, s.trim);
    b.box(1.1, 1.0, th + 0.2, 0, 1.75, 0, '#ffffff', { slot: SLOT_GLASS });
    if (t <= 2) {
      b.box(0.08, 1.0, th + 0.24, 0, 1.75, 0, s.trim);
      b.box(1.1, 0.08, th + 0.24, 0, 1.75, 0, s.trim);
      b.box(1.4, 0.1, th + 0.3, 0, 1.1, 0, s.trim, { shade: 0.03 }); // sill
    } else {
      b.box(1.1, 0.05, th + 0.24, 0, 1.75, 0, t === 3 ? s.stripe : s.accent, { slot: t === 3 ? 0 : SLOT_GLOW });
    }
  },
  gate: (b, s) => {
    const t = s.index;
    const H = WALL_H + 0.5;
    b.box(0.46, H, 0.7, -0.85, H / 2, 0, s.trim, { shade: 0.03 });
    b.box(0.46, H, 0.7, 0.85, H / 2, 0, s.trim, { shade: 0.03 });
    b.box(2.0, 0.42, 0.78, 0, H - 0.2, 0, t >= 2 ? s.base : s.trim, { shade: 0.03 });
    if (t <= 1) {
      // plank gate with iron straps and a banner
      b.planks(1.3, H - 0.6, 0.16, 0, (H - 0.6) / 2, 0, 5, s.dark, s.base, 'x', 0.03);
      b.box(1.3, 0.12, 0.22, 0, 1.0, 0, s.metal);
      b.box(1.3, 0.12, 0.22, 0, 2.4, 0, s.metal);
      b.box(0.5, 0.7, 0.06, 0, H + 0.1, 0.42, s.stripe, { shade: 0.04 });
    } else if (t === 2) {
      // portcullis bars, merlons on the lintel, banner
      for (let i = 0; i < 5; i++) b.box(0.1, H - 0.7, 0.1, -0.56 + i * 0.28, (H - 0.7) / 2, 0, s.metal);
      b.box(1.3, 0.1, 0.14, 0, 1.4, 0, s.metal);
      b.box(1.3, 0.1, 0.14, 0, 2.5, 0, s.metal);
      for (const mx of [-0.85, 0.85]) b.box(0.4, 0.36, 0.74, mx, H + 0.18, 0, s.light, { shade: 0.05 });
      b.box(0.5, 0.7, 0.06, 0, H - 0.4, 0.44, s.stripe, { shade: 0.04 });
    } else {
      // blast door halves with hazard stripes, glowing seam and lamps
      b.box(0.62, H - 0.8, 0.22, -0.34, (H - 0.8) / 2, 0, s.machine);
      b.box(0.62, H - 0.8, 0.22, 0.34, (H - 0.8) / 2, 0, s.machine);
      b.box(0.08, H - 1.0, 0.3, 0, (H - 0.8) / 2, 0, s.accent, { slot: SLOT_GLOW });
      b.box(1.3, 0.1, 0.9, 0, H - 0.05, 0, s.accent, { slot: SLOT_GLOW });
      b.stripes(1.3, 0.16, 0.26, 0, 0.5, 0, 3, s.stripe, s.machineDark, 'x');
      b.stripes(1.3, 0.16, 0.26, 0, H - 1.0, 0, 3, s.stripe, s.machineDark, 'x');
      for (const sx of [-0.85, 0.85]) b.box(0.2, 0.2, 0.2, sx, H + 0.12, 0, s.lamp, { slot: SLOT_GLOW, ry: Math.PI / 4 });
    }
  },
  fence_core: (b, s) => {
    const t = s.index;
    if (t === 0) {
      b.cyl(0.14, 0.17, 1.3, 0, 0.65, 0, s.trim, 6);
      b.box(0.3, 0.08, 0.3, 0, 1.33, 0, s.dark);
    } else if (t === 1) {
      stake(b, s, 0, 1.45, 0.3);
    } else {
      b.box(0.26, 1.3, 0.26, 0, 0.65, 0, s.trim);
      if (t >= 3) b.box(0.16, 0.16, 0.16, 0, 1.4, 0, s.accent, { slot: SLOT_GLOW, ry: Math.PI / 4 });
      else b.box(0.3, 0.08, 0.3, 0, 1.33, 0, s.base);
    }
  },
  fence_arm: (b, s) => {
    const t = s.index;
    if (t === 0) {
      b.box(0.72, 0.1, 0.1, 0.64, 0.5, 0, s.base);
      b.box(0.72, 0.1, 0.1, 0.64, 1.0, 0, s.base);
      b.box(0.1, 0.9, 0.08, 0.66, 0.5, 0.06, s.light); // picket
    } else if (t === 1) {
      // palisade: two stakes per arm (the outer one meets the neighbour's flush at the cell edge)
      stake(b, s, 0.53, 1.25);
      stake(b, s, 0.87, 1.35);
    } else if (t === 2) {
      b.box(0.72, 0.1, 0.1, 0.64, 0.5, 0, s.trim);
      b.box(0.72, 0.1, 0.1, 0.64, 1.0, 0, s.trim);
    } else {
      b.box(0.72, 0.08, 0.08, 0.64, 0.4, 0, s.metal);
      b.box(0.72, 0.05, 0.05, 0.64, 0.8, 0, s.accent, { slot: SLOT_GLOW });
      b.box(0.72, 0.05, 0.05, 0.64, 1.1, 0, s.accent, { slot: SLOT_GLOW });
    }
  },
  fence_full: (b, s) => {
    BUILDERS.fence_core(b, s);
    const t = s.index;
    if (t === 0) {
      b.box(2.0, 0.1, 0.1, 0, 0.5, 0, s.base);
      b.box(2.0, 0.1, 0.1, 0, 1.0, 0, s.base);
      for (const x of [-0.66, 0.66]) b.box(0.1, 0.9, 0.08, x, 0.5, 0.06, s.light);
    } else if (t === 1) {
      for (const x of [-0.87, -0.53, 0.53, 0.87]) stake(b, s, x, Math.abs(x) > 0.7 ? 1.35 : 1.25);
    } else if (t === 2) {
      b.box(2.0, 0.1, 0.1, 0, 0.5, 0, s.trim);
      b.box(2.0, 0.1, 0.1, 0, 1.0, 0, s.trim);
    } else {
      b.box(2.0, 0.08, 0.08, 0, 0.4, 0, s.metal);
      b.box(2.0, 0.05, 0.05, 0, 0.8, 0, s.accent, { slot: SLOT_GLOW });
      b.box(2.0, 0.05, 0.05, 0, 1.1, 0, s.accent, { slot: SLOT_GLOW });
    }
  },
  pillar: (b, s) => {
    post(b, s, 0.9, WALL_H + 0.4);
    b.box(1.3, 0.25, 1.3, 0, 0.12, 0, s.index === 2 ? s.base : s.trim, { shade: 0.03 });
  },
  floor: (b, s) => floorSlab(b, s, 2, 2, FLOOR_TOP),
  platform: (b, s) => {
    floorSlab(b, s, 2, 2, 1.0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.22, 0.6, 0.22, sx * 0.8, 0.3, sz * 0.8, s.trim);
  },
  stairs: (b, s) => {
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      const h = ((i + 1) / steps) * 1.0;
      b.box(2 / steps, h, 2, -1 + (2 / steps) * (i + 0.5), h / 2, 0, i % 2 ? s.floor : s.floorAlt, { shade: 0.03 });
    }
    b.box(0.1, 1.5, 2, -1 + 0.05, 0.75, 0, s.trim);
    // handrail along one side
    b.box(1.6, 0.08, 0.08, 0, 1.45, 0.92, s.index >= 3 ? s.metal : s.trim, { rz: -0.46 });
    b.box(0.08, 0.6, 0.08, 0.78, 1.5, 0.92, s.index >= 3 ? s.metal : s.trim);
  },
  roof_tile: (b, s) => {
    const t = s.index;
    const y = ROOF_Y + 0.11;
    if (t === 0) {
      // canvas / plank sheets over battens, rope at the seam
      b.planks(2.1, 0.2, 2.1, 0, y, 0, 3, s.roof, s.roof.clone().multiplyScalar(0.92), 'z', 0.02, 0.04);
      b.box(2.1, 0.06, 0.1, 0, y + 0.15, 0, s.stripe);
    } else if (t === 1) {
      // dark overlapping planks with an iron strap
      b.planks(2.1, 0.2, 2.1, 0, y, 0, 3, s.roof, s.roofEdge, 'z', 0.02, 0.04);
      b.box(2.1, 0.06, 0.12, 0, y + 0.15, 0.35, s.metal);
    } else if (t === 2) {
      // slate slabs
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) b.box(1.0, 0.22, 1.0, -0.52 + i * 1.04, y + ((i + j) % 2) * 0.03, -0.52 + j * 1.04, (i + j) % 2 ? s.roof : s.roofEdge, { shade: 0.06 });
      b.box(0.3, 0.1, 0.3, 0, y + 0.16, 0, s.roof.clone().lerp(s.light, 0.3), { shade: 0.05 });
    } else if (t === 3) {
      // riveted plate with a dark frame and a rust stripe
      b.box(2.1, 0.22, 2.1, 0, y, 0, s.roof, { shade: 0.015 });
      b.box(2.1, 0.05, 0.1, 0, y + 0.13, 1.0, s.roofEdge);
      b.box(2.1, 0.05, 0.1, 0, y + 0.13, -1.0, s.roofEdge);
      b.box(0.1, 0.05, 2.1, 1.0, y + 0.13, 0, s.roofEdge);
      b.box(0.1, 0.05, 2.1, -1.0, y + 0.13, 0, s.roofEdge);
      b.box(0.6, 0.04, 0.14, 0.45, y + 0.13, -0.55, s.stripe); // small hazard tab (a full bar turns big roofs into a stripe grid)
      b.rivets(2, -0.8, y + 0.13, -0.8, 1.6, 0, 0, 0.05, s.metal, 'y');
      b.rivets(2, -0.8, y + 0.13, 0.8, 1.6, 0, 0, 0.05, s.metal, 'y');
    } else if (t === 4) {
      b.box(2.1, 0.22, 2.1, 0, y, 0, s.roof, { shade: 0.01 });
      b.box(1.7, 0.04, 1.7, 0, y + 0.13, 0, s.light);
      b.box(1.5, 0.03, 0.06, 0, y + 0.16, 0, s.accent, { slot: SLOT_GLOW });
      b.box(0.3, 0.03, 0.7, 0.7, y + 0.16, -0.5, s.stripe); // orange tab
    } else if (t === 5) {
      b.box(2.1, 0.22, 2.1, 0, y, 0, s.roof, { shade: 0.01 });
      b.box(2.1, 0.03, 0.06, 0, y + 0.13, 1.0, s.accent, { slot: SLOT_GLOW });
      b.box(0.06, 0.03, 2.1, 1.0, y + 0.13, 0, s.accent, { slot: SLOT_GLOW });
      b.shard(0.12, 0.08, 0, y + 0.14, 0, s.accent, { slot: SLOT_GLOW });
    } else {
      b.box(2.1, 0.22, 2.1, 0, y, 0, s.roof, { shade: 0.005 });
      b.box(1.6, 0.04, 1.6, 0, y + 0.13, 0, s.light);
      b.box(1.7, 0.03, 0.06, 0, y + 0.15, 0.82, s.trim);
      b.box(1.4, 0.03, 0.06, 0, y + 0.16, 0, s.accent, { slot: SLOT_GLOW });
      b.box(0.06, 0.03, 1.4, 0, y + 0.16, 0, s.accent, { slot: SLOT_GLOW });
    }
  },
  scaffold: (b, s) => {
    const c = s.index <= 2 ? '#c9a46a' : '#e6b84a';
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.1, 3.2, 0.1, sx * 0.92, 1.6, sz * 0.92, c);
    for (const y of [1.2, 2.6]) {
      b.box(1.9, 0.07, 0.07, 0, y, -0.92, c);
      b.box(1.9, 0.07, 0.07, 0, y, 0.92, c);
      b.box(0.07, 0.07, 1.9, -0.92, y, 0, c);
      b.box(0.07, 0.07, 1.9, 0.92, y, 0, c);
    }
  },
};
