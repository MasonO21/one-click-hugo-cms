import { describe, expect, it } from 'vitest';
import { cellOf } from '../src/core/constants';
import { Rng } from '../src/core/rng';
import { findClearSpot, makeGame, stubWalls } from './world.helpers';

describe('soak: random play never breaks the movement invariants', () => {
  it('10 simulated minutes of erratic input among walls, trees, lakes and borders', () => {
    const { game } = makeGame(4321);
    const w = game.sys.world;
    const rng = new Rng(77);
    // scatter walls around the colony start
    const walls = new Set<string>();
    const c0x = cellOf(0);
    const c0z = cellOf(5);
    for (let i = 0; i < 140; i++) {
      const cx = c0x + rng.int(-24, 24);
      const cz = c0z + rng.int(-24, 24);
      if (Math.abs(cx - c0x) < 2 && Math.abs(cz - c0z) < 2) continue;
      walls.add(`${cx},${cz}`);
    }
    stubWalls(game, walls);
    game.state.player.vehicles.push('atv');
    const p = game.state.player;
    let stuckFrames = 0;
    let worstStuck = 0;
    let dt = 1 / 60;
    for (let f = 0; f < 60 * 600; f++) {
      if (f % 45 === 0) {
        const a = rng.next() * Math.PI * 2;
        const m = rng.chance(0.15) ? 0 : rng.range(0.3, 1);
        game.input.moveX = Math.cos(a) * m;
        game.input.moveY = Math.sin(a) * m;
        game.view.camera.yaw = rng.next() * 6.28;
      }
      if (f % 900 === 0) {
        if (p.vehicle) game.sys.player.dismount();
        else if (rng.chance(0.5)) game.sys.player.mount('atv');
      }
      if (f % 3000 === 2999) {
        // occasionally jump somewhere else (fast travel / respawn style teleports)
        const s = findClearSpot(game, 4, rng.int(10, 120));
        game.sys.player.teleport(s.x, s.z);
      }
      if (f % 4000 === 3999) game.sys.player.hurt(1000);
      dt = f % 97 === 0 ? 0.25 : 1 / 60; // sprinkle worst-case frame times
      game.update(dt);

      expect(Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.rot) && Number.isFinite(p.hp)).toBe(true);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(256);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(256);
      expect(p.hp).toBeGreaterThanOrEqual(0);
      expect(p.hp).toBeLessThanOrEqual(game.sys.player.maxHp() + 1e-6);
      expect(game.sys.player.carried()).toBeLessThanOrEqual(game.sys.player.capacity());
      const cx = cellOf(p.x);
      const cz = cellOf(p.z);
      const bad = walls.has(`${cx},${cz}`) || w.isWaterCell(cx, cz) || !w.isUnlocked(w.regionAtCell(cx, cz));
      stuckFrames = bad ? stuckFrames + 1 : 0;
      worstStuck = Math.max(worstStuck, stuckFrames);
    }
    // any overlap is resolved immediately by the push-out; the rescue timer (1.2 s) is the hard cap
    expect(worstStuck).toBeLessThan(60 * 1.5);
    expect(game.state.stats.gathered).toBeGreaterThan(0);
    expect(game.state.stats.explored).toBeGreaterThanOrEqual(0);
  });
});

describe('guide helpers', () => {
  it('finds the nearest node of a kind and the nearest unvisited POI of a def or kind', () => {
    const { game } = makeGame();
    const w = game.sys.world;
    const tree = w.findNodeByDef('tree_round', 0, 0)!;
    expect(tree.def).toBe('tree_round');
    for (const n of w.gen.nodes) if (n.def === 'tree_round') expect(Math.hypot(n.x, n.z)).toBeGreaterThanOrEqual(Math.hypot(tree.x, tree.z) - 1e-9);
    for (let i = 0; i < 5; i++) w.hitNode(tree.i, 1);
    expect(w.findNodeByDef('tree_round', 0, 0)!.i).not.toBe(tree.i);
    expect(w.findNodeByDef('nope', 0, 0)).toBeNull();
    const camp = w.nearestPoi('survivor_camp', 0, 0)!;
    expect(camp.def).toBe('survivor_camp');
    expect(w.nearestPoi('camp', 0, 0)!.id).toBe(camp.id); // by kind too
    w.lootPoi(camp.id);
    expect(w.nearestPoi('survivor_camp', 0, 0)!.id).not.toBe(camp.id);
    expect(w.nearestPoi('beacon', 0, 0)!.def).toBe('beacon');
    expect(w.nearestPoi('nope', 0, 0)).toBeNull();
  });
});
