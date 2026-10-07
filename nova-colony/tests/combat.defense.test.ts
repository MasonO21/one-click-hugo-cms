import { describe, expect, it } from 'vitest';
import { addBuilding, cellWorld, makeGame } from './combat.helpers';
import type { Game } from '../src/core/Game';

function clearWave(game: Game): void {
  game.state.combat.spawnQueue.length = 0;
  for (const a of game.state.combat.aliens) {
    a.hp = 0;
    a.state = 'dying';
  }
}

describe('defenses', () => {
  it('one Scrap Turret wins the tutorial wave comfortably on its own', () => {
    const t = makeGame();
    const { game, step } = t;
    const turret = addBuilding(game, 'scrap_turret', 131, 128);
    const kills = t.record('alien:killed');
    const fired = t.record('turret:fired');
    game.sys.combat.schedule(0, 0);
    const dur = step(180, () => game.state.combat.phase === 'victory');
    expect(game.state.combat.phase).toBe('victory');
    expect(dur).toBeLessThan(60);
    expect(kills).toHaveLength(8);
    expect(kills.every((k) => k.by === 'turret')).toBe(true);
    expect(fired.length).toBeGreaterThan(0);
    expect(fired[0].building).toBe(turret.id);
    expect(turret.status).toBe('active');
    expect(t.core.status).toBe('active');
    expect(t.core.hp).toBeGreaterThan(t.core.maxHp * 0.7);
    expect(game.state.stats.kills).toBe(8);
    expect(game.state.combat.killsThisWave).toBe(8);
    // kill drops flew to storage
    expect(game.state.resources.amounts.fiber ?? 0).toBeGreaterThan(0);
  });

  it('early waves approach from the side the turrets cover, so an edge turret still wins the tutorial', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const t = makeGame({ seed });
      const { game, step } = t;
      addBuilding(game, 'scrap_turret', 138, 128); // eastern edge of the colony (10 cells from the core)
      const spawned = t.record('alien:spawned');
      const kills = t.record('alien:killed');
      game.sys.combat.schedule(0, 0);
      const dur = step(240, () => game.state.combat.phase === 'victory');
      expect(spawned.length).toBe(8);
      for (const s of spawned) expect(s.x).toBeGreaterThan(15); // all from the east
      expect(game.state.combat.phase).toBe('victory');
      expect(dur).toBeLessThan(120);
      // the turret does the work; a wounded straggler that slips past soon gives up and flees
      expect(kills.filter((k) => k.by === 'turret').length).toBeGreaterThanOrEqual(7);
      expect(t.core.status).toBe('active');
      expect(t.core.hp).toBeGreaterThan(t.core.maxHp * 0.6);
    }
  });

  it('standing next to the manual turret (with the pod pistol) wins faster with less damage', () => {
    const run = (helped: boolean) => {
      const t = makeGame({ armed: helped });
      const { game, step } = t;
      addBuilding(game, 'scrap_turret', 131, 128);
      if (helped) {
        game.state.player.x = cellWorld(132);
        game.state.player.z = cellWorld(129);
      }
      game.sys.combat.schedule(0, 0);
      const dur = step(180, () => game.state.combat.phase === 'victory');
      const coreDamage = t.damageLog.filter((d) => d.id === t.core.id).reduce((s, d) => s + d.amount, 0);
      return { dur, coreDamage };
    };
    const alone = run(false);
    const helped = run(true);
    expect(helped.dur).toBeLessThan(alone.dur);
    expect(helped.coreDamage).toBeLessThan(alone.coreDamage);
  });

  it('flyers ignore ground-only turrets and are shot down by anti-air', () => {
    const t = makeGame({ armed: false });
    const { game, step } = t;
    const home = { x: cellWorld(160), z: cellWorld(160) };
    addBuilding(game, 'scrap_turret', 162, 160);
    const [id] = game.sys.combat.spawnWild('t_flyer', 1, home.x, home.z);
    const hits = t.record('alien:hit');
    step(10);
    const flyer = game.state.combat.aliens.find((a) => a.id === id)!;
    expect(flyer.air).toBe(true);
    expect(flyer.hp).toBe(flyer.maxHp);
    expect(hits).toHaveLength(0);

    addBuilding(game, 't_aa', 158, 160);
    const kills = t.record('alien:killed');
    step(10, () => kills.length > 0);
    expect(kills).toHaveLength(1);
    expect(kills[0].id).toBe(id);
  });

  it('pure anti-air turrets never shoot ground aliens', () => {
    const t = makeGame();
    const { game, step } = t;
    addBuilding(game, 't_aa', 158, 160);
    game.sys.combat.spawnWild('crawler', 2, cellWorld(160), cellWorld(160));
    const fired = t.record('turret:fired');
    step(8);
    expect(fired).toHaveLength(0);
  });

  it('shields absorb damage first, regenerate, and only protect buildings in radius', () => {
    const t = makeGame();
    const { game, step } = t;
    const shield = addBuilding(game, 't_shield', 140, 140);
    const inside = addBuilding(game, 'wall', 143, 140); // 3 cells away
    const outside = addBuilding(game, 'wall', 150, 140); // 10 cells away
    const shieldHits = t.record('shield:hit');
    const sys = game.sys.combat;

    expect(sys.hitBuilding(inside.id, 60)).toBe(0);
    expect(t.damageLog).toHaveLength(0);
    expect(sys.shieldInfo(shield.id)!.hp).toBeCloseTo(40);
    expect(shieldHits.length).toBeGreaterThan(0);
    expect(shieldHits[0].building).toBe(shield.id);

    expect(sys.hitBuilding(inside.id, 60)).toBeCloseTo(20);
    expect(t.damageLog).toEqual([{ id: inside.id, amount: 20 }]);
    expect(inside.hp).toBe(inside.maxHp - 20);

    expect(sys.hitBuilding(outside.id, 30)).toBe(30);
    expect(t.damageLog[1]).toEqual({ id: outside.id, amount: 30 });

    step(4); // regen 5/s
    expect(sys.shieldInfo(shield.id)!.hp).toBeCloseTo(20, 0);
    step(60);
    expect(sys.shieldInfo(shield.id)!.hp).toBeCloseTo(100);
  });

  it('spike traps hurt and slow aliens walking over them', () => {
    const t = makeGame();
    const { game, step } = t;
    const sys = game.sys.combat;
    sys.schedule(0, 0);
    step(0.05);
    clearWave(game);
    // a field of spikes east of the core, aliens come from the east
    for (let x = 133; x <= 138; x++) for (let z = 126; z <= 130; z++) addBuilding(game, 'spike_trap', x, z);
    const id = sys.spawnInvader('crawler', cellWorld(142), cellWorld(128))!;
    const kills = t.record('alien:killed');
    let slowed = false;
    step(20, () => {
      const a = game.state.combat.aliens.find((x) => x.id === id);
      if (a && a.slow > 0) slowed = true;
      return kills.length > 0;
    });
    expect(slowed).toBe(true);
    expect(kills).toHaveLength(1);
    expect(kills[0].by).toBe('trap');
  });

  it('railguns pierce several aliens in a line with one shot', () => {
    const t = makeGame();
    const { game, step } = t;
    addBuilding(game, 't_rail', 150, 128);
    const sys = game.sys.combat;
    // a column of crawlers lined up west of the railgun (wild so they idle in place for a moment)
    for (let k = 0; k < 4; k++) sys.spawnWild('crawler', 1, cellWorld(142 - k * 2), cellWorld(128));
    const kills = t.record('alien:killed');
    const fired = t.record('turret:fired');
    step(1.2, () => fired.length > 0); // spawn-in, then the first shot
    step(0.05);
    expect(fired).toHaveLength(1);
    expect(kills.length).toBeGreaterThanOrEqual(3);
  });

  it('drones fly out, strike, and return to their pad', () => {
    const t = makeGame();
    const { game, step } = t;
    const pad = addBuilding(game, 't_drone', 150, 128);
    game.sys.combat.spawnWild('t_brute', 1, cellWorld(156), cellWorld(128));
    const hits = t.record('alien:hit');
    let sawReturning = false;
    let sawDrone = false;
    step(8, () => {
      for (const p of game.state.combat.projectiles) {
        if (p.kind === 'drone') sawDrone = true;
        if (p.kind === 'drone' && p.leg === 1) sawReturning = true;
      }
      return sawReturning;
    });
    expect(sawDrone).toBe(true);
    expect(hits.length).toBeGreaterThan(0);
    expect(sawReturning).toBe(true);
    step(5);
    // drones that made it home are gone; the pad keeps launching new ones while the target lives
    const info = game.sys.combat.turretInfo(pad.id)!;
    expect(info.firedAt).toBeGreaterThan(0);
  });

  it('cannons lob splash shells that damage clustered aliens', () => {
    const t = makeGame();
    const { game, step } = t;
    addBuilding(game, 't_cannon', 150, 128);
    game.sys.combat.spawnWild('t_brute', 3, cellWorld(158), cellWorld(129));
    const impacts = t.record('projectile:impact');
    step(6, () => impacts.length > 0);
    expect(impacts.length).toBeGreaterThan(0);
    expect(impacts[0].splash).toBeCloseTo(3);
    const damaged = game.state.combat.aliens.filter((a) => a.hp < a.maxHp);
    expect(damaged.length).toBeGreaterThanOrEqual(2);
  });

  it('defense rating sums turret DPS with level, manual and power modifiers', () => {
    const t = makeGame();
    const { game } = t;
    const sys = game.sys.combat;
    expect(sys.defenseRating()).toBe(0);
    const tur = addBuilding(game, 'scrap_turret', 140, 140);
    expect(sys.defenseRating()).toBe(Math.round(9 * 1.6));
    tur.level = 3; // levelEffect 0.4 -> x1.8
    game.bus.emit('building:upgraded', { id: tur.id, def: tur.def, level: 3, tier: 0 });
    expect(sys.defenseRating()).toBe(Math.round(9 * 1.8 * 1.6));
    game.state.player.x = cellWorld(141);
    game.state.player.z = cellWorld(140);
    expect(sys.defenseRating()).toBe(Math.round(9 * 1.8 * 3.2)); // manual: x2 with the player beside it
    tur.status = 'damaged';
    game.bus.emit('building:broken', { id: tur.id, def: tur.def });
    expect(sys.defenseRating()).toBe(0);
  });

  it('player auto-fires at nearby aliens with the equipped weapon', () => {
    const t = makeGame({ armed: true });
    const { game, step } = t;
    game.state.player.x = cellWorld(170);
    game.state.player.z = cellWorld(170);
    expect(game.sys.combat.playerDps()).toBeCloseTo(9);
    game.sys.combat.spawnWild('crawler', 1, cellWorld(174), cellWorld(170));
    const shots = t.record('player:fired');
    const kills = t.record('alien:killed');
    step(10, () => kills.length > 0);
    expect(shots.length).toBeGreaterThan(0);
    expect(kills).toHaveLength(1);
    expect(kills[0].by).toBe('player');
  });
});
