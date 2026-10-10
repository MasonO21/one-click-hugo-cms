// Procedural low-poly models. Each model is one merged, flat-shaded BufferGeometry with
// per-vertex albedo (aCol) and an emissive flag (aEmit: 0 lit, 1 instance-tint glow, 2 own-colour glow).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

/** One coloured part. o: {p:[x,y,z], r:[x,y,z], s:number|[x,y,z], e: emit} */
function P(geo, color, o = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  geo.dispose();
  const s = o.s ?? 1;
  _m.compose(_v.set(...(o.p || [0, 0, 0])), _q.setFromEuler(_e.set(...(o.r || [0, 0, 0]))), Array.isArray(s) ? _s.set(...s) : _s.set(s, s, s));
  g.applyMatrix4(_m);
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  g.computeVertexNormals();
  const n = g.attributes.position.count;
  const c = new THREE.Color(color);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aEmit', new THREE.BufferAttribute(new Float32Array(n).fill(o.e || 0), 1));
  return g;
}
const merge = (parts) => { const g = mergeGeometries(parts, false); g.computeBoundingSphere(); return g; };
const mirror = (fn) => [fn(1), fn(-1)];

const Sph = (r, w = 7, h = 5) => new THREE.SphereGeometry(r, w, h);
const Cone = (r, h, s = 7) => new THREE.ConeGeometry(r, h, s);
const Cyl = (rt, rb, h, s = 7) => new THREE.CylinderGeometry(rt, rb, h, s);
const Box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const Ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);
const Oct = (r) => new THREE.OctahedronGeometry(r, 0);
const Dod = (r) => new THREE.DodecahedronGeometry(r, 0);
const Tor = (r, t, rs = 4, ts = 10, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc);

