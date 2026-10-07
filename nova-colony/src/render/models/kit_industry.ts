/**
 * kit_industry — shared low-poly building blocks for the industry models (power, production,
 * crafting, research, utility, decor): tier-styled sheds, smokestacks and furnace mouths, pipes,
 * gauges, hazard stripes, rivets and small props (barrels, crates, logs, tools, lanterns).
 * Pure geometry helpers over GeoBuilder / ModelCtx — nothing is registered here.
 *
 * Tier language (mirrors the tier illustrations):
 *   0–1 timber + rope · 2 stone + timber · 3 riveted steel, rust-orange trims · 4 blue-silver panels,
 *   orange accents · 5 dark teal, glowing cyan edge lines · 6 pearl white, gold trims, soft blue glow.
 */
import * as THREE from 'three';
import { GeoBuilder, SLOT_GLASS, SLOT_GLOW } from '../core/GeoBuilder';
import type { TierStyle } from '../core/palette';
import type { ModelCtx } from './spec';
import { WOOD, WOOD_DARK, FIRE_GLOW } from './colors';

// ------------------------------------------------------------------------- material constants
// Natural materials and paint colours only — tier colours come from the palette slots.
export const IRON = '#aeb9c7';
export const DARK = '#1a1612';
export const RUST = '#b85a2c';
export const HAZARD = '#f2c230';
export const HAZARD_DARK = '#2b2b30';
export const SAFETY_RED = '#c43b2a';
export const GOLD = '#e8c060';
export const ALLOY_ORANGE = '#ff9a3d';
export const STONE = '#8e8a82';
export const STONE_LIGHT = '#aaa69e';
export const STONE_DARK = '#67635c';
export const BRICK = '#8e5a48';
export const BRICK_DARK = '#6a4234';
export const SAWDUST = '#d9c89a';
export const PAPER = '#fff7e0';
export const GREEN_LED = '#7cff6a';
export const RED_LED = '#ff4d5e';
export const BLUE_LED = '#58d0ff';
export const MOLTEN = '#ffb15c';
export const EMBER = '#ffe08a';
export const FLOWERS = ['#ff6f91', '#ffd84a', '#ff9e5e', '#b48cff', '#5ef2ff', '#ffffff'];

// ------------------------------------------------------------------------- tier helpers

/** Warm trim / stripe colour per tier: gold rope on timber, rust-orange on steel, orange on alloy, cyan on nano, gold on titanium. */
export function stripeColor(s: TierStyle): THREE.ColorRepresentation {
  if (s.index === 4) return ALLOY_ORANGE;
  if (s.index === 6) return GOLD;
  return s.accent;
}

/** Powered tiers (steel and up) have glowing accents; earlier tiers keep them as paint. */
export const glows = (s: TierStyle): boolean => s.index >= 3;

/** Glow slot for accents that should only light up from steel onwards. */
export const accentSlot = (s: TierStyle): number => (s.index >= 3 ? SLOT_GLOW : 0);

/** Structural frame material: dark timber, dark stone, then the tier trim. */
export function frameColor(s: TierStyle): THREE.ColorRepresentation {
  return s.index <= 1 ? WOOD_DARK : s.index === 2 ? STONE_DARK : s.trim;
}

/** Post / beam material: timber, then tier trim, then tier metal. */
export function postColor(s: TierStyle): THREE.ColorRepresentation {
  return s.index <= 1 ? WOOD : s.index === 2 ? s.trim : s.metal;
}

/** Work-surface material (bench tops, decks). */
export function deckColor(s: TierStyle): THREE.ColorRepresentation {
  return s.index <= 1 ? WOOD : s.index === 2 ? STONE_LIGHT : s.index === 6 ? s.light : s.trim;
}

const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _up = new THREE.Vector3(0, 1, 0);

/** Rotate a local XZ offset by a yaw. */
export function yawXZ(ry: number, lx: number, lz: number): [number, number] {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  return [lx * c + lz * s, -lx * s + lz * c];
}

// ------------------------------------------------------------------------- pipes & fittings

