/**
 * Baked ambient occlusion for GeoBuilder geometry — computed once when a model is built and
 * multiplied into its vertex colours, so contact darkening (bases that meet the ground, boxes that
 * meet boxes, walls under eaves, the inside of tree canopies) costs nothing at runtime and shows up
 * at every quality level, in the thumbnails and in build-mode ghosts alike.
 *
 * Method: the model's triangles are splatted into a small occupancy voxel grid (plus an optional
 * infinite ground plane at y = 0, since world models stand on the ground). Every lit vertex then
 * marches a fixed fan of 13 directions in the hemisphere around its normal and counts how soon they
 * run into occupied voxels; close hits count more than far ones. Flat-shaded geometry duplicates
 * vertices per face, so the result is a per-face gradient that reads as a soft painted shadow rather
 * than a hard step. Glow and glass vertices (aSlot > 0) are never darkened — they are light sources.
 */
import * as THREE from 'three';

export interface AoOpts {
  /** Darkening at full occlusion (linear colour multiplier 1 - strength). */
  strength?: number;
  /** How far an occluder may be and still darken a vertex, world units. */
  radius?: number;
  /** Treat the plane y = 0 as an infinite occluder (models standing on the ground). */
  ground?: boolean;
  /** Voxel edge in world units; large models get coarser voxels so the grid stays ≤ MAX_GRID³. */
  voxel?: number;
  /**
   * Triangles with an edge longer than this are bisected along that edge (up to SUBDIVIDE_LEVELS
   * times) so big flat faces get interior vertices to carry the occlusion gradient — a wall shades
   * under its eave and lightens mid-height instead of being one dimmed quad. 0 disables. Only the
   * large faces split, so box-built models grow by a modest fraction of their triangles.
   */
  subdivide?: number;
}

export const AO_DEFAULTS: Required<AoOpts> = { strength: 0.55, radius: 0.9, ground: true, voxel: 0.14, subdivide: 2.4 };
/** Longest-edge bisections applied to one oversized triangle at most (2^4 = 16 triangles from a huge slab half). */
const SUBDIVIDE_LEVELS = 1;

/** Voxel grid dimension cap per axis (72³ bytes = 373 KB scratch, freed right after the bake). */
const MAX_GRID = 72;
/** Occlusion search steps along each direction. */
const STEPS = 6;
/** First sample starts this many voxels out (clears the vertex's own face and its voxel layer). */
const FIRST_STEP_VOXELS = 2.2;
/** Vertex sample origin is pushed off its surface by this many voxels. */
const OFFSET_VOXELS = 0.8;
/** A hit at the search radius still counts this fraction of a touching hit. */
const FAR_HIT = 0.4;

/**
 * Sample fan in the local frame (z = normal): the normal itself, 4 directions 39° off it and 8
 * directions 65° off it, cosine weighted. Flattened as (x, y, z, weight) tuples.
 */
const FAN: number[] = (() => {
  const out: number[] = [0, 0, 1, 1];
  const ring = (n: number, cosT: number, phase: number) => {
    const sinT = Math.sqrt(1 - cosT * cosT);
    for (let i = 0; i < n; i++) {
      const a = phase + (i / n) * Math.PI * 2;
      out.push(Math.cos(a) * sinT, Math.sin(a) * sinT, cosT, cosT);
    }
  };
  ring(4, 0.78, Math.PI / 4);
  ring(8, 0.42, 0);
  return out;
})();
const FAN_N = FAN.length / 4;

/** Pure occlusion response of one direction: 1 for a touching occluder .. FAR_HIT at the radius. */
export function aoHitWeight(distance: number, radius: number): number {
  const t = Math.min(1, Math.max(0, distance / radius));
  return 1 - t * (1 - FAR_HIT);
}

/** Colour multiplier for an occlusion amount 0..1 at a given strength. */
export function aoShade(occlusion: number, strength = AO_DEFAULTS.strength): number {
  return 1 - strength * Math.min(1, Math.max(0, occlusion));
}

/**
 * Split every triangle whose longest edge exceeds `maxEdge` into four (edge midpoints), repeating up
 * to SUBDIVIDE_LEVELS times, so large flat faces carry interior vertices. Rewrites the geometry's
 * position / normal / color / aSlot attributes in place when anything was split; returns true then.
 */
