import { describe, expect, it } from 'vitest';
import { cellWorld, makeGame } from './combat.helpers';
import { TUNE } from '../src/sim/combat/types';

// far from the colony and from the test player's parking spot (150, 150)
const HX = cellWorld(215);
const HZ = cellWorld(40);
const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);

describe('wild aliens', () => {
  it('idle near home, chase the player inside the leash and walk back when the player leaves', () => {
    const t = makeGame();
    const { game, step } = t;
    const sys = game.sys.combat;
    const ids = sys.spawnWild('crawler', 3, HX, HZ);
    expect(ids).toHaveLength(3);
    expect(sys.wildNear(HX, HZ, 10)).toBe(3);
    expect(sys.wildNear(0, 0, 10)).toBe(0);
    const aliens = () => game.state.combat.aliens.filter((a) => ids.includes(a.id));
    expect(aliens().every((a) => a.wild)).toBe(true);

    // player far outside the leash: they amble around home
    step(8);
    for (const a of aliens()) expect(dist(a.x, a.z, HX, HZ)).toBeLessThan(TUNE.WANDER + 2);

    // player walks into the leash (12 cells from home): they come for the player
    const pl = game.state.player;
    pl.x = HX + 12 * 2;
    pl.z = HZ;
    pl.hp = 100;
    const before = aliens().map((a) => dist(a.x, a.z, pl.x, pl.z));
    step(3);
    const after = aliens().map((a) => dist(a.x, a.z, pl.x, pl.z));
    after.forEach((d, i) => expect(d).toBeLessThan(before[i] - 3));

    // player runs far away (30 cells from home): they give up and return home
    pl.x = HX + 30 * 2;
    step(20);
    for (const a of aliens()) expect(dist(a.x, a.z, HX, HZ)).toBeLessThan(TUNE.WANDER + 2);
    // wild aliens never trigger or join invasions
    expect(game.state.combat.phase).toBe('peace');
    expect(sys.remaining()).toBe(0);
  });

  it('knock the player out softly (no loss) and then lose interest', () => {
    const t = makeGame(); // unarmed player
    const { game, step } = t;
    const pl = game.state.player;
    pl.x = HX + 2;
    pl.z = HZ;
    pl.hp = 20;
    const damaged = t.record('player:damaged');
    const downed = t.record('player:downed');
    game.sys.combat.spawnWild('crawler', 2, HX, HZ);
    step(20, () => downed.length > 0);
    expect(damaged.length).toBeGreaterThan(0);
    expect(damaged.every((d) => d.amount <= 6 * TUNE.PLAYER_DMG_MULT + 1e-9)).toBe(true);
    expect(downed).toHaveLength(1);
    expect(pl.hp).toBe(0);
    expect(pl.downUntil).toBeCloseTo(game.state.playTime + TUNE.KO_SECONDS, 0);
    const hits = damaged.length;
    step(3);
    expect(damaged.length).toBe(hits); // no damage while knocked out
  });

  it('kills of wild aliens count for stats but not for the invasion wave', () => {
    const t = makeGame({ armed: true });
    const { game, step } = t;
    const pl = game.state.player;
    pl.x = HX + 6;
    pl.z = HZ;
    game.sys.combat.spawnWild('crawler', 2, HX, HZ);
    const kills = t.record('alien:killed');
    step(30, () => kills.length >= 2);
    expect(kills).toHaveLength(2);
    expect(kills.every((k) => k.by === 'player')).toBe(true);
    expect(game.state.stats.kills).toBe(2);
    expect(game.state.combat.killsThisWave).toBe(0);
    step(1);
    expect(game.sys.combat.wildNear(HX, HZ, 20)).toBe(0);
  });

  it('wild swarm queens spawn wild minions that share their home', () => {
    const t = makeGame();
    const { game, step } = t;
    game.sys.combat.spawnWild('t_queen', 1, HX, HZ);
    step(4.6);
    const wild = game.state.combat.aliens.filter((a) => a.wild);
    expect(wild.length).toBeGreaterThanOrEqual(3);
    for (const a of wild) {
      expect(a.homeX).toBe(HX);
      expect(a.homeZ).toBe(HZ);
    }
  });
});
