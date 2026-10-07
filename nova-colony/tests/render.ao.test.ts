/**
 * Baked vertex ambient occlusion (render/core/ao.ts): the pure response curves, and the bake itself
 * on small GeoBuilder scenes — contact with the ground and with neighbouring boxes darkens lit
 * vertices, free-standing faces stay bright, glow / glass vertices are never touched, and every
 * registered model still bakes quickly enough for lazy building at runtime.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GeoBuilder, SLOT_GLOW, SLOT_GLASS } from '../src/render/core/GeoBuilder';
import { bakeVertexAO, subdivideLargeTriangles, aoHitWeight, aoShade, AO_DEFAULTS } from '../src/render/core/ao';
import { createDataRegistry } from '../src/data';
import { tierStyle } from '../src/render/core/palette';
import { buildModel, registeredModelKeys, pieceGeometry, nodeGeometry } from '../src/render/models';

const WHITE = '#ffffff';

/** Mean colour (linear) of the vertices of `geo` selected by `pick(position, normal)`. */
function meanColor(geo: THREE.BufferGeometry, pick: (p: THREE.Vector3, n: THREE.Vector3) => boolean): number {
  const P = geo.attributes.position as THREE.BufferAttribute;
  const N = geo.attributes.normal as THREE.BufferAttribute;
  const C = geo.attributes.color as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  let sum = 0;
  let count = 0;
  for (let i = 0; i < P.count; i++) {
    p.fromBufferAttribute(P, i);
    n.fromBufferAttribute(N, i);
    if (!pick(p, n)) continue;
    sum += C.getX(i);
    count++;
  }
  expect(count).toBeGreaterThan(0);
  return sum / count;
}

