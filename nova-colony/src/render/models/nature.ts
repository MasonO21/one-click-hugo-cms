/**
 * Nature: resource node models (NodeDef.model) and decorative props (BiomeDef.props). All are
 * built at unit scale (node scale jitter is applied per instance) with the ground at y = 0.
 *
 * Look: the painted world map (public/art/biomes) — round puffy canopies lit gold on top and cool
 * underneath, bushy berry shrubs, soft mossy boulders in warm greys and lavenders, pastel crystals,
 * cute rounded pine tiers. Everything is built from smooth blobs (`puff`), bells of revolution
 * (`lathe`) and vertical colour gradients (`grad`) baked into the vertex colours, so the shading
 * stays the shared one-program Lambert and every model stays one instanced draw.
 *
 * Variants: a node model can have looks keyed `<model>~<variant>` (fruit / tall bubble trees, slim
 * and ancient pines, glowberry bushes, desert / snow / crystal boulders). `nodeVariant` picks one
 * per node from its def, its region and a stable hash of its index, so a forest stops looking
 * stamped out while the resource a node gives stays obvious from its silhouette (trees are trees,
 * ore rocks keep their coloured nuggets).
 */
import * as THREE from 'three';
import { GeoBuilder, SLOT_GLOW, type PrimOpts } from '../core/GeoBuilder';

const TRUNK = '#7d4f2c';
const TRUNK_TOP = '#a26a3a';
const TRUNK_DARK = '#5e3b22';
/** Canopy: shaded underside -> sunlit top. */
const LEAF_LO = '#3f9c48';
const LEAF_MID = '#5cb84a';
const LEAF_HI = '#a6d656';
const LEAF_PALE = '#8fd062';
const PINE_LO = '#22704f';
const PINE_HI = '#5fb86a';
const MOSS_LO = '#5fa83f';
const MOSS_HI = '#a9d85c';
/** Warm grey / lavender boulders. */
const ROCK_LO = '#8f8692';
const ROCK_HI = '#cdc4c6';
const ROCK2_LO = '#9a8e84';
const ROCK2_HI = '#cbbfb0';
const BERRY = '#e8384a';
const BERRY_HI = '#ff8a7a';
const CRYSTAL = '#c39cff';
const CRYSTAL_PINK = '#ffb0e4';
const CRYSTAL_CYAN = '#9fe6ff';
const CRYSTAL_LIGHT = '#eadcff';
const ICE = '#bfe6ff';
const SNOW = '#f6f9fd';
const SNOW_SHADE = '#d6e2ee';
const TITAN = '#e4eaf2';
const TITAN_GLOW = '#6ff4ff';

/** Rock colour set: [main low, main high, side low, side high]. */
type RockCols = readonly [string, string, string, string];
const ROCK_STOCK: RockCols = [ROCK_LO, ROCK_HI, ROCK2_LO, ROCK2_HI];
const ROCK_DESERT: RockCols = ['#b9653f', '#e8a26e', '#c97d4f', '#f0b884'];
const ROCK_SNOW: RockCols = ['#8e9cb4', '#c9d4e4', '#9aa6ba', '#d0d9e6'];
const ROCK_CRYSTAL: RockCols = ['#7d6aa8', '#b7a6dc', '#8a78b0', '#c4b4e6'];
const ROCK_TITAN: RockCols = ['#8794a6', '#c4cfdc', '#93a0b0', '#cfd8e4'];

const P = (o: PrimOpts): PrimOpts => o;

/**
 * Soft rounded boulder: a squashed main blob, two leaning companions, optional cap (moss / snow).
 * `detail` 1 near, 0 for far / tiny pieces.
 */
function boulder(b: GeoBuilder, r: number, cols: RockCols = ROCK_STOCK, cap: 'moss' | 'snow' | null = 'moss', detail = 1): void {
  b.puff(r, 0, r * 0.62, 0, cols[0], detail, P({ sy: 0.74, sx: 1.08, grad: cols[1], shade: 0.05 }));
  b.puff(r * 0.62, r * 0.68, r * 0.38, -r * 0.22, cols[2], detail, P({ sy: 0.8, grad: cols[3], shade: 0.05 }));
  if (detail > 0) b.puff(r * 0.48, -r * 0.62, r * 0.3, r * 0.38, cols[2], 0, P({ sy: 0.85, grad: cols[3], shade: 0.06 }));
  // the main blob's top is at 1.36 r: caps sit just under it and overhang its shoulders
  if (cap === 'moss') {
    // a soft moss cushion draped over the top, plus a tuft spilling down the side
    b.puff(r * 0.8, -r * 0.08, r * 1.17, r * 0.06, MOSS_LO, detail, P({ sy: 0.32, grad: MOSS_HI, shade: 0.06 }));
    if (detail > 0) b.puff(r * 0.32, r * 0.62, r * 0.82, -r * 0.2, MOSS_LO, 0, P({ sy: 0.5, grad: MOSS_HI }));
  } else if (cap === 'snow') {
    b.puff(r * 0.84, -r * 0.05, r * 1.2, 0, SNOW_SHADE, detail, P({ sy: 0.3, grad: SNOW }));
  }
}

/** A canopy blob: shaded underside, sunlit top. `detail` 1 = full puff (80 tris), 0 = small blob (20), -1 = side lobe (36). */
function leaf(b: GeoBuilder, r: number, x: number, y: number, z: number, lo = LEAF_LO, hi = LEAF_HI, detail = 1, sy = 1): void {
  if (detail < 0) b.puffLo(r, x, y, z, lo, P({ grad: hi, shade: 0.05, sy }));
  else b.puff(r, x, y, z, lo, detail, P({ grad: hi, shade: 0.05, sy }));
}

/** Gently tapered trunk with a root flare. */
function trunk(b: GeoBuilder, r: number, h: number, seg = 7, col = TRUNK, top = TRUNK_TOP): void {
  b.cyl(r * 0.72, r, h, 0, h / 2, 0, col, seg, P({ grad: top, shade: 0.04 }));
  b.cone(r * 1.55, r * 2.2, 0, r * 1.1, 0, col, seg, P({ shade: 0.04 }));
}

