// Painted 3D Shepherds: Higgsfield image-to-3D models built from each hero's turnaround sheet (scripts/hero-models.sh,
// docs/ART_AND_ADS.md §4). Loaded once per hero and shared; until a model is ready the procedural one stands in.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const files = (glob) => Object.fromEntries(Object.entries(glob).map(([p, u]) => [p.slice(p.lastIndexOf('/') + 1).replace(/\.\w+$/, ''), u]));
const GLB = files(import.meta.glob('../assets/models/*.glb', { eager: true, query: '?url', import: 'default' }));
const TEX = files(import.meta.glob('../assets/models/*.webp', { eager: true, query: '?url', import: 'default' }));

// Per model: height in model units after normalising, weapon included (close to the procedural heroes it replaces,
// 1.9 to 2.8 before the run's 1.25 scale), and how much bright, saturated paint glows. Every model comes out of the
// generator facing +X; it is turned to face +Z like the procedural ones.
const FIT = {
  vael: { h: 2.3, glow: 2.2 }, eclipse_vael: { h: 2.3, glow: 2.6 },
  nyx: { h: 2.6, glow: 1.6 }, seraphine: { h: 2.25, glow: 0.9 },
  liora: { h: 2.0, glow: 0.6 }, mordrake: { h: 2.7, glow: 2.0 },
};

const cache = new Map();

/** True when a painted model exists for `key` (a hero id, or a skin id such as 'eclipse_vael'). */
export const hasHeroModel = (key) => !!(GLB[key] && TEX[key]);

/** The ready model for `key` ({ geometry, map, glow }), or null while it is loading / when there is none. */
export function heroModel(key) {
  const c = cache.get(key);
  return c && c.ready ? c.ready : null;
}

async function bytes(url) {
  if (url.startsWith('data:')) { // single-file build: inlined, decoded here so no fetch (and no connect-src) is involved
    const b = atob(url.slice(url.indexOf(',') + 1)), a = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
    return a.buffer;
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error('model ' + r.status);
  return r.arrayBuffer();
}

function texture(url) {
  return new Promise((res, rej) => new THREE.TextureLoader().load(url, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = false; // glTF texture coordinates
    t.anisotropy = 4;
    res(t);
  }, undefined, rej));
}

/** Loads (once) and resolves the model for `key`, or null when there is none or it fails (the caller keeps its fallback). */
export function loadHeroModel(key) {
  if (!hasHeroModel(key)) return Promise.resolve(null);
  let c = cache.get(key);
  if (c) return c.promise;
  c = { ready: null };
  c.promise = (async () => {
    try {
      const [buf, map] = await Promise.all([bytes(GLB[key]), texture(TEX[key])]);
      const gltf = await new GLTFLoader().parseAsync(buf, '');
      let mesh = null;
      gltf.scene.traverse((o) => { if (!mesh && o.isMesh) mesh = o; });
      if (!mesh) return null;
      mesh.updateWorldMatrix(true, false);
      // the file is quantized (normalized 16-bit attributes): expand to floats before transforming
      const src = mesh.geometry, g = new THREE.BufferGeometry();
      for (const k of ['position', 'normal', 'uv']) {
        const a = src.attributes[k];
        if (!a) continue;
        const n = a.itemSize, arr = new Float32Array(a.count * n);
        for (let i = 0; i < a.count; i++) for (let j = 0; j < n; j++) arr[i * n + j] = a.getComponent(i, j);
        g.setAttribute(k, new THREE.BufferAttribute(arr, n));
      }
      if (src.index) g.setIndex(src.index.clone());
      g.applyMatrix4(mesh.matrixWorld);
      g.rotateY(-Math.PI / 2);
      g.computeBoundingBox();
      const b = g.boundingBox, fit = FIT[key] || { h: 1.9, glow: 1.5 }, s = fit.h / Math.max(1e-3, b.max.y - b.min.y);
      g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); // feet on the ground, centred
      g.scale(s, s, s);
      if (!g.attributes.normal) g.computeVertexNormals();
      g.computeBoundingBox(); g.computeBoundingSphere();
      src.dispose();
      c.ready = { geometry: g, map, glow: fit.glow };
      return c.ready;
    } catch (e) {
      console.warn('hero model', key, e);
      return null;
    }
  })();
  cache.set(key, c);
  return c.promise;
}