/** Straight pipe between two points (any direction), optional ball joints at both ends. */
export function pipe(b: GeoBuilder, color: THREE.ColorRepresentation, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, r = 0.08, seg = 6, joints = false): void {
  _dir.set(x2 - x1, y2 - y1, z2 - z1);
  const len = _dir.length();
  if (len < 1e-4) return;
  _dir.divideScalar(len);
  _q.setFromUnitVectors(_up, _dir);
  _e.setFromQuaternion(_q, 'XYZ');
  b.cyl(r, r, len, (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2, color, seg, { rx: _e.x, ry: _e.y, rz: _e.z });
  if (joints) {
    b.sphere(r * 1.35, x1, y1, z1, color, 4);
    b.sphere(r * 1.35, x2, y2, z2, color, 4);
  }
}

/** Polyline pipe run `[x,y,z, x,y,z, ...]` with elbow balls at the interior joints. */
export function pipeRun(b: GeoBuilder, color: THREE.ColorRepresentation, pts: number[], r = 0.08, seg = 6): void {
  const n = pts.length / 3;
  for (let i = 0; i < n - 1; i++) {
    pipe(b, color, pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2], pts[i * 3 + 3], pts[i * 3 + 4], pts[i * 3 + 5], r, seg);
    if (i > 0) b.sphere(r * 1.35, pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2], color, 4);
  }
}

/** Hand-wheel valve on a stem, wheel facing +Z (rotated by `ry`). */
export function valve(b: GeoBuilder, x: number, y: number, z: number, color: THREE.ColorRepresentation, ry = 0, r = 0.16): void {
  const [dx, dz] = yawXZ(ry, 0, 0.1);
  b.cyl(0.04, 0.04, 0.2, x + dx, y, z + dz, IRON, 4, { rx: Math.PI / 2, ry });
  b.cyl(r, r, 0.05, x + dx * 2, y, z + dz * 2, color, 8, { rx: Math.PI / 2, ry });
  b.box(r * 1.6, 0.04, 0.04, x + dx * 2.2, y, z + dz * 2.2, IRON, { ry });
  b.box(0.04, r * 1.6, 0.04, x + dx * 2.2, y, z + dz * 2.2, IRON, { ry });
}

/** Round pressure gauge facing +Z (rotated by `ry`): rim, white face, red needle. */
export function gauge(b: GeoBuilder, x: number, y: number, z: number, ry = 0, r = 0.14): void {
  const [dx, dz] = yawXZ(ry, 0, 0.03);
  b.cyl(r, r, 0.06, x, y, z, '#3a3f47', 8, { rx: Math.PI / 2, ry });
  b.cyl(r * 0.78, r * 0.78, 0.04, x + dx, y, z + dz, PAPER, 8, { rx: Math.PI / 2, ry });
  b.box(0.03, r * 0.7, 0.03, x + dx * 1.6, y + r * 0.2, z + dz * 1.6, SAFETY_RED, { ry, rz: 0.6 });
}

/** Hazard stripes: `n` alternating yellow / dark blocks along a length `len`, facing +Z (rotated by `ry`). */
export function stripes(b: GeoBuilder, x: number, y: number, z: number, len: number, h: number, n = 6, ry = 0, th = 0.05): void {
  const sw = len / n;
  for (let i = 0; i < n; i++) {
    const lx = -len / 2 + sw * (i + 0.5);
    const [dx, dz] = yawXZ(ry, lx, 0);
    b.box(sw, h, th, x + dx, y, z + dz, i % 2 ? HAZARD_DARK : HAZARD, { ry });
  }
}

/** Row of `n` rivet heads along a line from (x0,y0,z0) to (x1,y1,z1). */
export function rivets(b: GeoBuilder, color: THREE.ColorRepresentation, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, n = 4, size = 0.07): void {
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0.5 : i / (n - 1);
    b.box(size, size, size, x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, z0 + (z1 - z0) * u, color);
  }
}

/** Louvred vent: dark backing plus 3 slats, facing +Z (rotated by `ry`). */
export function vent(b: GeoBuilder, x: number, y: number, z: number, w: number, h: number, color: THREE.ColorRepresentation, ry = 0): void {
  b.box(w, h, 0.05, x, y, z, DARK, { ry });
  const [dx, dz] = yawXZ(ry, 0, 0.03);
  for (let i = 0; i < 3; i++) b.box(w - 0.06, 0.04, 0.05, x + dx, y - h / 2 + (h * (i + 0.5)) / 3, z + dz, color, { ry, rx: 0.5 });
}

