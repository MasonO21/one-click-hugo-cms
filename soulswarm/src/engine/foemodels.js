// Painted 3D foes: Higgsfield image-to-3D models built from each foe's Bestiary painting (scripts/enemies.sh,
// docs/ART_AND_ADS.md §6). Loaded once and shared; the horde, the legion's ghosts, the ten chapter bosses and the Soul Thief
// clone the geometry for their own instance attributes. The models are static: the character shader walks them
// (USE_GAIT, swinging each leg about its hip and each arm about its shoulder), so a horde of hundreds stays one draw
// call per type. Until a model is ready (or if one fails) the procedural one from models.js stands in.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetFiles, loadBytes, loadTexture, floatGeometry } from './assets.js';

const GLB = assetFiles(import.meta.glob('../assets/foes/*.glb', { eager: true, query: '?url', import: 'default' }));
const TEX = assetFiles(import.meta.glob('../assets/foes/*.webp', { eager: true, query: '?url', import: 'default' }));

// Per foe: height in metres before the foe's own scale (close to the procedural model it replaces, whose hit radius
// the game keeps), how much bright saturated paint glows, and the walk. Gait heights and widths are fractions of the
// height: hip / sh = the hip and shoulder pivots, armX = |x| where the arms begin (the torso stays put), leg / arm =
// swing in radians, rate = strides per 6 rad/s, bob = the dip as the feet pass, sway = side roll per metre of height,
// hover = a float's rise and fall, hem = a robe's flutter below the hips. lit = a boss's light level (dark paint on a
// dark floor needs more). The models face +X; they are turned to +Z (yaw: an extra turn for a model sculpted side-on).
export const FOES = {
  husk:     { h: 1.5,  glow: 1.3, gait: { hip: 0.46, sh: 0.78, armX: 0.12, leg: 0.42, arm: 0.3,  rate: 1.5, bob: 0.025, sway: 0.03,  hover: 0,     hem: 0 } },
  ghoul:    { h: 1.05, glow: 1.6, gait: { hip: 0.42, sh: 0.8,  armX: 0.1,  leg: 0.45, arm: 0.4,  rate: 2.2, bob: 0.03,  sway: 0.02,  hover: 0,     hem: 0.02 } },
  brute:    { h: 2.3,  glow: 1.1, gait: { hip: 0.4,  sh: 0.78, armX: 0.2,  leg: 0.36, arm: 0.22, rate: 1.0, bob: 0.02,  sway: 0.035, hover: 0,     hem: 0 } },
  witch:    { h: 2.15, glow: 1.4, gait: { hip: 0.5,  sh: 0.74, armX: 0.11, leg: 0,    arm: 0.12, rate: 0.8, bob: 0,     sway: 0.015, hover: 0.035, hem: 0.03 } },
  bloater:  { h: 1.6,  glow: 1.3, gait: { hip: 0.26, sh: 0.74, armX: 0.32, leg: 0.3,  arm: 0.14, rate: 1.3, bob: 0.02,  sway: 0.05,  hover: 0,     hem: 0 } },
  wraith:   { h: 1.85, glow: 1.5, gait: { hip: 0.5,  sh: 0.72, armX: 0.14, leg: 0,    arm: 0.14, rate: 0.9, bob: 0,     sway: 0.02,  hover: 0.04,  hem: 0.045 } },
  priest:   { h: 2.1,  glow: 1.4, gait: { hip: 0.42, sh: 0.74, armX: 0.14, leg: 0.18, arm: 0.12, rate: 1.0, bob: 0.015, sway: 0.025, hover: 0,     hem: 0.03 } },
  thief:    { h: 1.3,  glow: 1.6, gait: { hip: 0.4,  sh: 0.7,  armX: 0.2,  leg: 0.4,  arm: 0.1,  rate: 2.4, bob: 0.04,  sway: 0.02,  hover: 0,     hem: 0.02 } },
  gravemaw: { h: 4.6,  glow: 2.0, gait: { hip: 0.42, sh: 0.72, armX: 0.17, leg: 0,    arm: 0.1,  rate: 0.5, bob: 0,     sway: 0.008, hover: 0.012, hem: 0.025 } },
  pyrexa:   { h: 4.6,  glow: 1.8, lit: 1.25, gait: { hip: 0.45, sh: 0.74, armX: 0.14, leg: 0,    arm: 0.08, rate: 0.5, bob: 0,     sway: 0.01,  hover: 0.015, hem: 0.03 } },
  vaulkar:  { h: 4.6,  glow: 2.0, gait: { hip: 0.36, sh: 0.76, armX: 0.24, leg: 0.22, arm: 0.14, rate: 0.55, bob: 0.02, sway: 0.02,  hover: 0,     hem: 0 } },
  azrathel: { h: 4.8,  glow: 1.8, lit: 1.7, gait: { hip: 0.42, sh: 0.76, armX: 0.2,  leg: 0.16, arm: 0.06, rate: 0.5, bob: 0.012, sway: 0.008, hover: 0,    hem: 0.015 } },
  vesperine:{ h: 4.5,  glow: 1.6, lit: 1.15, gait: { hip: 0.45, sh: 0.76, armX: 0.14, leg: 0,    arm: 0.08, rate: 0.45, bob: 0,    sway: 0.008, hover: 0.012, hem: 0.025 } },
  // Update 13: the act foes and the bosses of Acts II–VI
  siren:    { h: 2.0,  glow: 1.5, gait: { hip: 0.5,  sh: 0.74, armX: 0.12, leg: 0,    arm: 0.14, rate: 0.8, bob: 0,     sway: 0.015, hover: 0.04,  hem: 0.04 } },
  thornback:{ h: 1.55, glow: 1.4, yaw: -Math.PI / 2, gait: { hip: 0.42, sh: 0.72, armX: 0.18, leg: 0.34, arm: 0.3,  rate: 1.4, bob: 0.025, sway: 0.02,  hover: 0,     hem: 0 } },
  rat:      { h: 0.8,  glow: 1.6, yaw: -Math.PI * 0.75, gait: { hip: 0.42, sh: 0.7,  armX: 0.12, leg: 0.42, arm: 0.42, rate: 2.6, bob: 0.03,  sway: 0.02,  hover: 0,     hem: 0 } },
  caller:   { h: 2.15, glow: 1.5, gait: { hip: 0.44, sh: 0.74, armX: 0.14, leg: 0.16, arm: 0.1,  rate: 1.0, bob: 0.012, sway: 0.02,  hover: 0,     hem: 0.035 } },
  stalker:  { h: 2.1,  glow: 1.8, gait: { hip: 0.46, sh: 0.76, armX: 0.14, leg: 0.4,  arm: 0.3,  rate: 1.6, bob: 0.025, sway: 0.03,  hover: 0,     hem: 0 } },
  morwenna: { h: 4.8,  glow: 1.8, lit: 1.2, gait: { hip: 0.42, sh: 0.74, armX: 0.16, leg: 0,    arm: 0.1,  rate: 0.5, bob: 0,     sway: 0.012, hover: 0.015, hem: 0.02 } },
  gorrath:  { h: 5.0,  glow: 1.8, lit: 1.3, gait: { hip: 0.4,  sh: 0.76, armX: 0.2,  leg: 0.2,  arm: 0.12, rate: 0.5, bob: 0.015, sway: 0.015, hover: 0,     hem: 0 } },
  mire:     { h: 4.4,  glow: 1.8, lit: 1.15, gait: { hip: 0.4, sh: 0.72, armX: 0.2,  leg: 0,    arm: 0.1,  rate: 0.45, bob: 0,    sway: 0.012, hover: 0.01,  hem: 0.025 } },
  kaelthar: { h: 5.0,  glow: 2.0, lit: 1.5, gait: { hip: 0.42, sh: 0.76, armX: 0.2,  leg: 0.16, arm: 0.06, rate: 0.5, bob: 0.012, sway: 0.008, hover: 0,     hem: 0 } },
  nihl:     { h: 5.2,  glow: 1.8, lit: 1.4, gait: { hip: 0.45, sh: 0.76, armX: 0.14, leg: 0,    arm: 0.08, rate: 0.45, bob: 0,    sway: 0.008, hover: 0.015, hem: 0.03 } },
};
export const FOE_IDS = Object.keys(FOES);