/** Little round fruit / berries scattered over a canopy (lit, with a pale highlight blob). */
function fruit(b: GeoBuilder, n: number, cx: number, cy: number, cz: number, rad: number, size: number, col: string, hi: string, seed = 0): void {
  for (let i = 0; i < n; i++) {
    const a = seed + i * 2.399;
    const h = ((i * 0.618 + seed * 0.37) % 1) * 1.3 - 0.55;
    const rr = rad * Math.sqrt(Math.max(0.15, 1 - h * h));
    b.puff(size, cx + Math.cos(a) * rr, cy + h * rad, cz + Math.sin(a) * rr, col, 0, P({ grad: hi }));
  }
}

/** Rounded pine tier: a soft bell, wide skirt, rounded tip. */
function pineTier(b: GeoBuilder, r: number, h: number, y: number, lo: string, hi: string, seg = 8): void {
  b.lathe([0, 0, r * 0.82, 0.02 * h, r, 0.14 * h, r * 0.78, 0.38 * h, r * 0.42, 0.72 * h, r * 0.12, 0.96 * h, 0, h], 0, y, 0, lo, seg, P({ grad: hi, shade: 0.04 }));
}

/** Pastel crystal shard (glows softly at night). */
function crystal(b: GeoBuilder, r: number, h: number, x: number, y: number, z: number, col: string, rx = 0, rz = 0): void {
  b.shard(r, h, x, y, z, col, P({ slot: SLOT_GLOW, rx, rz }));
}

