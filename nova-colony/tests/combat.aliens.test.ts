import { describe, expect, it } from 'vitest';
import { addBuilding, cellWorld, makeGame, testData } from './combat.helpers';
import { defaultData } from '../src/data';
import type { Game } from '../src/core/Game';

function clearWave(game: Game): void {
  game.state.combat.spawnQueue.length = 0;
  for (const a of game.state.combat.aliens) {
    a.hp = 0;
    a.state = 'dying';
  }
}

/** Start an attack and replace the planned wave with our own invaders. */
function attackWith(t: ReturnType<typeof makeGame>, spawns: [string, number, number][]): number[] {
  t.game.sys.combat.schedule(0, 0);
  t.step(0.05);
  clearWave(t.game);
  return spawns.map(([id, cx, cz]) => t.game.sys.combat.spawnInvader(id, cellWorld(cx), cellWorld(cz))!);
}

describe('alien behaviour', () => {
  it('spitters break off to shoot the nearest turret from range with goo projectiles', () => {
    const t = makeGame();
    const { game, step } = t;
    const turret = addBuilding(game, 'scrap_turret', 140, 128, { status: 'off' }); // switched off: won't shoot back
    const [id] = attackWith(t, [['spitter', 146, 128]]);
    let sawSpit = false;
    step(15, () => {
      if (game.state.combat.projectiles.some((p) => p.kind === 'spit' && p.team === 'hostile')) sawSpit = true;
      return t.damageLog.some((d) => d.id === turret.id);
    });
    expect(sawSpit).toBe(true);
    expect(t.damageLog.some((d) => d.id === turret.id)).toBe(true);
    const spitter = game.state.combat.aliens.find((a) => a.id === id)!;
    expect(spitter.target).toBe(turret.id);
    // it keeps its distance (range 5 cells) instead of walking up to the turret
    expect(Math.hypot(spitter.x - cellWorld(140), spitter.z - cellWorld(128))).toBeGreaterThan(6);
  });

  it('brutes go for the nearest wall piece', () => {
    const t = makeGame();
    const { game, step } = t;
    const wall = addBuilding(game, 'wall', 138, 136);
    attackWith(t, [['t_brute', 146, 136]]);
    step(20, () => t.damageLog.some((d) => d.id === wall.id));
    expect(t.damageLog.some((d) => d.id === wall.id)).toBe(true);
    expect(t.damageLog.some((d) => d.id === t.core.id)).toBe(false);
  });

  it('burrowers emerge from underground inside the colony and cannot be shot while buried', () => {
    const t = makeGame();
    const { game, step } = t;
    addBuilding(game, 'shelter', 133, 133);
    const [id] = attackWith(t, [['t_burrower', 140, 140]]);
    const a = game.state.combat.aliens.find((x) => x.id === id)!;
    expect(a.state).toBe('spawning');
    expect(a.y).toBe(-1);
    // queued burrowers (regular waves) ignore the ring position and pop up next to a building
    game.state.combat.spawnQueue.push({ alien: 't_burrower', at: game.state.playTime, x: 999, z: 999 });
    step(0.05);
    const queued = game.state.combat.aliens.find((x) => x.def === 't_burrower' && x.id !== id)!;
    expect(Math.hypot(queued.x, queued.z)).toBeLessThan(game.state.colony.radius * 2);
    expect(queued.y).toBeLessThan(0);
    step(0.6);
    expect(queued.y).toBeGreaterThan(-1);
    expect(queued.y).toBeLessThan(0);
    step(0.8);
    expect(queued.state).not.toBe('spawning');
    expect(queued.y).toBe(0);
  });

  it('flyers ignore walls and fly straight to the core', () => {
    const t = makeGame();
    const { game, step } = t;
    for (let i = 122; i <= 134; i++) {
      for (const [x, z] of [[i, 122], [i, 134], [122, i], [134, i]]) addBuilding(game, 'wall', x, z);
    }
    attackWith(t, [['t_flyer', 110, 128]]);
    step(30, () => t.damageLog.some((d) => d.id === t.core.id));
    expect(t.damageLog.some((d) => d.id === t.core.id)).toBe(true);
    expect(t.damageLog.filter((d) => d.id !== t.core.id)).toHaveLength(0);
  });

  it('invaders that pass near the player attack the player instead', () => {
    const t = makeGame();
    const { game, step } = t;
    game.state.player.x = cellWorld(136);
    game.state.player.z = cellWorld(128);
    const damaged = t.record('player:damaged');
    attackWith(t, [['crawler', 142, 128]]);
    step(10, () => damaged.length > 0);
    expect(damaged.length).toBeGreaterThan(0);
    expect(damaged[0].amount).toBeCloseTo(3); // crawler 6 dmg, halved for the player
  });

  it('swarm queens in an invasion spawn minions that count toward the wave', () => {
    const t = makeGame();
    const { game, step } = t;
    attackWith(t, [['t_queen', 146, 128]]);
    const before = game.state.combat.waveTotal ?? 0;
    step(5);
    expect(game.state.combat.aliens.filter((a) => a.def === 'crawler' && !a.wild).length).toBeGreaterThanOrEqual(2);
    expect(game.state.combat.waveTotal).toBeGreaterThan(before);
    expect(game.sys.combat.remaining()).toBeGreaterThanOrEqual(3);
  });

  it('bosses join every Nth wave at a tier, from 1-3 directions', () => {
    const base = defaultData();
    // a dedicated registry: one 4-crawler group and a steep 0.25 wave scaling so the scaled count is visibly > 4
    const data = testData({
      invasions: [{ tier: 0, groups: [{ alien: 'crawler', count: 4, delay: 0 }], boss: { alien: 't_brute', every: 2 }, reward: base.invasions[0].reward }],
      balance: { ...base.balance, waveScaling: 0.25 },
    });
    const t = makeGame({ data });
    const { game } = t;
    const started = t.record('combat:started');
    const c = game.state.combat;
    c.wave = 1;
    c.waveAtTier = 1; // the next wave is the 2nd at this tier -> boss
    game.sys.combat.schedule(0, 0);
    t.step(0.05);
    expect(started[0].aliens).toBe(Math.round(4 * (1 + game.data.balance.waveScaling * c.waveAtTier)) + 1);
    expect(started[0].aliens).toBe(6); // 4 crawlers x 1.25 + the boss
    expect(c.spawnQueue.some((q) => q.alien === 't_brute') || c.aliens.some((a) => a.def === 't_brute')).toBe(true);
    // all spawns on the ring: radius + 6 cells from the core
    const ring = (game.state.colony.radius + 6) * 2;
    for (const q of c.spawnQueue) expect(Math.hypot(q.x, q.z)).toBeCloseTo(ring, -1);
  });
});