// ---------------------------------------------------------------- heroes
export function heroGeometry(id, body = 0x1b2a44) {
  const dark = 0x05070c, metal = 0x8a95a8, wood = 0x3a2c22;
  const lighter = new THREE.Color(body).multiplyScalar(1.6).getHex();
  const parts = [];
  if (id === 'vael') {
    parts.push(
      P(Cone(0.56, 1.3, 7), body, { p: [0, 0.65, 0] }),
      P(Cyl(0.5, 0.6, 0.1, 7), 0, { p: [0, 0.06, 0], e: 1 }),
      P(Sph(0.36, 7, 5), lighter, { p: [0, 1.22, 0], s: [1.25, 0.8, 1] }),
      P(Cone(0.33, 0.62, 6), body, { p: [0, 1.6, -0.04], r: [-0.18, 0, 0] }),
      P(Sph(0.21, 6, 4), dark, { p: [0, 1.4, 0.12] }),
      ...mirror((x) => P(Sph(0.05, 5, 3), 0, { p: [0.075 * x, 1.42, 0.29], e: 1 })),
      ...mirror((x) => P(Cone(0.12, 0.34, 5), 0x2a3a58, { p: [0.36 * x, 1.33, 0], r: [0, 0, -0.9 * x] })),
      P(Cyl(0.035, 0.035, 2.0, 5), wood, { p: [0.46, 1.0, 0.12], r: [0, 0, -0.06] }),
      P(Tor(0.15, 0.03, 4, 8), metal, { p: [0.4, 2.02, 0.12] }),
      P(Ico(0.12), 0, { p: [0.4, 2.02, 0.12], e: 1 }),
      P(Box(0.5, 0.06, 0.06), 0, { p: [0, 0.95, 0.42], r: [0.4, 0, 0], e: 1 }),
    );
  } else if (id === 'nyx') {
    parts.push(
      P(Cone(0.5, 1.25, 7), body, { p: [0, 0.63, 0] }),
      P(Cyl(0.44, 0.52, 0.08, 7), 0, { p: [0, 0.05, 0], e: 1 }),
      P(Sph(0.3, 7, 5), lighter, { p: [0, 1.2, 0], s: [1.15, 0.85, 1] }),
      P(Sph(0.22, 6, 5), 0xd9d4e8, { p: [0, 1.5, 0.03] }),
      P(Cone(0.24, 0.55, 6), body, { p: [0, 1.62, -0.12], r: [-0.6, 0, 0] }),
      ...mirror((x) => P(Cone(0.05, 0.38, 4), 0xd9d4e8, { p: [0.14 * x, 1.78, -0.02], r: [-0.3, 0, -0.35 * x] })),
      ...mirror((x) => P(Sph(0.045, 5, 3), 0, { p: [0.075 * x, 1.52, 0.2], e: 1 })),
      P(Cyl(0.03, 0.03, 2.3, 5), 0x2a2238, { p: [-0.42, 1.1, 0.1], r: [0, 0, 0.12] }),
      P(Tor(0.55, 0.06, 3, 10, 2.1), 0, { p: [-0.32, 2.05, 0.1], r: [0, 0, 1.2], s: [1, 1, 0.5], e: 1 }),
      ...mirror((x) => P(Box(0.12, 0.5, 0.12), body, { p: [0.33 * x, 1.0, 0.05], r: [0.2, 0, 0.25 * x] })),
    );
  } else if (id === 'seraphine') {
    const robe = 0xcdbfa6;
    parts.push(
      P(Cone(0.55, 1.35, 8), robe, { p: [0, 0.68, 0] }),
      P(Cone(0.5, 1.1, 8), body, { p: [0, 0.56, 0.02], s: [0.9, 1, 0.9] }),
      P(Cyl(0.5, 0.6, 0.08, 8), 0, { p: [0, 0.05, 0], e: 1 }),
      P(Sph(0.3, 7, 5), robe, { p: [0, 1.28, 0], s: [1.2, 0.85, 1] }),
      P(Sph(0.2, 7, 5), 0xf0e2c8, { p: [0, 1.58, 0.02] }),
      P(Cone(0.26, 0.6, 7), robe, { p: [0, 1.62, -0.08], r: [-0.25, 0, 0] }),
      ...mirror((x) => P(Sph(0.04, 5, 3), 0, { p: [0.07 * x, 1.6, 0.18], e: 1 })),
      P(Tor(0.28, 0.035, 4, 14), 0, { p: [0, 2.05, -0.05], r: [Math.PI / 2 - 0.25, 0, 0], e: 1 }),
      ...mirror((x) => P(Cone(0.28, 1.1, 3), 0, { p: [0.45 * x, 1.45, -0.32], r: [0.3, 0, -1.1 * x], s: [1, 1, 0.25], e: 1 })),
      ...mirror((x) => P(Tor(0.09, 0.025, 3, 6), metal, { p: [0.38 * x, 1.0, 0.12], r: [0, 1.2, 0] })),
      ...mirror((x) => P(Tor(0.09, 0.025, 3, 6), 0, { p: [0.45 * x, 0.82, 0.18], r: [1.2, 0, 0], e: 1 })),
    );
  } else if (id === 'liora') {
    const veil = 0xb9b2cc, bronze = 0x8a6a3a;
    parts.push(
      P(Cone(0.52, 1.32, 8), body, { p: [0, 0.66, 0] }),                                        // robe
      P(Cone(0.58, 0.7, 8), veil, { p: [0, 0.36, -0.02], s: [1, 1, 0.92] }),                    // tattered hem layer
      P(Cyl(0.48, 0.56, 0.08, 8), 0, { p: [0, 0.05, 0], e: 1 }),
      P(Sph(0.3, 7, 5), lighter, { p: [0, 1.24, 0], s: [1.15, 0.85, 1] }),
      P(Sph(0.2, 7, 5), 0xe6e0f4, { p: [0, 1.56, 0.03] }),                                      // pale face
      P(Cone(0.34, 1.05, 8), veil, { p: [0, 1.36, -0.1], r: [-0.12, 0, 0], s: [1, 1, 0.75] }),  // long veil
      ...mirror((x) => P(Sph(0.042, 5, 3), 0, { p: [0.07 * x, 1.58, 0.19], e: 1 })),
      P(Cyl(0.02, 0.02, 0.9, 4), metal, { p: [0.42, 1.25, 0.16], r: [0, 0, 0.35] }),             // chain
      P(Cone(0.26, 0.36, 9, true), bronze, { p: [0.62, 0.78, 0.2] }),                          // the funeral bell
      P(Tor(0.24, 0.035, 4, 12), 0, { p: [0.62, 0.61, 0.2], r: [Math.PI / 2, 0, 0], e: 1 }),   // glowing lip
      ...[-0.22, 0, 0.22].map((z) => P(Sph(0.055, 5, 3), 0xd8d0b0, { p: [0.3 * Math.cos(z * 4), 0.86, 0.26 + z * 0.4] })), // belt bells
    );
  } else if (id === 'grimsby') {
    const coat = 0x2c4a22, hat = 0x15190f, skin = 0xa8b49a, iron = 0x3a3a34;
    parts.push(
      P(Cone(0.5, 1.15, 8), coat, { p: [0, 0.72, 0] }),                                       // frock coat
      ...mirror((x) => P(Cyl(0.08, 0.1, 0.42, 5), 0x3a2a1a, { p: [0.15 * x, 0.21, 0] })),    // boots
      P(Sph(0.3, 7, 5), coat, { p: [0, 1.28, 0], s: [1.15, 0.8, 1] }),                         // shoulders
      P(Sph(0.2, 7, 5), skin, { p: [0, 1.6, 0.02] }),                                          // skull
      P(Box(0.22, 0.12, 0.12), iron, { p: [0, 1.48, 0.12] }),                                  // the lantern jaw
      P(Box(0.16, 0.07, 0.08), 0, { p: [0, 1.48, 0.15], e: 1 }),                               // its witchfire
      ...mirror((x) => P(Sph(0.04, 5, 3), 0, { p: [0.07 * x, 1.63, 0.18], e: 1 })),
      P(Cyl(0.46, 0.46, 0.04, 10), hat, { p: [0, 1.76, 0] }),                                  // brim
      P(Cone(0.24, 0.6, 7), hat, { p: [0, 2.05, -0.04], r: [-0.2, 0, 0.1] }),                  // witch hat
      P(Cyl(0.03, 0.035, 2.3, 5), wood, { p: [-0.45, 1.15, 0.12], r: [0, 0, 0.05] }),         // the crooked pole
      P(Box(0.2, 0.28, 0.2), iron, { p: [-0.62, 1.95, 0.12] }),                                // lantern
      P(Box(0.13, 0.2, 0.13), 0, { p: [-0.62, 1.95, 0.12], e: 1 }),
      ...mirror((x) => P(Box(0.13, 0.5, 0.13), coat, { p: [0.42 * x, 1.0, 0.06], r: [0.12, 0, 0.18 * x] })),
    );
  } else if (id === 'osric') {
    const robe = 0xe8dcc0, gold = 0xc9a24a, bone = 0xe8e0c8;
    parts.push(
      P(Cone(0.6, 1.4, 9), robe, { p: [0, 0.7, 0] }),                                         // vestments
      P(Box(0.18, 1.1, 0.04), gold, { p: [0, 0.75, 0.32], r: [-0.22, 0, 0] }),                 // the stole
      P(Cyl(0.55, 0.62, 0.08, 9), 0, { p: [0, 0.05, 0], e: 1 }),
      P(Sph(0.34, 7, 5), robe, { p: [0, 1.3, 0], s: [1.25, 0.8, 1] }),                         // cope over the shoulders
      P(Sph(0.2, 7, 5), bone, { p: [0, 1.62, 0.02] }),                                         // skull
      ...mirror((x) => P(Sph(0.045, 5, 3), 0, { p: [0.07 * x, 1.64, 0.18], e: 1 })),
      P(Cone(0.17, 0.48, 4), gold, { p: [0, 1.98, 0], r: [0, Math.PI / 4, 0], s: [1, 1, 0.55] }), // the mitre
      P(Cyl(0.035, 0.035, 2.4, 5), bone, { p: [-0.5, 1.2, 0.1] }),                             // the bone crozier
      P(Tor(0.14, 0.035, 4, 10, Math.PI * 1.3), bone, { p: [-0.42, 2.45, 0.1], r: [0, 0, 0.6] }),
      P(Ico(0.06), 0, { p: [-0.36, 2.38, 0.1], e: 1 }),
      ...mirror((x) => P(Cone(0.2, 0.6, 6), robe, { p: [0.4 * x, 1.05, 0.08], r: [0.1, 0, 0.35 * x] })), // bell sleeves
    );
  } else { // mordrake
    const bone = 0xcfc6a8;
    parts.push(
      P(Cyl(0.42, 0.58, 1.0, 7), body, { p: [0, 0.5, 0] }),
      P(Cyl(0.5, 0.6, 0.08, 7), 0, { p: [0, 0.05, 0], e: 1 }),
      P(Box(0.82, 0.6, 0.52), lighter, { p: [0, 1.25, 0] }),
      P(Box(0.34, 0.28, 0.12), bone, { p: [0, 1.25, 0.27] }),
      ...mirror((x) => P(Dod(0.26), bone, { p: [0.5 * x, 1.52, 0], s: [1.1, 0.75, 1] })),
      ...mirror((x) => P(Cone(0.08, 0.35, 5), bone, { p: [0.55 * x, 1.78, -0.02], r: [0, 0, -0.5 * x] })),
      P(Sph(0.24, 6, 5), bone, { p: [0, 1.75, 0.04] }),
      P(Box(0.26, 0.1, 0.12), dark, { p: [0, 1.68, 0.2] }),
      ...mirror((x) => P(Sph(0.05, 5, 3), 0, { p: [0.08 * x, 1.78, 0.24], e: 1 })),
      ...mirror((x) => P(Cone(0.07, 0.55, 5), bone, { p: [0.2 * x, 2.05, -0.05], r: [-0.35, 0, -0.45 * x] })),
      P(Cyl(0.04, 0.04, 2.4, 5), bone, { p: [0.62, 1.2, 0.15], r: [0.12, 0, 0] }),
      P(Cone(0.1, 0.45, 4), 0, { p: [0.62, 2.55, 0.29], r: [0.12, 0, 0], e: 1 }),
      ...mirror((x) => P(Box(0.14, 0.55, 0.14), body, { p: [0.48 * x, 0.98, 0.08], r: [0.15, 0, 0.12 * x] })),
    );
  }
  return merge(parts);
}

