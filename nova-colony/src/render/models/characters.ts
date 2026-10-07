/**
 * Chibi character parts (shared by the player and all colonists, drawn through instanced batches
 * tinted per character), tools, and vehicle models (VehicleDef.model).
 *
 * Part geometries are white so the instance color tints them (skin / outfit / hair). Pivot
 * conventions: body at hips (y=0 is the ground under the feet, legs hang from y=0.55), arms pivot
 * at the shoulder, head pivot at the neck.
 */
import * as THREE from 'three';
import { GeoBuilder, SLOT_GLOW } from '../core/GeoBuilder';

export const LEG_TOP = 0.55;
export const BODY_H = 0.62;
export const SHOULDER_Y = LEG_TOP + BODY_H - 0.06;
export const NECK_Y = LEG_TOP + BODY_H;

export type PartKey = 'body' | 'head' | 'face' | 'arm' | 'leg' | 'hair0' | 'hair1' | 'hair2' | 'hair3';

const W = '#ffffff';
const cache = new Map<string, THREE.BufferGeometry>();

function build(key: string, fn: (b: GeoBuilder) => void): THREE.BufferGeometry {
  let g = cache.get(key);
  if (g) return g;
  const b = new GeoBuilder(key.length * 13 + 1);
  fn(b);
  g = b.build();
  cache.set(key, g);
  return g;
}

export function partGeometry(key: PartKey): THREE.BufferGeometry {
  switch (key) {
    case 'body':
      return build('body', (b) => {
        b.box(0.56, BODY_H, 0.36, 0, LEG_TOP + BODY_H / 2, 0, W);
        b.box(0.6, 0.12, 0.4, 0, LEG_TOP + 0.08, 0, '#f0f0f0'); // belt
        b.box(0.44, 0.1, 0.38, 0, LEG_TOP + BODY_H - 0.05, 0, '#f4f4f4'); // collar
      });
    case 'head':
      return build('head', (b) => {
        b.sphere(0.36, 0, 0.3, 0, W, 8, { sy: 0.95 });
        b.sphere(0.07, -0.34, 0.26, 0, W, 4); // ears
        b.sphere(0.07, 0.34, 0.26, 0, W, 4);
      });
    case 'face':
      return build('face', (b) => {
        b.sphere(0.055, -0.13, 0.32, 0.31, '#1b1b22', 4, { sz: 0.6 });
        b.sphere(0.055, 0.13, 0.32, 0.31, '#1b1b22', 4, { sz: 0.6 });
        b.sphere(0.07, -0.22, 0.2, 0.26, '#ff9aa6', 4, { sz: 0.4 });
        b.sphere(0.07, 0.22, 0.2, 0.26, '#ff9aa6', 4, { sz: 0.4 });
        b.box(0.12, 0.03, 0.03, 0, 0.17, 0.34, '#7a3b3b');
      });
    case 'arm':
      return build('arm', (b) => {
        b.box(0.15, 0.5, 0.15, 0, -0.25, 0, W);
        b.sphere(0.1, 0, -0.52, 0, '#e8e8e8', 5); // hand (tinted slightly darker)
      });
    case 'leg':
      return build('leg', (b) => {
        b.box(0.18, 0.5, 0.2, 0, -0.27, 0, W);
        b.box(0.2, 0.12, 0.3, 0, -0.5, 0.04, '#3a3a44'); // boot
      });
    case 'hair0': // short crop
      return build('hair0', (b) => {
        b.sphere(0.38, 0, 0.36, -0.02, W, 8, { sy: 0.7 });
      });
    case 'hair1': // long
      return build('hair1', (b) => {
        b.sphere(0.38, 0, 0.36, -0.02, W, 8, { sy: 0.75 });
        b.box(0.5, 0.5, 0.2, 0, 0.1, -0.28, W);
      });
    case 'hair2': // bun
      return build('hair2', (b) => {
        b.sphere(0.37, 0, 0.36, -0.02, W, 8, { sy: 0.7 });
        b.sphere(0.16, 0, 0.7, -0.12, W, 6);
      });
    case 'hair3': // spiky
      return build('hair3', (b) => {
        b.sphere(0.37, 0, 0.36, -0.02, W, 8, { sy: 0.65 });
        for (let i = 0; i < 4; i++) b.cone(0.1, 0.3, -0.18 + i * 0.12, 0.7, -0.05 + (i % 2) * 0.1, W, 4, { rz: (i - 1.5) * 0.3 });
      });
  }
}