/** Glowing screen with a dark bezel, facing +Z (rotated by `ry`), tilted back by `tilt`. */
export function screen(b: GeoBuilder, x: number, y: number, z: number, w: number, h: number, color: THREE.ColorRepresentation, ry = 0, tilt = 0): void {
  b.box(w + 0.1, h + 0.1, 0.06, x, y, z, '#23262d', { ry, rx: tilt });
  const [dx, dz] = yawXZ(ry, 0, 0.035);
  b.box(w, h, 0.04, x + dx, y, z + dz, color, { ry, rx: tilt, slot: SLOT_GLOW });
}

/** Small status light (glow cube). */
export function led(b: GeoBuilder, x: number, y: number, z: number, color: THREE.ColorRepresentation, size = 0.1): void {
  b.box(size, size, size, x, y, z, color, { slot: SLOT_GLOW });
}

/** Thin glowing ring lying flat (seg x 4 torus). */
export function glowRing(b: GeoBuilder, r: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, seg = 12, tube = 0.05): void {
  b.torus(r, tube, x, y, z, color, seg, 4, { rx: Math.PI / 2, slot: SLOT_GLOW });
}

/** Parabolic dish (shallow cone) with feed arm and tip, pointing up and tilted back by `tilt`, facing +Z. */
export function dish(b: GeoBuilder, x: number, y: number, z: number, r: number, tilt: number, color: THREE.ColorRepresentation, tipColor: THREE.ColorRepresentation = RED_LED): void {
  b.cyl(r, r * 0.25, r * 0.4, x, y, z, color, 10, { rx: -tilt });
  b.cyl(0.03, 0.03, r * 0.9, x, y + Math.cos(tilt) * r * 0.45, z + Math.sin(tilt) * r * 0.45, IRON, 4, { rx: -tilt });
  b.sphere(0.07, x, y + Math.cos(tilt) * r * 0.9, z + Math.sin(tilt) * r * 0.9, tipColor, 4, { slot: SLOT_GLOW });
}

// ------------------------------------------------------------------------- props

/** Barrel / drum with two bands, standing upright. */
export function barrel(b: GeoBuilder, x: number, y: number, z: number, color: THREE.ColorRepresentation, band: THREE.ColorRepresentation, r = 0.3, h = 0.72): void {
  b.cyl(r, r * 0.94, h, x, y + h / 2, z, color, 7, { shade: 0.03 });
  b.cyl(r * 1.04, r * 1.04, 0.07, x, y + h * 0.28, z, band, 7);
  b.cyl(r * 1.04, r * 1.04, 0.07, x, y + h * 0.74, z, band, 7);
}

/** Crate with two edge bands, slightly rotated. */
export function crate(b: GeoBuilder, x: number, y: number, z: number, size: number, color: THREE.ColorRepresentation, edge: THREE.ColorRepresentation, ry = 0): void {
  b.box(size, size, size, x, y + size / 2, z, color, { ry, shade: 0.05 });
  b.box(size + 0.04, 0.08, 0.1, x, y + size / 2, z, edge, { ry });
  b.box(0.1, 0.08, size + 0.04, x, y + size / 2, z, edge, { ry });
}

/** Lumpy sack. */
export function sack(b: GeoBuilder, x: number, y: number, z: number, color: THREE.ColorRepresentation = '#d7c5a0'): void {
  b.sphere(0.27, x, y + 0.22, z, color, 5, { sy: 0.8, shade: 0.05 });
}

/** Stacked log pile (pyramid of `rows` rows, logs along X or Z). */
export function logPile(b: GeoBuilder, x: number, y: number, z: number, len: number, rows: number, alongZ = false, r = 0.19): void {
  for (let row = 0; row < rows; row++) {
    const n = rows - row;
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * r * 2.1;
      const yy = y + r + row * r * 1.75;
      const col = (i + row) % 2 ? WOOD : WOOD_DARK;
      if (alongZ) b.cyl(r, r, len, x + off, yy, z, col, 5, { rx: Math.PI / 2, shade: 0.04 });
      else b.cyl(r, r, len, x, yy, z + off, col, 5, { rz: Math.PI / 2, shade: 0.04 });
    }
  }
}

/** Tree stump / chopping block. */
export function stump(b: GeoBuilder, x: number, y: number, z: number, r = 0.3, h = 0.5): void {
  b.cyl(r, r * 1.1, h, x, y + h / 2, z, WOOD_DARK, 7, { shade: 0.04 });
  b.cyl(r * 0.85, r * 0.85, 0.04, x, y + h + 0.01, z, '#c9a06a', 7);
}