// ---------------------------------------------------------------- enemies
export function enemyGeometry(type) {
  const parts = [];
  if (type === 'husk') {
    const c = 0x3e3632, c2 = 0x2a2420;
    parts.push(
      ...mirror((x) => P(Cyl(0.07, 0.09, 0.55, 5), c2, { p: [0.14 * x, 0.28, 0] })),
      P(Sph(0.33, 6, 4), c, { p: [0, 0.82, 0.05], s: [1, 1.15, 0.85], r: [0.45, 0, 0] }),
      P(Sph(0.2, 6, 4), c, { p: [0, 1.15, 0.28] }),
      P(Box(0.14, 0.06, 0.05), 0x0, { p: [0, 1.08, 0.46] }),
      ...mirror((x) => P(Sph(0.04, 4, 3), 0, { p: [0.075 * x, 1.18, 0.45], e: 1 })),
      ...mirror((x) => P(Box(0.08, 0.08, 0.62), c2, { p: [0.27 * x, 0.92, 0.36], r: [0.35, 0.15 * x, 0] })),
      P(Box(0.05, 0.3, 0.04), 0, { p: [0.05, 0.85, 0.32], r: [0.4, 0, 0.3], e: 1 }),
      P(Box(0.04, 0.2, 0.04), 0, { p: [-0.08, 0.78, 0.33], r: [0.4, 0, -0.4], e: 1 }),
    );
  } else if (type === 'ghoul') {
    const c = 0x2f2a38;
    parts.push(
      P(Sph(0.3, 6, 4), c, { p: [0, 0.48, 0], s: [0.85, 0.7, 1.5] }),
      P(Sph(0.18, 6, 4), c, { p: [0, 0.5, 0.48], s: [1, 0.85, 1.2] }),
      ...mirror((x) => P(Sph(0.04, 4, 3), 0, { p: [0.07 * x, 0.55, 0.65], e: 1 })),
      ...mirror((x) => P(Cyl(0.04, 0.06, 0.5, 4), 0x201c26, { p: [0.2 * x, 0.25, 0.25], r: [0.4, 0, 0.3 * x] })),
      ...mirror((x) => P(Cyl(0.04, 0.06, 0.5, 4), 0x201c26, { p: [0.2 * x, 0.25, -0.25], r: [-0.4, 0, 0.3 * x] })),
      ...[0, 1, 2].map((i) => P(Cone(0.05, 0.22, 4), 0, { p: [0, 0.72, 0.2 - i * 0.2], r: [-0.4, 0, 0], e: 1 })),
    );
  } else if (type === 'brute') {
    const c = 0x463530, c2 = 0x2c211d;
    parts.push(
      ...mirror((x) => P(Cyl(0.16, 0.2, 0.6, 6), c2, { p: [0.28 * x, 0.3, 0] })),
      P(Dod(0.62), c, { p: [0, 1.15, 0], s: [1.3, 1.05, 0.95] }),
      P(Sph(0.24, 6, 4), c, { p: [0, 1.82, 0.3] }),
      ...mirror((x) => P(Sph(0.05, 4, 3), 0, { p: [0.09 * x, 1.86, 0.52], e: 1 })),
      ...mirror((x) => P(Cone(0.08, 0.35, 5), 0xbdb39a, { p: [0.18 * x, 2.05, 0.25], r: [0.3, 0, -0.6 * x] })),
      ...mirror((x) => P(Cyl(0.13, 0.16, 0.8, 6), c2, { p: [0.82 * x, 0.95, 0.15], r: [0.3, 0, 0.35 * x] })),
      ...mirror((x) => P(Dod(0.3), c, { p: [0.95 * x, 0.5, 0.35] })),
      P(Oct(0.2), 0, { p: [0, 1.2, 0.58], e: 1 }),
      ...[-1, 0, 1].map((i) => P(Box(0.04, 0.35, 0.04), 0, { p: [i * 0.25, 1.2, 0.55], r: [0, 0, i * 0.6], e: 1 })),
    );
  } else if (type === 'witch') {
    const c = 0x2c1a20;
    parts.push(
      P(Cone(0.45, 1.2, 7), c, { p: [0, 0.6, 0] }),
      P(Sph(0.24, 6, 4), c, { p: [0, 1.22, 0], s: [1.3, 0.8, 1] }),
      P(Sph(0.16, 6, 4), 0x0, { p: [0, 1.38, 0.08] }),
      P(Cyl(0.42, 0.42, 0.03, 8), 0x1d1216, { p: [0, 1.5, 0] }),
      P(Cone(0.25, 0.75, 6), 0x1d1216, { p: [0.05, 1.86, -0.05], r: [-0.25, 0, -0.15] }),
      ...mirror((x) => P(Sph(0.035, 4, 3), 0, { p: [0.06 * x, 1.4, 0.22], e: 1 })),
      P(Cyl(0.03, 0.03, 1.4, 4), 0x3a2a22, { p: [0.4, 0.8, 0.15] }),
      P(Ico(0.14), 0, { p: [0.4, 1.58, 0.15], e: 1 }),
    );
  } else if (type === 'bloater') {
    const c = 0x3b3526;
    parts.push(
      P(Sph(0.55, 9, 7), c, { p: [0, 0.75, 0] }),
      ...mirror((x) => P(Cyl(0.07, 0.09, 0.35, 4), 0x2a251a, { p: [0.25 * x, 0.18, 0] })),
      P(Sph(0.16, 6, 4), c, { p: [0, 1.25, 0.18] }),
      ...mirror((x) => P(Sph(0.035, 4, 3), 0, { p: [0.06 * x, 1.28, 0.32], e: 1 })),
      ...[[0.4, 0.95, 0.25], [-0.35, 0.6, 0.38], [0.15, 0.45, 0.48], [-0.45, 1.0, -0.1], [0.42, 0.55, -0.3], [-0.1, 1.15, -0.4], [0.05, 0.85, 0.52]]
        .map((p, i) => P(Sph(0.09 + (i % 3) * 0.03, 5, 4), 0, { p, e: 1 })),
    );
  } else if (type === 'wraith') {
    const c = 0x5a5070, c2 = 0x3a3248, bone = 0xc8c0b0;
    parts.push(
      P(Cone(0.42, 1.25, 7), c, { p: [0, 0.95, 0], r: [Math.PI, 0, 0] }),           // the shroud, tapering to a point below
      P(Sph(0.32, 7, 5), c, { p: [0, 1.5, 0], s: [1.2, 0.8, 1] }),
      P(Cone(0.26, 0.5, 6), c2, { p: [0, 1.78, -0.06], r: [-0.3, 0, 0] }),           // hood
      P(Sph(0.15, 6, 4), bone, { p: [0, 1.62, 0.12] }),                               // skull
      ...mirror((x) => P(Sph(0.04, 4, 3), 0, { p: [0.055 * x, 1.65, 0.25], e: 1 })),
      ...mirror((x) => P(Box(0.07, 0.07, 0.7), bone, { p: [0.36 * x, 1.4, 0.32], r: [0.3, 0.25 * x, 0] })), // reaching arms
    );
  } else if (type === 'priest') {
    const c = 0x2a2226, c2 = 0x4a3c30, bone = 0xd8ccb4;
    parts.push(
      P(Cone(0.5, 1.5, 8), c, { p: [0, 0.75, 0] }),                                   // robe
      P(Sph(0.3, 7, 5), c2, { p: [0, 1.45, -0.05], s: [1.15, 0.85, 1] }),             // hunched shoulders
      P(Sph(0.16, 6, 4), bone, { p: [0, 1.72, 0.08] }),                               // the bird-skull mask
      P(Cone(0.06, 0.42, 5), bone, { p: [0, 1.66, 0.36], r: [Math.PI / 2 + 0.35, 0, 0] }), // its beak
      ...mirror((x) => P(Sph(0.035, 4, 3), 0, { p: [0.06 * x, 1.76, 0.2], e: 1 })),
      P(Cyl(0.015, 0.015, 0.45, 3), 0x5a4a30, { p: [0.42, 1.0, 0.15] }),             // the censer's chain
      P(Sph(0.11, 6, 4), 0x8a5a2a, { p: [0.42, 0.74, 0.15] }),
      P(Sph(0.07, 5, 3), 0, { p: [0.42, 0.8, 0.15], e: 1 }),                          // its crimson coals
      ...mirror((x) => P(Box(0.11, 0.48, 0.11), c2, { p: [0.36 * x, 1.18, 0.08], r: [0.15, 0, 0.18 * x] })),
    );
  }
  return merge(parts);
}

