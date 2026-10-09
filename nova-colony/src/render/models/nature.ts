/**
 * Nature: resource node models (NodeDef.model) and decorative props (BiomeDef.props). All are
 * built at unit scale (node scale jitter is applied per instance) with the ground at y = 0.
 *
 * Look: the painted world map (public/art/biomes). The paintings are stylised low-poly: round trees
 * are big faceted balls lit lime-gold on top and deep green underneath, pines are stacks of cut
 * drooping tiers, berry bushes are dark faceted mounds studded with glossy red berries, boulders are
 * chunky cut stones in warm greys with moss cushions, crystals are saturated violet shards. So the
 * kit is built from faceted gems (`gem`: jittered icospheres with flat normals), faceted bells of
 * revolution (`lathe` + `flat`) and vertical colour gradients (`grad`) baked into the vertex
 * colours: the shading stays the shared one-program Lambert and every model stays one instanced
 * draw. Only small round things (berries, fruit, toadstool dots, pebbles in a flower bed) stay
 * smooth puffs.
 *
 * Variants: a node model can have looks keyed `<model>~<variant>` (fruit / tall bubble trees, slim
 * and ancient pines, glowberry bushes, desert / snow / crystal boulders). `nodeVariant` picks one
 * per node from its def, its region and a stable hash of its index, so a forest stops looking
 * stamped out while the resource a node gives stays obvious from its silhouette (trees are trees,
 * ore rocks keep their coloured ore chunks).
 */
import * as THREE from 'three';
import { GeoBuilder, SLOT_GLOW, type PrimOpts } from '../core/GeoBuilder';

const TRUNK = '#77492a';
const TRUNK_TOP = '#9e6a3c';
const TRUNK_DARK = '#5a3420';
/** Canopy: shaded underside -> sunlit top (the painting's deep green -> lime gold). */
const LEAF_LO = '#2f7d3a';
const LEAF_MID = '#4f9e3c';
const LEAF_HI = '#b2d84a';
const LEAF_PALE = '#8cc844';
/** Pine tiers: deep teal-green skirts, warm-lit tips. */
const PINE_LO = '#1d5a3a';
const PINE_MID = '#2f7444';
const PINE_HI = '#6aa64a';
const MOSS_LO = '#4e8f34';
const MOSS_HI = '#9cc84a';
/** Warm grey boulders (the painting's big cut stones). */
const ROCK_LO = '#7d7672';
const ROCK_HI = '#c6bcb0';
const ROCK2_LO = '#8a8078';
const ROCK2_HI = '#cfc4b4';
const BERRY = '#d8283a';
const BERRY_HI = '#ff7468';
const CRYSTAL = '#9a5ae6';
const CRYSTAL_PINK = '#d77ae0';
const CRYSTAL_CYAN = '#6fcaf2';
const CRYSTAL_LIGHT = '#cfb0ff';
const ICE = '#a8dcff';
const SNOW = '#f6f9fd';
const SNOW_SHADE = '#cfdcec';
const TITAN = '#dfe6ef';
const TITAN_GLOW = '#6ff4ff';

/** Rock colour set: [main low, main high, side low, side high]. */
type RockCols = readonly [string, string, string, string];
const ROCK_STOCK: RockCols = [ROCK_LO, ROCK_HI, ROCK2_LO, ROCK2_HI];
const ROCK_DESERT: RockCols = ['#a4482c', '#e08a56', '#b45a36', '#ec9c64'];
const ROCK_SNOW: RockCols = ['#5e6878', '#a8b4c4', '#6a7484', '#b4bece'];
const ROCK_CRYSTAL: RockCols = ['#76627e', '#b49eb4', '#806a86', '#bea8bc'];
const ROCK_TITAN: RockCols = ['#727e8c', '#bcc6d2', '#7c8896', '#c6d0dc'];

const P = (o: PrimOpts): PrimOpts => o;

/**
 * Chunky cut boulder: a squashed faceted main stone, a leaning companion, optional cap (moss / snow).
 * `detail` 1 near, 0 for far / tiny pieces.
 */
function boulder(b: GeoBuilder, r: number, cols: RockCols = ROCK_STOCK, cap: 'moss' | 'snow' | null = 'moss', detail = 1): void {
  b.gem(r, 0, r * 0.56, 0, cols[0], detail, 0.16, P({ sy: 0.74, sx: 1.1, grad: cols[1], shade: 0.07 }));
  b.gem(r * 0.6, r * 0.72, r * 0.34, -r * 0.26, cols[2], 0, 0.2, P({ sy: 0.82, grad: cols[3], shade: 0.07 }));
  if (detail > 0) b.gem(r * 0.42, -r * 0.66, r * 0.24, r * 0.4, cols[2], 0, 0.2, P({ sy: 0.85, grad: cols[3], shade: 0.07 }));
  // the main stone's top sits near 1.3 r: caps drape over it and overhang its shoulders
  if (cap === 'moss') {
    b.gem(r * 0.8, -r * 0.06, r * 1.12, r * 0.05, MOSS_LO, 0, 0.12, P({ sy: 0.32, grad: MOSS_HI, shade: 0.06 }));
    if (detail > 0) b.gem(r * 0.3, r * 0.6, r * 0.78, -r * 0.2, MOSS_LO, 0, 0.12, P({ sy: 0.5, grad: MOSS_HI }));
  } else if (cap === 'snow') {
    b.gem(r * 0.86, -r * 0.04, r * 1.14, 0, SNOW_SHADE, 0, 0.1, P({ sy: 0.32, grad: SNOW, shade: 0.03 }));
  }
}

