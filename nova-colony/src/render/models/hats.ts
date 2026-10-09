/**
 * Hats (CosmeticDef kind 'hat') worn on the player's head. Built in the character's NECK space
 * (see characters.ts: head centre at (0, HEAD_CY, 0), cranium radii 0.185 × 0.215 × 0.195, hair up to
 * y ≈ 0.49) with fixed colours from the cosmetic's `color` / `accent`, a little oversized so each reads
 * at play zoom by its silhouette: wide brim, rolled cuff, knotted tails, ear cups, goggles, dome,
 * beret, visor strip, orbiting drones.
 *
 * Frontier field gear: felt, wool, cotton, leather, brass, glass. No ears, bows or toys.
 */
import * as THREE from 'three';
import { GeoBuilder, SLOT_GLOW, emptyGeometry } from '../core/GeoBuilder';
import { lathe, ellipsoid, sweep, mirror } from './soft';
import { HEAD_CY, headShell } from './characters';

type C = string;

export interface HatSpec {
  /** Hair under the hat: the wearer's full style, or only the trimmed back and sides (crown covered). */
  hair: 'full' | 'trim';
  /** Whole-hat tilt about the head centre (radians, + tips the front down); hats are built level. */
  tilt?: number;
  build: (b: GeoBuilder, color: C, accent: C) => void;
  /** See-through part (the bubble helmet's dome), drawn with a translucent material. */
  glass?: (b: GeoBuilder, color: C, accent: C) => void;
  /** Satellites circling the head: one is built at angle 0 of its orbit; `count` are spread evenly. */
  orbit?: { build: (b: GeoBuilder, color: C, accent: C) => void; count: number; speed: number };
}

const _c = new THREE.Color();
function shade(hex: C, k: number): C {
  return '#' + _c.set(hex).multiplyScalar(k).getHexString();
}

const BRASS = '#c9a24e';
const LEATHER_DARK = '#3a2a20';

/** A point on the cranium surface pushed out by `out` (az: 0 = front, + toward +X; el: 0 = equator). */
function onHead(az: number, el: number, out = 1.06): [number, number, number] {
  return [Math.sin(az) * Math.cos(el) * 0.185 * out, HEAD_CY + Math.sin(el) * 0.215 * out, Math.cos(az) * Math.cos(el) * 0.195 * out];
}

/** Five-pointed star badge facing +Z, centred at (x,y,z). */
function star(b: GeoBuilder, r: number, x: number, y: number, z: number, color: C, opts: { rx?: number; ry?: number } = {}): void {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
    const rr = i % 2 ? r * 0.45 : r;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: r * 0.25, bevelEnabled: true, bevelThickness: r * 0.12, bevelSize: r * 0.1, bevelSegments: 1 });
  b.add(g, color, x, y, z, opts);
}

