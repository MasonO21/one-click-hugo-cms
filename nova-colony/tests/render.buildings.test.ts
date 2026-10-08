/**
 * Buildings actor regressions from the QA3 pass (lighting / model upgrade):
 *  - a colony tier-up re-tiers every facility at once, and every new look costs a model build plus the
 *    baked AO; the rebuild now spreads those builds over frames instead of freezing on the tier-up;
 *  - completion / upgrade / tier-up flashes were wiped by the rebuild their own state change triggers.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Game } from '../src/core/Game';
import { createMockServices } from '../src/platform/mock';
import { Materials } from '../src/render/core/materials';
import type { Env, RenderContext } from '../src/render/core/context';
import { Buildings, BATCH_IDLE_S } from '../src/render/actors/Buildings';
import { CENTER_CELL } from '../src/core/constants';
import type { Batch } from '../src/render/core/Batch';
import { buildModel, modelCacheStats, pruneModels } from '../src/render/models/spec';
import { tierStyle } from '../src/render/core/palette';

function makeCtx(game: Game): RenderContext {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 844 / 390, 0.5, 1800);
  const env: Env = { t: 0, dt: 0, night: 0, sunElev: 1, quality: 'medium', cx: 0, cz: 0, viewRadius: 104, camX: 0, camY: 18, camZ: 26, fwdX: 0, fwdZ: -1, terrainVersion: 0 };
  const noop = () => {};
  const particles = { chips: noop, dust: noop, sparkles: noop, ring: noop, flash: noop, confetti: noop, smoke: noop, sparks: noop, scale: 1 } as unknown as RenderContext['particles'];
  return { game, scene, camera, mats: new Materials(), env, heightAt: () => 0, particles };
}

function rich(game: Game): void {
  for (const r of game.data.resources) game.state.resources.amounts[r.id] = 1e6;
  game.state.research.points = 1e7;
}

/** Place distinct tier-0 facilities around the core (free + instant). */
function colony(game: Game, n: number): number[] {
  const B = game.sys.buildings;
  const defs = game.data.buildings.filter((d) => !d.piece && d.unlockTier === 0 && !d.maxCount && B.isUnlocked(d.id));
  const models = new Set<string>();
  const ids: number[] = [];
  for (const d of defs) {
    if (ids.length >= n || models.has(d.model ?? d.id)) continue;
    for (let k = 0; k < 400; k++) {
      const x = CENTER_CELL - 12 + (k % 20) * 3;
      const z = CENTER_CELL + 4 + Math.floor(k / 20) * 3;
      const id = B.place(d.id, x, z, 0, { free: true, instant: true, quiet: true });
      if (id != null) {
        ids.push(id);
        models.add(d.model ?? d.id);
        break;
      }
    }
  }
  return ids;
}

describe('Buildings: tier-up model builds are spread over frames', () => {
  it('past the frame budget facilities keep their old look for a frame, then all catch up', () => {
    const game = new Game({ seed: 5, services: createMockServices() });
    game.start();
    const ids = colony(game, 6);
    expect(ids.length).toBeGreaterThanOrEqual(5);
    game.update(0.1);
    const buildings = new Buildings(makeCtx(game));
    buildings.update(1 / 60);
    for (const id of ids) expect(buildings.shownTier(id)).toBe(0);

    // tier up the colony: every facility (and the core) switches to the Reinforced look at once
    for (const d of game.data.research) if (d.tier === 0 && game.sys.research.status(d.id) === 'available') { rich(game); game.sys.research.research(d.id); }
    rich(game);
    expect(game.sys.progression.tierUp()).toBe(true);
    for (const id of ids) expect(game.sys.buildings.get(id)!.tier).toBe(1);

    buildings.modelBudgetMs = 0; // force the slow path: one new model per frame
    buildings.update(1 / 60);
    const first = ids.filter((id) => buildings.shownTier(id) === 1).length;
    expect(first).toBeLessThan(ids.length);
    let frames = 1;
    while (ids.some((id) => buildings.shownTier(id) !== 1) && frames < 50) {
      buildings.update(1 / 60);
      frames++;
    }
    for (const id of ids) expect(buildings.shownTier(id)).toBe(1);
    expect(frames).toBeGreaterThan(1);
    expect(frames).toBeLessThanOrEqual(ids.length + 2);

    // a fresh building never waits: it has no older look to fall back to
    const extra = colony(game, 1);
    buildings.update(1 / 60);
    expect(buildings.shownTier(extra[0])).toBe(game.sys.buildings.get(extra[0])!.tier);
    buildings.dispose();
  });
});

