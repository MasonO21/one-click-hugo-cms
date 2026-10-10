/**
 * Pets (CosmeticDef kind 'pet') that follow the player. Each pet is a body (head included) plus up to
 * two kinds of moving parts — legs, and one of tail / ears / wings / fluke / rotors — so the actor
 * draws it in at most three draw calls and animates it procedurally (see actors/Pets.ts).
 *
 * Naturalistic and elegant rather than chibi: real-animal proportions (small heads, long legs, long
 * ears and tails), soft smooth forms, colours from the cosmetic's `color` / `accent`.
 *
 * Pet space: facing +Z, ground at y = 0 for walkers; flyers are built around their centre.
 * Part geometry is built in its JOINT's space (hip / tail root / wing root), mounted at `mounts`.
 */
import * as THREE from 'three';
import { GeoBuilder, SLOT_GLOW } from '../core/GeoBuilder';
import { ellipsoid, sweep, mirror, lathe, mirrorGeometryX } from './soft';

type C = string;

export interface PetMount {
  x: number;
  y: number;
  z: number;
  /** Left-side copy of a one-sided part (wings, ears): drawn with the X-mirrored geometry. */
  flip?: boolean;
  /** Uniform scale of this copy. */
  s?: number;
  /** Gait phase offset (radians): diagonal leg pairs move together. */
  phase?: number;
  /** Hind legs fold forward when sitting; front legs stay planted. */
  hind?: boolean;
}

export type PetGait = 'walk' | 'hop' | 'hover' | 'flutter' | 'swim';
export type PetPartKind = 'tail' | 'ears' | 'wings' | 'fluke' | 'rotor';

export interface PetSpec {
  gait: PetGait;
  body: (b: GeoBuilder, c: C, a: C) => void;
  leg?: { build: (b: GeoBuilder, c: C, a: C) => void; mounts: PetMount[] };
  part?: { kind: PetPartKind; build: (b: GeoBuilder, c: C, a: C) => void; mounts: PetMount[] };
  /** Hover height above the ground (flyers). */
  fly?: number;
  /** Where it likes to be: to the player's right (+side) and behind (+back), world units. */
  side: number;
  back: number;
  /** Seconds of follow lag (bigger = lazier). */
  lag: number;
  /** Gait cycles per world unit travelled. */
  stride: number;
  /** Sitting: how far the body drops and how much the front lifts (radians). */
  sit?: { drop: number; pitch: number };
  /** Ambient glow motes (colour) the actor emits now and then. */
  motes?: { color: 'accent' | 'body'; rate: number; at: [number, number, number] };
}

const _c = new THREE.Color();
function shade(hex: C, k: number): C {
  return '#' + _c.set(hex).multiplyScalar(k).getHexString();
}
function mix(a: C, b: C, t: number): C {
  return '#' + _c.set(a).lerp(new THREE.Color(b), t).getHexString();
}

const EYE = '#1c1814';
const QUAD_LEGS = (fz: number, bz: number, x: number, y: number, hindScale = 1): PetMount[] => [
  { x: -x, y, z: fz, phase: 0 },
  { x, y, z: fz, phase: Math.PI },
  { x: -x, y, z: bz, phase: Math.PI, hind: true, s: hindScale },
  { x, y, z: bz, phase: 0, hind: true, s: hindScale },
];

