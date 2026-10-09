/**
 * Cosmetic decor models: the exclusive decor that `decoration` cosmetics unlock (data/decorCosmetic.ts).
 *
 *  - Zen Rock Garden:   zen_garden (raked gravel, three mossy stones, a stone lantern), bonsai_stand
 *  - Harvest Festival:  harvest_display (pumpkins, hay, produce crates), hay_bales
 *  - Lantern Festival:  lantern_arch, lantern_string
 *  - Holo Trees:        holo_tree
 *  - Campfire Lounge:   campfire_lounge (stone fire pit, log benches, string lights)
 *  - Meteorite Fountain: meteor_fountain (a stone basin round a softly glowing meteorite)
 *
 * Style: a well-loved frontier camp. Good materials (weathered timber, rough stone, canvas, rope,
 * brass, glazed clay, crystal), muted rich colours, warm light pools at night — and the cozy world kit
 * (models/nature.ts): rounded mossy stones, puffy foliage, vertical colour gradients baked into the
 * vertex colours. They are cosmetic, not tiered: they look the same at every colony tier. Animated
 * bits (fire, the hologram scan ring, the meteorite's glow motes) are parts and emitters.
 */
import * as THREE from 'three';
import { SLOT_GLOW, type GeoBuilder, type PrimOpts } from '../core/GeoBuilder';
import { registerModel } from './spec';

const GRASS_LO = '#4f9a44';
const GRASS_HI = '#8cc35a';
const MOSS_LO = '#5b9a3c';
const MOSS_HI = '#9cc85a';
const TIMBER = '#7a5434';
const TIMBER_HI = '#a87a4e';
const TIMBER_DARK = '#4e3522';
const STONE_LO = '#857e7a';
const STONE_HI = '#c4bbb0';
const STONE2_LO = '#8e8478';
const STONE2_HI = '#cdc2b0';
const GRAVEL = '#d9cdb2';
const GRAVEL_RIDGE = '#c2b497';
const STRAW = '#c99a48';
const STRAW_HI = '#e6c47a';
const STRAW_BAND = '#7a5a2e';
const ROPE = '#a88a5c';
const BRASS = '#b08a3e';
const BRASS_HI = '#e2c27a';
const LAMP = '#ffc46a';
const P = (o: PrimOpts): PrimOpts => o;

/** A soft, low grassy mound (top `h` above the ground) for small decor to stand on. */
function lawn(b: GeoBuilder, r: number, h = 0.08): void {
  const sy = 0.3;
  b.puff(r, 0, h - r * sy, 0, GRASS_LO, 1, P({ sy, grad: GRASS_HI, shade: 0.04 }));
}

/** A rounded, weathered stone with an optional moss cushion on top. */
function stone(b: GeoBuilder, r: number, x: number, z: number, moss = true, lo = STONE_LO, hi = STONE_HI, sy = 0.72, y = 0): void {
  b.gem(r, x, y + r * sy * 0.82, z, lo, 1, 0.12, P({ sy, sx: 1.06, grad: hi, shade: 0.06 }));
  if (moss) b.gem(r * 0.72, x - r * 0.08, y + r * sy * 1.45, z + r * 0.05, MOSS_LO, 0, 0.12, P({ sy: 0.32, grad: MOSS_HI }));
}

/** A split log seat on two short stumps (length along x, rotated by `ry`). */
function logBench(b: GeoBuilder, len: number, x: number, z: number, ry: number): void {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  for (const k of [-1, 1]) {
    const ox = x + c * k * len * 0.32;
    const oz = z - s * k * len * 0.32;
    b.cyl(0.17, 0.2, 0.28, ox, 0.14, oz, TIMBER_DARK, 7, P({ grad: TIMBER }));
  }
  b.cyl(0.21, 0.22, len, x, 0.4, z, TIMBER, 8, P({ rz: Math.PI / 2, ry, shade: 0.05 }));
  // the flat split face on top, pale heartwood at the ends
  b.box(len * 0.98, 0.04, 0.3, x, 0.57, z, '#b88a58', P({ ry }));
  for (const k of [-1, 1]) b.cyl(0.17, 0.17, 0.03, x + c * k * len * 0.5, 0.4, z - s * k * len * 0.5, '#d2ab74', 8, P({ rz: Math.PI / 2, ry }));
}

/**
 * Paper lantern (glows), hanging from (x, y, z): a dark cap, the glowing bell and a short tassel.
 * Warm, grown-up colours only (amber, deep red, cream).
 */
