/**
 * Renderer culling / batching regressions: chunk bucketing, LOD radii and the pop-free LOD band,
 * Batch cull / fade / shadow-depth options, dithered shadows for fading buildings and roofs, and the
 * Nature actor drawing only what the camera frustum sees (no WebGL needed: three.js objects only).
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Game } from '../src/core/Game';
import { createMockServices } from '../src/platform/mock';
import { Batch } from '../src/render/core/Batch';
import { Materials, SHADOW_FADE_GAIN } from '../src/render/core/materials';
import type { Env, RenderContext } from '../src/render/core/context';
import { sightTargets } from '../src/render/core/context';
import { Nature, chunkOf, lodRadii, lodClass, lodWindows, LOD_BAND, LOD_MARGIN, LOD_HYST, LOD_NEAR, LOD_BAND_CLASS, LOD_FAR, CHUNKS_PER_SIDE, CHUNK_CELLS } from '../src/render/actors/Nature';
import { Buildings } from '../src/render/actors/Buildings';
import { Pois } from '../src/render/actors/Pois';
import { ViewCull } from '../src/render/core/cull';
import { nodeGeometry, nodeGeometryFar, NODE_FAR_MODELS } from '../src/render/models/nature';
import { HALF_WORLD, WORLD_CELLS, CENTER_CELL } from '../src/core/constants';

function makeCtx(game: Game): RenderContext {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 844 / 390, 0.5, 1800);
  const env: Env = { t: 0, dt: 0, night: 0, sunElev: 1, quality: 'medium', cx: 0, cz: 0, viewRadius: 104, camX: 0, camY: 18, camZ: 26, fwdX: 0, fwdZ: -1, terrainVersion: 0 };
  const particles = { chips() {}, dust() {}, scale: 1 } as unknown as RenderContext['particles'];
  return { game, scene, camera, mats: new Materials(), env, heightAt: () => 0, particles };
}

/** Place the camera like the rig does: at target + (sin yaw·d, h, cos yaw·d) looking at the target. */
function aim(ctx: RenderContext, tx: number, tz: number, yaw: number, dist = 26, pitch = 0.71): void {
  const cam = ctx.camera;
  const cx = tx + Math.sin(yaw) * dist * Math.cos(pitch);
  const cy = dist * Math.sin(pitch) + 1.1;
  const cz = tz + Math.cos(yaw) * dist * Math.cos(pitch);
  cam.position.set(cx, cy, cz);
  cam.lookAt(tx, 1.1, tz);
  cam.updateMatrixWorld();
  const env = ctx.env;
  env.cx = tx;
  env.cz = tz;
  env.camX = cx;
  env.camY = cy;
  env.camZ = cz;
  env.fwdX = -Math.sin(yaw);
  env.fwdZ = -Math.cos(yaw);
}

function drawnTriangles(scene: THREE.Scene): { tris: number; draws: number } {
  let tris = 0;
  let draws = 0;
  scene.traverse((o) => {
    const m = o as THREE.InstancedMesh;
    if (!m.isInstancedMesh || !m.visible || m.count === 0) return;
    draws++;
    tris += (m.geometry.attributes.position.count / 3) * m.count;
  });
  return { tris, draws };
}