describe('Buildings: idle looks are evicted and their models released (QA3 #17)', () => {
  it('after a tier-up the old facility and piece batches go once idle; live ones and their models stay', () => {
    pruneModels(Infinity, 0, 0);
    const game = new Game({ seed: 9, services: createMockServices() });
    game.start();
    const ids = colony(game, 6);
    // a structure piece too (piece batches are keyed by tier as well)
    const pieceDef = game.data.buildings.find((d) => d.piece && d.unlockTier === 0 && game.sys.buildings.isUnlocked(d.id))!;
    expect(pieceDef).toBeDefined();
    let wall: number | null = null;
    for (let k = 0; k < 200 && wall == null; k++) wall = game.sys.buildings.place(pieceDef.id, CENTER_CELL - 8 + (k % 16), CENTER_CELL - 4 - Math.floor(k / 16), 0, { free: true, instant: true, quiet: true });
    expect(wall).not.toBeNull();
    game.update(0.1);
    const ctx = makeCtx(game);
    const buildings = new Buildings(ctx);
    buildings.update(1 / 60);
    /** Distinct facility looks (model | shown tier | level | footprint) among the live buildings — what should be resident. */
    const liveLooks = () => new Set(game.state.buildings.list.filter((b) => !game.data.building(b.def)?.piece).map((b) => {
      const d = game.data.building(b.def)!;
      return `${d.model ?? d.id}|${buildings.shownTier(b.id)}|${b.level}|${d.size[0]}x${d.size[1]}`;
    })).size;
    const before = buildings.batchStats;
    expect(before.facilities).toBe(liveLooks());
    expect(before.facilities).toBeGreaterThanOrEqual(5);
    expect(before.pieces).toBeGreaterThanOrEqual(1);
    expect(modelCacheStats().referenced).toBe(before.facilities);
    const tier0 = ids.map((id) => {
      const b = game.sys.buildings.get(id)!;
      const def = game.data.building(b.def)!;
      return buildModel(def.model ?? def.id, tierStyle(game.data.tier(0)), b.level, def);
    });
    const tier0Gone = tier0.map((s) => {
      let n = 0;
      s.geometry.addEventListener('dispose', () => n++);
      return () => n > 0;
    });

    for (const d of game.data.research) if (d.tier === 0 && game.sys.research.status(d.id) === 'available') { rich(game); game.sys.research.research(d.id); }
    rich(game);
    expect(game.sys.progression.tierUp()).toBe(true);
    for (const id of ids) game.sys.buildings.get(id)!.tier = 1;
    game.sys.buildings.get(wall!)!.tier = 1;
    game.derived.buildingsVersion++;
    for (let f = 0; f < 50 && ids.some((id) => buildings.shownTier(id) !== 1); f++) buildings.update(1 / 60); // the tier-up wave
    for (const id of ids) expect(buildings.shownTier(id)).toBe(1);
    // the old looks are still resident (grace) but hidden
    const live = liveLooks();
    expect(live).toBeGreaterThanOrEqual(before.facilities);
    expect(buildings.batchStats.facilities).toBeGreaterThan(live);
    expect(buildings.batchStats.pieces).toBeGreaterThan(before.pieces);
    const scene = ctx.scene;
    let hidden = 0;
    scene.traverse((o) => { if ((o as THREE.InstancedMesh).isInstancedMesh && !o.visible) hidden++; });
    expect(hidden).toBeGreaterThanOrEqual(buildings.batchStats.facilities - live);

    // just inside the grace: nothing evicted yet
    const resident = buildings.batchStats.facilities;
    ctx.env.t += BATCH_IDLE_S - 0.5;
    buildings.update(1.1);
    expect(buildings.batchStats.facilities).toBe(resident);
    // past it: the tier-0 looks are gone, their models released (and, as spares beyond the idle time, pruned)
    ctx.env.t += 1;
    buildings.update(1.1);
    expect(buildings.batchStats.facilities).toBe(live);
    expect(buildings.batchStats.pieces).toBe(before.pieces);
    expect(modelCacheStats().referenced).toBe(live);
    pruneModels(performance.now() + 1e6);
    expect(tier0Gone.every((g) => g())).toBe(true);
    // every live building still has its batch in the scene, with its geometry intact
    for (const id of ids) {
      const entry = (buildings as unknown as { byId: Map<number, { slots: { batch: Batch; index: number }[] }> }).byId.get(id)!;
      for (const s of entry.slots) {
        const mesh = (s.batch as unknown as { mesh: THREE.InstancedMesh }).mesh;
        expect(mesh.parent).not.toBeNull();
        expect(mesh.visible).toBe(true);
        expect(mesh.geometry.attributes.position.count).toBeGreaterThan(0);
      }
    }
    // a model cache hit for a current look: nothing rebuilt, nothing disposed
    const spareBefore = modelCacheStats().size;
    buildings.update(1 / 60);
    expect(modelCacheStats().size).toBe(spareBefore);
    buildings.dispose();
    expect(modelCacheStats().referenced).toBe(0);
  });

  it('a removed building frees its look, but a look placed again within the grace reuses the batch', () => {
    const game = new Game({ seed: 10, services: createMockServices() });
    game.start();
    const [id] = colony(game, 1);
    game.update(0.1);
    const ctx = makeCtx(game);
    const buildings = new Buildings(ctx);
    buildings.update(1 / 60);
    const fbs = (buildings as unknown as { facilityBatches: Map<string, { body: Batch }> }).facilityBatches;
    const def = game.sys.buildings.get(id)!.def;
    const model = game.data.building(def)!.model ?? def;
    const [key, fb] = [...fbs.entries()].find(([k]) => k.startsWith(model + '|'))!; // not the Command Center's batch
    expect(fb).toBeDefined();
    expect(game.sys.buildings.remove(id)).toBeTruthy();
    game.update(0.1);
    ctx.env.t += 1;
    buildings.update(1 / 60);
    expect(fbs.get(key)).toBe(fb); // within the grace: still resident
    const again = game.sys.buildings.place(def, CENTER_CELL + 6, CENTER_CELL + 6, 0, { free: true, instant: true, quiet: true });
    expect(again).not.toBeNull();
    game.update(0.1);
    buildings.update(1 / 60);
    expect(fbs.get(key)).toBe(fb); // reused, not rebuilt
    expect(game.sys.buildings.remove(again!)).toBeTruthy();
    game.update(0.1);
    ctx.env.t += BATCH_IDLE_S + 1;
    buildings.update(1.1);
    expect(fbs.has(key)).toBe(false);
    buildings.dispose();
  });
});

