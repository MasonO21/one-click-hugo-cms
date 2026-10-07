/**
 * Renderer culling / batching regressions: chunk bucketing, LOD radii, Batch cull + fade options and
 * the Nature actor drawing only what the camera frustum sees (no WebGL needed: three.js objects only).
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Game } from '../src/core/Game';
import { createMockServices } from '../src/platform/mock';
import { Batch } from '../src/render/core/Batch';
import { Materials } from '../src/render/core/materials';
import type { Env, RenderContext } from '../src/render/core/context';
import { sightTargets } from '../src/render/core/context';
import { Nature, chunkOf, lodRadii, CHUNKS_PER_SIDE, CHUNK_CELLS } from '../src/render/actors/Nature';
import { Pois } from '../src/render/actors/Pois';
import { ViewCull } from '../src/render/core/cull';
import { nodeGeometry, nodeGeometryFar, NODE_FAR_MODELS } from '../src/render/models/nature';
import { HALF_WORLD, WORLD_CELLS } from '../src/core/constants';

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
