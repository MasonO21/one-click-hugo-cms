/**
 * Saves from before the four-week economy retune (data/pacing.ts) still load and play on: costs simply rise,
 * nothing breaks, nothing locks, and nobody is sent away.
 *
 * Fixture: tests/fixtures/save-alloy-before-retune.txt, a real QA save at the Advanced Alloy tier (save version 2,
 * written before the retune, Colony Spirit and the recruitment board clock), loaded through the real save path.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Game } from '../src/core/Game';
import { createMockServices } from '../src/platform/mock';
import { unwrapSave } from '../src/platform/saveCodec';
import { migrateState } from '../src/platform/saveMigrate';
import { serializeState, deserializeState } from '../src/core/state';
import { PACING, roundCost } from '../src/data/pacing';
import type { GameState } from '../src/core/state';

const FIXTURE = path.join(__dirname, 'fixtures', 'save-alloy-before-retune.txt');

function loadFixture(): GameState {
  const u = unwrapSave(fs.readFileSync(FIXTURE, 'utf8'));
  if ('error' in u) throw new Error(u.error);
  return migrateState(JSON.parse(u.json));
}

function boot(state: GameState, hoursLater = 3) {
  const clock = { now: state.lastTickAt + hoursLater * 3600_000 };
  const game = new Game({ state, services: createMockServices(), clock: () => clock.now });
  game.start();
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += 0.25) {
      clock.now += 250;
      game.update(0.25);
    }
  };
  return { game, clock, run };
}

describe('economy retune: saves from before it', () => {
  it('load and keep playing: same tier, buildings and colonists; resources stay finite', () => {
    const before = loadFixture();
    const tier = before.colony.tier;
    const colonists = before.colonists.list.length;
    const buildings = before.buildings.list.length;
    const { game, run } = boot(before);
    if (game.pendingOffline) game.sys.liveops.claimOffline(false);
    run(120);
    expect(game.state.colony.tier).toBe(tier);
    expect(game.state.colonists.list.length).toBeGreaterThanOrEqual(colonists);
    expect(game.state.buildings.list.length).toBe(buildings);
    for (const [k, v] of Object.entries(game.state.resources.amounts)) expect(Number.isFinite(v) && v >= 0, k).toBe(true);
    // the recruitment board works on its new clock (an old save's reroll time is just the next arrival)
    expect(game.state.colonists.candidates.length).toBeGreaterThan(0);
    const next = game.sys.colonists.nextArrivalIn();
    expect(next === null || (next >= 0 && Number.isFinite(next))).toBe(true);
  });

  it('costs simply rise: the next tier and new buildings ask the paced prices', () => {
    const { game } = boot(loadFixture());
    const nx = game.sys.progression.next()!;
    expect(nx.tier).toBe(5);
    expect(nx.cost.alloy).toBe(roundCost(4500 * PACING.tierUp[5]));
    expect(game.sys.buildings.cost('nanoforge').alloy).toBeGreaterThanOrEqual(60 * PACING.build[4]);
  });

  it('nothing locks: every resource of the next tier-up can be stored with the storage this tier can build', () => {
    const { game } = boot(loadFixture());
    const g = game;
    const nx = g.sys.progression.next()!;
    for (const [res, need] of Object.entries(nx.cost)) {
      // the biggest store for this resource the colony can build now, at max level, a handful of times over
      let best = 0;
      for (const d of g.data.buildings) {
        if (!d.storage?.[res] || !g.sys.buildings.isUnlocked(d.id) || d.unlockTier > g.state.colony.tier) continue;
        best = Math.max(best, d.storage[res]! * (1 + (d.levelEffect ?? 0) * (d.maxLevel - 1)));
      }
      const reachable = g.sys.economy.capacity(res) + 6 * best * g.sys.economy.modifier('storage');
      expect(reachable, `${res}: need ${need}`).toBeGreaterThanOrEqual(need ?? 0);
    }
  });

  it('a mid-game colony with more people than the new pacing gives keeps every one of them', () => {
    const state = loadFixture();
    const { game } = boot(state);
    for (let i = 0; i < 40; i++) game.sys.colonists.grant('common');
    const n = game.state.colonists.list.length;
    const again = boot(deserializeState(serializeState(game.state)));
    again.run(60);
    expect(again.game.state.colonists.list.length).toBe(n);
  });
});