describe('Buildings: the player lantern (QA3 #14b: the player is hard to spot in a forest at night)', () => {
  it('at night the first pooled light follows the player; by day it goes back to the buildings', () => {
    const game = new Game({ seed: 7, services: createMockServices() });
    game.start();
    colony(game, 3);
    game.update(0.1);
    const ctx = makeCtx(game); // medium quality: 3 pooled lights
    const buildings = new Buildings(ctx);
    const p = game.state.player;
    p.x = 12;
    p.z = -7;
    p.rot = Math.PI / 2;
    ctx.env.night = 1;
    for (let i = 0; i < 120; i++) {
      ctx.env.t += 1 / 60;
      buildings.update(1 / 60);
    }
    const lights = (buildings as unknown as { lights: THREE.PointLight[] }).lights;
    expect(lights.length).toBe(3);
    const lantern = lights[0];
    expect(lantern.intensity).toBeGreaterThan(5);
    expect(lantern.position.x).toBeCloseTo(p.x - Math.sin(p.rot) * 0.7, 2); // hangs behind the player
    expect(lantern.position.z).toBeCloseTo(p.z - Math.cos(p.rot) * 0.7, 2);
    expect(lantern.position.y).toBeGreaterThan(1);
    expect(lantern.color.r).toBeGreaterThan(lantern.color.b); // warm
    // it moves with the player every frame
    p.x = 20;
    buildings.update(1 / 60);
    expect(lantern.position.x).toBeCloseTo(20 - Math.sin(p.rot) * 0.7, 2);
    // the other lights are still handed to buildings (or idle), never the player
    const entries = (buildings as unknown as { lightEntries: (unknown | null)[] }).lightEntries;
    expect(entries[0]).toBeNull();
    // day: the lantern fades out and the slot returns to the building pool
    ctx.env.night = 0;
    for (let i = 0; i < 120; i++) {
      ctx.env.t += 1 / 60;
      buildings.update(1 / 60);
    }
    expect(lantern.intensity).toBeLessThan(0.05);
    buildings.dispose();
  });

  it('low quality has no point lights, so no lantern either', () => {
    const game = new Game({ seed: 8, services: createMockServices() });
    game.start();
    colony(game, 2);
    game.update(0.1);
    const ctx = makeCtx(game);
    ctx.env.quality = 'low';
    ctx.env.night = 1;
    const buildings = new Buildings(ctx);
    buildings.update(1 / 60);
    expect((buildings as unknown as { lights: THREE.PointLight[] }).lights.length).toBe(0);
    buildings.dispose();
  });
});

describe('Buildings: flashes survive the rebuild their event triggers', () => {
  it('an upgrade flash is still on the building after the level change rebuilds the batches', () => {
    const game = new Game({ seed: 6, services: createMockServices() });
    game.start();
    const [id] = colony(game, 1);
    game.update(0.1);
    const buildings = new Buildings(makeCtx(game));
    buildings.update(1 / 60);
    rich(game);
    expect(game.sys.buildings.levelUp(id)).toBe(true); // emits building:upgraded, then the level change rebuilds
    buildings.update(1 / 60);
    const entry = (buildings as unknown as { byId: Map<number, { slots: { batch: Batch; index: number }[] }> }).byId.get(id)!;
    const slot = entry.slots[0];
    const mesh = (slot.batch as unknown as { mesh: THREE.InstancedMesh }).mesh;
    const r = (mesh.instanceColor!.array as Float32Array)[slot.index * 3];
    expect(r).toBeGreaterThan(1.5); // the white-hot flash colour, not the plain instance colour
    buildings.dispose();
  });
});
