/**
 * GeoBuilder — accumulates flat-shaded primitives with baked vertex colors into ONE merged
 * BufferGeometry with material groups (lit / glow / glass). Every procedural model in the game is
 * built with it so a whole building, tree or alien renders in 1–3 draw calls and can be instanced.
 */
import * as THREE from 'three';

export const SLOT_LIT = 0;
export const SLOT_GLOW = 1;
export const SLOT_GLASS = 2;
export const SLOT_COUNT = 3;

export interface PrimOpts {
  /** Material slot (default lit). */
  slot?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  /** Per-face brightness jitter amplitude (0.04 = ±4%) for a hand-painted low-poly look. */
  shade?: number;
  /** Scale applied after rotation (non-uniform ok). */
  sx?: number;
  sy?: number;
  sz?: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _n = new THREE.Matrix3();
const _v = new THREE.Vector3();

export class GeoBuilder {
  private pos: number[][] = [[], [], []];
  private nor: number[][] = [[], [], []];
  private col: number[][] = [[], [], []];
  private seed: number;

  constructor(seed = 7) {
    this.seed = seed | 0 || 7;
  }

  /** Deterministic pseudo random in [0,1) (model details must not flicker between rebuilds). */
  rnd(): number {
    this.seed = (Math.imul(this.seed, 1103515245) + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  get isEmpty(): boolean {
    return this.pos[0].length + this.pos[1].length + this.pos[2].length === 0;
  }

  /** Append any geometry (made non-indexed = flat shaded) with a uniform color. The geometry is consumed. */
  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, x = 0, y = 0, z = 0, opts: PrimOpts = {}): this {
    const g = geo.index ? geo.toNonIndexed() : geo;
    _e.set(opts.rx ?? 0, opts.ry ?? 0, opts.rz ?? 0);
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    _s.set(opts.sx ?? 1, opts.sy ?? 1, opts.sz ?? 1);
    _m.compose(_p, _q, _s);
    _n.getNormalMatrix(_m);
    const slot = opts.slot ?? SLOT_LIT;
    const P = g.attributes.position as THREE.BufferAttribute;
    const N = g.attributes.normal as THREE.BufferAttribute;
    _c.set(color);
    const n = P.count;
    const posArr = this.pos[slot];
    const norArr = this.nor[slot];
    const colArr = this.col[slot];
    const shade = opts.shade ?? 0;
    let f = 1;
    for (let i = 0; i < n; i++) {
      _v.set(P.getX(i), P.getY(i), P.getZ(i)).applyMatrix4(_m);
      posArr.push(_v.x, _v.y, _v.z);
      _v.set(N.getX(i), N.getY(i), N.getZ(i)).applyMatrix3(_n).normalize();
      norArr.push(_v.x, _v.y, _v.z);
      if (shade && i % 6 === 0) f = 1 + (this.rnd() * 2 - 1) * shade;
      colArr.push(_c.r * f, _c.g * f, _c.b * f);
    }
    if (g !== geo) g.dispose();
    geo.dispose();
    return this;
  }

  box(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, opts?: PrimOpts): this {
    return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, opts);
  }

