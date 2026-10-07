import { describe, expect, it } from 'vitest';
import { cellCenter, cellOf, footprintCenter } from '../src/core/constants';
import type { BuildingInstance, Colonist } from '../src/core/state';
import type { WorldNode } from '../src/sim/world';
import { addBuilding, addColonist, addCore, dist, fakeNodes, makeGame, type Harness } from './colonists.util';

/** The internals under test (private in the system, plain in the test). */
interface AiInternals {
  stats: { searches: number; cacheHits: number; replans: number; expanded: number; fallbacks: number };
  pathCache: Map<number, unknown>;
  pending: number;
  brains: Map<number, { pst: number; wpn: number; wp: Float32Array | null; moving: boolean }>;
  setGoal(c: Colonist, br: unknown, x: number, z: number, enter: number, act: string, stay: number, face: boolean, fx: number, fz: number): void;
}
const aiOf = (h: Harness) => (h.game.sys.colonists as unknown as { ai: AiInternals }).ai;

const centerOf = (h: Harness, b: BuildingInstance) => footprintCenter(b.x, b.z, h.game.data.building(b.def)!.size, b.rot);

/** A rectangular ring of walls (x0..x1, z0..z1 inclusive) with doors at the given cells. */
function ring(h: Harness, x0: number, z0: number, x1: number, z1: number, doors: [number, number][] = []): BuildingInstance[] {
  const out: BuildingInstance[] = [];
  const isDoor = (x: number, z: number) => doors.some(([dx, dz]) => dx === x && dz === z);
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
      out.push(addBuilding(h.game, isDoor(x, z) ? 'door' : 'wall', x, z));
    }
  }
  return out;
}

/** Step frame by frame, calling `each` after every frame. */
function watch(h: Harness, seconds: number, each: () => void, dt = 0.1): void {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    h.clock.now += dt * 1000;
    h.game.update(dt);
    each();
  }
}

function until(h: Harness, pred: () => boolean, maxSeconds = 60, dt = 0.1): boolean {
  const n = Math.round(maxSeconds / dt);
  for (let i = 0; i < n; i++) {
    if (pred()) return true;
    h.clock.now += dt * 1000;
    h.game.update(dt);
  }
  return pred();
}

/** Tracks per-frame displacement (teleports) and illegal cells for a colonist. */
function tracker(h: Harness, c: Colonist, allowId = -1) {
  const t = { maxJump: 0, jumps: 0, inWall: false, last: { x: c.x, z: c.z }, cells: new Set<string>() };
  return {
    t,
    sample() {
      const j = dist(c.x, c.z, t.last.x, t.last.z);
      t.maxJump = Math.max(t.maxJump, j);
      if (j > 1.5) t.jumps++;
      t.last = { x: c.x, z: c.z };
      const cx = cellOf(c.x);
      const cz = cellOf(c.z);
      t.cells.add(`${cx},${cz}`);
      const bs = h.game.sys.buildings;
      if (bs.blocked(cx, cz, 'colonist') && bs.at(cx, cz)?.id !== allowId) t.inWall = true;
    },
  };
}