/** Node builders at unit scale. */
const NODES: Record<string, (b: GeoBuilder) => void> = {
  // ---------------------------------------------------------------- trees
  tree_round: (b) => {
    trunk(b, 0.27, 2.1);
    leaf(b, 1.28, 0, 2.85, 0);
    leaf(b, 0.86, 0.95, 2.5, 0.3, LEAF_LO, LEAF_PALE, -1);
    leaf(b, 0.82, -0.88, 2.55, -0.3, LEAF_LO, LEAF_PALE, -1);
    leaf(b, 0.78, 0.18, 2.45, -0.95, LEAF_LO, LEAF_PALE, -1);
    leaf(b, 0.76, -0.2, 2.5, 0.95, LEAF_LO, LEAF_PALE, -1);
    leaf(b, 0.74, 0.22, 3.75, 0.08, LEAF_MID, LEAF_HI);
  },
  'tree_round~fruit': (b) => {
    trunk(b, 0.27, 2.0);
    leaf(b, 1.3, 0, 2.8, 0, '#47a24a', '#bde45e');
    leaf(b, 0.84, 0.92, 2.5, 0.35, '#47a24a', LEAF_PALE, -1);
    leaf(b, 0.8, -0.9, 2.55, -0.25, '#47a24a', LEAF_PALE, -1);
    leaf(b, 0.74, 0.1, 3.7, -0.1, LEAF_MID, LEAF_HI, -1);
    fruit(b, 7, 0, 2.95, 0, 1.28, 0.14, BERRY, BERRY_HI, 0.4);
  },
  'tree_round~tall': (b) => {
    // a cosy cypress-like poplar: stacked oval puffs
    trunk(b, 0.24, 1.6);
    leaf(b, 0.95, 0, 2.2, 0, '#3e9a4e', '#86cc5e', 1, 1.15);
    leaf(b, 0.82, 0.08, 3.25, 0.05, '#45a44e', '#a2d860', 1, 1.2);
    leaf(b, 0.6, -0.04, 4.15, 0, LEAF_MID, LEAF_HI, 1, 1.25);
    leaf(b, 0.5, 0.45, 2.7, -0.3, '#3e9a4e', LEAF_PALE, 0);
  },
  'tree_round~marsh': (b) => {
    // swampy willow-ish bubble tree: olive-teal puffs with glowing moss beads hanging below
    trunk(b, 0.3, 2.0, 7, '#5e4632', '#7a5c3c');
    leaf(b, 1.3, 0, 2.8, 0, '#3f7a4a', '#9cc45a');
    leaf(b, 0.86, 0.95, 2.45, 0.3, '#3f7a4a', '#88b85a', -1);
    leaf(b, 0.82, -0.9, 2.5, -0.3, '#3f7a4a', '#88b85a', -1);
    leaf(b, 0.7, 0.2, 3.65, 0, '#4f8a4a', '#b0d060', -1);
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26 + 0.3;
      b.cyl(0.03, 0.03, 0.7, Math.cos(a) * 1.0, 1.75, Math.sin(a) * 1.0, '#6a8a4a', 3);
      b.puff(0.1, Math.cos(a) * 1.0, 1.38, Math.sin(a) * 1.0, '#b7ff6a', 0, P({ slot: SLOT_GLOW }));
    }
  },
  tree_pine: (b) => {
    trunk(b, 0.24, 1.6, 7, TRUNK_DARK, TRUNK);
    pineTier(b, 1.45, 1.9, 1.1, PINE_LO, '#3f9a5c');
    pineTier(b, 1.12, 1.75, 2.35, '#2a7c54', '#4fae62');
    pineTier(b, 0.8, 1.55, 3.5, '#33885a', PINE_HI);
    b.puff(0.2, 0, 5.05, 0, '#5fb86a', 0, P({ grad: '#9ad870' }));
  },
  'tree_pine~slim': (b) => {
    trunk(b, 0.22, 1.5, 7, TRUNK_DARK, TRUNK);
    pineTier(b, 1.15, 1.7, 1.0, PINE_LO, '#3a9458');
    pineTier(b, 0.95, 1.6, 2.1, '#287a52', '#46a65e');
    pineTier(b, 0.74, 1.5, 3.15, '#2e8256', '#58b466');
    pineTier(b, 0.5, 1.2, 4.15, '#3a8e5c', PINE_HI);
  },
  'tree_pine~ancient': (b) => {
    // the old giant: thick red trunk, deep tiers and teal crystal veins (as in the Pinewood painting)
    trunk(b, 0.36, 1.9, 8, '#6a3a24', '#9a5a38');
    pineTier(b, 1.5, 1.9, 1.3, '#1f6a4c', '#3a9258');
    pineTier(b, 1.2, 1.8, 2.55, '#246f50', '#44a05c');
    pineTier(b, 0.86, 1.6, 3.7, '#2a7a54', '#58b466');
    crystal(b, 0.08, 0.5, 0.3, 0.9, 0.18, '#5ff0e0', 0.1, -0.2);
    crystal(b, 0.07, 0.4, -0.22, 0.75, -0.2, '#5ff0e0', -0.2, 0.25);
    b.puff(0.22, 0, 5.3, 0, '#58b466', 0, P({ grad: '#9ad870' }));
  },
  // ---------------------------------------------------------------- bushes & grass
  bush: (b) => {
    leaf(b, 0.72, 0, 0.62, 0, '#3f9a44', '#8fd060');
    leaf(b, 0.52, 0.55, 0.45, 0.3, '#3f9a44', '#9ad862', -1);
    leaf(b, 0.5, -0.5, 0.48, -0.22, '#3f9a44', '#9ad862', -1);
    leaf(b, 0.42, -0.1, 0.42, 0.62, '#3f9a44', '#8fd060', 0);
    fruit(b, 8, 0, 0.62, 0, 0.7, 0.12, BERRY, BERRY_HI, 1.1);
  },
  'bush~glow': (b) => {
    leaf(b, 0.72, 0, 0.62, 0, '#2f7a5a', '#6cc07a');
    leaf(b, 0.52, 0.55, 0.45, 0.3, '#2f7a5a', '#78c884', -1);
    leaf(b, 0.5, -0.5, 0.48, -0.22, '#2f7a5a', '#78c884', -1);
    leaf(b, 0.42, -0.1, 0.42, 0.62, '#2f7a5a', '#6cc07a', 0);
    for (let i = 0; i < 8; i++) {
      const a = 1.1 + i * 2.399;
      const h = ((i * 0.618) % 1) * 1.2 - 0.45;
      const rr = 0.7 * Math.sqrt(Math.max(0.15, 1 - h * h));
      b.puff(0.11, Math.cos(a) * rr, 0.62 + h * 0.7, Math.sin(a) * rr, i % 3 ? '#7ff0ff' : '#c8a2ff', 0, P({ slot: SLOT_GLOW }));
    }
  },
  fiber_grass: (b) => {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const r = 0.18 + (i % 3) * 0.12;
      const h = 1.0 + (i % 4) * 0.18;
      b.cone(0.09, h, Math.cos(a) * r, h / 2, Math.sin(a) * r, '#6aa84a', 4, P({ rz: Math.cos(a) * 0.32, rx: -Math.sin(a) * 0.32, grad: '#d2e88a' }));
    }
    // fluffy seed heads: this is the fibre
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + 0.4;
      b.puff(0.1, Math.cos(a) * 0.42, 1.25 + (i % 2) * 0.15, Math.sin(a) * 0.42, '#efe2b0', 0, P({ sy: 1.6 }));
    }
  },
  // ---------------------------------------------------------------- rocks & ores
  rock: (b) => boulder(b, 0.92),
  'rock~desert': (b) => boulder(b, 0.92, ROCK_DESERT, null),
  'rock~snow': (b) => boulder(b, 0.92, ROCK_SNOW, 'snow'),
  'rock~crystal': (b) => {
    boulder(b, 0.92, ROCK_CRYSTAL, null);
    crystal(b, 0.14, 0.55, 0.32, 1.05, 0.12, CRYSTAL_PINK, 0.1, -0.35);
    crystal(b, 0.1, 0.4, 0.05, 1.0, -0.25, CRYSTAL, -0.2, 0.2);
  },
  'rock~high': (b) => boulder(b, 0.92, ROCK_TITAN, 'moss'),
  ore_iron: (b) => {
    boulder(b, 0.9, ['#857c80', '#beb4b4', '#8f8580', '#c4b9b0'], null);
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05 + 0.2;
      b.puff(0.17 + (i % 2) * 0.05, Math.cos(a) * 0.62, 0.55 + (i % 3) * 0.2, Math.sin(a) * 0.62, i % 3 === 0 ? '#c9744e' : '#aab4c4', 0, P({ grad: i % 3 === 0 ? '#e8996a' : '#e6ecf4', sy: 0.9 }));
    }
  },
  ore_copper: (b) => {
    boulder(b, 0.9, ['#8a7a6e', '#c4b2a0', '#92806e', '#ccb8a4'], null);
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05 + 0.5;
      b.puff(0.18 + (i % 2) * 0.05, Math.cos(a) * 0.62, 0.55 + (i % 3) * 0.2, Math.sin(a) * 0.62, i % 4 === 3 ? '#4fb89a' : '#e07a3a', 0, P({ grad: i % 4 === 3 ? '#8fe6c8' : '#ffb070', sy: 0.9 }));
    }
  },
  coal: (b) => {
    boulder(b, 0.9, ['#5e5862', '#8d8590', '#665e66', '#958c94'], null);
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9;
      b.puff(0.2 + (i % 2) * 0.05, Math.cos(a) * 0.58, 0.5 + (i % 3) * 0.22, Math.sin(a) * 0.58, '#1e1d24', 0, P({ grad: '#4a4856', sy: 0.85 }));
    }
  },
  crystal: (b) => {
    boulder(b, 0.62, ROCK_CRYSTAL, null);
    crystal(b, 0.36, 1.9, 0, 1.05, 0, CRYSTAL, 0, 0.1);
    crystal(b, 0.26, 1.35, 0.55, 0.75, 0.2, CRYSTAL_PINK, 0, -0.5);
    crystal(b, 0.23, 1.15, -0.52, 0.65, -0.3, CRYSTAL_CYAN, 0.3, 0.5);
    crystal(b, 0.18, 0.85, 0.1, 0.5, -0.62, CRYSTAL_LIGHT, -0.5, 0);
    crystal(b, 0.14, 0.6, -0.3, 0.38, 0.55, CRYSTAL_PINK, 0.4, 0.3);
  },
  bio_pod: (b) => {
    b.puff(0.82, 0, 0.75, 0, '#4f9a44', 1, P({ sy: 1.1, grad: '#9ad860', shade: 0.05 }));
    b.puff(0.52, 0.55, 0.42, 0.42, '#4a8e3c', 1, P({ grad: '#8ccc58', shade: 0.05 }));
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9;
      b.puff(0.12, Math.cos(a) * 0.66, 0.6 + Math.sin(a * 1.7) * 0.4, Math.sin(a) * 0.66, '#c4ff6a', 0, P({ slot: SLOT_GLOW }));
    }
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1;
      b.cyl(0.03, 0.06, 0.9, Math.cos(a) * 0.5, 1.7, Math.sin(a) * 0.5, '#8fd96a', 4, P({ rz: Math.cos(a) * 0.4, rx: -Math.sin(a) * 0.4 }));
      b.puff(0.1, Math.cos(a) * 0.68, 2.12, Math.sin(a) * 0.68, '#c4ff6a', 0, P({ slot: SLOT_GLOW }));
    }
  },
  ice_ore: (b) => {
    boulder(b, 0.82, ROCK_SNOW, 'snow');
    crystal(b, 0.3, 1.5, 0.1, 0.85, 0, ICE, 0, 0.15);
    crystal(b, 0.22, 1.0, 0.55, 0.65, 0.3, '#dff2ff', 0, -0.6);
    crystal(b, 0.2, 0.9, -0.5, 0.55, -0.3, ICE, 0, 0.6);
    b.puff(0.16, -0.2, 0.5, 0.55, '#c98a6a', 0, P({ grad: '#e8b090' }));
    b.puff(0.14, 0.35, 0.4, -0.55, '#e08a4c', 0, P({ grad: '#ffb070' }));
  },
  scrap: (b) => {
    b.box(1.4, 0.2, 1.0, 0, 0.1, 0, '#6b7482', { ry: 0.3, shade: 0.06 });
    b.box(1.0, 0.18, 0.8, 0.2, 0.3, -0.1, '#8d97a3', { ry: -0.6, rz: 0.1, shade: 0.06 });
    b.bevelBox(0.7, 0.5, 0.5, -0.3, 0.55, 0.2, '#5a6470', 0.08, { ry: 0.8, shade: 0.06 });
    b.cyl(0.1, 0.1, 1.2, 0.4, 0.5, 0.3, '#aeb9c7', 6, { rz: 1.1, ry: 0.4 });
    b.sphere(0.08, -0.3, 0.9, 0.2, '#5fd4a0', 4, { slot: SLOT_GLOW });
    b.bevelBox(0.4, 0.3, 0.3, 0.6, 0.35, 0.5, '#d4583a', 0.05, { ry: 0.2 });
    b.puff(0.3, -0.62, 0.15, -0.35, MOSS_LO, 0, P({ sy: 0.45, grad: MOSS_HI }));
  },
  titanium: (b) => {
    boulder(b, 0.95, ROCK_TITAN, null);
    crystal(b, 0.4, 1.6, 0, 0.95, 0, TITAN, 0, 0.1);
    crystal(b, 0.28, 1.1, 0.6, 0.72, 0.2, '#f2f6fb', 0, -0.5);
    crystal(b, 0.24, 0.9, -0.55, 0.62, -0.3, TITAN, 0, 0.5);
    b.box(0.06, 1.2, 0.06, 0, 1.0, 0.42, TITAN_GLOW, { slot: SLOT_GLOW, rx: 0.2 });
    b.box(0.06, 0.8, 0.06, 0.6, 0.8, 0.5, TITAN_GLOW, { slot: SLOT_GLOW, rz: -0.5 });
    b.puff(0.1, -0.55, 1.1, -0.1, TITAN_GLOW, 0, { slot: SLOT_GLOW });
  },
};

