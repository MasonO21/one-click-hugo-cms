/**
 * Structure pieces (floor / wall / door / window / fence / gate / pillar / platform / stairs / roof)
 * as tier-styled procedural geometry. Walls and fences are split into a centre "core" (post) and an
 * "arm" reaching to the cell edge so neighbouring pieces visually connect; isolated pieces and
 * build ghosts use the "full" variant.
 *
 * All geometry is centred on the cell (XZ) with the ground at y = 0. Cells are CELL (2) units.
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
  const ck = `${key}|${s.index}`;
  let g = cache.get(ck);
  if (g) return g;
  const b = new GeoBuilder(s.index * 31 + key.length);
  BUILDERS[key](b, s);
  g = b.build();
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

/** A wall panel segment from x0 to x1 (along X), thickness `th` (Z), height WALL_H, tier-styled face. */
function panel(b: GeoBuilder, s: TierStyle, x0: number, x1: number, th = 0.6): void {
  const len = x1 - x0;
  const cx = (x0 + x1) / 2;
  const H = WALL_H - 0.1;
  const t = s.index;
  if (t === 0) {
    // raw planks
    const rows = 4;
    const ph = H / rows;
    for (let i = 0; i < rows; i++) b.box(len, ph - 0.05, th, cx, ph * i + ph / 2, 0, i % 2 ? s.light : s.base, { shade: 0.04 });
  } else if (t === 1) {
    const rows = 4;
    const ph = H / rows;
    for (let i = 0; i < rows; i++) b.box(len, ph - 0.05, th, cx, ph * i + ph / 2, 0, i % 2 ? s.base : s.dark, { shade: 0.04 });
    // diagonal brace + rope bands
    b.box(Math.hypot(len, H) * 0.92, 0.16, 0.14, cx, H / 2, th / 2 + 0.02, s.trim, { rz: Math.atan2(H, len) });
    b.box(len, 0.12, th + 0.08, cx, 0.5, 0, s.accent);
    b.box(len, 0.12, th + 0.08, cx, H - 0.5, 0, s.accent);
  } else if (t === 2) {
    // staggered stone blocks
    const rows = 4;
    const ph = H / rows;
    for (let i = 0; i < rows; i++) {
      const off = i % 2 ? len * 0.25 : 0;
      const n = 2;
      for (let j = 0; j < n; j++) {
        let bx0 = x0 + (j * len) / n + off - (i % 2 ? len * 0.25 : 0);
        let bx1 = bx0 + len / n;
        bx0 = Math.max(x0, bx0);
        bx1 = Math.min(x1, bx1);
        if (bx1 - bx0 < 0.1) continue;
        b.box(bx1 - bx0 - 0.04, ph - 0.05, th, (bx0 + bx1) / 2, ph * i + ph / 2, 0, j % 2 ? s.base : s.light, { shade: 0.07 });
      }
      if (i % 2) b.box(len * 0.25 - 0.04, ph - 0.05, th, x1 - len * 0.125, ph * i + ph / 2, 0, s.base, { shade: 0.07 });
    }
    b.box(len, 0.12, th + 0.1, cx, H, 0, s.accent);
  } else if (t === 3) {
    // riveted steel panel with orange stripe
    b.box(len, H, th, cx, H / 2, 0, s.base, { shade: 0.03 });
    b.box(len - 0.2, H - 0.5, th + 0.08, cx, H / 2, 0, s.light, { shade: 0.02 });
    b.box(len, 0.18, th + 0.1, cx, H - 0.45, 0, s.accent, { slot: SLOT_GLOW });
    for (const sx of [x0 + 0.12, x1 - 0.12]) for (const y of [0.3, H - 0.3]) b.sphere(0.06, sx, y, th / 2 + 0.03, s.metal, 5);
  } else if (t === 4) {
    // sleek alloy with cyan trim
    b.box(len, H, th, cx, H / 2, 0, s.base);
    b.box(len - 0.1, H - 0.9, th + 0.1, cx, H / 2 - 0.2, 0, s.light);
    b.box(len, 0.08, th + 0.12, cx, H - 0.25, 0, s.accent, { slot: SLOT_GLOW });
    b.box(0.06, H - 1.2, th + 0.12, cx, H / 2 - 0.2, 0, s.accent, { slot: SLOT_GLOW });
  } else if (t === 5) {
    // dark glossy nano with glowing seams
    b.box(len, H, th, cx, H / 2, 0, s.base);
    b.box(len - 0.14, H - 0.4, th + 0.06, cx, H / 2, 0, s.dark);
    b.box(len, 0.06, th + 0.12, cx, 0.35, 0, s.accent, { slot: SLOT_GLOW });
    b.box(len, 0.06, th + 0.12, cx, H - 0.35, 0, s.accent, { slot: SLOT_GLOW });
    b.box(0.06, H - 0.7, th + 0.12, cx, H / 2, 0, s.accent, { slot: SLOT_GLOW });
    b.sphere(0.09, cx, H / 2, th / 2 + 0.05, s.accent, 5, { slot: SLOT_GLOW });
  } else {
    // titanium: white panels, cyan energy line, chrome edge
    b.box(len, H, th, cx, H / 2, 0, s.base);
    b.box(len - 0.1, H - 0.6, th + 0.08, cx, H / 2 + 0.1, 0, s.light);
    b.box(len, 0.1, th + 0.14, cx, H - 0.2, 0, s.accent, { slot: SLOT_GLOW });
    b.box(len - 0.3, 0.07, th + 0.14, cx, H / 2, 0, s.accent, { slot: SLOT_GLOW });
    b.box(len, 0.22, th + 0.06, cx, 0.11, 0, s.trim);
  }
}

