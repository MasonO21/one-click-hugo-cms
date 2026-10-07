/**
 * Homestead kit — low-poly building blocks shared by the housing / storage / food / water models
 * and the command center: tier-styled wall bodies (planks, braced timber, stone blocks, riveted
 * steel, alloy panels, nano seams, pearl titanium), roofs with overhangs and shingle lines,
 * glowing windows, doors with lamps, chimneys, and the small props (barrels, crates, sacks,
 * firewood, fences, banners, pipes, gauges) that make a place feel lived in.
 *
 * Everything is cheap on purpose: boxes (12 tris) and wedges (8) wherever possible, spheres only
 * for round things (seg 5 = 30 tris), rings as 10x4 tori (80) rather than high-segment ones.
 * Colours come from the tier palette SLOTS (s.base / s.light / s.trim / s.accent / …) except for
 * natural materials (wood, cloth, water, produce) which are fixed.
 */
import * as THREE from 'three';
import { GeoBuilder, SLOT_GLASS, SLOT_GLOW } from '../core/GeoBuilder';
import type { TierStyle } from '../core/palette';
import type { ModelCtx } from './spec';
import { WOOD, WOOD_DARK, LEAF, LEAF2, WATER } from './colors';

// ---------------------------------------------------------------------------------- fixed colours
/** Gold filigree on titanium-tier trims. */
export const GOLD = '#e2b964';
/** Cloth: banners, awnings, tarps, bedrolls. */
export const BANNER = '#3e6fd8';
export const CANVAS = '#e7d6b4';
export const CANVAS_DARK = '#c9b48c';
/** Warm lamp glass. */
export const LAMP = '#ffd27a';
/** Grey fieldstone (chimneys, wells, foundations). */
export const STONE = '#8e8a82';
export const STONE_DARK = '#6d6962';
/** Rust-orange hazard trims on steel / alloy machinery (non-glowing). */
export const RUST = '#d2652b';
/** Produce. */
export const TOMATO = '#e9533d';
export const PUMPKIN = '#f08c2e';
export const BERRY = '#b84ad1';
export const FLOWERS = ['#ff6b8a', '#ffd34d', '#ff8c42', '#c77dff'];

export type Face = 0 | 1 | 2 | 3; // +z (front), +x, -z, -x

/** Yaw that turns a +z-facing feature toward `face`. */
export function faceRot(face: Face): number {
  return (face * Math.PI) / 2;
}

/** Point on a wall of half extents (hw, hd) centred at (cx, cz): `u` along the wall, `off` outward. */
export function wallPoint(face: Face, u: number, hw: number, hd: number, off = 0, cx = 0, cz = 0): { x: number; z: number } {
  switch (face) {
    case 0: return { x: cx + u, z: cz + hd + off };
    case 1: return { x: cx + hw + off, z: cz - u };
    case 2: return { x: cx - u, z: cz - hd - off };
    default: return { x: cx - hw - off, z: cz + u };
  }
}

export const isWood = (s: TierStyle): boolean => s.index <= 1;
export const isStone = (s: TierStyle): boolean => s.index === 2;
export const isTech = (s: TierStyle): boolean => s.index >= 3;
/** Trim colour for posts / frames: timber for the early tiers, gold for titanium, tier trim otherwise. */
export function trimOf(s: TierStyle): THREE.ColorRepresentation {
  if (s.index <= 1) return WOOD_DARK;
  if (s.index === 2) return WOOD_DARK;
  if (s.index === 6) return GOLD;
  return s.trim;
}

// ---------------------------------------------------------------------------------- walls

/**
 * Tier-styled wall body: base at y, centred at (x, z), outer size w × h × d. Planks at wood tiers,
 * stone blocks at stone, riveted steel / alloy / nano / titanium panels above.
 */