/** Axe: handle + head, leaning/rotated via rz and ry. */
export function axe(b: GeoBuilder, x: number, y: number, z: number, ry = 0, rz = 0.45, len = 0.75): void {
  b.box(0.06, len, 0.06, x, y, z, WOOD, { ry, rz });
  const hx = Math.sin(-rz) * len * 0.42;
  const hy = Math.cos(rz) * len * 0.42;
  const [dx, dz] = yawXZ(ry, hx, 0);
  b.box(0.3, 0.18, 0.06, x + dx, y + hy, z + dz, IRON, { ry, rz });
}

/** Hammer lying flat (handle along +X), rotated by `ry`. */
export function hammer(b: GeoBuilder, x: number, y: number, z: number, ry = 0): void {
  b.box(0.5, 0.05, 0.05, x, y, z, WOOD, { ry });
  const [dx, dz] = yawXZ(ry, 0.26, 0);
  b.box(0.12, 0.12, 0.22, x + dx, y + 0.04, z + dz, IRON, { ry });
}

/** Hand saw lying flat (blade along +X). */
export function saw(b: GeoBuilder, x: number, y: number, z: number, ry = 0): void {
  b.box(0.6, 0.03, 0.14, x, y, z, IRON, { ry });
  const [dx, dz] = yawXZ(ry, -0.36, 0.02);
  b.box(0.16, 0.06, 0.18, x + dx, y, z + dz, WOOD_DARK, { ry });
}

/** Blacksmith anvil (base, body, horn) pointing +X, rotated by `ry`. */
export function anvil(b: GeoBuilder, x: number, y: number, z: number, ry = 0, color: THREE.ColorRepresentation = '#5a5753'): void {
  b.box(0.3, 0.3, 0.26, x, y + 0.15, z, color, { ry });
  b.box(0.5, 0.2, 0.3, x, y + 0.4, z, IRON, { ry });
  const [dx, dz] = yawXZ(ry, 0.36, 0);
  b.cone(0.1, 0.3, x + dx, y + 0.4, z + dz, IRON, 5, { ry, rz: -Math.PI / 2 });
}

/** Hanging lantern (glass cube, metal cap and ring); warm glow. */
export function lantern(b: GeoBuilder, x: number, y: number, z: number, cap: THREE.ColorRepresentation, size = 0.26): void {
  b.box(size, size, size, x, y, z, '#ffd27a', { slot: SLOT_GLOW });
  b.pyramid(size + 0.12, 0.12, size + 0.12, x, y + size / 2, z, cap);
  b.box(0.04, 0.12, 0.04, x, y + size / 2 + 0.17, z, cap);
}

/** Medical cross, facing +Z (rotated by `ry`). */
export function cross(b: GeoBuilder, x: number, y: number, z: number, size: number, th: number, color: THREE.ColorRepresentation, ry = 0, depth = 0.1): void {
  b.box(size, th, depth, x, y, z, color, { ry, slot: SLOT_GLOW });
  b.box(th, size, depth, x, y, z, color, { ry, slot: SLOT_GLOW });
}

/** Lab vial: glass tube with glowing liquid and a dark cap. */
export function vial(b: GeoBuilder, x: number, y: number, z: number, r: number, h: number, liquid: THREE.ColorRepresentation): void {
  b.cyl(r, r, h, x, y + h / 2, z, '#ffffff', 6, { slot: SLOT_GLASS });
  b.cyl(r * 0.8, r * 0.8, h * 0.55, x, y + h * 0.3, z, liquid, 6, { slot: SLOT_GLOW });
  b.cyl(r * 1.1, r * 1.1, 0.06, x, y + h + 0.02, z, '#2a2d34', 6);
}

/** Simple flower: stem + octahedron head. */
export function flower(b: GeoBuilder, x: number, z: number, h: number, color: THREE.ColorRepresentation, headR = 0.12): void {
  b.box(0.04, h, 0.04, x, h / 2, z, '#5d8f3c');
  b.shard(headR, headR * 0.9, x, h + headR * 0.3, z, color);
}

/** Small bush / leaf blob. */
export function bush(b: GeoBuilder, x: number, y: number, z: number, r: number, color: THREE.ColorRepresentation): void {
  b.sphere(r, x, y, z, color, 5, { sy: 0.75, shade: 0.05 });
}

// ------------------------------------------------------------------------- architecture

