/**
 * Alien models (AlienDef.model). Each model has a `body` geometry built in white / greys so the
 * instance colour (AlienDef.color) tints it — lighter bellies and sacs, darker spikes, spots and plates
 * are vertex shades of that one tint — and a `detail` geometry in fixed colours (eyes, claws, teeth,
 * drool, glowing spots, dirt). Ground at y = 0, facing +Z, unit scale ~ a crawler.
 *
 * Look: rounded, organic creatures after the painted portraits (public/art/aliens) — mischievous
 * rather than menacing: smooth bodies, sly half-lidded eyes, little fangs, no baby faces. Every type
 * keeps its own silhouette (round spider, toad with a throat sac, knuckle-walking rock brute, drill
 * worm in its mound, manta flyer, crowned insect queen, glowing rock titan); bosses (`boss`) get
 * extra regalia on top: a bolt necklace, a grander crown, a crystal crown.
 */
import * as THREE from 'three';
import { GeoBuilder, SLOT_GLOW } from '../core/GeoBuilder';
import { ellipsoid as ellipsoidHi, sweep as sweepHi, mirror, shell, gradeY } from './soft';
import type { PrimOpts } from '../core/GeoBuilder';

/**
 * Raids field dozens of aliens at once: the soft-shape kit is used at about three quarters of its
 * usual segment counts here (smooth normals keep the silhouettes round at game zoom). The far LOD
 * (`alienGeometry(…, lod 1)`, drawn for aliens a raid camera sees from afar, a few dozen pixels tall)
 * builds the same shapes at fewer segments: the same silhouette and colours at about half the triangles.
 */
const SEG = [
  { ellipsoid: 0.72, minE: 6, sweep: 0.75, minS: 4, shell: 1, sphere: 1, torus: 1 },
  { ellipsoid: 0.46, minE: 5, sweep: 0.5, minS: 3, shell: 0.67, sphere: 0.7, torus: 0.6 },
];
/** Segment factors of the LOD being built (set by alienGeometry around a build). */
let kit = SEG[0];
function ellipsoid(b: GeoBuilder, rx: number, ry: number, rz: number, x: number, y: number, z: number, color: string, segs = 10, opts: PrimOpts = {}): GeoBuilder {
  return ellipsoidHi(b, rx, ry, rz, x, y, z, color, Math.max(kit.minE, Math.round(segs * kit.ellipsoid)), opts);
}
function sweep(b: GeoBuilder, pts: readonly number[], radial: number, color: string, opts?: PrimOpts): GeoBuilder {
  return sweepHi(b, pts, Math.max(kit.minS, Math.round(radial * kit.sweep)), color, opts, 1);
}
/** Ring segments (body bands, collars) at the LOD's segment counts. */
function torus(r: number, tube: number, radial: number, tubular: number): THREE.TorusGeometry {
  return new THREE.TorusGeometry(r, tube, Math.max(3, Math.round(radial * kit.torus)), Math.max(8, Math.round(tubular * kit.torus)));
}
/** Small spheres (eye glints, glowing spots) at the LOD's segment count. */
function dot(d: GeoBuilder, r: number, x: number, y: number, z: number, color: string, segs: number, opts?: PrimOpts): void {
  d.sphere(r, x, y, z, color, Math.max(4, Math.round(segs * kit.sphere)), opts);
}

const W = '#ffffff';
/** Body shades (multiplied by the alien's tint). */
const LIGHT = '#fff4ee';
const MID = '#c9c9c9';
const DARK = '#9a9a9a';
const DEEP = '#747474';
const EYE_DARK = '#16181c';
const TOOTH = '#f6efe2';
const CLAW = '#2e2a26';

export interface AlienGeo {
  body: THREE.BufferGeometry;
  detail: THREE.BufferGeometry;
  /** Approximate height at scale 1 (hit flash position, picking). */
  height: number;
}

/**
 * A sly eye: dark glossy ball with two catch-lights (detail) under a lid tilted toward the nose
 * (body), so the creature looks mischievous rather than wide-eyed. `side` = -1 left, +1 right.
 */
