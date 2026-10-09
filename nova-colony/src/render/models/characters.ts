/**
 * Settler parts (shared by the player and every colonist, drawn through instanced batches tinted per
 * character), hand tools, carried loads and vehicle models (VehicleDef.model).
 *
 * Look: a cozy frontier adventure game's grown-up settlers — soft, smooth-shaded capsules and
 * ellipsoids, about four heads tall, simple dark eyes, rounded mitts and boots, soft hair caps.
 *
 * Part geometries are white where the instance colour should tint them (skin / outfit / accent /
 * trousers / boots / hair); fixed-colour details (eyes, soles, buckles) are baked in. Every part is
 * built in its JOINT's space so the actor composes one matrix per joint and pushes it to every part
 * hanging from that joint:
 *  - root: ground under the feet, facing +Z;
 *  - hip  (root + HIP_Y): torso + accent (collar, belt, pockets);
 *  - neck (hip + NECK_Y): head, face, hair, hats;
 *  - shoulder (hip ± SHOULDER_X, SHOULDER_Y): upper arm; elbow (shoulder - UPPER_ARM): forearm + hand;
 *  - hip joint (root ± HIP_X, HIP_Y): thigh; knee (hip joint - THIGH): shin + boot.
 */
import * as THREE from 'three';
import { GeoBuilder, SLOT_GLASS, SLOT_GLOW } from '../core/GeoBuilder';
import { lathe, limb, ellipsoid, sweep, gradeY, mirror, capsuleProfile, smoothSeams } from './soft';

// ------------------------------------------------------------------------------------ skeleton

/** Hip pivot above the ground (root space). */
export const HIP_Y = 0.86;
/** Thigh joints either side of the hip pivot. */
export const HIP_X = 0.098;
export const THIGH = 0.4;
export const SHIN = 0.36;
/** Shoulder joints relative to the hip pivot. */
export const SHOULDER_X = 0.205;
export const SHOULDER_Y = 0.43;
export const UPPER_ARM = 0.27;
export const FOREARM = 0.235;
/** Neck pivot relative to the hip pivot. */
export const NECK_Y = 0.5;
/** Grip point (hand centre) in forearm space. */
export const GRIP_Y = -FOREARM - 0.06;
/** Head centre above the neck pivot, and the head's height (≈ 1/4 of the figure). */
export const HEAD_CY = 0.255;
/** Standing height at scale 1 (top of the hair). */
export const FIGURE_H = HIP_Y + NECK_Y + 0.49;

/** Kept for older callers: the legs' top (now the hip joint) and the torso length. */
export const LEG_TOP = HIP_Y;
export const BODY_H = NECK_Y;

/** Number of hair styles (ColonistAppearance.hair wraps around it). */
export const HAIR_STYLE_COUNT = 8;

export type PartKey =
  | 'torso'
  | 'pelvis'
  | 'accent'
  | 'head'
  | 'face'
  | 'upperArm'
  | 'forearm'
  | 'hand'
  | 'thigh'
  | 'shin'
  | 'boot'
  | 'hair0'
  | 'hair1'
  | 'hair2'
  | 'hair3'
  | 'hair4'
  | 'hair5'
  | 'hair6'
  | 'hair7'
  | 'hairTrim';

export const PART_KEYS: readonly PartKey[] = ['torso', 'pelvis', 'accent', 'head', 'face', 'upperArm', 'forearm', 'hand', 'thigh', 'shin', 'boot', 'hair0', 'hair1', 'hair2', 'hair3', 'hair4', 'hair5', 'hair6', 'hair7', 'hairTrim'];

const W = '#ffffff';
const cache = new Map<string, THREE.BufferGeometry>();

function build(key: string, fn: (b: GeoBuilder) => void, post?: (g: THREE.BufferGeometry) => void): THREE.BufferGeometry {
  let g = cache.get(key);
  if (g) return g;
  const b = new GeoBuilder(key.length * 13 + 1);
  fn(b);
  g = b.build();
  post?.(g);
  cache.set(key, g);
  return g;
}

// ------------------------------------------------------------------------------------ torso

/** Torso profile (radius, y) in hip space, bottom (crotch) to top (neck base); depth = TORSO_DEPTH × radius. */
const TORSO_PROFILE = [0.0, -0.03, 0.12, -0.022, 0.172, 0.0, 0.178, 0.04, 0.174, 0.1, 0.166, 0.17, 0.176, 0.24, 0.194, 0.31, 0.202, 0.37, 0.195, 0.42, 0.166, 0.462, 0.12, 0.492, 0.068, 0.508, 0.0, 0.514];
/** Hips / seat (trousers), from the crotch to just over the belt line. */
const PELVIS_PROFILE = [0.0, -0.13, 0.085, -0.126, 0.14, -0.098, 0.168, -0.05, 0.176, 0.0, 0.172, 0.035, 0.12, 0.05, 0.0, 0.055];
const TORSO_DEPTH = 0.74;