/** Window pane with a frame, facing +Z (rotated by `ry`). */
export function windowPane(b: GeoBuilder, s: TierStyle, x: number, y: number, z: number, w: number, h: number, ry = 0): void {
  b.box(w + 0.14, h + 0.14, 0.06, x, y, z, frameColor(s), { ry });
  const [dx, dz] = yawXZ(ry, 0, 0.03);
  b.box(w, h, 0.08, x + dx, y, z + dz, '#ffffff', { ry, slot: SLOT_GLASS });
}

export interface DoorOpts {
  /** Hazard stripes across the lintel. */
  hazard?: boolean;
  /** Raised roller shutter above the opening. */
  shutter?: boolean;
  /** Interior colour (default unlit dark). */
  inner?: THREE.ColorRepresentation;
}

/** Doorway on a +Z wall face at (x, 0, z): dark opening, frame posts, lintel (glowing from steel). */
export function doorway(b: GeoBuilder, s: TierStyle, x: number, z: number, w: number, h: number, o: DoorOpts = {}, ry = 0): void {
  const frame = frameColor(s);
  const [dx, dz] = yawXZ(ry, 0, 0.04);
  b.box(w, h, 0.12, x + dx, h / 2, z + dz, o.inner ?? DARK, { ry });
  for (const sx of [-1, 1]) {
    const [px, pz] = yawXZ(ry, sx * (w / 2 + 0.08), 0.05);
    b.box(0.16, h + 0.12, 0.18, x + px, (h + 0.12) / 2, z + pz, frame, { ry });
  }
  const [lx, lz] = yawXZ(ry, 0, 0.06);
  b.box(w + 0.32, 0.18, 0.2, x + lx, h + 0.1, z + lz, frame, { ry });
  if (o.hazard) stripes(b, x + lx * 2.2, h + 0.1, z + lz * 2.2, w + 0.2, 0.12, Math.max(4, Math.round(w * 3)), ry);
  else if (glows(s)) b.box(w - 0.1, 0.06, 0.08, x + lx * 2.5, h + 0.03, z + lz * 2.5, s.accent, { ry, slot: SLOT_GLOW });
  if (o.shutter) {
    const [sx, sz] = yawXZ(ry, 0, 0.14);
    b.box(w + 0.1, 0.34, 0.26, x + sx, h + 0.36, z + sz, s.index <= 2 ? WOOD_DARK : s.metal, { ry });
  }
}

/** Shed roof (`'gable'`, `'flat'`, `'saw'` or `'none'`) for a body w x d x h centred at (x, z). */
export function roof(c: ModelCtx, kind: 'gable' | 'flat' | 'saw' | 'none', w: number, d: number, h: number, x: number, z: number): void {
  const { b, s } = c;
  if (kind === 'gable') {
    const rh = Math.max(0.8, w * 0.28);
    b.wedge(w + 0.6, rh, d + 0.6, x, h - 0.02, z, s.roof, { shade: 0.05 });
    b.box(0.14, 0.12, d + 0.7, x, h + rh - 0.04, z, s.roofEdge);
    if (s.index <= 2) for (const sx of [-1, 1]) b.box(0.08, 0.1, d + 0.66, x + sx * (w / 2 + 0.26), h + 0.02, z, s.roofEdge);
  } else if (kind === 'flat') {
    b.box(w + 0.4, 0.2, d + 0.4, x, h + 0.1, z, s.roof, { shade: 0.02 });
    b.box(w + 0.44, 0.1, d + 0.44, x, h + 0.25, z, s.roofEdge);
    if (s.index >= 5) b.box(w + 0.46, 0.04, d + 0.46, x, h + 0.31, z, s.accent, { slot: SLOT_GLOW });
  } else if (kind === 'saw') {
    const n = Math.max(2, Math.round(w / 2));
    const sw = (w + 0.3) / n;
    for (let i = 0; i < n; i++) {
      const sx = x - (w + 0.3) / 2 + sw * (i + 0.5);
      b.wedge(sw, 0.8, d + 0.3, sx, h, z, i % 2 ? s.roof : s.roofEdge, { shade: 0.03 });
      b.box(sw - 0.3, 0.42, 0.06, sx, h + 0.32, z + d / 2 + 0.1, '#ffffff', { slot: SLOT_GLASS });
    }
  }
}

export interface ShedOpts {
  roof?: 'gable' | 'flat' | 'saw' | 'none';
  /** Door width in units (false = none; true = 0.9). */
  door?: boolean | number;
  windows?: boolean;
  wall?: THREE.ColorRepresentation;
  /** Hazard stripes over the door lintel. */
  hazard?: boolean;
  /** Door raised shutter (garages). */
  shutter?: boolean;
}