/** A cute daisy-like flower on a stem (petal disc + centre). */
function flower(b: GeoBuilder, x: number, z: number, h: number, petal: string, centre = '#ffd84a', r = 0.12): void {
  b.cyl(0.018, 0.025, h, x, h / 2, z, '#5d9a3c', 3);
  b.cyl(r, r * 0.7, 0.04, x, h, z, petal, 7, P({ grad: '#ffffff' }));
  b.puff(r * 0.42, x, h + 0.03, z, centre, 0, P({ sy: 0.7 }));
}

/** Grass blade fan. */
function blades(b: GeoBuilder, n: number, x: number, z: number, h: number, spread = 0.14, lo = '#5aa848', hi = '#c4e47a'): void {
  for (let i = 0; i < n; i++) {
    const a = i * 2.399 + x * 3.1;
    b.cone(0.06, h * (0.8 + (i % 3) * 0.15), x + Math.cos(a) * spread, (h * (0.8 + (i % 3) * 0.15)) / 2, z + Math.sin(a) * spread, lo, 3, P({ rz: Math.cos(a) * 0.35, rx: -Math.sin(a) * 0.35, grad: hi }));
  }
}

/** A leafy frond (flattened blob) arching out of the ground toward angle `a`. */
function frond(b: GeoBuilder, a: number, len: number, lo = '#3f9a44', hi = '#8fd062'): void {
  b.puff(0.5, Math.cos(a) * len * 0.42, 0.26, Math.sin(a) * len * 0.42, lo, 0, P({ sx: 0.24, sy: 0.07, sz: len, ry: -a + Math.PI / 2, rx: -0.45, grad: hi }));
}

/** Red toadstool with white dots. */
function toadstool(b: GeoBuilder, x: number, z: number, s: number, cap = '#e2504a', capHi = '#ff8a6a'): void {
  b.cyl(0.07 * s, 0.1 * s, 0.38 * s, x, 0.19 * s, z, '#f4ead6', 5);
  b.lathe([0.3 * s, 0, 0.29 * s, 0.07 * s, 0.2 * s, 0.17 * s, 0, 0.22 * s], x, 0.34 * s, z, cap, 8, P({ grad: capHi }));
  b.puff(0.045 * s, x + 0.12 * s, 0.5 * s, z + 0.06 * s, '#ffffff', 0);
  b.puff(0.04 * s, x - 0.1 * s, 0.5 * s, z - 0.08 * s, '#ffffff', 0);
}

