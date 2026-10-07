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
import { Buildings } from '../src/render/actors/Buildings';
import { CENTER_CELL } from '../src/core/constants';
import type { Batch } from '../src/render/core/Batch';

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
