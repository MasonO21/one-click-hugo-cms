/**
 * Model cache eviction (QA3 #17): the building-model cache kept every model × tier × level ever
 * built (524 geometries after a run through the tiers) and never evicted. Models are now reference
 * counted by their users (Buildings' facility batches, the build ghost) and spare ones are pruned
 * once idle or beyond a small LRU allowance; a model still in use is never disposed.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createDataRegistry } from '../src/data';
import { tierStyle } from '../src/render/core/palette';
import { buildModel, modelCached, retainModel, releaseModel, pruneModels, modelCacheStats, MODEL_CACHE_IDLE_MS, MODEL_CACHE_SPARE, registeredModelKeys, type ModelSpec } from '../src/render/models/spec';
import '../src/render/models';
import { Game } from '../src/core/Game';
import { createMockServices } from '../src/platform/mock';
import { Materials } from '../src/render/core/materials';
import type { Env, RenderContext } from '../src/render/core/context';
import { BuildOverlay } from '../src/render/scene/BuildOverlay';
import { CENTER_CELL } from '../src/core/constants';

const data = createDataRegistry();
const style = (t: number) => tierStyle(data.tier(t));
const defOf = (model: string) => data.buildings.find((b) => b.model === model);

/** Disposal flags for a spec's geometries (body + parts). */
function watch(spec: ModelSpec): () => boolean {
  let disposed = 0;
  const geos = [spec.geometry, ...spec.parts.map((p) => p.geometry)];
  for (const g of geos) g.addEventListener('dispose', () => disposed++);
  return () => disposed === geos.length;
}

function spin(ms: number): void {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) { /* lastUse timestamps must differ */ }
}

describe('model cache: reference counting and pruning', () => {
  it('buildModel is memoised per key; a retained model survives any prune, a released one goes once idle or crowded out', () => {
    pruneModels(Infinity, 0, 0); // start from an empty spare set (other test files fill the cache)
    const def = defOf('shelter');
    const a = buildModel('shelter', style(0), 1, def);
    expect(buildModel('shelter', style(0), 1, def)).toBe(a);
    expect(a.key).toBe('shelter|0|1|' + (def?.size ?? [1, 1]).join('x'));
    expect(modelCached('shelter', style(0), 1, def)).toBe(true);
    const gone = watch(a);

    retainModel(a);
    expect(modelCacheStats().referenced).toBe(1);
    expect(pruneModels(Infinity, 0, 0)).toBe(0); // the harshest prune leaves a referenced model alone
    expect(gone()).toBe(false);
    expect(modelCached('shelter', style(0), 1, def)).toBe(true);

    releaseModel(a);
    expect(modelCacheStats().referenced).toBe(0);
    expect(pruneModels(performance.now(), MODEL_CACHE_IDLE_MS, MODEL_CACHE_SPARE)).toBe(0); // fresh and within the allowance: kept as a spare
    expect(modelCached('shelter', style(0), 1, def)).toBe(true);
    expect(pruneModels(performance.now() + MODEL_CACHE_IDLE_MS + 1)).toBe(1); // idle: disposed
    expect(gone()).toBe(true);
    expect(modelCached('shelter', style(0), 1, def)).toBe(false);
    // releasing more than was retained, or a stale spec, is harmless
    releaseModel(a);
    retainModel(a);
    expect(modelCacheStats().referenced).toBe(0);
    // rebuilt on demand as a fresh spec
    const b = buildModel('shelter', style(0), 1, def);
    expect(b).not.toBe(a);
    expect(b.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('keeps only the MODEL_CACHE_SPARE most recently used spare models', () => {
    pruneModels(Infinity, 0, 0);
    const keys = registeredModelKeys().slice(0, 6);
    const specs = keys.map((k) => {
      spin(2);
      return buildModel(k, style(1), 1, defOf(k));
    });
    const flags = specs.map(watch);
    expect(modelCacheStats()).toEqual({ size: 6, referenced: 0, spare: 6 });
    expect(pruneModels(performance.now(), MODEL_CACHE_IDLE_MS, 2)).toBe(4);
    expect(flags.map((f) => f())).toEqual([true, true, true, true, false, false]); // the two newest stay
    // a hit refreshes recency
    spin(2);
    buildModel(keys[4], style(1), 1, defOf(keys[4]));
    spin(2);
    const fresh = buildModel(keys[0], style(1), 1, defOf(keys[0]));
    const freshGone = watch(fresh);
    expect(pruneModels(performance.now(), MODEL_CACHE_IDLE_MS, 2)).toBe(1); // keys[5] is now the oldest of three spares
    expect(flags[5]()).toBe(true);
    expect(flags[4]()).toBe(false);
    expect(freshGone()).toBe(false);
    expect(MODEL_CACHE_SPARE).toBeGreaterThanOrEqual(8);
    expect(MODEL_CACHE_SPARE).toBeLessThanOrEqual(32);
    pruneModels(Infinity, 0, 0);
  });
});

describe('build ghost holds its model while shown', () => {
  it('retains the ghost model in build mode and releases it on leaving', () => {
    pruneModels(Infinity, 0, 0);
    const game = new Game({ seed: 3, services: createMockServices() });
    game.start();
    const scene = new THREE.Scene();
    const env: Env = { t: 0, dt: 0, night: 0, sunElev: 1, quality: 'medium', cx: 0, cz: 0, viewRadius: 104, camX: 0, camY: 18, camZ: 26, fwdX: 0, fwdZ: -1, terrainVersion: 0 };
    const ctx: RenderContext = { game, scene, camera: new THREE.PerspectiveCamera(), mats: new Materials(), env, heightAt: () => 0, particles: {} as RenderContext['particles'] };
    const overlay = new BuildOverlay(ctx);
    const view = game.view;
    view.mode = 'build';
    view.build.def = 'shelter';
    view.build.x = CENTER_CELL + 2;
    view.build.z = CENTER_CELL + 2;
    view.build.tier = 0;
    overlay.update();
    expect(modelCacheStats().referenced).toBe(1);
    const shelter = data.building('shelter')!;
    const spec = buildModel(shelter.model ?? shelter.id, style(0), 1, shelter);
    expect(modelCacheStats()).toEqual({ size: 1, referenced: 1, spare: 0 }); // the ghost's model, nothing else
    const gone = watch(spec);
    expect(pruneModels(Infinity, 0, 0)).toBe(0);
    expect(gone()).toBe(false);
    // another def: the previous model is released, the new one held
    view.build.def = 'campfire';
    overlay.update();
    expect(modelCacheStats().referenced).toBe(1);
    expect(pruneModels(Infinity, 0, 0)).toBe(1);
    expect(gone()).toBe(true);
    // leaving build mode releases the last one
    view.mode = 'play';
    overlay.update();
    expect(modelCacheStats().referenced).toBe(0);
    expect(pruneModels(Infinity, 0, 0)).toBe(1);
    overlay.dispose();
  });
});