const PROPS: Record<string, (b: GeoBuilder) => void> = {
  grass: (b) => blades(b, 6, 0, 0, 0.55),
  flower: (b) => {
    blades(b, 3, 0.05, 0.05, 0.38, 0.12);
    flower(b, 0, 0, 0.42, '#ffffff');
    flower(b, 0.22, 0.12, 0.32, '#ff9ec4', '#fff2a8', 0.1);
    flower(b, -0.15, 0.2, 0.28, '#c9a6ff', '#fff2a8', 0.09);
  },
  meadow_tuft: (b) => {
    blades(b, 7, 0, 0, 0.5, 0.2);
    flower(b, 0.2, -0.1, 0.36, '#ffe066', '#ff9a3a', 0.09);
    flower(b, -0.22, 0.15, 0.3, '#ffffff', '#ffd84a', 0.08);
  },
  bush_small: (b) => {
    b.puff(0.42, 0, 0.36, 0, '#3f9a44', 1, P({ grad: '#9ad862', shade: 0.05 }));
    b.puff(0.3, 0.32, 0.26, 0.16, '#3f9a44', 0, P({ grad: '#a6dc66' }));
    b.puff(0.28, -0.3, 0.26, -0.12, '#3f9a44', 0, P({ grad: '#a6dc66' }));
    fruit(b, 5, 0, 0.4, 0, 0.42, 0.075, BERRY, BERRY_HI, 0.7);
  },
  pebble: (b) => {
    b.puff(0.17, 0, 0.1, 0, ROCK_LO, 0, P({ sy: 0.65, grad: ROCK_HI }));
    b.puff(0.11, 0.22, 0.07, 0.1, ROCK2_LO, 0, P({ sy: 0.7, grad: ROCK2_HI }));
    b.puff(0.07, -0.15, 0.05, 0.16, ROCK2_LO, 0, P({ sy: 0.7, grad: ROCK2_HI }));
  },
  fern: (b) => {
    for (let i = 0; i < 6; i++) frond(b, (i / 6) * Math.PI * 2 + 0.2, 0.95 + (i % 2) * 0.2);
    b.puff(0.14, 0, 0.12, 0, '#3f8a3e', 0);
  },
  mushroom: (b) => {
    toadstool(b, 0, 0, 1);
    toadstool(b, 0.3, -0.2, 0.55);
    toadstool(b, -0.22, 0.24, 0.42, '#ff8a3a', '#ffc070');
  },
  log: (b) => {
    b.cyl(0.26, 0.3, 1.8, 0, 0.28, 0, TRUNK, 8, P({ rz: Math.PI / 2, shade: 0.05 }));
    b.cyl(0.21, 0.21, 0.06, 0.92, 0.28, 0, '#d8b47a', 8, P({ rz: Math.PI / 2 }));
    b.puff(0.32, -0.25, 0.5, 0.02, MOSS_LO, 0, P({ sx: 2.1, sy: 0.35, grad: MOSS_HI }));
    toadstool(b, 0.45, 0.32, 0.45, '#ff8a3a', '#ffc070');
  },
  crystal_shard: (b) => {
    b.puff(0.22, 0, 0.08, 0, ROCK_CRYSTAL[0], 0, P({ sy: 0.6, grad: ROCK_CRYSTAL[1] }));
    crystal(b, 0.18, 0.7, 0, 0.38, 0, CRYSTAL, 0, 0.2);
    crystal(b, 0.12, 0.45, 0.25, 0.24, 0.1, CRYSTAL_PINK, 0, -0.5);
    crystal(b, 0.1, 0.35, -0.2, 0.2, -0.12, CRYSTAL_CYAN, 0.3, 0.4);
  },
  spire: (b) => {
    b.lathe([0.62, 0, 0.6, 0.4, 0.45, 1.3, 0.3, 2.3, 0.14, 2.9, 0, 3.1], 0, 0, 0, '#7d6aa8', 7, P({ grad: '#c4b4e6', shade: 0.05 }));
    b.lathe([0.34, 0, 0.3, 0.6, 0.16, 1.3, 0, 1.55], 0.55, 0, 0.22, '#8a78b0', 6, P({ grad: '#c4b4e6', shade: 0.05 }));
    b.puff(0.32, -0.1, 1.2, 0.1, MOSS_LO, 0, P({ sx: 1.6, sy: 0.35, grad: MOSS_HI }));
    crystal(b, 0.1, 0.4, -0.35, 0.55, -0.3, CRYSTAL_PINK);
  },
  cactus: (b) => {
    // round friendly saguaro with a pink bloom
    const green = '#3f9a5a';
    const hi = '#8fd07a';
    b.add(new THREE.CapsuleGeometry(0.25, 1.25, 2, 8), green, 0, 0.88, 0, P({ grad: hi }));
    b.add(new THREE.CapsuleGeometry(0.15, 0.4, 2, 6), green, 0.42, 1.0, 0, P({ grad: hi }));
    b.add(new THREE.CapsuleGeometry(0.15, 0.3, 2, 6), green, 0.25, 0.8, 0, P({ rz: Math.PI / 2, grad: hi }));
    b.add(new THREE.CapsuleGeometry(0.13, 0.3, 2, 6), green, -0.36, 1.25, 0.05, P({ grad: hi }));
    b.add(new THREE.CapsuleGeometry(0.13, 0.22, 2, 6), green, -0.22, 1.08, 0.05, P({ rz: Math.PI / 2, grad: hi }));
    b.puff(0.12, 0, 1.78, 0, '#ff7eb6', 0, P({ grad: '#ffd0e6', sy: 0.7 }));
  },
  cactus_ball: (b) => {
    b.puff(0.32, 0, 0.26, 0, '#4aa060', 1, P({ sy: 0.85, grad: '#9ad888', shade: 0.04 }));
    b.puff(0.2, 0.34, 0.16, 0.12, '#4aa060', 0, P({ grad: '#9ad888' }));
    b.puff(0.08, 0, 0.56, 0, '#ff9ec4', 0, P({ grad: '#ffe0ec' }));
    b.puff(0.15, -0.3, 0.06, -0.2, ROCK_DESERT[0], 0, P({ sy: 0.6, grad: ROCK_DESERT[1] }));
  },
  bones: (b) => {
    for (let i = 0; i < 3; i++) b.torus(0.5 + i * 0.1, 0.07, (i - 1) * 0.45, 0.2, 0, '#f2e9da', 8, 4, { rz: 0.2 });
    b.cyl(0.06, 0.06, 1.4, 0, 0.1, 0, '#f2e9da', 5, { rz: Math.PI / 2, ry: 0.1 });
    b.puff(0.27, 0.9, 0.2, 0, '#f2e9da', 1, P({ sy: 0.75, grad: '#fffaf0' }));
  },
  dune_rock: (b) => {
    b.puff(0.8, 0, 0.3, 0, ROCK_DESERT[0], 1, P({ sy: 0.45, grad: ROCK_DESERT[1], shade: 0.05 }));
    b.puff(0.5, 0.62, 0.25, 0.3, ROCK_DESERT[2], 0, P({ sy: 0.5, grad: ROCK_DESERT[3] }));
  },
  reed: (b) => {
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26;
      b.cyl(0.02, 0.04, 1.5 + (i % 2) * 0.3, Math.cos(a) * 0.2, 0.8, Math.sin(a) * 0.2, '#7fa84a', 3, P({ rz: Math.cos(a) * 0.1, grad: '#b8d070' }));
      b.add(new THREE.CapsuleGeometry(0.05, 0.22, 1, 5), '#6a442a', Math.cos(a) * 0.2 + Math.cos(a) * 0.15, 1.6 + (i % 2) * 0.3, Math.sin(a) * 0.2);
    }
    blades(b, 4, 0, 0, 0.5, 0.22, '#5a8a3a', '#a8c868');
  },
  glow_mushroom: (b) => {
    b.cyl(0.07, 0.09, 0.5, 0, 0.25, 0, '#e4f6c8', 6);
    b.lathe([0, 0, 0.3, 0, 0.28, 0.08, 0.18, 0.18, 0, 0.23], 0, 0.46, 0, '#5ef2ff', 8, { slot: SLOT_GLOW });
    b.cyl(0.04, 0.05, 0.3, 0.3, 0.15, -0.2, '#e4f6c8', 5);
    b.lathe([0, 0, 0.16, 0, 0.15, 0.05, 0.09, 0.1, 0, 0.13], 0.3, 0.28, -0.2, '#9cff7a', 7, { slot: SLOT_GLOW });
    b.cyl(0.03, 0.04, 0.22, -0.22, 0.11, 0.18, '#e4f6c8', 5);
    b.lathe([0, 0, 0.12, 0, 0.11, 0.04, 0.07, 0.08, 0, 0.1], -0.22, 0.2, 0.18, '#c8a2ff', 7, { slot: SLOT_GLOW });
  },
  bubble: (b) => {
    b.puff(0.2, 0, 0.3, 0, '#c4ff6a', 1, { slot: SLOT_GLOW });
    b.puff(0.1, 0.3, 0.15, 0.2, '#e0ffb0', 0, { slot: SLOT_GLOW });
    b.puff(0.07, -0.2, 0.12, -0.15, '#e0ffb0', 0, { slot: SLOT_GLOW });
  },
  ice_spike: (b) => {
    b.puff(0.45, 0, 0.08, 0, SNOW_SHADE, 1, P({ sy: 0.38, grad: SNOW }));
    crystal(b, 0.3, 1.8, 0, 0.9, 0, ICE, 0, 0.1);
    crystal(b, 0.18, 0.9, 0.4, 0.45, 0.2, '#dff2ff', 0, -0.5);
    crystal(b, 0.14, 0.7, -0.3, 0.35, -0.2, '#cfe0ff', 0.3, 0.4);
  },
  snow_rock: (b) => boulder(b, 0.7, ROCK_SNOW, 'snow'),
  snow_bush: (b) => {
    b.puff(0.55, 0, 0.45, 0, '#2a7a56', 1, P({ grad: '#4fa060', shade: 0.05 }));
    b.puff(0.38, 0.4, 0.32, 0.2, '#2a7a56', 0, P({ grad: '#4fa060' }));
    b.puff(0.5, 0, 0.66, 0, SNOW_SHADE, 1, P({ sy: 0.45, grad: SNOW }));
    b.puff(0.3, 0.42, 0.5, 0.2, SNOW_SHADE, 0, P({ sy: 0.45, grad: SNOW }));
  },
  ruin_pillar: (b) => {
    b.bevelBox(0.9, 0.3, 0.9, 0, 0.15, 0, '#6e6a8a', 0.06, { shade: 0.06 });
    b.cyl(0.32, 0.36, 2.2, 0, 1.4, 0, '#9690b4', 8, P({ rz: 0.08, shade: 0.06, grad: '#b8b2d4' }));
    b.bevelBox(0.5, 0.3, 0.5, 0.15, 2.6, 0, '#7f7a9e', 0.06, { ry: 0.4, rz: 0.3 });
    b.box(0.08, 1.2, 0.08, 0.3, 1.3, 0.1, '#5ef2ff', { slot: SLOT_GLOW, rz: 0.08 });
    b.puff(0.36, 0.05, 2.72, 0, MOSS_LO, 0, P({ sy: 0.4, grad: MOSS_HI }));
    b.puff(0.4, -0.3, 0.32, 0.3, MOSS_LO, 0, P({ sy: 0.4, grad: MOSS_HI }));
  },
  glyph_stone: (b) => {
    b.bevelBox(1.0, 1.4, 0.3, 0, 0.7, 0, '#6e6a8a', 0.1, { shade: 0.06, rz: 0.06 });
    b.box(0.5, 0.06, 0.05, 0, 0.9, 0.16, '#b48cff', { slot: SLOT_GLOW });
    b.box(0.06, 0.5, 0.05, 0, 0.75, 0.16, '#b48cff', { slot: SLOT_GLOW });
    b.sphere(0.07, 0.25, 0.5, 0.16, '#b48cff', 4, { slot: SLOT_GLOW });
    b.puff(0.4, 0.05, 1.42, 0, MOSS_LO, 0, P({ sx: 1.3, sy: 0.3, sz: 0.5, grad: MOSS_HI }));
  },
  metal_spire: (b) => {
    b.lathe([0.42, 0, 0.38, 0.6, 0.26, 1.5, 0.12, 2.3, 0, 2.6], 0, 0, 0, '#9aa6b4', 6, P({ grad: '#dfe6ee', shade: 0.05 }));
    b.lathe([0.24, 0, 0.2, 0.5, 0.1, 1.1, 0, 1.4], 0.4, 0, 0.2, '#a6b2c0', 5, P({ grad: '#e6ecf4', shade: 0.05 }));
    b.box(0.05, 1.2, 0.05, 0, 1.0, 0.3, TITAN_GLOW, { slot: SLOT_GLOW });
  },
  boulder: (b) => boulder(b, 1.3, ROCK_TITAN, 'moss'),
};