function paperLantern(b: GeoBuilder, x: number, y: number, z: number, col: string, r = 0.22): void {
  b.cyl(0.01, 0.01, 0.16, x, y - 0.08, z, '#3a2a20', 3);
  b.cyl(r * 0.55, r * 0.6, 0.06, x, y - 0.18, z, '#2e2420', 7);
  b.lathe([r * 0.55, 0, r * 0.95, r * 0.45, r, r * 0.9, r * 0.9, r * 1.4, r * 0.55, r * 1.75], x, y - 0.21 - r * 1.75, z, col, 9, P({ slot: SLOT_GLOW }));
  b.cyl(r * 0.5, r * 0.55, 0.05, x, y - 0.24 - r * 1.75, z, '#2e2420', 7);
  b.cone(0.035, 0.14, x, y - 0.35 - r * 1.75, z, '#8a2a22', 4, P({ rx: Math.PI }));
}

/** A string of small warm bulbs sagging from (x0,y0,z0) to (x1,y1,z1). */
function stringLights(b: GeoBuilder, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, sag: number, bulbs: number): void {
  const pts: number[] = [];
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * sag, z0 + (z1 - z0) * t);
  }
  b.pipe(pts, 0.015, '#2e2622', 3, false);
  for (let i = 0; i < bulbs; i++) {
    const t = (i + 0.5) / bulbs;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * sag;
    const z = z0 + (z1 - z0) * t;
    b.puff(0.055, x, y - 0.07, z, i % 3 === 1 ? '#ffd9a0' : LAMP, 0, P({ slot: SLOT_GLOW, sy: 1.25 }));
  }
}

/** A stone lantern (tōrō): footing, post, a glowing fire box under a stepped roof. */
function stoneLantern(b: GeoBuilder, x: number, z: number, s = 1): void {
  const st = '#9a9288';
  const sh = '#cfc6b8';
  b.cyl(0.26 * s, 0.3 * s, 0.12 * s, x, 0.06 * s, z, st, 6, P({ grad: sh }));
  b.cyl(0.1 * s, 0.13 * s, 0.5 * s, x, 0.37 * s, z, st, 6, P({ grad: sh }));
  b.cyl(0.24 * s, 0.2 * s, 0.08 * s, x, 0.66 * s, z, st, 6, P({ grad: sh }));
  b.box(0.26 * s, 0.24 * s, 0.26 * s, x, 0.82 * s, z, LAMP, P({ slot: SLOT_GLOW }));
  for (const k of [-1, 1]) for (const m of [-1, 1]) b.box(0.05 * s, 0.26 * s, 0.05 * s, x + k * 0.13 * s, 0.82 * s, z + m * 0.13 * s, st);
  b.cone(0.34 * s, 0.24 * s, x, 1.05 * s, z, st, 6, P({ grad: sh, shade: 0.04 }));
  b.puff(0.05 * s, x, 1.2 * s, z, sh, 0);
  b.puff(0.14 * s, x + 0.12 * s, 1.0 * s, z - 0.05 * s, MOSS_LO, 0, P({ sy: 0.35, grad: MOSS_HI }));
}

/** A bonsai pine: twisting trunk, layered cloud-pads of needles cut into facets. Grows from (x, y, z). */
function bonsai(b: GeoBuilder, x: number, y: number, z: number, s = 1): void {
  const bark = '#5e4030';
  const barkHi = '#8e6a48';
  const lo = '#24583a';
  const hi = '#5e9a50';
  b.cyl(0.07 * s, 0.11 * s, 0.42 * s, x + 0.04 * s, y + 0.2 * s, z, bark, 6, P({ rz: -0.35, grad: barkHi, flat: true }));
  b.cyl(0.05 * s, 0.07 * s, 0.4 * s, x + 0.02 * s, y + 0.55 * s, z, bark, 6, P({ rz: 0.5, grad: barkHi, flat: true }));
  b.cyl(0.03 * s, 0.05 * s, 0.36 * s, x + 0.2 * s, y + 0.5 * s, z + 0.04 * s, bark, 5, P({ rz: -1.1, grad: barkHi, flat: true }));
  const pads: [number, number, number, number][] = [
    [0.3, -0.12, 0.8, 0],
    [0.22, 0.38, 0.62, 0.06],
    [0.19, -0.02, 1.0, -0.04],
  ];
  for (const [r, px, py, pz] of pads) {
    b.gem(r * s, x + px * s, y + py * s, z + pz * s, lo, 1, 0.12, P({ sy: 0.55, grad: hi, shade: 0.07 }));
    b.gem(r * 0.6 * s, x + (px + r * 0.55) * s, y + (py - 0.02) * s, z + (pz + r * 0.3) * s, lo, 0, 0.12, P({ sy: 0.6, grad: hi }));
    b.gem(r * 0.55 * s, x + (px - r * 0.5) * s, y + (py - 0.03) * s, z + (pz - r * 0.35) * s, lo, 0, 0.12, P({ sy: 0.6, grad: hi }));
  }
}

