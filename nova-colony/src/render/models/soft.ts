/**
 * Soft-shape kit for characters, pets and aliens: smooth-shaded surfaces of revolution, tapered
 * limbs with round joints and swept tubes (tails, tentacles, horns, mic booms). Sugar over GeoBuilder:
 * every helper builds an indexed three.js geometry with smooth vertex normals and hands it to
 * `GeoBuilder.add`, which keeps those normals (flat look only comes from flat geometry such as boxes),
 * so a model built from these reads rounded under the shared Lambert material.
 *
 * Profiles are flat `[r0, y0, r1, y1, ...]` arrays, bottom to top (outward-facing winding).
 */
import * as THREE from 'three';
import type { GeoBuilder, PrimOpts } from '../core/GeoBuilder';

type Color = THREE.ColorRepresentation;

/** Surface of revolution around +Y through a `[r, y, ...]` profile (bottom to top), placed at (x,y,z). */
export function lathe(b: GeoBuilder, profile: readonly number[], seg: number, x: number, y: number, z: number, color: Color, opts?: PrimOpts): GeoBuilder {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < profile.length; i += 2) pts.push(new THREE.Vector2(Math.max(1e-4, profile[i]), profile[i + 1]));
  return b.add(new THREE.LatheGeometry(pts, seg), color, x, y, z, opts);
}

/** Round-capped profile between two circles: radius `r0` centred at y0 and `r1` centred at y1 (y0 < y1). */
export function capsuleProfile(r0: number, y0: number, r1: number, y1: number, capSeg = 3): number[] {
  const out: number[] = [];
  for (let i = 0; i <= capSeg; i++) {
    const a = -Math.PI / 2 + (i / capSeg) * (Math.PI / 2);
    out.push(Math.cos(a) * r0, y0 + Math.sin(a) * r0);
  }
  for (let i = 0; i <= capSeg; i++) {
    const a = (i / capSeg) * (Math.PI / 2);
    out.push(Math.cos(a) * r1, y1 + Math.sin(a) * r1);
  }
  return out;
}

/**
 * Limb segment hanging DOWN from a joint at (x,y,z): a round cap of radius `rTop` centred on the joint,
 * tapering to a round cap of radius `rBot` centred `len` below it. Chained segments overlap their caps,
 * so elbows and knees stay round at any bend.
 */
export function limb(b: GeoBuilder, rTop: number, rBot: number, len: number, x: number, y: number, z: number, color: Color, seg = 8, opts?: PrimOpts, capSeg = 3): GeoBuilder {
  return lathe(b, capsuleProfile(rBot, -len, rTop, 0, capSeg), seg, x, y, z, color, opts);
}

/** Ellipsoid: a smooth sphere with per-axis radii. */
export function ellipsoid(b: GeoBuilder, rx: number, ry: number, rz: number, x: number, y: number, z: number, color: Color, seg = 10, opts: PrimOpts = {}): GeoBuilder {
  const hs = Math.max(4, Math.round(seg * 0.75));
  return b.add(new THREE.SphereGeometry(1, seg, hs), color, x, y, z, { ...opts, sx: rx * (opts.sx ?? 1), sy: ry * (opts.sy ?? 1), sz: rz * (opts.sz ?? 1) });
}

/**
 * Part of a sphere shell (hair caps, helmets, visors): three's SphereGeometry phi/theta window.
 * thetaLen < π leaves the bottom open; phi spans around Y starting at +X... (three's convention).
 */
export function shell(b: GeoBuilder, r: number, x: number, y: number, z: number, color: Color, seg: number, phiStart: number, phiLen: number, thetaStart: number, thetaLen: number, opts?: PrimOpts): GeoBuilder {
  const hs = Math.max(3, Math.round(seg * 0.6));
  return b.add(new THREE.SphereGeometry(r, seg, hs, phiStart, phiLen, thetaStart, thetaLen), color, x, y, z, opts);
}

const _t = new THREE.Vector3();
const _n = new THREE.Vector3();
const _bn = new THREE.Vector3();
const _p = new THREE.Vector3();
const _up = new THREE.Vector3();