/**
 * Far-LOD node builders (drawn in the mid distance ring): same silhouette and colours, fewer
 * pieces, low-detail blobs, no tiny details. Models without an entry reuse their near geometry.
 */
const NODES_FAR: Record<string, (b: GeoBuilder) => void> = {
  tree_round: (b) => {
    b.cyl(0.22, 0.3, 2.1, 0, 1.05, 0, TRUNK, 5, P({ grad: TRUNK_TOP }));
    leaf(b, 1.5, 0, 2.85, 0, LEAF_LO, LEAF_HI, 1);
    leaf(b, 0.85, 0.3, 3.7, 0.1, LEAF_MID, LEAF_HI, 0);
  },
  'tree_round~fruit': (b) => {
    b.cyl(0.22, 0.3, 2.0, 0, 1.0, 0, TRUNK, 5, P({ grad: TRUNK_TOP }));
    leaf(b, 1.5, 0, 2.8, 0, '#47a24a', '#bde45e', 1);
    fruit(b, 4, 0, 2.95, 0, 1.48, 0.15, BERRY, BERRY_HI, 0.4);
  },
  'tree_round~tall': (b) => {
    b.cyl(0.2, 0.26, 1.6, 0, 0.8, 0, TRUNK, 5, P({ grad: TRUNK_TOP }));
    leaf(b, 1.0, 0, 2.6, 0, '#3e9a4e', '#a2d860', 1, 1.55);
    leaf(b, 0.55, 0, 4.1, 0, LEAF_MID, LEAF_HI, 0, 1.2);
  },
  'tree_round~marsh': (b) => {
    b.cyl(0.24, 0.32, 2.0, 0, 1.0, 0, '#5e4632', 5);
    leaf(b, 1.5, 0, 2.8, 0, '#3f7a4a', '#9cc45a', 1);
    b.puff(0.14, 1.0, 1.5, 0.3, '#b7ff6a', 0, P({ slot: SLOT_GLOW }));
  },
  tree_pine: (b) => {
    b.cyl(0.18, 0.26, 1.6, 0, 0.8, 0, TRUNK_DARK, 5);
    pineTier(b, 1.45, 2.4, 1.1, PINE_LO, '#3f9a5c', 6);
    pineTier(b, 0.95, 2.2, 3.0, '#2a7c54', PINE_HI, 6);
  },
  'tree_pine~slim': (b) => {
    b.cyl(0.16, 0.24, 1.5, 0, 0.75, 0, TRUNK_DARK, 5);
    pineTier(b, 1.15, 2.2, 1.0, PINE_LO, '#46a65e', 6);
    pineTier(b, 0.74, 2.3, 2.9, '#2e8256', PINE_HI, 6);
  },
  'tree_pine~ancient': (b) => {
    b.cyl(0.26, 0.36, 1.9, 0, 0.95, 0, '#6a3a24', 5);
    pineTier(b, 1.5, 2.4, 1.3, '#1f6a4c', '#44a05c', 6);
    pineTier(b, 1.0, 2.3, 3.2, '#2a7a54', '#58b466', 6);
  },
  bush: (b) => {
    leaf(b, 0.78, 0, 0.62, 0, '#3f9a44', '#8fd060', 1);
    leaf(b, 0.5, 0.55, 0.45, 0.3, '#3f9a44', '#9ad862', 0);
    fruit(b, 4, 0, 0.62, 0, 0.76, 0.13, BERRY, BERRY_HI, 1.1);
  },
  'bush~glow': (b) => {
    leaf(b, 0.78, 0, 0.62, 0, '#2f7a5a', '#6cc07a', 1);
    leaf(b, 0.5, 0.55, 0.45, 0.3, '#2f7a5a', '#78c884', 0);
    for (let i = 0; i < 4; i++) b.puff(0.13, Math.cos(i * 1.6) * 0.72, 0.75, Math.sin(i * 1.6) * 0.72, '#7ff0ff', 0, P({ slot: SLOT_GLOW }));
  },
  fiber_grass: (b) => {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.3;
      b.cone(0.12, 1.2 + (i % 2) * 0.2, Math.cos(a) * 0.28, 0.6, Math.sin(a) * 0.28, '#6aa84a', 4, P({ rz: Math.cos(a) * 0.25, rx: -Math.sin(a) * 0.25, grad: '#d2e88a' }));
    }
  },
  rock: (b) => boulder(b, 0.92, ROCK_STOCK, 'moss', 0),
  'rock~desert': (b) => boulder(b, 0.92, ROCK_DESERT, null, 0),
  'rock~snow': (b) => boulder(b, 0.92, ROCK_SNOW, 'snow', 0),
  'rock~crystal': (b) => {
    boulder(b, 0.92, ROCK_CRYSTAL, null, 0);
    crystal(b, 0.14, 0.55, 0.32, 1.05, 0.12, CRYSTAL_PINK, 0.1, -0.35);
  },
  'rock~high': (b) => boulder(b, 0.92, ROCK_TITAN, 'moss', 0),
  ore_iron: (b) => {
    boulder(b, 0.9, ['#857c80', '#beb4b4', '#8f8580', '#c4b9b0'], null, 0);
    for (let i = 0; i < 3; i++) b.puff(0.22, Math.cos(i * 2.1) * 0.6, 0.62, Math.sin(i * 2.1) * 0.6, i === 0 ? '#c9744e' : '#aab4c4', 0, P({ grad: '#e6ecf4' }));
  },
  ore_copper: (b) => {
    boulder(b, 0.9, ['#8a7a6e', '#c4b2a0', '#92806e', '#ccb8a4'], null, 0);
    for (let i = 0; i < 3; i++) b.puff(0.23, Math.cos(i * 2.1 + 0.5) * 0.6, 0.62, Math.sin(i * 2.1 + 0.5) * 0.6, '#e07a3a', 0, P({ grad: '#ffb070' }));
  },
  coal: (b) => {
    boulder(b, 0.9, ['#5e5862', '#8d8590', '#665e66', '#958c94'], null, 0);
    for (let i = 0; i < 3; i++) b.puff(0.26, Math.cos(i * 2.1) * 0.55, 0.6, Math.sin(i * 2.1) * 0.55, '#1e1d24', 0, P({ grad: '#4a4856' }));
  },
  crystal: (b) => {
    boulder(b, 0.62, ROCK_CRYSTAL, null, 0);
    crystal(b, 0.36, 1.9, 0, 1.05, 0, CRYSTAL, 0, 0.1);
    crystal(b, 0.26, 1.35, 0.55, 0.75, 0.2, CRYSTAL_PINK, 0, -0.5);
  },
  bio_pod: (b) => {
    b.puff(0.82, 0, 0.75, 0, '#4f9a44', 0, P({ sy: 1.1, grad: '#9ad860' }));
    b.puff(0.52, 0.55, 0.42, 0.42, '#4a8e3c', 0, P({ grad: '#8ccc58' }));
    b.puff(0.16, 0.3, 1.15, -0.3, '#c4ff6a', 0, P({ slot: SLOT_GLOW }));
  },
  ice_ore: (b) => {
    boulder(b, 0.82, ROCK_SNOW, 'snow', 0);
    crystal(b, 0.3, 1.5, 0.1, 0.85, 0, ICE, 0, 0.15);
    crystal(b, 0.22, 1.0, 0.55, 0.65, 0.3, '#dff2ff', 0, -0.6);
  },
  titanium: (b) => {
    boulder(b, 0.95, ROCK_TITAN, null, 0);
    crystal(b, 0.4, 1.6, 0, 0.95, 0, TITAN, 0, 0.1);
    crystal(b, 0.28, 1.1, 0.6, 0.72, 0.2, '#f2f6fb', 0, -0.5);
    b.box(0.08, 1.2, 0.08, 0, 1.0, 0.42, TITAN_GLOW, { slot: SLOT_GLOW, rx: 0.2 });
  },
};

