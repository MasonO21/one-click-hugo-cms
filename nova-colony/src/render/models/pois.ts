/**
 * Points of interest (PoiDef.model: cache, camp, wreck, ruin, nest, outpost, beacon) plus the
 * floating marker geometries used over discovered POIs and active world events.
 */
import * as THREE from 'three';
import { GeoBuilder, SLOT_GLASS, SLOT_GLOW } from '../core/GeoBuilder';

const POD = '#dde3ea';
const POD_DARK = '#8d97a3';
const ORANGE = '#ff8a3d';
const WOOD = '#9c6b3c';
const WOOD_DARK = '#6e4a28';
const STONE = '#8e8a82';
const RUIN = '#6e6a8a';
const RUIN_LIGHT = '#9690b4';
const GLYPH = '#5ef2ff';

const POIS: Record<string, (b: GeoBuilder) => void> = {
  cache: (b) => {
    b.box(1.4, 1.1, 1.4, 0, 0.55, 0, POD, { ry: 0.2, shade: 0.03 });
    b.box(1.46, 0.2, 1.46, 0, 0.55, 0, ORANGE, { ry: 0.2 });
    b.box(1.46, 0.1, 0.3, 0, 1.0, 0, POD_DARK, { ry: 0.2 });
    b.sphere(0.1, 0, 1.2, 0, '#7cff6a', 5, { slot: SLOT_GLOW });
    // crumpled parachute
    b.sphere(0.9, 1.3, 0.3, -0.9, '#ffffff', 7, { sy: 0.35, shade: 0.04 });
    b.sphere(0.5, 1.9, 0.25, -0.2, ORANGE, 5, { sy: 0.4 });
    for (let i = 0; i < 3; i++) b.box(0.03, 0.03, 1.2, 0.5 + i * 0.3, 0.6, -0.5, '#dfe6ee', { ry: 0.6 + i * 0.1, rx: 0.3 });
  },
  camp: (b) => {
    b.wedge(2.2, 1.5, 2.4, -0.6, 0, -0.4, '#e86f4d', { ry: 0.3, shade: 0.04 });
    b.box(0.7, 0.9, 0.1, -0.6, 0.45, 0.85, '#3a2a22', { ry: 0.3 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.sphere(0.14, 1.2 + Math.cos(a) * 0.5, 0.1, 0.8 + Math.sin(a) * 0.5, i % 2 ? STONE : '#a5a098', 4);
    }
    b.cyl(0.07, 0.08, 0.7, 1.2, 0.15, 0.8, WOOD_DARK, 4, { rz: Math.PI / 2 });
    b.cyl(0.07, 0.08, 0.7, 1.2, 0.15, 0.8, WOOD, 4, { rz: Math.PI / 2, ry: 1.2 });
    b.cone(0.22, 0.6, 1.2, 0.45, 0.8, '#ff9a2e', 5, { slot: SLOT_GLOW });
    b.cyl(0.2, 0.2, 1.4, 1.0, 0.2, -1.2, WOOD, 6, { rz: Math.PI / 2 });
    b.cyl(0.04, 0.05, 2.4, 1.6, 1.2, -0.6, WOOD_DARK, 4);
    b.box(0.8, 0.5, 0.04, 2.0, 2.1, -0.6, '#ffd84a');
    b.box(0.6, 0.5, 0.5, -1.4, 0.25, 0.9, WOOD, { ry: 0.5 });
  },
  wreck: (b) => {
    b.cyl(1.0, 1.4, 4.0, 0, 1.1, 0, POD, 10, { rz: 1.2, ry: 0.5, shade: 0.04 });
    b.cyl(1.42, 1.42, 0.2, -0.6, 1.3, -0.3, ORANGE, 10, { rz: 1.2, ry: 0.5 });
    b.box(2.6, 0.12, 1.2, 1.6, 0.4, 1.6, POD_DARK, { ry: 0.9, rz: 0.2 });
    b.box(1.8, 0.12, 0.9, -1.8, 0.3, -1.5, POD_DARK, { ry: -0.5 });
    b.cyl(0.5, 0.7, 0.8, 2.0, 1.3, -0.4, '#2a2f38', 8, { rz: 1.2, ry: 0.5 });
    b.cyl(0.4, 0.4, 0.1, 2.3, 1.45, -0.3, ORANGE, 8, { rz: 1.2, ry: 0.5, slot: SLOT_GLOW });
    b.sphere(0.35, 0.4, 1.9, 0.6, '#ffffff', 6, { slot: SLOT_GLASS });
    b.box(0.7, 0.5, 0.5, -2.2, 0.25, 0.8, '#3a3230', { ry: 0.3 });
    b.sphere(0.5, 1.0, 0.3, -1.9, '#3a3230', 5, { sy: 0.5 });
    b.sphere(0.09, 0.2, 2.4, -0.2, '#ff4d5e', 4, { slot: SLOT_GLOW });
  },
  ruin: (b) => {
    b.box(3.2, 0.3, 3.2, 0, 0.15, 0, RUIN, { shade: 0.06 });
    for (const [x, z, h] of [[-1.2, -1.2, 2.6], [1.2, -1.2, 1.8], [1.2, 1.2, 2.4], [-1.2, 1.2, 1.1]]) {
      b.cyl(0.3, 0.34, h, x, 0.3 + h / 2, z, RUIN_LIGHT, 7, { shade: 0.06, rz: 0.03 });
      b.box(0.08, h * 0.6, 0.08, x + 0.3, 0.3 + h / 2, z, GLYPH, { slot: SLOT_GLOW });
    }
    b.box(2.6, 0.4, 0.4, 0, 2.9, -1.2, RUIN, { shade: 0.06, rz: 0.1 });
    b.box(1.0, 1.2, 0.3, 0, 0.9, 0, RUIN_LIGHT, { ry: 0.4 });
    b.box(0.5, 0.06, 0.06, 0, 1.1, 0.17, GLYPH, { ry: 0.4, slot: SLOT_GLOW });
    b.box(0.06, 0.5, 0.06, 0, 0.9, 0.17, GLYPH, { ry: 0.4, slot: SLOT_GLOW });
    b.sphere(0.25, 0, 1.9, 0, GLYPH, 6, { slot: SLOT_GLOW });
  },
  nest: (b) => {
    b.sphere(1.8, 0, 0.2, 0, '#5a4a6e', 8, { sy: 0.5, shade: 0.07 });
    b.sphere(1.0, 0.9, 0.5, -0.6, '#6e5a86', 6, { sy: 0.6, shade: 0.07 });
    b.cyl(0.55, 0.75, 0.6, -0.5, 0.95, 0.4, '#3a2e4a', 8);
    b.cyl(0.4, 0.4, 0.1, -0.5, 1.26, 0.4, '#1a1424', 8);
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26;
      b.sphere(0.22, Math.cos(a) * 1.1, 0.75, Math.sin(a) * 1.1, i % 2 ? '#c56cf0' : '#9be36b', 5, { sy: 1.3, slot: SLOT_GLOW });
    }
    for (let i = 0; i < 4; i++) {
      const a = i * 1.6 + 0.4;
      b.cone(0.12, 0.9, Math.cos(a) * 1.5, 0.9, Math.sin(a) * 1.5, '#8a7aa0', 4, { rz: Math.cos(a) * 0.5, rx: -Math.sin(a) * 0.5 });
    }
  },
  outpost: (b) => {
    b.box(3.2, 2.0, 2.6, 0, 1.0, 0, '#dfe6ee', { shade: 0.02 });
    b.box(3.3, 0.3, 2.7, 0, 1.0, 0, '#7fb6d9');
    b.box(3.0, 0.2, 2.4, 0, 2.1, 0, POD_DARK);
    b.box(0.8, 0.5, 0.08, -0.8, 1.4, 1.32, '#ffffff', { slot: SLOT_GLASS });
    b.box(0.8, 1.5, 0.08, 0.8, 0.75, 1.32, '#2a2f38');
    b.box(0.2, 0.06, 0.06, 0.95, 1.1, 1.36, '#ff4d5e', { slot: SLOT_GLOW });
    b.cyl(0.04, 0.05, 1.6, 1.2, 3.0, -0.8, POD_DARK, 4);
    b.sphere(0.09, 1.2, 3.85, -0.8, '#7cff6a', 4, { slot: SLOT_GLOW });
    b.box(1.6, 0.06, 1.0, -0.8, 2.4, -0.4, '#1f3f7a', { rx: -0.4 });
    b.box(0.6, 0.6, 0.6, 2.1, 0.3, 0.6, '#c43b2a', { ry: 0.3 });
    b.sphere(0.5, 1.9, 0.1, -0.9, '#3a3230', 5, { sy: 0.4 });
  },
  beacon: (b) => {
    b.cyl(0.9, 1.1, 0.4, 0, 0.2, 0, '#5a6470', 8);
    b.cyl(0.25, 0.4, 4.0, 0, 2.4, 0, '#8d97a3', 6);
    b.torus(0.6, 0.06, 0, 1.2, 0, GLYPH, 12, 4, { rx: Math.PI / 2, slot: SLOT_GLOW });
    b.box(0.9, 0.5, 0.9, 0, 4.6, 0, '#6b7482');
    b.cyl(0.8, 0.2, 0.4, 0.5, 5.1, 0, '#dfe6ee', 10, { rz: -0.9 });
    b.sphere(0.22, 0, 5.1, 0, GLYPH, 6, { slot: SLOT_GLOW });
    b.cyl(0.04, 0.05, 1.2, 0, 5.6, 0, '#8d97a3', 4);
    b.sphere(0.1, 0, 6.25, 0, '#ff4d5e', 4, { slot: SLOT_GLOW });
  },
};