/** Hand tool (axe-like multitool) held in the right hand; pivot at the grip. */
export function toolGeometry(): THREE.BufferGeometry {
  return build('tool', (b) => {
    b.cyl(0.03, 0.035, 0.7, 0, 0.2, 0, '#7a4f2a', 5);
    b.box(0.26, 0.16, 0.05, 0.1, 0.5, 0, '#aeb9c7');
    b.box(0.08, 0.2, 0.06, -0.06, 0.5, 0, '#6b7482');
  });
}

/** Rifle for the player when a weapon is equipped; pivot at the grip, barrel along +Z. */
export function gunGeometry(): THREE.BufferGeometry {
  return build('gun', (b) => {
    b.box(0.08, 0.14, 0.6, 0, 0.05, 0.15, '#3a3f47');
    b.cyl(0.03, 0.03, 0.5, 0, 0.1, 0.55, '#6b7482', 5, { rx: Math.PI / 2 });
    b.box(0.07, 0.18, 0.1, 0, -0.08, -0.05, '#7a4f2a');
    b.sphere(0.04, 0, 0.1, 0.8, '#ff9a2e', 4, { slot: SLOT_GLOW });
  });
}

// ------------------------------------------------------------------------------------ vehicles

const TIRE = '#2a2a2e';
const RIM = '#aeb9c7';

function wheel(b: GeoBuilder, r: number, w: number, x: number, y: number, z: number): void {
  b.cyl(r, r, w, x, y, z, TIRE, 10, { rz: Math.PI / 2 });
  b.cyl(r * 0.55, r * 0.55, w + 0.04, x, y, z, RIM, 8, { rz: Math.PI / 2 });
}

