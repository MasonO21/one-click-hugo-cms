import { describe, expect, it } from 'vitest';
import { addBuilding, cellWorld, makeGame, testData, TEST_ALIENS } from './combat.helpers';
import { defaultData } from '../src/data';
import type { AlienDef } from '../src/data/schema';

const TANK: AlienDef = { ...TEST_ALIENS[0], id: 't_tank', flying: false, hp: 1e6, speed: 1.4, prefers: 'any', scale: 0.7 };
const TANK_FLYER: AlienDef = { ...TEST_ALIENS[0], id: 't_tank_flyer', hp: 1e6 };

describe('combat performance', () => {
  it('150 aliens vs 120+ turrets stays well inside a 60 fps frame budget', () => {
    const base = defaultData();
    const data = testData({ aliens: [...base.aliens, ...TEST_ALIENS, TANK, TANK_FLYER] });
    const t = makeGame({ data, armed: true });
    const { game, step } = t;
    game.state.colony.radius = 30;
    game.state.player.x = 4;
    game.state.player.z = 4;
    // a dense ring of turrets (+ walls, traps, AA, rails, cannons, drones) around the core
    let turrets = 0;
    for (let x = 116; x <= 140; x += 2) {
      for (let z = 116; z <= 140; z += 2) {
        if (x >= 124 && x <= 132 && z >= 124 && z <= 132) continue;
        const k = (x * 7 + z * 13) % 10;
        const def = k === 0 ? 't_rail' : k === 1 ? 't_aa' : k === 2 ? 't_drone' : 'scrap_turret';
        addBuilding(game, def, x, z);
        turrets++;
      }
    }
    for (let i = 112; i <= 144; i++) {
      if (i % 3 === 0) continue;
      addBuilding(game, 'wall', i, 112);
      addBuilding(game, 'wall', i, 144);
    }
    for (let x = 117; x <= 139; x += 4) addBuilding(game, 'spike_trap', x, 121);
    addBuilding(game, 't_shield', 127, 135);
    expect(turrets).toBeGreaterThanOrEqual(120);

    game.sys.combat.schedule(0, 0);
    step(0.05);
    game.state.combat.spawnQueue.length = 0;
    const sys = game.sys.combat;
    for (let i = 0; i < 150; i++) {
      const ang = (i / 150) * Math.PI * 2;
      const r = 36 + (i % 5) * 3;
      sys.spawnInvader(i % 10 === 0 ? 't_tank_flyer' : 't_tank', cellWorld(128) + Math.cos(ang) * r, cellWorld(128) + Math.sin(ang) * r);
    }
    step(2, undefined, 1 / 60); // warm-up (JIT, pools)
    const frames = 600;
    let maxProj = 0;
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) {
      game.update(1 / 60);
      maxProj = Math.max(maxProj, game.state.combat.projectiles.length);
    }
    const avg = (performance.now() - t0) / frames;
    console.log(`[perf] ${game.state.combat.aliens.length} aliens, ${turrets} turrets, max ${maxProj} projectiles: ${avg.toFixed(3)} ms/frame`);
    expect(game.state.combat.aliens.length).toBeGreaterThanOrEqual(150);
    expect(game.state.combat.phase).toBe('attack');
    expect(avg).toBeLessThan(8);
  });

  it('rebuilds the largest (Titanium) flow field quickly', () => {
    const t = makeGame();
    const { game } = t;
    game.state.colony.radius = 48;
    for (let i = 90; i <= 166; i++) {
      addBuilding(game, 'wall', i, 90);
      addBuilding(game, 'wall', i, 166);
      addBuilding(game, 'wall', 90, i);
      addBuilding(game, 'wall', 166, i);
    }
    const sys = game.sys.combat;
    sys.refresh(); // warm-up
    const runs = 20;
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) sys.refresh();
    const avg = (performance.now() - t0) / runs;
    console.log(`[perf] flow field ${sys.flowField().n}x${sys.flowField().n}: ${avg.toFixed(2)} ms/rebuild`);
    expect(sys.flowField().n).toBe(121);
    expect(avg).toBeLessThan(25);
  });
});
