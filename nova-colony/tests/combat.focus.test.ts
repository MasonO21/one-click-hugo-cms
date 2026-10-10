import { describe, expect, it } from 'vitest';
import { addBuilding, cellWorld, makeGame } from './combat.helpers';
import { TUNE } from '../src/sim/combat/types';
import { focusable } from '../src/sim/combat';
import type { Game } from '../src/core/Game';

function clearWave(game: Game): void {
  game.state.combat.spawnQueue.length = 0;
  for (const a of game.state.combat.aliens) {
    a.hp = 0;
    a.state = 'dying';
  }
}

/** An attack with a crawler right next to the turret and an Elder Brute a little further out, both in range. */
function setup() {
  const t = makeGame();
  const { game } = t;
  const turret = addBuilding(game, 'scrap_turret', 128, 134, { level: 1 });
  game.sys.combat.schedule(0, 0);
  t.step(0.05);
  clearWave(game);
  const crawler = game.sys.combat.spawnInvader('crawler', cellWorld(129), cellWorld(136))!;
  const boss = game.sys.combat.spawnInvader('elder_brute', cellWorld(131), cellWorld(138))!;
  // nobody walks: the test is about who the turret aims at
  for (const a of game.state.combat.aliens) if (a.state !== 'dying') a.hp = a.maxHp = 1e6;
  t.step(1.5);
  return { ...t, turret, crawler, boss };
}

describe('tap a boss to focus the turrets', () => {
  it('only bosses, queens and giants can be focused, and only in a raid', () => {
    const t = makeGame();
    const d = t.game.data;
    expect(focusable(d.alien('elder_brute'))).toBe(true);
    expect(focusable(d.alien('queen'))).toBe(true);
    expect(focusable(d.alien('titan'))).toBe(true);
    expect(focusable(d.alien('crawler'))).toBe(false);
    expect(focusable(d.alien('razor_crawler'))).toBe(false);
    const wild = t.game.sys.combat.spawnWild('elder_brute', 1, 40, 40)[0];
    expect(t.game.sys.combat.focus(wild)).toBe(false); // no raid, and wild
  });

  it('turrets in reach switch to the focused boss until it expires', () => {
    const { game, step, turret, crawler, boss } = setup();
    const info = () => game.sys.combat.turretInfo(turret.id)!;
    expect(info().target).toBe(crawler); // the nearest one
    expect(game.sys.combat.focus(crawler)).toBe(false);
    expect(game.sys.combat.focus(boss)).toBe(true);
    expect(game.sys.combat.focusTarget()).toBe(boss);
    step(0.5);
    expect(info().target).toBe(boss);
    step(TUNE.FOCUS_SECONDS);
    expect(game.sys.combat.focusTarget()).toBeNull();
    step(1);
    expect(game.state.combat.focusId).toBeNull();
  });

  it('a boss out of a turret\'s reach does not pull it off its target', () => {
    const { game, step, turret, crawler, boss } = setup();
    const a = game.state.combat.aliens.find((x) => x.id === boss)!;
    a.x = cellWorld(170);
    a.z = cellWorld(170);
    game.sys.combat.focus(boss);
    step(0.5);
    expect(game.sys.combat.turretInfo(turret.id)!.target).toBe(crawler);
  });

  it('the focus ends with the raid', () => {
    const { game, boss } = setup();
    game.sys.combat.focus(boss);
    for (const a of game.state.combat.aliens) {
      a.hp = 0;
      a.state = 'dying';
    }
    const t0 = game.state.playTime;
    while (game.state.combat.phase === 'attack' && game.state.playTime - t0 < 30) game.update(0.1);
    expect(game.state.combat.phase).toBe('victory');
    expect(game.state.combat.focusId).toBeNull();
  });
});
