import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GeoBuilder } from '../src/render/core/GeoBuilder';
import { sweep, lathe, limb, capsuleProfile, gradeY } from '../src/render/models/soft';

/** Fraction of triangles whose face normal points away from `centre(p)` (outward winding). */
function outward(geo: THREE.BufferGeometry, centre: (p: THREE.Vector3) => THREE.Vector3): number {
  const P = geo.attributes.position as THREE.BufferAttribute;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const m = new THREE.Vector3();
  let ok = 0;
  let total = 0;
  for (let i = 0; i < P.count; i += 3) {
    a.fromBufferAttribute(P, i);
    b.fromBufferAttribute(P, i + 1);
    c.fromBufferAttribute(P, i + 2);
    n.subVectors(b, a).cross(m.subVectors(c, a));
    if (n.lengthSq() < 1e-12) continue;
    m.copy(a).add(b).add(c).divideScalar(3);
    total++;
    if (n.dot(m.clone().sub(centre(m))) > 0) ok++;
  }
  return ok / Math.max(1, total);
}

describe('soft shape kit', () => {
  it('sweep builds a closed, outward-facing tube with smooth normals', () => {
    const b = new GeoBuilder(3);
    // straight tube along +X from 0 to 1, radius 0.1 -> 0.05 (both ends capped)
    sweep(b, [0, 0, 0, 0.1, 0.5, 0, 0, 0.08, 1, 0, 0, 0.05], 8, '#ffffff');
    const geo = b.build();
    expect(geo.attributes.position.count).toBeGreaterThan(100);
    const frac = outward(geo, (p) => new THREE.Vector3(Math.min(1, Math.max(0, p.x)), 0, 0));
    expect(frac).toBeGreaterThan(0.97);
    const bb = geo.boundingBox!;
    expect(bb.min.x).toBeLessThan(-0.08); // round cap past the first point
    expect(bb.max.x).toBeGreaterThan(1.03);
  });

  it('sweep ends in a point when the last radius is ~0 (horns, claws)', () => {
    const b = new GeoBuilder(3);
    sweep(b, [0, 0, 0, 0.1, 0, 0.5, 0.1, 0.05, 0, 1, 0.3, 0], 6, '#ffffff');
    const geo = b.build();
    expect(geo.boundingBox!.max.y).toBeCloseTo(1, 2);
  });

  it('lathe and limb face outward', () => {
    const b = new GeoBuilder(3);
    lathe(b, capsuleProfile(0.1, 0, 0.2, 1), 10, 0, 0, 0, '#ffffff');
    expect(outward(b.build(), (p) => new THREE.Vector3(0, Math.min(1, Math.max(0, p.y)), 0))).toBeGreaterThan(0.97);
    const l = new GeoBuilder(3);
    limb(l, 0.08, 0.06, 0.3, 0, 0, 0, '#ffffff');
    const g = l.build();
    expect(outward(g, (p) => new THREE.Vector3(0, Math.min(0, Math.max(-0.3, p.y)), 0))).toBeGreaterThan(0.97);
    expect(g.boundingBox!.max.y).toBeCloseTo(0.08, 2);
    expect(g.boundingBox!.min.y).toBeCloseTo(-0.36, 2);
  });

  it('gradeY darkens toward y0 and leaves glow vertices alone', () => {
    const b = new GeoBuilder(3);
    b.box(1, 1, 1, 0, 0.5, 0, '#ffffff');
    const geo = gradeY(b.build(), 0, 1, 0.5, 1);
    const P = geo.attributes.position;
    const C = geo.attributes.color;
    for (let i = 0; i < P.count; i++) expect(C.getX(i)).toBeCloseTo(0.5 + 0.5 * P.getY(i), 4);
  });
});
