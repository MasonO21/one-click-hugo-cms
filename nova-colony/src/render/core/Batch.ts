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
 *
 * Uploads: only what changed goes to the GPU. end() queues the written instances' matrices (not the whole capacity:
 * a particle pool of 720 with 40 live sparks sends 40 matrices), colours and fades only where a value changed, and
 * an empty batch sends nothing. setMatrix / setColor / setFade queue just the touched instances. Each attribute has
 * one persistent update range that grows until three.js uploads and clears it, so this allocates nothing per frame.
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

/** A pending GPU update range of one attribute, in array elements (BufferAttribute.updateRanges entry). */
interface Range {
  start: number;
  count: number;
}

/**
 * Queue elements [start, end) of `attr` for upload on its next render. `range` is the attribute's own persistent
 * entry: still queued (three.js clears the list after each upload) it grows to cover both spans, else it is reset and
 * queued again. A range never shrinks before it is uploaded, so writes made while the mesh is hidden or culled are
 * still sent when it next draws.
 */
export function queueRange(attr: THREE.BufferAttribute, range: Range, start: number, end: number): void {
  if (end <= start) return;
  const rs = attr.updateRanges as Range[];
  if (rs.includes(range)) {
    const e = Math.max(range.start + range.count, end);
    range.start = Math.min(range.start, start);
    range.count = e - range.start;
  } else {
    range.start = start;
    range.count = end - start;
    rs.push(range);
  }
  attr.needsUpdate = true;
}

export class Batch {
  mesh!: THREE.InstancedMesh;
  private n = 0;
  /** Instances whose colour / fade changed since the last end(): [lo, hi). */
  private colorLo = Infinity;
  private colorHi = 0;
  private fadeLo = Infinity;
  private fadeHi = 0;
  private readonly matrixRange: Range = { start: 0, count: 0 };
  private readonly colorRange: Range = { start: 0, count: 0 };
  private readonly fadeRange: Range = { start: 0, count: 0 };
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
    // the instances carry the transforms; the mesh itself never moves: no matrix compose per frame (its world matrix
    // is still taken from the parent once, on the next render)
    mesh.matrixAutoUpdate = false;
    mesh.matrixWorldNeedsUpdate = true;
    mesh.frustumCulled = false;
    mesh.castShadow = !!this.opts.castShadow;
    mesh.receiveShadow = !!this.opts.receiveShadow;
    // the sun is a DirectionalLight; point lights never cast here, so no customDistanceMaterial
    if (mesh.castShadow && this.opts.depthMaterial) mesh.customDepthMaterial = this.opts.depthMaterial;
    mesh.renderOrder = this.opts.renderOrder ?? 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // every batch carries instance colours (white when it has no `color` option): batches with and without them
    // share materials, and three.js re-resolves a material's program each time consecutive draws switch between the
    // two (a getParameters + cache-key build, ~3 KB of garbage, several times a frame). White changes nothing on screen.
    const colors = new Float32Array(this.capacity * 3).fill(1);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
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
    // the new attributes get fresh GPU buffers, uploaded whole on first use: nothing is pending against them
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
    if (ic && this.writeColor(ic.array as Float32Array, i, this.opts.color ? color ?? WHITE : WHITE)) {
      if (i < this.colorLo) this.colorLo = i;
      if (i >= this.colorHi) this.colorHi = i + 1;
    }
    const fa = this.fadeAttr;
    if (fa) {
      const a = fa.array as Float32Array;
      const f = Math.fround(fade);
      if (a[i] !== f) {
        a[i] = f;
        if (i < this.fadeLo) this.fadeLo = i;
        if (i >= this.fadeHi) this.fadeHi = i + 1;
      }
    }
    this.n = i + 1;
  }

  /** Write one instance colour; true when it changed (compared as stored, in float32). */
  private writeColor(a: Float32Array, i: number, c: THREE.Color): boolean {
    const j = i * 3;
    const r = Math.fround(c.r);
    const g = Math.fround(c.g);
    const b = Math.fround(c.b);
    if (a[j] === r && a[j + 1] === g && a[j + 2] === b) return false;
    a[j] = r;
    a[j + 1] = g;
    a[j + 2] = b;
    return true;
  }

  /** Overwrite one instance's color without touching matrices (hit flashes). */
  setColor(index: number, color: THREE.Color): void {
    const ic = this.mesh.instanceColor;
    if (!ic || !this.opts.color || index < 0 || index >= this.n) return;
    if (this.writeColor(ic.array as Float32Array, index, color)) queueRange(ic, this.colorRange, index * 3, index * 3 + 3);
  }

  /** Overwrite one instance's fade (0 solid .. 1 fully dithered away). */
  setFade(index: number, fade: number): void {
    const fa = this.fadeAttr;
    if (!fa || index < 0 || index >= this.n) return;
    const a = fa.array as Float32Array;
    const f = Math.fround(fade);
    if (a[index] === f) return;
    a[index] = f;
    queueRange(fa, this.fadeRange, index, index + 1);
  }

  /** Overwrite one instance's matrix (wobble animations on otherwise static batches). */
  setMatrix(index: number, matrix: THREE.Matrix4): void {
    if (index < 0 || index >= this.n) return;
    matrix.toArray(this.mesh.instanceMatrix.array, index * 16);
    queueRange(this.mesh.instanceMatrix, this.matrixRange, index * 16, index * 16 + 16);
  }

  end(): void {
    const mesh = this.mesh;
    const n = this.n;
    mesh.count = n;
    // an empty batch draws nothing: its stale buffers can wait for the next write
    if (n > 0) queueRange(mesh.instanceMatrix, this.matrixRange, 0, n * 16);
    if (mesh.instanceColor && this.colorHi > this.colorLo) queueRange(mesh.instanceColor, this.colorRange, this.colorLo * 3, Math.min(this.colorHi, n) * 3);
    if (this.fadeAttr && this.fadeHi > this.fadeLo) queueRange(this.fadeAttr, this.fadeRange, this.fadeLo, Math.min(this.fadeHi, n));
    this.colorLo = this.fadeLo = Infinity;
    this.colorHi = this.fadeHi = 0;
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