/** A ribbed pumpkin of radius r at (x, z) standing at y0. `col` / `hi` for the muted heirloom colours. */
function pumpkin(b: GeoBuilder, x: number, z: number, r: number, y0 = 0, col = '#c8682c', hi = '#e89a52'): void {
  const ribs = 6;
  for (let i = 0; i < ribs; i++) {
    const a = (i / ribs) * Math.PI * 2;
    b.puff(r * 0.6, x + Math.cos(a) * r * 0.42, y0 + r * 0.66, z + Math.sin(a) * r * 0.42, col, 0, P({ sy: 1.1, grad: hi, shade: 0.03 }));
  }
  b.puff(r * 0.55, x, y0 + r * 0.7, z, col, 0, P({ sy: 1.15, grad: hi }));
  b.cyl(r * 0.07, r * 0.11, r * 0.34, x, y0 + r * 1.36, z, '#5e5a32', 5, P({ rz: 0.25 }));
}

/** A slatted wooden produce crate (w x d, open top) at (x, y, z), filled with round produce of `fill`. */
function crate(b: GeoBuilder, w: number, d: number, h: number, x: number, y: number, z: number, ry: number, fill: string[] | null): void {
  b.planks(w, h, d, x, y + h / 2, z, 3, '#a87a4a', '#93683c', 'y', 0.03, 0, P({ ry, shade: 0.05 }));
  b.box(w * 0.92, 0.03, d * 0.92, x, y + h * 0.85, z, '#5a3e26', P({ ry }));
  if (!fill) return;
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  let k = 0;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 2; j++) {
      const lx = (i - 1) * w * 0.28;
      const lz = (j - 0.5) * d * 0.42;
      b.puff(Math.min(w, d) * 0.17, x + c * lx + s * lz, y + h * 0.9, z - s * lx + c * lz, fill[k++ % fill.length], 0, P({ sy: 0.9 }));
    }
  }
}

/** A tied hay bale (w x h x d) at (x, y, z). */
function hayBale(b: GeoBuilder, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0): void {
  b.bevelBox(w, h, d, x, y + h / 2, z, STRAW, Math.min(w, h, d) * 0.18, P({ grad: STRAW_HI, shade: 0.07, ry }));
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  for (const k of [-0.28, 0.28]) b.bevelBox(0.04, h + 0.03, d + 0.03, x + c * k * w, y + h / 2, z - s * k * w, STRAW_BAND, 0.01, P({ ry }));
}

// ======================================================================== Zen Rock Garden

registerModel('zen_garden', (c) => {
  const { b } = c;
  const half = 1.85;
  // a low timber frame round a bed of pale raked gravel
  b.box(half * 2 - 0.1, 0.12, half * 2 - 0.1, 0, 0.06, 0, GRAVEL, P({ shade: 0.02 }));
  for (const k of [-1, 1]) {
    b.box(half * 2 + 0.1, 0.18, 0.16, 0, 0.09, k * half, TIMBER, P({ grad: TIMBER_HI, shade: 0.04 }));
    b.box(0.16, 0.18, half * 2 + 0.1, k * half, 0.09, 0, TIMBER, P({ grad: TIMBER_HI, shade: 0.04 }));
  }
  // raked furrows (straight lines), rings around the stones
  for (let i = 0; i < 9; i++) b.box(half * 2 - 0.3, 0.025, 0.05, 0, 0.13, -1.55 + i * 0.39, GRAVEL_RIDGE);
  const stones: [number, number, number][] = [
    [0.52, -0.55, -0.45],
    [0.34, 0.75, 0.35],
    [0.24, 0.15, 0.95],
  ];
  for (const [r, x, z] of stones) {
    b.cyl(r + 0.32, r + 0.32, 0.03, x, 0.13, z, GRAVEL, 14);
    b.torus(r + 0.16, 0.025, x, 0.14, z, GRAVEL_RIDGE, 14, 3, { rx: Math.PI / 2 });
    b.torus(r + 0.3, 0.025, x, 0.14, z, GRAVEL_RIDGE, 16, 3, { rx: Math.PI / 2 });
  }
  stone(b, 0.52, -0.55, -0.45, true, STONE_LO, STONE_HI, 0.95, 0.1);
  stone(b, 0.34, 0.75, 0.35, true, STONE2_LO, STONE2_HI, 0.8, 0.1);
  stone(b, 0.24, 0.15, 0.95, false, STONE_LO, STONE_HI, 0.7, 0.1);
  // a stone lantern in one corner, a mossy mound with a fern in another
  stoneLantern(b, 1.3, -1.3, 0.95);
  b.gem(0.42, -1.35, 0.1, 1.3, '#3e7a34', 1, 0.12, P({ sy: 0.45, grad: '#7aa848', shade: 0.05 }));
  for (let i = 0; i < 5; i++) {
    const a = i * 1.26 + 0.2;
    b.puff(0.32, -1.35 + Math.cos(a) * 0.18, 0.28, 1.3 + Math.sin(a) * 0.18, '#3f8a44', 0, P({ sx: 0.22, sy: 0.06, sz: 0.9, ry: -a + Math.PI / 2, rx: -0.5, grad: '#86c060' }));
  }
  // a wooden rake resting on the frame
  b.cyl(0.025, 0.025, 1.5, -0.2, 0.24, -1.62, '#b08a5a', 4, P({ rz: Math.PI / 2 - 0.12 }));
  b.box(0.06, 0.05, 0.42, 0.55, 0.16, -1.62, '#8a6a42');
  c.setLight(1.3, 0.85, -1.3, LAMP, 0.55, 5);
});