export function wallBlock(c: ModelCtx, w: number, h: number, d: number, x: number, y: number, z: number, opts: { color?: THREE.Color; posts?: boolean } = {}): void {
  const { b, s } = c;
  const t = s.index;
  const col = opts.color ?? s.base;
  const posts = opts.posts ?? true;
  if (t <= 1) {
    // horizontal plank rows (one box per row wraps all four faces)
    const rows = Math.max(3, Math.round(h / 0.46));
    const rh = h / rows;
    for (let i = 0; i < rows; i++) {
      const alt = i % 2 ? (t === 0 ? s.light : s.dark) : col;
      b.box(w - (i % 2) * 0.04, rh - 0.03, d - (i % 2) * 0.04, x, y + rh * i + rh / 2, z, alt, { shade: 0.05 });
    }
    if (t === 1) {
      // rope / iron bands and a diagonal brace on the front
      b.box(w + 0.06, 0.1, d + 0.06, x, y + 0.42, z, s.accent);
      b.box(w + 0.06, 0.1, d + 0.06, x, y + h - 0.42, z, s.accent);
      b.box(Math.hypot(w * 0.6, h * 0.6), 0.12, 0.1, x, y + h / 2, z + d / 2 + 0.03, WOOD_DARK, { rz: Math.atan2(h * 0.6, w * 0.6) });
    }
  } else if (t === 2) {
    b.box(w, h, d, x, y + h / 2, z, col, { shade: 0.07 });
    // proud stone blocks scattered over the faces + a timber lintel band
    const n = Math.min(10, Math.round((w + d) * 0.9));
    for (let i = 0; i < n; i++) {
      const face = (i % 4) as Face;
      const hw = w / 2;
      const hd = d / 2;
      const span = face % 2 ? hd : hw;
      const u = (b.rnd() - 0.5) * (span * 2 - 0.8);
      const p = wallPoint(face, u, hw, hd, 0.02, x, z);
      const bw = 0.45 + b.rnd() * 0.35;
      const bh = 0.28 + b.rnd() * 0.12;
      b.box(bw, bh, 0.14, p.x, y + 0.35 + b.rnd() * (h - 0.9), p.z, i % 3 ? s.light : s.dark, { ry: faceRot(face), shade: 0.06 });
    }
    b.box(w + 0.08, 0.16, d + 0.08, x, y + h - 0.3, z, WOOD_DARK, { shade: 0.04 });
  } else if (t === 3) {
    // riveted steel: body, lighter inset panels (two boxes cover all four faces), rust stripe, rivets
    b.box(w, h, d, x, y + h / 2, z, col, { shade: 0.025 });
    b.box(w - 0.5, h - 0.6, d + 0.06, x, y + h / 2 - 0.04, z, s.light, { shade: 0.02 });
    b.box(w + 0.06, h - 0.6, d - 0.5, x, y + h / 2 - 0.04, z, s.light, { shade: 0.02 });
    b.box(w + 0.1, 0.12, d + 0.1, x, y + h - 0.22, z, s.accent, { slot: SLOT_GLOW });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.box(0.1, 0.1, 0.1, x + sx * (w / 2 - 0.16), y + 0.22, z + sz * (d / 2 + 0.02), s.metal);
      b.box(0.1, 0.1, 0.1, x + sx * (w / 2 + 0.02), y + h - 0.5, z + sz * (d / 2 - 0.16), s.metal);
    }
  } else if (t === 4) {
    // sleek alloy: panels with a cyan seam and a rust-orange detail block
    b.box(w, h, d, x, y + h / 2, z, col, { shade: 0.015 });
    b.box(w - 0.4, h - 0.8, d + 0.06, x, y + h / 2 + 0.1, z, s.light);
    b.box(w + 0.06, h - 0.8, d - 0.4, x, y + h / 2 + 0.1, z, s.light);
    b.box(w + 0.1, 0.07, d + 0.1, x, y + h - 0.3, z, s.accent, { slot: SLOT_GLOW });
    b.box(w * 0.3, 0.3, d + 0.1, x, y + 0.32, z, RUST);
  } else if (t === 5) {
    // dark nano shell with glowing corner seams and a light crown line
    b.box(w, h, d, x, y + h / 2, z, s.dark, { shade: 0.015 });
    b.box(w - 0.3, h - 0.5, d + 0.05, x, y + h / 2, z, col);
    b.box(w + 0.05, h - 0.5, d - 0.3, x, y + h / 2, z, col);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.07, h - 0.3, 0.07, x + sx * (w / 2 + 0.01), y + h / 2, z + sz * (d / 2 + 0.01), s.accent, { slot: SLOT_GLOW });
    b.box(w + 0.08, 0.06, d + 0.08, x, y + h - 0.2, z, s.accent, { slot: SLOT_GLOW });
  } else {
    // pearl titanium: white panels, gold crown band, soft blue energy line
    b.box(w, h, d, x, y + h / 2, z, col, { shade: 0.008 });
    b.box(w - 0.4, h - 0.7, d + 0.06, x, y + h / 2 + 0.05, z, s.light);
    b.box(w + 0.06, h - 0.7, d - 0.4, x, y + h / 2 + 0.05, z, s.light);
    b.box(w + 0.1, 0.14, d + 0.1, x, y + h - 0.16, z, GOLD);
    b.box(w + 0.08, 0.06, d + 0.08, x, y + 0.5, z, s.accent, { slot: SLOT_GLOW });
  }
  if (posts && t <= 2) {
    const pw = t === 2 ? 0.34 : 0.24;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(pw, h + 0.06, pw, x + sx * (w / 2 - pw / 2 + 0.04), y + h / 2 + 0.03, z + sz * (d / 2 - pw / 2 + 0.04), t === 2 ? s.trim : WOOD_DARK, { shade: 0.04 });
  }
}