/** Torso radius at hip-space height y (linear in the profile). */
export function torsoRadius(y: number): number {
  const p = TORSO_PROFILE;
  if (y <= p[1]) return p[0];
  for (let i = 2; i < p.length; i += 2) {
    if (y <= p[i + 1]) {
      const u = (y - p[i - 1]) / (p[i + 1] - p[i - 1]);
      return p[i - 2] + (p[i] - p[i - 2]) * u;
    }
  }
  return p[p.length - 2];
}

/** Point on the torso's front surface at height y and sideways offset x (for pockets, buttons, belts). */
function torsoFront(x: number, y: number, lift = 0.004): number {
  const r = torsoRadius(y);
  const u = Math.min(0.98, Math.abs(x) / Math.max(1e-3, r));
  return r * TORSO_DEPTH * Math.sqrt(1 - u * u) + lift;
}

function torso(b: GeoBuilder): void {
  lathe(b, TORSO_PROFILE, 12, 0, 0, 0, W, { sz: TORSO_DEPTH });
}

function pelvis(b: GeoBuilder): void {
  lathe(b, PELVIS_PROFILE, 12, 0, 0, 0, W, { sz: TORSO_DEPTH * 1.02 });
}

/** Collar, front placket, belt + buckle and two chest pockets, all in the accent tint. */
function accent(b: GeoBuilder): void {
  // folded collar: a soft ring around the neck base, a little lower at the front
  b.add(new THREE.TorusGeometry(0.088, 0.026, 6, 14), W, 0, 0.482, 0.0, { rx: Math.PI / 2 + 0.28, sz: 0.85 });
  // front placket (a soft seam line from the collar to the belt)
  const pl: number[] = [];
  for (let y = 0.43; y >= 0.06; y -= 0.074) pl.push(0, y, torsoFront(0, y, 0.002), 0.011);
  sweep(b, pl, 5, W);
  // belt band hugging the hips + buckle
  const r0 = torsoRadius(0.0) + 0.01;
  const r1 = torsoRadius(0.06) + 0.01;
  lathe(b, [r0 - 0.006, -0.004, r0, 0.004, r1, 0.056, r1 - 0.006, 0.064], 14, 0, 0, 0, W, { sz: TORSO_DEPTH });
  b.bevelBox(0.07, 0.056, 0.02, 0, 0.03, torsoFront(0, 0.03, 0.016), '#e2e2e2', 0.01);
  // chest pockets with flaps
  mirror((s) => {
    const x = s * 0.092;
    const z = torsoFront(x, 0.3, 0.004);
    const ry = s * 0.42;
    b.bevelBox(0.07, 0.072, 0.016, x, 0.3, z, W, 0.008, { ry });
    b.bevelBox(0.076, 0.022, 0.02, x, 0.338, z + 0.004, '#ececec', 0.007, { ry });
  });
}

// ------------------------------------------------------------------------------------ head

/** Cranium radii; the head is one smooth surface (a sphere with a narrower jaw and a chin). */
const HEAD_R = [0.185, 0.222, 0.198] as const;
const _hv = new THREE.Vector3();

/** Unit-sphere point → head surface point (head space), pushed out by `grow` (world units). */
function headPoint(x: number, y: number, z: number, grow = 0, out = _hv): THREE.Vector3 {
  const low = Math.max(0, -y); // 0 at the equator .. 1 under the chin
  const jaw = 1 - 0.3 * low * low;
  let X = x * HEAD_R[0] * jaw;
  const Y = y * HEAD_R[1];
  let Z = z * HEAD_R[2] * (1 - 0.12 * low * low) + 0.03 * low * Math.max(0, z);
  if (z < 0) Z *= 1 + 0.07 * Math.max(0, Math.min(1, y + 0.4)); // fuller back of the head
  if (grow) {
    const len = Math.hypot(X, Y, Z) || 1;
    const k = 1 + grow / len;
    X *= k;
    Z *= k;
    return out.set(X, Y * k + HEAD_CY, Z);
  }
  return out.set(X, Y + HEAD_CY, Z);
}

/**
 * A window of the head surface (three's sphere phi / theta window, tipped back by `tilt` about X
 * before it is shaped), `grow` units off the skin: the head itself, hair caps, beards, hat shells.
 */
export function headShell(b: GeoBuilder, color: THREE.ColorRepresentation, seg: number, phiStart: number, phiLen: number, thetaStart: number, thetaLen: number, tilt = 0, grow = 0, slot = 0): void {
  const hs = Math.max(4, Math.round(seg * 0.75 * (thetaLen / Math.PI)) + 2);
  const g = new THREE.SphereGeometry(1, seg, hs, phiStart, phiLen, thetaStart, thetaLen);
  const P = g.attributes.position as THREE.BufferAttribute;
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i);
    const y = P.getY(i);
    const z = P.getZ(i);
    headPoint(x, y * c - z * s, y * s + z * c, grow);
    P.setXYZ(i, _hv.x, _hv.y, _hv.z);
  }
  g.computeVertexNormals();
  smoothSeams(g);
  b.add(g, color, 0, 0, 0, { slot });
}