registerModel('bonsai_stand', (c) => {
  const { b } = c;
  lawn(b, 0.85, 0.06);
  // a low cedar stand with splayed legs
  b.bevelBox(0.95, 0.08, 0.62, 0, 0.5, 0, TIMBER, 0.02, P({ grad: TIMBER_HI }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.07, 0.48, 0.07, sx * 0.38, 0.24, sz * 0.22, TIMBER_DARK, P({ rz: -sx * 0.08 }));
  b.box(0.8, 0.04, 0.05, 0, 0.18, 0.22, TIMBER_DARK);
  b.box(0.8, 0.04, 0.05, 0, 0.18, -0.22, TIMBER_DARK);
  // a shallow glazed pot (deep slate blue), moss, a pebble and the little pine
  b.lathe([0.2, 0, 0.36, 0.02, 0.38, 0.08, 0.36, 0.16, 0.33, 0.17], 0, 0.54, 0, '#3a5664', 12, P({ grad: '#5c7e8a', shade: 0.02 }));
  b.cyl(0.32, 0.32, 0.03, 0, 0.71, 0, '#5a4430', 12);
  b.gem(0.26, 0.05, 0.7, 0.02, MOSS_LO, 1, 0.1, P({ sy: 0.18, grad: MOSS_HI }));
  b.gem(0.06, -0.2, 0.74, 0.1, STONE_HI, 0, 0.15, P({ sy: 0.7 }));
  bonsai(b, 0, 0.72, 0, 0.95);
  // a smooth river stone and a folded cloth beside the stand
  stone(b, 0.2, 0.62, 0.52, true);
  b.box(0.26, 0.04, 0.18, -0.32, 0.56, 0.12, '#c8b89a', P({ ry: 0.3 }));
});

// ======================================================================== Harvest Festival

registerModel('harvest_display', (c) => {
  const { b } = c;
  lawn(b, 2.1, 0.05);
  // hay bales stacked at the back, a canvas-draped crate table
  hayBale(b, 1.3, 0.62, 0.72, -0.85, 0, -1.2);
  hayBale(b, 1.3, 0.62, 0.72, 0.55, 0, -1.25, 0.05);
  hayBale(b, 1.2, 0.58, 0.68, -0.2, 0.62, -1.22, -0.08);
  // pumpkins in heirloom colours: rust orange, cream and sage-grey
  pumpkin(b, -0.25, -0.1, 0.55, 0.02);
  pumpkin(b, 0.55, 0.15, 0.4, 0.02, '#e2d3b0', '#f4ead2');
  pumpkin(b, -1.1, 0.45, 0.36, 0.02, '#7d8a6c', '#a4b090');
  pumpkin(b, -0.85, -0.55, 0.3, 0.62, '#b4572a', '#dc8848');
  pumpkin(b, 0.25, -0.75, 0.24, 0.62, '#e2d3b0', '#f4ead2');
  // produce crates: apples, golden squash, purple roots
  crate(b, 0.7, 0.5, 0.42, 1.25, 0.02, 0.7, -0.3, ['#a8322a', '#c8402e', '#8e2a24']);
  crate(b, 0.62, 0.46, 0.38, 1.35, 0.02, -0.1, 0.25, ['#d8a23a', '#c88a2a']);
  crate(b, 0.6, 0.44, 0.36, 0.45, 0.02, 1.25, 0.1, ['#6a3a5a', '#7e4868', '#a8322a']);
  // corn sheaf tied with twine, a burlap sack
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    b.cyl(0.03, 0.05, 1.3, -1.5 + Math.cos(a) * 0.08, 0.68, 1.2 + Math.sin(a) * 0.08, '#c8a858', 4, P({ rz: Math.cos(a) * 0.16, rx: -Math.sin(a) * 0.16, grad: '#e6cf8a' }));
  }
  b.cyl(0.12, 0.12, 0.08, -1.5, 0.75, 1.2, STRAW_BAND, 8);
  b.puff(0.36, -0.55, 0.32, 1.35, '#a88c62', 1, P({ sy: 1.05, grad: '#c8ae84', shade: 0.06 }));
  b.cyl(0.1, 0.14, 0.16, -0.55, 0.7, 1.35, '#8e7450', 6);
  // a lantern on a shepherd's hook
  b.cyl(0.035, 0.04, 2.1, 1.65, 1.05, -1.5, TIMBER_DARK, 5);
  b.add(new THREE.TorusGeometry(0.15, 0.025, 3, 8, Math.PI), TIMBER_DARK, 1.5, 2.08, -1.5);
  b.cyl(0.11, 0.13, 0.26, 1.35, 1.8, -1.5, LAMP, 6, P({ slot: SLOT_GLOW }));
  b.cone(0.14, 0.1, 1.35, 1.98, -1.5, '#2e2622', 6);
  c.setLight(1.35, 1.8, -1.4, LAMP, 0.7, 7);
});