// ---------------------------------------------------------------------------------- roofs

/**
 * Gable roof over a w × d body whose top is at y: overhanging wedge, ridge beam, eave boards and
 * (wood/stone tiers) shingle lines. Ridge runs along Z by default. Returns the ridge height.
 */
export function gableRoof(c: ModelCtx, w: number, d: number, x: number, y: number, z: number, opts: { h?: number; overhang?: number; alongX?: boolean; color?: THREE.Color; edge?: THREE.ColorRepresentation; shingles?: boolean } = {}): number {
  const { b, s } = c;
  const ov = opts.overhang ?? 0.45;
  const alongX = opts.alongX ?? false;
  const W = (alongX ? d : w) + ov * 2;
  const D = (alongX ? w : d) + ov * 2;
  const h = opts.h ?? Math.max(0.9, W * 0.32);
  const col = opts.color ?? s.roof;
  const edge = opts.edge ?? s.roofEdge;
  const ry = alongX ? Math.PI / 2 : 0;
  const y0 = y - 0.08;
  b.wedge(W, h, D, x, y0, z, col, { ry, shade: s.index <= 2 ? 0.05 : 0.015 });
  // ridge beam + eave boards
  b.box(0.16, 0.16, D + 0.1, x, y0 + h + 0.02, z, edge, { ry });
  const slope = Math.atan2(h, W / 2);
  for (const sx of [-1, 1]) {
    const ox = sx * (W / 2 - 0.02);
    const px = alongX ? x : x + ox;
    const pz = alongX ? z - ox : z;
    b.box(0.14, 0.14, D + 0.06, px, y0 + 0.05, pz, edge, { ry });
    if ((opts.shingles ?? s.index <= 2)) {
      for (const f of [0.36, 0.7]) {
        const lx = sx * (W / 2) * (1 - f);
        const ly = y0 + h * f + 0.035;
        b.box(0.1, 0.05, D + 0.02, alongX ? x : x + lx, ly, alongX ? z - lx : z, edge, { ry, rz: alongX ? 0 : -sx * slope, rx: alongX ? -sx * slope : 0, shade: 0.04 });
      }
    }
  }
  return h;
}

/** Flat roof slab with a parapet lip, rooftop vents and (tech tiers) a glow edge line. */
export function flatRoof(c: ModelCtx, w: number, d: number, x: number, y: number, z: number, opts: { vents?: number; glow?: boolean; lip?: number } = {}): void {
  const { b, s } = c;
  const lip = opts.lip ?? 0.26;
  b.box(w + lip, 0.22, d + lip, x, y + 0.11, z, s.roof, { shade: 0.015 });
  b.box(w + lip + 0.06, 0.1, d + lip + 0.06, x, y + 0.27, z, s.index === 6 ? GOLD : s.roofEdge);
  const vents = opts.vents ?? 2;
  for (let i = 0; i < vents; i++) {
    const vx = x - w / 2 + 0.6 + (i * (w - 1.2)) / Math.max(1, vents - 1);
    b.box(0.5, 0.3, 0.4, vx, y + 0.45, z - d / 2 + 0.55, s.machine, { shade: 0.02 });
    b.box(0.54, 0.08, 0.44, vx, y + 0.62, z - d / 2 + 0.55, s.metal);
  }
  if (opts.glow ?? s.index >= 4) b.box(w - 0.6, 0.04, 0.08, x, y + 0.34, z + d / 2 - 0.3, s.accent, { slot: SLOT_GLOW });
}