function head(b: GeoBuilder): void {
  limb(b, 0.056, 0.064, 0.11, 0, 0.1, 0, W, 8); // neck
  headShell(b, W, 18, 0, Math.PI * 2, 0, Math.PI);
  ellipsoid(b, 0.026, 0.036, 0.03, 0, 0.212, 0.2, W, 6, { rx: -0.25 }); // nose
  mirror((s) => ellipsoid(b, 0.03, 0.05, 0.022, s * 0.18, 0.235, -0.008, '#f2f2f2', 6, { ry: s * 0.3 })); // ears
}

/** Simple dark eyes with a small catch-light and a quiet mouth; no blush. Fixed colours. */
function face(b: GeoBuilder): void {
  mirror((s) => {
    ellipsoid(b, 0.023, 0.031, 0.012, s * 0.071, 0.262, 0.178, '#2a201b', 6, { ry: s * 0.36 });
    b.sphere(0.0075, s * 0.071 + 0.008, 0.272, 0.19, '#ffffff', 4);
  });
  sweep(b, [-0.032, 0.153, 0.179, 0.0062, 0, 0.146, 0.184, 0.0068, 0.032, 0.153, 0.179, 0.0062], 5, '#8a4a40');
}

// ------------------------------------------------------------------------------------ limbs

function upperArm(b: GeoBuilder): void {
  limb(b, 0.066, 0.058, UPPER_ARM, 0, 0, 0, W, 8);
}

function forearm(b: GeoBuilder): void {
  limb(b, 0.058, 0.051, FOREARM - 0.02, 0, 0, 0, W, 8);
  // cuff: a slightly fuller band at the wrist
  lathe(b, [0.05, -FOREARM + 0.005, 0.058, -FOREARM + 0.015, 0.058, -FOREARM + 0.05, 0.052, -FOREARM + 0.062], 8, 0, 0, 0, '#ececec');
}

/** Rounded mitt with a thumb, palm facing in (the instance tints it with skin). */
function hand(b: GeoBuilder): void {
  ellipsoid(b, 0.05, 0.066, 0.04, 0, GRIP_Y, 0.004, W, 9);
  ellipsoid(b, 0.019, 0.034, 0.019, 0, GRIP_Y + 0.02, 0.04, W, 6, { rx: 0.5 });
}

function thigh(b: GeoBuilder): void {
  limb(b, 0.098, 0.078, THIGH, 0, 0, 0, W, 9, { sz: 0.96 });
}

function shin(b: GeoBuilder): void {
  limb(b, 0.076, 0.06, SHIN - 0.02, 0, 0, 0, W, 8);
}

/** Rounded work boot (leather tint) with a darker sole and a turned-down cuff, in shin space. */
function boot(b: GeoBuilder): void {
  const a = -SHIN;
  lathe(b, capsuleProfile(0.066, a - 0.03, 0.07, a + 0.07, 2), 9, 0, 0, 0, W); // shaft
  lathe(b, [0.073, a + 0.06, 0.08, a + 0.075, 0.078, a + 0.095, 0.07, a + 0.1], 9, 0, 0, 0, '#d8d8d8'); // cuff
  ellipsoid(b, 0.07, 0.058, 0.132, 0, a - 0.052, 0.045, W, 10); // foot
  ellipsoid(b, 0.074, 0.02, 0.138, 0, a - 0.094, 0.045, '#5a5a5a', 10); // sole
}

// ------------------------------------------------------------------------------------ hair

/** Hair cap: the head surface tipped back by `tilt`, down to `thetaLen` from the crown, `grow` off the skin. */
function cap(b: GeoBuilder, thetaLen: number, tilt: number, grow = 0.016, seg = 16): void {
  headShell(b, W, seg, 0, Math.PI * 2, 0, thetaLen, tilt, grow);
}

function brows(b: GeoBuilder): void {
  mirror((s) => sweep(b, [s * 0.036, 0.303, 0.176, 0.0105, s * 0.072, 0.31, 0.172, 0.012, s * 0.106, 0.301, 0.161, 0.0085], 5, W));
}

/** Moustache resting on the upper lip. */
function moustache(b: GeoBuilder, r = 0.017): void {
  sweep(b, [-0.06, 0.162, 0.168, r * 0.5, -0.03, 0.176, 0.188, r, 0, 0.18, 0.196, r * 1.1, 0.03, 0.176, 0.188, r, 0.06, 0.162, 0.168, r * 0.5], 6, W);
}

/** A beard over the jaw: the lower front of the head surface, `grow` off the skin, from `top` (theta) down. */
function beard(b: GeoBuilder, grow: number, top: number): void {
  headShell(b, W, 16, Math.PI * 0.12, Math.PI * 0.76, top, Math.PI - top, 0, grow);
}