/**
 * Smooth tube through points `[x, y, z, r, ...]` (radius per point), with round end caps where the
 * radius at an end is > 0.004 (a radius near 0 ends in a point: horns, claws, tail tips). Frames are
 * parallel-transported, rings share vertices around the seam, so the tube shades without a seam.
 */
export function sweep(b: GeoBuilder, pts: readonly number[], radial: number, color: Color, opts?: PrimOpts, capSeg = 2): GeoBuilder {
  const n = pts.length / 4;
  if (n < 2) return b;
  // centreline (with cap rings added at both ends)
  const cx: number[] = [];
  const cy: number[] = [];
  const cz: number[] = [];
  const cr: number[] = [];
  const tan: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const c = Math.min(n - 1, i + 1);
    tan.push(new THREE.Vector3(pts[c * 4] - pts[a * 4], pts[c * 4 + 1] - pts[a * 4 + 1], pts[c * 4 + 2] - pts[a * 4 + 2]).normalize());
  }
  const ringT: THREE.Vector3[] = [];
  const push = (x: number, y: number, z: number, r: number, t: THREE.Vector3) => {
    cx.push(x);
    cy.push(y);
    cz.push(z);
    cr.push(r);
    ringT.push(t);
  };
  const r0 = pts[3];
  const rN = pts[(n - 1) * 4 + 3];
  const startCap = r0 > 0.004;
  const endCap = rN > 0.004;
  if (startCap) {
    for (let k = capSeg; k >= 1; k--) {
      const a = (k / (capSeg + 1)) * (Math.PI / 2);
      push(pts[0] - tan[0].x * r0 * Math.sin(a), pts[1] - tan[0].y * r0 * Math.sin(a), pts[2] - tan[0].z * r0 * Math.sin(a), r0 * Math.cos(a), tan[0]);
    }
  }
  for (let i = 0; i < n; i++) push(pts[i * 4], pts[i * 4 + 1], pts[i * 4 + 2], pts[i * 4 + 3], tan[i]);
  if (endCap) {
    const t = tan[n - 1];
    const o = (n - 1) * 4;
    for (let k = 1; k <= capSeg; k++) {
      const a = (k / (capSeg + 1)) * (Math.PI / 2);
      push(pts[o] + t.x * rN * Math.sin(a), pts[o + 1] + t.y * rN * Math.sin(a), pts[o + 2] + t.z * rN * Math.sin(a), rN * Math.cos(a), t);
    }
  }
  const rings = cx.length;
  const pos: number[] = [];
  // initial normal: any vector not parallel to the first tangent
  _up.set(0, 1, 0);
  if (Math.abs(ringT[0].dot(_up)) > 0.9) _up.set(1, 0, 0);
  _n.crossVectors(ringT[0], _up).normalize();
  let prevT = ringT[0].clone();
  for (let i = 0; i < rings; i++) {
    const t = ringT[i];
    // parallel transport the normal from the previous ring
    const axis = new THREE.Vector3().crossVectors(prevT, t);
    const s = axis.length();
    if (s > 1e-6) {
      const ang = Math.atan2(s, prevT.dot(t));
      _n.applyAxisAngle(axis.normalize(), ang);
    }
    prevT = t;
    _bn.crossVectors(t, _n).normalize();
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const ca = Math.cos(a) * cr[i];
      const sa = Math.sin(a) * cr[i];
      _p.set(cx[i] + _n.x * ca + _bn.x * sa, cy[i] + _n.y * ca + _bn.y * sa, cz[i] + _n.z * ca + _bn.z * sa);
      pos.push(_p.x, _p.y, _p.z);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const bq = i * radial + ((j + 1) % radial);
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + ((j + 1) % radial);
      idx.push(a, bq, c, bq, d, c);
    }
  }
  // tips: a single vertex closing each end
  const tip = (ring: number, dir: number, r: number) => {
    const t = ringT[ring];
    const k = pos.length / 3;
    // the last cap ring sits r·sin(capSeg/(capSeg+1)·90°) past the end point: the tip closes the rest
    const off = r > 0 ? r * (1 - Math.sin((capSeg / (capSeg + 1)) * (Math.PI / 2))) : 0;
    pos.push(cx[ring] + t.x * dir * off, cy[ring] + t.y * dir * off, cz[ring] + t.z * dir * off);
    for (let j = 0; j < radial; j++) {
      const a = ring * radial + j;
      const bq = ring * radial + ((j + 1) % radial);
      if (dir < 0) idx.push(k, bq, a);
      else idx.push(k, a, bq);
    }
  };
  tip(0, -1, startCap ? r0 : 0);
  tip(rings - 1, 1, endCap ? rN : 0);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return b.add(geo, color, 0, 0, 0, opts);
}