/** Single-slope shed roof (high at the back, -z), with an overhang and eave board. */
export function shedRoof(c: ModelCtx, w: number, d: number, x: number, y: number, z: number, opts: { rise?: number; overhang?: number; color?: THREE.Color } = {}): void {
  const { b, s } = c;
  const ov = opts.overhang ?? 0.4;
  const rise = opts.rise ?? 0.55;
  const D = d + ov * 2;
  const rx = Math.atan2(rise, D);
  const col = opts.color ?? s.roof;
  b.box(w + ov * 2, 0.16, D + 0.1, x, y + rise / 2, z, col, { rx, shade: s.index <= 2 ? 0.05 : 0.015 });
  b.box(w + ov * 2 + 0.06, 0.12, 0.12, x, y + 0.02, z + D / 2, s.roofEdge, { rx });
  b.box(w + ov * 2 + 0.06, 0.12, 0.12, x, y + rise - 0.02, z - D / 2, s.roofEdge, { rx });
  if (s.index <= 2) for (const f of [0.33, 0.66]) b.box(w + ov * 2, 0.05, 0.1, x, y + rise * (1 - f) + 0.09, z - D / 2 + D * f, s.roofEdge, { rx, shade: 0.04 });
}

/** Stone (wood/stone tiers) or steel-pipe chimney with a smoke emitter. Base at y. */
export function chimney(c: ModelCtx, x: number, y: number, z: number, h = 1.2, rate = 1.5): void {
  const { b, s } = c;
  if (s.index <= 2) {
    b.box(0.5, h, 0.5, x, y + h / 2, z, STONE, { shade: 0.08 });
    b.box(0.62, 0.16, 0.62, x, y + h - 0.08, z, STONE_DARK, { shade: 0.06 });
    b.box(0.3, 0.14, 0.3, x, y + h + 0.07, z, '#3a3230');
    c.emit('smoke', x, y + h + 0.15, z, rate);
  } else {
    c.chimney(x, y, z, h, 0.17, rate);
  }
}

// ---------------------------------------------------------------------------------- openings

/** Framed window on a wall face: glass pane (warm at night), frame, sill, mullions on early tiers. */
export function casement(c: ModelCtx, x: number, y: number, z: number, face: Face, w = 0.7, h = 0.6): void {
  const { b, s } = c;
  const ry = faceRot(face);
  const frame = isTech(s) ? s.metal : trimOf(s);
  b.box(w + 0.16, h + 0.16, 0.08, x, y, z, frame, { ry });
  b.box(w, h, 0.16, x, y, z, '#ffffff', { ry, slot: SLOT_GLASS });
  if (s.index <= 2) {
    b.box(0.06, h, 0.2, x, y, z, frame, { ry });
    b.box(w, 0.06, 0.2, x, y, z, frame, { ry });
    b.box(w + 0.3, 0.08, 0.2, x, y - h / 2 - 0.08, z, frame, { ry });
  } else {
    b.box(w + 0.1, 0.05, 0.12, x, y - h / 2 - 0.1, z, s.accent, { ry, slot: SLOT_GLOW });
  }
}

/** Small glowing lamp (wall lantern or hanging): glass cube with a cap, optional point light. */
export function lamp(c: ModelCtx, x: number, y: number, z: number, opts: { light?: boolean; range?: number; cap?: boolean; color?: string } = {}): void {
  const { b, s } = c;
  const col = opts.color ?? (s.index >= 4 ? s.accent.getStyle() : LAMP);
  b.box(0.2, 0.22, 0.2, x, y, z, col, { slot: SLOT_GLOW });
  if (opts.cap ?? true) b.box(0.28, 0.06, 0.28, x, y + 0.15, z, isTech(s) ? s.metal : WOOD_DARK);
  if (opts.light) c.setLight(x, y, z, col, 1.0, opts.range ?? 7);
}