describe('colonist pathfinding', () => {
  it('walks around a wall and through the door to reach a bed inside a closed room (no teleport)', () => {
    const h = makeGame();
    // 9x7 room, interior x 141..147, z 141..145; the only door is on the EAST side, the colonist comes from the west
    const door: [number, number] = [148, 143];
    ring(h, 140, 140, 148, 146, [door]);
    const shelter = addBuilding(h.game, 'shelter', 143, 143);
    const sc = centerOf(h, shelter);
    expect(h.game.sys.buildings.roomAt(142, 142)).toBeGreaterThan(0); // really an enclosed room
    const c = addColonist(h.game, 'common', {}, cellCenter(132), cellCenter(143));
    expect(c.bed).toBe(shelter.id);
    h.game.state.player.x = 10;
    h.game.state.player.z = 0;
    const tr = tracker(h, c, shelter.id);
    h.game.state.time.dayTime = 0.8; // night: go to bed
    let throughDoor = false;
    watch(h, 40, () => {
      tr.sample();
      if (cellOf(c.x) === door[0] && cellOf(c.z) === door[1]) throughDoor = true;
    });
    expect(c.activity).toBe('sleeping');
    expect(dist(c.x, c.z, sc.x, sc.z)).toBeLessThan(2.5);
    expect(throughDoor).toBe(true);
    expect(tr.t.jumps).toBe(0); // never popped through a wall
    expect(tr.t.maxJump).toBeLessThan(0.6);
    expect(tr.t.inWall).toBe(false);
    expect(aiOf(h).stats.searches).toBeGreaterThanOrEqual(1);
    expect(aiOf(h).stats.fallbacks).toBe(0);
  });

  it('leaves the room again in the morning (starts inside a solid building) and walks to work without teleporting', () => {
    const h = makeGame();
    const door: [number, number] = [148, 143];
    ring(h, 140, 140, 148, 146, [door]);
    const shelter = addBuilding(h.game, 'shelter', 143, 143);
    const camp = addBuilding(h.game, 'logging_camp', 120, 143); // west of the room: the door faces away from it
    fakeNodes(h.game, []);
    const cc = centerOf(h, camp);
    const c = addColonist(h.game, 'common', { specialty: 'gatherer' }, cellCenter(143), cellCenter(143));
    expect(c.bed).toBe(shelter.id);
    expect(c.workplace).toBe(camp.id);
    h.game.state.player.x = 0;
    h.game.state.player.z = 0;
    h.game.state.time.dayTime = 0.9;
    h.run(10);
    expect(c.activity).toBe('sleeping');
    const tr = tracker(h, c, shelter.id);
    h.game.state.time.dayTime = 0.3;
    let throughDoor = false;
    const ok = until(h, () => {
      tr.sample();
      if (cellOf(c.x) === door[0] && cellOf(c.z) === door[1]) throughDoor = true;
      return c.activity === 'working' && dist(c.x, c.z, cc.x, cc.z) < 6;
    }, 90);
    expect(ok).toBe(true);
    expect(throughDoor).toBe(true);
    expect(tr.t.jumps).toBe(0);
    expect(tr.t.inWall).toBe(false);
  });

  it('a sealed room without a door has no path: walks to the nearest wall, then teleports in (last resort)', () => {
    const h = makeGame();
    ring(h, 140, 140, 148, 146);
    const shelter = addBuilding(h.game, 'shelter', 143, 143);
    const sc = centerOf(h, shelter);
    const c = addColonist(h.game, 'common', {}, cellCenter(132), cellCenter(143));
    expect(c.bed).toBe(shelter.id);
    h.game.state.player.x = 10;
    h.game.state.player.z = 0;
    const tr = tracker(h, c, shelter.id);
    h.game.state.time.dayTime = 0.8;
    // distance from a point to the room's outer rectangle (cells 140..148 x 140..146)
    const rx0 = cellCenter(140) - 1;
    const rx1 = cellCenter(148) + 1;
    const rz0 = cellCenter(140) - 1;
    const rz1 = cellCenter(146) + 1;
    const outside = (x: number, z: number) => Math.hypot(Math.max(rx0 - x, 0, x - rx1), Math.max(rz0 - z, 0, z - rz1));
    let jumpFrom = Infinity;
    let walked = 0;
    watch(h, 30, () => {
      const before = tr.t.jumps;
      const prev = { ...tr.t.last };
      tr.sample();
      if (tr.t.jumps > before) jumpFrom = outside(prev.x, prev.z);
      else if (tr.t.jumps === 0 && c.activity === 'walking') walked += tr.t.maxJump > 0 ? 1 : 0;
    });
    expect(c.activity).toBe('sleeping');
    expect(dist(c.x, c.z, sc.x, sc.z)).toBeLessThan(2.5); // popped inside
    expect(tr.t.jumps).toBe(1); // exactly one teleport
    expect(jumpFrom).toBeLessThan(1.6); // ... from right outside the wall, not from across the base
    expect(walked).toBeGreaterThan(30); // it did walk there first
    expect(tr.t.inWall).toBe(false); // and never into the wall
    expect(aiOf(h).stats.fallbacks).toBeGreaterThanOrEqual(1);
  });

  it('caches paths per (start cell, goal cell) and drops them when a wall is placed', () => {
    const h = makeGame();
    addCore(h.game);
    // a wall segment between the trip's ends
    for (let z = 122; z <= 134; z++) addBuilding(h.game, 'wall', 136, z);
    const colonists = [0, 1, 2].map(() => addColonist(h.game, 'common', {}, cellCenter(132), cellCenter(128)));
    h.game.state.player.x = 0;
    h.game.state.player.z = 0;
    h.run(0.2); // brains exist
    const ai = aiOf(h);
    const gx = cellCenter(140) + 0.3;
    const gz = cellCenter(128) - 0.2;
    const send = (c: Colonist) => {
      const br = ai.brains.get(c.id)!;
      br.moving = false;
      ai.setGoal(c, br, gx, gz, -1, 'idle', 5, false, 0, 0);
      return br;
    };
    const s0 = ai.stats.searches;
    const b0 = send(colonists[0]);
    expect(b0.pst).toBe(2); // following a path (the wall is in the way)
    expect(ai.stats.searches).toBe(s0 + 1);
    expect(ai.pathCache.size).toBe(1);
    // same start cell + goal cell: served from the cache, no new search
    const b1 = send(colonists[1]);
    expect(b1.pst).toBe(2);
    expect(ai.stats.searches).toBe(s0 + 1);
    expect(ai.stats.cacheHits).toBeGreaterThanOrEqual(1);
    // a wall goes up: event -> cache gone, next request searches again
    addBuilding(h.game, 'wall', 136, 135);
    h.game.bus.emit('building:changed', {});
    expect(ai.pathCache.size).toBe(0);
    const b2 = send(colonists[2]);
    expect(b2.pst).toBe(2);
    expect(ai.stats.searches).toBe(s0 + 2);
  });

  it('also invalidates when buildings change without an event (version bump) and for real placements', () => {
    const h = makeGame();
    addCore(h.game);
    for (let z = 122; z <= 134; z++) addBuilding(h.game, 'wall', 136, z);
    const c = addColonist(h.game, 'common', {}, cellCenter(132), cellCenter(128));
    h.run(0.2);
    const ai = aiOf(h);
    const br = ai.brains.get(c.id)!;
    br.moving = false;
    ai.setGoal(c, br, cellCenter(140), cellCenter(128), -1, 'idle', 5, false, 0, 0);
    expect(ai.pathCache.size).toBe(1);
    addBuilding(h.game, 'wall', 136, 135); // test helper bumps derived.buildingsVersion, no event
    h.run(0.1);
    expect(ai.pathCache.size).toBe(0);
    // real construction: place() emits building:changed
    br.moving = false;
    ai.setGoal(c, br, cellCenter(141), cellCenter(128), -1, 'idle', 5, false, 0, 0);
    expect(ai.pathCache.size).toBe(1);
    expect(h.game.sys.buildings.place('wall', 135, 128, 0, { free: true, instant: true })).not.toBeNull();
    expect(ai.pathCache.size).toBe(0);
  });

  it('re-plans around a wall that goes up across its route mid-walk (never walks through it)', () => {
    const h = makeGame();
    addCore(h.game);
    const camp = addBuilding(h.game, 'logging_camp', 160, 127);
    const cc = centerOf(h, camp);
    fakeNodes(h.game, []);
    // a wall at x=143 from z=116 to z=138: gaps to the north (z<=115) and the south (z>=139); the north one is closer
    for (let z = 116; z <= 138; z++) addBuilding(h.game, 'wall', 143, z);
    const c = addColonist(h.game, 'common', { specialty: 'gatherer' }, cellCenter(131), cellCenter(125));
    expect(c.workplace).toBe(camp.id);
    h.game.state.player.x = 20;
    h.game.state.player.z = 0;
    const tr = tracker(h, c);
    let t = 0;
    let closedAt = -1;
    let minZ = Infinity;
    const ok = until(
      h,
      () => {
        tr.sample();
        t += 0.1;
        minZ = Math.min(minZ, c.z);
        // after 4 s (heading north along the wall), seal the northern gap
        if (t > 4 && closedAt < 0) {
          closedAt = t;
          for (let z = 100; z <= 115; z++) addBuilding(h.game, 'wall', 143, z);
          h.game.bus.emit('building:changed', {});
        }
        return c.activity === 'working' && dist(c.x, c.z, cc.x, cc.z) < 6;
      },
      120,
    );
    expect(ok).toBe(true);
    expect(aiOf(h).stats.replans).toBeGreaterThanOrEqual(1);
    expect(tr.t.inWall).toBe(false);
    expect(tr.t.jumps).toBe(0);
    expect(minZ).toBeLessThan(cellCenter(125) - 1); // it did start north...
    expect(c.z).toBeGreaterThan(cellCenter(125) - 20);
  });
});
