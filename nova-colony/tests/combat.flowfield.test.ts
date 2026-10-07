import { describe, expect, it } from 'vitest';
import { FlowField, COST_BLOCKED, COST_OPEN } from '../src/sim/combat/flowField';
import { TUNE } from '../src/sim/combat/types';
import { addBuilding, cellWorld, CORE_CELL, makeGame } from './combat.helpers';
import type { Game } from '../src/core/Game';

/** Remove the planned wave so a test can spawn its own invaders. */
function clearWave(game: Game): void {
  game.state.combat.spawnQueue.length = 0;
  for (const a of game.state.combat.aliens) {
    a.hp = 0;
    a.state = 'dying';
  }
}

/** Follow `next` pointers from a cell to the goal; returns visited grid indices. */
function walk(f: FlowField, start: number, max = 500): number[] {
  const path = [start];
  let i = start;
  while (f.next[i] >= 0 && path.length < max) {
    i = f.next[i];
    path.push(i);
  }
  return path;
}

describe('flow field', () => {
  it('routes around a wall through the gap instead of bashing through', () => {
    const f = new FlowField();
    f.reset(0, 0, 21);
    const n = 21;
    // vertical wall at x = 5 covering z = 0..12 (gap at z >= 13): the detour is cheaper than bashing
    for (let z = 0; z <= 12; z++) f.cost[z * n + 5] = TUNE.BASH_COST;
    const goal = 10 * n + 10;
    f.solve([goal], 1);
    const start = 10 * n + 0;
    const path = walk(f, start);
    expect(path[path.length - 1]).toBe(goal);
    for (const i of path) expect(f.cost[i]).toBe(COST_OPEN);
    // the path must use the gap
    expect(path.some((i) => i % n === 5 && Math.floor(i / n) >= 13)).toBe(true);
    expect(f.dist[start]).toBeGreaterThan(10);
  });

  it('bashes through exactly one wall when the goal is fully enclosed', () => {
    const f = new FlowField();
    const n = 21;
    f.reset(0, 0, n);
    for (let x = 6; x <= 14; x++) {
      f.cost[6 * n + x] = TUNE.BASH_COST;
      f.cost[14 * n + x] = TUNE.BASH_COST;
    }
    for (let z = 6; z <= 14; z++) {
      f.cost[z * n + 6] = TUNE.BASH_COST;
      f.cost[z * n + 14] = TUNE.BASH_COST;
    }
    const goal = 10 * n + 10;
    f.solve([goal], 1);
    const path = walk(f, 10 * n + 0);
    expect(path[path.length - 1]).toBe(goal);
    expect(path.filter((i) => f.cost[i] === TUNE.BASH_COST)).toHaveLength(1);
  });

  it('treats water as impassable and never cuts diagonal corners', () => {
    const f = new FlowField();
    const n = 9;
    f.reset(0, 0, n);
    // diagonal pair of walls: (4,3) and (3,4); a diagonal step (3,3)->(4,4) would squeeze between them
    f.cost[3 * n + 4] = TUNE.BASH_COST;
    f.cost[4 * n + 3] = TUNE.BASH_COST;
    // water column
    for (let z = 0; z < n; z++) if (z !== 8) f.cost[z * n + 7] = COST_BLOCKED;
    f.solve([8 * n + 8], 1);
    expect(f.next[3 * n + 3]).not.toBe(4 * n + 4);
    for (let z = 0; z < n; z++) if (z !== 8) expect(f.dist[z * n + 7]).toBe(Infinity);
    const path = walk(f, 0);
    expect(path[path.length - 1]).toBe(8 * n + 8);
    for (const i of path) expect(f.cost[i]).not.toBe(COST_BLOCKED);
  });

  it('builds from colony buildings: core cells are goals, walls bashable, floors open, damaged walls open', () => {
    const t = makeGame();
    const { game } = t;
    const wall = addBuilding(game, 'wall', 135, 128);
    const floor = addBuilding(game, 'floor', 136, 128);
    const broken = addBuilding(game, 'wall', 137, 128, { status: 'damaged', hp: 0 });
    const door = addBuilding(game, 'door', 138, 128);
    game.sys.combat.refresh();
    const f = game.sys.combat.flowField();
    expect(f.ready).toBe(true);
    const r = game.state.colony.radius + TUNE.FIELD_MARGIN;
    expect(f.n).toBe(r * 2 + 1);
    for (let dz = 0; dz < 3; dz++)
      for (let dx = 0; dx < 3; dx++) {
        const i = f.idx(CORE_CELL + dx, CORE_CELL + dz);
        expect(f.dist[i]).toBe(0);
        expect(f.occ[i]).toBe(t.core.id);
      }
    const wi = f.idx(135, 128);
    expect(f.cost[wi]).toBe(TUNE.BASH_COST);
    expect(f.occ[wi]).toBe(wall.id);
    expect(f.cost[f.idx(136, 128)]).toBe(COST_OPEN);
    expect(f.occ[f.idx(136, 128)]).toBe(0);
    expect(f.cost[f.idx(137, 128)]).toBe(COST_OPEN);
    expect(f.occ[f.idx(138, 128)]).toBe(door.id); // doors stop aliens
    void floor;
    void broken;
  });

  it('invaders walk around a short wall instead of hitting it', () => {
    const t = makeGame();
    const { game, step } = t;
    // a short wall west of the core: walking around is cheaper than bashing through
    const walls = [];
    for (let z = 124; z <= 132; z++) walls.push(addBuilding(game, 'wall', 120, z));
    const wallIds = new Set(walls.map((w) => w.id));
    const sys = game.sys.combat;
    sys.schedule(0, 0);
    step(0.05);
    clearWave(game);
    const def = game.data.alien('crawler')!;
    for (let k = 0; k < 4; k++) sys.spawnInvader(def.id, cellWorld(108), cellWorld(126 + k * 2));
    let insideWall = false;
    step(40, () => {
      for (const a of game.state.combat.aliens) {
        const cx = Math.floor((a.x + 256) / 2);
        const cz = Math.floor((a.z + 256) / 2);
        if (cx === 120 && cz >= 124 && cz <= 132 && a.state !== 'dying') insideWall = true;
      }
      return t.damageLog.some((d) => d.id === t.core.id);
    });
    expect(insideWall).toBe(false);
    expect(t.damageLog.filter((d) => wallIds.has(d.id))).toHaveLength(0);
    expect(t.damageLog.some((d) => d.id === t.core.id)).toBe(true); // they made it around to the core
  });

  it('invaders bash through an enclosure, then walk through the broken (damaged) piece', () => {
    const t = makeGame();
    const { game, step } = t;
    const ring = new Map<number, ReturnType<typeof addBuilding>>();
    for (let i = 122; i <= 134; i++) {
      for (const [x, z] of [[i, 122], [i, 134], [122, i], [134, i]]) {
        const w = addBuilding(game, 'wall', x, z);
        ring.set(w.id, w);
      }
    }
    const sys = game.sys.combat;
    sys.schedule(0, 0);
    step(0.05);
    clearWave(game);
    const def = game.data.alien('crawler')!;
    for (let k = 0; k < 3; k++) sys.spawnInvader(def.id, cellWorld(110), cellWorld(127 + k));
    step(90, () => t.damageLog.some((d) => d.id === t.core.id));
    const broken = [...ring.values()].filter((w) => w.status === 'damaged');
    expect(broken.length).toBeGreaterThanOrEqual(1);
    expect(t.damageLog.some((d) => d.id === t.core.id)).toBe(true);
    // the rubble is open ground in the rebuilt field
    const f = sys.flowField();
    for (const w of broken) expect(f.cost[f.idx(w.x, w.z)]).toBe(COST_OPEN);
  });

  it('rebuilds (debounced) when the layout changes during an attack', () => {
    const t = makeGame();
    const { game, step } = t;
    game.sys.combat.schedule(0, 0);
    step(0.1);
    const f = game.sys.combat.flowField();
    const v0 = f.version;
    addBuilding(game, 'wall', 140, 140);
    step(0.1);
    expect(f.version).toBe(v0); // debounced
    step(TUNE.FIELD_DEBOUNCE + 0.1);
    expect(f.version).toBe(v0 + 1);
    expect(f.cost[f.idx(140, 140)]).toBe(TUNE.BASH_COST);
  });
});