/** Door with frame on a wall face, with a lamp above it. */
export function door(c: ModelCtx, x: number, y: number, z: number, face: Face, opts: { w?: number; h?: number; lamp?: boolean | 'above' | 'side'; light?: boolean; steps?: boolean } = {}): void {
  const { b, s } = c;
  const w = opts.w ?? 0.9;
  const h = opts.h ?? 1.6;
  const ry = faceRot(face);
  const frame = isTech(s) ? s.trim : trimOf(s);
  b.box(w + 0.24, h + 0.14, 0.1, x, y + h / 2 + 0.04, z, frame, { ry });
  if (s.index <= 2) {
    b.box(w, h, 0.14, x, y + h / 2, z, WOOD_DARK, { ry, shade: 0.05 });
    b.box(w - 0.1, 0.07, 0.2, x, y + h * 0.3, z, s.index === 2 ? s.metal : WOOD, { ry });
    b.box(w - 0.1, 0.07, 0.2, x, y + h * 0.72, z, s.index === 2 ? s.metal : WOOD, { ry });
    b.box(0.08, 0.08, 0.22, x + (face === 0 ? 0.28 : face === 2 ? -0.28 : 0), y + h * 0.5, z + (face === 1 ? -0.28 : face === 3 ? 0.28 : 0), s.index === 2 ? s.accent : s.metal, { ry });
  } else {
    b.box(w, h, 0.14, x, y + h / 2, z, s.machine, { ry });
    b.box(0.06, h - 0.2, 0.2, x, y + h / 2, z, s.accent, { ry, slot: SLOT_GLOW });
    b.box(w - 0.2, 0.05, 0.2, x, y + h - 0.12, z, s.accent, { ry, slot: SLOT_GLOW });
  }
  if (opts.steps) {
    const p = wallPoint(face, 0, 0, 0, 0.26);
    b.box(face % 2 ? 0.5 : w + 0.4, 0.14, face % 2 ? w + 0.4 : 0.5, x + p.x, y + 0.07, z + p.z, isTech(s) ? s.floor : STONE, { shade: 0.05 });
  }
  const lampMode = opts.lamp ?? 'side';
  if (lampMode === 'above') {
    const p = wallPoint(face, 0, 0, 0, 0.14);
    lamp(c, x + p.x, y + h + 0.42, z + p.z, { light: opts.light });
  } else if (lampMode) {
    const p = wallPoint(face, w / 2 + 0.3, 0, 0, 0.16);
    lamp(c, x + p.x, y + h * 0.8, z + p.z, { light: opts.light });
  }
}

/** Flower box under a window: planter with three bright blossoms. */
export function flowerBox(c: ModelCtx, x: number, y: number, z: number, face: Face, len = 0.8): void {
  const { b } = c;
  const ry = faceRot(face);
  b.box(len, 0.22, 0.26, x, y, z, WOOD_DARK, { ry, shade: 0.04 });
  b.box(len - 0.1, 0.1, 0.18, x, y + 0.12, z, LEAF, { ry });
  for (let i = 0; i < 3; i++) {
    const u = -len / 2 + 0.18 + (i * (len - 0.36)) / 2;
    const p = wallPoint(face, u, 0, 0, 0);
    b.shard(0.08, 0.1, x + p.x, y + 0.26, z + p.z, FLOWERS[(i + Math.abs(Math.round((x + z) * 3))) % FLOWERS.length]);
  }
}

// ---------------------------------------------------------------------------------- props

/** Wooden (or steel) barrel, base at y. */
export function barrel(b: GeoBuilder, x: number, y: number, z: number, r = 0.3, h = 0.72, color: THREE.ColorRepresentation = WOOD, band: THREE.ColorRepresentation = '#5a4a3a'): void {
  b.cyl(r * 0.92, r * 0.92, h, x, y + h / 2, z, color, 7, { shade: 0.05 });
  b.cyl(r, r, 0.1, x, y + h * 0.3, z, band, 7);
  b.cyl(r, r, 0.1, x, y + h * 0.72, z, band, 7);
}

/** Crate with two strap boards. */
export function crateProp(b: GeoBuilder, x: number, y: number, z: number, size = 0.6, color: THREE.ColorRepresentation = WOOD, edge: THREE.ColorRepresentation = WOOD_DARK, ry = 0): void {
  b.box(size, size, size, x, y + size / 2, z, color, { ry, shade: 0.05 });
  b.box(size + 0.04, 0.08, size + 0.04, x, y + size * 0.5, z, edge, { ry });
  b.box(0.08, size + 0.03, size + 0.04, x, y + size / 2, z, edge, { ry });
}

/** Grain / flour sack with a tied top. */
export function sack(b: GeoBuilder, x: number, y: number, z: number, color: THREE.ColorRepresentation = CANVAS_DARK, r = 0.26): void {
  b.sphere(r, x, y + r * 0.8, z, color, 5, { sy: 0.85, shade: 0.05 });
  b.shard(r * 0.3, r * 0.4, x, y + r * 1.6, z, color);
}