export const PETS: Record<string, PetSpec> = {
  pet_robo_hound: {
    gait: 'walk',
    side: 1.0,
    back: 0.8,
    lag: 0.45,
    stride: 1.6,
    sit: { drop: 0.1, pitch: -0.42 },
    body: (b, c, a) => {
      const dark = '#3a3f47';
      // sleek chassis with a dark belly plate and a lit seam along each flank
      sweep(b, [0, 0.43, -0.27, 0.085, 0, 0.45, -0.08, 0.11, 0, 0.46, 0.1, 0.112, 0, 0.47, 0.22, 0.09], 12, c);
      ellipsoid(b, 0.085, 0.05, 0.22, 0, 0.385, -0.02, dark, 10);
      mirror((s) => sweep(b, [s * 0.102, 0.47, -0.16, 0.009, s * 0.11, 0.475, 0.04, 0.01, s * 0.098, 0.48, 0.17, 0.008], 4, a, { slot: SLOT_GLOW }));
      // neck + head with a glowing visor band, angular ear fins
      sweep(b, [0, 0.5, 0.2, 0.05, 0, 0.58, 0.29, 0.046], 8, shade(c, 0.9));
      ellipsoid(b, 0.082, 0.078, 0.105, 0, 0.635, 0.355, c, 12);
      ellipsoid(b, 0.052, 0.042, 0.08, 0, 0.605, 0.44, shade(c, 0.95), 10);
      ellipsoid(b, 0.072, 0.02, 0.03, 0, 0.655, 0.43, a, 10, { slot: SLOT_GLOW });
      ellipsoid(b, 0.016, 0.012, 0.012, 0, 0.6, 0.515, dark, 6);
      mirror((s) => b.add(new THREE.ConeGeometry(0.035, 0.11, 4), shade(c, 0.85), s * 0.05, 0.72, 0.32, { rx: -0.45, rz: -s * 0.15, sz: 0.4 }));
    },
    leg: {
      mounts: QUAD_LEGS(0.17, -0.2, 0.078, 0.42),
      build: (b, c) => {
        const dark = '#3a3f47';
        sweep(b, [0, 0.0, 0, 0.042, 0, -0.1, 0.02, 0.036, 0, -0.18, 0.03, 0.03], 7, c);
        b.sphere(0.03, 0, -0.19, 0.03, dark, 8);
        sweep(b, [0, -0.19, 0.03, 0.024, 0, -0.3, 0.0, 0.021, 0, -0.38, -0.005, 0.02], 6, shade(c, 0.9));
        ellipsoid(b, 0.032, 0.02, 0.045, 0, -0.395, 0.012, dark, 8);
      },
    },
    part: {
      kind: 'tail',
      mounts: [{ x: 0, y: 0.47, z: -0.31 }],
      build: (b, c, a) => {
        sweep(b, [0, 0, 0, 0.022, 0, 0.08, -0.09, 0.018, 0, 0.17, -0.14, 0.012], 6, shade(c, 0.85));
        b.sphere(0.018, 0, 0.175, -0.145, a, 6, { slot: SLOT_GLOW });
      },
    },
  },

  pet_survey_drone: {
    gait: 'hover',
    fly: 1.55,
    side: 0.85,
    back: 0.35,
    lag: 0.35,
    stride: 0,
    body: (b, c, a) => {
      const dark = '#2f343c';
      ellipsoid(b, 0.14, 0.095, 0.16, 0, 0, 0, c, 14);
      ellipsoid(b, 0.1, 0.05, 0.11, 0, 0.07, -0.02, shade(c, 0.82), 12); // top hatch
      // sensor lens: dark bezel, glowing eye
      b.add(new THREE.TorusGeometry(0.05, 0.014, 6, 14), dark, 0, -0.005, 0.15);
      ellipsoid(b, 0.042, 0.042, 0.02, 0, -0.005, 0.153, a, 10, { slot: SLOT_GLOW });
      // under-slung scanner and an antenna
      ellipsoid(b, 0.05, 0.03, 0.07, 0, -0.1, 0.02, dark, 8);
      b.sphere(0.014, 0, -0.125, 0.06, a, 5, { slot: SLOT_GLOW });
      sweep(b, [0.05, 0.08, -0.08, 0.006, 0.07, 0.2, -0.12, 0.004], 4, dark);
      b.sphere(0.012, 0.07, 0.205, -0.12, '#ff9a4a', 5, { slot: SLOT_GLOW });
      // rotor arms
      mirror((s) => sweep(b, [s * 0.11, 0.0, 0, 0.018, s * 0.2, 0.02, 0, 0.016], 6, dark));
    },
    part: {
      kind: 'rotor',
      mounts: [{ x: -0.215, y: 0.035, z: 0 }, { x: 0.215, y: 0.035, z: 0 }],
      build: (b) => {
        const dark = '#2f343c';
        lathe(b, [0.06, -0.02, 0.064, 0.0, 0.064, 0.03, 0.058, 0.04], 12, 0, 0, 0, dark); // shroud
        b.cyl(0.012, 0.012, 0.05, 0, 0.0, 0, '#8a929c', 6);
        mirror((s) => ellipsoid(b, 0.055, 0.004, 0.012, s * 0.03, 0.02, 0, '#c8ccd2', 6));
      },
    },
  },

  pet_ships_cat: {
    gait: 'walk',
    side: 0.85,
    back: 0.9,
    lag: 0.55,
    stride: 2.4,
    sit: { drop: 0.05, pitch: -0.62 },
    body: (b, c, a) => {
      const stripe = shade(c, 0.66);
      const cream = '#ecdcc4';
      sweep(b, [0, 0.21, -0.17, 0.078, 0, 0.225, -0.02, 0.09, 0, 0.235, 0.11, 0.084], 12, c);
      ellipsoid(b, 0.06, 0.05, 0.08, 0, 0.19, 0.08, cream, 10); // chest
      for (let i = 0; i < 4; i++) ellipsoid(b, 0.083, 0.02, 0.022, 0, 0.29 - Math.abs(i - 1.5) * 0.004, -0.13 + i * 0.075, stripe, 10, { rx: 0.2 }); // tabby bands
      // head: ears, muzzle, amber eyes
      ellipsoid(b, 0.078, 0.07, 0.074, 0, 0.32, 0.19, c, 12);
      ellipsoid(b, 0.042, 0.03, 0.035, 0, 0.3, 0.25, cream, 8);
      ellipsoid(b, 0.012, 0.008, 0.008, 0, 0.315, 0.282, '#a8645a', 5);
      mirror((s) => {
        b.add(new THREE.ConeGeometry(0.032, 0.07, 6), c, s * 0.048, 0.39, 0.18, { rz: -s * 0.25, sz: 0.55 });
        ellipsoid(b, 0.016, 0.012, 0.008, s * 0.033, 0.335, 0.252, '#c8a032', 6, { ry: s * 0.4 });
        ellipsoid(b, 0.005, 0.01, 0.004, s * 0.034, 0.335, 0.26, EYE, 4, { ry: s * 0.4 });
        ellipsoid(b, 0.01, 0.032, 0.016, s * 0.052, 0.335, 0.165, stripe, 5); // cheek stripes
      });
      // harness: chest strap, back strap, a brass ring
      b.add(new THREE.TorusGeometry(0.088, 0.012, 5, 16), a, 0, 0.225, 0.07, { sy: 1.05 });
      sweep(b, [0, 0.31, 0.07, 0.012, 0, 0.32, -0.04, 0.012], 5, a);
      b.add(new THREE.TorusGeometry(0.014, 0.004, 4, 8), '#c9a24e', 0, 0.326, -0.04, { rx: Math.PI / 2 });
    },
    leg: {
      mounts: QUAD_LEGS(0.11, -0.13, 0.048, 0.2),
      build: (b, c) => {
        sweep(b, [0, 0.0, 0, 0.036, 0, -0.1, 0.008, 0.028, 0, -0.18, 0.0, 0.024], 7, c);
        ellipsoid(b, 0.028, 0.018, 0.034, 0, -0.188, 0.012, '#ecdcc4', 8);
      },
    },
    part: {
      kind: 'tail',
      mounts: [{ x: 0, y: 0.235, z: -0.2 }],
      build: (b, c) => {
        sweep(b, [0, 0, 0, 0.024, 0, 0.06, -0.07, 0.022, 0, 0.17, -0.1, 0.02, 0, 0.27, -0.06, 0.018], 8, c);
        for (let k = 1; k <= 3; k++) {
          const u = k / 4;
          b.add(new THREE.TorusGeometry(0.021, 0.006, 4, 10), shade(c, 0.66), 0, 0.06 + u * 0.2, -0.07 - Math.sin(u * 3) * 0.02, { rx: Math.PI / 2 - 0.4 });
        }
      },
    },
  },

  pet_lunar_hare: {
    gait: 'hop',
    side: 1.0,
    back: 0.6,
    lag: 0.4,
    stride: 1.2,
    sit: { drop: 0.02, pitch: -0.2 },
    body: (b, c, a) => {
      const pale = mix(c, '#ffffff', 0.45);
      sweep(b, [0, 0.19, -0.13, 0.095, 0, 0.21, 0.0, 0.105, 0, 0.25, 0.1, 0.078], 12, c);
      ellipsoid(b, 0.07, 0.06, 0.07, 0, 0.17, 0.06, pale, 10); // chest
      ellipsoid(b, 0.04, 0.04, 0.035, 0, 0.23, -0.225, '#f4f6fa', 8); // tail puff
      ellipsoid(b, 0.068, 0.066, 0.085, 0, 0.33, 0.16, c, 12); // head
      ellipsoid(b, 0.038, 0.032, 0.04, 0, 0.31, 0.225, pale, 8); // muzzle
      ellipsoid(b, 0.01, 0.008, 0.008, 0, 0.32, 0.262, '#9a7a8a', 5);
      mirror((s) => {
        ellipsoid(b, 0.016, 0.02, 0.012, s * 0.05, 0.345, 0.21, EYE, 8, { ry: s * 0.6 });
        b.sphere(0.004, s * 0.056, 0.352, 0.218, '#ffffff', 4);
      });
      // a faint crescent marking on the brow (an alien native)
      b.add(new THREE.TorusGeometry(0.02, 0.004, 4, 10, Math.PI), a, 0, 0.375, 0.215, { rx: -0.4, rz: Math.PI });
    },
    leg: {
      mounts: [
        { x: -0.045, y: 0.2, z: 0.08, phase: 0 },
        { x: 0.045, y: 0.2, z: 0.08, phase: 0 },
        { x: -0.07, y: 0.21, z: -0.1, phase: Math.PI, hind: true, s: 1.12 },
        { x: 0.07, y: 0.21, z: -0.1, phase: Math.PI, hind: true, s: 1.12 },
      ],
      build: (b, c) => {
        sweep(b, [0, 0.0, 0, 0.034, 0, -0.1, 0.012, 0.026, 0, -0.175, 0.006, 0.02], 7, c);
        ellipsoid(b, 0.024, 0.016, 0.042, 0, -0.18, 0.026, shade(c, 1.05), 8);
      },
    },
    part: {
      kind: 'ears',
      mounts: [{ x: -0.032, y: 0.385, z: 0.14, flip: true }, { x: 0.032, y: 0.385, z: 0.14 }],
      build: (b, c, a) => {
        // long upright ear, slightly cupped, with a lavender lining
        sweep(b, [0, 0, 0, 0.018, 0.01, 0.1, -0.015, 0.03, 0.02, 0.2, -0.035, 0.028, 0.028, 0.28, -0.05, 0.015, 0.03, 0.31, -0.055, 0.0], 8, c, { sz: 0.55 });
        sweep(b, [0.004, 0.05, 0.008, 0.012, 0.012, 0.13, 0.0, 0.02, 0.022, 0.24, -0.025, 0.012], 6, a, { sz: 0.35 });
      },
    },
  },

  pet_ember_fox: {
    gait: 'walk',
    side: 1.05,
    back: 0.95,
    lag: 0.5,
    stride: 2.0,
    sit: { drop: 0.07, pitch: -0.55 },
    motes: { color: 'accent', rate: 2.2, at: [0, 0.42, -0.65] },
    body: (b, c, a) => {
      const white = '#efe6da';
      const sock = '#3a2620';
      sweep(b, [0, 0.25, -0.2, 0.08, 0, 0.27, -0.02, 0.092, 0, 0.28, 0.13, 0.082], 12, c);
      ellipsoid(b, 0.06, 0.07, 0.07, 0, 0.24, 0.13, white, 10); // chest bib
      // head: long snout, tall dark-tipped ears, amber eyes
      ellipsoid(b, 0.076, 0.07, 0.08, 0, 0.37, 0.22, c, 12);
      sweep(b, [0, 0.36, 0.26, 0.05, 0, 0.35, 0.32, 0.032, 0, 0.345, 0.37, 0.012], 8, c);
      ellipsoid(b, 0.04, 0.025, 0.05, 0, 0.335, 0.31, white, 8);
      b.sphere(0.013, 0, 0.35, 0.378, sock, 6);
      mirror((s) => {
        b.add(new THREE.ConeGeometry(0.036, 0.1, 6), c, s * 0.046, 0.46, 0.2, { rz: -s * 0.18, rx: -0.1, sz: 0.5 });
        b.add(new THREE.ConeGeometry(0.018, 0.04, 6), sock, s * 0.054, 0.5, 0.2, { rz: -s * 0.18, rx: -0.1, sz: 0.5 });
        ellipsoid(b, 0.015, 0.009, 0.008, s * 0.035, 0.385, 0.282, '#f0a830', 6, { ry: s * 0.45 });
        ellipsoid(b, 0.005, 0.008, 0.004, s * 0.036, 0.385, 0.29, EYE, 4, { ry: s * 0.45 });
      });
      b.sphere(0.01, 0, 0.27, 0.0, a, 4, { slot: SLOT_GLOW });
    },
    leg: {
      mounts: QUAD_LEGS(0.12, -0.14, 0.052, 0.25),
      build: (b, c) => {
        sweep(b, [0, 0.0, 0, 0.036, 0, -0.1, 0.01, 0.028, 0, -0.16, 0.004, 0.024], 7, c);
        sweep(b, [0, -0.15, 0.004, 0.025, 0, -0.225, 0.002, 0.022], 6, '#3a2620');
        ellipsoid(b, 0.026, 0.016, 0.034, 0, -0.235, 0.014, '#3a2620', 8);
      },
    },
    part: {
      kind: 'tail',
      mounts: [{ x: 0, y: 0.27, z: -0.24 }],
      build: (b, c, a) => {
        // big brush, warming to embers at the tip
        sweep(b, [0, 0, 0, 0.035, 0, -0.04, -0.1, 0.07, 0, -0.03, -0.22, 0.085, 0, 0.0, -0.33, 0.075], 10, c);
        sweep(b, [0, 0.0, -0.33, 0.075, 0, 0.04, -0.42, 0.055, 0, 0.08, -0.47, 0.0], 10, mix(c, a, 0.6));
        ellipsoid(b, 0.04, 0.04, 0.05, 0, 0.065, -0.45, a, 8, { slot: SLOT_GLOW });
      },
    },
  },

  pet_lumen_moth: {
    gait: 'flutter',
    fly: 1.75,
    side: 1.0,
    back: 0.15,
    lag: 0.6,
    stride: 0,
    motes: { color: 'accent', rate: 1.6, at: [0, 0, 0] },
    body: (b, c, a) => {
      const fur = mix(c, '#ffffff', 0.5);
      ellipsoid(b, 0.055, 0.055, 0.065, 0, 0, 0.0, c, 12); // thorax
      ellipsoid(b, 0.07, 0.06, 0.04, 0, 0.0, 0.05, fur, 10); // fur collar
      sweep(b, [0, -0.005, -0.05, 0.05, 0, -0.02, -0.13, 0.045, 0, -0.035, -0.2, 0.025, 0, -0.04, -0.235, 0.0], 10, shade(c, 0.85)); // abdomen
      for (let k = 0; k < 3; k++) b.add(new THREE.TorusGeometry(0.045 - k * 0.008, 0.006, 4, 12), shade(c, 0.7), 0, -0.012 - k * 0.008, -0.09 - k * 0.045);
      ellipsoid(b, 0.04, 0.038, 0.035, 0, 0.005, 0.095, c, 10); // head
      mirror((s) => {
        b.sphere(0.018, s * 0.028, 0.012, 0.115, EYE, 6);
        // feathered antennae
        sweep(b, [s * 0.016, 0.03, 0.11, 0.006, s * 0.05, 0.11, 0.16, 0.005, s * 0.09, 0.16, 0.15, 0.003], 4, shade(c, 0.75));
        ellipsoid(b, 0.014, 0.03, 0.006, s * 0.075, 0.14, 0.157, fur, 6, { rz: s * 0.8 });
      });
    },
    part: {
      kind: 'wings',
      mounts: [{ x: -0.04, y: 0.012, z: 0.0, flip: true }, { x: 0.04, y: 0.012, z: 0.0 }],
      build: (b, c, a) => {
        const edge = mix(c, '#ffffff', 0.35);
        // fore and hind wing lobes (thin, soft-edged), glowing eyespots
        ellipsoid(b, 0.22, 0.008, 0.12, 0.2, 0, 0.05, c, 14, { ry: -0.35 });
        // the soft glow: a pale luminous rim around each wing, brighter eyespots
        ellipsoid(b, 0.232, 0.005, 0.132, 0.205, -0.002, 0.052, a, 14, { ry: -0.35, slot: SLOT_GLOW });
        ellipsoid(b, 0.156, 0.005, 0.106, 0.132, -0.006, -0.09, a, 12, { ry: 0.45, slot: SLOT_GLOW });
        ellipsoid(b, 0.12, 0.009, 0.06, 0.16, 0.002, 0.03, edge, 10, { ry: -0.35 });
        ellipsoid(b, 0.15, 0.008, 0.1, 0.13, -0.004, -0.09, c, 12, { ry: 0.45 });
        ellipsoid(b, 0.055, 0.012, 0.042, 0.24, 0.006, 0.08, a, 10, { ry: -0.35, slot: SLOT_GLOW });
        ellipsoid(b, 0.035, 0.012, 0.028, 0.15, 0.006, -0.1, a, 8, { ry: 0.45, slot: SLOT_GLOW });
        ellipsoid(b, 0.014, 0.014, 0.012, 0.24, 0.012, 0.08, shade(c, 0.5), 6, { ry: -0.35 });
      },
    },
  },

  pet_sky_whale: {
    gait: 'swim',
    fly: 3.3,
    side: 1.4,
    back: 2.0,
    lag: 1.3,
    stride: 0,
    body: (b, c, a) => {
      // long tapering body, pale ventral pleats, small eyes, pectoral fins, a few star freckles
      sweep(b, [0, 0.02, -0.66, 0.05, 0, 0.04, -0.45, 0.15, 0, 0.05, -0.12, 0.26, 0, 0.04, 0.22, 0.28, 0, 0.0, 0.48, 0.23, 0, -0.04, 0.64, 0.13, 0, -0.05, 0.71, 0.0], 16, c);
      ellipsoid(b, 0.2, 0.12, 0.42, 0, -0.1, 0.18, a, 14);
      for (let k = -2; k <= 2; k++) sweep(b, [k * 0.05, -0.2, -0.05, 0.008, k * 0.06, -0.215, 0.18, 0.009, k * 0.05, -0.19, 0.42, 0.007], 4, shade(a, 0.86));
      mirror((s) => {
        b.sphere(0.022, s * 0.2, 0.0, 0.45, '#1c2230', 8);
        b.sphere(0.006, s * 0.212, 0.008, 0.465, '#ffffff', 4);
        ellipsoid(b, 0.2, 0.018, 0.075, s * 0.3, -0.1, 0.24, shade(c, 0.9), 10, { rz: -s * 0.45, ry: s * 0.45 });
      });
      for (let i = 0; i < 9; i++) {
        const z = -0.4 + i * 0.1;
        const x = Math.sin(i * 2.3) * 0.1;
        b.sphere(0.012, x, 0.24 - Math.abs(z) * 0.18, z, '#f4f0d8', 4, { slot: SLOT_GLOW });
      }
    },
    part: {
      kind: 'fluke',
      mounts: [{ x: 0, y: 0.02, z: -0.64 }],
      build: (b, c) => {
        sweep(b, [0, 0, 0.04, 0.04, 0, 0, -0.06, 0.03], 8, c);
        mirror((s) => ellipsoid(b, 0.17, 0.016, 0.07, s * 0.13, 0, -0.1, shade(c, 0.95), 10, { ry: s * 0.5 }));
      },
    },
  },
};