/**
 * Tier-styled industrial building body w x d x h centred at (x, z): walls with the tier's surface
 * language (planks / stone courses / rivet seams / panel split / glowing edge lines / gold trims),
 * corner posts, framed windows, a doorway and a roof.
 */
export function shed(c: ModelCtx, w: number, d: number, h: number, x: number, z: number, o: ShedOpts = {}): void {
  const { b, s } = c;
  const t = s.index;
  const wall = o.wall ?? s.base;
  b.box(w, h, d, x, h / 2, z, wall, { shade: t <= 2 ? 0.05 : 0.015 });
  const pw = t <= 1 ? 0.24 : 0.28;
  const post = t <= 1 ? WOOD_DARK : t === 6 ? s.trim : s.trim;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(pw, h + 0.06, pw, x + sx * (w / 2 - pw / 2 + 0.03), (h + 0.06) / 2, z + sz * (d / 2 - pw / 2 + 0.03), post);
  if (t <= 1) {
    // plank courses
    for (const yy of [h * 0.34, h * 0.67]) {
      b.box(w + 0.02, 0.06, 0.08, x, yy, z + d / 2 + 0.01, s.dark);
      b.box(0.08, 0.06, d + 0.02, x + w / 2 + 0.01, yy, z, s.dark);
      b.box(0.08, 0.06, d + 0.02, x - w / 2 - 0.01, yy, z, s.dark);
    }
    if (t === 1) b.box(w + 0.1, 0.1, d + 0.1, x, h - 0.3, z, s.accent, { shade: 0.03 }); // rope lashing
  } else if (t === 2) {
    // stone block courses + lintel band
    for (const yy of [h * 0.28, h * 0.62]) b.box(w + 0.04, 0.2, d + 0.04, x, yy, z, s.light, { shade: 0.07 });
    b.box(w + 0.1, 0.16, d + 0.1, x, h - 0.14, z, s.trim, { shade: 0.04 });
  } else if (t === 3) {
    // riveted plates: seams, rivets, rust-orange glowing trim band
    for (const sx of [-1, 1]) b.box(0.05, h - 0.5, 0.06, x + sx * w * 0.25, h / 2 - 0.1, z + d / 2 + 0.02, s.trim);
    rivets(b, s.metal, x - w / 2 + 0.4, h - 0.5, z + d / 2 + 0.04, x + w / 2 - 0.4, h - 0.5, z + d / 2 + 0.04, 4);
    b.box(w + 0.08, 0.12, d + 0.08, x, h - 0.26, z, s.accent, { slot: SLOT_GLOW });
  } else if (t === 4) {
    // blue-silver panel split with an orange stripe and a cyan light band
    b.box(w + 0.02, h * 0.42, d + 0.02, x, h * 0.74, z, s.light, { shade: 0.015 });
    b.box(w + 0.08, 0.1, d + 0.08, x, h * 0.52, z, ALLOY_ORANGE);
    b.box(w + 0.08, 0.07, d + 0.08, x, h - 0.2, z, s.accent, { slot: SLOT_GLOW });
  } else if (t === 5) {
    // dark teal with glowing cyan edge lines
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.06, h - 0.1, 0.06, x + sx * (w / 2 + 0.02), h / 2, z + sz * (d / 2 + 0.02), s.accent, { slot: SLOT_GLOW });
    b.box(w + 0.1, 0.06, 0.06, x, h - 0.08, z + d / 2 + 0.02, s.accent, { slot: SLOT_GLOW });
    b.box(w + 0.1, 0.06, 0.06, x, h - 0.08, z - d / 2 - 0.02, s.accent, { slot: SLOT_GLOW });
    b.box(0.06, 0.06, d + 0.1, x + w / 2 + 0.02, h - 0.08, z, s.accent, { slot: SLOT_GLOW });
    b.box(0.06, 0.06, d + 0.1, x - w / 2 - 0.02, h - 0.08, z, s.accent, { slot: SLOT_GLOW });
  } else {
    // pearl white, gold trims, soft blue glow line
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(pw + 0.08, 0.34, pw + 0.08, x + sx * (w / 2 - pw / 2 + 0.03), h - 0.17, z + sz * (d / 2 - pw / 2 + 0.03), GOLD);
    b.box(w + 0.1, 0.14, d + 0.1, x, 0.12, z, GOLD);
    b.box(w + 0.08, 0.07, d + 0.08, x, h * 0.56, z, s.accent, { slot: SLOT_GLOW });
  }
  if (o.windows !== false) {
    const ww = Math.min(0.9, w * 0.22);
    const wh = Math.min(0.62, h * 0.28);
    const wy = h * 0.6;
    for (const sx of [-1, 1]) windowPane(b, s, x + sx * w * 0.3, wy, z + d / 2 + 0.03, ww, wh, 0);
    windowPane(b, s, x + w / 2 + 0.03, wy, z, ww, wh, Math.PI / 2);
  }
  if (o.door !== false) {
    const dw = typeof o.door === 'number' ? o.door : 0.9;
    doorway(b, s, x, z + d / 2, dw, Math.min(1.7, h * 0.75), { hazard: o.hazard, shutter: o.shutter });
  }
  roof(c, o.roof ?? 'gable', w, d, h, x, z);
}