/** Stacked firewood (3 + 2 logs) lying along the local X axis. */
export function logPile(b: GeoBuilder, x: number, y: number, z: number, len = 1.0, ry = 0): void {
  const r = 0.13;
  const cs = Math.cos(ry);
  const sn = Math.sin(ry);
  const at = (ox: number, oz: number) => ({ x: x + ox * cs + oz * sn, z: z - ox * sn + oz * cs });
  for (let i = 0; i < 3; i++) {
    const p = at(0, (i - 1) * r * 2.1);
    b.cyl(r, r, len, p.x, y + r, p.z, i % 2 ? WOOD : WOOD_DARK, 5, { rz: Math.PI / 2, ry });
  }
  for (let i = 0; i < 2; i++) {
    const p = at(0, (i - 0.5) * r * 2.1);
    b.cyl(r, r, len * 0.96, p.x, y + r * 2.8, p.z, i ? WOOD_DARK : WOOD, 5, { rz: Math.PI / 2, ry });
  }
}

/** Post-and-rail fence from (x0,z0) to (x1,z1), posts every ~1.4 units. */
export function fenceRun(b: GeoBuilder, x0: number, z0: number, x1: number, z1: number, opts: { color?: THREE.ColorRepresentation; rail?: THREE.ColorRepresentation; h?: number; glowRail?: boolean } = {}): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(2, Math.round(len / 1.4) + 1);
  const h = opts.h ?? 0.9;
  const col = opts.color ?? WOOD_DARK;
  const rail = opts.rail ?? WOOD;
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    b.box(0.14, h, 0.14, x0 + (x1 - x0) * f, h / 2, z0 + (z1 - z0) * f, col, { shade: 0.05 });
  }
  const ry = Math.atan2(x1 - x0, z1 - z0);
  const mx = (x0 + x1) / 2;
  const mz = (z0 + z1) / 2;
  b.box(0.08, 0.08, len, mx, h * 0.5, mz, rail, { ry, slot: opts.glowRail ? SLOT_GLOW : 0 });
  b.box(0.08, 0.08, len, mx, h * 0.84, mz, rail, { ry, slot: opts.glowRail ? SLOT_GLOW : 0 });
}

/** Lantern on a post with a little arm. */
export function lanternPost(c: ModelCtx, x: number, z: number, h = 1.9, light = true): void {
  const { b, s } = c;
  const post = isTech(s) ? s.metal : WOOD_DARK;
  b.box(0.12, h, 0.12, x, h / 2, z, post, { shade: 0.04 });
  b.box(0.5, 0.08, 0.08, x + 0.2, h - 0.04, z, post);
  lamp(c, x + 0.42, h - 0.3, z, { light });
}

/** Banner / flag on a pole (static cloth, slightly furled). */
export function bannerPole(c: ModelCtx, x: number, z: number, h: number, color: THREE.ColorRepresentation = BANNER, face: Face = 0, y = 0): void {
  const { b, s } = c;
  const pole = isTech(s) ? s.metal : WOOD_DARK;
  const ry = faceRot(face);
  b.box(0.08, h, 0.08, x, y + h / 2, z, pole);
  b.box(0.1, 0.1, 0.1, x, y + h + 0.05, z, s.index === 6 ? GOLD : s.accent);
  const p = wallPoint(face, 0.02, 0, 0, 0.26);
  b.box(0.06, h * 0.42, 0.5, x + p.x, y + h * 0.72, z + p.z, color, { ry: ry + Math.PI / 2, rz: 0.08 });
  b.box(0.05, h * 0.18, 0.46, x + p.x, y + h * 0.44, z + p.z, s.index <= 2 ? '#f0e6cc' : s.accent, { ry: ry + Math.PI / 2, slot: s.index >= 3 ? SLOT_GLOW : 0 });
}

/** Canvas awning on two posts in front of a wall face (centre x,z is the wall point). */
export function awning(c: ModelCtx, x: number, y: number, z: number, w: number, depth: number, face: Face, color: THREE.ColorRepresentation = CANVAS): void {
  const { b, s } = c;
  const ry = faceRot(face);
  const post = isTech(s) ? s.metal : WOOD_DARK;
  const pc = wallPoint(face, 0, 0, 0, depth / 2);
  b.box(w + 0.1, 0.08, depth, x + pc.x, y, z + pc.z, color, { ry, rx: -0.2, shade: 0.03 });
  for (const sx of [-1, 1]) {
    const pu = wallPoint(face, sx * (w / 2 - 0.1), 0, 0, depth - 0.1);
    b.box(0.1, y - 0.1, 0.1, x + pu.x, (y - 0.1) / 2, z + pu.z, post);
  }
}

