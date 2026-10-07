/**
 * Batch — a growable InstancedMesh with a tiny immediate-mode API:
 *   batch.begin(); batch.push(matrix, color?, fade?); ... batch.end();
 * Instances written between begin/end are what gets drawn. Growing re-creates the InstancedMesh
 * (so never cache `batch.mesh` across frames).
 *
 * Culling: by default batches disable frustum culling because the geometry's bounding sphere says
 * nothing about where instances are. Spatially compact batches (nature chunks, building bodies) pass
 * `cull: true`: end() then computes the union bounding sphere of the written instances so three.js
 * can reject the whole batch when it is off screen.
 *
 * Fade: `fade: true` adds a per-instance `aFade` attribute (0 solid .. 1 gone) read by the
 * fade-capable lit material (screen-door dither) — used to see through buildings that stand between
 * the camera and the player. The batch then owns a thin geometry wrapper sharing the model's vertex
 * buffers, so the attribute never leaks into other users of the same geometry (ghost previews).
 * `depthMaterial` gives such a batch a matching shadow-pass material so its shadow dithers too.
 */
import * as THREE from 'three';

const WHITE = new THREE.Color(1, 1, 1);

export interface BatchOpts {
  color?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  renderOrder?: number;
  /** Compute a per-batch bounding sphere in end() and let three.js frustum-cull the whole batch. */
  cull?: boolean;
  /** Per-instance fade attribute (needs the fade-capable material). */
  fade?: boolean;
  /**
   * Shadow-pass material for shadow-casting batches whose surface material dithers (fade / LOD
   * variants): keeps the shadow in step with the surface instead of a solid shadow of an invisible
   * caster. Omit it and three uses its shared (discard-free) depth material.
   */
  depthMaterial?: THREE.Material;
  /** Mesh name (dev stats / scene inspection). */
  name?: string;
}

export class Batch {
  mesh!: THREE.InstancedMesh;
  private n = 0;
  private dirtyColor = false;
  private dirtyFade = false;
  private capacity: number;
  /** Geometry actually bound to the mesh (the model geometry, or a wrapper carrying aFade). */
  private bound!: THREE.BufferGeometry;
  private fadeAttr: THREE.InstancedBufferAttribute | null = null;
  /** Number of leading instances considered static (kept across begin()/end() when using beginDynamic). */
  staticCount = 0;

  constructor(
    private readonly parent: THREE.Object3D,
    public geometry: THREE.BufferGeometry,
    private readonly material: THREE.Material | THREE.Material[],
    capacity = 16,
    private readonly opts: BatchOpts = {},
  ) {
    this.capacity = Math.max(1, capacity);
    this.create();
  }