export interface PetGeo {
  body: THREE.BufferGeometry;
  leg: THREE.BufferGeometry | null;
  part: THREE.BufferGeometry | null;
  /** The part mirrored across X, for `flip` mounts (left wing, left ear). */
  partL: THREE.BufferGeometry | null;
}

const cache = new Map<string, PetGeo>();

/** Geometries of a pet (cached per id + colours), or null for an unknown id. */
export function petGeometry(id: string, color: C, accent: C): PetGeo | null {
  const spec = PETS[id];
  if (!spec) return null;
  const key = `${id}|${color}|${accent}`;
  let g = cache.get(key);
  if (g) return g;
  const mk = (fn?: (b: GeoBuilder, c: C, a: C) => void): THREE.BufferGeometry | null => {
    if (!fn) return null;
    const b = new GeoBuilder(id.length * 19 + 5);
    fn(b, color, accent);
    return b.isEmpty ? null : b.build();
  };
  const part = mk(spec.part?.build);
  const flips = !!spec.part?.mounts.some((mt) => mt.flip);
  g = { body: mk(spec.body)!, leg: mk(spec.leg?.build), part, partL: part && flips ? mirrorGeometryX(part) : null };
  cache.set(key, g);
  return g;
}

export const KNOWN_PETS = Object.keys(PETS);