const HAIR: ((b: GeoBuilder) => void)[] = [
  // 0 crop with a soft side-swept fringe (the player's default)
  (b) => {
    cap(b, 1.72, -0.62);
    ellipsoid(b, 0.13, 0.05, 0.1, 0.04, 0.432, 0.1, W, 10, { rz: -0.32, rx: 0.35 });
    brows(b);
  },
  // 1 long, past the shoulders
  (b) => {
    cap(b, 1.82, -0.5, 0.022);
    ellipsoid(b, 0.19, 0.21, 0.1, 0, 0.17, -0.12, W, 12);
    mirror((s) => sweep(b, [s * 0.168, 0.33, 0.06, 0.05, s * 0.19, 0.2, 0.03, 0.055, s * 0.18, 0.06, -0.02, 0.05, s * 0.15, -0.02, -0.05, 0.035], 7, W));
    ellipsoid(b, 0.15, 0.045, 0.1, -0.03, 0.43, 0.1, W, 10, { rz: 0.25, rx: 0.35 });
    brows(b);
  },
  // 2 low bun
  (b) => {
    cap(b, 1.7, -0.55);
    ellipsoid(b, 0.085, 0.08, 0.075, 0, 0.36, -0.205, W, 10);
    b.add(new THREE.TorusGeometry(0.05, 0.012, 5, 10), '#d0d0d0', 0, 0.34, -0.17, { rx: 0.4 });
    brows(b);
  },
  // 3 curls: a crown of soft round curls
  (b) => {
    cap(b, 1.7, -0.5, 0.02);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const ring = i % 2;
      const el = ring ? 0.45 : 0.95;
      const x = Math.cos(a) * Math.cos(el) * 0.2;
      const z = Math.sin(a) * Math.cos(el) * 0.205 - 0.03;
      const y = HEAD_CY + Math.sin(el) * 0.22 + 0.01;
      if (z > 0.12 && y < 0.42) continue; // keep the forehead clear
      ellipsoid(b, 0.078, 0.07, 0.078, x, y, z, W, 8);
    }
    ellipsoid(b, 0.12, 0.08, 0.12, 0, 0.47, -0.02, W, 10);
    brows(b);
  },
  // 4 ponytail
  (b) => {
    cap(b, 1.72, -0.58);
    b.add(new THREE.TorusGeometry(0.034, 0.012, 5, 10), '#d0d0d0', 0, 0.36, -0.2, { rx: 1.0 });
    sweep(b, [0, 0.37, -0.2, 0.048, 0, 0.33, -0.27, 0.05, 0, 0.22, -0.29, 0.045, 0, 0.1, -0.25, 0.032, 0, 0.02, -0.22, 0.012], 8, W);
    brows(b);
  },
  // 5 short crop + full beard
  (b) => {
    cap(b, 1.66, -0.68, 0.012);
    beard(b, 0.022, 1.95);
    moustache(b);
    brows(b);
  },
  // 6 swept back with a moustache
  (b) => {
    cap(b, 1.7, -0.5);
    ellipsoid(b, 0.15, 0.07, 0.15, 0, 0.44, 0.0, W, 12, { rx: -0.3 });
    moustache(b, 0.015);
    brows(b);
  },
  // 7 close crop + trimmed beard
  (b) => {
    cap(b, 1.66, -0.7, 0.008);
    beard(b, 0.01, 2.05);
    moustache(b, 0.013);
    brows(b);
  },
];

/** Back and sides of the player's crop showing under a hat brim (+ brows). */
function hairTrim(b: GeoBuilder): void {
  headShell(b, W, 16, 0, Math.PI * 2, 1.05, 0.67, -0.62, 0.016);
  brows(b);
}

export function partGeometry(key: PartKey): THREE.BufferGeometry {
  switch (key) {
    case 'torso':
      // a touch darker toward the hem: soft painted shading, lighter shoulders
      return build('torso', torso, (g) => gradeY(g, -0.14, 0.45, 0.84, 1.04));
    case 'pelvis':
      return build('pelvis', pelvis, (g) => gradeY(g, -0.13, 0.05, 0.86, 1));
    case 'accent':
      return build('accent', accent);
    case 'head':
      return build('head', head);
    case 'face':
      return build('face', face);
    case 'upperArm':
      return build('upperArm', upperArm, (g) => gradeY(g, -UPPER_ARM, 0.05, 0.9, 1.02));
    case 'forearm':
      return build('forearm', forearm);
    case 'hand':
      return build('hand', hand);
    case 'thigh':
      return build('thigh', thigh, (g) => gradeY(g, -THIGH, 0.05, 0.86, 1));
    case 'shin':
      return build('shin', shin, (g) => gradeY(g, -SHIN, 0.05, 0.82, 0.96));
    case 'boot':
      return build('boot', boot);
    case 'hairTrim':
      return build('hairTrim', hairTrim);
    default: {
      const i = Number(key.slice(4)) | 0;
      return build(key, HAIR[((i % HAIR.length) + HAIR.length) % HAIR.length]);
    }
  }
}

// ------------------------------------------------------------------------------------ held items

/** Tools held in the right hand, pivot at the grip, handle along +Y. */
export type ToolKey = 'axe' | 'pick' | 'gun' | 'mug' | 'logs' | 'sack';
export const TOOL_KEYS: readonly ToolKey[] = ['axe', 'pick', 'gun', 'mug', 'logs', 'sack'];