/** Flat glowing ring (low-segment torus, 4 tube sides) — a cheap neon halo. */
export function glowRing(b: GeoBuilder, r: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, seg = 10, th = 0.06): void {
  b.torus(r, th, x, y, z, color, seg, 4, { rx: Math.PI / 2, slot: SLOT_GLOW });
}

/** Flat non-glowing ring (low-segment torus). */
export function ring(b: GeoBuilder, r: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, seg = 10, th = 0.06): void {
  b.torus(r, th, x, y, z, color, seg, 4, { rx: Math.PI / 2 });
}

/** Flattened dome. */
export function dome(b: GeoBuilder, r: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, seg = 8, squash = 0.6, slot = 0): void {
  b.sphere(r, x, y, z, color, seg, { sy: squash, slot });
}

/** Flat water surface. */
export function waterDisc(b: GeoBuilder, r: number, x: number, y: number, z: number, seg = 8): void {
  b.cyl(r, r, 0.06, x, y, z, WATER, seg);
}

/** Leafy plant (bush) with an optional fruit shard. */
export function bush(b: GeoBuilder, x: number, y: number, z: number, r: number, leaf: THREE.ColorRepresentation = LEAF, fruit?: THREE.ColorRepresentation): void {
  b.sphere(r, x, y + r * 0.8, z, leaf, 5, { sy: 0.85, shade: 0.06 });
  if (fruit) b.shard(r * 0.3, r * 0.4, x + r * 0.5, y + r * 1.1, z + r * 0.45, fruit);
}

/** Straight pipe between two points (box, so it stays cheap), with flange cubes at both ends. */
export function pipe(b: GeoBuilder, s: TierStyle, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r = 0.1, color?: THREE.ColorRepresentation, flanges = true): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dy, dz);
  const col = color ?? s.metal;
  const ry = Math.atan2(dx, dz);
  const rx = -Math.atan2(dy, Math.hypot(dx, dz));
  b.box(r * 2, r * 2, len + r, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, col, { ry, rx });
  if (flanges) {
    b.box(r * 3, r * 3, r * 1.4, x0, y0, z0, col, { ry, rx });
    b.box(r * 3, r * 3, r * 1.4, x1, y1, z1, col, { ry, rx });
  }
}

/** Round gauge with a glowing dial dot on a wall face. */
export function gauge(c: ModelCtx, x: number, y: number, z: number, face: Face, r = 0.16): void {
  const { b, s } = c;
  const ry = faceRot(face);
  b.cyl(r, r, 0.08, x, y, z, s.metal, 7, { rx: Math.PI / 2, ry });
  b.cyl(r * 0.7, r * 0.7, 0.1, x, y, z, '#f4f6f8', 7, { rx: Math.PI / 2, ry });
  const p = wallPoint(face, r * 0.25, 0, 0, 0.06);
  b.box(0.05, 0.05, 0.05, x + p.x, y + r * 0.25, z + p.z, '#ff4d5e', { slot: SLOT_GLOW });
}

/** Rooftop / ground solar panel tilted toward +z. */
export function solarCell(b: GeoBuilder, s: TierStyle, w: number, d: number, x: number, y: number, z: number): void {
  b.box(w, 0.06, d, x, y, z, s.metal, { rx: -0.45 });
  b.box(w - 0.1, 0.04, d - 0.1, x, y + 0.04, z, '#1f3f7a', { rx: -0.45 });
  b.box(0.04, 0.03, d - 0.12, x, y + 0.07, z, '#9fd0ff', { rx: -0.45 });
}

/** Low raised planter with a bush, used around habitats / towers. */
export function planter(c: ModelCtx, x: number, z: number, w = 0.7, leaf: THREE.ColorRepresentation = LEAF2): void {
  const { b, s } = c;
  b.box(w, 0.3, w, x, 0.15, z, isTech(s) ? s.machine : WOOD_DARK, { shade: 0.03 });
  bush(b, x, 0.28, z, w * 0.36, leaf);
}