export const HATS: Record<string, HatSpec> = {
  hat_ranger: {
    hair: 'trim',
    tilt: -0.08,
    build: (b, c, a) => {
      // creased felt crown, a wide brim with a gently rolled edge, worn leather band
      lathe(b, [0.208, 0.33, 0.212, 0.37, 0.203, 0.45, 0.188, 0.52, 0.16, 0.565, 0.11, 0.585, 0.05, 0.572, 0.0, 0.56], 14, 0, 0, -0.01, c);
      lathe(b, [0.2, 0.338, 0.3, 0.33, 0.368, 0.34, 0.388, 0.358, 0.384, 0.37, 0.36, 0.356, 0.29, 0.348, 0.2, 0.352], 18, 0, 0, -0.01, shade(c, 0.92), { sx: 1.02, sz: 1.08 });
      lathe(b, [0.214, 0.352, 0.219, 0.356, 0.214, 0.41, 0.208, 0.414], 14, 0, 0, -0.01, a);
      ellipsoid(b, 0.022, 0.02, 0.01, Math.sin(0.75) * 0.219, 0.381, Math.cos(0.75) * 0.219 - 0.01, BRASS, 6, { ry: 0.75 }); // band concho
    },
  },
  hat_watch_cap: {
    hair: 'trim',
    tilt: -0.14,
    build: (b, c, a) => {
      lathe(b, [0.212, 0.32, 0.216, 0.4, 0.205, 0.468, 0.172, 0.53, 0.105, 0.566, 0.0, 0.578], 14, 0, 0, -0.006, c, { sz: 1.04 });
      // rolled cuff with a thin oatmeal stripe
      lathe(b, [0.212, 0.31, 0.232, 0.318, 0.24, 0.35, 0.24, 0.39, 0.232, 0.418, 0.212, 0.425], 16, 0, 0, -0.006, shade(c, 0.9), { sz: 1.04 });
      lathe(b, [0.241, 0.36, 0.2425, 0.364, 0.2425, 0.378, 0.241, 0.382], 16, 0, 0, -0.006, a, { sz: 1.04 });
      // knit ribs on the cuff (cheap: thin vertical bars)
      for (let i = 0; i < 18; i++) {
        const az = (i / 18) * Math.PI * 2;
        b.add(new THREE.CapsuleGeometry(0.008, 0.07, 1, 4), shade(c, 0.8), Math.sin(az) * 0.236, 0.364, Math.cos(az) * 0.245 - 0.006);
      }
    },
  },
  hat_bandana: {
    hair: 'trim',
    build: (b, c, a) => {
      headShell(b, c, 18, 0, Math.PI * 2, 0, 1.58, -0.72, 0.024);
      // knot and two tails at the back
      ellipsoid(b, 0.048, 0.038, 0.04, 0, 0.268, -0.222, shade(c, 0.9), 8);
      mirror((s) => sweep(b, [s * 0.02, 0.262, -0.235, 0.024, s * 0.05, 0.205, -0.262, 0.026, s * 0.07, 0.13, -0.25, 0.016], 6, shade(c, 0.94), { sz: 0.9 }));
      // scattered dots
      for (let i = 0; i < 14; i++) {
        const az = (i * 2.4) % (Math.PI * 2);
        const el = 0.35 + ((i * 0.37) % 1) * 0.95;
        const p = onHead(az, el, 1.09);
        if (p[2] > 0.1 && p[1] < 0.37) continue;
        b.sphere(0.012, p[0], p[1], p[2], a, 5);
      }
    },
  },
  hat_headset: {
    hair: 'full',
    build: (b, c, a) => {
      // padded band over the crown
      b.add(new THREE.TorusGeometry(0.248, 0.017, 6, 20, Math.PI), c, 0, 0.245, -0.012, { ry: 0 });
      ellipsoid(b, 0.06, 0.022, 0.04, 0, 0.495, -0.012, a, 8);
      mirror((s) => {
        // ear cups with cushions
        b.add(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 14), c, s * 0.226, 0.238, -0.004, { rz: Math.PI / 2 });
        ellipsoid(b, 0.03, 0.068, 0.068, s * 0.252, 0.238, -0.004, shade(c, 1.15), 12);
        b.add(new THREE.TorusGeometry(0.06, 0.016, 6, 14), a, s * 0.2, 0.238, -0.004, { ry: Math.PI / 2 });
      });
      // mic boom to the mouth
      sweep(b, [-0.25, 0.215, 0.03, 0.01, -0.22, 0.17, 0.12, 0.009, -0.13, 0.148, 0.19, 0.008, -0.05, 0.15, 0.21, 0.008], 5, c);
      ellipsoid(b, 0.02, 0.018, 0.022, -0.04, 0.15, 0.214, a, 8);
      // stub antenna with a status light
      sweep(b, [0.27, 0.27, -0.02, 0.008, 0.29, 0.37, -0.05, 0.005], 4, c);
      b.sphere(0.012, 0.29, 0.375, -0.05, a, 5, { slot: SLOT_GLOW });
    },
  },
  hat_aviator: {
    hair: 'trim',
    build: (b, c, a) => {
      headShell(b, c, 18, 0, Math.PI * 2, 0, 1.95, -0.42, 0.03);
      sweep(b, [0, 0.33, 0.2, 0.012, 0, 0.47, 0.1, 0.014, 0, 0.49, -0.04, 0.014, 0, 0.42, -0.17, 0.012], 5, shade(c, 0.85)); // seam
      mirror((s) => {
        ellipsoid(b, 0.032, 0.08, 0.064, s * 0.198, 0.19, 0.004, c, 10); // ear flaps
        sweep(b, [s * 0.19, 0.12, 0.03, 0.009, s * 0.16, 0.06, 0.08, 0.008], 4, LEATHER_DARK); // loose chin straps
      });
      // goggles pushed up on the forehead: brass rims, tinted lenses, strap
      b.add(new THREE.TorusGeometry(0.212, 0.012, 4, 22), LEATHER_DARK, 0, 0.37, -0.02, { rx: Math.PI / 2 - 0.35 });
      mirror((s) => {
        const [x, y, z] = [s * 0.07, 0.4, 0.182];
        b.add(new THREE.TorusGeometry(0.046, 0.014, 6, 14), BRASS, x, y, z, { rx: -0.55, ry: s * 0.38 });
        ellipsoid(b, 0.042, 0.042, 0.014, x, y, z, a, 10, { rx: -0.55, ry: s * 0.38 });
        b.sphere(0.009, x - s * 0.012, y + 0.014, z + 0.02, '#ffffff', 4);
      });
      b.add(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 6), BRASS, 0, 0.4, 0.2, { rz: Math.PI / 2, rx: -0.55 });
    },
  },
  hat_pith_helmet: {
    hair: 'trim',
    tilt: -0.06,
    build: (b, c, a) => {
      lathe(b, [0.212, 0.33, 0.222, 0.38, 0.212, 0.47, 0.184, 0.54, 0.135, 0.596, 0.07, 0.62, 0.0, 0.626], 16, 0, 0, -0.01, c);
      // sloping brim, longer front and back
      lathe(b, [0.205, 0.335, 0.31, 0.3, 0.348, 0.284, 0.356, 0.292, 0.338, 0.304, 0.24, 0.335, 0.205, 0.352], 18, 0, 0, -0.01, shade(c, 0.94), { sx: 0.96, sz: 1.14 });
      lathe(b, [0.222, 0.352, 0.227, 0.357, 0.226, 0.4, 0.22, 0.405], 16, 0, 0, -0.01, a);
      ellipsoid(b, 0.034, 0.016, 0.034, 0, 0.628, -0.06, shade(c, 0.9), 8); // vent cap
      ellipsoid(b, 0.022, 0.022, 0.012, 0.0, 0.38, 0.226, BRASS, 6); // badge
    },
  },
  hat_space_bubble: {
    hair: 'full',
    build: (b, c, a) => {
      // orange metal neck ring, white seal, little valves; a painted glint on the glass
      b.add(new THREE.TorusGeometry(0.15, 0.04, 8, 22), a, 0, 0.0, 0.01, { rx: Math.PI / 2 });
      b.add(new THREE.TorusGeometry(0.17, 0.018, 6, 22), '#eef1f4', 0, 0.04, 0.01, { rx: Math.PI / 2 });
      mirror((s) => {
        b.add(new THREE.CylinderGeometry(0.022, 0.022, 0.05, 8), '#d8dde4', s * 0.17, 0.02, 0.08, { rz: s * 1.2 });
        b.sphere(0.012, s * 0.195, 0.035, 0.08, a, 5, { slot: SLOT_GLOW });
      });
      sweep(b, [-0.2, 0.42, 0.2, 0.012, -0.12, 0.5, 0.21, 0.016, -0.03, 0.54, 0.19, 0.012], 5, '#ffffff', { slot: SLOT_GLOW });
    },
    glass: (b, c) => {
      b.add(new THREE.SphereGeometry(0.345, 24, 18), c, 0, 0.255, 0.012);
    },
  },
  hat_commander: {
    hair: 'full',
    build: (b, c, a) => {
      ellipsoid(b, 0.24, 0.088, 0.238, 0.04, 0.452, -0.012, c, 18, { rz: -0.2, rx: -0.06 });
      lathe(b, [0.203, 0.352, 0.209, 0.356, 0.208, 0.398, 0.2, 0.404], 16, 0, 0, -0.004, shade(c, 0.72));
      sweep(b, [0.05, 0.53, -0.02, 0.012, 0.055, 0.56, -0.02, 0.008], 4, shade(c, 0.85)); // tab
      // gold insignia: ring + star
      b.add(new THREE.TorusGeometry(0.036, 0.008, 5, 16), a, -0.085, 0.418, 0.19, { ry: -0.42, rx: -0.3 });
      star(b, 0.03, -0.085, 0.418, 0.19, a, { ry: -0.42, rx: -0.3 });
    },
  },
  hat_sensor_visor: {
    hair: 'full',
    build: (b, c, a) => {
      lathe(b, [0.199, 0.232, 0.206, 0.238, 0.207, 0.29, 0.2, 0.296], 16, 0, 0, -0.004, c);
      // curved dark visor across the eyes with a glowing HUD strip
      headShell(b, c, 18, Math.PI / 2 - 0.95, 1.9, 1.3, 0.5, 0, 0.03);
      headShell(b, a, 18, Math.PI / 2 - 0.8, 1.6, 1.49, 0.08, 0, 0.034, SLOT_GLOW);
      mirror((s) => {
        ellipsoid(b, 0.03, 0.05, 0.05, s * 0.208, 0.262, 0.0, shade(c, 1.25), 10);
        b.sphere(0.011, s * 0.236, 0.262, 0.02, a, 5, { slot: SLOT_GLOW });
      });
    },
  },
  hat_drone_halo: {
    hair: 'full',
    build: () => {},
    orbit: {
      count: 3,
      speed: 1.6,
      build: (b, c, a) => {
        // one drone at angle 0 of its orbit (+X); the orbit turns about +Y, so it travels toward -Z
        const R = 0.31;
        const y = 0.57;
        ellipsoid(b, 0.06, 0.03, 0.05, R, y, 0, c, 10);
        ellipsoid(b, 0.026, 0.014, 0.026, R, y - 0.026, 0, a, 6, { slot: SLOT_GLOW });
        b.sphere(0.011, R, y + 0.004, -0.05, a, 4, { slot: SLOT_GLOW }); // nose light
        mirror((s) => {
          sweep(b, [R + s * 0.04, y + 0.01, 0, 0.008, R + s * 0.075, y + 0.018, 0, 0.007], 4, shade(c, 0.8));
          b.add(new THREE.CylinderGeometry(0.03, 0.03, 0.006, 10), shade(c, 0.7), R + s * 0.078, y + 0.022, 0);
        });
        // light trail along the orbit behind it
        for (let k = 1; k <= 8; k++) {
          const ang = k * 0.11;
          b.sphere(0.017 * (1 - k / 9.5), Math.cos(ang) * R, y - 0.012, Math.sin(ang) * R, a, 5, { slot: SLOT_GLOW });
        }
      },
    },
  },
};