const cache = new Map();

/** True when a painted model exists for `id`. */
export const hasFoeModel = (id) => !!(FOES[id] && GLB[id] && TEX[id]);

/** The ready model for `id` ({ geometry, map, h, glow, gait }), or null while it loads / when there is none. */
export function foeModel(id) {
  const c = cache.get(id);
  return c && c.ready ? c.ready : null;
}

/** The z of the body at height y (the mean z of the torso's vertices in a thin slab), so a hunched foe's legs and arms
 *  swing about its own hips and shoulders rather than the middle of its bounding box. */
function bodyZ(g, y, armX, slab) {
  const P = g.attributes.position;
  let sum = 0, n = 0;
  for (let i = 0; i < P.count; i++) {
    if (Math.abs(P.getY(i) - y) > slab || Math.abs(P.getX(i)) > armX) continue;
    sum += P.getZ(i); n++;
  }
  return n ? sum / n : 0;
}

/** Loads (once) and resolves the model for `id`, or null when there is none or it fails (the caller keeps its
 *  fallback). The geometry stands on the ground, centred, facing +Z, `h` tall. */
export function loadFoeModel(id) {
  if (!hasFoeModel(id)) return Promise.resolve(null);
  let c = cache.get(id);
  if (c) return c.promise;
  c = { ready: null };
  c.promise = (async () => {
    try {
      const [buf, map] = await Promise.all([loadBytes(GLB[id]), loadTexture(TEX[id])]);
      const gltf = await new GLTFLoader().parseAsync(buf, '');
      let mesh = null;
      gltf.scene.traverse((o) => { if (!mesh && o.isMesh) mesh = o; });
      if (!mesh) return null;
      gltf.scene.updateMatrixWorld(true);
      const F = FOES[id], g = floatGeometry(mesh);
      g.rotateY(-Math.PI / 2 + (F.yaw || 0)); // the generator's +X front to the game's +Z (`yaw`: a model sculpted side-on)
      g.computeBoundingBox();
      const b = g.boundingBox, s = F.h / Math.max(1e-3, b.max.y - b.min.y);
      g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
      g.scale(s, s, s);
      g.computeBoundingSphere();
      const G = F.gait, h = F.h, armX = G.armX * h;
      const gait = {
        a: new THREE.Vector4(G.hip * h, bodyZ(g, G.hip * h, armX, 0.05 * h), G.leg, G.rate),
        b: new THREE.Vector4(G.sh * h, bodyZ(g, G.sh * h, armX, 0.05 * h), G.arm, armX),
        c: new THREE.Vector4(G.bob * h, G.sway, G.hover * h, G.hem * h),
      };
      c.ready = { geometry: g, map, h, glow: F.glow, lit: F.lit || 1, gait };
      return c.ready;
    } catch (e) {
      console.warn('foe model', id, e);
      return null;
    }
  })();
  cache.set(id, c);
  return c.promise;
}

/** Starts loading every foe (at boot, so they are ready by the first run). */
export const loadFoeModels = () => Promise.all(FOE_IDS.map(loadFoeModel));

/** Points a character material's walk at a foe's gait. */
export function setGait(mat, m) {
  const u = mat.uniforms;
  u.uGaitA.value.copy(m.gait.a); u.uGaitB.value.copy(m.gait.b); u.uGaitC.value.copy(m.gait.c);
}