function slyEye(b: GeoBuilder, d: GeoBuilder, x: number, y: number, z: number, r: number, side: number, opts: { iris?: string; lid?: number; look?: number } = {}): void {
  const iris = opts.iris;
  if (iris) {
    ellipsoid(d, r, r * 1.05, r * 0.8, x, y, z, iris, 12);
    ellipsoid(d, r * 0.32, r * 0.75, r * 0.3, x, y, z + r * 0.62, EYE_DARK, 8);
  } else ellipsoid(d, r, r * 1.08, r * 0.82, x, y, z, EYE_DARK, 12);
  dot(d, r * 0.24, x - side * r * 0.3, y + r * 0.38, z + r * 0.62, '#ffffff', 6);
  dot(d, r * 0.1, x + side * r * 0.25, y - r * 0.3, z + r * 0.7, '#ffffff', 4);
  // upper lid: a shell over the top of the eye, tipped toward the middle
  const lid = opts.lid ?? 1.15;
  shell(b, r * 1.12, x, y, z, MID, Math.max(6, Math.round(9 * kit.shell)), 0, Math.PI * 2, 0, lid, { rz: side * 0.3, rx: -0.15 + (opts.look ?? 0) });
}

/** Tapered spike (a smooth horn) from (x,y,z) along (dx,dy,dz) with base radius r. */
function spike(b: GeoBuilder, x: number, y: number, z: number, dx: number, dy: number, dz: number, r: number, color: string, seg = 6): void {
  sweep(b, [x, y, z, r, x + dx * 0.55, y + dy * 0.55, z + dz * 0.55, r * 0.6, x + dx, y + dy, z + dz, 0], seg, color);
}