const cache = new Map<string, THREE.BufferGeometry>();

export function poiGeometry(model: string): THREE.BufferGeometry {
  let g = cache.get(model);
  if (g) return g;
  const b = new GeoBuilder(model.length * 29 + 3);
  const fn = POIS[model];
  if (fn) fn(b);
  else {
    // cairn with a flag
    for (let i = 0; i < 4; i++) b.sphere(0.5 - i * 0.1, 0, 0.3 + i * 0.5, 0, i % 2 ? STONE : '#a5a098', 5, { sy: 0.7 });
    b.cyl(0.03, 0.04, 1.6, 0.2, 2.6, 0, WOOD_DARK, 4);
    b.box(0.6, 0.4, 0.04, 0.5, 3.2, 0, '#ffd84a');
  }
  g = b.build(true);
  cache.set(model, g);
  return g;
}

export function poiHeight(model: string): number {
  switch (model) {
    case 'beacon': return 6.3;
    case 'outpost': return 3.9;
    case 'wreck': return 3.0;
    case 'ruin': return 3.1;
    default: return 2.4;
  }
}

let marker: THREE.BufferGeometry | null = null;
/** Floating glowing diamond for discovered, unlooted POIs. */
export function markerGeometry(): THREE.BufferGeometry {
  if (marker) return marker;
  const b = new GeoBuilder(1);
  b.shard(0.35, 0.6, 0, 0, 0, '#ffd84a', { slot: SLOT_GLOW });
  b.torus(0.5, 0.04, 0, -0.75, 0, '#ffd84a', 12, 4, { rx: Math.PI / 2, slot: SLOT_GLOW });
  marker = b.build();
  return marker;
}