/** A corner post / wall core at the cell centre. */
function post(b: GeoBuilder, s: TierStyle, w = 0.8, h = WALL_H + 0.15): void {
  const t = s.index;
  if (t <= 1) {
    b.cyl(w * 0.5, w * 0.55, h, 0, h / 2, 0, s.trim, 7, { shade: 0.04 });
    if (t === 1) {
      b.box(w + 0.1, 0.14, w + 0.1, 0, h - 0.6, 0, s.metal);
      b.box(w + 0.1, 0.14, w + 0.1, 0, 0.6, 0, s.metal);
    }
  } else if (t === 2) {
    b.box(w, h, w, 0, h / 2, 0, s.trim, { shade: 0.05 });
    b.box(w + 0.16, 0.2, w + 0.16, 0, h, 0, s.accent);
  } else if (t === 3) {
    b.box(w, h, w, 0, h / 2, 0, s.trim);
    b.box(w + 0.12, 0.18, w + 0.12, 0, h, 0, s.metal);
    b.box(w + 0.12, 0.18, w + 0.12, 0, 0.1, 0, s.metal);
  } else if (t === 4) {
    b.cyl(w * 0.5, w * 0.5, h, 0, h / 2, 0, s.trim, 6);
    b.torus(w * 0.5, 0.06, 0, h - 0.05, 0, s.accent, 8, 5, { rx: Math.PI / 2, slot: SLOT_GLOW });
  } else if (t === 5) {
    b.box(w, h, w, 0, h / 2, 0, s.trim);
    b.box(0.08, h - 0.4, w + 0.1, 0, h / 2, 0, s.accent, { slot: SLOT_GLOW });
    b.box(w + 0.1, h - 0.4, 0.08, 0, h / 2, 0, s.accent, { slot: SLOT_GLOW });
  } else {
    b.box(w, h, w, 0, h / 2, 0, s.light);
    b.box(w + 0.1, 0.22, w + 0.1, 0, h + 0.05, 0, s.trim);
    b.sphere(0.2, 0, h + 0.3, 0, s.accent, 6, { slot: SLOT_GLOW });
    b.box(w + 0.14, 0.08, w + 0.14, 0, 0.3, 0, s.accent, { slot: SLOT_GLOW });
  }
}