/** A canopy ball: deep green underside, sunlit lime top, cut into facets. `detail` 1 = 80 tris, 0 = 20. */
function leaf(b: GeoBuilder, r: number, x: number, y: number, z: number, lo = LEAF_LO, hi = LEAF_HI, detail = 1, sy = 1): void {
  b.gem(r, x, y, z, lo, detail, 0.07, P({ grad: hi, shade: 0.06, sy }));
}

/** Gently tapered trunk with a root flare. */
function trunk(b: GeoBuilder, r: number, h: number, seg = 6, col = TRUNK, top = TRUNK_TOP): void {
  b.cyl(r * 0.72, r, h, 0, h / 2, 0, col, seg, P({ grad: top, shade: 0.05, flat: true }));
  b.cone(r * 1.6, r * 2.2, 0, r * 1.1, 0, col, seg, P({ shade: 0.05, flat: true }));
}

/** Glossy round fruit / berries scattered over a canopy (with a pale highlight). */
function fruit(b: GeoBuilder, n: number, cx: number, cy: number, cz: number, rad: number, size: number, col: string, hi: string, seed = 0): void {
  for (let i = 0; i < n; i++) {
    const a = seed + i * 2.399;
    const h = ((i * 0.618 + seed * 0.37) % 1) * 1.3 - 0.55;
    const rr = rad * Math.sqrt(Math.max(0.15, 1 - h * h));
    b.bead(size, cx + Math.cos(a) * rr, cy + h * rad, cz + Math.sin(a) * rr, col, P({ grad: hi }));
  }
}

/**
 * Drooping pine tier: a cut skirt that flares out and droops at the rim, then rises to a point. The
 * underside is left open (the follow camera looks down on it; the tier below covers the gap).
 */
function pineTier(b: GeoBuilder, r: number, h: number, y: number, lo: string, hi: string, seg = 7): void {
  b.lathe([r * 0.84, 0, r, 0.1 * h, r * 0.64, 0.38 * h, r * 0.28, 0.74 * h, 0, h], 0, y, 0, lo, seg, P({ grad: hi, shade: 0.06, flat: true }));
}

/** Crystal shard (glows softly at night). */
function crystal(b: GeoBuilder, r: number, h: number, x: number, y: number, z: number, col: string, rx = 0, rz = 0): void {
  b.shard(r, h, x, y, z, col, P({ slot: SLOT_GLOW, rx, rz }));
}

/** A berry bush: dark faceted mound with lighter lobes and glossy berries. */
function berryBush(b: GeoBuilder, s: number, lo: string, hi: string, berries: number, near: boolean, berry = BERRY, berryHi = BERRY_HI): void {
  leaf(b, 0.74 * s, 0, 0.6 * s, 0, lo, hi, near ? 1 : 0, 0.86);
  leaf(b, 0.52 * s, 0.56 * s, 0.42 * s, 0.3 * s, lo, hi, 0, 0.9);
  leaf(b, 0.5 * s, -0.52 * s, 0.44 * s, -0.24 * s, lo, hi, 0, 0.9);
  if (near) leaf(b, 0.42 * s, -0.12 * s, 0.4 * s, 0.6 * s, lo, hi, 0, 0.9);
  fruit(b, berries, 0, 0.6 * s, 0, 0.72 * s, 0.13 * s, berry, berryHi, 1.1);
}

