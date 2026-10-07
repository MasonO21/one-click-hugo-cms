/**
 * Nature: resource node models (NodeDef.model) and decorative props (BiomeDef.props). All are
 * built at unit scale (node scale jitter is applied per instance) with the ground at y = 0.
 */
import * as THREE from 'three';
import { GeoBuilder, SLOT_GLOW } from '../core/GeoBuilder';

const TRUNK = '#7a4f2a';
const TRUNK_DARK = '#5c3a1d';
const LEAF_A = '#5fbf4f';
const LEAF_B = '#8fd96a';
const LEAF_C = '#3f9a44';
const PINE_A = '#2f7a4a';
const PINE_B = '#3f9a5a';
const ROCK_A = '#8e8a82';
const ROCK_B = '#a6a39b';
const ROCK_C = '#75716a';
const CRYSTAL = '#b48cff';
const CRYSTAL_LIGHT = '#dcc8ff';
const ICE = '#bfe6ff';
const SNOW = '#f4f8fc';
const TITAN = '#dfe6ee';
const TITAN_GLOW = '#45f0ff';

function rock(b: GeoBuilder, r: number, x = 0, z = 0, colors: [string, string, string] = [ROCK_A, ROCK_B, ROCK_C]): void {
  b.sphere(r, x, r * 0.55, z, colors[0], 6, { sy: 0.75, shade: 0.08 });
  b.sphere(r * 0.7, x + r * 0.55, r * 0.45, z - r * 0.2, colors[1], 5, { sy: 0.8, shade: 0.08 });
  b.sphere(r * 0.55, x - r * 0.5, r * 0.4, z + r * 0.35, colors[2], 5, { sy: 0.8, shade: 0.08 });
}

