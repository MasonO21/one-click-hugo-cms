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
  brains: Map<number, { pst: number; wpn: number; wp: Float32Array | null; moving: boolean; nextThink: number }>;
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

// generous timeouts: the full suite runs many workers in parallel on small machines
describe('colonist pathfinding', { timeout: 90_000 }, () => {
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

  it('spreads path requests over frames: bounded searches and expansions per frame, everybody still arrives without teleporting', () => {
    const h = makeGame();
    addCore(h.game);
    // a big ring (cells 100..156) with its only gate on the NORTH side; the crowd starts south of it
    ring(h, 100, 100, 156, 156, [[128, 100]]);
    const crowd: Colonist[] = [];
    for (let i = 0; i < 30; i++) crowd.push(addColonist(h.game, 'common', {}, cellCenter(106 + i * 1.5), cellCenter(160)));
    h.game.state.player.x = 0;
    h.game.state.player.z = 20;
    h.run(0.2);
    const ai = aiOf(h);
    for (const c of crowd) ai.brains.get(c.id)!.nextThink = 1e9; // freeze their own decisions: we drive them
    const goals = crowd.map((c, i) => ({ x: cellCenter(112 + (i % 15) * 2.3), z: cellCenter(112 + Math.floor(i / 15) * 5) }));
    crowd.forEach((c, i) => {
      const br = ai.brains.get(c.id)!;
      br.moving = false;
      ai.setGoal(c, br, goals[i].x, goals[i].z, -1, 'idle', 60, false, 0, 0);
    });
    expect(ai.pending).toBeGreaterThan(5); // not everybody got a path in the same instant
    let maxSearches = 0;
    let maxExpanded = 0;
    let frames = 0;
    let jumps = 0;
    const last = crowd.map((c) => ({ x: c.x, z: c.z }));
    while ((ai.pending > 0 || frames < 5) && frames < 1500) {
      const s0 = { ...ai.stats };
      h.clock.now += 16;
      h.game.update(1 / 60);
      frames++;
      maxSearches = Math.max(maxSearches, ai.stats.searches - s0.searches);
      maxExpanded = Math.max(maxExpanded, ai.stats.expanded - s0.expanded);
      crowd.forEach((c, i) => {
        if (dist(c.x, c.z, last[i].x, last[i].z) > 1) jumps++;
        last[i] = { x: c.x, z: c.z };
      });
    }
    expect(ai.pending).toBe(0);
    expect(maxSearches).toBeLessThanOrEqual(4);
    expect(maxExpanded).toBeLessThanOrEqual(1500);
    expect(frames).toBeGreaterThan(10); // it really was spread out
    // everyone walks around to the gate and arrives
    const arrived = () => crowd.every((c, i) => dist(c.x, c.z, goals[i].x, goals[i].z) < 0.6);
    expect(
      until(
        h,
        () => {
          crowd.forEach((c, i) => {
            if (dist(c.x, c.z, last[i].x, last[i].z) > 1) jumps++;
            last[i] = { x: c.x, z: c.z };
          });
          return arrived();
        },
        150,
        1 / 20,
      ),
    ).toBe(true);
    expect(jumps).toBe(0);
    expect(ai.stats.fallbacks).toBe(0);
  });

  it('a wall that closes the only gate while searches are running never yields a path through it', () => {
    const h = makeGame();
    addCore(h.game);
    const walls = ring(h, 100, 100, 156, 156, [[128, 100]]);
    const crowd: Colonist[] = [];
    for (let i = 0; i < 8; i++) crowd.push(addColonist(h.game, 'common', {}, cellCenter(110 + i * 4), cellCenter(160)));
    h.game.state.player.x = 0;
    h.game.state.player.z = 20;
    h.run(0.2);
    const ai = aiOf(h);
    for (const c of crowd) ai.brains.get(c.id)!.nextThink = 1e9;
    const goals = crowd.map((c, i) => ({ x: cellCenter(116 + i * 3), z: cellCenter(120) }));
    crowd.forEach((c, i) => {
      const br = ai.brains.get(c.id)!;
      br.moving = false;
      ai.setGoal(c, br, goals[i].x, goals[i].z, -1, 'idle', 60, false, 0, 0);
    });
    expect(ai.pending).toBeGreaterThan(0); // searches still queued / running
    // close the gate right now
    const gate = walls.find((b) => b.def === 'door')!;
    h.game.sys.buildings.remove(gate.id);
    addBuilding(h.game, 'wall', 128, 100);
    h.game.bus.emit('building:changed', {});
    const trackers = crowd.map((c) => tracker(h, c));
    let frames = 0;
    const done = () => crowd.every((c, i) => dist(c.x, c.z, goals[i].x, goals[i].z) < 0.6);
    while (!done() && frames < 60 * 90) {
      h.clock.now += 16;
      h.game.update(1 / 60);
      trackers.forEach((t) => t.sample());
      frames++;
    }
    expect(done()).toBe(true); // everybody got there in the end (last-resort teleports through the sealed ring)
    for (const t of trackers) expect(t.t.inWall).toBe(false); // ... but nobody ever walked through a wall
    expect(ai.stats.fallbacks).toBeGreaterThanOrEqual(1);
  });

  it('routes around water / locked terrain (world.walkable) and never steps into it', () => {
    const h = makeGame();
    addCore(h.game);
    const camp = addBuilding(h.game, 'logging_camp', 150, 127);
    const cc = centerOf(h, camp);
    fakeNodes(h.game, []);
    // a river at x cells 138..140, z cells 112..142 (with real world data present, so terrain checks are active)
    const bs = h.game.sys.buildings;
    const isWater = (x: number, z: number) => cellOf(x) >= 138 && cellOf(x) <= 140 && cellOf(z) >= 112 && cellOf(z) <= 142;
    h.game.sys.world.walkable = (x: number, z: number) => !isWater(x, z);
    (h.game.sys.world as unknown as { gen: unknown }).gen = { nodes: [], water: new Uint8Array(1), regionMap: new Uint8Array(1) }; // terrain-aware
    void bs;
    const c = addColonist(h.game, 'common', { specialty: 'gatherer' }, cellCenter(128), cellCenter(127));
    expect(c.workplace).toBe(camp.id);
    h.game.state.player.x = 20;
    h.game.state.player.z = 0;
    const tr = tracker(h, c);
    let inWater = false;
    const ok = until(
      h,
      () => {
        tr.sample();
        if (isWater(c.x, c.z)) inWater = true;
        return c.activity === 'working' && dist(c.x, c.z, cc.x, cc.z) < 6;
      },
      90,
    );
    expect(ok).toBe(true);
    expect(inWater).toBe(false);
    expect(tr.t.jumps).toBe(0);
  });

  it('far colonists keep the simulation-LOD shortcut: they snap and never trigger a path search', () => {
    const h = makeGame();
    addCore(h.game);
    ring(h, 140, 140, 148, 146); // sealed room: a search would be pointless (and would show up in the stats)
    const shelter = addBuilding(h.game, 'shelter', 143, 143);
    const sc = centerOf(h, shelter);
    h.game.state.player.x = -300;
    h.game.state.player.z = -300;
    const c = addColonist(h.game, 'common', {}, cellCenter(120), cellCenter(143));
    expect(c.bed).toBe(shelter.id);
    h.game.state.time.dayTime = 0.8;
    let walked = false;
    watch(h, 6, () => {
      if (c.activity === 'walking') walked = true;
    });
    expect(walked).toBe(false);
    expect(c.activity).toBe('sleeping');
    expect(dist(c.x, c.z, sc.x, sc.z)).toBeLessThan(2.5);
    expect(aiOf(h).stats.searches).toBe(0);
  });

  it('soak: random walled bases never put anybody inside a wall and nothing goes NaN', () => {
    for (const seed of [11, 12, 13]) {
      const rnd = (() => {
        let st = seed * 7919;
        return () => ((st = (Math.imul(st, 1664525) + 1013904223) >>> 0) / 4294967296);
      })();
      const h = makeGame({ seed });
      addCore(h.game);
      const taken = new Set<string>();
      const free = (x: number, z: number, w: number, d: number) => {
        for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) if (taken.has(`${x + i},${z + j}`)) return false;
        return true;
      };
      const mark = (x: number, z: number, w: number, d: number) => {
        for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) taken.add(`${x + i},${z + j}`);
      };
      mark(121, 121, 14, 14); // the middle stays open (core and spawn area)
      for (let t = 0, rooms = 0; t < 80 && rooms < 7; t++) {
        const w = 5 + Math.floor(rnd() * 5);
        const d = 5 + Math.floor(rnd() * 5);
        const x = 108 + Math.floor(rnd() * 32);
        const z = 108 + Math.floor(rnd() * 32);
        if (!free(x, z, w, d)) continue;
        mark(x, z, w, d);
        rooms++;
        const doorX = rnd() < 0.5 ? x + 1 + Math.floor(rnd() * (w - 2)) : rnd() < 0.5 ? x : x + w - 1;
        const doorZ = doorX === x || doorX === x + w - 1 ? z + 1 + Math.floor(rnd() * (d - 2)) : rnd() < 0.5 ? z : z + d - 1;
        for (let i = 0; i < w; i++) {
          for (let j = 0; j < d; j++) {
            if (i !== 0 && j !== 0 && i !== w - 1 && j !== d - 1) continue;
            addBuilding(h.game, x + i === doorX && z + j === doorZ ? 'door' : 'wall', x + i, z + j);
          }
        }
        addBuilding(h.game, 'shelter', x + 2, z + 2);
      }
      for (const kind of ['logging_camp', 'quarry', 'berry_patch', 'campfire', 'kitchen', 'guard_post']) {
        for (let tries = 0; tries < 20; tries++) {
          const def = h.game.data.building(kind)!;
          const x = 108 + Math.floor(rnd() * 34);
          const z = 108 + Math.floor(rnd() * 34);
          if (!free(x, z, def.size[0], def.size[1])) continue;
          mark(x, z, def.size[0], def.size[1]);
          addBuilding(h.game, kind, x, z);
          break;
        }
      }
      fakeNodes(h.game, []);
      // spawn everybody on open ground
      const bs = h.game.sys.buildings;
      const crowd: Colonist[] = [];
      for (let i = 0; i < 24; i++) {
        for (let tries = 0; tries < 50; tries++) {
          const cx = 112 + Math.floor(rnd() * 30);
          const cz = 112 + Math.floor(rnd() * 30);
          if (bs.blocked(cx, cz, 'colonist')) continue;
          crowd.push(addColonist(h.game, 'common', {}, cellCenter(cx), cellCenter(cz)));
          break;
        }
      }
      h.game.state.player.x = 0;
      h.game.state.player.z = 0;
      const core = h.game.state.colony.coreId;
      let inWall = 0;
      for (const [dayTime, seconds] of [[0.3, 30], [0.8, 30], [0.3, 30]] as const) {
        h.game.state.time.dayTime = dayTime;
        h.game.bus.emit(dayTime > 0.7 ? 'time:nightfall' : 'time:sunrise', {});
        watch(
          h,
          seconds,
          () => {
            for (const c of crowd) {
              if (!Number.isFinite(c.x) || !Number.isFinite(c.z) || !Number.isFinite(c.rot)) throw new Error('NaN colonist');
              const cx = cellOf(c.x);
              const cz = cellOf(c.z);
              if (bs.blocked(cx, cz, 'colonist')) {
                const at = bs.at(cx, cz);
                if (!at || (at.id !== c.bed && at.id !== c.workplace && at.id !== core)) inWall++;
              }
            }
          },
          1 / 20,
        );
      }
      expect(inWall).toBe(0);
      expect(aiOf(h).stats.searches).toBeGreaterThan(5);
    }
  });

  describe('performance', { timeout: 90_000 }, () => {
    it('80 colonists in a walled colony with rooms: well under 1 ms per frame (a full day, night and morning)', () => {
      const h = makeGame();
      addCore(h.game);
      // outer wall ring with four gates, 12 walled houses (door facing the core) with two shelters each
      ring(h, 108, 108, 148, 148, [[128, 108], [128, 148], [108, 128], [148, 128]]);
      const houses: [number, number][] = [[112, 112], [120, 112], [134, 112], [140, 112], [112, 140], [120, 140], [134, 140], [140, 140], [112, 124], [140, 124], [112, 132], [140, 132]];
      for (const [x, z] of houses) {
        ring(h, x, z, x + 4, z + 4, [[x < 128 ? x + 4 : x, z + 2]]);
        addBuilding(h.game, 'shelter', x + 1, z + 1);
        addBuilding(h.game, 'shelter', x + 1, z + 3 - 0);
      }
      for (let i = 0; i < 4; i++) addBuilding(h.game, 'logging_camp', 118 + i * 5, 118);
      for (let i = 0; i < 4; i++) addBuilding(h.game, 'quarry', 118 + i * 5, 136);
      for (let i = 0; i < 4; i++) addBuilding(h.game, 'berry_patch', 117 + i * 4, 144);
      for (let i = 0; i < 4; i++) addBuilding(h.game, 'shelter', 124 + i * 3, 121);
      addBuilding(h.game, 'campfire', 133, 123);
      addBuilding(h.game, 'kitchen', 134, 130);
      addBuilding(h.game, 'guard_post', 146, 110);
      const nodes: WorldNode[] = [];
      for (let i = 0; i < 600; i++) nodes.push({ i, def: i % 3 ? 'tree_round' : 'rock', x: ((i * 37) % 76) - 38, z: ((i * 91) % 76) - 38, rot: 0, scale: 1, region: 'crash_valley', hits: 5 });
      fakeNodes(h.game, nodes);
      for (let i = 0; i < 80; i++) addColonist(h.game, 'common');
      h.game.state.player.x = 0;
      h.game.state.player.z = 0;
      const cs = h.game.sys.colonists;
      const ai = aiOf(h);
      const list = h.game.state.colonists.list;
      const bs = h.game.sys.buildings;
      const last = list.map((c) => ({ x: c.x, z: c.z }));
      let jumps = 0;
      let inWall = 0;
      let total = 0;
      let worst = 0;
      let frames = 0;
      const frame = (measure: boolean) => {
        h.clock.now += 16;
        h.game.state.playTime += 1 / 60;
        const t0 = performance.now();
        cs.update(1 / 60);
        const d = performance.now() - t0;
        if (measure) {
          total += d;
          worst = Math.max(worst, d);
          frames++;
        }
        for (let k = 0; k < list.length; k++) {
          const c = list[k];
          if (dist(c.x, c.z, last[k].x, last[k].z) > 1) jumps++;
          last[k] = { x: c.x, z: c.z };
          const cx = cellOf(c.x);
          const cz = cellOf(c.z);
          if (bs.blocked(cx, cz, 'colonist')) {
            const at = bs.at(cx, cz);
            if (!at || (c.bed !== at.id && c.workplace !== at.id && at.id !== h.game.state.colony.coreId)) inWall++;
          }
        }
      };
      // warm up (JIT) through the first morning, then measure day -> night -> morning
      h.game.state.time.dayTime = 0.3;
      for (let i = 0; i < 600; i++) frame(false);
      jumps = inWall = 0;
      const s0 = { ...ai.stats };
      for (const [dayTime, event, seconds] of [[0.3, 'time:sunrise', 25], [0.8, 'time:nightfall', 35], [0.3, 'time:sunrise', 35]] as const) {
        h.game.state.time.dayTime = dayTime;
        h.game.bus.emit(event, {});
        for (let i = 0; i < seconds * 60; i++) frame(true);
      }
      const avg = total / frames;
      // eslint-disable-next-line no-console
      console.log(
        `colonists.update avg ${avg.toFixed(3)} ms, worst ${worst.toFixed(2)} ms over ${frames} frames (80 colonists, walled base with 12 rooms); ` +
          `searches ${ai.stats.searches - s0.searches}, cache hits ${ai.stats.cacheHits - s0.cacheHits}, expanded ${ai.stats.expanded - s0.expanded}, fallbacks ${ai.stats.fallbacks - s0.fallbacks}`,
      );
      expect(avg).toBeLessThan(1);
      expect(ai.stats.searches - s0.searches).toBeGreaterThan(20); // it did path (morning/night rush)
      expect(jumps).toBe(0); // nobody popped through a wall
      expect(inWall).toBe(0);
      expect(ai.pending).toBeLessThan(80);
    });
  });
});