/** Node builders at unit scale. */
const NODES: Record<string, (b: GeoBuilder) => void> = {
  // ---------------------------------------------------------------- trees
  tree_round: (b) => {
    trunk(b, 0.26, 2.1);
    leaf(b, 1.42, 0, 2.95, 0);
    leaf(b, 0.82, -0.98, 2.5, -0.32, LEAF_LO, LEAF_PALE, 0);
    leaf(b, 0.74, 0.86, 2.55, 0.46, LEAF_LO, LEAF_PALE, 0);
    leaf(b, 0.72, 0.3, 3.95, 0.12, LEAF_MID, LEAF_HI, 0);
  },
  'tree_round~fruit': (b) => {
    trunk(b, 0.26, 2.0);
    leaf(b, 1.4, 0, 2.85, 0, '#33823a', '#bede52');
    leaf(b, 0.8, 0.95, 2.45, 0.36, '#33823a', LEAF_PALE, 0);
    leaf(b, 0.7, -0.3, 3.8, -0.12, LEAF_MID, LEAF_HI, 0);
    fruit(b, 8, 0, 2.95, 0, 1.36, 0.15, BERRY, BERRY_HI, 0.4);
  },
  'tree_round~tall': (b) => {
    // the painting's dark cypress: a tall cut flame of deep green
    trunk(b, 0.22, 1.3, 6, TRUNK_DARK, TRUNK);
    leaf(b, 0.95, 0, 2.75, 0, '#245e34', '#5e9e44', 1, 2.0);
    leaf(b, 0.5, 0.28, 2.2, 0.3, '#245e34', '#4f8e3e', 0, 1.4);
  },
  'tree_round~marsh': (b) => {
    // swampy willow-ish bubble tree: olive-teal canopy with glowing moss beads hanging below
    trunk(b, 0.3, 2.0, 6, '#5a4230', '#76583a');
    leaf(b, 1.4, 0, 2.85, 0, '#36683e', '#94b850');
    leaf(b, 0.82, 0.95, 2.45, 0.3, '#36683e', '#84ac50', 0);
    leaf(b, 0.8, -0.9, 2.5, -0.3, '#36683e', '#84ac50', 0);
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26 + 0.3;
      b.cyl(0.03, 0.03, 0.7, Math.cos(a) * 1.0, 1.75, Math.sin(a) * 1.0, '#5e7e44', 3);
      b.puff(0.1, Math.cos(a) * 1.0, 1.38, Math.sin(a) * 1.0, '#b7ff6a', 0, P({ slot: SLOT_GLOW }));
    }
  },
  tree_pine: (b) => {
    trunk(b, 0.25, 1.7, 6, TRUNK_DARK, '#8a4e2c');
    pineTier(b, 1.55, 1.95, 1.0, PINE_LO, PINE_MID);
    pineTier(b, 1.2, 1.8, 2.25, PINE_LO, '#3c8448');
    pineTier(b, 0.86, 1.65, 3.4, '#245e3c', PINE_HI);
    pineTier(b, 0.48, 1.2, 4.45, '#2c6a40', '#86b852', 6);
  },
  'tree_pine~slim': (b) => {
    trunk(b, 0.22, 1.5, 6, TRUNK_DARK, '#8a4e2c');
    pineTier(b, 1.12, 1.75, 0.95, PINE_LO, PINE_MID);
    pineTier(b, 0.94, 1.65, 2.05, PINE_LO, '#38804a');
    pineTier(b, 0.72, 1.55, 3.1, '#245e3c', '#4e9448');
    pineTier(b, 0.46, 1.3, 4.1, '#2c6a40', PINE_HI, 6);
  },
  'tree_pine~ancient': (b) => {
    // the old giant: thick red trunk, deep tiers and teal crystal veins (as in the Pinewood painting)
    trunk(b, 0.38, 2.0, 7, '#6a3420', '#a0583a');
    pineTier(b, 1.6, 1.9, 1.35, '#1a5236', '#2e6e42');
    pineTier(b, 1.28, 1.85, 2.6, '#1a5236', '#3a7e48');
    pineTier(b, 0.92, 1.7, 3.75, '#215a3a', '#4e9448');
    pineTier(b, 0.52, 1.3, 4.85, '#2a6640', '#7aae50', 6);
    crystal(b, 0.08, 0.5, 0.32, 0.9, 0.2, '#5ff0e0', 0.1, -0.2);
    crystal(b, 0.07, 0.4, -0.24, 0.75, -0.22, '#5ff0e0', -0.2, 0.25);
  },
  // ---------------------------------------------------------------- bushes & grass
  bush: (b) => berryBush(b, 1, '#245f30', '#6aa848', 9, true),
  'bush~glow': (b) => {
    leaf(b, 0.74, 0, 0.6, 0, '#1f5a48', '#5aa878', 1, 0.86);
    leaf(b, 0.52, 0.56, 0.42, 0.3, '#1f5a48', '#62b07e', 0, 0.9);
    leaf(b, 0.5, -0.52, 0.44, -0.24, '#1f5a48', '#62b07e', 0, 0.9);
    leaf(b, 0.42, -0.12, 0.4, 0.6, '#1f5a48', '#5aa878', 0, 0.9);
    for (let i = 0; i < 8; i++) {
      const a = 1.1 + i * 2.399;
      const h = ((i * 0.618) % 1) * 1.2 - 0.45;
      const rr = 0.72 * Math.sqrt(Math.max(0.15, 1 - h * h));
      b.puff(0.11, Math.cos(a) * rr, 0.6 + h * 0.7, Math.sin(a) * rr, i % 3 ? '#7ff0ff' : '#c8a2ff', 0, P({ slot: SLOT_GLOW }));
    }
  },
  fiber_grass: (b) => {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const r = 0.18 + (i % 3) * 0.12;
      const h = 1.0 + (i % 4) * 0.18;
      b.cone(0.09, h, Math.cos(a) * r, h / 2, Math.sin(a) * r, '#5a9a3e', 4, P({ rz: Math.cos(a) * 0.32, rx: -Math.sin(a) * 0.32, grad: '#d2e486', flat: true }));
    }
    // fluffy seed heads: this is the fibre
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + 0.4;
      b.puff(0.1, Math.cos(a) * 0.42, 1.25 + (i % 2) * 0.15, Math.sin(a) * 0.42, '#efe2b0', 0, P({ sy: 1.6 }));
    }
  },
  // ---------------------------------------------------------------- rocks & ores
  rock: (b) => boulder(b, 0.92),
  'rock~desert': (b) => {
    // red sandstone: a cut block with a paler band
    boulder(b, 0.92, ROCK_DESERT, null);
    b.gem(0.5, 0.1, 1.05, 0.05, '#c46a40', 0, 0.18, P({ sy: 0.45, sx: 1.4, grad: '#f0b07a', shade: 0.06 }));
  },
  'rock~snow': (b) => boulder(b, 0.92, ROCK_SNOW, 'snow'),
  'rock~crystal': (b) => {
    boulder(b, 0.92, ROCK_CRYSTAL, 'moss');
    crystal(b, 0.14, 0.55, 0.42, 0.95, 0.12, CRYSTAL_PINK, 0.1, -0.45);
    crystal(b, 0.1, 0.4, 0.3, 0.8, -0.3, CRYSTAL, -0.2, -0.3);
  },
  'rock~high': (b) => boulder(b, 0.92, ROCK_TITAN, 'moss'),
  ore_iron: (b) => {
    // silver-blue ore breaking through a grey stone (the Red Desert painting's glinting ore)
    boulder(b, 0.9, ['#6e6870', '#aaa2a4', '#78706e', '#b2a8a4'], null);
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05 + 0.2;
      b.gem(0.2 + (i % 2) * 0.06, Math.cos(a) * 0.62, 0.58 + (i % 3) * 0.2, Math.sin(a) * 0.62, i % 3 === 0 ? '#9a5a40' : '#7088b0', 0, 0.15, P({ grad: i % 3 === 0 ? '#d08a64' : '#d6e4f6', sy: 1.1, shade: 0.08 }));
    }
  },
  ore_copper: (b) => {
    boulder(b, 0.9, ['#7e5a48', '#c09070', '#865e4a', '#c89878'], null);
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05 + 0.5;
      b.gem(0.21 + (i % 2) * 0.06, Math.cos(a) * 0.62, 0.58 + (i % 3) * 0.2, Math.sin(a) * 0.62, i % 4 === 3 ? '#3a9a84' : '#c0602a', 0, 0.15, P({ grad: i % 4 === 3 ? '#8ae0c4' : '#f6a866', sy: 1.1, shade: 0.08 }));
    }
  },
  coal: (b) => {
    boulder(b, 0.9, ['#57515a', '#8a8290', '#5e5660', '#928a96'], null);
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9;
      b.gem(0.22 + (i % 2) * 0.05, Math.cos(a) * 0.58, 0.52 + (i % 3) * 0.22, Math.sin(a) * 0.58, '#18171e', 0, 0.18, P({ grad: '#4a4858', sy: 0.95, shade: 0.1 }));
    }
  },
  crystal: (b) => {
    boulder(b, 0.62, ROCK_CRYSTAL, null);
    crystal(b, 0.36, 1.9, 0, 1.05, 0, CRYSTAL, 0, 0.1);
    crystal(b, 0.26, 1.35, 0.55, 0.75, 0.2, CRYSTAL_PINK, 0, -0.5);
    crystal(b, 0.23, 1.15, -0.52, 0.65, -0.3, CRYSTAL_LIGHT, 0.3, 0.5);
    crystal(b, 0.18, 0.85, 0.1, 0.5, -0.62, CRYSTAL_CYAN, -0.5, 0);
    crystal(b, 0.14, 0.6, -0.3, 0.38, 0.55, CRYSTAL, 0.4, 0.3);
  },
  bio_pod: (b) => {
    // the Toxic Marsh painting's mossy egg pods with glowing windows
    b.gem(0.82, 0, 0.76, 0, '#4a7a34', 1, 0.08, P({ sy: 1.08, grad: '#94bc52', shade: 0.06 }));
    b.gem(0.52, 0.58, 0.42, 0.42, '#456e30', 0, 0.1, P({ grad: '#86b04c', shade: 0.06 }));
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9;
      b.puff(0.13, Math.cos(a) * 0.68, 0.6 + Math.sin(a * 1.7) * 0.4, Math.sin(a) * 0.68, '#c4ff6a', 0, P({ slot: SLOT_GLOW }));
    }
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1;
      b.cyl(0.03, 0.06, 0.9, Math.cos(a) * 0.5, 1.7, Math.sin(a) * 0.5, '#7fc05a', 4, P({ rz: Math.cos(a) * 0.4, rx: -Math.sin(a) * 0.4 }));
      b.puff(0.1, Math.cos(a) * 0.68, 2.12, Math.sin(a) * 0.68, '#c4ff6a', 0, P({ slot: SLOT_GLOW }));
    }
  },
  ice_ore: (b) => {
    boulder(b, 0.82, ROCK_SNOW, 'snow');
    crystal(b, 0.3, 1.5, 0.1, 0.85, 0, ICE, 0, 0.15);
    crystal(b, 0.22, 1.0, 0.55, 0.65, 0.3, '#dff2ff', 0, -0.6);
    crystal(b, 0.2, 0.9, -0.5, 0.55, -0.3, ICE, 0, 0.6);
    b.gem(0.16, -0.2, 0.5, 0.55, '#a8603e', 0, 0.15, P({ grad: '#e0a07a' }));
    b.gem(0.14, 0.35, 0.4, -0.55, '#c0602a', 0, 0.15, P({ grad: '#f6a866' }));
  },
  scrap: (b) => {
    b.box(1.4, 0.2, 1.0, 0, 0.1, 0, '#6b7482', { ry: 0.3, shade: 0.06 });
    b.box(1.0, 0.18, 0.8, 0.2, 0.3, -0.1, '#8d97a3', { ry: -0.6, rz: 0.1, shade: 0.06 });
    b.bevelBox(0.7, 0.5, 0.5, -0.3, 0.55, 0.2, '#5a6470', 0.08, { ry: 0.8, shade: 0.06 });
    b.cyl(0.1, 0.1, 1.2, 0.4, 0.5, 0.3, '#aeb9c7', 6, { rz: 1.1, ry: 0.4 });
    b.sphere(0.08, -0.3, 0.9, 0.2, '#5fd4a0', 4, { slot: SLOT_GLOW });
    b.bevelBox(0.4, 0.3, 0.3, 0.6, 0.35, 0.5, '#b4503a', 0.05, { ry: 0.2 });
    b.gem(0.3, -0.62, 0.15, -0.35, MOSS_LO, 0, 0.12, P({ sy: 0.45, grad: MOSS_HI }));
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

/** A daisy-like flower on a stem (petal disc + centre). */
function flower(b: GeoBuilder, x: number, z: number, h: number, petal: string, centre = '#f2c230', r = 0.12): void {
  b.cyl(0.018, 0.025, h, x, h / 2, z, '#4f8a36', 3);
  b.cyl(r, r * 0.7, 0.04, x, h, z, petal, 6, P({ grad: '#ffffff' }));
  b.bead(r * 0.42, x, h + 0.03, z, centre, P({ sy: 0.7 }));
}

/** Grass blade fan. */
function blades(b: GeoBuilder, n: number, x: number, z: number, h: number, spread = 0.14, lo = '#4c9a3c', hi = '#c2de72'): void {
  for (let i = 0; i < n; i++) {
    const a = i * 2.399 + x * 3.1;
    b.cone(0.06, h * (0.8 + (i % 3) * 0.15), x + Math.cos(a) * spread, (h * (0.8 + (i % 3) * 0.15)) / 2, z + Math.sin(a) * spread, lo, 3, P({ rz: Math.cos(a) * 0.35, rx: -Math.sin(a) * 0.35, grad: hi }));
  }
}

/** A leafy fern frond: a flattened faceted blade arching out of the ground toward angle `a`. */
function frond(b: GeoBuilder, a: number, len: number, lo = '#2f7a38', hi = '#86c050'): void {
  b.gem(0.5, Math.cos(a) * len * 0.42, 0.26, Math.sin(a) * len * 0.42, lo, 0, 0, P({ sx: 0.24, sy: 0.07, sz: len, ry: -a + Math.PI / 2, rx: -0.45, grad: hi }));
}

/** Red toadstool with white dots (the Pinewood painting's forest-floor mushrooms). */
function toadstool(b: GeoBuilder, x: number, z: number, s: number, cap = '#c8402e', capHi = '#f07a50'): void {
  b.cyl(0.07 * s, 0.1 * s, 0.38 * s, x, 0.19 * s, z, '#efe2c8', 5);
  b.lathe([0.3 * s, 0, 0.29 * s, 0.07 * s, 0.2 * s, 0.17 * s, 0, 0.22 * s], x, 0.34 * s, z, cap, 8, P({ grad: capHi, flat: true }));
  b.bead(0.045 * s, x + 0.12 * s, 0.5 * s, z + 0.06 * s, '#fff8ec');
  b.bead(0.04 * s, x - 0.1 * s, 0.5 * s, z - 0.08 * s, '#fff8ec');
}

const PROPS: Record<string, (b: GeoBuilder) => void> = {
  grass: (b) => blades(b, 6, 0, 0, 0.55),
  flower: (b) => {
    blades(b, 3, 0.05, 0.05, 0.38, 0.12);
    flower(b, 0, 0, 0.42, '#ffffff');
    flower(b, 0.22, 0.12, 0.32, '#f2c230', '#c8782a', 0.1);
    flower(b, -0.15, 0.2, 0.28, '#b48ae0', '#f6e2a0', 0.09);
  },
  meadow_tuft: (b) => {
    blades(b, 7, 0, 0, 0.5, 0.2);
    flower(b, 0.2, -0.1, 0.36, '#f2c230', '#c8782a', 0.09);
    flower(b, -0.22, 0.15, 0.3, '#ffffff', '#f2c230', 0.08);
  },
  bush_small: (b) => {
    b.gem(0.42, 0, 0.34, 0, '#245f30', 1, 0.08, P({ grad: '#6aa848', shade: 0.06, sy: 0.9 }));
    b.gem(0.3, 0.32, 0.26, 0.16, '#245f30', 0, 0.1, P({ grad: '#76b04e' }));
    b.gem(0.28, -0.3, 0.26, -0.12, '#245f30', 0, 0.1, P({ grad: '#76b04e' }));
    fruit(b, 5, 0, 0.38, 0, 0.42, 0.08, BERRY, BERRY_HI, 0.7);
  },
  pebble: (b) => {
    b.gem(0.17, 0, 0.1, 0, ROCK_LO, 0, 0.2, P({ sy: 0.65, grad: ROCK_HI }));
    b.gem(0.11, 0.22, 0.07, 0.1, ROCK2_LO, 0, 0.2, P({ sy: 0.7, grad: ROCK2_HI }));
    b.gem(0.07, -0.15, 0.05, 0.16, ROCK2_LO, 0, 0.2, P({ sy: 0.7, grad: ROCK2_HI }));
  },
  fern: (b) => {
    for (let i = 0; i < 7; i++) frond(b, (i / 7) * Math.PI * 2 + 0.2, 0.95 + (i % 2) * 0.25);
    b.puff(0.14, 0, 0.12, 0, '#2f6e34', 0);
  },
  mushroom: (b) => {
    toadstool(b, 0, 0, 1);
    toadstool(b, 0.3, -0.2, 0.55);
    toadstool(b, -0.22, 0.24, 0.42, '#d8682e', '#f6a060');
  },
  log: (b) => {
    b.cyl(0.26, 0.3, 1.8, 0, 0.28, 0, TRUNK, 7, P({ rz: Math.PI / 2, shade: 0.06, flat: true }));
    b.cyl(0.21, 0.21, 0.06, 0.92, 0.28, 0, '#d0a870', 7, P({ rz: Math.PI / 2 }));
    b.gem(0.32, -0.25, 0.5, 0.02, MOSS_LO, 0, 0.1, P({ sx: 2.1, sy: 0.35, grad: MOSS_HI }));
    toadstool(b, 0.45, 0.32, 0.45, '#d8682e', '#f6a060');
  },
  crystal_shard: (b) => {
    b.gem(0.22, 0, 0.08, 0, ROCK_CRYSTAL[0], 0, 0.15, P({ sy: 0.6, grad: ROCK_CRYSTAL[1] }));
    crystal(b, 0.18, 0.7, 0, 0.38, 0, CRYSTAL, 0, 0.2);
    crystal(b, 0.12, 0.45, 0.25, 0.24, 0.1, CRYSTAL_PINK, 0, -0.5);
    crystal(b, 0.1, 0.35, -0.2, 0.2, -0.12, CRYSTAL_LIGHT, 0.3, 0.4);
  },
  spire: (b) => {
    // a weathered mauve rock needle with a moss crown and a crystal at its foot
    b.lathe([0.66, 0, 0.62, 0.4, 0.46, 1.3, 0.32, 2.3, 0.16, 2.9, 0, 3.1], 0, 0, 0, ROCK_CRYSTAL[0], 6, P({ grad: ROCK_CRYSTAL[1], shade: 0.07, flat: true }));
    b.lathe([0.34, 0, 0.3, 0.6, 0.16, 1.3, 0, 1.55], 0.55, 0, 0.22, ROCK_CRYSTAL[2], 5, P({ grad: ROCK_CRYSTAL[3], shade: 0.07, flat: true }));
    b.gem(0.34, -0.1, 1.25, 0.1, MOSS_LO, 0, 0.1, P({ sx: 1.6, sy: 0.35, grad: MOSS_HI }));
    crystal(b, 0.12, 0.5, -0.42, 0.25, -0.3, CRYSTAL_PINK, 0.3, 0.3);
    crystal(b, 0.09, 0.36, -0.2, 0.2, -0.48, CRYSTAL, -0.2, 0.2);
  },
  cactus: (b) => {
    // the Red Desert painting's saguaro: ribbed, cut, with a single coral bloom
    const green = '#3a8048';
    const hi = '#7cbc66';
    b.cyl(0.25, 0.27, 1.6, 0, 0.8, 0, green, 7, P({ grad: hi, flat: true, shade: 0.05 }));
    b.cone(0.25, 0.3, 0, 1.75, 0, hi, 7, P({ flat: true }));
    b.cyl(0.15, 0.15, 0.5, 0.42, 1.12, 0, green, 6, P({ grad: hi, flat: true }));
    b.cone(0.15, 0.18, 0.42, 1.46, 0, hi, 6, P({ flat: true }));
    b.cyl(0.13, 0.13, 0.32, 0.26, 0.86, 0, green, 6, P({ rz: Math.PI / 2, flat: true }));
    b.cyl(0.13, 0.13, 0.4, -0.38, 1.25, 0.04, green, 6, P({ grad: hi, flat: true }));
    b.cone(0.13, 0.16, -0.38, 1.53, 0.04, hi, 6, P({ flat: true }));
    b.cyl(0.12, 0.12, 0.26, -0.24, 1.08, 0.04, green, 6, P({ rz: Math.PI / 2, flat: true }));
    b.puff(0.1, 0, 1.92, 0, '#e8604a', 0, P({ grad: '#ffb08a', sy: 0.7 }));
  },
  cactus_ball: (b) => {
    b.gem(0.32, 0, 0.26, 0, '#3e8a50', 1, 0.05, P({ sy: 0.85, grad: '#86c472', shade: 0.05 }));
    b.gem(0.2, 0.34, 0.16, 0.12, '#3e8a50', 0, 0.06, P({ grad: '#86c472' }));
    b.puff(0.08, 0, 0.56, 0, '#e8604a', 0, P({ grad: '#ffc0a0' }));
    b.gem(0.15, -0.3, 0.06, -0.2, ROCK_DESERT[0], 0, 0.18, P({ sy: 0.6, grad: ROCK_DESERT[1] }));
  },
  bones: (b) => {
    for (let i = 0; i < 3; i++) b.torus(0.5 + i * 0.1, 0.07, (i - 1) * 0.45, 0.2, 0, '#eee2cc', 8, 4, { rz: 0.2 });
    b.cyl(0.06, 0.06, 1.4, 0, 0.1, 0, '#eee2cc', 5, { rz: Math.PI / 2, ry: 0.1 });
    b.gem(0.27, 0.9, 0.2, 0, '#e2d6c0', 1, 0.08, P({ sy: 0.75, grad: '#fffaf0' }));
  },
  dune_rock: (b) => {
    b.gem(0.8, 0, 0.3, 0, ROCK_DESERT[0], 1, 0.14, P({ sy: 0.45, grad: ROCK_DESERT[1], shade: 0.07 }));
    b.gem(0.5, 0.62, 0.25, 0.3, ROCK_DESERT[2], 0, 0.18, P({ sy: 0.5, grad: ROCK_DESERT[3], shade: 0.07 }));
  },
  reed: (b) => {
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26;
      b.cyl(0.02, 0.04, 1.5 + (i % 2) * 0.3, Math.cos(a) * 0.2, 0.8, Math.sin(a) * 0.2, '#6e9a44', 3, P({ rz: Math.cos(a) * 0.1, grad: '#b0c868' }));
      b.add(new THREE.CapsuleGeometry(0.05, 0.22, 1, 5), '#7a3e5a', Math.cos(a) * 0.2 + Math.cos(a) * 0.15, 1.6 + (i % 2) * 0.3, Math.sin(a) * 0.2);
    }
    blades(b, 4, 0, 0, 0.5, 0.22, '#4e7e36', '#a0c060');
  },
  glow_mushroom: (b) => {
    b.cyl(0.07, 0.09, 0.5, 0, 0.25, 0, '#e4f6c8', 6);
    b.lathe([0, 0, 0.3, 0, 0.28, 0.08, 0.18, 0.18, 0, 0.23], 0, 0.46, 0, '#5ee0ff', 8, { slot: SLOT_GLOW });
    b.cyl(0.04, 0.05, 0.3, 0.3, 0.15, -0.2, '#e4f6c8', 5);
    b.lathe([0, 0, 0.16, 0, 0.15, 0.05, 0.09, 0.1, 0, 0.13], 0.3, 0.28, -0.2, '#8ee8ff', 7, { slot: SLOT_GLOW });
    b.cyl(0.03, 0.04, 0.22, -0.22, 0.11, 0.18, '#e4f6c8', 5);
    b.lathe([0, 0, 0.12, 0, 0.11, 0.04, 0.07, 0.08, 0, 0.1], -0.22, 0.2, 0.18, '#b8a2ff', 7, { slot: SLOT_GLOW });
  },
  bubble: (b) => {
    b.puff(0.2, 0, 0.3, 0, '#b4f05a', 1, { slot: SLOT_GLOW });
    b.puff(0.1, 0.3, 0.15, 0.2, '#d8ffa0', 0, { slot: SLOT_GLOW });
    b.puff(0.07, -0.2, 0.12, -0.15, '#d8ffa0', 0, { slot: SLOT_GLOW });
  },
  ice_spike: (b) => {
    b.gem(0.45, 0, 0.08, 0, SNOW_SHADE, 1, 0.1, P({ sy: 0.38, grad: SNOW }));
    crystal(b, 0.3, 1.8, 0, 0.9, 0, ICE, 0, 0.1);
    crystal(b, 0.18, 0.9, 0.4, 0.45, 0.2, '#dff2ff', 0, -0.5);
    crystal(b, 0.14, 0.7, -0.3, 0.35, -0.2, '#bcd8ff', 0.3, 0.4);
  },
  snow_rock: (b) => boulder(b, 0.7, ROCK_SNOW, 'snow'),
  snow_bush: (b) => {
    b.gem(0.55, 0, 0.45, 0, '#1f5a40', 1, 0.08, P({ grad: '#3e8a50', shade: 0.05 }));
    b.gem(0.38, 0.4, 0.32, 0.2, '#1f5a40', 0, 0.1, P({ grad: '#3e8a50' }));
    b.gem(0.5, 0, 0.66, 0, SNOW_SHADE, 1, 0.08, P({ sy: 0.45, grad: SNOW }));
    b.gem(0.3, 0.42, 0.5, 0.2, SNOW_SHADE, 0, 0.1, P({ sy: 0.45, grad: SNOW }));
  },
  ruin_pillar: (b) => {
    b.bevelBox(0.9, 0.3, 0.9, 0, 0.15, 0, '#615c78', 0.06, { shade: 0.06 });
    b.cyl(0.32, 0.36, 2.2, 0, 1.4, 0, '#857f9e', 6, P({ rz: 0.08, shade: 0.07, grad: '#aaa4c4', flat: true }));
    b.bevelBox(0.5, 0.3, 0.5, 0.15, 2.6, 0, '#706b8c', 0.06, { ry: 0.4, rz: 0.3 });
    b.box(0.08, 1.2, 0.08, 0.3, 1.3, 0.1, '#5ef2ff', { slot: SLOT_GLOW, rz: 0.08 });
    b.gem(0.36, 0.05, 2.72, 0, MOSS_LO, 0, 0.1, P({ sy: 0.4, grad: MOSS_HI }));
    b.gem(0.4, -0.3, 0.32, 0.3, MOSS_LO, 0, 0.1, P({ sy: 0.4, grad: MOSS_HI }));
  },
  glyph_stone: (b) => {
    b.bevelBox(1.0, 1.4, 0.3, 0, 0.7, 0, '#615c78', 0.1, { shade: 0.06, rz: 0.06 });
    b.box(0.5, 0.06, 0.05, 0, 0.9, 0.16, '#5ee8f0', { slot: SLOT_GLOW });
    b.box(0.06, 0.5, 0.05, 0, 0.75, 0.16, '#5ee8f0', { slot: SLOT_GLOW });
    b.sphere(0.07, 0.25, 0.5, 0.16, '#5ee8f0', 4, { slot: SLOT_GLOW });
    b.gem(0.4, 0.05, 1.42, 0, MOSS_LO, 0, 0.1, P({ sx: 1.3, sy: 0.3, sz: 0.5, grad: MOSS_HI }));
  },
  metal_spire: (b) => {
    b.lathe([0.42, 0, 0.38, 0.6, 0.26, 1.5, 0.12, 2.3, 0, 2.6], 0, 0, 0, '#8a96a4', 6, P({ grad: '#dfe6ee', shade: 0.06, flat: true }));
    b.lathe([0.24, 0, 0.2, 0.5, 0.1, 1.1, 0, 1.4], 0.4, 0, 0.2, '#96a2b0', 5, P({ grad: '#e6ecf4', shade: 0.06, flat: true }));
    b.box(0.05, 1.2, 0.05, 0, 1.0, 0.3, TITAN_GLOW, { slot: SLOT_GLOW });
  },
  boulder: (b) => boulder(b, 1.3, ROCK_TITAN, 'moss'),
};