/** Node builders at unit scale. */
const NODES: Record<string, (b: GeoBuilder) => void> = {
  tree_round: (b) => {
    b.cyl(0.22, 0.32, 1.8, 0, 0.9, 0, TRUNK, 6, { shade: 0.05 });
    b.sphere(1.25, 0, 2.6, 0, LEAF_A, 7, { shade: 0.06 });
    b.sphere(0.9, 0.7, 3.1, 0.4, LEAF_B, 6, { shade: 0.06 });
    b.sphere(0.8, -0.7, 3.0, -0.3, LEAF_C, 6, { shade: 0.06 });
    b.sphere(0.6, 0.1, 3.7, -0.5, LEAF_B, 5, { shade: 0.06 });
  },
  tree_pine: (b) => {
    b.cyl(0.18, 0.3, 2.0, 0, 1.0, 0, TRUNK_DARK, 6, { shade: 0.05 });
    b.cone(1.5, 2.0, 0, 2.6, 0, PINE_A, 7, { shade: 0.06 });
    b.cone(1.15, 1.8, 0, 3.7, 0, PINE_B, 7, { shade: 0.06 });
    b.cone(0.75, 1.6, 0, 4.8, 0, PINE_A, 6, { shade: 0.06 });
  },
  bush: (b) => {
    b.sphere(0.7, 0, 0.6, 0, LEAF_C, 6, { shade: 0.07 });
    b.sphere(0.5, 0.5, 0.5, 0.3, LEAF_A, 5, { shade: 0.07 });
    b.sphere(0.45, -0.45, 0.55, -0.2, LEAF_B, 5, { shade: 0.07 });
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3;
      b.sphere(0.1, Math.cos(a) * 0.6, 0.65 + Math.sin(a * 2) * 0.25, Math.sin(a) * 0.6, '#ff6f91', 4, { slot: SLOT_GLOW });
    }
  },
  fiber_grass: (b) => {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const r = 0.25 + (i % 2) * 0.15;
      b.cone(0.09, 1.1 + (i % 3) * 0.2, Math.cos(a) * r, 0.55 + (i % 3) * 0.1, Math.sin(a) * r, i % 2 ? '#a9d65a' : '#8fc95a', 4, { rz: Math.cos(a) * 0.25, rx: -Math.sin(a) * 0.25 });
    }
  },
  rock: (b) => rock(b, 0.9),
  ore_iron: (b) => {
    rock(b, 0.9, 0, 0, ['#847a74', '#9a8f88', '#6b625c']);
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26;
      b.box(0.26, 0.22, 0.26, Math.cos(a) * 0.6, 0.45 + (i % 2) * 0.35, Math.sin(a) * 0.6, '#c9a48b', { ry: a, rx: 0.3, shade: 0.05 });
    }
  },
  ore_copper: (b) => {
    rock(b, 0.9, 0, 0, ['#8a7d70', '#a1948a', '#6e635a']);
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26 + 0.5;
      b.box(0.24, 0.24, 0.24, Math.cos(a) * 0.6, 0.5 + (i % 2) * 0.3, Math.sin(a) * 0.6, '#e08a4c', { ry: a, rx: 0.4, shade: 0.05 });
    }
  },
  coal: (b) => {
    rock(b, 0.9, 0, 0, ['#5f5c5a', '#737070', '#4a4848']);
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05;
      b.box(0.3, 0.26, 0.3, Math.cos(a) * 0.55, 0.4 + (i % 3) * 0.25, Math.sin(a) * 0.55, '#24242a', { ry: a, rz: 0.3, shade: 0.05 });
    }
  },
  crystal: (b) => {
    rock(b, 0.6, 0, 0, ['#6e6a8a', '#8a84a8', '#55506e']);
    b.shard(0.35, 1.9, 0, 1.0, 0, CRYSTAL, { slot: SLOT_GLOW, rz: 0.1 });
    b.shard(0.25, 1.3, 0.55, 0.7, 0.2, CRYSTAL_LIGHT, { slot: SLOT_GLOW, rz: -0.5 });
    b.shard(0.22, 1.1, -0.5, 0.6, -0.3, CRYSTAL, { slot: SLOT_GLOW, rz: 0.5, rx: 0.3 });
    b.shard(0.18, 0.8, 0.1, 0.5, -0.6, CRYSTAL_LIGHT, { slot: SLOT_GLOW, rx: -0.5 });
  },
  bio_pod: (b) => {
    b.sphere(0.8, 0, 0.7, 0, '#6aa84a', 7, { sy: 1.1, shade: 0.06 });
    b.sphere(0.5, 0.5, 0.4, 0.4, '#5a9a3c', 6, { shade: 0.06 });
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05;
      b.sphere(0.12, Math.cos(a) * 0.6, 0.6 + Math.sin(a * 1.7) * 0.4, Math.sin(a) * 0.6, '#b7ff6a', 4, { slot: SLOT_GLOW });
    }
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1;
      b.cyl(0.03, 0.06, 0.9, Math.cos(a) * 0.5, 1.7, Math.sin(a) * 0.5, '#8fd96a', 4, { rz: Math.cos(a) * 0.4, rx: -Math.sin(a) * 0.4 });
    }
  },
  ice_ore: (b) => {
    rock(b, 0.8, 0, 0, [SNOW, '#e3eef8', '#c8d8e6']);
    b.shard(0.3, 1.5, 0.1, 0.8, 0, ICE, { rz: 0.15 });
    b.shard(0.22, 1.0, 0.55, 0.6, 0.3, '#dff2ff', { rz: -0.6 });
    b.shard(0.2, 0.9, -0.5, 0.5, -0.3, ICE, { rz: 0.6 });
    b.box(0.3, 0.2, 0.3, -0.2, 0.5, 0.5, '#c9a48b', { ry: 0.5 });
  },
  scrap: (b) => {
    b.box(1.4, 0.2, 1.0, 0, 0.1, 0, '#6b7482', { ry: 0.3, shade: 0.06 });
    b.box(1.0, 0.18, 0.8, 0.2, 0.3, -0.1, '#8d97a3', { ry: -0.6, rz: 0.1, shade: 0.06 });
    b.box(0.7, 0.5, 0.5, -0.3, 0.55, 0.2, '#5a6470', { ry: 0.8, shade: 0.06 });
    b.cyl(0.1, 0.1, 1.2, 0.4, 0.5, 0.3, '#aeb9c7', 6, { rz: 1.1, ry: 0.4 });
    b.sphere(0.08, -0.3, 0.9, 0.2, '#5fd4a0', 4, { slot: SLOT_GLOW });
    b.box(0.4, 0.3, 0.3, 0.6, 0.35, 0.5, '#c43b2a', { ry: 0.2 });
  },
  titanium: (b) => {
    rock(b, 0.95, 0, 0, ['#9aa6b4', '#b4c0cc', '#7f8b99']);
    b.shard(0.4, 1.6, 0, 0.9, 0, TITAN, { rz: 0.1 });
    b.shard(0.28, 1.1, 0.6, 0.7, 0.2, TITAN, { rz: -0.5 });
    b.shard(0.24, 0.9, -0.55, 0.6, -0.3, TITAN, { rz: 0.5 });
    b.box(0.06, 1.2, 0.06, 0, 1.0, 0.42, TITAN_GLOW, { slot: SLOT_GLOW, rx: 0.2 });
    b.box(0.06, 0.8, 0.06, 0.6, 0.8, 0.5, TITAN_GLOW, { slot: SLOT_GLOW, rz: -0.5 });
    b.sphere(0.09, -0.55, 1.1, -0.1, TITAN_GLOW, 4, { slot: SLOT_GLOW });
  },
};