/** Run-event props (events.js): 'thief' (a hunched imp lugging a sack of stolen souls) or 'coffin' (an upright, chained,
 *  rune-cut coffin). Both face +z; parts with e: 1 glow in the mesh tint. */
export function eventGeometry(kind) {
  if (kind === 'thief') {
    const skin = 0x3b3046, dark = 0x1d1726, sack = 0x6e5434;
    return merge([
      ...mirror((x) => P(Cyl(0.05, 0.07, 0.36, 4), dark, { p: [0.12 * x, 0.18, 0.02], r: [0.2, 0, 0.12 * x] })),
      P(Sph(0.24, 6, 4), skin, { p: [0, 0.5, 0.04], s: [1, 1.05, 0.95], r: [0.55, 0, 0] }),
      P(Sph(0.19, 6, 4), skin, { p: [0, 0.78, 0.24] }),
      ...mirror((x) => P(Cone(0.07, 0.36, 4), skin, { p: [0.22 * x, 0.9, 0.18], r: [0.25, 0, -1.15 * x] })),
      ...mirror((x) => P(Sph(0.04, 4, 3), 0, { p: [0.07 * x, 0.82, 0.41], e: 1 })),
      P(Box(0.12, 0.03, 0.03), 0xe0d2a4, { p: [0, 0.71, 0.4] }),
      ...mirror((x) => P(Cyl(0.035, 0.05, 0.4, 4), dark, { p: [0.21 * x, 0.66, -0.02], r: [-1.0, 0, 0.45 * x] })),
      P(Sph(0.34, 7, 5), sack, { p: [0, 0.78, -0.36], s: [1, 1.08, 0.95] }),
      P(Cyl(0.07, 0.11, 0.14, 6), sack, { p: [0, 1.14, -0.34] }),
      P(Tor(0.1, 0.025, 3, 8), 0, { p: [0, 1.08, -0.34], r: [Math.PI / 2, 0, 0], e: 1 }),
      ...[[0.1, 1.24, -0.32], [-0.08, 1.2, -0.28], [0.02, 1.32, -0.38], [0.2, 0.96, -0.12], [-0.22, 0.7, -0.2]].map((p, i) => P(Oct(0.05 + (i % 2) * 0.02), 0, { p, e: 1 })),
    ]);
  }
  const wood = 0x2c1d17, lid = 0x3d2a20, iron = 0x4b4a55, earth = 0x1b1512;
  const outline = (k) => {
    const s = new THREE.Shape();
    s.moveTo(-0.25 * k, 0); s.lineTo(0.25 * k, 0); s.lineTo(0.44 * k, 1.45); s.lineTo(0.31 * k, 2.08); s.lineTo(-0.31 * k, 2.08); s.lineTo(-0.44 * k, 1.45); s.closePath();
    return s;
  };
  const slab = (k, depth) => { const g = new THREE.ExtrudeGeometry(outline(k), { depth, bevelEnabled: false }); g.translate(0, 0, -depth / 2); return g; };
  const g = merge([
    P(slab(1, 0.36), wood),
    P(slab(0.84, 0.06), lid, { p: [0, 0.14, 0.2], s: [1, 0.88, 1] }),
    P(Box(0.08, 0.78, 0.05), 0, { p: [0, 1.22, 0.25], e: 1 }),
    P(Box(0.4, 0.08, 0.05), 0, { p: [0, 1.42, 0.25], e: 1 }),
    P(Box(0.82, 0.07, 0.44), iron, { p: [0, 1.72, 0], r: [0, 0, 0.12] }),
    P(Box(0.74, 0.07, 0.44), iron, { p: [0, 0.62, 0], r: [0, 0, -0.1] }),
    ...[[-0.24, 1.86], [0.22, 0.4], [-0.16, 0.34], [0.26, 1.6]].map(([x, y]) => P(Box(0.05, 0.12, 0.04), 0, { p: [x, y, 0.22], r: [0, 0, x * 2], e: 1 })),
    P(Ico(0.07), 0, { p: [0, 1.95, 0.23], e: 1 }),
  ]);
  g.rotateX(-0.3); // leans back, toward the top of the screen
  return merge([g, P(Dod(0.55), earth, { p: [0, 0.02, 0.05], s: [1.5, 0.3, 1.1] })]);
}