const HANDLE = '#8a5a32';
const STEEL = '#6b7482';
const BLADE = '#c3ccd6';

const TOOLS: Record<ToolKey, (b: GeoBuilder) => void> = {
  axe: (b) => {
    lathe(b, capsuleProfile(0.02, -0.12, 0.024, 0.5, 2), 6, 0, 0, 0, HANDLE);
    b.add(new THREE.TorusGeometry(0.026, 0.008, 4, 8), '#4a3527', 0, -0.06, 0, { rx: Math.PI / 2 }); // grip wrap
    // head: rounded steel cheek with a bright bit edge
    ellipsoid(b, 0.022, 0.06, 0.06, 0, 0.47, 0.03, STEEL, 8);
    b.add(new THREE.CylinderGeometry(0.1, 0.1, 0.024, 12, 1, false, -0.9, 1.8), BLADE, 0, 0.47, 0.06, { rz: Math.PI / 2, sx: 1, sy: 1, sz: 1 });
  },
  pick: (b) => {
    lathe(b, capsuleProfile(0.02, -0.12, 0.024, 0.5, 2), 6, 0, 0, 0, HANDLE);
    b.add(new THREE.TorusGeometry(0.026, 0.008, 4, 8), '#4a3527', 0, -0.06, 0, { rx: Math.PI / 2 });
    // curved double pick
    sweep(b, [0, 0.43, -0.24, 0.0, 0, 0.48, -0.12, 0.026, 0, 0.5, 0, 0.034, 0, 0.48, 0.12, 0.026, 0, 0.43, 0.24, 0.0], 6, BLADE);
    ellipsoid(b, 0.04, 0.045, 0.04, 0, 0.5, 0, STEEL, 8);
  },
  gun: (b) => {
    // compact frontier carbine: rounded stock, steel body, glowing muzzle cell (barrel along +Z)
    ellipsoid(b, 0.045, 0.07, 0.16, 0, -0.04, -0.12, HANDLE, 8);
    lathe(b, capsuleProfile(0.05, 0, 0.05, 0.36, 2), 8, 0, 0.06, 0.05, '#3a3f47', { rx: Math.PI / 2 });
    lathe(b, capsuleProfile(0.024, 0, 0.024, 0.32, 2), 6, 0, 0.09, 0.4, STEEL, { rx: Math.PI / 2 });
    b.sphere(0.03, 0, 0.09, 0.76, '#ffb24a', 6, { slot: SLOT_GLOW });
    ellipsoid(b, 0.03, 0.05, 0.03, 0, -0.03, 0.02, '#2a2a2e', 6);
  },
  mug: (b) => {
    lathe(b, [0.0, -0.03, 0.04, -0.03, 0.044, 0.04, 0.046, 0.06, 0.04, 0.062, 0.036, 0.052, 0.0, 0.05], 10, 0, 0, 0.05, '#d8cfc0');
    b.add(new THREE.TorusGeometry(0.024, 0.008, 4, 8), '#d8cfc0', 0.045, 0.02, 0.05, { ry: Math.PI / 2 });
    b.cyl(0.036, 0.036, 0.004, 0, 0.048, 0.05, '#6a4028', 10);
  },
  // carried loads sit in front of the belly, in hip space
  logs: (b) => {
    for (let i = 0; i < 3; i++) {
      const y = 0.16 + (i === 2 ? 0.075 : 0);
      const z = 0.27 + (i === 2 ? 0 : (i - 0.5) * 0.08);
      lathe(b, capsuleProfile(0.042, -0.19, 0.042, 0.19, 1), 8, 0, y, z, '#8a5a32', { rz: Math.PI / 2 });
      mirror((s) => b.cyl(0.036, 0.036, 0.01, s * 0.225, y, z, '#d8b47a', 8, { rz: Math.PI / 2 }));
    }
  },
  sack: (b) => {
    ellipsoid(b, 0.17, 0.15, 0.13, 0, 0.17, 0.27, '#c8b088', 10);
    sweep(b, [0, 0.3, 0.27, 0.05, 0, 0.36, 0.27, 0.03], 6, '#c8b088');
    b.add(new THREE.TorusGeometry(0.035, 0.01, 4, 8), '#6a4a2a', 0, 0.31, 0.27, { rx: Math.PI / 2 });
    b.shard(0.05, 0.06, 0.06, 0.34, 0.31, '#8e8a82');
  },
};

export function toolGeometry(key: ToolKey = 'axe'): THREE.BufferGeometry {
  return build(`tool_${key}`, TOOLS[key] ?? TOOLS.axe);
}

/** @deprecated the player's rifle is `toolGeometry('gun')`. */
export function gunGeometry(): THREE.BufferGeometry {
  return toolGeometry('gun');
}

/** Node models worked with a pick (everything else is chopped / cut). */
export function nodeTool(model: string): 'axe' | 'pick' {
  return /tree|bush|fiber|bio|reed|cactus|mushroom|log/.test(model) ? 'axe' : 'pick';
}

// ------------------------------------------------------------------------------------ vehicles