/**
 * Tier-styled smokestack with a smoke emitter: stone-block chimney (timber tiers), brick (stone),
 * banded steel pipe with rust-orange rings (steel+), glowing collar on nano / titanium.
 */
export function stack(c: ModelCtx, x: number, y: number, z: number, h = 1.6, r = 0.2, rate = 3): void {
  const { b, s } = c;
  const t = s.index;
  if (t <= 1) {
    b.box(r * 2.4, h * 0.62, r * 2.4, x, y + h * 0.31, z, STONE, { shade: 0.07 });
    b.box(r * 2.1, h * 0.38, r * 2.1, x, y + h * 0.81, z, STONE_LIGHT, { shade: 0.07 });
    b.box(r * 2.9, 0.14, r * 2.9, x, y + h + 0.02, z, STONE_DARK);
    b.cyl(r * 0.8, r * 0.8, 0.36, x, y + h + 0.24, z, s.metal, 6);
  } else if (t === 2) {
    b.box(r * 2.2, h, r * 2.2, x, y + h / 2, z, BRICK, { shade: 0.08 });
    for (const yy of [0.3, 0.62]) b.box(r * 2.26, 0.06, r * 2.26, x, y + h * yy, z, BRICK_DARK);
    b.box(r * 2.7, 0.14, r * 2.7, x, y + h + 0.03, z, STONE_DARK);
  } else {
    b.cyl(r, r * 1.15, h, x, y + h / 2, z, s.metal, 8);
    for (const yy of [0.3, 0.7]) b.cyl(r * 1.12, r * 1.12, 0.1, x, y + h * yy, z, stripeColor(s), 8);
    b.cyl(r * 1.25, r * 1.25, 0.14, x, y + h, z, s.trim, 8);
    if (t >= 5) b.cyl(r * 1.08, r * 1.08, 0.08, x, y + h - 0.2, z, s.accent, 8, { slot: SLOT_GLOW });
    if (t === 3) rivets(b, s.trim, x + r * 1.02, y + 0.3, z, x + r * 1.02, y + h - 0.3, z, 3, 0.06);
  }
  c.emit('smoke', x, y + h + 0.12, z, rate);
}

/**
 * Glowing furnace mouth centred at (x, y, z) on a +Z wall face (rotated by `ry`): dark recess,
 * fire glow, bright ember core, a grate and a frame; emits fire.
 */
export function furnace(c: ModelCtx, x: number, y: number, z: number, w: number, h: number, ry = 0, rate = 3): void {
  const { b, s } = c;
  const fr = frameColor(s);
  const o = (lx: number, lz: number) => yawXZ(ry, lx, lz);
  let [dx, dz] = o(0, -0.05);
  b.box(w, h, 0.18, x + dx, y, z + dz, DARK, { ry });
  [dx, dz] = o(0, 0.03);
  b.box(w * 0.82, h * 0.78, 0.06, x + dx, y - 0.02, z + dz, FIRE_GLOW, { ry, slot: SLOT_GLOW });
  [dx, dz] = o(0, 0.05);
  b.box(w * 0.42, h * 0.42, 0.06, x + dx, y - h * 0.12, z + dz, EMBER, { ry, slot: SLOT_GLOW });
  [dx, dz] = o(0, 0.08);
  b.box(w * 0.9, 0.05, 0.06, x + dx, y - h * 0.3, z + dz, DARK, { ry });
  for (const sx of [-1, 1]) {
    [dx, dz] = o(sx * (w / 2 + 0.07), 0.02);
    b.box(0.14, h + 0.1, 0.22, x + dx, y, z + dz, fr, { ry });
  }
  [dx, dz] = o(0, 0.02);
  b.box(w + 0.28, 0.14, 0.24, x + dx, y + h / 2 + 0.07, z + dz, fr, { ry });
  [dx, dz] = o(0, 0.2);
  c.emit('fire', x + dx, y - h * 0.2, z + dz, rate);
}