  private wrap(geo: THREE.BufferGeometry): THREE.BufferGeometry {
    if (!this.opts.fade) {
      this.fadeAttr = null;
      return geo;
    }
    // alias the vertex arrays through fresh BufferAttribute objects: three keys GPU buffers (and VAO
    // caches) per attribute object, so the wrapper owns its own buffers and can be disposed without
    // pulling the rug from under other meshes drawing the same model geometry
    const w = new THREE.BufferGeometry();
    for (const name of Object.keys(geo.attributes)) {
      const a = geo.attributes[name] as THREE.BufferAttribute;
      w.setAttribute(name, new THREE.BufferAttribute(a.array, a.itemSize, a.normalized));
    }
    if (geo.index) w.setIndex(new THREE.BufferAttribute(geo.index.array, 1));
    w.boundingSphere = geo.boundingSphere ? geo.boundingSphere.clone() : null;
    w.boundingBox = geo.boundingBox ? geo.boundingBox.clone() : null;
    this.fadeAttr = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity), 1);
    this.fadeAttr.setUsage(THREE.DynamicDrawUsage);
    w.setAttribute('aFade', this.fadeAttr);
    return w;
  }

  private create(): void {
    this.bound = this.wrap(this.geometry);
    const mesh = new THREE.InstancedMesh(this.bound, this.material, this.capacity);
    if (this.opts.name) mesh.name = this.opts.name;
    mesh.frustumCulled = false;
    mesh.castShadow = !!this.opts.castShadow;
    mesh.receiveShadow = !!this.opts.receiveShadow;
    // the sun is a DirectionalLight; point lights never cast here, so no customDistanceMaterial
    if (mesh.castShadow && this.opts.depthMaterial) mesh.customDepthMaterial = this.opts.depthMaterial;
    mesh.renderOrder = this.opts.renderOrder ?? 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (this.opts.color) {
      const colors = new Float32Array(this.capacity * 3).fill(1);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    mesh.count = 0;
    this.mesh = mesh;
    this.parent.add(mesh);
  }

  get count(): number {
    return this.n;
  }

  /** Swap geometry (e.g. LOD / rebuild). */
  setGeometry(geo: THREE.BufferGeometry): void {
    if (geo === this.geometry) return;
    this.geometry = geo;
    const oldFade = this.fadeAttr;
    if (this.opts.fade) {
      this.bound.dispose(); // wrapper only: the shared vertex buffers belong to the model cache
      this.bound = this.wrap(geo);
      if (oldFade && this.fadeAttr) (this.fadeAttr.array as Float32Array).set(oldFade.array as Float32Array);
    } else this.bound = geo;
    this.mesh.geometry = this.bound;
    if (this.opts.cull) this.mesh.boundingSphere = null;
  }

  private ensure(cap: number): void {
    if (cap <= this.capacity) return;
    const old = this.mesh;
    const oldFade = this.fadeAttr;
    const oldBound = this.bound;
    const oldN = this.n;
    this.capacity = Math.max(cap, Math.ceil(this.capacity * 1.6));
    this.parent.remove(old);
    this.create();
    if (oldBound !== this.geometry) oldBound.dispose(); // our own wrapper + its GPU buffers only
    // copy existing instances
    this.mesh.instanceMatrix.array.set((old.instanceMatrix.array as Float32Array).subarray(0, oldN * 16));
    if (this.mesh.instanceColor && old.instanceColor) {
      (this.mesh.instanceColor.array as Float32Array).set((old.instanceColor.array as Float32Array).subarray(0, oldN * 3));
    }
    if (this.fadeAttr && oldFade) (this.fadeAttr.array as Float32Array).set((oldFade.array as Float32Array).subarray(0, oldN));
    old.dispose();
  }

  begin(): void {
    this.n = 0;
  }

  /** Keep the first `staticCount` instances and append dynamic ones after them. */
  beginDynamic(): void {
    this.n = this.staticCount;
  }

  push(matrix: THREE.Matrix4, color?: THREE.Color, fade = 0): void {
    const i = this.n;
    if (i + 1 > this.capacity) this.ensure(i + 1);
    matrix.toArray(this.mesh.instanceMatrix.array, i * 16);
    const ic = this.mesh.instanceColor;
    if (ic) {
      const c = color ?? WHITE;
      const a = ic.array as Float32Array;
      a[i * 3] = c.r;
      a[i * 3 + 1] = c.g;
      a[i * 3 + 2] = c.b;
      this.dirtyColor = true;
    }
    const fa = this.fadeAttr;
    if (fa) {
      const a = fa.array as Float32Array;
      if (a[i] !== fade) {
        a[i] = fade;
        this.dirtyFade = true;
      }
    }
    this.n = i + 1;
  }

  /** Overwrite one instance's color without touching matrices (hit flashes). */
  setColor(index: number, color: THREE.Color): void {
    const ic = this.mesh.instanceColor;
    if (!ic || index < 0 || index >= this.n) return;
    const a = ic.array as Float32Array;
    a[index * 3] = color.r;
    a[index * 3 + 1] = color.g;
    a[index * 3 + 2] = color.b;
    ic.needsUpdate = true;
  }

  /** Overwrite one instance's fade (0 solid .. 1 fully dithered away). */
  setFade(index: number, fade: number): void {
    const fa = this.fadeAttr;
    if (!fa || index < 0 || index >= this.n) return;
    const a = fa.array as Float32Array;
    if (a[index] === fade) return;
    a[index] = fade;
    fa.needsUpdate = true;
  }

  /** Overwrite one instance's matrix (wobble animations on otherwise static batches). */
  setMatrix(index: number, matrix: THREE.Matrix4): void {
    if (index < 0 || index >= this.n) return;
    matrix.toArray(this.mesh.instanceMatrix.array, index * 16);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  end(): void {
    const mesh = this.mesh;
    mesh.count = this.n;
    mesh.instanceMatrix.needsUpdate = true;
    if (this.dirtyColor && mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
      this.dirtyColor = false;
    }
    if (this.dirtyFade && this.fadeAttr) {
      this.fadeAttr.needsUpdate = true;
      this.dirtyFade = false;
    }
    if (this.opts.cull) {
      if (this.n > 0) {
        mesh.computeBoundingSphere();
        mesh.frustumCulled = true;
      } else mesh.frustumCulled = false;
    }
  }

  /** Mark everything written so far as static. */
  freeze(): void {
    this.staticCount = this.n;
  }

  setVisible(v: boolean): void {
    this.mesh.visible = v;
  }

  get visible(): boolean {
    return this.mesh.visible;
  }

  dispose(): void {
    this.parent.remove(this.mesh);
    if (this.bound !== this.geometry) this.bound.dispose();
    this.mesh.dispose();
  }
}

/** Reusable scratch objects for matrix composition in hot loops. */
export const scratch = {
  m: new THREE.Matrix4(),
  m2: new THREE.Matrix4(),
  q: new THREE.Quaternion(),
  q2: new THREE.Quaternion(),
  e: new THREE.Euler(),
  p: new THREE.Vector3(),
  s: new THREE.Vector3(1, 1, 1),
  v: new THREE.Vector3(),
  v2: new THREE.Vector3(),
  c: new THREE.Color(),
  c2: new THREE.Color(),
};

const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const Y = new THREE.Vector3(0, 1, 0);

/** Compose a TRS matrix with a yaw-only rotation — the common case. */
export function composeYaw(out: THREE.Matrix4, x: number, y: number, z: number, yaw: number, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  _p.set(x, y, z);
  _q.setFromAxisAngle(Y, yaw);
  _s.set(sx, sy, sz);
  return out.compose(_p, _q, _s);
}

/** Compose a TRS matrix from Euler angles. */
export function composeEuler(out: THREE.Matrix4, x: number, y: number, z: number, rx: number, ry: number, rz: number, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  _p.set(x, y, z);
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _s.set(sx, sy, sz);
  return out.compose(_p, _q, _s);
}

const Z = new THREE.Vector3(0, 0, 1);
const _dir = new THREE.Vector3();
/** Compose a matrix at (x,y,z) with +Z pointing along direction (dx,dy,dz). */
export function composeAlong(out: THREE.Matrix4, x: number, y: number, z: number, dx: number, dy: number, dz: number, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  _p.set(x, y, z);
  _dir.set(dx, dy, dz);
  const len = _dir.length();
  if (len < 1e-6) _dir.set(0, 0, 1);
  else _dir.divideScalar(len);
  _q.setFromUnitVectors(Z, _dir);
  _s.set(sx, sy, sz);
  return out.compose(_p, _q, _s);
}
