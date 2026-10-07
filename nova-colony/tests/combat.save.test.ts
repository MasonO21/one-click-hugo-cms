import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/Game';
import { deserializeState, serializeState } from '../src/core/state';
import { createMockServices } from '../src/platform/mock';
import { addBuilding, makeGame, testData } from './combat.helpers';
import type { GameEvents } from '../src/core/events';

function reload(game: Game) {
  const json = serializeState(game.state);
  const warnings: GameEvents['combat:warning'][] = [];
  const loaded = new Game({ state: deserializeState(json), services: createMockServices(), data: testData(), clock: () => game.now() + 5_000 });
  loaded.bus.on('combat:warning', (p) => warnings.push(p));
  loaded.start();
  return { loaded, warnings };
}

describe('combat save / load', () => {
  it('a save taken mid-attack restarts a full warning with no leftover aliens', () => {
    const t = makeGame();
    const { game, step } = t;
    addBuilding(game, 'scrap_turret', 131, 128);
    game.sys.combat.schedule(0, 0);
    step(6);
    const c = game.state.combat;
    expect(c.phase).toBe('attack');
    expect(c.aliens.length).toBeGreaterThan(0);

    const { loaded, warnings } = reload(game);
    const lc = loaded.state.combat;
    expect(lc.phase).toBe('warning');
    expect(lc.aliens).toHaveLength(0);
    expect(lc.projectiles).toHaveLength(0);
    expect(lc.spawnQueue).toHaveLength(0);
    // schedule(0, 0) used no warning at all; a restart always gives the full 2:00 warning
    const warn = loaded.data.balance.warningSeconds;
    expect(warnings).toEqual([{ wave: 1, seconds: warn }]);
    expect(lc.nextAt).toBeCloseTo(loaded.state.playTime + warn, 5);
  });

  it('a save taken mid-warning restarts the full warning', () => {
    const t = makeGame();
    const { game, step } = t;
    game.sys.combat.schedule(0, 60);
    step(45);
    expect(game.state.combat.phase).toBe('warning');
    const { loaded, warnings } = reload(game);
    expect(loaded.state.combat.phase).toBe('warning');
    expect(warnings).toEqual([{ wave: 1, seconds: 60 }]);
    expect(loaded.sys.combat.secondsToAttack()).toBeCloseTo(60, 5);
  });

  it('a save taken during the victory celebration keeps the chest and resumes the regular schedule', () => {
    const t = makeGame({ armed: true });
    const { game, step } = t;
    addBuilding(game, 'scrap_turret', 131, 128);
    game.sys.combat.schedule(0, 0);
    step(180, () => game.state.combat.phase === 'victory');
    const chest = game.state.combat.pendingReward;
    expect(chest).not.toBeNull();
    const { loaded } = reload(game);
    const lc = loaded.state.combat;
    expect(lc.phase).toBe('peace');
    expect(lc.pendingReward).toEqual(chest);
    expect(Number.isFinite(lc.nextAt)).toBe(true);
    expect(lc.wave).toBe(1);
  });

  it('a peaceful save with a scheduled attack keeps its timer; no attacks happen offline', () => {
    const t = makeGame();
    const { game, step } = t;
    game.sys.combat.schedule(100, 60);
    step(30);
    const left = game.sys.combat.secondsToAttack();
    const { loaded } = reload(game);
    expect(loaded.state.combat.phase).toBe('peace');
    expect(loaded.sys.combat.secondsToAttack()).toBeCloseTo(left, 5);
  });
});