const MODELS: Record<string, { build: (b: GeoBuilder, d: GeoBuilder, boss: boolean) => void; height: number }> = {
  // round, big-eyed spider-crab on six jointed legs, spiky back, two little fangs
  crawler: {
    height: 0.95,
    build: (b, d) => {
      ellipsoid(b, 0.5, 0.4, 0.52, 0, 0.56, -0.04, W, 16);
      ellipsoid(b, 0.42, 0.24, 0.44, 0, 0.42, 0.02, LIGHT, 14); // pale belly
      for (let i = 0; i < 5; i++) {
        const a = (i - 2) * 0.42;
        spike(b, Math.sin(a) * 0.22, 0.86 - Math.abs(i - 2) * 0.04, -0.18 + Math.cos(a) * 0.05, Math.sin(a) * 0.12, 0.26, -0.16, 0.075, DARK);
      }
      for (let i = 0; i < 3; i++) {
        const z = 0.22 - i * 0.26;
        mirror((s) => {
          const fz = z * 1.4 + (i - 1) * 0.04;
          sweep(b, [s * 0.36, 0.5, z, 0.075, s * 0.62, 0.74, z * 1.2, 0.06, s * 0.8, 0.5, fz, 0.045, s * 0.86, 0.12, fz + 0.02, 0.03], 7, MID);
          sweep(d, [s * 0.86, 0.14, fz + 0.02, 0.03, s * 0.87, 0.0, fz + 0.03, 0.0], 5, CLAW);
        });
      }
      mirror((s) => slyEye(b, d, s * 0.17, 0.66, 0.4, 0.13, s));
      mirror((s) => sweep(d, [s * 0.08, 0.42, 0.47, 0.028, s * 0.085, 0.33, 0.49, 0.016, s * 0.07, 0.27, 0.46, 0.0], 5, TOOTH));
      sweep(d, [-0.09, 0.455, 0.485, 0.008, -0.02, 0.432, 0.505, 0.011, 0.06, 0.44, 0.5, 0.01, 0.11, 0.475, 0.47, 0.007], 5, '#2a1a1a'); // lopsided smirk
    },
  },

  // plump toad with a glowing throat sac, sly yellow eyes, spotted back, drool
  spitter: {
    height: 1.45,
    build: (b, d) => {
      ellipsoid(b, 0.55, 0.48, 0.66, 0, 0.66, -0.12, MID, 16);
      ellipsoid(b, 0.44, 0.33, 0.38, 0, 0.96, 0.36, MID, 16); // head
      ellipsoid(b, 0.4, 0.34, 0.32, 0, 0.6, 0.48, W, 16); // throat sac
      sweep(b, [-0.36, 0.86, 0.5, 0.045, -0.2, 0.8, 0.68, 0.055, 0, 0.79, 0.73, 0.06, 0.2, 0.8, 0.68, 0.055, 0.36, 0.86, 0.5, 0.045], 8, LIGHT); // pouty lip
      for (let i = 0; i < 9; i++) {
        const a = i * 2.39;
        const r = 0.15 + (i % 3) * 0.12;
        ellipsoid(b, 0.08, 0.03, 0.07, Math.cos(a) * r, 1.06 - r * 0.25, -0.25 + Math.sin(a) * r * 1.2, DEEP, 8, { rz: Math.cos(a) * 0.5 });
      }
      for (let i = 0; i < 5; i++) spike(b, 0, 1.12 - i * 0.07, 0.12 - i * 0.2, 0, 0.2, -0.1, 0.07, DARK);
      // stubby legs: front, then thick haunches
      mirror((s) => {
        sweep(b, [s * 0.32, 0.6, 0.25, 0.13, s * 0.4, 0.3, 0.32, 0.1, s * 0.42, 0.08, 0.36, 0.09], 8, MID);
        ellipsoid(b, 0.13, 0.06, 0.16, s * 0.43, 0.05, 0.42, MID, 10);
        ellipsoid(b, 0.24, 0.3, 0.32, s * 0.42, 0.45, -0.42, MID, 12);
        ellipsoid(b, 0.15, 0.07, 0.2, s * 0.5, 0.06, -0.22, MID, 10);
        for (let k = -1; k <= 1; k++) dot(d, 0.03, s * 0.43 + k * 0.06, 0.04, 0.57, CLAW, 4);
        slyEye(b, d, s * 0.21, 1.2, 0.36, 0.13, s, { iris: '#f2cf4a' });
      });
      // drool from the lip
      sweep(d, [0.1, 0.78, 0.71, 0.03, 0.12, 0.62, 0.72, 0.022, 0.13, 0.48, 0.7, 0.012], 6, '#a8f04a', { slot: SLOT_GLOW });
      dot(d, 0.04, 0.13, 0.45, 0.7, '#a8f04a', 6, { slot: SLOT_GLOW });
      dot(d, 0.025, -0.14, 0.72, 0.7, '#a8f04a', 5, { slot: SLOT_GLOW });
    },
  },

  // knuckle-walking rock brute: rounded orange plates over a darker hide, small grumpy face
  brute: {
    height: 2.1,
    build: (b, d, boss) => {
      ellipsoid(b, 0.62, 0.66, 0.52, 0, 1.2, -0.05, DEEP, 14); // hide
      ellipsoid(b, 0.52, 0.5, 0.3, 0, 1.28, 0.24, W, 14, { rx: -0.2 }); // chest plate
      ellipsoid(b, 0.5, 0.42, 0.34, 0, 1.55, -0.32, W, 12, { rx: 0.4 }); // back plate
      ellipsoid(b, 0.44, 0.28, 0.36, 0, 0.82, 0.05, MID, 12); // belly
      mirror((s) => {
        // arms: shoulder boulder, long arm, big rounded fist on the ground
        ellipsoid(b, 0.34, 0.3, 0.34, s * 0.6, 1.62, 0.06, W, 12, { rz: -s * 0.3 });
        sweep(b, [s * 0.62, 1.5, 0.1, 0.2, s * 0.86, 1.0, 0.24, 0.19, s * 0.84, 0.45, 0.36, 0.17], 10, DEEP);
        ellipsoid(b, 0.2, 0.26, 0.2, s * 0.86, 0.85, 0.3, W, 10, { rz: s * 0.1 }); // forearm plate
        ellipsoid(b, 0.27, 0.23, 0.28, s * 0.84, 0.24, 0.42, MID, 12);
        for (let k = -1; k <= 1; k++) ellipsoid(b, 0.07, 0.06, 0.06, s * 0.84 + k * 0.1, 0.36, 0.66, W, 6);
        // short thick legs
        sweep(b, [s * 0.3, 0.8, -0.2, 0.2, s * 0.36, 0.45, -0.12, 0.19, s * 0.38, 0.16, -0.08, 0.17], 10, DEEP);
        ellipsoid(b, 0.2, 0.1, 0.26, s * 0.38, 0.08, 0.0, MID, 10);
        ellipsoid(b, 0.18, 0.16, 0.12, s * 0.36, 0.5, -0.02, W, 8); // knee plate
        // little eyes under a heavy brow
        slyEye(b, d, s * 0.12, 1.68, 0.64, 0.065, s, { iris: '#ffcf5a', lid: 1.3 });
      });
      // head: low between the shoulders, heavy brow, jutting jaw, two little tusks
      ellipsoid(b, 0.3, 0.26, 0.28, 0, 1.62, 0.44, MID, 14);
      ellipsoid(b, 0.33, 0.1, 0.18, 0, 1.79, 0.56, W, 12, { rx: 0.25 }); // brow
      ellipsoid(b, 0.24, 0.13, 0.2, 0, 1.47, 0.6, MID, 12); // jaw
      mirror((s) => spike(d, s * 0.12, 1.53, 0.74, s * 0.02, 0.15, 0.02, 0.035, TOOTH));
      for (let i = 0; i < 3; i++) ellipsoid(b, 0.1 - i * 0.015, 0.06, 0.14, 0, 1.86 - i * 0.07, 0.3 - i * 0.22, W, 8, { rx: -0.5 }); // crest
      if (boss) {
        // a necklace of old turret bolts and a mossy fringe
        for (let i = 0; i < 9; i++) {
          const a = -1.2 + (i / 8) * 2.4;
          const x = Math.sin(a) * 0.42;
          const z = 0.3 + Math.cos(a) * 0.22;
          d.cyl(0.055, 0.055, 0.05, x, 1.46 - Math.cos(a) * 0.08, z, '#8a929c', 6, { rx: Math.PI / 2 - 0.3, ry: a });
          dot(d, 0.022, x, 1.46 - Math.cos(a) * 0.08, z + 0.03, '#c9a24e', 4);
        }
        sweep(d, [-0.4, 1.56, 0.2, 0.02, 0, 1.4, 0.48, 0.022, 0.4, 1.56, 0.2, 0.02], 5, '#4a3a2e');
        for (let i = 0; i < 6; i++) ellipsoid(d, 0.09, 0.05, 0.08, (i - 2.5) * 0.14, 2.0 - Math.abs(i - 2.5) * 0.04, -0.1, '#6a8a4a', 6);
      }
    },
  },

  // segmented drill-worm rising out of its dirt mound, little claws, curious eyes
  burrower: {
    height: 1.55,
    build: (b, d) => {
      // mound + pebbles (fixed earth colours)
      ellipsoid(d, 0.78, 0.24, 0.78, 0, 0.04, 0, '#6e5a44', 14);
      for (let i = 0; i < 9; i++) {
        const a = i * 0.7 + 0.3;
        const r = 0.55 + (i % 3) * 0.12;
        ellipsoid(d, 0.09, 0.06, 0.08, Math.cos(a) * r, 0.1, Math.sin(a) * r, i % 2 ? '#8a7a68' : '#5a4a3a', 6);
      }
      // body segments curving up and forward
      const seg: [number, number, number, number][] = [
        [0, 0.24, 0, 0.44],
        [0, 0.58, 0.04, 0.41],
        [0, 0.9, 0.11, 0.37],
        [0, 1.17, 0.22, 0.33],
      ];
      seg.forEach(([x, y, z, r], i) => ellipsoid(b, r, r * 0.82, r, x, y, z, i % 2 ? MID : W, 14, { rx: -0.15 * i }));
      for (let i = 0; i < 3; i++) {
        const [, y0, z0, r0] = seg[i];
        const [, y1, z1] = seg[i + 1];
        b.add(torus(r0 * 0.86, 0.035, 6, 16), DARK, 0, (y0 + y1) / 2, (z0 + z1) / 2, { rx: Math.PI / 2 - 0.15 * (i + 0.5) });
      }
      // ribbed drill nose
      const n0 = [0, 1.3, 0.38];
      const dir = [0, 0.22, 0.95];
      sweep(b, [n0[0], n0[1], n0[2], 0.27, n0[0] + dir[0] * 0.25, n0[1] + dir[1] * 0.25, n0[2] + dir[2] * 0.25, 0.2, n0[0] + dir[0] * 0.5, n0[1] + dir[1] * 0.5, n0[2] + dir[2] * 0.5, 0.1, n0[0] + dir[0] * 0.66, n0[1] + dir[1] * 0.66, n0[2] + dir[2] * 0.66, 0], 12, LIGHT);
      for (let k = 1; k <= 3; k++) {
        const u = k * 0.14;
        b.add(torus(0.27 - u * 0.55, 0.022, 5, 14), MID, 0, n0[1] + dir[1] * u, n0[2] + dir[2] * u, { rx: Math.PI / 2 - 0.22 });
      }
      mirror((s) => {
        slyEye(b, d, s * 0.19, 1.34, 0.42, 0.085, s, { lid: 1.0 });
        // little digging claws
        sweep(b, [s * 0.3, 0.86, 0.36, 0.06, s * 0.38, 0.72, 0.52, 0.05], 6, MID);
        for (let k = -1; k <= 1; k++) spike(d, s * (0.38 + k * 0.04), 0.7, 0.54, s * 0.02, -0.1, 0.1, 0.022, TOOTH, 4);
      });
    },
  },

  // manta-like flyer: broad soft wings with glowing veins, trailing tentacles, big sly eyes
  flyer: {
    height: 1.6,
    build: (b, d) => {
      ellipsoid(b, 0.38, 0.17, 0.5, 0, 1.2, 0, W, 16);
      ellipsoid(b, 0.28, 0.18, 0.24, 0, 1.25, 0.38, W, 14); // head
      ellipsoid(b, 0.3, 0.1, 0.4, 0, 1.1, 0.05, LIGHT, 12); // belly
      mirror((s) => {
        ellipsoid(b, 0.86, 0.045, 0.42, s * 0.72, 1.24, -0.06, W, 18, { rz: s * 0.14, ry: s * 0.18 });
        ellipsoid(b, 0.3, 0.04, 0.2, s * 1.42, 1.38, -0.2, MID, 12, { rz: s * 0.5, ry: s * 0.4 }); // curled tips
        for (let k = 0; k < 4; k++) {
          const u = 0.3 + k * 0.28;
          dot(d, 0.04 - k * 0.004, s * u, 1.28 + u * 0.11, 0.05 - u * 0.1, '#bff6ff', 5, { slot: SLOT_GLOW });
          dot(d, 0.03, s * (u + 0.1), 1.27 + u * 0.11, -0.18 - u * 0.05, '#bff6ff', 4, { slot: SLOT_GLOW });
        }
        slyEye(b, d, s * 0.14, 1.31, 0.52, 0.085, s);
      });
      for (let i = 0; i < 4; i++) {
        const x = (i - 1.5) * 0.11;
        sweep(b, [x, 1.1, -0.22, 0.05, x * 1.3, 0.85, -0.42, 0.04, x * 1.1, 0.55, -0.48, 0.028, x * 0.8, 0.32, -0.42, 0.0], 6, MID);
      }
      sweep(b, [0, 1.2, -0.45, 0.06, 0, 1.18, -0.8, 0.03, 0, 1.22, -1.05, 0.0], 6, MID); // tail
    },
  },

  // elegant insect queen: glowing egg sac, upright body, slender limbs, a crown
  queen: {
    height: 3.1,
    build: (b, d, boss) => {
      ellipsoid(b, 0.82, 0.7, 0.98, 0, 1.18, -1.05, LIGHT, 18); // egg sac
      for (let i = 0; i < 4; i++) b.add(torus(0.74 - Math.abs(i - 1.5) * 0.12, 0.04, 6, 20), MID, 0, 1.18, -0.55 - i * 0.32, { sy: 0.92 });
      ellipsoid(b, 0.4, 0.42, 0.48, 0, 1.4, 0.02, W, 16); // thorax
      ellipsoid(b, 0.28, 0.52, 0.27, 0, 2.02, 0.34, W, 16, { rx: 0.25 }); // upright body
      // ruff of petal plates
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ellipsoid(b, 0.16, 0.05, 0.1, Math.sin(a) * 0.22, 2.42, 0.45 + Math.cos(a) * 0.2, MID, 8, { ry: a, rx: 0.5 });
      }
      ellipsoid(b, 0.24, 0.3, 0.27, 0, 2.66, 0.55, W, 16); // head
      ellipsoid(b, 0.12, 0.1, 0.12, 0, 2.5, 0.75, MID, 10); // muzzle
      mirror((s) => {
        slyEye(b, d, s * 0.11, 2.72, 0.73, 0.08, s, { lid: 1.25 });
        spike(d, s * 0.06, 2.44, 0.84, s * 0.03, -0.1, 0.05, 0.025, TOOTH, 4); // mandibles
        // slender raised forelimbs
        sweep(b, [s * 0.24, 2.2, 0.42, 0.06, s * 0.42, 1.9, 0.75, 0.05, s * 0.3, 2.12, 1.05, 0.035, s * 0.22, 2.3, 1.1, 0.0], 6, MID);
        // two pairs of long arched legs
        for (let k = 0; k < 2; k++) {
          const z = 0.2 - k * 0.45;
          sweep(b, [s * 0.3, 1.35, z, 0.07, s * 0.85, 1.85, z + 0.15, 0.06, s * 1.25, 1.1, z + 0.25, 0.045, s * 1.4, 0.15, z + 0.3, 0.03], 7, MID);
          spike(d, s * 1.4, 0.17, z + 0.3, s * 0.02, -0.17, 0.0, 0.03, CLAW, 4);
        }
      });
      // crown
      const tips = boss ? 7 : 5;
      for (let i = 0; i < tips; i++) {
        const a = (i - (tips - 1) / 2) * (boss ? 0.32 : 0.38);
        const h = (boss ? 0.62 : 0.5) - Math.abs(a) * 0.35;
        spike(b, Math.sin(a) * 0.14, 2.88, 0.5 - Math.abs(a) * 0.05, Math.sin(a) * 0.22, h, -0.08, 0.05, W, 6);
        if (boss) dot(d, 0.04, Math.sin(a) * 0.36, 2.88 + h, 0.42, '#ffd0f0', 6, { slot: SLOT_GLOW });
      }
      d.add(new THREE.OctahedronGeometry(boss ? 0.11 : 0.08, 0), '#ff6ad8', 0, 3.0, 0.72, { slot: SLOT_GLOW, sy: 1.4 });
      // glowing eggs in the sac
      for (let i = 0; i < 14; i++) {
        const a = i * 2.39996;
        const y = 1.18 + Math.sin(i * 1.3) * 0.45;
        const ring = Math.sqrt(Math.max(0.05, 1 - ((y - 1.18) / 0.7) ** 2));
        dot(d, 0.09 + (i % 3) * 0.02, Math.cos(a) * 0.8 * ring, y, -1.05 + Math.sin(a) * 0.96 * ring, '#ffd6ec', 8, { slot: SLOT_GLOW });
      }
    },
  },

  // upright rock titan with glowing lava seams, ember eyes and a rock crest
  titan: {
    height: 4.7,
    build: (b, d, boss) => {
      ellipsoid(b, 1.12, 1.25, 0.88, 0, 2.6, 0, DEEP, 16); // hide
      ellipsoid(b, 1.0, 0.9, 0.5, 0, 2.75, 0.42, W, 16, { rx: -0.1 }); // chest plate
      ellipsoid(b, 0.9, 0.8, 0.5, 0, 2.95, -0.45, W, 14, { rx: 0.2 }); // back plate
      ellipsoid(b, 0.8, 0.5, 0.6, 0, 1.7, 0.05, MID, 14); // belly / hips
      mirror((s) => {
        ellipsoid(b, 0.62, 0.52, 0.58, s * 1.1, 3.35, 0.0, W, 14, { rz: -s * 0.35 }); // shoulder boulders
        sweep(b, [s * 1.2, 3.1, 0.05, 0.36, s * 1.45, 2.2, 0.22, 0.32, s * 1.42, 1.35, 0.3, 0.3], 12, DEEP);
        ellipsoid(b, 0.38, 0.5, 0.38, s * 1.45, 2.05, 0.24, W, 12); // forearm plate
        ellipsoid(b, 0.46, 0.42, 0.46, s * 1.42, 1.05, 0.34, MID, 14); // fist
        for (let k = -1; k <= 1; k++) ellipsoid(b, 0.11, 0.1, 0.1, s * 1.42 + k * 0.17, 1.2, 0.76, W, 6);
        sweep(b, [s * 0.5, 1.6, -0.1, 0.38, s * 0.58, 0.9, -0.02, 0.36, s * 0.6, 0.3, 0.0, 0.34], 12, DEEP);
        ellipsoid(b, 0.4, 0.18, 0.5, s * 0.6, 0.12, 0.12, MID, 12); // foot
        ellipsoid(b, 0.32, 0.28, 0.22, s * 0.58, 0.95, 0.16, W, 10); // knee plate
        // ember eyes under the brow
        ellipsoid(d, 0.1, 0.06, 0.05, s * 0.2, 3.98, 0.78, '#ffcf5a', 10, { rz: s * 0.25, slot: SLOT_GLOW });
        dot(d, 0.035, s * 0.2, 3.98, 0.82, '#fff2c0', 6, { slot: SLOT_GLOW });
        // lava cracks running over the chest plate and shoulders
        // (asymmetric, so the chest never reads as a face)
        const o = s > 0 ? 0 : -0.28;
        sweep(d, [s * 0.08, 3.25 + o, 0.9, 0.03, s * 0.24, 3.08 + o, 0.92, 0.034, s * 0.2, 2.9 + o, 0.93, 0.03, s * 0.38, 2.72 + o, 0.9, 0.026, s * 0.52, 2.62 + o, 0.84, 0.0], 5, '#ff7a3d', { slot: SLOT_GLOW });
        if (s > 0) sweep(d, [s * 0.2, 2.9, 0.93, 0.02, s * 0.06, 2.78, 0.95, 0.018, s * 0.1, 2.68, 0.95, 0.0], 4, '#ff7a3d', { slot: SLOT_GLOW });
        sweep(d, [s * 0.95, 3.72, 0.22, 0.026, s * 1.12, 3.5, 0.46, 0.03, s * 1.3, 3.42, 0.42, 0.0], 5, '#ff7a3d', { slot: SLOT_GLOW });
      });
      // head: brow, jaw, crest
      ellipsoid(b, 0.5, 0.45, 0.46, 0, 3.92, 0.42, MID, 16);
      ellipsoid(b, 0.52, 0.14, 0.28, 0, 4.12, 0.66, W, 14, { rx: 0.3 }); // brow
      ellipsoid(b, 0.4, 0.2, 0.32, 0, 3.66, 0.62, MID, 12); // jaw
      for (let i = 0; i < 3; i++) ellipsoid(b, 0.17 - i * 0.03, 0.1, 0.24, 0, 4.28 - i * 0.12, 0.22 - i * 0.3, W, 10, { rx: -0.6 }); // crest
      // glowing core showing through the chest
      if (boss) {
        // a crown of glowing crystal shards
        for (let i = 0; i < 7; i++) {
          const a = (i - 3) * 0.42;
          d.add(new THREE.OctahedronGeometry(0.16, 0), '#c88cff', Math.sin(a) * 0.42, 4.42 - Math.abs(a) * 0.15, 0.32 + Math.cos(a) * 0.2 - 0.2, { slot: SLOT_GLOW, sy: 2.6 - Math.abs(i - 3) * 0.4, rz: -a * 0.5 });
        }
      }
    },
  },
};