registerModel('hay_bales', (c) => {
  const { b } = c;
  lawn(b, 0.95, 0.05);
  hayBale(b, 1.15, 0.56, 0.66, -0.1, 0, -0.22);
  hayBale(b, 1.0, 0.5, 0.6, 0.0, 0.56, -0.2, 0.18);
  hayBale(b, 0.6, 0.5, 0.95, 0.62, 0, 0.42, 0.1);
  pumpkin(b, -0.45, 0.5, 0.28, 0.02, '#c8682c', '#e89a52');
  pumpkin(b, -0.1, -0.05, 0.2, 1.06, '#e2d3b0', '#f4ead2');
  // a pitchfork leaning on the stack: the handle tilts toward +x, the tines carry on along it
  const tilt = 0.32;
  const dx = Math.sin(tilt);
  const dy = Math.cos(tilt);
  const fx = -0.62 + dx * 0.75;
  const fy = 0.72 + dy * 0.75;
  b.cyl(0.022, 0.022, 1.5, -0.62, 0.72, 0.1, '#a8865a', 4, P({ rz: -tilt }));
  b.box(0.03, 0.03, 0.18, fx, fy, 0.1, '#5e5e64', P({ rz: -tilt }));
  for (let i = -1; i <= 1; i++) b.cyl(0.012, 0.008, 0.26, fx + dx * 0.13, fy + dy * 0.13, 0.1 + i * 0.07, '#6a6a70', 3, P({ rz: -tilt }));
});

// ======================================================================== Lantern Festival

registerModel('lantern_arch', (c) => {
  const { b } = c;
  const lacquer = '#8e3328';
  const lacquerHi = '#b4503a';
  for (const sx of [-1, 1]) {
    b.cyl(0.24, 0.3, 0.3, sx * 1.55, 0.15, 0, STONE_LO, 8, P({ grad: STONE_HI }));
    b.cyl(0.13, 0.15, 2.7, sx * 1.55, 1.65, 0, lacquer, 8, P({ grad: lacquerHi, shade: 0.03 }));
    b.cyl(0.16, 0.16, 0.08, sx * 1.55, 2.98, 0, BRASS, 8);
  }
  // an upswept timber lintel over a lacquered tie beam, a carved wooden plaque in the middle
  b.box(3.3, 0.2, 0.3, 0, 3.1, 0, TIMBER_DARK, P({ grad: TIMBER }));
  for (const sx of [-1, 1]) b.box(0.5, 0.2, 0.3, sx * 1.84, 3.16, 0, TIMBER_DARK, P({ rz: sx * 0.28, grad: TIMBER }));
  b.box(3.6, 0.06, 0.34, 0, 3.22, 0, '#3a2a1e');
  b.box(3.4, 0.14, 0.2, 0, 2.62, 0, lacquer, P({ grad: lacquerHi }));
  b.bevelBox(0.62, 0.36, 0.08, 0, 2.85, 0.13, TIMBER_HI, 0.03);
  b.box(0.42, 0.04, 0.02, 0, 2.9, 0.18, BRASS_HI);
  b.box(0.3, 0.04, 0.02, 0, 2.8, 0.18, BRASS_HI);
  // lanterns under the beam: amber, deep red and cream
  const cols = ['#ffb35a', '#d8553e', '#ffe2b0', '#d8553e', '#ffb35a'];
  for (let i = 0; i < 5; i++) paperLantern(b, -1.2 + i * 0.6, 2.55, 0, cols[i], i % 2 ? 0.16 : 0.19);
  c.setLight(0, 2.1, 0, '#ffb86a', 0.9, 8);
});

