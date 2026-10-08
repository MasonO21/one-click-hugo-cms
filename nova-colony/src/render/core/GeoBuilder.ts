/**
 * GeoBuilder — accumulates flat-shaded primitives with baked vertex colors into ONE merged
 * BufferGeometry with material groups (lit / glow / glass). Every procedural model in the game is
 * built with it so a whole building, tree or alien renders in 1–3 draw calls and can be instanced.
 */
import * as THREE from 'three';
import { bakeVertexAO, type AoOpts } from './ao';

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
  /**
   * Vertical colour gradient (painted look): the primitive's lowest vertex gets `color`, its highest
   * `grad`, linearly in between (model-space y after the transform). Sunlit canopy tops, mossy rock
   * caps, darker undersides — baked into the vertex colours, so the shader cost is nil.
   */
  grad?: THREE.ColorRepresentation;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _n = new THREE.Matrix3();
const _v = new THREE.Vector3();
const _g = new THREE.Color();

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
    const start = posArr.length;
    let f = 1;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < n; i++) {
      _v.set(P.getX(i), P.getY(i), P.getZ(i)).applyMatrix4(_m);
      posArr.push(_v.x, _v.y, _v.z);
      if (_v.y < y0) y0 = _v.y;
      if (_v.y > y1) y1 = _v.y;
      _v.set(N.getX(i), N.getY(i), N.getZ(i)).applyMatrix3(_n).normalize();
      norArr.push(_v.x, _v.y, _v.z);
      if (shade && i % 6 === 0) f = 1 + (this.rnd() * 2 - 1) * shade;
      colArr.push(_c.r * f, _c.g * f, _c.b * f);
    }
    if (opts.grad !== undefined && y1 > y0) {
      // second pass: lerp each vertex toward the top colour by its height in the primitive (keeps the face jitter)
      _g.set(opts.grad);
      const inv = 1 / (y1 - y0);
      for (let k = start; k < posArr.length; k += 3) {
        const t = (posArr[k + 1] - y0) * inv;
        const jr = colArr[k] / Math.max(1e-6, _c.r);
        const jg = colArr[k + 1] / Math.max(1e-6, _c.g);
        const jb = colArr[k + 2] / Math.max(1e-6, _c.b);
        const j = _c.r > 1e-6 ? jr : _c.g > 1e-6 ? jg : jb;
        colArr[k] = (_c.r + (_g.r - _c.r) * t) * j;
        colArr[k + 1] = (_c.g + (_g.g - _c.g) * t) * j;
        colArr[k + 2] = (_c.b + (_g.b - _c.b) * t) * j;
      }
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

  /**
   * Round, smooth-shaded blob (icosphere, `detail` 1 = 80 tris, 0 = 20): the building block of the
   * puffy canopies, bushes and pebbles. Normals point out of the centre, so it reads soft and round
   * even at low detail; `shade` still breaks it into gently painted facets.
   */
  puff(r: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, detail = 1, opts?: PrimOpts): this {
    const geo = new THREE.IcosahedronGeometry(r, detail);
    if (detail === 0) {
      // three gives the bare icosahedron flat normals: round them so even a 20-triangle blob shades soft
      const p = geo.attributes.position as THREE.BufferAttribute;
      const n = geo.attributes.normal as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        _v.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
        n.setXYZ(i, _v.x, _v.y, _v.z);
      }
    }
    return this.add(geo, color, x, y, z, opts);
  }

  /**
   * Cheaper round blob (dodecahedron, 36 tris) with the same soft radial normals as `puff`: side
   * lobes of a canopy, berries on a big bush — shapes half hidden behind a full `puff`.
   */
  puffLo(r: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, opts?: PrimOpts): this {
    const geo = new THREE.DodecahedronGeometry(r, 0);
    const p = geo.attributes.position as THREE.BufferAttribute;
    const n = geo.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      _v.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
      n.setXYZ(i, _v.x, _v.y, _v.z);
    }
    return this.add(geo, color, x, y, z, opts);
  }

  /**
   * Surface of revolution about Y from a profile of (radius, height) pairs, bottom to top, with
   * smooth normals: rounded pine tiers, bellied pots, toadstool caps. `seg` sides; base at (x,y,z).
   */
  lathe(profile: readonly number[], x: number, y: number, z: number, color: THREE.ColorRepresentation, seg = 8, opts?: PrimOpts): this {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i < profile.length; i += 2) pts.push(new THREE.Vector2(Math.max(0, profile[i]), profile[i + 1]));
    return this.add(new THREE.LatheGeometry(pts, seg), color, x, y, z, opts);
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

  // ------------------------------------------------------------------ chunky low-poly detail kit
  // (appended helpers; everything below is sugar over the primitives above)

  /**
   * Box with all 12 edges chamfered by `bv` — the "toy" look for hero bodies (turret heads, vehicle
   * hulls, machine blocks). 44 triangles vs 12 for a plain box, so use it where it shows.
   */
  bevelBox(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, bv = 0.08, opts?: PrimOpts): this {
    const b = Math.max(0.001, Math.min(bv, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
    const hw = w / 2;
    const hh = h / 2;
    const hd = d / 2;
    const iw = hw - b;
    const ih = hh - b;
    const id = hd - b;
    const v: number[] = [];
    // emit a convex polygon (fan) oriented outward from the box centre
    const poly = (...p: number[]) => {
      const n = p.length / 3;
      const ax = p[3] - p[0], ay = p[4] - p[1], az = p[5] - p[2];
      const bx = p[6] - p[0], by = p[7] - p[1], bz = p[8] - p[2];
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const flip = nx * p[0] + ny * p[1] + nz * p[2] < 0;
      for (let i = 1; i < n - 1; i++) {
        const a = flip ? i + 1 : i;
        const c = flip ? i : i + 1;
        v.push(p[0], p[1], p[2], p[a * 3], p[a * 3 + 1], p[a * 3 + 2], p[c * 3], p[c * 3 + 1], p[c * 3 + 2]);
      }
    };
    // 6 faces
    poly(hw, -ih, -id, hw, ih, -id, hw, ih, id, hw, -ih, id);
    poly(-hw, -ih, -id, -hw, ih, -id, -hw, ih, id, -hw, -ih, id);
    poly(-iw, hh, -id, iw, hh, -id, iw, hh, id, -iw, hh, id);
    poly(-iw, -hh, -id, iw, -hh, -id, iw, -hh, id, -iw, -hh, id);
    poly(-iw, -ih, hd, iw, -ih, hd, iw, ih, hd, -iw, ih, hd);
    poly(-iw, -ih, -hd, iw, -ih, -hd, iw, ih, -hd, -iw, ih, -hd);
    // 12 edge chamfers
    for (const sy of [-1, 1]) for (const sz of [-1, 1]) poly(-iw, sy * hh, sz * id, iw, sy * hh, sz * id, iw, sy * ih, sz * hd, -iw, sy * ih, sz * hd); // along X
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) poly(sx * hw, -ih, sz * id, sx * hw, ih, sz * id, sx * iw, ih, sz * hd, sx * iw, -ih, sz * hd); // along Y
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) poly(sx * hw, sy * ih, -id, sx * hw, sy * ih, id, sx * iw, sy * hh, id, sx * iw, sy * hh, -id); // along Z
    // 8 corner triangles
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) poly(sx * hw, sy * ih, sz * id, sx * iw, sy * hh, sz * id, sx * iw, sy * ih, sz * hd);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    geo.computeVertexNormals();
    return this.add(geo, color, x, y, z, opts);
  }

  /**
   * A w×h×d block split into `n` slats along `dir` with alternating colours — plank walls (dir 'y'),
   * floor boards (dir 'x'), roof shingles (dir 'z'). `gap` leaves a dark seam between slats and
   * `stagger` shifts every other slat outward along the perpendicular axis (overlapping shingles).
   * Costs 12 triangles per slat.
   */
  planks(w: number, h: number, d: number, x: number, y: number, z: number, n: number, colA: THREE.ColorRepresentation, colB: THREE.ColorRepresentation, dir: 'x' | 'y' | 'z' = 'y', gap = 0.04, stagger = 0, opts: PrimOpts = {}): this {
    const count = Math.max(1, n | 0);
    const span = dir === 'x' ? w : dir === 'y' ? h : d;
    const step = span / count;
    const shade = opts.shade ?? 0.04;
    for (let i = 0; i < count; i++) {
      const o = -span / 2 + step * (i + 0.5);
      const st = i % 2 ? stagger : 0;
      const col = i % 2 ? colB : colA;
      if (dir === 'x') this.box(step - gap, h, d, x + o, y, z + st, col, { ...opts, shade });
      else if (dir === 'y') this.box(w, step - gap, d, x, y + o, z + st, col, { ...opts, shade });
      else this.box(w, h, step - gap, x, y + st, z + o, col, { ...opts, shade });
    }
    return this;
  }

  /** Hazard / banding stripes: `n` alternating colour bands along `dir`, no seams (12 tris per band). */
  stripes(w: number, h: number, d: number, x: number, y: number, z: number, n: number, colA: THREE.ColorRepresentation, colB: THREE.ColorRepresentation, dir: 'x' | 'y' | 'z' = 'x', opts: PrimOpts = {}): this {
    return this.planks(w, h, d, x, y, z, n, colA, colB, dir, 0, 0, { shade: 0, ...opts });
  }

  /**
   * Row of `n` chunky rivet studs starting at (x,y,z), stepping by (dx,dy,dz). Each stud is a small
   * cube turned 45° about the face normal `axis` (12 tris — far cheaper than a sphere).
   */
  rivets(n: number, x: number, y: number, z: number, dx: number, dy: number, dz: number, r = 0.05, color: THREE.ColorRepresentation = '#44423e', axis: 'x' | 'y' | 'z' = 'z'): this {
    const rot: PrimOpts = axis === 'x' ? { rx: Math.PI / 4 } : axis === 'y' ? { ry: Math.PI / 4 } : { rz: Math.PI / 4 };
    for (let i = 0; i < n; i++) {
      const sx = axis === 'x' ? r * 0.8 : r * 1.4;
      const sy = axis === 'y' ? r * 0.8 : r * 1.4;
      const sz = axis === 'z' ? r * 0.8 : r * 1.4;
      this.box(sx, sy, sz, x + dx * i, y + dy * i, z + dz * i, color, rot);
    }
    return this;
  }

  /**
   * Framed window: frame box proud of the wall + a glass pane (SLOT_GLASS, lit warm at night by the
   * shared material) + optional cross mullions. `facing` is the outward wall normal; (x,y,z) is the
   * window centre ON the wall surface. 24 tris (+24 with mullions).
   */
  windowPane(w: number, h: number, x: number, y: number, z: number, frame: THREE.ColorRepresentation, facing: 'x' | '-x' | 'z' | '-z' = 'z', opts: { frameW?: number; depth?: number; mullion?: boolean; glass?: THREE.ColorRepresentation; sill?: THREE.ColorRepresentation } = {}): this {
    const fw = opts.frameW ?? 0.08;
    const depth = opts.depth ?? 0.08;
    const alongX = facing === 'x' || facing === '-x';
    const sgn = facing === 'x' || facing === 'z' ? 1 : -1;
    const ox = alongX ? sgn * depth * 0.5 : 0;
    const oz = alongX ? 0 : sgn * depth * 0.5;
    const bw = alongX ? depth : w + fw * 2;
    const bd = alongX ? w + fw * 2 : depth;
    this.box(bw, h + fw * 2, bd, x + ox, y, z + oz, frame);
    const gx = alongX ? sgn * depth * 0.62 : 0;
    const gz = alongX ? 0 : sgn * depth * 0.62;
    this.box(alongX ? depth * 0.5 : w, h, alongX ? w : depth * 0.5, x + gx, y, z + gz, opts.glass ?? '#ffffff', { slot: SLOT_GLASS });
    if (opts.mullion) {
      const mx = alongX ? sgn * depth * 0.75 : 0;
      const mz = alongX ? 0 : sgn * depth * 0.75;
      this.box(alongX ? depth * 0.5 : fw * 0.7, h, alongX ? fw * 0.7 : depth * 0.5, x + mx, y, z + mz, frame);
      this.box(alongX ? depth * 0.5 : w, fw * 0.7, alongX ? w : depth * 0.5, x + mx, y, z + mz, frame);
    }
    if (opts.sill) {
      const sx = alongX ? sgn * depth * 0.9 : 0;
      const sz = alongX ? 0 : sgn * depth * 0.9;
      this.box(alongX ? depth * 1.8 : w + fw * 3, fw, alongX ? w + fw * 3 : depth * 1.8, x + sx, y - h / 2 - fw * 1.3, z + sz, opts.sill);
    }
    return this;
  }

  /**
   * Pipe run through a polyline (flat array of x,y,z triples): one 6-sided cylinder per segment
   * and a sphere joint at every interior point, so bends look like proper elbows.
   */
  pipe(points: ArrayLike<number>, r: number, color: THREE.ColorRepresentation, seg = 6, joints = true): this {
    const n = points.length / 3;
    const up = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3();
    for (let i = 0; i < n - 1; i++) {
      const ax = points[i * 3], ay = points[i * 3 + 1], az = points[i * 3 + 2];
      const bx = points[i * 3 + 3], by = points[i * 3 + 4], bz = points[i * 3 + 5];
      dir.set(bx - ax, by - ay, bz - az);
      const len = dir.length();
      if (len < 1e-4) continue;
      dir.divideScalar(len);
      _q.setFromUnitVectors(up, dir);
      _e.setFromQuaternion(_q);
      this.cyl(r, r, len, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, color, seg, { rx: _e.x, ry: _e.y, rz: _e.z });
      if (joints && i < n - 2) this.sphere(r * 1.15, bx, by, bz, color, 5);
    }
    return this;
  }

  /** Upper half-sphere (domes, rounded caps) — half the triangles of a full sphere. */
  dome(r: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, seg = 8, opts?: PrimOpts): this {
    return this.add(new THREE.SphereGeometry(r, seg, Math.max(2, (seg >> 1) - 1), 0, Math.PI * 2, 0, Math.PI / 2), color, x, y, z, opts);
  }

  /** Vehicle wheel: fat tyre + hub cap + axle nut, axis along X. ~64 tris. */
  wheel(r: number, w: number, x: number, y: number, z: number, tyre: THREE.ColorRepresentation = '#2a2a2e', hub: THREE.ColorRepresentation = '#aeb9c7', seg = 8): this {
    this.cyl(r, r, w, x, y, z, tyre, seg, { rz: Math.PI / 2, shade: 0.03 });
    this.cyl(r * 0.58, r * 0.58, w + 0.05, x, y, z, hub, 6, { rz: Math.PI / 2 });
    this.box(r * 0.3, r * 0.3, r * 0.3, x, y, z, '#55595f', { rx: Math.PI / 4, sx: (w + 0.12) / (r * 0.3) });
    return this;
  }

  /**
   * Ring of `n` sandbags (chunky shaded boxes with jittered yaw) of radius `rad` around (x,y,z);
   * `arc` < 2π leaves an opening on the −Z side (the back). 12 tris per bag.
   */
  sandbags(rad: number, n: number, x: number, y: number, z: number, color: THREE.ColorRepresentation = '#b89a6a', arc = Math.PI * 2, rows = 1): this {
    for (let row = 0; row < rows; row++) {
      const cnt = Math.max(2, n - row);
      for (let i = 0; i < cnt; i++) {
        const a = Math.PI / 2 - arc / 2 + (arc * (i + 0.5 + row * 0.5)) / cnt;
        const px = x + Math.cos(a) * rad;
        const pz = z + Math.sin(a) * rad;
        this.box(0.5, 0.24, 0.3, px, y + 0.12 + row * 0.22, pz, color, { ry: -a + (this.rnd() - 0.5) * 0.25, shade: 0.08 });
      }
    }
    return this;
  }

  /**
   * Merge accumulated primitives into ONE geometry. Material slots are baked into the `aSlot`
   * vertex attribute (0 lit, 1 glow, 2 glass) and resolved by the shared slot-aware material, so a
   * whole model is a single draw call. Pass `ao` to bake ambient occlusion into the vertex colours
   * (see core/ao.ts): `true` for a model standing on the ground, or options for a detached part.
   */
  build(ao?: AoOpts | boolean): THREE.BufferGeometry {
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
    if (ao) bakeVertexAO(geo, ao === true ? {} : ao);
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