const PROPS: Record<string, (b: GeoBuilder) => void> = {
  grass: (b) => {
    for (let i = 0; i < 4; i++) {
      const a = i * 1.6;
      b.cone(0.07, 0.5 + (i % 2) * 0.15, Math.cos(a) * 0.14, 0.27, Math.sin(a) * 0.14, i % 2 ? '#7cc36b' : '#9ad66b', 3, { rz: Math.cos(a) * 0.3, rx: -Math.sin(a) * 0.3 });
    }
  },
  flower: (b) => {
    b.cyl(0.02, 0.03, 0.45, 0, 0.22, 0, '#5d8f3c', 4);
    b.sphere(0.12, 0, 0.5, 0, '#ff6f91', 5);
    b.sphere(0.05, 0, 0.56, 0, '#ffd84a', 4);
    b.sphere(0.08, 0.15, 0.3, 0.1, '#ffd84a', 4);
    b.cyl(0.02, 0.02, 0.3, 0.15, 0.15, 0.1, '#5d8f3c', 3);
  },
  pebble: (b) => {
    b.sphere(0.16, 0, 0.1, 0, ROCK_B, 5, { sy: 0.7, shade: 0.08 });
    b.sphere(0.1, 0.2, 0.07, 0.1, ROCK_A, 4, { sy: 0.7 });
  },
  fern: (b) => {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      b.box(0.14, 0.04, 0.9, Math.cos(a) * 0.35, 0.3, Math.sin(a) * 0.35, i % 2 ? '#3f9a44' : '#5fbf4f', { ry: -a + Math.PI / 2, rx: -0.5 });
    }
  },
  mushroom: (b) => {
    b.cyl(0.08, 0.1, 0.4, 0, 0.2, 0, '#f0e6d2', 6);
    b.sphere(0.3, 0, 0.42, 0, '#e05a5a', 7, { sy: 0.6 });
    b.sphere(0.05, 0.12, 0.55, 0.1, '#ffffff', 4);
    b.sphere(0.04, -0.14, 0.52, -0.06, '#ffffff', 4);
    b.cyl(0.05, 0.06, 0.25, 0.3, 0.12, -0.2, '#f0e6d2', 5);
    b.sphere(0.15, 0.3, 0.25, -0.2, '#e05a5a', 5, { sy: 0.6 });
  },
  log: (b) => {
    b.cyl(0.26, 0.3, 1.8, 0, 0.28, 0, TRUNK, 7, { rz: Math.PI / 2, shade: 0.05 });
    b.cyl(0.2, 0.2, 0.1, 0.95, 0.28, 0, '#c9a46a', 7, { rz: Math.PI / 2 });
    b.sphere(0.12, -0.3, 0.55, 0.1, LEAF_B, 4);
  },
  crystal_shard: (b) => {
    b.shard(0.18, 0.7, 0, 0.35, 0, CRYSTAL, { slot: SLOT_GLOW, rz: 0.2 });
    b.shard(0.12, 0.45, 0.25, 0.22, 0.1, CRYSTAL_LIGHT, { slot: SLOT_GLOW, rz: -0.5 });
  },
  spire: (b) => {
    b.cone(0.5, 3.0, 0, 1.5, 0, '#8a7bc4', 5, { shade: 0.08 });
    b.cone(0.3, 1.6, 0.5, 0.8, 0.2, '#6e6a8a', 5, { rz: -0.3, shade: 0.08 });
    b.shard(0.1, 0.4, -0.3, 0.6, -0.3, CRYSTAL, { slot: SLOT_GLOW });
  },
  cactus: (b) => {
    b.cyl(0.22, 0.26, 1.6, 0, 0.8, 0, '#4f9a5a', 7, { shade: 0.05 });
    b.sphere(0.22, 0, 1.6, 0, '#4f9a5a', 6);
    b.cyl(0.14, 0.14, 0.6, 0.4, 0.9, 0, '#5aa865', 6, { rz: Math.PI / 2 });
    b.cyl(0.14, 0.14, 0.6, 0.6, 1.25, 0, '#5aa865', 6);
    b.sphere(0.1, 0, 1.78, 0, '#ff6f91', 4);
  },
  bones: (b) => {
    for (let i = 0; i < 3; i++) b.torus(0.5 + i * 0.1, 0.06, (i - 1) * 0.45, 0.2, 0, '#efe6d8', 8, 4, { rz: 0.2 });
    b.box(1.4, 0.1, 0.1, 0, 0.1, 0, '#efe6d8', { ry: 0.1 });
    b.sphere(0.25, 0.9, 0.2, 0, '#efe6d8', 6, { sy: 0.7 });
  },
  dune_rock: (b) => {
    b.sphere(0.8, 0, 0.3, 0, '#c9814e', 6, { sy: 0.45, shade: 0.08 });
    b.sphere(0.5, 0.6, 0.25, 0.3, '#d9895a', 5, { sy: 0.5, shade: 0.08 });
  },
  reed: (b) => {
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26;
      b.cyl(0.02, 0.04, 1.5 + (i % 2) * 0.3, Math.cos(a) * 0.2, 0.8, Math.sin(a) * 0.2, '#7fa84a', 3, { rz: Math.cos(a) * 0.1 });
      b.cyl(0.05, 0.05, 0.3, Math.cos(a) * 0.2 + Math.cos(a) * 0.15, 1.6 + (i % 2) * 0.3, Math.sin(a) * 0.2, '#5a3f2a', 4);
    }
  },
  glow_mushroom: (b) => {
    b.cyl(0.07, 0.09, 0.5, 0, 0.25, 0, '#d8f5b0', 6);
    b.sphere(0.28, 0, 0.52, 0, '#5ef2ff', 7, { sy: 0.55, slot: SLOT_GLOW });
    b.cyl(0.04, 0.05, 0.3, 0.3, 0.15, -0.2, '#d8f5b0', 5);
    b.sphere(0.14, 0.3, 0.3, -0.2, '#7cff6a', 5, { sy: 0.55, slot: SLOT_GLOW });
  },
  bubble: (b) => {
    b.sphere(0.2, 0, 0.3, 0, '#b7ff6a', 6, { slot: SLOT_GLOW });
    b.sphere(0.1, 0.3, 0.15, 0.2, '#d8f5b0', 4, { slot: SLOT_GLOW });
  },
  ice_spike: (b) => {
    b.shard(0.3, 1.8, 0, 0.9, 0, ICE, { rz: 0.1 });
    b.shard(0.18, 0.9, 0.4, 0.45, 0.2, '#dff2ff', { rz: -0.5 });
    b.sphere(0.4, 0, 0.1, 0, SNOW, 5, { sy: 0.4 });
  },
  snow_rock: (b) => {
    rock(b, 0.7, 0, 0, ['#c8d8e6', '#dbe6f0', '#aebfd0']);
    b.sphere(0.6, 0, 0.9, 0, SNOW, 6, { sy: 0.35 });
  },
  ruin_pillar: (b) => {
    b.box(0.9, 0.3, 0.9, 0, 0.15, 0, '#6e6a8a', { shade: 0.06 });
    b.cyl(0.32, 0.36, 2.2, 0, 1.4, 0, '#9690b4', 7, { rz: 0.08, shade: 0.06 });
    b.box(0.5, 0.3, 0.5, 0.15, 2.6, 0, '#7f7a9e', { ry: 0.4, rz: 0.3 });
    b.box(0.08, 1.2, 0.08, 0.3, 1.3, 0.1, '#5ef2ff', { slot: SLOT_GLOW, rz: 0.08 });
  },
  glyph_stone: (b) => {
    b.box(1.0, 1.4, 0.3, 0, 0.7, 0, '#6e6a8a', { shade: 0.06, rz: 0.06 });
    b.box(0.5, 0.06, 0.05, 0, 0.9, 0.16, '#b48cff', { slot: SLOT_GLOW });
    b.box(0.06, 0.5, 0.05, 0, 0.75, 0.16, '#b48cff', { slot: SLOT_GLOW });
    b.sphere(0.07, 0.25, 0.5, 0.16, '#b48cff', 4, { slot: SLOT_GLOW });
  },
  metal_spire: (b) => {
    b.cone(0.4, 2.6, 0, 1.3, 0, '#9aa6b4', 5, { shade: 0.05 });
    b.cone(0.22, 1.4, 0.4, 0.7, 0.2, '#c8d2de', 5, { rz: -0.3, shade: 0.05 });
    b.box(0.05, 1.2, 0.05, 0, 1.0, 0.3, TITAN_GLOW, { slot: SLOT_GLOW });
  },
  boulder: (b) => rock(b, 1.3, 0, 0, ['#9aa6b4', '#b4c0cc', '#7f8b99']),
};

