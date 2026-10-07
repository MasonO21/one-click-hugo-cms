/**
 * Chibi character parts (shared by the player and all colonists, drawn through instanced batches
 * tinted per character), tools, and vehicle models (VehicleDef.model).
 *
 * Part geometries are white so the instance color tints them (skin / outfit / hair). Pivot
 * conventions: body at hips (y=0 is the ground under the feet, legs hang from y=0.55), arms pivot
 * at the shoulder, head pivot at the neck.
 */
import * as THREE from 'three';
import { GeoBuilder, SLOT_GLASS, SLOT_GLOW } from '../core/GeoBuilder';

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
const HEADLIGHT = '#fff2b0';
const TAIL = '#ff4d5e';
const HOVER = '#5ef2ff';
const STEEL = '#6b7482';
const SEAT = '#2a2a2e';
const GOLD = '#d6ae55';

function wheel(b: GeoBuilder, r: number, w: number, x: number, y: number, z: number): void {
  b.wheel(r, w, x, y, z, TIRE, RIM, 8);
}

/** Pair of headlights at the front (+Z) edge. */
function headlights(b: GeoBuilder, x: number, y: number, z: number, r = 0.1): void {
  for (const sx of [-x, x]) {
    b.box(r * 2.2, r * 2.2, 0.06, sx, y, z, STEEL);
    b.box(r * 1.6, r * 1.6, 0.06, sx, y, z + 0.04, HEADLIGHT, { slot: SLOT_GLOW });
  }
}

/** Glowing hover pad (flat disc) under a hovering vehicle. */
function hoverPad(b: GeoBuilder, r: number, x: number, y: number, z: number): void {
  b.cyl(r, r * 0.8, 0.12, x, y, z, '#3a4a58', 8);
  b.cyl(r * 0.85, r * 0.85, 0.05, x, y - 0.06, z, HOVER, 8, { slot: SLOT_GLOW });
}

/**
 * Vehicle models: body centred at origin, facing +Z, ground at y = 0. Chunky toy vehicles with
 * proper wheels (tyre + hub), headlights, seats, roll cages, cargo and hover pads. Seat heights
 * (vehicleSeatY) are unchanged so the rider pose keeps fitting.
 */