/** Vehicle models: body centred at origin, facing +Z, ground at y = 0. */
const VEHICLES: Record<string, (b: GeoBuilder) => void> = {
  atv: (b) => {
    for (const x of [-0.6, 0.6]) for (const z of [-0.7, 0.7]) wheel(b, 0.36, 0.3, x, 0.36, z);
    b.box(0.8, 0.4, 1.8, 0, 0.6, 0, '#e05a2a', { shade: 0.03 });
    b.box(0.6, 0.25, 0.7, 0, 0.9, -0.2, '#2a2a2e'); // seat
    b.box(0.7, 0.1, 0.6, 0, 0.85, 0.5, '#e05a2a');
    b.box(0.9, 0.05, 0.05, 0, 1.15, 0.5, '#6b7482'); // handlebar
    b.box(0.05, 0.35, 0.05, 0, 0.98, 0.5, '#6b7482');
    b.sphere(0.08, 0, 0.75, 0.92, '#fff2b0', 4, { slot: SLOT_GLOW });
    b.box(0.3, 0.3, 0.3, 0, 0.95, -0.75, '#c9a86b');
  },
  buggy: (b) => {
    for (const x of [-0.8, 0.8]) for (const z of [-0.9, 1.0]) wheel(b, 0.45, 0.4, x, 0.45, z);
    b.box(1.2, 0.5, 2.4, 0, 0.7, 0, '#4fa3e0', { shade: 0.03 });
    b.box(1.0, 0.3, 0.8, 0, 1.0, -0.4, '#2a2a2e');
    // roll cage
    for (const x of [-0.5, 0.5]) {
      b.box(0.08, 1.0, 0.08, x, 1.4, 0.5, '#6b7482');
      b.box(0.08, 1.0, 0.08, x, 1.4, -0.7, '#6b7482');
      b.box(0.08, 0.08, 1.3, x, 1.9, -0.1, '#6b7482');
    }
    b.box(1.1, 0.08, 0.08, 0, 1.9, 0.5, '#6b7482');
    b.box(1.1, 0.08, 0.08, 0, 1.9, -0.7, '#6b7482');
    for (const x of [-0.35, 0.35]) b.sphere(0.09, x, 0.8, 1.22, '#fff2b0', 4, { slot: SLOT_GLOW });
  },
  mining_truck: (b) => {
    for (const x of [-0.95, 0.95]) for (const z of [-1.1, 0.0, 1.2]) wheel(b, 0.5, 0.45, x, 0.5, z);
    b.box(1.8, 0.6, 3.4, 0, 0.9, 0, '#f0b24b', { shade: 0.03 });
    b.box(1.6, 1.0, 1.0, 0, 1.7, 1.1, '#f0b24b');
    b.box(1.5, 0.5, 0.1, 0, 1.9, 1.62, '#ffffff', { slot: 2 });
    b.box(1.7, 0.9, 1.9, 0, 1.6, -0.6, '#5a6470'); // bed
    b.sphere(0.5, 0, 2.0, -0.6, '#c9a48b', 6);
    b.sphere(0.35, 0.4, 2.1, -0.3, '#8e8a82', 5);
    for (const x of [-0.6, 0.6]) b.sphere(0.1, x, 1.2, 1.72, '#fff2b0', 4, { slot: SLOT_GLOW });
    b.cyl(0.08, 0.08, 0.8, 0.7, 2.5, 0.8, '#3a3f47', 6);
  },
  hover_bike: (b) => {
    b.box(0.6, 0.4, 2.2, 0, 0.75, 0, '#b26ad8', { shade: 0.03 });
    b.cone(0.3, 0.6, 0, 0.75, 1.3, '#b26ad8', 6, { rx: Math.PI / 2 });
    b.box(0.5, 0.25, 0.7, 0, 1.05, -0.3, '#2a2a2e');
    b.box(0.9, 0.05, 0.05, 0, 1.25, 0.6, '#6b7482');
    b.box(0.05, 0.3, 0.05, 0, 1.1, 0.6, '#6b7482');
    b.box(0.7, 0.1, 2.0, 0, 0.55, 0, '#5ef2ff', { slot: SLOT_GLOW });
    b.box(1.3, 0.06, 0.4, 0, 0.7, -0.6, '#b26ad8');
    b.sphere(0.08, 0, 0.85, 1.55, '#fff2b0', 4, { slot: SLOT_GLOW });
  },
  armored_rover: (b) => {
    for (const x of [-0.95, 0.95]) for (const z of [-1.2, 0.0, 1.2]) wheel(b, 0.5, 0.5, x, 0.5, z);
    b.box(1.8, 0.9, 3.4, 0, 1.0, 0, '#5e7f99', { shade: 0.03 });
    b.box(1.9, 0.2, 3.5, 0, 1.0, 0, '#58d0ff', { slot: SLOT_GLOW });
    b.box(1.4, 0.6, 1.4, 0, 1.75, -0.3, '#4a6478');
    b.box(1.3, 0.3, 0.1, 0, 1.6, 1.72, '#ffffff', { slot: 2 });
    b.cyl(0.08, 0.08, 1.1, 0.2, 2.1, 0.3, '#3a3f47', 6, { rx: Math.PI / 2 });
    b.box(0.5, 0.3, 0.5, 0.2, 2.1, -0.3, '#3a3f47');
    for (const x of [-0.6, 0.6]) b.sphere(0.1, x, 1.2, 1.72, '#fff2b0', 4, { slot: SLOT_GLOW });
  },
  titanium_hovercraft: (b) => {
    b.box(1.8, 0.5, 3.6, 0, 0.9, 0, '#dfe6ee', { shade: 0.015 });
    b.cone(0.9, 1.2, 0, 0.9, 2.3, '#dfe6ee', 6, { rx: Math.PI / 2, sy: 0.6 });
    b.box(1.9, 0.08, 3.4, 0, 0.72, 0, '#45f0ff', { slot: SLOT_GLOW });
    b.box(1.2, 0.5, 1.4, 0, 1.4, -0.2, '#c8d2de');
    b.box(1.1, 0.4, 0.1, 0, 1.45, 0.52, '#ffffff', { slot: 2 });
    for (const x of [-1.1, 1.1]) {
      b.box(0.5, 0.15, 1.6, x, 0.9, -0.6, '#dfe6ee');
      b.box(0.3, 0.06, 1.2, x, 0.84, -0.6, '#45f0ff', { slot: SLOT_GLOW });
    }
    b.box(0.1, 0.8, 0.8, 0, 1.7, -1.6, '#45f0ff', { slot: SLOT_GLOW });
    for (const x of [-0.5, 0.5]) b.sphere(0.1, x, 1.0, 2.5, '#ffffff', 4, { slot: SLOT_GLOW });
  },
};

export function vehicleGeometry(model: string): THREE.BufferGeometry {
  return build(`veh_${model}`, VEHICLES[model] ?? VEHICLES.atv);
}

/** Seat height for the rider of a vehicle model. */
export function vehicleSeatY(model: string): number {
  switch (model) {
    case 'mining_truck': return 1.9;
    case 'armored_rover': return 1.9;
    case 'titanium_hovercraft': return 1.3;
    case 'buggy': return 1.1;
    case 'hover_bike': return 1.1;
    default: return 1.0;
  }
}

export function vehicleHovers(model: string): boolean {
  return model === 'hover_bike' || model === 'titanium_hovercraft';
}

export const KNOWN_VEHICLE_MODELS = Object.keys(VEHICLES);