/** Paint of a vehicle: main body, secondary body panels (fenders, hood, cabin) and trim (stripes, rims). */
export interface VehiclePaint {
  body: THREE.ColorRepresentation;
  body2: THREE.ColorRepresentation;
  trim: THREE.ColorRepresentation;
}

const TIRE = '#2a2a2e';
const RIM = '#aeb9c7';
const HEADLIGHT = '#fff2b0';
const TAIL = '#ff4d5e';
const HOVER = '#5ef2ff';
const VSTEEL = '#6b7482';
const SEAT = '#2a2a2e';
const GOLD = '#d6ae55';

function wheel(b: GeoBuilder, r: number, w: number, x: number, y: number, z: number): void {
  b.wheel(r, w, x, y, z, TIRE, RIM, 8);
}

/** Pair of headlights at the front (+Z) edge. */
function headlights(b: GeoBuilder, x: number, y: number, z: number, r = 0.1): void {
  for (const sx of [-x, x]) {
    b.box(r * 2.2, r * 2.2, 0.06, sx, y, z, VSTEEL);
    b.box(r * 1.6, r * 1.6, 0.06, sx, y, z + 0.04, HEADLIGHT, { slot: SLOT_GLOW });
  }
}

/** Glowing hover pad (flat disc) under a hovering vehicle. */
function hoverPad(b: GeoBuilder, r: number, x: number, y: number, z: number): void {
  b.cyl(r, r * 0.8, 0.12, x, y, z, '#3a4a58', 8);
  b.cyl(r * 0.85, r * 0.85, 0.05, x, y - 0.06, z, HOVER, 8, { slot: SLOT_GLOW });
}

/** Factory paint of each vehicle model (the colours they always had). */
const FACTORY: Record<string, VehiclePaint> = {
  atv: { body: '#e05a2a', body2: '#c94a1e', trim: '#f4f6f8' },
  buggy: { body: '#4fa3e0', body2: '#3f8ac4', trim: '#f4f6f8' },
  mining_truck: { body: '#f0b24b', body2: '#f0b24b', trim: '#f0b24b' },
  hover_bike: { body: '#b26ad8', body2: '#9a55c2', trim: '#f4f6f8' },
  armored_rover: { body: '#5e7f99', body2: '#4a6478', trim: '#ff9440' },
  titanium_hovercraft: { body: '#dfe6ee', body2: '#c8d2de', trim: GOLD },
};

/**
 * Vehicle models: body centred at origin, facing +Z, ground at y = 0. Chunky toy vehicles with
 * proper wheels (tyre + hub), headlights, seats, roll cages, cargo and hover pads. Seat heights
 * (vehicleSeatY) are unchanged so the rider pose keeps fitting.
 */