const hatCache = new Map<string, { main: THREE.BufferGeometry; glass: THREE.BufferGeometry | null; orbit: THREE.BufferGeometry | null }>();

/** Geometries of a hat (cached per id + colours). Unknown ids give an empty hat. */
export function hatGeometry(id: string, color: C, accent: C): { main: THREE.BufferGeometry; glass: THREE.BufferGeometry | null; orbit: THREE.BufferGeometry | null } {
  const key = `${id}|${color}|${accent}`;
  let g = hatCache.get(key);
  if (g) return g;
  const spec = HATS[id];
  const mk = (fn?: (b: GeoBuilder, c: C, a: C) => void): THREE.BufferGeometry | null => {
    if (!fn) return null;
    const b = new GeoBuilder(id.length * 17 + 3);
    fn(b, color, accent);
    return b.isEmpty ? null : b.build();
  };
  g = { main: mk(spec?.build) ?? emptyGeometry(), glass: mk(spec?.glass), orbit: mk(spec?.orbit?.build) };
  if (spec?.tilt) {
    // tip the whole hat about the head centre (its parts were built level)
    const m = new THREE.Matrix4().makeTranslation(0, HEAD_CY, 0).multiply(new THREE.Matrix4().makeRotationX(spec.tilt)).multiply(new THREE.Matrix4().makeTranslation(0, -HEAD_CY, 0));
    for (const geo of [g.main, g.glass]) if (geo) geo.applyMatrix4(m);
  }
  hatCache.set(key, g);
  return g;
}

export function hatSpec(id: string | undefined): HatSpec | undefined {
  return id ? HATS[id] : undefined;
}

export const KNOWN_HATS = Object.keys(HATS);