/** Baked AO for nature: a slightly wider reach so canopies shade their own undersides and rock piles ground themselves. */
const NODE_AO = { radius: 1.1, strength: 0.45 };

const nodeCache = new Map<string, THREE.BufferGeometry>();
const nodeFarCache = new Map<string, THREE.BufferGeometry>();
const propCache = new Map<string, THREE.BufferGeometry>();

/** The base model of a node look key ('tree_round~fruit' -> 'tree_round'). */
export function baseModel(model: string): string {
  const i = model.indexOf('~');
  return i < 0 ? model : model.slice(0, i);
}

/** Stable small hash of a node index (variant picks must survive rebuilds and reloads). */
function hashIndex(i: number): number {
  return ((Math.imul(i + 1, 2654435761) >>> 0) % 997) / 997;
}

/**
 * The look key a node is drawn with: its model, or one of the model's variants picked from the node
 * def, its region and its index. Pure, so the same world always looks the same.
 */
export function nodeVariant(model: string, def: string, region: string | undefined, index: number): string {
  const h = hashIndex(index);
  switch (model) {
    case 'tree_round':
      if (region === 'toxic_marsh') return 'tree_round~marsh';
      return h < 0.55 ? 'tree_round' : h < 0.8 ? 'tree_round~fruit' : 'tree_round~tall';
    case 'tree_pine':
      if (def === 'tree_ancient') return 'tree_pine~ancient';
      return h < 0.68 ? 'tree_pine' : 'tree_pine~slim';
    case 'bush':
      return def === 'bush_glow' ? 'bush~glow' : 'bush';
    case 'rock':
      switch (region) {
        case 'red_desert': return 'rock~desert';
        case 'frozen_ridge': return 'rock~snow';
        case 'crystal_canyon':
        case 'alien_ruins': return 'rock~crystal';
        case 'titanium_highlands': return 'rock~high';
        default: return 'rock';
      }
    default:
      return model;
  }
}