export function subdivideLargeTriangles(geo: THREE.BufferGeometry, maxEdge: number): boolean {
  const P = geo.attributes.position as THREE.BufferAttribute;
  const N = geo.attributes.normal as THREE.BufferAttribute;
  const C = geo.attributes.color as THREE.BufferAttribute;
  const S = geo.attributes.aSlot as THREE.BufferAttribute | undefined;
  const pos = P.array as Float32Array;
  const nor = N.array as Float32Array;
  const col = C.array as Float32Array;
  const slot = S ? (S.array as Float32Array) : null;
  const count = P.count;
  const thr2 = maxEdge * maxEdge;
  const edge2 = (a: number, b: number): number => {
    const dx = pos[a] - pos[b], dy = pos[a + 1] - pos[b + 1], dz = pos[a + 2] - pos[b + 2];
    return dx * dx + dy * dy + dz * dz;
  };
  let big = 0;
  for (let t = 0; t + 2 < count; t += 3) {
    const a = t * 3;
    if (edge2(a, a + 3) > thr2 || edge2(a + 3, a + 6) > thr2 || edge2(a, a + 6) > thr2) big++;
  }
  if (!big) return false;
  const oPos: number[] = [];
  const oNor: number[] = [];
  const oCol: number[] = [];
  const oSlot: number[] = [];
  // emit one vertex as a blend of the source triangle's corners (barycentric u, v, w)
  const emit = (a: number, u: number, v: number, w: number) => {
    for (let k = 0; k < 3; k++) {
      oPos.push(pos[a + k] * u + pos[a + 3 + k] * v + pos[a + 6 + k] * w);
      oNor.push(nor[a + k] * u + nor[a + 3 + k] * v + nor[a + 6 + k] * w);
      oCol.push(col[a + k] * u + col[a + 3 + k] * v + col[a + 6 + k] * w);
    }
    oSlot.push(slot ? slot[a / 3] : 0);
  };
  // recursive longest-edge bisection expressed in barycentric coordinates of the source triangle:
  // each split adds one triangle and puts the new vertex on the longest edge, where the gradient is
  // needed, instead of quartering (which explodes on long thin wall faces)
  const split = (a: number, bary: number[], level: number) => {
    let longest = 0;
    let le = 0;
    for (let e = 0; e < 3; e++) {
      const i = e * 3, j = ((e + 1) % 3) * 3;
      let d2 = 0;
      for (let k = 0; k < 3; k++) {
        const pi = pos[a + k] * bary[i] + pos[a + 3 + k] * bary[i + 1] + pos[a + 6 + k] * bary[i + 2];
        const pj = pos[a + k] * bary[j] + pos[a + 3 + k] * bary[j + 1] + pos[a + 6 + k] * bary[j + 2];
        d2 += (pi - pj) * (pi - pj);
      }
      if (d2 > longest) {
        longest = d2;
        le = e;
      }
    }
    if (level >= SUBDIVIDE_LEVELS || longest <= thr2) {
      for (let c = 0; c < 3; c++) emit(a, bary[c * 3], bary[c * 3 + 1], bary[c * 3 + 2]);
      return;
    }
    const i = le * 3, j = ((le + 1) % 3) * 3, k = ((le + 2) % 3) * 3;
    const P0 = bary.slice(i, i + 3), P1 = bary.slice(j, j + 3), P2 = bary.slice(k, k + 3);
    const M = [(P0[0] + P1[0]) / 2, (P0[1] + P1[1]) / 2, (P0[2] + P1[2]) / 2];
    split(a, [...P0, ...M, ...P2], level + 1);
    split(a, [...M, ...P1, ...P2], level + 1);
  };
  for (let t = 0; t + 2 < count; t += 3) split(t * 3, [1, 0, 0, 0, 1, 0, 0, 0, 1], 0);
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(oPos), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(oNor), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(oCol), 3));
  if (S) geo.setAttribute('aSlot', new THREE.BufferAttribute(new Float32Array(oSlot), 1));
  return true;
}

/**
 * Bake AO into `geo`'s `color` attribute in place (non-indexed geometry with position / normal /
 * color / aSlot, as GeoBuilder.build produces). Returns the same geometry. Geometry without colours
 * or with fewer than 3 vertices is returned untouched.
 */