export function bossGeometry() {
  const bone = 0x5a4e46, dark = 0x1e1822, metal = 0x6a5a78;
  return merge([
    P(Cone(1.25, 1.8, 9), dark, { p: [0, 0.9, 0] }),
    P(Dod(1.0), bone, { p: [0, 2.2, 0], s: [1.35, 1.1, 1.0] }),
    P(Oct(0.35), 0, { p: [0, 2.25, 0.9], e: 1 }),
    ...[-1, 0, 1].map((i) => P(Box(0.08, 0.7, 0.08), 0, { p: [i * 0.45, 2.2, 0.88], r: [0, 0, i * 0.7], e: 1 })),
    P(Sph(0.55, 8, 6), bone, { p: [0, 3.25, 0.35] }),
    P(Box(0.7, 0.25, 0.5), bone, { p: [0, 2.9, 0.65], r: [0.3, 0, 0] }),
    ...[-0.25, -0.08, 0.08, 0.25].map((x) => P(Cone(0.05, 0.22, 4), 0xe8dfc5, { p: [x, 2.75, 0.88], r: [Math.PI, 0, 0] })),
    ...mirror((x) => P(Sph(0.09, 5, 4), 0, { p: [0.2 * x, 3.32, 0.82], e: 1 })),
    P(Cyl(0.55, 0.6, 0.25, 8), metal, { p: [0, 3.72, 0.3] }),
    ...[0, 1, 2, 3, 4, 5].map((i) => {
      const a = (i / 6) * Math.PI * 2;
      return P(Cone(0.12, 0.7 + (i % 2) * 0.3, 5), 0, { p: [Math.sin(a) * 0.5, 4.05, 0.3 + Math.cos(a) * 0.5], r: [Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3], e: 1 });
    }),
    ...mirror((x) => P(Dod(0.45), bone, { p: [1.35 * x, 2.75, 0] })),
    ...mirror((x) => P(Cyl(0.25, 0.3, 1.6, 7), dark, { p: [1.55 * x, 1.9, 0.35], r: [0.6, 0, 0.25 * x] })),
    ...mirror((x) => P(Dod(0.42), bone, { p: [1.65 * x, 1.3, 0.95] })),
    ...mirror((x) => [0, 1, 2].map((i) => P(Cone(0.07, 0.5, 4), 0xe8dfc5, { p: [1.65 * x + (i - 1) * 0.18, 1.05, 1.3], r: [1.4, 0, 0] }))).flat(),
    ...mirror((x) => P(Cone(0.18, 1.0, 5), bone, { p: [0.9 * x, 3.4, -0.4], r: [-0.7, 0, -0.5 * x] })),
  ]);
}