/** Two-lump rock for the far LOD (about half the triangles of `rock`). */
function rockFar(b: GeoBuilder, r: number, colors: [string, string, string] = [ROCK_A, ROCK_B, ROCK_C]): void {
  b.sphere(r, 0, r * 0.55, 0, colors[0], 5, { sy: 0.75, shade: 0.08 });
  b.sphere(r * 0.65, r * 0.55, r * 0.42, -r * 0.2, colors[1], 4, { sy: 0.8, shade: 0.08 });
}

/**
 * Far-LOD node builders (drawn in the mid distance ring): same silhouette and colours, fewer
 * segments, no tiny details. Models without an entry reuse their near geometry.
 */
const NODES_FAR: Record<string, (b: GeoBuilder) => void> = {
  tree_round: (b) => {
    b.cyl(0.24, 0.32, 1.8, 0, 0.9, 0, TRUNK, 5, { shade: 0.05 });
    b.sphere(1.45, 0, 2.75, 0, LEAF_A, 6, { shade: 0.06 });
    b.sphere(0.85, 0.55, 3.35, 0.2, LEAF_B, 5, { shade: 0.06 });
  },
  tree_pine: (b) => {
    b.cyl(0.2, 0.3, 2.0, 0, 1.0, 0, TRUNK_DARK, 5, { shade: 0.05 });
    b.cone(1.5, 2.4, 0, 2.8, 0, PINE_A, 5, { shade: 0.06 });
    b.cone(0.95, 2.4, 0, 4.5, 0, PINE_B, 5, { shade: 0.06 });
  },
  bush: (b) => {
    b.sphere(0.75, 0, 0.6, 0, LEAF_C, 5, { shade: 0.07 });
    b.sphere(0.5, 0.5, 0.5, 0.3, LEAF_A, 4, { shade: 0.07 });
    b.sphere(0.12, 0.2, 1.0, -0.3, '#ff6f91', 4, { slot: SLOT_GLOW });
  },
  fiber_grass: (b) => {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.3;
      b.cone(0.11, 1.2 + (i % 2) * 0.2, Math.cos(a) * 0.3, 0.6, Math.sin(a) * 0.3, i % 2 ? '#a9d65a' : '#8fc95a', 4, { rz: Math.cos(a) * 0.25, rx: -Math.sin(a) * 0.25 });
    }
  },
  rock: (b) => rockFar(b, 0.9),
  ore_iron: (b) => {
    rockFar(b, 0.9, ['#847a74', '#9a8f88', '#6b625c']);
    for (let i = 0; i < 3; i++) b.box(0.3, 0.26, 0.3, Math.cos(i * 2.1) * 0.55, 0.6, Math.sin(i * 2.1) * 0.55, '#c9a48b', { ry: i, shade: 0.05 });
  },
  ore_copper: (b) => {
    rockFar(b, 0.9, ['#8a7d70', '#a1948a', '#6e635a']);
    for (let i = 0; i < 3; i++) b.box(0.28, 0.28, 0.28, Math.cos(i * 2.1 + 0.5) * 0.55, 0.6, Math.sin(i * 2.1 + 0.5) * 0.55, '#e08a4c', { ry: i, shade: 0.05 });
  },
  coal: (b) => {
    rockFar(b, 0.9, ['#5f5c5a', '#737070', '#4a4848']);
    for (let i = 0; i < 3; i++) b.box(0.34, 0.3, 0.34, Math.cos(i * 2.1) * 0.5, 0.55, Math.sin(i * 2.1) * 0.5, '#24242a', { ry: i, shade: 0.05 });
  },
  crystal: (b) => {
    rockFar(b, 0.6, ['#6e6a8a', '#8a84a8', '#55506e']);
    b.shard(0.35, 1.9, 0, 1.0, 0, CRYSTAL, { slot: SLOT_GLOW, rz: 0.1 });
    b.shard(0.25, 1.3, 0.55, 0.7, 0.2, CRYSTAL_LIGHT, { slot: SLOT_GLOW, rz: -0.5 });
  },
  bio_pod: (b) => {
    b.sphere(0.8, 0, 0.7, 0, '#6aa84a', 5, { sy: 1.1, shade: 0.06 });
    b.sphere(0.5, 0.5, 0.4, 0.4, '#5a9a3c', 4, { shade: 0.06 });
    b.sphere(0.16, 0.3, 1.1, -0.3, '#b7ff6a', 4, { slot: SLOT_GLOW });
  },
  ice_ore: (b) => {
    rockFar(b, 0.8, [SNOW, '#e3eef8', '#c8d8e6']);
    b.shard(0.3, 1.5, 0.1, 0.8, 0, ICE, { rz: 0.15 });
    b.shard(0.22, 1.0, 0.55, 0.6, 0.3, '#dff2ff', { rz: -0.6 });
  },
  titanium: (b) => {
    rockFar(b, 0.95, ['#9aa6b4', '#b4c0cc', '#7f8b99']);
    b.shard(0.4, 1.6, 0, 0.9, 0, TITAN, { rz: 0.1 });
    b.shard(0.28, 1.1, 0.6, 0.7, 0.2, TITAN, { rz: -0.5 });
    b.box(0.08, 1.2, 0.08, 0, 1.0, 0.42, TITAN_GLOW, { slot: SLOT_GLOW, rx: 0.2 });
  },
};