registerModel('lantern_string', (c) => {
  const { b } = c;
  for (const sx of [-1, 1]) {
    b.cyl(0.07, 0.09, 2.4, sx * 1.65, 1.2, 0, TIMBER, 6, P({ grad: TIMBER_HI }));
    b.cyl(0.1, 0.1, 0.06, sx * 1.65, 2.42, 0, BRASS, 6);
    stone(b, 0.22, sx * 1.65, 0.05, true);
  }
  // a sagging rope between the posts with six little lanterns
  const pts: number[] = [];
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push(-1.65 + t * 3.3, 2.3 - Math.sin(t * Math.PI) * 0.55, 0);
  }
  b.pipe(pts, 0.02, ROPE, 3, false);
  const cols = ['#ffb35a', '#ffe2b0', '#d8553e', '#ffb35a', '#ffe2b0', '#d8553e'];
  for (let i = 0; i < 6; i++) {
    const t = (i + 1) / 7;
    paperLantern(b, -1.65 + t * 3.3, 2.3 - Math.sin(t * Math.PI) * 0.55, 0, cols[i], 0.13);
  }
  c.setLight(0, 1.6, 0, '#ffd08a', 0.7, 7);
});

// ======================================================================== Holo Trees

registerModel('holo_tree', (c) => {
  const { b } = c;
  // a brass planter with a projector lens and a riveted band
  b.lathe([0.42, 0, 0.46, 0.1, 0.4, 0.42, 0.44, 0.48, 0.36, 0.5], 0, 0, 0, BRASS, 10, P({ grad: BRASS_HI, shade: 0.03 }));
  b.cyl(0.43, 0.43, 0.05, 0, 0.26, 0, '#6a5228', 10);
  b.cyl(0.32, 0.32, 0.04, 0, 0.5, 0, '#2e3238', 10);
  b.cyl(0.12, 0.14, 0.06, 0, 0.54, 0, '#9ff6ff', 8, { slot: SLOT_GLOW });
  // the hologram: a cyan tree of light with pale violet blossoms (glow only, so it reads at night)
  b.cyl(0.05, 0.09, 1.25, 0, 1.12, 0, '#4fd8ff', 6, { slot: SLOT_GLOW });
  b.cyl(0.03, 0.04, 0.45, 0.2, 1.55, 0, '#4fd8ff', 4, { slot: SLOT_GLOW, rz: -0.7 });
  const holo: [number, number, number, number, string][] = [
    [0.55, 0, 2.05, 0, '#3ec8e0'],
    [0.4, 0.45, 1.85, 0.12, '#58d6ea'],
    [0.38, -0.44, 1.9, -0.1, '#58d6ea'],
    [0.36, 0.05, 1.82, -0.42, '#3ec8e0'],
    [0.34, -0.05, 1.86, 0.42, '#58d6ea'],
    [0.34, 0.1, 2.5, 0.02, '#86e6f6'],
  ];
  for (const [r, x, y, z, col] of holo) b.gem(r, x, y, z, col, 1, 0.06, { slot: SLOT_GLOW });
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05 + 0.3;
    b.puff(0.06, Math.cos(a) * 0.62, 2.0 + (i % 3) * 0.2 - 0.1, Math.sin(a) * 0.62, '#c4b4f0', 0, { slot: SLOT_GLOW });
  }
  // faint projector scan lines around the canopy
  for (const [r, y] of [[0.72, 1.78], [0.8, 2.08], [0.6, 2.4]] as const) b.torus(r, 0.012, 0, y, 0, '#bdf6ff', 18, 3, { rx: Math.PI / 2, slot: SLOT_GLOW });
  // scan ring sliding up and down the hologram
  c.part('bob', 0, 1.7, 0, (pb) => {
    pb.torus(0.62, 0.022, 0, 0, 0, '#c8f8ff', 16, 3, { rx: Math.PI / 2, slot: SLOT_GLOW });
  }, 1.4, 0.55);
  c.emit('motes', 0, 1.9, 0, 1.4, '#7fe8ff');
  c.setLight(0, 1.9, 0, '#5ef2ff', 0.6, 6);
});