export function bakeVertexAO(geo: THREE.BufferGeometry, opts: AoOpts = {}): THREE.BufferGeometry {
  if (!geo.attributes.position || !geo.attributes.normal || !geo.attributes.color || geo.attributes.position.count < 3) return geo;
  const o = { ...AO_DEFAULTS, ...opts };
  if (o.subdivide > 0) subdivideLargeTriangles(geo, o.subdivide);
  const P = geo.attributes.position as THREE.BufferAttribute;
  const N = geo.attributes.normal as THREE.BufferAttribute;
  const C = geo.attributes.color as THREE.BufferAttribute;
  const pos = P.array as Float32Array;
  const nor = N.array as Float32Array;
  const col = C.array as Float32Array;
  const slot = (geo.attributes.aSlot as THREE.BufferAttribute | undefined)?.array as Float32Array | undefined;
  const count = P.count;

  // bounds
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < count; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const R = o.radius;
  const ext = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 0.01);
  // voxel edge: requested, or coarser so the padded grid fits MAX_GRID per axis
  const v = Math.max(o.voxel, (ext + 2 * R) / (MAX_GRID - 2));
  const inv = 1 / v;
  const ox = minX - R - v, oy = minY - R - v, oz = minZ - R - v;
  const nx = Math.min(MAX_GRID, Math.ceil((maxX - minX + 2 * R) * inv) + 2);
  const ny = Math.min(MAX_GRID, Math.ceil((maxY - minY + 2 * R) * inv) + 2);
  const nz = Math.min(MAX_GRID, Math.ceil((maxZ - minZ + 2 * R) * inv) + 2);
  const grid = new Uint8Array(nx * ny * nz);
  const idx = (x: number, y: number, z: number): number => {
    const ix = ((x - ox) * inv) | 0;
    const iy = ((y - oy) * inv) | 0;
    const iz = ((z - oz) * inv) | 0;
    if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) return -1;
    return (iz * ny + iy) * nx + ix;
  };

  // splat every triangle (all slots: glow strips and glass panes occlude too)
  const spacing = v * 0.6;
  for (let t = 0; t + 2 < count; t += 3) {
    const a = t * 3, b = a + 3, c = a + 6;
    const ax = pos[a], ay = pos[a + 1], az = pos[a + 2];
    const e1x = pos[b] - ax, e1y = pos[b + 1] - ay, e1z = pos[b + 2] - az;
    const e2x = pos[c] - ax, e2y = pos[c + 1] - ay, e2z = pos[c + 2] - az;
    const l1 = Math.sqrt(e1x * e1x + e1y * e1y + e1z * e1z);
    const l2 = Math.sqrt(e2x * e2x + e2y * e2y + e2z * e2z);
    const steps = Math.max(1, Math.ceil(Math.max(l1, l2) / spacing));
    const k = 1 / steps;
    for (let i = 0; i <= steps; i++) {
      const s = i * k;
      for (let j = 0; j <= steps - i; j++) {
        const u = j * k;
        const g = idx(ax + e1x * s + e2x * u, ay + e1y * s + e2y * u, az + e1z * s + e2z * u);
        if (g >= 0) grid[g] = 1;
      }
    }
  }

  // march the fan from every lit vertex
  const first = v * FIRST_STEP_VOXELS;
  const span = Math.max(0, R - first);
  const offset = v * OFFSET_VOXELS;
  let wsum = 0;
  for (let f = 0; f < FAN_N; f++) wsum += FAN[f * 4 + 3];
  for (let i = 0; i < count; i++) {
    if (slot && slot[i] > 0.5) continue;
    const nX = nor[i * 3], nY = nor[i * 3 + 1], nZ = nor[i * 3 + 2];
    const nl = nX * nX + nY * nY + nZ * nZ;
    if (nl < 1e-6) continue;
    // tangent frame around the normal
    let tx: number, ty: number, tz: number;
    if (Math.abs(nY) < 0.9) { tx = nZ; ty = 0; tz = -nX; } else { tx = 0; ty = -nZ; tz = nY; }
    const tl = 1 / Math.sqrt(tx * tx + ty * ty + tz * tz);
    tx *= tl; ty *= tl; tz *= tl;
    const bx = nY * tz - nZ * ty, by = nZ * tx - nX * tz, bz = nX * ty - nY * tx;
    const px = pos[i * 3] + nX * offset, py = pos[i * 3 + 1] + nY * offset, pz = pos[i * 3 + 2] + nZ * offset;
    let occ = 0;
    for (let f = 0; f < FAN_N; f++) {
      const fx = FAN[f * 4], fy = FAN[f * 4 + 1], fz = FAN[f * 4 + 2];
      const dx = tx * fx + bx * fy + nX * fz;
      const dy = ty * fx + by * fy + nY * fz;
      const dz = tz * fx + bz * fy + nZ * fz;
      for (let s = 0; s < STEPS; s++) {
        const d = first + (span * s) / (STEPS - 1);
        const qy = py + dy * d;
        let hit = o.ground && qy < 0;
        if (!hit) {
          const g = idx(px + dx * d, qy, pz + dz * d);
          hit = g >= 0 && grid[g] === 1;
        }
        if (hit) {
          occ += FAN[f * 4 + 3] * aoHitWeight(d, R);
          break;
        }
      }
    }
    const m = aoShade(occ / wsum, o.strength);
    col[i * 3] *= m;
    col[i * 3 + 1] *= m;
    col[i * 3 + 2] *= m;
  }
  C.needsUpdate = true;
  return geo;
}
