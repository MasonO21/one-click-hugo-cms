// Painted 3D Shepherds: Higgsfield image-to-3D models built from each hero's turnaround sheet, auto-rigged and given a
// run and an idle (scripts/hero-models.sh, docs/ART_AND_ADS.md §4). Loaded once per hero and shared; every user gets
// its own skeleton and mixer (HeroRig). Until a model is ready the procedural one stands in.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { assetFiles, loadBytes, loadTexture } from './assets.js';

const GLB = assetFiles(import.meta.glob('../assets/models/*.glb', { eager: true, query: '?url', import: 'default' }));
const TEX = assetFiles(import.meta.glob('../assets/models/*.webp', { eager: true, query: '?url', import: 'default' }));

// Per model: height in model units after normalising, weapon included (close to the procedural heroes it replaces,
// 1.9 to 2.8 before the run's 1.25 scale), and how much bright, saturated paint glows. The models face +Z like the
// procedural ones.
const FIT = {
  vael: { h: 2.3, glow: 2.2 }, eclipse_vael: { h: 2.3, glow: 2.6 },
  nyx: { h: 2.6, glow: 1.6 }, seraphine: { h: 2.25, glow: 0.9 },
  liora: { h: 2.0, glow: 0.6 }, mordrake: { h: 2.7, glow: 2.0 },
  grimsby: { h: 2.45, glow: 1.6 }, osric: { h: 2.6, glow: 0.4 },
  isolde: { h: 2.35, glow: 1.0 },
};

const cache = new Map();

/** True when a painted model exists for `key` (a hero id, or a skin id such as 'eclipse_vael'). */
export const hasHeroModel = (key) => !!(GLB[key] && TEX[key]);

/** The ready model for `key` ({ geometry, map, glow, rig }), or null while it is loading / when there is none.
 *  `geometry` is the bind pose as a plain normalised mesh (Nyx's dash afterimages; the whole model if a file has no
 *  rig); `rig` = { scene, clips: { run, idle }, s, offset } feeds HeroRig. */
export function heroModel(key) {
  const c = cache.get(key);
  return c && c.ready ? c.ready : null;
}

/** The model's rest (bind) pose as a plain float geometry in scene space: the file is quantized (normalized 16-bit
 *  attributes, its dequantization folded into the skin's bind matrices), so a skinned mesh is posed through its
 *  skeleton; normals ride along as short offsets. */
function bindPose(mesh) {
  const src = mesh.geometry, g = new THREE.BufferGeometry(), P = src.attributes.position, N = src.attributes.normal;
  const n = P.count, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), v = new THREE.Vector3(), w = new THREE.Vector3();
  if (!src.boundingSphere) src.computeBoundingSphere();
  const eps = src.boundingSphere.radius * 1e-3, d = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(P, i);
    if (mesh.isSkinnedMesh) mesh.applyBoneTransform(i, v);
    v.applyMatrix4(mesh.matrixWorld).toArray(pos, i * 3);
    if (!N) continue;
    w.fromBufferAttribute(P, i).addScaledVector(d.fromBufferAttribute(N, i), eps);
    if (mesh.isSkinnedMesh) mesh.applyBoneTransform(i, w);
    w.applyMatrix4(mesh.matrixWorld).sub(v).normalize().toArray(nor, i * 3);
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (N) g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  else g.computeVertexNormals();
  const uv = src.attributes.uv;
  if (uv) {
    const a = new Float32Array(uv.count * 2);
    for (let i = 0; i < uv.count; i++) { a[i * 2] = uv.getX(i); a[i * 2 + 1] = uv.getY(i); }
    g.setAttribute('uv', new THREE.BufferAttribute(a, 2));
  }
  if (src.index) g.setIndex(src.index.clone());
  return g;
}