// ======================================================================== Campfire Lounge

registerModel('campfire_lounge', (c) => {
  const { b } = c;
  // trampled earth round a stone fire pit
  b.cyl(1.25, 1.35, 0.06, 0, 0.03, 0.1, '#8a6a4a', 16, P({ grad: '#9c7a56' }));
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 0.18 + ((i * 7) % 4) * 0.025;
    b.puff(r, Math.cos(a) * 0.62, r * 0.55, 0.1 + Math.sin(a) * 0.62, i % 2 ? STONE_LO : STONE2_LO, 0, P({ sy: 0.75, grad: i % 2 ? STONE_HI : STONE2_HI }));
  }
  b.cyl(0.5, 0.52, 0.05, 0, 0.05, 0.1, '#3a302a', 12);
  // a log teepee with glowing embers at its foot
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    b.cyl(0.045, 0.06, 0.8, Math.cos(a) * 0.17, 0.32, 0.1 + Math.sin(a) * 0.17, TIMBER_DARK, 5, P({ rz: Math.cos(a) * 0.45, rx: -Math.sin(a) * 0.45 }));
  }
  b.puff(0.22, 0, 0.1, 0.1, '#ff8a3a', 0, P({ slot: SLOT_GLOW, sy: 0.5 }));
  b.puff(0.12, 0.1, 0.25, 0.05, '#ffc86a', 0, P({ slot: SLOT_GLOW }));
  c.part('sway', 0, 0.2, 0.1, (pb) => {
    pb.cone(0.2, 0.55, 0, 0.3, 0, '#ff9a3a', 6, { slot: SLOT_GLOW });
    pb.cone(0.12, 0.38, 0.04, 0.42, 0.03, '#ffd27a', 5, { slot: SLOT_GLOW });
  }, 5, 0.06);
  c.emit('fire', 0, 0.45, 0.1, 6, '#ffa040');
  c.emit('smoke', 0, 1.1, 0.1, 1.2);
  // log benches on three sides, a wool blanket over one
  logBench(b, 1.5, 0, -1.25, 0);
  logBench(b, 1.3, -1.3, 0.35, Math.PI / 2 - 0.25);
  logBench(b, 1.3, 1.3, 0.35, -Math.PI / 2 + 0.25);
  b.box(0.7, 0.05, 0.42, 0.15, 0.6, -1.25, '#7a3a2e', P({ ry: 0.08 }));
  b.box(0.66, 0.06, 0.06, 0.15, 0.62, -1.08, '#d8c8a0', P({ ry: 0.08 }));
  b.box(0.06, 0.32, 0.44, 0.48, 0.45, -1.22, '#7a3a2e', P({ ry: 0.08 }));
  // a kettle on a tripod over the fire
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    b.cyl(0.02, 0.02, 1.45, Math.cos(a) * 0.45, 0.68, 0.1 + Math.sin(a) * 0.45, '#3a3634', 4, P({ rz: Math.cos(a) * 0.32, rx: -Math.sin(a) * 0.32 }));
  }
  b.cyl(0.006, 0.006, 0.4, 0, 1.1, 0.1, '#3a3634', 3);
  b.lathe([0.08, 0, 0.15, 0.05, 0.16, 0.14, 0.1, 0.22, 0.05, 0.24], 0, 0.78, 0.1, '#4a4e52', 9, P({ grad: '#7a8088' }));
  // string lights strung round the lounge on four posts
  for (const [x, z] of [[-1.7, -1.7], [1.7, -1.7], [1.7, 1.75], [-1.7, 1.75]] as const) {
    b.cyl(0.06, 0.08, 2.3, x, 1.15, z, TIMBER, 6, P({ grad: TIMBER_HI }));
    b.cyl(0.08, 0.08, 0.05, x, 2.3, z, BRASS, 6);
  }
  stringLights(b, -1.7, 2.25, -1.7, 1.7, 2.25, -1.7, 0.35, 8);
  stringLights(b, -1.7, 2.25, -1.7, -1.7, 2.25, 1.75, 0.35, 8);
  stringLights(b, 1.7, 2.25, -1.7, 1.7, 2.25, 1.75, 0.35, 8);
  stringLights(b, -1.7, 2.25, 1.75, 1.7, 2.25, 1.75, 0.35, 8);
  // a stack of firewood and a tin mug
  for (let i = 0; i < 3; i++) b.cyl(0.08, 0.08, 0.55, 1.45 - i * 0.05, 0.09 + (i === 2 ? 0.14 : 0), -0.75 + (i % 2) * 0.17 + (i === 2 ? 0.08 : 0), TIMBER, 6, P({ rx: Math.PI / 2 }));
  b.cyl(0.05, 0.045, 0.1, -0.85, 0.65, 0.4, '#8a9096', 7);
  c.setLight(0, 0.8, 0.1, '#ff9a4a', 1.2, 9);
});