// ---------------------------------------------------------------- skull (Skull Halo weapon)
export function skullGeometry() {
  const bone = 0xd8cfb4;
  return merge([
    P(Sph(0.22, 7, 5), bone, { p: [0, 0.05, 0] }),
    P(Box(0.22, 0.12, 0.16), bone, { p: [0, -0.12, 0.06] }),
    ...mirror((x) => P(Sph(0.06, 5, 3), 0xff7a2e, { p: [0.08 * x, 0.06, 0.18], e: 2 })),
  ]);
}

/** A Soul Urn (urns.js): a pale bone-and-bronze funerary urn with a lid, its soul band and slits glowing cyan. */
export function urnGeometry() {
  const bone = 0xc8bca2, bronze = 0x6a4e2e, glow = 0x7ff8ff;
  const prof = [[0.01, 0], [0.24, 0], [0.3, 0.12], [0.37, 0.4], [0.35, 0.62], [0.25, 0.82], [0.18, 0.9], [0.22, 0.98], [0.01, 0.99]].map(([x, y]) => new THREE.Vector2(x, y));
  return merge([
    P(new THREE.LatheGeometry(prof, 10), bone),
    P(Cyl(0.385, 0.385, 0.07, 10), bronze, { p: [0, 0.5, 0] }),
    P(Cyl(0.39, 0.39, 0.03, 10), glow, { p: [0, 0.5, 0], e: 2 }),
    P(Sph(0.13, 6, 4), bronze, { p: [0, 1.04, 0], s: [1, 0.7, 1] }),
    P(Sph(0.05, 4, 3), glow, { p: [0, 1.12, 0], e: 2 }),
    ...[0, 1, 2, 3].map((k) => P(Box(0.05, 0.16, 0.04), glow, { p: [Math.cos(k * 1.571) * 0.33, 0.3, Math.sin(k * 1.571) * 0.33], r: [0, -k * 1.571, 0], e: 2 })),
  ]);
}