  /** Cylinder along Y centred at (x,y,z). */
  cyl(rTop: number, rBot: number, h: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, seg = 8, opts?: PrimOpts): this {
    return this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg), color, x, y, z, opts);
  }

  cone(r: number, h: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, seg = 8, opts?: PrimOpts): this {
    return this.add(new THREE.ConeGeometry(r, h, seg), color, x, y, z, opts);
  }

  sphere(r: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, seg = 7, opts?: PrimOpts): this {
    return this.add(new THREE.SphereGeometry(r, seg, Math.max(4, seg - 2)), color, x, y, z, opts);
  }

  /** Square pyramid with base w x d (approx) and height h, base centred at (x,y,z). */
  pyramid(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, opts: PrimOpts = {}): this {
    const geo = new THREE.ConeGeometry(Math.SQRT1_2, h, 4);
    return this.add(geo, color, x, y + h / 2, z, { ...opts, ry: (opts.ry ?? 0) + Math.PI / 4, sx: w, sz: d });
  }

  /** Triangular prism (gable roof): base w (x) by d (z), ridge along Z at height h above the base plane y. */
  wedge(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, opts?: PrimOpts): this {
    const hw = w / 2;
    const hd = d / 2;
    // prettier-ignore
    const v = [
      // front triangle (z = +hd)
      -hw, 0, hd,  hw, 0, hd,  0, h, hd,
      // back triangle (z = -hd)
      hw, 0, -hd,  -hw, 0, -hd,  0, h, -hd,
      // left slope
      -hw, 0, -hd,  -hw, 0, hd,  0, h, hd,
      -hw, 0, -hd,  0, h, hd,  0, h, -hd,
      // right slope
      hw, 0, hd,  hw, 0, -hd,  0, h, -hd,
      hw, 0, hd,  0, h, -hd,  0, h, hd,
      // bottom
      -hw, 0, hd,  -hw, 0, -hd,  hw, 0, -hd,
      -hw, 0, hd,  hw, 0, -hd,  hw, 0, hd,
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    geo.computeVertexNormals();
    return this.add(geo, color, x, y, z, opts);
  }

  torus(r: number, tube: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, seg = 10, tseg = 6, opts?: PrimOpts): this {
    return this.add(new THREE.TorusGeometry(r, tube, tseg, seg), color, x, y, z, opts);
  }

  /** Flat quad in the XZ plane (facing +Y). */
  quad(w: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, opts: PrimOpts = {}): this {
    return this.add(new THREE.PlaneGeometry(w, d), color, x, y, z, { ...opts, rx: (opts.rx ?? 0) - Math.PI / 2 });
  }

  /** Low-poly tetra/octahedron crystal shard. */
  shard(r: number, h: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, opts?: PrimOpts): this {
    const geo = new THREE.OctahedronGeometry(r, 0);
    return this.add(geo, color, x, y, z, { ...opts, sy: (opts?.sy ?? 1) * (h / r) });
  }

  /**
   * Merge accumulated primitives into ONE geometry. Material slots are baked into the `aSlot`
   * vertex attribute (0 lit, 1 glow, 2 glass) and resolved by the shared slot-aware material, so a
   * whole model is a single draw call.
   */
  build(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    let total = 0;
    for (let s = 0; s < SLOT_COUNT; s++) total += this.pos[s].length / 3;
    const pos = new Float32Array(total * 3);
    const nor = new Float32Array(total * 3);
    const col = new Float32Array(total * 3);
    const slot = new Float32Array(total);
    let off = 0;
    for (let s = 0; s < SLOT_COUNT; s++) {
      const n = this.pos[s].length / 3;
      if (n === 0) continue;
      pos.set(this.pos[s], off * 3);
      nor.set(this.nor[s], off * 3);
      col.set(this.col[s], off * 3);
      slot.fill(s, off, off + n);
      off += n;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSlot', new THREE.BufferAttribute(slot, 1));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }
}

/** Empty placeholder geometry (never rendered but keeps code paths uniform). */
export function emptyGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(0), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(0), 3));
  g.setAttribute('aSlot', new THREE.BufferAttribute(new Float32Array(0), 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0.001);
  return g;
}

/**
 * Replicate a geometry (positions/normals/colors/slots) at several XZ offsets into one merged
 * geometry. Used for per-room roofs so each room is a single mesh with its own fade.
 */
export function mergeCopies(src: THREE.BufferGeometry, offsets: ArrayLike<number>, yOffset = 0): THREE.BufferGeometry {
  const n = offsets.length / 2;
  const P = src.attributes.position as THREE.BufferAttribute;
  const N = src.attributes.normal as THREE.BufferAttribute;
  const C = src.attributes.color as THREE.BufferAttribute | undefined;
  const S = src.attributes.aSlot as THREE.BufferAttribute | undefined;
  const vc = P.count;
  const pos = new Float32Array(vc * n * 3);
  const nor = new Float32Array(vc * n * 3);
  const col = new Float32Array(vc * n * 3);
  const slot = new Float32Array(vc * n);
  const srcPos = P.array as Float32Array;
  const srcNor = N.array as Float32Array;
  const srcCol = C ? (C.array as Float32Array) : null;
  const srcSlot = S ? (S.array as Float32Array) : null;
  for (let k = 0; k < n; k++) {
    const ox = offsets[k * 2];
    const oz = offsets[k * 2 + 1];
    const base = k * vc;
    for (let v = 0; v < vc; v++) {
      const si = v * 3;
      const di = (base + v) * 3;
      pos[di] = srcPos[si] + ox;
      pos[di + 1] = srcPos[si + 1] + yOffset;
      pos[di + 2] = srcPos[si + 2] + oz;
      nor[di] = srcNor[si];
      nor[di + 1] = srcNor[si + 1];
      nor[di + 2] = srcNor[si + 2];
      if (srcCol) {
        col[di] = srcCol[si];
        col[di + 1] = srcCol[si + 1];
        col[di + 2] = srcCol[si + 2];
      } else col[di] = col[di + 1] = col[di + 2] = 1;
      slot[base + v] = srcSlot ? srcSlot[v] : 0;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSlot', new THREE.BufferAttribute(slot, 1));
  geo.computeBoundingSphere();
  return geo;
}