// ======================================================================== Meteorite Fountain

registerModel('meteor_fountain', (c) => {
  const { b } = c;
  // a round basin of rough-hewn stone blocks, moss in the joints, clear water
  b.lathe([1.62, 0, 1.72, 0.1, 1.68, 0.5, 1.52, 0.58, 1.42, 0.52, 1.4, 0.2, 0, 0.2], 0, 0, 0, '#8e867e', 12, P({ grad: '#c8bfb2', shade: 0.05 }));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    b.box(0.06, 0.4, 0.06, Math.cos(a) * 1.69, 0.3, Math.sin(a) * 1.69, '#6e6862', P({ ry: -a }));
  }
  for (let i = 0; i < 4; i++) {
    const a = i * 1.57 + 0.6;
    b.gem(0.24, Math.cos(a) * 1.58, 0.58, Math.sin(a) * 1.58, '#3e7a34', 0, 0.12, P({ sy: 0.36, sx: 1.4, grad: '#7aa848', ry: -a }));
  }
  b.cyl(1.42, 1.42, 0.05, 0, 0.44, 0, '#3e8aa0', 14, P({ grad: '#6ab4c4' }));
  // a rocky island holding up the meteorite: dark pitted iron-stone with glowing veins
  stone(b, 0.5, -0.2, 0.15, true, '#7a726a', '#a49a8e', 0.6, 0.35);
  stone(b, 0.36, 0.35, -0.2, false, '#7a726a', '#a49a8e', 0.6, 0.35);
  const my = 1.12;
  // a molten core glowing through the gaps of a cracked, pitted iron-stone crust
  b.gem(0.5, 0, my, 0, '#ff9a3c', 1, 0.08, P({ slot: SLOT_GLOW }));
  const crust: [number, number, number, number][] = [
    [0.36, 0.22, 0.24, 0.18],
    [0.34, -0.26, 0.2, 0.2],
    [0.33, 0.02, 0.3, -0.28],
    [0.3, 0.3, -0.06, -0.2],
    [0.3, -0.3, -0.04, -0.16],
    [0.3, 0.05, -0.12, 0.34],
    [0.26, -0.04, 0.44, 0.02],
  ];
  for (const [r, cx, cy, cz] of crust) b.gem(r, cx, my + cy, cz, '#2e2a30', 0, 0.22, P({ grad: '#5a5258', shade: 0.1, sy: 0.85 }));
  // water spilling from the island, a slow shimmer of warm motes over the stone
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.9;
    b.box(0.08, 0.45, 0.04, Math.cos(a) * 0.62, 0.62, Math.sin(a) * 0.62, '#bfe8f0', { ry: -a, rz: -0.6, slot: SLOT_GLOW });
  }
  b.cyl(0.2, 0.2, 0.02, 0.85, 0.47, 0.6, '#3e6e3a', 8);
  b.puff(0.05, 0.9, 0.5, 0.62, '#f2e6d0', 0);
  b.cyl(0.16, 0.16, 0.02, -0.8, 0.47, -0.65, '#3e6e3a', 8);
  c.emit('drips', 0, 1.0, 0, 3, '#9fdcff');
  c.emit('motes', 0, 1.6, 0, 1.6, '#ffc870');
  c.setLight(0, 1.6, 0, '#ffb45a', 0.9, 8);
});

/** Model keys registered here (data/decorCosmetic.ts uses them; tests enumerate them). */
export const COSMETIC_DECOR_MODELS = ['zen_garden', 'bonsai_stand', 'harvest_display', 'hay_bales', 'lantern_arch', 'lantern_string', 'holo_tree', 'campfire_lounge', 'meteor_fountain'];