function floorSlab(b: GeoBuilder, s: TierStyle, w: number, d: number, top: number, patterned = true): void {
  const base = top - 0.46;
  const t = s.index;
  b.box(w, 0.46, d, 0, base + 0.23, 0, s.floorAlt);
  if (!patterned) return;
  if (t <= 1) {
    const planks = 4;
    const pw = w / planks;
    for (let i = 0; i < planks; i++) b.box(pw - 0.05, 0.06, d - 0.06, -w / 2 + pw * i + pw / 2, top, 0, i % 2 ? s.floor : s.floorAlt, { shade: 0.04 });
  } else if (t === 2) {
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) b.box(w / 2 - 0.08, 0.06, d / 2 - 0.08, -w / 4 + (i * w) / 2, top, -d / 4 + (j * d) / 2, (i + j) % 2 ? s.floor : s.floorAlt, { shade: 0.06 });
  } else if (t === 3) {
    b.box(w - 0.12, 0.06, d - 0.12, 0, top, 0, s.floor);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.sphere(0.05, sx * (w / 2 - 0.2), top + 0.03, sz * (d / 2 - 0.2), s.metal, 4);
  } else if (t === 4) {
    b.box(w - 0.1, 0.06, d - 0.1, 0, top, 0, s.floor);
    b.box(w - 0.5, 0.03, 0.06, 0, top + 0.04, 0, s.accent, { slot: SLOT_GLOW });
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
      // wooden/stone door: plank panel, slightly ajar look via hinge strap color
      b.box(1.32, 2.3, 0.18, 0, 1.15, 0, s.dark, { shade: 0.04 });
      b.box(1.2, 0.1, 0.22, 0, 0.6, 0, s.metal);
      b.box(1.2, 0.1, 0.22, 0, 1.7, 0, s.metal);
      b.sphere(0.07, 0.45, 1.15, 0.14, s.accent, 5);
    } else {
      // sliding tech door with glowing seam
      b.box(0.62, 2.3, 0.2, -0.34, 1.15, 0, s.machine);
      b.box(0.62, 2.3, 0.2, 0.34, 1.15, 0, s.machine);
      b.box(0.06, 2.1, 0.26, 0, 1.15, 0, s.accent, { slot: SLOT_GLOW });
      b.box(1.3, 0.06, 0.26, 0, 2.28, 0, s.accent, { slot: SLOT_GLOW });
      if (t >= 5) b.sphere(0.08, 0.75, 2.6, th / 2 + 0.02, s.accent, 5, { slot: SLOT_GLOW });
    }
  },
  window: (b, s) => {
    const t = s.index;
    const th = 0.6;
    panel(b, s, -1.0, 1.0);
    // cut-in: cover the middle of the panel with a glass box slightly proud of the wall
    b.box(1.3, 1.2, th + 0.16, 0, 1.75, 0, s.trim);
    b.box(1.1, 1.0, th + 0.2, 0, 1.75, 0, '#ffffff', { slot: SLOT_GLASS });
    if (t <= 2) {
      b.box(0.08, 1.0, th + 0.24, 0, 1.75, 0, s.trim);
      b.box(1.1, 0.08, th + 0.24, 0, 1.75, 0, s.trim);
    } else {
      b.box(1.1, 0.05, th + 0.24, 0, 1.75, 0, s.accent, { slot: SLOT_GLOW });
    }
  },
  gate: (b, s) => {
    const t = s.index;
    const H = WALL_H + 0.5;
    b.box(0.46, H, 0.7, -0.85, H / 2, 0, s.trim, { shade: 0.03 });
    b.box(0.46, H, 0.7, 0.85, H / 2, 0, s.trim, { shade: 0.03 });
    b.box(2.0, 0.42, 0.78, 0, H - 0.2, 0, t >= 2 ? s.base : s.trim, { shade: 0.03 });
    if (t <= 1) {
      for (let i = 0; i < 4; i++) b.cyl(0.08, 0.08, H - 0.6, -0.5 + i * 0.33, (H - 0.6) / 2, 0, s.dark, 5);
      b.box(1.3, 0.12, 0.2, 0, 1.2, 0.1, s.accent);
    } else if (t === 2) {
      for (let i = 0; i < 5; i++) b.box(0.1, H - 0.7, 0.1, -0.56 + i * 0.28, (H - 0.7) / 2, 0, s.metal);
      b.box(1.3, 0.12, 0.2, 0, 1.4, 0.1, s.metal);
    } else {
      b.box(0.62, H - 0.8, 0.22, -0.34, (H - 0.8) / 2, 0, s.machine);
      b.box(0.62, H - 0.8, 0.22, 0.34, (H - 0.8) / 2, 0, s.machine);
      b.box(0.08, H - 1.0, 0.3, 0, (H - 0.8) / 2, 0, s.accent, { slot: SLOT_GLOW });
      b.box(1.3, 0.1, 0.9, 0, H - 0.05, 0, s.accent, { slot: SLOT_GLOW });
      b.sphere(0.12, -0.85, H + 0.1, 0, s.accent, 5, { slot: SLOT_GLOW });
      b.sphere(0.12, 0.85, H + 0.1, 0, s.accent, 5, { slot: SLOT_GLOW });
    }
  },
  fence_core: (b, s) => {
    const t = s.index;
    if (t <= 1) b.cyl(0.14, 0.17, 1.3, 0, 0.65, 0, s.trim, 6);
    else b.box(0.26, 1.3, 0.26, 0, 0.65, 0, s.trim);
    if (t >= 3) b.sphere(0.09, 0, 1.38, 0, s.accent, 5, { slot: SLOT_GLOW });
    else b.box(0.3, 0.08, 0.3, 0, 1.33, 0, t === 2 ? s.accent : s.dark);
  },
  fence_arm: (b, s) => {
    const t = s.index;
    if (t <= 2) {
      b.box(0.72, 0.1, 0.1, 0.64, 0.5, 0, s.base);
      b.box(0.72, 0.1, 0.1, 0.64, 1.0, 0, s.base);
    } else {
      b.box(0.72, 0.08, 0.08, 0.64, 0.4, 0, s.metal);
      b.box(0.72, 0.05, 0.05, 0.64, 0.8, 0, s.accent, { slot: SLOT_GLOW });
      b.box(0.72, 0.05, 0.05, 0.64, 1.1, 0, s.accent, { slot: SLOT_GLOW });
    }
  },
  fence_full: (b, s) => {
    BUILDERS.fence_core(b, s);
    const t = s.index;
    if (t <= 2) {
      b.box(2.0, 0.1, 0.1, 0, 0.5, 0, s.base);
      b.box(2.0, 0.1, 0.1, 0, 1.0, 0, s.base);
    } else {
      b.box(2.0, 0.08, 0.08, 0, 0.4, 0, s.metal);
      b.box(2.0, 0.05, 0.05, 0, 0.8, 0, s.accent, { slot: SLOT_GLOW });
      b.box(2.0, 0.05, 0.05, 0, 1.1, 0, s.accent, { slot: SLOT_GLOW });
    }
  },
  pillar: (b, s) => {
    post(b, s, 0.9, WALL_H + 0.4);
    b.box(1.3, 0.25, 1.3, 0, 0.12, 0, s.trim);
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
  },
  roof_tile: (b, s) => {
    const t = s.index;
    const y = ROOF_Y + 0.11;
    if (t <= 1) {
      // overlapping planks
      for (let i = 0; i < 3; i++) b.box(2.1, 0.2, 0.68, 0, y + (i % 2) * 0.04, -0.7 + i * 0.7, i % 2 ? s.roofEdge : s.roof, { shade: 0.05 });
      if (t === 1) b.box(2.1, 0.08, 0.1, 0, y + 0.18, 0, s.accent);
    } else if (t === 2) {
      // stone slabs
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) b.box(1.0, 0.22, 1.0, -0.52 + i * 1.04, y + ((i + j) % 2) * 0.03, -0.52 + j * 1.04, (i + j) % 2 ? s.roof : s.roofEdge, { shade: 0.06 });
    } else if (t === 3) {
      // riveted metal panel with a thin dark frame
      b.box(2.1, 0.22, 2.1, 0, y, 0, s.roof, { shade: 0.015 });
      b.box(2.1, 0.05, 0.1, 0, y + 0.13, 1.0, s.roofEdge);
      b.box(2.1, 0.05, 0.1, 0, y + 0.13, -1.0, s.roofEdge);
      b.box(0.1, 0.05, 2.1, 1.0, y + 0.13, 0, s.roofEdge);
      b.box(0.1, 0.05, 2.1, -1.0, y + 0.13, 0, s.roofEdge);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.sphere(0.05, sx * 0.8, y + 0.13, sz * 0.8, s.metal, 4);
    } else if (t === 4) {
      b.box(2.1, 0.22, 2.1, 0, y, 0, s.roof, { shade: 0.01 });
      b.box(1.7, 0.04, 1.7, 0, y + 0.13, 0, s.roofEdge);
      b.box(1.5, 0.03, 0.06, 0, y + 0.16, 0, s.accent, { slot: SLOT_GLOW });
    } else if (t === 5) {
      b.box(2.1, 0.22, 2.1, 0, y, 0, s.roof, { shade: 0.01 });
      b.box(2.1, 0.03, 0.06, 0, y + 0.13, 1.0, s.accent, { slot: SLOT_GLOW });
      b.box(0.06, 0.03, 2.1, 1.0, y + 0.13, 0, s.accent, { slot: SLOT_GLOW });
      b.sphere(0.07, 0, y + 0.14, 0, s.accent, 4, { slot: SLOT_GLOW });
    } else {
      b.box(2.1, 0.22, 2.1, 0, y, 0, s.roof, { shade: 0.005 });
      b.box(1.6, 0.04, 1.6, 0, y + 0.13, 0, s.roofEdge);
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