describe('render culling', () => {
  it('buckets world positions into an 8x8 chunk grid', () => {
    expect(CHUNKS_PER_SIDE * CHUNK_CELLS).toBe(WORLD_CELLS);
    expect(chunkOf(-HALF_WORLD, -HALF_WORLD)).toBe(0);
    expect(chunkOf(HALF_WORLD - 0.01, HALF_WORLD - 0.01)).toBe(CHUNKS_PER_SIDE * CHUNKS_PER_SIDE - 1);
    expect(chunkOf(0, 0)).toBe(CHUNKS_PER_SIDE / 2 + (CHUNKS_PER_SIDE / 2) * CHUNKS_PER_SIDE);
    // out-of-world positions clamp instead of indexing outside the grid
    expect(chunkOf(-9999, 9999)).toBe((CHUNKS_PER_SIDE - 1) * CHUNKS_PER_SIDE);
  });

  it('LOD radii grow with the view radius, props closer than nodes, low quality tighter', () => {
    const m = lodRadii(104, 'medium');
    expect(m.near).toBeLessThan(m.mid);
    expect(m.near).toBeGreaterThan(60);
    expect(lodRadii(104, 'low').near).toBeLessThan(m.near);
    expect(lodRadii(300, 'medium').mid).toBe(190); // capped
  });

  it('far-LOD node geometry is cheaper than the near geometry for every heavy model', () => {
    expect(NODE_FAR_MODELS).toContain('tree_round');
    for (const m of NODE_FAR_MODELS) {
      expect(nodeGeometryFar(m).attributes.position.count, m).toBeLessThan(nodeGeometry(m).attributes.position.count);
    }
    // models without a far variant reuse the near geometry (same object, no extra memory)
    expect(nodeGeometryFar('scrap')).toBe(nodeGeometry('scrap'));
  });

  it('Batch cull computes a bounding sphere around the written instances only', () => {
    const parent = new THREE.Group();
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const b = new Batch(parent, geo, new THREE.MeshBasicMaterial(), 4, { cull: true });
    const m = new THREE.Matrix4();
    b.begin();
    b.push(m.makeTranslation(100, 0, 0));
    b.push(m.makeTranslation(104, 0, 0));
    b.end();
    expect(b.mesh.frustumCulled).toBe(true);
    const s = b.mesh.boundingSphere!;
    expect(s.center.x).toBeCloseTo(102, 5);
    expect(s.radius).toBeLessThan(4);
    expect(s.radius).toBeGreaterThan(2);
    b.begin();
    b.end();
    expect(b.mesh.frustumCulled).toBe(false); // empty batches never need a (stale) sphere
  });

  it('Batch fade keeps a private geometry wrapper with a per-instance aFade attribute that survives growth', () => {
    const parent = new THREE.Group();
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const b = new Batch(parent, geo, new THREE.MeshBasicMaterial(), 2, { fade: true, color: true });
    expect(b.mesh.geometry).not.toBe(geo);
    expect(geo.getAttribute('aFade')).toBeUndefined();
    const m = new THREE.Matrix4();
    b.begin();
    b.push(m.identity(), undefined, 0.5);
    b.push(m.identity());
    b.push(m.identity(), undefined, 0.25); // grows past capacity 2
    b.end();
    const fade = b.mesh.geometry.getAttribute('aFade') as THREE.InstancedBufferAttribute;
    expect(fade.isInstancedBufferAttribute).toBe(true);
    expect(fade.getX(0)).toBeCloseTo(0.5);
    expect(fade.getX(1)).toBe(0);
    expect(fade.getX(2)).toBeCloseTo(0.25);
    b.setFade(1, 0.8);
    expect(fade.getX(1)).toBeCloseTo(0.8);
    // the wrapper shares vertex data with the model geometry (no copy)
    expect(b.mesh.geometry.getAttribute('position').array).toBe(geo.getAttribute('position').array);
    b.dispose();
  });

  it('materials expose a fade variant with a distinct program cache key', () => {
    const mats = new Materials();
    expect(mats.litFade).not.toBe(mats.lit);
    expect(mats.litFade.customProgramCacheKey()).not.toBe(mats.lit.customProgramCacheKey());
    mats.dispose();
  });

  it('sight targets: the player always, plus the build ghost in build mode, nothing on the map', () => {
    const game = new Game({ seed: 3, services: createMockServices() });
    game.start();
    const ctx = makeCtx(game);
    const out = new Float64Array(6);
    expect(sightTargets(ctx, out)).toBe(1);
    expect(out[0]).toBe(game.state.player.x);
    game.view.mode = 'build';
    game.view.build.def = 'wall';
    game.view.build.x = 130;
    game.view.build.z = 131;
    expect(sightTargets(ctx, out)).toBe(2);
    expect(out[3]).toBeCloseTo((130 + 0.5) * 2 - HALF_WORLD);
    game.view.mode = 'map';
    expect(sightTargets(ctx, out)).toBe(0);
  });

  it('Nature draws only nodes inside the camera frustum and re-culls when the camera turns', () => {
    const game = new Game({ seed: 11, services: createMockServices() });
    game.start();
    const gen = game.sys.world.gen!;
    expect(gen.nodes.length).toBeGreaterThan(1000);
    const ctx = makeCtx(game);
    const nature = new Nature(ctx);
    aim(ctx, 0, 0, 0);
    nature.update(1 / 60);
    const a = drawnTriangles(ctx.scene);
    const drawnA = nature.drawnCount;
    // a 190-unit disc around the origin holds far more nodes than the ~60-unit-deep view trapezoid
    let inDisc = 0;
    for (const n of gen.nodes) if (n.x * n.x + n.z * n.z < 134 * 134) inDisc++;
    expect(drawnA).toBeGreaterThan(20);
    expect(drawnA).toBeLessThan(inDisc * 0.5);
    // one InstancedMesh per model + LOD, not per chunk
    expect(a.draws).toBeLessThan(30);
    expect(a.draws).toBe(nature.batchCount);
    // everything drawn is on screen (margin-expanded frustum)
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(ctx.camera.projectionMatrix, ctx.camera.matrixWorldInverse));
    for (const p of frustum.planes) p.constant += 12;
    let offscreen = 0;
    ctx.scene.traverse((o) => {
      const m = o as THREE.InstancedMesh;
      if (!m.isInstancedMesh || !m.visible) return;
      const mat = new THREE.Matrix4();
      const pos = new THREE.Vector3();
      for (let i = 0; i < m.count; i++) {
        m.getMatrixAt(i, mat);
        pos.setFromMatrixPosition(mat);
        if (!frustum.containsPoint(pos)) offscreen++;
      }
    });
    expect(offscreen).toBe(0);
    // turn the camera around: a different set of nodes
    aim(ctx, 0, 0, Math.PI);
    nature.update(1 / 60);
    expect(nature.drawnCount).toBeGreaterThan(20);
    const b = drawnTriangles(ctx.scene);
    expect(b.tris).not.toBe(a.tris);
    // a tiny camera drift does not rebuild (same instance count), a 4-unit move does
    aim(ctx, 0.5, 0, Math.PI);
    nature.update(1 / 60);
    expect(drawnTriangles(ctx.scene).tris).toBe(b.tris);
    nature.dispose();
  });

  it('ViewCull goes stale on camera moves / turns, not on tiny drifts', () => {
    const game = new Game({ seed: 5, services: createMockServices() });
    game.start();
    const ctx = makeCtx(game);
    const cull = new ViewCull(9, 3, 0.08);
    aim(ctx, 0, 0, 0);
    expect(cull.stale(ctx.env, ctx.camera)).toBe(true);
    cull.sync(ctx.env, ctx.camera);
    expect(cull.stale(ctx.env, ctx.camera)).toBe(false);
    expect(cull.sphere(0, 0, -10, 1)).toBe(true); // ahead of the camera
    expect(cull.sphere(0, 0, 200, 1)).toBe(false); // behind it
    aim(ctx, 1, 0, 0.02);
    expect(cull.stale(ctx.env, ctx.camera)).toBe(false);
    aim(ctx, 5, 0, 0.02);
    expect(cull.stale(ctx.env, ctx.camera)).toBe(true);
    cull.sync(ctx.env, ctx.camera);
    aim(ctx, 5, 0, 0.3);
    expect(cull.stale(ctx.env, ctx.camera)).toBe(true);
  });

  it('Pois draws only the landmarks the camera can see', () => {
    const game = new Game({ seed: 11, services: createMockServices() });
    game.start();
    const gen = game.sys.world.gen!;
    const ctx = makeCtx(game);
    const pois = new Pois(ctx);
    aim(ctx, 0, 0, 0);
    pois.update(1 / 60);
    let drawn = 0;
    ctx.scene.traverse((o) => {
      const m = o as THREE.InstancedMesh;
      if (m.isInstancedMesh && m.visible) drawn += m.count;
    });
    expect(gen.pois.length).toBeGreaterThan(20);
    expect(drawn).toBeLessThan(gen.pois.length);
    pois.dispose();
  });

  it('LOD classes: near-only inside the band margin, both LODs across it, far-only beyond, band membership sticky', () => {
    const near = 90;
    const inner = near - LOD_BAND - LOD_MARGIN;
    const outer = near + LOD_MARGIN;
    expect(lodClass(inner - 1, near, LOD_NEAR)).toBe(LOD_NEAR);
    expect(lodClass(inner + 0.5, near, LOD_NEAR)).toBe(LOD_BAND_CLASS);
    expect(lodClass(near, near, LOD_NEAR)).toBe(LOD_BAND_CLASS);
    expect(lodClass(outer, near, LOD_FAR)).toBe(LOD_BAND_CLASS);
    expect(lodClass(outer + 0.5, near, LOD_NEAR)).toBe(LOD_FAR);
    expect(lodClass(outer + 0.5, near, LOD_FAR)).toBe(LOD_FAR);
    // hysteresis: a band node stays a band node until it is LOD_HYST past either boundary
    expect(lodClass(inner - LOD_HYST / 2, near, LOD_BAND_CLASS)).toBe(LOD_BAND_CLASS);
    expect(lodClass(inner - LOD_HYST - 0.01, near, LOD_BAND_CLASS)).toBe(LOD_NEAR);
    expect(lodClass(outer + LOD_HYST / 2, near, LOD_BAND_CLASS)).toBe(LOD_BAND_CLASS);
    expect(lodClass(outer + LOD_HYST + 0.01, near, LOD_BAND_CLASS)).toBe(LOD_FAR);
    // camera jitter of +-1 unit around a boundary never churns a band node
    for (const edge of [inner, outer]) {
      let cls = lodClass(edge === inner ? edge + 0.5 : edge - 0.5, near, LOD_NEAR);
      expect(cls).toBe(LOD_BAND_CLASS);
      for (let i = 0; i < 60; i++) {
        cls = lodClass(edge + Math.sin(i * 0.7), near, cls);
        expect(cls).toBe(LOD_BAND_CLASS);
      }
    }
    // the pure classes are only used where the live shader window is guaranteed fully open / closed:
    // a near-only node never has far geometry showing before the next rebuild (drift <= LOD_MARGIN)
    for (let d = 0; d <= inner; d += 0.25) {
      expect(lodClass(d, near, LOD_NEAR)).toBe(LOD_NEAR);
      expect(lodWindows(d + LOD_MARGIN, near, 140).near).toEqual([0, 1]);
    }
    for (let d = outer + 0.01; d < 140; d += 0.25) {
      expect(lodClass(d, near, LOD_NEAR)).toBe(LOD_FAR);
      expect(lodWindows(d - LOD_MARGIN, near, 140).far[1]).toBe(1);
    }
  });

  it('LOD dither windows: near and far geometry cover every pixel exactly once across the band, far fades out at mid', () => {
    const near = 90;
    const mid = 140;
    const bayer = Array.from({ length: 16 }, (_, i) => (i + 0.5) / 16);
    const survives = ([lo, hi]: [number, number], b: number) => b >= lo && b < hi;
    const shadow = ([lo, hi]: [number, number]): [number, number] => [Math.min(1, lo * SHADOW_FADE_GAIN), Math.min(1, hi * SHADOW_FADE_GAIN)];
    let crossfadeSteps = 0;
    for (let d = 0; d <= mid + 10; d += 0.25) {
      const w = lodWindows(d, near, mid);
      let nearPx = 0;
      for (const b of bayer) {
        const n = survives(w.near, b);
        const f = survives(w.far, b);
        if (d <= mid - LOD_BAND) expect(n !== f, `d=${d} b=${b}: exactly one LOD covers the pixel`).toBe(true);
        else expect(n, `near geometry never shows past the near radius (d=${d})`).toBe(false);
        if (d >= mid) expect(f, `far geometry is gone at the mid cutoff (d=${d})`).toBe(false);
        // the shadow pass keeps the complement too (the same gain on both edges)
        if (d <= mid - LOD_BAND) expect(survives(shadow(w.near), b) !== survives(shadow(w.far), b)).toBe(true);
        if (n) nearPx++;
      }
      if (nearPx > 0 && nearPx < 16) crossfadeSteps++;
    }
    expect(crossfadeSteps).toBeGreaterThan(20); // a real band, not a switch
    expect(lodWindows(near - LOD_BAND, near, mid).near).toEqual([0, 1]);
    expect(lodWindows(near - LOD_BAND / 2, near, mid).near[0]).toBeCloseTo(0.5);
    expect(lodWindows(near, near, mid).far).toEqual([0, 1]);
    // building fades: the shadow is fully gone before the surface reaches its faint ghost stipple
    expect(shadow([0.85, 1])[0]).toBe(1);
    expect(shadow([0.4, 1])[0]).toBeCloseTo(0.5);
  });

  it('materials: every dither variant has a shadow-depth twin with its own program cache key', () => {
    const mats = new Materials();
    const keys = new Set<string>();
    for (const m of [mats.lit, mats.litFade, mats.lodNear, mats.lodFar, mats.litFadeDepth, mats.lodNearDepth, mats.lodFarDepth]) keys.add(m.customProgramCacheKey());
    expect(keys.size).toBe(7);
    expect(mats.litFadeDepth).toBeInstanceOf(THREE.MeshDepthMaterial);
    expect(mats.lodNearDepth).toBeInstanceOf(THREE.MeshDepthMaterial);
    const fade = { value: 0 };
    const roofDepth = mats.makeRoofDepth(fade);
    expect(roofDepth).toBeInstanceOf(THREE.MeshDepthMaterial);
    // disposing a per-room material forgets it (no growth across roof rebuilds)
    const before = (mats as unknown as { all: THREE.Material[] }).all.length;
    roofDepth.dispose();
    expect((mats as unknown as { all: THREE.Material[] }).all.length).toBe(before - 1);
    mats.dispose();
  });

  it('Batch attaches the shadow-depth material to shadow-casting batches only and keeps it across growth', () => {
    const parent = new THREE.Group();
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const depth = new THREE.MeshDepthMaterial();
    const b = new Batch(parent, geo, new THREE.MeshBasicMaterial(), 1, { castShadow: true, fade: true, depthMaterial: depth, name: 'test' });
    expect(b.mesh.customDepthMaterial).toBe(depth);
    expect(b.mesh.name).toBe('test');
    const m = new THREE.Matrix4();
    b.begin();
    b.push(m.identity(), undefined, 0.3);
    b.push(m.identity(), undefined, 0.6); // grows: a new InstancedMesh
    b.end();
    expect(b.mesh.customDepthMaterial).toBe(depth);
    expect((b.mesh.geometry.getAttribute('aFade') as THREE.BufferAttribute).getX(1)).toBeCloseTo(0.6);
    const noShadow = new Batch(parent, geo, new THREE.MeshBasicMaterial(), 1, { fade: true, depthMaterial: depth });
    expect(noShadow.mesh.customDepthMaterial).toBeUndefined();
    b.dispose();
    noShadow.dispose();
  });

  it('Nature draws band nodes in both LOD batches with the dither materials, near nodes once without discard', () => {
    const game = new Game({ seed: 11, services: createMockServices() });
    game.start();
    const ctx = makeCtx(game);
    const mats = ctx.mats;
    const nature = new Nature(ctx);
    aim(ctx, 0, 0, 0);
    nature.update(1 / 60);
    const { near, mid } = lodRadii(ctx.env.viewRadius, ctx.env.quality);
    const inner = near - LOD_BAND - LOD_MARGIN;
    const outer = near + LOD_MARGIN;
    expect(nature.bandCount).toBeGreaterThan(3);
    const at = new Map<string, string[]>();
    const mat = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    let nearOnly = 0;
    let farOnly = 0;
    ctx.scene.traverse((o) => {
      const im = o as THREE.InstancedMesh;
      if (!im.isInstancedMesh || !im.visible || im.count === 0) return;
      const kind = im.name.split(' ')[1].split(':')[0];
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, mat);
        pos.setFromMatrixPosition(mat);
        const d = Math.hypot(pos.x - ctx.env.cx, pos.z - ctx.env.cz);
        const key = `${pos.x.toFixed(3)},${pos.z.toFixed(3)}`;
        const list = at.get(key) ?? [];
        list.push(kind);
        at.set(key, list);
        if (kind === 'n') {
          expect(d, 'near-only nodes stay inside the band margin').toBeLessThanOrEqual(inner);
          expect(im.material, 'the discard-free shared material').toBe(mats.set);
          expect(im.customDepthMaterial).toBeUndefined();
          nearOnly++;
        } else if (kind === 'tn') {
          expect(d).toBeGreaterThan(inner);
          expect(d).toBeLessThanOrEqual(outer);
          expect(im.material).toBe(mats.lodNear);
          expect(im.customDepthMaterial).toBe(mats.lodNearDepth);
          expect(im.castShadow).toBe(true);
        } else if (kind === 'f') {
          expect(d).toBeGreaterThan(inner);
          expect(d).toBeLessThanOrEqual(mid + LOD_MARGIN);
          expect(im.material).toBe(mats.lodFar);
          expect(im.customDepthMaterial).toBe(mats.lodFarDepth);
          if (d > outer) farOnly++;
        } else if (kind === 'p') {
          expect(d).toBeLessThanOrEqual(outer);
          expect(im.material, 'props fade out at the near radius').toBe(mats.lodNear);
        }
      }
    });
    expect(nearOnly).toBeGreaterThan(10);
    expect(farOnly).toBeGreaterThan(3);
    // every band node has exactly its near + far pair at the same position, never two near copies
    let pairs = 0;
    for (const kinds of at.values()) {
      const tn = kinds.filter((k) => k === 'tn').length;
      const f = kinds.filter((k) => k === 'f').length;
      const n = kinds.filter((k) => k === 'n').length;
      expect(n + tn).toBeLessThanOrEqual(1);
      if (tn) {
        expect(f).toBe(1);
        pairs++;
      }
    }
    expect(pairs).toBe(nature.bandCount);
    // the LOD uniforms follow the live camera every frame
    const u = (mats as unknown as { uLod: { value: THREE.Vector4 }; uLodFocus: { value: THREE.Vector2 } });
    expect(u.uLod.value.x).toBeCloseTo(near - LOD_BAND);
    expect(u.uLod.value.z).toBeCloseTo(mid - LOD_BAND);
    expect(u.uLodFocus.value.x).toBe(ctx.env.cx);
    nature.dispose();
  });

  it('Buildings give shadow-casting fade batches the fade depth material and roofs a dithered shadow', () => {
    const game = new Game({ seed: 3, services: createMockServices() });
    game.start();
    const ctx = makeCtx(game);
    // a 6x6 walled room next to the core gets an automatic roof
    const B = game.sys.buildings;
    const x0 = CENTER_CELL + 3;
    const z0 = CENTER_CELL + 3;
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
      if (i !== 0 && j !== 0 && i !== 5 && j !== 5) continue;
      expect(B.place(i === 0 && j === 2 ? 'door' : 'wall', x0 + i, z0 + j, 0, { free: true, instant: true, tier: 0 })).not.toBeNull();
    }
    game.update(0.1);
    expect(game.derived.roofCells.size).toBeGreaterThan(0);
    const buildings = new Buildings(ctx);
    aim(ctx, 0, 0, 0);
    buildings.update(1 / 60);
    let casters = 0;
    let roofs = 0;
    ctx.scene.traverse((o) => {
      const im = o as THREE.InstancedMesh;
      if (im.isInstancedMesh) {
        if (!im.castShadow || im.count === 0) return;
        casters++;
        expect(im.material).toBe(ctx.mats.litFade);
        expect(im.customDepthMaterial).toBe(ctx.mats.litFadeDepth);
        return;
      }
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && (mesh.material as THREE.Material).transparent && mesh.castShadow) {
        roofs++;
        expect(mesh.customDepthMaterial).toBeInstanceOf(THREE.MeshDepthMaterial);
      }
    });
    expect(casters).toBeGreaterThan(2); // core body + wall pieces + floors
    expect(roofs).toBeGreaterThan(0);
    // standing inside the room the roof turns see-through but keeps casting (dithered away in the depth pass)
    const p = game.state.player;
    p.x = (x0 + 2.5) * 2 - HALF_WORLD;
    p.z = (z0 + 2.5) * 2 - HALF_WORLD;
    for (let i = 0; i < 90; i++) buildings.update(1 / 60);
    let fadedRoofs = 0;
    ctx.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || (o as THREE.InstancedMesh).isInstancedMesh || !(mesh.material as THREE.Material).transparent) return;
      const mat = mesh.material as THREE.MeshLambertMaterial;
      if (mat.opacity < 0.5) {
        fadedRoofs++;
        expect(mesh.castShadow).toBe(true);
      }
    });
    expect(fadedRoofs).toBeGreaterThan(0);
    buildings.dispose();
  });

  it('Nature hides depleted nodes after the pop and shrinks occluders between camera and player', () => {
    const game = new Game({ seed: 11, services: createMockServices() });
    game.start();
    const gen = game.sys.world.gen!;
    const ctx = makeCtx(game);
    const nature = new Nature(ctx);
    // pick a solid node near the origin and look at it from behind the player
    let idx = -1;
    let best = Infinity;
    for (let i = 0; i < gen.nodes.length; i++) {
      const n = gen.nodes[i];
      if (!game.data.node(n.def)?.solid) continue;
      const d = n.x * n.x + n.z * n.z;
      if (d > 36 && d < best) {
        best = d;
        idx = i;
      }
    }
    expect(idx).toBeGreaterThanOrEqual(0);
    const node = gen.nodes[idx];
    const len = Math.hypot(node.x, node.z);
    // player 6 units beyond the node, camera on the near side: node sits on the sight line
    const p = game.state.player;
    p.x = (node.x / len) * (len + 6);
    p.z = (node.z / len) * (len + 6);
    const yaw = Math.atan2(-node.x, -node.z);
    aim(ctx, p.x, p.z, yaw, 30, 0.35);
    nature.update(1 / 60);
    const info0 = nature.nodeInfo(idx)!;
    expect(info0).not.toBeNull();
    // run the occluder scan + fade animation for a second
    for (let i = 0; i < 60; i++) nature.update(1 / 60);
    const m = new THREE.Matrix4();
    const s = new THREE.Vector3();
    let shrunk = false;
    ctx.scene.traverse((o) => {
      const im = o as THREE.InstancedMesh;
      if (!im.isInstancedMesh || !im.visible) return;
      const pos = new THREE.Vector3();
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, m);
        pos.setFromMatrixPosition(m);
        if (Math.abs(pos.x - node.x) < 1e-3 && Math.abs(pos.z - node.z) < 1e-3) {
          s.setFromMatrixScale(m);
          if (s.x < info0.radius / 0.9 * 0.5) shrunk = true;
        }
      }
    });
    expect(shrunk).toBe(true);
    // deplete it: pop animation, then gone from the draw list
    game.state.world.depleted[idx] = 1;
    game.bus.emit('gather:depleted', { node: idx, x: node.x, z: node.z } as never);
    for (let i = 0; i < 40; i++) nature.update(1 / 60);
    let present = false;
    ctx.scene.traverse((o) => {
      const im = o as THREE.InstancedMesh;
      if (!im.isInstancedMesh || !im.visible) return;
      const pos = new THREE.Vector3();
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, m);
        pos.setFromMatrixPosition(m);
        if (Math.abs(pos.x - node.x) < 1e-3 && Math.abs(pos.z - node.z) < 1e-3) present = true;
      }
    });
    expect(present).toBe(false);
    nature.dispose();
  });
});