/**
 * Far-LOD node builders (drawn in the mid distance ring): same silhouette and colours, fewer
 * pieces, low-detail facets, no tiny details. Models without an entry reuse their near geometry.
 */
const NODES_FAR: Record<string, (b: GeoBuilder) => void> = {
  tree_round: (b) => {
    b.cyl(0.2, 0.28, 2.1, 0, 1.05, 0, TRUNK, 5, P({ grad: TRUNK_TOP }));
    leaf(b, 1.5, 0, 2.95, 0, LEAF_LO, LEAF_HI, 0);
    leaf(b, 0.8, 0.3, 3.85, 0.1, LEAF_MID, LEAF_HI, 0);
  },
  'tree_round~fruit': (b) => {
    b.cyl(0.2, 0.28, 2.0, 0, 1.0, 0, TRUNK, 5, P({ grad: TRUNK_TOP }));
    leaf(b, 1.5, 0, 2.85, 0, '#33823a', '#bede52', 0);
    fruit(b, 4, 0, 2.95, 0, 1.45, 0.16, BERRY, BERRY_HI, 0.4);
  },
  'tree_round~tall': (b) => {
    b.cyl(0.16, 0.22, 1.3, 0, 0.65, 0, TRUNK_DARK, 5);
    leaf(b, 0.98, 0, 2.75, 0, '#245e34', '#5e9e44', 0, 2.0);
  },
  'tree_round~marsh': (b) => {
    b.cyl(0.22, 0.3, 2.0, 0, 1.0, 0, '#5a4230', 5);
    leaf(b, 1.5, 0, 2.85, 0, '#36683e', '#94b850', 0);
    b.puff(0.14, 1.0, 1.5, 0.3, '#b7ff6a', 0, P({ slot: SLOT_GLOW }));
  },
  tree_pine: (b) => {
    b.cyl(0.18, 0.26, 1.7, 0, 0.85, 0, TRUNK_DARK, 5);
    pineTier(b, 1.55, 2.5, 1.0, PINE_LO, PINE_MID, 6);
    pineTier(b, 1.0, 2.5, 2.9, '#245e3c', PINE_HI, 6);
  },
  'tree_pine~slim': (b) => {
    b.cyl(0.16, 0.24, 1.5, 0, 0.75, 0, TRUNK_DARK, 5);
    pineTier(b, 1.12, 2.3, 0.95, PINE_LO, '#38804a', 6);
    pineTier(b, 0.74, 2.5, 2.85, '#245e3c', PINE_HI, 6);
  },
  'tree_pine~ancient': (b) => {
    b.cyl(0.28, 0.38, 2.0, 0, 1.0, 0, '#6a3420', 5);
    pineTier(b, 1.6, 2.5, 1.35, '#1a5236', '#3a7e48', 6);
    pineTier(b, 1.05, 2.6, 3.4, '#215a3a', '#6aa64a', 6);
  },
  bush: (b) => berryBush(b, 1.04, '#245f30', '#6aa848', 4, false),
  'bush~glow': (b) => {
    leaf(b, 0.8, 0, 0.6, 0, '#1f5a48', '#5aa878', 0, 0.86);
    leaf(b, 0.5, 0.55, 0.42, 0.3, '#1f5a48', '#62b07e', 0, 0.9);
    for (let i = 0; i < 4; i++) b.puff(0.13, Math.cos(i * 1.6) * 0.74, 0.72, Math.sin(i * 1.6) * 0.74, '#7ff0ff', 0, P({ slot: SLOT_GLOW }));
  },
  fiber_grass: (b) => {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.3;
      b.cone(0.12, 1.2 + (i % 2) * 0.2, Math.cos(a) * 0.28, 0.6, Math.sin(a) * 0.28, '#5a9a3e', 4, P({ rz: Math.cos(a) * 0.25, rx: -Math.sin(a) * 0.25, grad: '#d2e486' }));
    }
  },
  rock: (b) => boulder(b, 0.92, ROCK_STOCK, 'moss', 0),
  'rock~desert': (b) => boulder(b, 0.92, ROCK_DESERT, null, 0),
  'rock~snow': (b) => boulder(b, 0.92, ROCK_SNOW, 'snow', 0),
  'rock~crystal': (b) => {
    boulder(b, 0.92, ROCK_CRYSTAL, 'moss', 0);
    crystal(b, 0.14, 0.55, 0.42, 0.95, 0.12, CRYSTAL_PINK, 0.1, -0.45);
  },
  'rock~high': (b) => boulder(b, 0.92, ROCK_TITAN, 'moss', 0),
  ore_iron: (b) => {
    boulder(b, 0.9, ['#6e6870', '#aaa2a4', '#78706e', '#b2a8a4'], null, 0);
    for (let i = 0; i < 3; i++) b.gem(0.24, Math.cos(i * 2.1) * 0.6, 0.64, Math.sin(i * 2.1) * 0.6, i === 0 ? '#9a5a40' : '#7088b0', 0, 0.15, P({ grad: '#d6e4f6' }));
  },
  ore_copper: (b) => {
    boulder(b, 0.9, ['#7e5a48', '#c09070', '#865e4a', '#c89878'], null, 0);
    for (let i = 0; i < 3; i++) b.gem(0.25, Math.cos(i * 2.1 + 0.5) * 0.6, 0.64, Math.sin(i * 2.1 + 0.5) * 0.6, '#c0602a', 0, 0.15, P({ grad: '#f6a866' }));
  },
  coal: (b) => {
    boulder(b, 0.9, ['#57515a', '#8a8290', '#5e5660', '#928a96'], null, 0);
    for (let i = 0; i < 3; i++) b.gem(0.27, Math.cos(i * 2.1) * 0.55, 0.62, Math.sin(i * 2.1) * 0.55, '#18171e', 0, 0.18, P({ grad: '#4a4858' }));
  },
  crystal: (b) => {
    boulder(b, 0.62, ROCK_CRYSTAL, null, 0);
    crystal(b, 0.36, 1.9, 0, 1.05, 0, CRYSTAL, 0, 0.1);
    crystal(b, 0.26, 1.35, 0.55, 0.75, 0.2, CRYSTAL_PINK, 0, -0.5);
  },
  bio_pod: (b) => {
    b.gem(0.82, 0, 0.76, 0, '#4a7a34', 0, 0.08, P({ sy: 1.08, grad: '#94bc52' }));
    b.gem(0.52, 0.58, 0.42, 0.42, '#456e30', 0, 0.1, P({ grad: '#86b04c' }));
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