let restockMarker: THREE.BufferGeometry | null = null;
/**
 * A cache that filled up again: a low survey ring on the ground with four small glints standing on it (glow, tinted
 * per instance). Subtle on purpose: the bobbing diamond above already says "open me".
 */
export function restockGeometry(): THREE.BufferGeometry {
  if (restockMarker) return restockMarker;
  const b = new GeoBuilder(1);
  b.torus(1.75, 0.06, 0, 0.12, 0, '#ffffff', 28, 4, { rx: Math.PI / 2, slot: SLOT_GLOW });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    b.shard(0.09, 0.22, Math.cos(a) * 1.75, 0.34, Math.sin(a) * 1.75, '#ffffff', { slot: SLOT_GLOW });
  }
  restockMarker = b.build();
  return restockMarker;
}

let eventMarker: THREE.BufferGeometry | null = null;
/** Tall light beam + ring for active world events. */
export function eventMarkerGeometry(): THREE.BufferGeometry {
  if (eventMarker) return eventMarker;
  const b = new GeoBuilder(2);
  b.cyl(0.18, 0.5, 14, 0, 7, 0, '#5ef2ff', 8, { slot: SLOT_GLOW });
  b.torus(1.2, 0.08, 0, 0.3, 0, '#5ef2ff', 16, 5, { rx: Math.PI / 2, slot: SLOT_GLOW });
  b.shard(0.5, 0.9, 0, 3.0, 0, '#ffffff', { slot: SLOT_GLOW });
  eventMarker = b.build();
  return eventMarker;
}

export const KNOWN_POI_MODELS = Object.keys(POIS);