/** Terrain-coloured foundation pad: planks (wood), flagstones (stone) or a tech slab. */
export function pad(c: ModelCtx, w: number, d: number, x = 0, z = 0): void {
  const { b, s } = c;
  if (s.index <= 1) {
    const planks = Math.max(3, Math.round(w / 0.7));
    const pw = w / planks;
    for (let i = 0; i < planks; i++) b.box(pw - 0.04, 0.16, d, x - w / 2 + pw * (i + 0.5), 0.08, z, i % 2 ? s.floor : s.floorAlt, { shade: 0.04 });
  } else if (s.index === 2) {
    b.box(w, 0.16, d, x, 0.08, z, s.floorAlt, { shade: 0.05 });
    for (let i = 0; i < 4; i++) b.box(0.6 + (i % 2) * 0.3, 0.05, 0.6, x - w / 2 + 0.5 + i * ((w - 1.0) / 3), 0.18, z + (i % 2 ? d / 4 : -d / 4), s.floor, { shade: 0.06 });
  } else {
    b.box(w, 0.16, d, x, 0.08, z, s.floorAlt, { shade: 0.02 });
    b.box(w - 0.5, 0.04, d - 0.5, x, 0.18, z, s.floor);
  }
}

/**
 * Complete tier-styled house: wall body, roof (gable at wood/stone tiers, flat with vents above),
 * windows on the front and one side, a door with a lamp, and chimney (early) or antenna (tech).
 * Base at y = 0, centred at (x, z). Returns the roof top height.
 */
export function house(c: ModelCtx, w: number, d: number, h: number, x: number, z: number, opts: { roof?: 'gable' | 'flat' | 'shed' | 'auto'; door?: Face | null; windows?: number; flowers?: boolean; chimney?: boolean; light?: boolean; alongX?: boolean } = {}): number {
  const { b, s } = c;
  const t = s.index;
  wallBlock(c, w, h, d, x, 0, z);
  const roof = (opts.roof ?? 'auto') === 'auto' ? (t <= 2 ? 'gable' : 'flat') : opts.roof!;
  let top = h;
  if (roof === 'gable') top = h + gableRoof(c, w, d, x, h, z, { alongX: opts.alongX });
  else if (roof === 'flat') {
    flatRoof(c, w, d, x, h, z);
    top = h + 0.6;
  } else {
    shedRoof(c, w, d, x, h, z);
    top = h + 0.6;
  }
  // openings: door left of centre, a window to its right (and a far-left one on wide fronts), one side window
  const wy = Math.min(h * 0.62, 1.5);
  const nwin = opts.windows ?? 2;
  const doorFace = opts.door === undefined ? 0 : opts.door;
  const fw = doorFace === 0 || doorFace === 2 ? w : d;
  if (nwin >= 1) {
    const front = wallPoint(0, w * 0.25, w / 2, d / 2, 0.02, x, z);
    casement(c, front.x, wy, front.z, 0);
    if (opts.flowers ?? t <= 2) flowerBox(c, front.x, wy - 0.5, front.z + 0.14, 0);
    if (fw >= 5.6) {
      const far = wallPoint(0, -w * 0.38, w / 2, d / 2, 0.02, x, z);
      casement(c, far.x, wy, far.z, 0);
      if (opts.flowers ?? t <= 2) flowerBox(c, far.x, wy - 0.5, far.z + 0.14, 0);
    }
    if (nwin >= 2) {
      const side = wallPoint(1, 0, w / 2, d / 2, 0.02, x, z);
      casement(c, side.x, wy, side.z, 1, 0.8, 0.6);
    }
  }
  if (doorFace !== null) {
    const p = wallPoint(doorFace, -fw * 0.2, w / 2, d / 2, 0.05, x, z);
    door(c, p.x, 0.12, p.z, doorFace, { light: opts.light, steps: true, lamp: roof === 'gable' ? 'side' : 'above' });
  }
  if (opts.chimney ?? true) {
    if (t <= 3) chimney(c, x + w / 2 - 0.55, roof === 'gable' ? h + 0.3 : h + 0.2, z - d / 2 + 0.6, roof === 'gable' ? 1.3 : 1.0, 1.2);
    else c.antenna(x + w / 2 - 0.5, top, z - d / 2 + 0.5, 0.9, s.accent.getStyle());
  }
  void b;
  return top;
}
