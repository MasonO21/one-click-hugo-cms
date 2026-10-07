// Loading helpers for the painted assets (hero models, chapter floors and props). The single-file build inlines them
// as data: URIs; they are decoded here so no fetch (and no connect-src) is involved.
import * as THREE from 'three';

/** { name: url } from an import.meta.glob of asset URLs, keyed by file name without extension. */
export const assetFiles = (glob) => Object.fromEntries(Object.entries(glob).map(([p, u]) => [p.slice(p.lastIndexOf('/') + 1).replace(/\.\w+$/, ''), u]));

/** The file's bytes. */
export async function loadBytes(url) {
  if (url.startsWith('data:')) {
    const b = atob(url.slice(url.indexOf(',') + 1)), a = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
    return a.buffer;
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error('asset ' + r.status);
  return r.arrayBuffer();
}

/** A colour texture for a glTF model's UVs (or, with flipY, an ordinary image). */
export function loadTexture(url, { flipY = false, anisotropy = 4, repeat = false } = {}) {
  return new Promise((res, rej) => new THREE.TextureLoader().load(url, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = flipY;
    t.anisotropy = anisotropy;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    res(t);
  }, undefined, rej));
}

/** A quantized (normalized 16-bit) mesh's position/normal/uv as plain floats, in scene space (the node transforms
 *  applied); `dispose` frees the source geometry. */
export function floatGeometry(mesh, dispose = true) {
  mesh.updateWorldMatrix(true, false);
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
  if (!g.attributes.normal) g.computeVertexNormals();
  if (dispose) src.dispose();
  return g;
}