const VEHICLES: Record<string, (b: GeoBuilder) => void> = {
  atv: (b) => {
    for (const x of [-0.6, 0.6]) for (const z of [-0.7, 0.7]) wheel(b, 0.36, 0.3, x, 0.36, z);
    b.bevelBox(0.8, 0.4, 1.8, 0, 0.6, 0, '#e05a2a', 0.08, { shade: 0.03 });
    for (const x of [-0.6, 0.6]) for (const z of [-0.7, 0.7]) b.box(0.36, 0.1, 0.9, x, 0.78, z, '#c94a1e'); // fenders
    b.box(0.6, 0.22, 0.75, 0, 0.9, -0.15, SEAT, { shade: 0.03 }); // seat
    b.box(0.7, 0.1, 0.6, 0, 0.85, 0.5, '#e05a2a');
    b.box(0.9, 0.06, 0.06, 0, 1.15, 0.5, STEEL); // handlebar
    b.box(0.06, 0.35, 0.06, 0, 0.98, 0.5, STEEL);
    for (const sx of [-0.45, 0.45]) b.box(0.12, 0.06, 0.06, sx, 1.15, 0.5, SEAT); // grips
    b.box(0.5, 0.2, 0.08, 0, 0.72, 0.92, STEEL); // front rack
    b.box(0.2, 0.16, 0.06, 0, 0.72, 0.97, HEADLIGHT, { slot: SLOT_GLOW });
    b.box(0.7, 0.06, 0.4, 0, 0.82, -0.75, STEEL); // rear rack
    b.box(0.34, 0.3, 0.3, 0, 1.0, -0.75, '#c9a86b', { shade: 0.05 }); // strapped sack
    b.box(0.38, 0.05, 0.34, 0, 1.0, -0.75, '#6e4a28');
    b.cyl(0.05, 0.05, 0.6, 0.42, 0.5, -0.5, STEEL, 5, { rx: Math.PI / 2 }); // exhaust
    b.box(0.82, 0.05, 1.0, 0, 0.81, 0.1, '#f4f6f8'); // racing stripe
  },
  buggy: (b) => {
    for (const x of [-0.8, 0.8]) for (const z of [-0.9, 1.0]) wheel(b, 0.45, 0.4, x, 0.45, z);
    b.bevelBox(1.2, 0.5, 2.4, 0, 0.7, 0, '#4fa3e0', 0.1, { shade: 0.03 });
    b.box(1.1, 0.3, 0.6, 0, 0.75, 1.1, '#3f8ac4', { rx: -0.35 }); // sloped hood
    b.box(1.0, 0.3, 0.8, 0, 1.0, -0.4, SEAT);
    b.box(1.0, 0.5, 0.2, 0, 1.3, -0.75, SEAT); // seat back
    b.box(0.5, 0.06, 0.08, 0, 1.2, 0.3, STEEL); // steering wheel
    b.cyl(0.14, 0.14, 0.04, 0, 1.25, 0.25, SEAT, 8, { rx: 1.2 });
    // roll cage
    for (const x of [-0.5, 0.5]) {
      b.box(0.08, 1.0, 0.08, x, 1.4, 0.5, STEEL);
      b.box(0.08, 1.0, 0.08, x, 1.4, -0.7, STEEL);
      b.box(0.08, 0.08, 1.3, x, 1.9, -0.1, STEEL);
    }
    b.box(1.1, 0.08, 0.08, 0, 1.9, 0.5, STEEL);
    b.box(1.1, 0.08, 0.08, 0, 1.9, -0.7, STEEL);
    headlights(b, 0.38, 0.8, 1.22, 0.09);
    b.box(1.3, 0.12, 0.12, 0, 0.5, 1.22, STEEL); // bumper
    b.box(0.5, 0.06, 2.0, 0, 0.96, 0.0, '#f4f6f8'); // stripe
    // spare tyre on the back
    b.cyl(0.4, 0.4, 0.22, 0, 1.25, -1.26, TIRE, 8, { rx: Math.PI / 2, shade: 0.03 });
    b.cyl(0.22, 0.22, 0.26, 0, 1.25, -1.26, RIM, 6, { rx: Math.PI / 2 });
    b.box(0.3, 0.1, 0.05, 0, 0.95, -1.22, TAIL, { slot: SLOT_GLOW });
  },
  mining_truck: (b) => {
    for (const x of [-0.95, 0.95]) for (const z of [-1.1, 0.0, 1.2]) wheel(b, 0.5, 0.45, x, 0.5, z);
    b.box(1.6, 0.3, 3.3, 0, 0.55, 0, '#3a3f47'); // chassis
    b.bevelBox(1.8, 0.6, 3.4, 0, 0.9, 0, '#f0b24b', 0.08, { shade: 0.03 });
    b.bevelBox(1.6, 1.0, 1.0, 0, 1.7, 1.1, '#f0b24b', 0.1, { shade: 0.02 }); // cab
    b.box(1.4, 0.5, 0.1, 0, 1.9, 1.62, '#ffffff', { slot: SLOT_GLASS }); // windshield
    for (const sx of [-0.82, 0.82]) b.box(0.08, 0.4, 0.6, sx, 1.9, 1.1, '#ffffff', { slot: SLOT_GLASS });
    b.box(1.5, 0.3, 0.1, 0, 1.2, 1.66, '#3a3f47'); // grill
    b.stripes(1.7, 0.16, 0.12, 0, 0.8, 1.72, 6, '#f0b24b', '#2e2c2a', 'x'); // hazard bumper
    headlights(b, 0.62, 1.15, 1.72, 0.1);
    for (const sx of [-0.95, 0.95]) b.box(0.1, 0.22, 0.14, sx, 2.0, 1.5, '#3a3f47'); // mirrors
    b.cyl(0.08, 0.08, 0.9, 0.7, 2.6, 0.75, '#3a3f47', 6); // exhaust stack
    b.box(0.2, 0.12, 0.2, 0, 2.3, 1.1, TAIL, { slot: SLOT_GLOW, ry: Math.PI / 4 }); // beacon
    // tipper bed with ore
    b.box(1.7, 0.1, 1.9, 0, 1.25, -0.6, '#5a6470');
    b.box(0.08, 0.9, 1.9, -0.81, 1.65, -0.6, '#5a6470');
    b.box(0.08, 0.9, 1.9, 0.81, 1.65, -0.6, '#5a6470');
    b.box(1.7, 0.9, 0.08, 0, 1.65, -1.51, '#5a6470');
    b.box(1.7, 0.9, 0.08, 0, 1.65, 0.31, '#5a6470');
    for (const sx of [-0.81, 0.81]) b.box(0.12, 0.08, 1.95, sx, 2.1, -0.6, '#8a949e'); // bed rims
    b.shard(0.4, 0.5, -0.2, 2.1, -0.7, '#c9a48b', { sx: 1.3 });
    b.shard(0.3, 0.4, 0.45, 2.05, -0.3, '#8e8a82');
    b.shard(0.26, 0.36, 0.2, 2.0, -1.1, '#d9742a');
  },
  hover_bike: (b) => {
    b.bevelBox(0.6, 0.4, 2.2, 0, 0.75, 0, '#b26ad8', 0.08, { shade: 0.03 });
    b.cone(0.3, 0.6, 0, 0.75, 1.3, '#b26ad8', 6, { rx: Math.PI / 2 });
    b.box(0.5, 0.22, 0.7, 0, 1.05, -0.3, SEAT);
    b.box(0.5, 0.3, 0.1, 0, 1.25, -0.68, SEAT); // seat back
    b.box(0.9, 0.05, 0.05, 0, 1.25, 0.6, STEEL);
    b.box(0.05, 0.3, 0.05, 0, 1.1, 0.6, STEEL);
    b.box(0.7, 0.1, 2.0, 0, 0.55, 0, HOVER, { slot: SLOT_GLOW });
    for (const sx of [-0.55, 0.55]) b.box(0.4, 0.06, 0.5, sx, 0.72, -0.5, '#9a55c2'); // stabiliser fins
    hoverPad(b, 0.3, 0, 0.5, 0.65);
    hoverPad(b, 0.3, 0, 0.5, -0.7);
    b.box(0.2, 0.14, 0.06, 0, 0.85, 1.58, HEADLIGHT, { slot: SLOT_GLOW });
    b.box(0.4, 0.08, 0.06, 0, 0.8, -1.1, TAIL, { slot: SLOT_GLOW });
    b.box(0.62, 0.05, 1.2, 0, 0.96, 0.4, '#f4f6f8'); // stripe
  },
  armored_rover: (b) => {
    for (const x of [-0.95, 0.95]) for (const z of [-1.2, 0.0, 1.2]) wheel(b, 0.5, 0.5, x, 0.5, z);
    b.bevelBox(1.8, 0.9, 3.4, 0, 1.0, 0, '#5e7f99', 0.12, { shade: 0.03 });
    b.box(1.9, 0.12, 3.5, 0, 1.0, 0, '#58d0ff', { slot: SLOT_GLOW });
    for (const sx of [-0.92, 0.92]) b.box(0.1, 0.5, 3.0, sx, 0.75, 0, '#4a6478'); // side skirts
    b.wedge(1.8, 0.5, 0.5, 0, 0.6, 1.75, '#4a6478', { ry: Math.PI / 2, shade: 0.03 }); // front plough
    b.bevelBox(1.4, 0.6, 1.4, 0, 1.75, -0.3, '#4a6478', 0.1, { shade: 0.02 }); // cabin
    b.box(1.3, 0.3, 0.1, 0, 1.6, 1.72, '#ffffff', { slot: SLOT_GLASS });
    b.box(1.0, 0.25, 0.08, 0, 1.8, 0.42, '#ffffff', { slot: SLOT_GLASS }); // cabin visor
    b.cyl(0.08, 0.08, 1.1, 0.2, 2.1, 0.3, '#3a3f47', 6, { rx: Math.PI / 2 });
    b.bevelBox(0.5, 0.3, 0.5, 0.2, 2.1, -0.3, '#3a3f47', 0.05);
    b.cyl(0.03, 0.03, 0.8, -0.5, 2.4, -0.8, STEEL, 4); // antenna
    b.box(0.1, 0.1, 0.1, -0.5, 2.82, -0.8, TAIL, { slot: SLOT_GLOW, ry: Math.PI / 4 });
    headlights(b, 0.62, 1.2, 1.72, 0.1);
    b.stripes(1.6, 0.14, 0.1, 0, 1.3, -1.72, 4, '#ff9440', '#2e2c2a', 'x'); // rear hazard
    b.box(1.0, 0.08, 0.9, 0, 1.49, -1.0, '#3b4c5e'); // cargo hatch
  },
  titanium_hovercraft: (b) => {
    b.bevelBox(1.8, 0.5, 3.6, 0, 0.9, 0, '#dfe6ee', 0.12, { shade: 0.015 });
    b.cone(0.9, 1.2, 0, 0.9, 2.3, '#dfe6ee', 6, { rx: Math.PI / 2, sy: 0.6 });
    b.box(1.9, 0.08, 3.4, 0, 0.72, 0, '#45f0ff', { slot: SLOT_GLOW });
    b.bevelBox(1.2, 0.5, 1.4, 0, 1.4, -0.2, '#c8d2de', 0.1); // cabin
    b.box(1.1, 0.4, 0.1, 0, 1.45, 0.52, '#ffffff', { slot: SLOT_GLASS });
    b.box(1.3, 0.06, 1.5, 0, 1.68, -0.2, GOLD); // gold roof trim
    for (const x of [-1.1, 1.1]) {
      b.box(0.5, 0.18, 1.6, x, 0.9, -0.6, '#dfe6ee'); // side pods
      b.box(0.3, 0.06, 1.2, x, 0.82, -0.6, '#45f0ff', { slot: SLOT_GLOW });
      b.box(0.52, 0.04, 1.62, x, 1.0, -0.6, GOLD);
    }
    b.box(0.1, 0.8, 0.8, 0, 1.7, -1.6, '#45f0ff', { slot: SLOT_GLOW }); // tail fin
    b.box(0.14, 0.9, 0.3, 0, 1.6, -1.3, GOLD);
    hoverPad(b, 0.42, 0, 0.62, 1.0);
    hoverPad(b, 0.42, 0, 0.62, -1.0);
    b.cyl(0.3, 0.3, 0.3, 0, 1.0, -1.85, '#c8d2de', 8, { rx: Math.PI / 2 }); // thruster
    b.cyl(0.22, 0.22, 0.08, 0, 1.0, -2.02, '#45f0ff', 8, { rx: Math.PI / 2, slot: SLOT_GLOW });
    b.box(1.82, 0.05, 2.4, 0, 1.16, 0.2, GOLD); // gold deck line
    for (const x of [-0.5, 0.5]) b.box(0.22, 0.14, 0.06, x, 1.0, 2.5, '#ffffff', { slot: SLOT_GLOW });
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