/** Loads (once) and resolves the model for `key`, or null when there is none or it fails (the caller keeps its fallback). */
export function loadHeroModel(key) {
  if (!hasHeroModel(key)) return Promise.resolve(null);
  let c = cache.get(key);
  if (c) return c.promise;
  c = { ready: null };
  c.promise = (async () => {
    try {
      const [buf, map] = await Promise.all([loadBytes(GLB[key]), loadTexture(TEX[key])]);
      const gltf = await new GLTFLoader().parseAsync(buf, '');
      let mesh = null;
      gltf.scene.traverse((o) => { if (!mesh && o.isMesh) mesh = o; });
      if (!mesh) return null;
      gltf.scene.updateMatrixWorld(true);
      const g = bindPose(mesh);
      g.computeBoundingBox();
      const b = g.boundingBox, fit = FIT[key] || { h: 1.9, glow: 1.5 }, s = fit.h / Math.max(1e-3, b.max.y - b.min.y);
      const offset = new THREE.Vector3(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); // feet on the ground, centred
      g.translate(offset.x, offset.y, offset.z);
      g.scale(s, s, s);
      g.computeBoundingBox(); g.computeBoundingSphere();
      const clips = {};
      for (const a of gltf.animations) clips[a.name] = a;
      const rig = mesh.isSkinnedMesh && clips.run && clips.idle ? { scene: gltf.scene, clips, s, offset: offset.multiplyScalar(s) } : null;
      if (!rig) mesh.geometry.dispose();
      c.ready = { geometry: g, map, glow: fit.glow, rig };
      return c.ready;
    } catch (e) {
      console.warn('hero model', key, e);
      return null;
    }
  })();
  cache.set(key, c);
  return c.promise;
}

// The run covers about 1.05 body heights a second at its own pace; it is sped up to the hero's ground speed (the
// stride matches up to RUN_MAX, beyond which the feet slide a little rather than spin).
const RUN_PACE = 1.05, RUN_MIN = 0.55, RUN_MAX = 1.7, BLEND = 0.16;
const SIZE = new THREE.Vector3();

/** One animated copy of a rigged hero: its own skeleton and mixer (the geometry and clips stay shared). `root` is
 *  normalised like the shared `geometry` (feet on the ground at the origin, facing +Z). */
export class HeroRig {
  constructor(m, material) {
    const r = m.rig;
    this.root = new THREE.Group();
    const fit = new THREE.Group();
    fit.scale.setScalar(r.s);
    fit.position.copy(r.offset);
    this.model = cloneSkinned(r.scene); // shares the geometry; the file's own material is never drawn
    fit.add(this.model);
    this.root.add(fit);
    this.mesh = null;
    this.model.traverse((o) => { if (o.isMesh) { o.material = material; this.mesh = o; } });
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    this.height = m.geometry.boundingBox.getSize(SIZE).y;
    this.mixer = new THREE.AnimationMixer(this.model);
    this.run = this.mixer.clipAction(r.clips.run);
    this.idle = this.mixer.clipAction(r.clips.idle);
    this.run.play(); this.idle.play();
    this.idle.time = Math.random() * r.clips.idle.duration; // two copies never breathe in step
    this.w = 0; // the run's share of the blend
    this.run.setEffectiveWeight(0);
    this.mixer.update(0);
  }

  /** Advances the pose: `speed` (world units a second; `scale` = the root's world scale) blends idle into the run and
   *  paces the stride. */
  update(dt, speed = 0, scale = 1) {
    const want = speed > 0.5 ? 1 : 0;
    this.w += Math.max(-dt / BLEND, Math.min(dt / BLEND, want - this.w));
    this.run.setEffectiveWeight(this.w);
    this.idle.setEffectiveWeight(1 - this.w);
    if (speed > 0.5) this.run.timeScale = THREE.MathUtils.clamp(speed / (RUN_PACE * this.height * scale), RUN_MIN, RUN_MAX);
    this.mixer.update(dt);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    if (this.mesh && this.mesh.skeleton) this.mesh.skeleton.dispose();
    this.root.removeFromParent();
  }
}