const cache = new Map<string, AlienGeo>();

/** Levels of detail: 0 = full, 1 = far (see SEG). */
export type AlienLod = 0 | 1;

/**
 * Geometry of an alien model; `boss` adds that model's boss regalia (necklace / grand crown / crystals); `lod` 1 is
 * the far version (same shapes and colours, fewer segments).
 */
export function alienGeometry(model: string, boss = false, lod: AlienLod = 0): AlienGeo {
  const key = `${model}${boss ? ':boss' : ''}${lod ? ':far' : ''}`;
  let g = cache.get(key);
  if (g) return g;
  const spec = MODELS[model];
  const b = new GeoBuilder(model.length * 41 + 7);
  const d = new GeoBuilder(model.length * 43 + 9);
  kit = SEG[lod];
  try {
    if (spec) spec.build(b, d, boss);
    else {
      ellipsoid(b, 0.6, 0.54, 0.6, 0, 0.6, 0, W, 14);
      mirror((s) => {
        sweep(b, [s * 0.4, 0.4, 0, 0.1, s * 0.55, 0.12, 0, 0.08], 6, MID);
        slyEye(b, d, s * 0.18, 0.78, 0.48, 0.11, s);
      });
    }
  } finally {
    kit = SEG[0];
  }
  const height = spec?.height ?? 1.2;
  // soft painted shading: a touch darker toward the feet
  const body = gradeY(b.build(), 0, height * 0.6, 0.78, 1);
  g = { body, detail: d.build(), height };
  cache.set(key, g);
  return g;
}

export const KNOWN_ALIEN_MODELS = Object.keys(MODELS);