/**
 * Multiply the lit vertex colours of a built geometry by a vertical ramp (k0 at y0 .. k1 at y1,
 * clamped): a soft painted gradient (darker feet / belly, lighter shoulders) baked once.
 */
export function gradeY(geo: THREE.BufferGeometry, y0: number, y1: number, k0: number, k1: number): THREE.BufferGeometry {
  const P = geo.attributes.position as THREE.BufferAttribute;
  const C = geo.attributes.color as THREE.BufferAttribute;
  const S = geo.attributes.aSlot as THREE.BufferAttribute | undefined;
  if (!C) return geo;
  const span = y1 - y0 || 1;
  for (let i = 0; i < P.count; i++) {
    if (S && S.getX(i) > 0.5) continue;
    const u = Math.min(1, Math.max(0, (P.getY(i) - y0) / span));
    const k = k0 + (k1 - k0) * u;
    C.setXYZ(i, C.getX(i) * k, C.getY(i) * k, C.getZ(i) * k);
  }
  C.needsUpdate = true;
  return geo;
}

/** Call `fn` for the left (-1) and right (+1) side. */
export function mirror(fn: (s: -1 | 1) => void): void {
  fn(-1);
  fn(1);
}

/**
 * Mirror a built (non-indexed) GeoBuilder geometry across X with the winding fixed up, for left-side
 * copies of one-sided parts. Instanced meshes cannot take a negative-scale instance matrix (the faces
 * would turn inside out), so the mirror is baked into its own geometry instead.
 */
export function mirrorGeometryX(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const P = src.attributes.position as THREE.BufferAttribute;
  const n = P.count;
  for (const name of Object.keys(src.attributes)) {
    const a = src.attributes[name] as THREE.BufferAttribute;
    const out = new Float32Array(a.array.length);
    const sz = a.itemSize;
    for (let v = 0; v < n; v++) {
      // swap the 2nd and 3rd vertex of every triangle (winding), negate x of positions / normals
      const tri = v - (v % 3);
      const k = v % 3;
      const from = tri + (k === 1 ? 2 : k === 2 ? 1 : 0);
      for (let c = 0; c < sz; c++) {
        let val = a.array[from * sz + c] as number;
        if (c === 0 && (name === 'position' || name === 'normal')) val = -val;
        out[v * sz + c] = val;
      }
    }
    geo.setAttribute(name, new THREE.BufferAttribute(out, sz, a.normalized));
  }
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

/**
 * Average the normals of vertices that share a position (an indexed geometry's UV seam), so a
 * deformed sphere or lathe shades without a crease where its texture seam was.
 */
export function smoothSeams(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const P = geo.attributes.position as THREE.BufferAttribute;
  const N = geo.attributes.normal as THREE.BufferAttribute;
  const groups = new Map<string, number[]>();
  for (let i = 0; i < P.count; i++) {
    const k = `${Math.round(P.getX(i) * 1e4)},${Math.round(P.getY(i) * 1e4)},${Math.round(P.getZ(i) * 1e4)}`;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = []));
    g.push(i);
  }
  const v = new THREE.Vector3();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    v.set(0, 0, 0);
    for (const i of g) v.x += N.getX(i), v.y += N.getY(i), v.z += N.getZ(i);
    v.normalize();
    for (const i of g) N.setXYZ(i, v.x, v.y, v.z);
  }
  N.needsUpdate = true;
  return geo;
}
