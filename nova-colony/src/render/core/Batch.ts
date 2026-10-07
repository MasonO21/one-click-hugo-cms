/**
 * Batch — a growable InstancedMesh with a tiny immediate-mode API:
 *   batch.begin(); batch.push(matrix, color?); ... batch.end();
 * Instances written between begin/end are what gets drawn. Growing re-creates the InstancedMesh
 * (so never cache `batch.mesh` across frames). All batches disable frustum culling because the
 * geometry's bounding sphere says nothing about where instances are.
 */
import * as THREE from 'three';

const WHITE = new THREE.Color(1, 1, 1);

export class Batch {
  mesh!: THREE.InstancedMesh;
  private n = 0;
  private dirtyColor = false;
  private capacity: number;
  /** Number of leading instances considered static (kept across begin()/end() when using beginDynamic). */
  staticCount = 0;

  constructor(
    private readonly parent: THREE.Object3D,
    public geometry: THREE.BufferGeometry,
    private readonly material: THREE.Material | THREE.Material[],
    capacity = 16,
    private readonly opts: { color?: boolean; castShadow?: boolean; receiveShadow?: boolean; renderOrder?: number } = {},
  ) {
    this.capacity = Math.max(1, capacity);
    this.create();
  }

  private create(): void {
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, this.capacity);
    mesh.frustumCulled = false;
    mesh.castShadow = !!this.opts.castShadow;
    mesh.receiveShadow = !!this.opts.receiveShadow;
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
    this.geometry = geo;
    this.mesh.geometry = geo;
  }

  private ensure(cap: number): void {
    if (cap <= this.capacity) return;
    const old = this.mesh;
    const oldN = this.n;
    this.capacity = Math.max(cap, Math.ceil(this.capacity * 1.6));
    this.parent.remove(old);
    this.create();
    // copy existing instances
    this.mesh.instanceMatrix.array.set((old.instanceMatrix.array as Float32Array).subarray(0, oldN * 16));
    if (this.mesh.instanceColor && old.instanceColor) {
      (this.mesh.instanceColor.array as Float32Array).set((old.instanceColor.array as Float32Array).subarray(0, oldN * 3));
    }
    old.dispose();
  }

  begin(): void {
    this.n = 0;
  }

  /** Keep the first `staticCount` instances and append dynamic ones after them. */
  beginDynamic(): void {
    this.n = this.staticCount;
  }

  push(matrix: THREE.Matrix4, color?: THREE.Color): void {
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

  /** Overwrite one instance's matrix (wobble animations on otherwise static batches). */
  setMatrix(index: number, matrix: THREE.Matrix4): void {
    if (index < 0 || index >= this.n) return;
    matrix.toArray(this.mesh.instanceMatrix.array, index * 16);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.dirtyColor && this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
      this.dirtyColor = false;
    }
  }

  /** Mark everything written so far as static. */
  freeze(): void {
    this.staticCount = this.n;
  }

  setVisible(v: boolean): void {
    this.mesh.visible = v;
  }

  dispose(): void {
    this.parent.remove(this.mesh);
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