const VEHICLES: Record<string, (b: GeoBuilder, p: VehiclePaint) => void> = {
  atv: (b, p) => {
    for (const x of [-0.6, 0.6]) for (const z of [-0.7, 0.7]) wheel(b, 0.36, 0.3, x, 0.36, z);
    b.bevelBox(0.8, 0.4, 1.8, 0, 0.6, 0, p.body, 0.08, { shade: 0.03 });
    for (const x of [-0.6, 0.6]) for (const z of [-0.7, 0.7]) b.box(0.36, 0.1, 0.9, x, 0.78, z, p.body2); // fenders
    b.box(0.6, 0.22, 0.75, 0, 0.9, -0.15, SEAT, { shade: 0.03 }); // seat
    b.box(0.7, 0.1, 0.6, 0, 0.85, 0.5, p.body);
    b.box(0.9, 0.06, 0.06, 0, 1.15, 0.5, VSTEEL); // handlebar
    b.box(0.06, 0.35, 0.06, 0, 0.98, 0.5, VSTEEL);
    for (const sx of [-0.45, 0.45]) b.box(0.12, 0.06, 0.06, sx, 1.15, 0.5, SEAT); // grips
    b.box(0.5, 0.2, 0.08, 0, 0.72, 0.92, VSTEEL); // front rack
    b.box(0.2, 0.16, 0.06, 0, 0.72, 0.97, HEADLIGHT, { slot: SLOT_GLOW });
    b.box(0.7, 0.06, 0.4, 0, 0.82, -0.75, VSTEEL); // rear rack
    b.box(0.34, 0.3, 0.3, 0, 1.0, -0.75, '#c9a86b', { shade: 0.05 }); // strapped sack
    b.box(0.38, 0.05, 0.34, 0, 1.0, -0.75, '#6e4a28');
    b.cyl(0.05, 0.05, 0.6, 0.42, 0.5, -0.5, VSTEEL, 5, { rx: Math.PI / 2 }); // exhaust
    b.box(0.82, 0.05, 1.0, 0, 0.81, 0.1, p.trim); // racing stripe
  },
  buggy: (b, p) => {
    for (const x of [-0.8, 0.8]) for (const z of [-0.9, 1.0]) wheel(b, 0.45, 0.4, x, 0.45, z);
    b.bevelBox(1.2, 0.5, 2.4, 0, 0.7, 0, p.body, 0.1, { shade: 0.03 });
    b.box(1.1, 0.3, 0.6, 0, 0.75, 1.1, p.body2, { rx: -0.35 }); // sloped hood
    b.box(1.0, 0.3, 0.8, 0, 1.0, -0.4, SEAT);
    b.box(1.0, 0.5, 0.2, 0, 1.3, -0.75, SEAT); // seat back
    b.box(0.5, 0.06, 0.08, 0, 1.2, 0.3, VSTEEL); // steering wheel
    b.cyl(0.14, 0.14, 0.04, 0, 1.25, 0.25, SEAT, 8, { rx: 1.2 });
    // roll cage
    for (const x of [-0.5, 0.5]) {
      b.box(0.08, 1.0, 0.08, x, 1.4, 0.5, VSTEEL);
      b.box(0.08, 1.0, 0.08, x, 1.4, -0.7, VSTEEL);
      b.box(0.08, 0.08, 1.3, x, 1.9, -0.1, VSTEEL);
    }
    b.box(1.1, 0.08, 0.08, 0, 1.9, 0.5, VSTEEL);
    b.box(1.1, 0.08, 0.08, 0, 1.9, -0.7, VSTEEL);
    headlights(b, 0.38, 0.8, 1.22, 0.09);
    b.box(1.3, 0.12, 0.12, 0, 0.5, 1.22, VSTEEL); // bumper
    b.box(0.5, 0.06, 2.0, 0, 0.96, 0.0, p.trim); // stripe
    // spare tyre on the back
    b.cyl(0.4, 0.4, 0.22, 0, 1.25, -1.26, TIRE, 8, { rx: Math.PI / 2, shade: 0.03 });
    b.cyl(0.22, 0.22, 0.26, 0, 1.25, -1.26, RIM, 6, { rx: Math.PI / 2 });
    b.box(0.3, 0.1, 0.05, 0, 0.95, -1.22, TAIL, { slot: SLOT_GLOW });
  },
  mining_truck: (b, p) => {
    for (const x of [-0.95, 0.95]) for (const z of [-1.1, 0.0, 1.2]) wheel(b, 0.5, 0.45, x, 0.5, z);
    b.box(1.6, 0.3, 3.3, 0, 0.55, 0, '#3a3f47'); // chassis
    b.bevelBox(1.8, 0.6, 3.4, 0, 0.9, 0, p.body, 0.08, { shade: 0.03 });
    b.bevelBox(1.6, 1.0, 1.0, 0, 1.7, 1.1, p.body2, 0.1, { shade: 0.02 }); // cab
    b.box(1.4, 0.5, 0.1, 0, 1.9, 1.62, '#ffffff', { slot: SLOT_GLASS }); // windshield
    for (const sx of [-0.82, 0.82]) b.box(0.08, 0.4, 0.6, sx, 1.9, 1.1, '#ffffff', { slot: SLOT_GLASS });
    b.box(1.5, 0.3, 0.1, 0, 1.2, 1.66, '#3a3f47'); // grill
    b.stripes(1.7, 0.16, 0.12, 0, 0.8, 1.72, 6, p.trim, '#2e2c2a', 'x'); // hazard bumper
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
  hover_bike: (b, p) => {
    b.bevelBox(0.6, 0.4, 2.2, 0, 0.75, 0, p.body, 0.08, { shade: 0.03 });
    b.cone(0.3, 0.6, 0, 0.75, 1.3, p.body, 6, { rx: Math.PI / 2 });
    b.box(0.5, 0.22, 0.7, 0, 1.05, -0.3, SEAT);
    b.box(0.5, 0.3, 0.1, 0, 1.25, -0.68, SEAT); // seat back
    b.box(0.9, 0.05, 0.05, 0, 1.25, 0.6, VSTEEL);
    b.box(0.05, 0.3, 0.05, 0, 1.1, 0.6, VSTEEL);
    b.box(0.7, 0.1, 2.0, 0, 0.55, 0, HOVER, { slot: SLOT_GLOW });
    for (const sx of [-0.55, 0.55]) b.box(0.4, 0.06, 0.5, sx, 0.72, -0.5, p.body2); // stabiliser fins
    hoverPad(b, 0.3, 0, 0.5, 0.65);
    hoverPad(b, 0.3, 0, 0.5, -0.7);
    b.box(0.2, 0.14, 0.06, 0, 0.85, 1.58, HEADLIGHT, { slot: SLOT_GLOW });
    b.box(0.4, 0.08, 0.06, 0, 0.8, -1.1, TAIL, { slot: SLOT_GLOW });
    b.box(0.62, 0.05, 1.2, 0, 0.96, 0.4, p.trim); // stripe
  },
  armored_rover: (b, p) => {
    for (const x of [-0.95, 0.95]) for (const z of [-1.2, 0.0, 1.2]) wheel(b, 0.5, 0.5, x, 0.5, z);
    b.bevelBox(1.8, 0.9, 3.4, 0, 1.0, 0, p.body, 0.12, { shade: 0.03 });
    b.box(1.9, 0.12, 3.5, 0, 1.0, 0, '#58d0ff', { slot: SLOT_GLOW });
    for (const sx of [-0.92, 0.92]) b.box(0.1, 0.5, 3.0, sx, 0.75, 0, p.body2); // side skirts
    b.wedge(1.8, 0.5, 0.5, 0, 0.6, 1.75, p.body2, { ry: Math.PI / 2, shade: 0.03 }); // front plough
    b.bevelBox(1.4, 0.6, 1.4, 0, 1.75, -0.3, p.body2, 0.1, { shade: 0.02 }); // cabin
    b.box(1.3, 0.3, 0.1, 0, 1.6, 1.72, '#ffffff', { slot: SLOT_GLASS });
    b.box(1.0, 0.25, 0.08, 0, 1.8, 0.42, '#ffffff', { slot: SLOT_GLASS }); // cabin visor
    b.cyl(0.08, 0.08, 1.1, 0.2, 2.1, 0.3, '#3a3f47', 6, { rx: Math.PI / 2 });
    b.bevelBox(0.5, 0.3, 0.5, 0.2, 2.1, -0.3, '#3a3f47', 0.05);
    b.cyl(0.03, 0.03, 0.8, -0.5, 2.4, -0.8, VSTEEL, 4); // antenna
    b.box(0.1, 0.1, 0.1, -0.5, 2.82, -0.8, TAIL, { slot: SLOT_GLOW, ry: Math.PI / 4 });
    headlights(b, 0.62, 1.2, 1.72, 0.1);
    b.stripes(1.6, 0.14, 0.1, 0, 1.3, -1.72, 4, p.trim, '#2e2c2a', 'x'); // rear hazard
    b.box(1.0, 0.08, 0.9, 0, 1.49, -1.0, '#3b4c5e'); // cargo hatch
  },
  titanium_hovercraft: (b, p) => {
    b.bevelBox(1.8, 0.5, 3.6, 0, 0.9, 0, p.body, 0.12, { shade: 0.015 });
    b.cone(0.9, 1.2, 0, 0.9, 2.3, p.body, 6, { rx: Math.PI / 2, sy: 0.6 });
    b.box(1.9, 0.08, 3.4, 0, 0.72, 0, '#45f0ff', { slot: SLOT_GLOW });
    b.bevelBox(1.2, 0.5, 1.4, 0, 1.4, -0.2, p.body2, 0.1); // cabin
    b.box(1.1, 0.4, 0.1, 0, 1.45, 0.52, '#ffffff', { slot: SLOT_GLASS });
    b.box(1.3, 0.06, 1.5, 0, 1.68, -0.2, p.trim); // roof trim
    for (const x of [-1.1, 1.1]) {
      b.box(0.5, 0.18, 1.6, x, 0.9, -0.6, p.body); // side pods
      b.box(0.3, 0.06, 1.2, x, 0.82, -0.6, '#45f0ff', { slot: SLOT_GLOW });
      b.box(0.52, 0.04, 1.62, x, 1.0, -0.6, p.trim);
    }
    b.box(0.1, 0.8, 0.8, 0, 1.7, -1.6, '#45f0ff', { slot: SLOT_GLOW }); // tail fin
    b.box(0.14, 0.9, 0.3, 0, 1.6, -1.3, p.trim);
    hoverPad(b, 0.42, 0, 0.62, 1.0);
    hoverPad(b, 0.42, 0, 0.62, -1.0);
    b.cyl(0.3, 0.3, 0.3, 0, 1.0, -1.85, p.body2, 8, { rx: Math.PI / 2 }); // thruster
    b.cyl(0.22, 0.22, 0.08, 0, 1.0, -2.02, '#45f0ff', 8, { rx: Math.PI / 2, slot: SLOT_GLOW });
    b.box(1.82, 0.05, 2.4, 0, 1.16, 0.2, p.trim); // deck line
    for (const x of [-0.5, 0.5]) b.box(0.22, 0.14, 0.06, x, 1.0, 2.5, '#ffffff', { slot: SLOT_GLOW });
  },
};

const _vc = new THREE.Color();
/** A vehicle_skin cosmetic as paint: body in `color`, panels a shade darker, trim in `accent`. */
export function paintFromSkin(color: string, accent: string): VehiclePaint {
  _vc.set(color).multiplyScalar(0.82);
  return { body: color, body2: '#' + _vc.getHexString(), trim: accent };
}

/**
 * Geometry of a vehicle model, in its factory paint or in `paint` (a vehicle_skin). `paintKey`
 * names the paint for the cache (the skin id); omit both for the factory finish.
 */
export function vehicleGeometry(model: string, paint?: VehiclePaint, paintKey = ''): THREE.BufferGeometry {
  const fn = VEHICLES[model] ?? VEHICLES.atv;
  const factory = FACTORY[model] ?? FACTORY.atv;
  const key = paint && paintKey ? `veh_${model}@${paintKey}` : `veh_${model}`;
  return build(key, (b) => fn(b, paint && paintKey ? paint : factory));
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