const nodeCache = new Map<string, THREE.BufferGeometry>();
const nodeFarCache = new Map<string, THREE.BufferGeometry>();
const propCache = new Map<string, THREE.BufferGeometry>();

export function nodeGeometry(model: string): THREE.BufferGeometry {
  let g = nodeCache.get(model);
  if (g) return g;
  const b = new GeoBuilder(model.length * 17 + 5);
  const fn = NODES[model];
  if (fn) fn(b);
  else {
    rock(b, 0.8);
    b.sphere(0.12, 0, 1.0, 0, '#ffd84a', 4, { slot: SLOT_GLOW });
  }
  g = b.build();
  nodeCache.set(model, g);
  return g;
}

/** Far-LOD geometry for a node model (the near geometry when no cheaper variant exists). */
export function nodeGeometryFar(model: string): THREE.BufferGeometry {
  let g = nodeFarCache.get(model);
  if (g) return g;
  const fn = NODES_FAR[model];
  if (!fn) {
    g = nodeGeometry(model);
  } else {
    const b = new GeoBuilder(model.length * 17 + 5);
    fn(b);
    g = b.build();
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
  g = b.build();
  propCache.set(model, g);
  return g;
}

/** Rough height of a node model at scale 1 (markers, picking). */
export function nodeHeight(model: string): number {
  switch (model) {
    case 'tree_round': return 4.2;
    case 'tree_pine': return 5.6;
    case 'crystal': return 2.3;
    case 'bio_pod': return 2.0;
    case 'titanium': return 1.9;
    case 'fiber_grass': return 1.4;
    case 'bush': return 1.3;
    default: return 1.6;
  }
}

/** Chip particle color for a node model (gather hits). */
export function nodeChipColor(model: string): string {
  switch (model) {
    case 'tree_round':
    case 'tree_pine': return '#c9a46a';
    case 'bush':
    case 'fiber_grass': return '#8fc95a';
    case 'bio_pod': return '#9be36b';
    case 'crystal': return '#b48cff';
    case 'ice_ore': return '#bfe6ff';
    case 'ore_copper': return '#e08a4c';
    case 'ore_iron': return '#c9a48b';
    case 'coal': return '#4a4a52';
    case 'scrap': return '#aeb9c7';
    case 'titanium': return '#e8eef6';
    default: return '#9aa3ad';
  }
}

export const KNOWN_NODE_MODELS = Object.keys(NODES);
export const KNOWN_PROP_MODELS = Object.keys(PROPS);
export const NODE_FAR_MODELS = Object.keys(NODES_FAR);