/** Gravefall's tombstone (arsenal.js): a carved headstone on a plinth, its cross and skull glowing moonlight blue. */
export function tombstoneGeometry() {
  const stone = 0x5a6274, dark = 0x343a48, glow = 0xa9c8ff;
  return merge([
    P(Box(0.72, 0.9, 0.2), stone, { p: [0, 0.55, 0] }),
    P(Cyl(0.36, 0.36, 0.2, 10), stone, { p: [0, 1.0, 0], r: [Math.PI / 2, 0, 0] }),
    P(Box(0.95, 0.16, 0.4), dark, { p: [0, 0.08, 0.02] }),
    P(Box(0.07, 0.4, 0.04), glow, { p: [0, 0.68, 0.11], e: 2 }),
    P(Box(0.26, 0.07, 0.04), glow, { p: [0, 0.76, 0.11], e: 2 }),
    ...mirror((x) => P(Sph(0.035, 4, 3), glow, { p: [0.09 * x, 1.05, 0.11], e: 2 })),
  ]);
}

// ---------------------------------------------------------------- props (decor)
export function propGeometry(type) {
  const stone = 0x2a3140, stone2 = 0x1d232f;
  if (type === 'tomb') {
    return merge([
      P(Box(0.7, 0.85, 0.2), stone, { p: [0, 0.42, 0] }),
      P(Cyl(0.35, 0.35, 0.2, 8, ), stone, { p: [0, 0.85, 0], r: [Math.PI / 2, 0, 0], s: [1, 1, 1] }),
      P(Box(0.9, 0.12, 0.45), stone2, { p: [0, 0.06, 0.05] }),
      P(Box(0.06, 0.32, 0.03), 0, { p: [0, 0.55, 0.11], e: 1 }),
      P(Box(0.22, 0.05, 0.03), 0, { p: [0, 0.6, 0.11], e: 1 }),
    ]);
  }
  if (type === 'pillar') {
    return merge([
      P(Box(0.95, 0.3, 0.95), stone2, { p: [0, 0.15, 0] }),
      P(Cyl(0.34, 0.38, 1.9, 8), stone, { p: [0, 1.25, 0] }),
      P(Cyl(0.3, 0.34, 0.4, 8), stone, { p: [0.05, 2.35, 0], r: [0.15, 0, 0.2] }),
      P(Tor(0.4, 0.04, 3, 10), 0, { p: [0, 1.2, 0], r: [Math.PI / 2, 0, 0], e: 1 }),
    ]);
  }
  if (type === 'crystal') {
    return merge([
      P(Oct(0.35), 0x7ff6ff, { p: [0, 0.55, 0], s: [0.6, 1.8, 0.6], e: 2 }),
      P(Oct(0.25), 0x4ad8ff, { p: [0.3, 0.35, 0.1], s: [0.6, 1.6, 0.6], r: [0, 0, -0.5], e: 2 }),
      P(Oct(0.22), 0x4ad8ff, { p: [-0.25, 0.3, -0.12], s: [0.6, 1.5, 0.6], r: [0.3, 0, 0.6], e: 2 }),
      P(Dod(0.35), stone2, { p: [0, 0.05, 0], s: [1.4, 0.4, 1.2] }),
    ]);
  }
  if (type === 'brazier') {
    return merge([
      P(Cyl(0.08, 0.14, 0.9, 6), 0x3a3030, { p: [0, 0.45, 0] }),
      P(Cyl(0.42, 0.22, 0.28, 8), 0x4a3a32, { p: [0, 1.0, 0] }),
      P(Cone(0.3, 0.55, 6), 0xff8a2a, { p: [0, 1.38, 0], e: 2 }),
      P(Cone(0.18, 0.4, 5), 0xffd27a, { p: [0.05, 1.3, 0.05], e: 2 }),
      ...[0, 1, 2].map((i) => P(Cyl(0.03, 0.03, 0.6, 4), 0x3a3030, { p: [Math.cos(i * 2.1) * 0.22, 0.25, Math.sin(i * 2.1) * 0.22], r: [Math.sin(i * 2.1) * 0.5, 0, -Math.cos(i * 2.1) * 0.5] })),
    ]);
  }
  if (type === 'bones') {
    const b = 0xb9b09a;
    return merge([
      P(Sph(0.16, 6, 4), b, { p: [0, 0.12, 0] }),
      ...mirror((x) => P(Sph(0.035, 4, 3), 0x101010, { p: [0.05 * x, 0.14, 0.14] })),
      P(Cyl(0.03, 0.03, 0.6, 4), b, { p: [0.25, 0.04, 0.1], r: [0, 0.5, Math.PI / 2] }),
      P(Cyl(0.03, 0.03, 0.5, 4), b, { p: [-0.2, 0.04, -0.15], r: [0, -0.9, Math.PI / 2] }),
      P(Cyl(0.025, 0.025, 0.45, 4), b, { p: [0.05, 0.04, -0.25], r: [0, 1.4, Math.PI / 2] }),
    ]);
  }
  if (type === 'tree') {
    const w = 0x1c1614;
    return merge([
      P(Cyl(0.1, 0.22, 2.2, 6), w, { p: [0, 1.1, 0], r: [0.05, 0, 0.08] }),
      P(Cyl(0.04, 0.08, 1.1, 5), w, { p: [0.35, 2.1, 0], r: [0, 0, -0.9] }),
      P(Cyl(0.03, 0.07, 0.9, 5), w, { p: [-0.3, 1.9, 0.1], r: [0.2, 0, 0.8] }),
      P(Cyl(0.02, 0.05, 0.7, 5), w, { p: [0.1, 2.45, -0.2], r: [-0.5, 0, -0.2] }),
      P(Ico(0.07), 0, { p: [0.72, 2.45, 0], e: 1 }),
    ]);
  }
  // lantern post
  return merge([
    P(Cyl(0.04, 0.06, 1.8, 5), 0x262a32, { p: [0, 0.9, 0] }),
    P(Box(0.4, 0.04, 0.04), 0x262a32, { p: [0.15, 1.75, 0] }),
    P(Box(0.18, 0.26, 0.18), 0x7ff6ff, { p: [0.3, 1.55, 0], e: 1 }),
  ]);
}
export const PROP_TYPES = ['tomb', 'pillar', 'crystal', 'brazier', 'bones', 'tree', 'post'];

// ---------------------------------------------------------------- simple FX geometries
export const boltGeometry = () => { const g = new THREE.OctahedronGeometry(0.16, 0); g.scale(0.8, 0.8, 2.4); return g; };
export const spearGeometry = () => { const g = new THREE.ConeGeometry(0.09, 1.3, 5); g.rotateX(Math.PI / 2); return g; };
export const orbGeometry = () => new THREE.IcosahedronGeometry(0.2, 1);
export const wispGeometry = () => { const g = new THREE.IcosahedronGeometry(0.16, 0); return g; };
export const gemGeometry = () => { const g = new THREE.OctahedronGeometry(0.16, 0); g.scale(0.8, 1.25, 0.8); return g; };