export function nodeGeometry(model: string): THREE.BufferGeometry {
  let g = nodeCache.get(model);
  if (g) return g;
  const b = new GeoBuilder(model.length * 17 + 5);
  const fn = NODES[model] ?? NODES[baseModel(model)];
  if (fn) fn(b);
  else {
    boulder(b, 0.8);
    b.sphere(0.12, 0, 1.0, 0, '#ffd84a', 4, { slot: SLOT_GLOW });
  }
  g = b.build(NODE_AO);
  nodeCache.set(model, g);
  return g;
}

/** Far-LOD geometry for a node model (the near geometry when no cheaper variant exists). */
export function nodeGeometryFar(model: string): THREE.BufferGeometry {
  let g = nodeFarCache.get(model);
  if (g) return g;
  const fn = NODES_FAR[model] ?? (NODES[model] ? undefined : NODES_FAR[baseModel(model)]);
  if (!fn) {
    g = nodeGeometry(model);
  } else {
    const b = new GeoBuilder(model.length * 17 + 5);
    fn(b);
    g = b.build(NODE_AO);
  }
  nodeFarCache.set(model, g);
  return g;
}

export function propGeometry(model: string): THREE.BufferGeometry {
  let g = propCache.get(model);
  if (g) return g;
  const b = new GeoBuilder(model.length * 23 + 11);
  const fn = PROPS[model];
  if (fn) fn(b);
  else PROPS.pebble(b);
  g = b.build(NODE_AO);
  propCache.set(model, g);
  return g;
}

/** Rough height of a node model at scale 1 (markers, picking). Variant keys answer for their base model. */
export function nodeHeight(model: string): number {
  switch (baseModel(model)) {
    case 'tree_round': return 4.3;
    case 'tree_pine': return 5.4;
    case 'crystal': return 2.3;
    case 'bio_pod': return 2.1;
    case 'titanium': return 1.9;
    case 'fiber_grass': return 1.4;
    case 'bush': return 1.3;
    default: return 1.6;
  }
}

/** Chip particle color for a node model (gather hits). */
export function nodeChipColor(model: string): string {
  if (model === 'bush~glow') return '#7ff0ff';
  switch (baseModel(model)) {
    case 'tree_round':
    case 'tree_pine': return '#c9a46a';
    case 'bush':
    case 'fiber_grass': return '#8fc95a';
    case 'bio_pod': return '#9be36b';
    case 'crystal': return '#c39cff';
    case 'ice_ore': return '#bfe6ff';
    case 'ore_copper': return '#e07a3a';
    case 'ore_iron': return '#c9cfd8';
    case 'coal': return '#4a4a52';
    case 'scrap': return '#aeb9c7';
    case 'titanium': return '#e8eef6';
    default: return '#b5aab0';
  }
}

export const KNOWN_NODE_MODELS = Object.keys(NODES);
export const KNOWN_PROP_MODELS = Object.keys(PROPS);
export const NODE_FAR_MODELS = Object.keys(NODES_FAR);