describe('baked vertex AO', () => {
  it('response curves: touching occluders darken most, hits at the radius still count, strength scales the shade', () => {
    expect(aoHitWeight(0, 1)).toBe(1);
    expect(aoHitWeight(1, 1)).toBeCloseTo(0.4);
    expect(aoHitWeight(2, 1)).toBeCloseTo(0.4); // clamped
    expect(aoHitWeight(0.5, 1)).toBeGreaterThan(aoHitWeight(0.75, 1));
    expect(aoShade(0)).toBe(1);
    expect(aoShade(1)).toBeCloseTo(1 - AO_DEFAULTS.strength);
    expect(aoShade(1, 0.3)).toBeCloseTo(0.7);
    expect(aoShade(2, 0.3)).toBeCloseTo(0.7); // clamped
    expect(aoShade(0.5, 0.5)).toBeCloseTo(0.75);
  });

  it('subdivision splits only oversized triangles, keeps colours / slots / normals, and is bounded', () => {
    const b = new GeoBuilder(9);
    b.box(6, 0.4, 6, 0, 0.2, 0, '#ff8000'); // big slab: 6-unit faces split, 0.4-unit edges alone
    b.box(0.5, 0.5, 0.5, 2, 0.65, 2, '#00ff00', { slot: SLOT_GLOW }); // small: untouched
    const geo = b.build(false);
    const before = geo.attributes.position.count;
    expect(subdivideLargeTriangles(geo, 2.4)).toBe(true);
    const after = geo.attributes.position.count;
    expect(after).toBeGreaterThan(before);
    expect(after % 3).toBe(0);
    // one bisection at most: a triangle becomes at most 2, so the slab's 12 triangles cap at 24 + 12 of the cube
    expect(after / 3).toBeLessThanOrEqual(12 * 2 + 12);
    const C = geo.attributes.color as THREE.BufferAttribute;
    const S = geo.attributes.aSlot as THREE.BufferAttribute;
    const N = geo.attributes.normal as THREE.BufferAttribute;
    let glow = 0;
    for (let i = 0; i < S.count; i++) {
      if (S.getX(i) === SLOT_GLOW) {
        glow++;
        expect(C.getY(i)).toBeCloseTo(1, 5);
      } else expect(C.getX(i)).toBeCloseTo(new THREE.Color('#ff8000').r, 5);
      expect(Math.hypot(N.getX(i), N.getY(i), N.getZ(i))).toBeCloseTo(1, 3);
    }
    expect(glow).toBe(36); // the cube's 12 triangles
    // nothing oversized: no rewrite
    const small = new GeoBuilder(9).box(1, 1, 1, 0, 0.5, 0, WHITE).build(false);
    expect(subdivideLargeTriangles(small, 2.4)).toBe(false);
  });

  it('a box on the ground is darkest at its base, bright on top; without the ground plane it stays even', () => {
    const grounded = new GeoBuilder(1).box(2, 2, 2, 0, 1, 0, WHITE).build(true);
    const top = meanColor(grounded, (_p, n) => n.y > 0.9);
    const sideLow = meanColor(grounded, (p, n) => Math.abs(n.y) < 0.1 && p.y < 0.1);
    const sideHigh = meanColor(grounded, (p, n) => Math.abs(n.y) < 0.1 && p.y > 1.9);
    expect(top).toBeGreaterThan(0.97);
    expect(sideHigh).toBeGreaterThan(0.95);
    expect(sideLow).toBeLessThan(0.9);
    expect(sideLow).toBeGreaterThan(0.6); // a grounding gradient, not a black band
    const floating = new GeoBuilder(1).box(2, 2, 2, 0, 1, 0, WHITE).build({ ground: false });
    const floatLow = meanColor(floating, (p, n) => Math.abs(n.y) < 0.1 && p.y < 0.1);
    expect(floatLow).toBeGreaterThan(0.97);
  });

  it('a crate standing on a slab darkens the slab top around it and its own base', () => {
    const slabOnly = new GeoBuilder(2).box(2, 0.4, 2, 0, 0.2, 0, WHITE).build({ ground: false });
    const b = new GeoBuilder(2);
    b.box(2, 0.4, 2, 0, 0.2, 0, WHITE); // slab
    b.box(1, 1.5, 1, 0, 0.4 + 0.75, 0, WHITE); // crate in the middle
    const geo = b.build({ ground: false });
    const topPick = (p: THREE.Vector3, n: THREE.Vector3) => n.y > 0.9 && Math.abs(p.y - 0.4) < 0.01 && Math.abs(p.x) > 0.9;
    const bareTop = meanColor(slabOnly, topPick);
    const crowdedTop = meanColor(geo, topPick);
    expect(bareTop).toBeGreaterThan(0.97);
    expect(crowdedTop).toBeLessThan(bareTop - 0.01);
    // crate side vertices where it meets the slab vs its top edge
    const crateLow = meanColor(geo, (p, n) => Math.abs(n.y) < 0.1 && Math.abs(p.y - 0.4) < 0.01);
    const crateHigh = meanColor(geo, (p, n) => Math.abs(n.y) < 0.1 && Math.abs(p.y - 1.9) < 0.01);
    expect(crateLow).toBeLessThan(crateHigh - 0.05);
  });

  it('a roof overhang shades the wall beneath it', () => {
    const b = new GeoBuilder(3);
    b.box(2, 2, 2, 0, 1, 0, WHITE); // wall block
    b.box(3.2, 0.2, 3.2, 0, 2.1, 0, WHITE); // roof slab with a 0.6 overhang on every side
    const geo = b.build(true);
    const underEave = meanColor(geo, (p, n) => Math.abs(n.y) < 0.1 && p.y > 1.9 && p.y < 2.01);
    const openWallTop = meanColor(new GeoBuilder(3).box(2, 2, 2, 0, 1, 0, WHITE).build(true), (p, n) => Math.abs(n.y) < 0.1 && p.y > 1.9);
    expect(underEave).toBeLessThan(openWallTop - 0.08);
  });

  it('never darkens glow or glass vertices and leaves geometry without colours alone', () => {
    const b = new GeoBuilder(4);
    b.box(2, 0.4, 2, 0, 0.2, 0, WHITE);
    b.box(0.5, 0.5, 0.5, 0, 0.65, 0, '#80ff80', { slot: SLOT_GLOW });
    b.box(0.5, 0.5, 0.5, 1, 0.65, 0, WHITE, { slot: SLOT_GLASS });
    const geo = b.build(true);
    const S = geo.attributes.aSlot as THREE.BufferAttribute;
    const C = geo.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < S.count; i++) {
      if (S.getX(i) === SLOT_GLOW) {
        expect(C.getX(i)).toBeCloseTo(new THREE.Color('#80ff80').r, 5);
        expect(C.getY(i)).toBeCloseTo(1, 5);
      } else if (S.getX(i) === SLOT_GLASS) expect(C.getX(i)).toBeCloseTo(1, 5);
    }
    const bare = new THREE.BufferGeometry();
    bare.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    expect(bakeVertexAO(bare)).toBe(bare);
  });

  it('model builds carry AO (a wall piece and a tree are darker at the base than higher up) and stay cheap to bake', () => {
    const data = createDataRegistry();
    const wall = pieceGeometry('wall_full', tierStyle(data.tier(3)));
    const low = meanColor(wall, (p, n) => Math.abs(n.y) < 0.1 && p.y < 0.3);
    const high = meanColor(wall, (p, n) => Math.abs(n.y) < 0.1 && p.y > 2.0 && p.y < 2.6);
    expect(low).toBeLessThan(high);
    const tree = nodeGeometry('tree_round');
    // the trunk's ground ring is darkened against its painted colour (shade jitter is ±5%)
    const trunkLow = meanColor(tree, (p, n) => Math.abs(n.y) < 0.2 && p.y < 0.2);
    expect(trunkLow).toBeLessThan(new THREE.Color('#7a4f2a').r * 0.93);
    // the canopy's underside is shaded by the rest of the crown, its top is in the open
    const crownUnder = meanColor(tree, (p, n) => n.y < -0.5 && p.y > 1.2 && p.y < 2.0);
    const crownTop = meanColor(tree, (p, n) => n.y > 0.5 && p.y > 3.4);
    expect(crownUnder).toBeLessThan(crownTop);
    // every registered model at one tier: lazy runtime builds must not hitch
    const keys = registeredModelKeys();
    const t0 = performance.now();
    for (const key of keys) {
      const def = data.buildings.find((x) => x.model === key);
      buildModel(key, tierStyle(data.tier(5)), 2, def);
    }
    const perModel = (performance.now() - t0) / keys.length;
    expect(perModel).toBeLessThan(60);
  });
});