/** Open-sided awning: 4 posts and a sloped roof (tier roof colour), centred at (x, z). */
export function awning(c: ModelCtx, x: number, z: number, w: number, d: number, h: number, slope = 0.14): void {
  const { b, s } = c;
  const pc = postColor(s);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(0.07, 0.09, h + sz * slope * d * 0.5, x + sx * (w / 2 - 0.12), (h + sz * slope * d * 0.5) / 2, z + sz * (d / 2 - 0.12), pc, 5);
  b.box(w + 0.3, 0.1, d + 0.3, x, h + 0.08, z, s.roof, { rx: -slope, shade: 0.05 });
  b.box(w + 0.1, 0.08, 0.08, x, h - 0.04 + slope * d * 0.5, z + d / 2 - 0.12, pc);
}

export interface MachineOpts {
  lights?: number;
  gauge?: boolean;
  vents?: boolean;
  stripe?: boolean;
}

/** Boxy machine body: dark base, body, stripe band, louvre vents, status lights and a gauge. */
export function machine(c: ModelCtx, w: number, h: number, d: number, x: number, y: number, z: number, o: MachineOpts = {}): void {
  const { b, s } = c;
  b.box(w, h * 0.3, d, x, y + h * 0.15, z, s.machineDark, { shade: 0.02 });
  b.box(w * 0.96, h * 0.7, d * 0.96, x, y + h * 0.65, z, s.machine, { shade: 0.02 });
  if (o.stripe !== false) b.box(w * 0.98, 0.08, d * 0.98, x, y + h * 0.36, z, stripeColor(s), { slot: s.index >= 5 ? SLOT_GLOW : 0 });
  if (o.vents !== false) vent(b, x - w * 0.22, y + h * 0.62, z + d / 2 + 0.01, Math.min(0.6, w * 0.3), Math.min(0.4, h * 0.3), s.machineDark);
  const n = o.lights ?? 2;
  for (let i = 0; i < n; i++) led(b, x + w * 0.1 + i * 0.22, y + h * 0.84, z + d / 2 + 0.03, i === 0 ? GREEN_LED : s.accent, 0.09);
  if (o.gauge) gauge(b, x + w * 0.28, y + h * 0.6, z + d / 2 + 0.04, 0, 0.13);
}

/** Low stone/concrete base pad with a chamfered look (two slabs). */
export function pad(b: GeoBuilder, s: TierStyle, w: number, d: number, x = 0, z = 0, h = 0.22): void {
  b.box(w, h, d, x, h / 2, z, s.index <= 1 ? '#8a7555' : s.index === 2 ? STONE : s.floorAlt, { shade: 0.04 });
  b.box(w - 0.3, 0.06, d - 0.3, x, h + 0.03, z, s.index <= 1 ? '#9c8a66' : s.index === 2 ? STONE_LIGHT : s.floor, { shade: 0.03 });
}

/** Lattice mast segment: 4 angled legs and horizontal braces (power pylons, radio masts, derricks). */
export function lattice(b: GeoBuilder, color: THREE.ColorRepresentation, x: number, y: number, z: number, h: number, baseHalf: number, topHalf: number, braces = 3, leg = 0.1): void {
  const lean = Math.atan2(baseHalf - topHalf, h);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const mid = (baseHalf + topHalf) / 2;
    b.box(leg, h / Math.cos(lean) + 0.05, leg, x + sx * mid, y + h / 2, z + sz * mid, color, { rx: -sz * lean, rz: sx * lean });
  }
  for (let i = 1; i <= braces; i++) {
    const u = i / (braces + 1);
    const k = baseHalf + (topHalf - baseHalf) * u;
    const yy = y + h * u;
    b.box(k * 2, 0.05, 0.05, x, yy, z + k, color);
    b.box(k * 2, 0.05, 0.05, x, yy, z - k, color);
    b.box(0.05, 0.05, k * 2, x + k, yy, z, color);
    b.box(0.05, 0.05, k * 2, x - k, yy, z, color);
  }
}
