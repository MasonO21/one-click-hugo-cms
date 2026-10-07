import { describe, expect, it } from 'vitest';
import { cellCenter, cellOf } from '../src/core/constants';
import { MAX_EXPAND, PathFinder, R_BEST, R_BUDGET, R_FOUND, R_NONE, R_RUNNING } from '../src/sim/colony/path';
import { addBuilding, addCore, makeGame, type Harness } from './colonists.util';

/** Deterministic tiny PRNG. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

const wall = (h: Harness, x: number, z: number) => addBuilding(h.game, 'wall', x, z);

/** Run a whole search synchronously. */
function find(pf: PathFinder, sx: number, sz: number, gx: number, gz: number, enter = -1, slice = 100000): number {
  pf.begin(enter, cellOf(sx), cellOf(sz), cellOf(gx), cellOf(gz));
  pf.startSearch(sx, sz, 128, 128, 12);
  let kind = R_RUNNING;
  for (let i = 0; i < 1000 && kind === R_RUNNING; i++) kind = pf.advance(slice);
  return kind;
}

/** Ground truth: Dijkstra on the 8-connected, no-corner-cutting grid (cost 10 / 14). Returns Infinity when unreachable. */
function optimal(open: (x: number, z: number) => boolean, sx: number, sz: number, gx: number, gz: number): number {
  const key = (x: number, z: number) => z * 256 + x;
  const dist = new Map<number, number>([[key(sx, sz), 0]]);
  // binary min-heap of d * 65536 + cellKey
  const heap: number[] = [0 * 65536 + key(sx, sz)];
  const push = (v: number) => {
    let i = heap.push(v) - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p] <= v) break;
      heap[i] = heap[p];
      i = p;
    }
    heap[i] = v;
  };
  const pop = (): number => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= heap.length) break;
        if (c + 1 < heap.length && heap[c + 1] < heap[c]) c++;
        if (heap[c] >= last) break;
        heap[i] = heap[c];
        i = c;
      }
      heap[i] = last;
    }
    return top;
  };
  while (heap.length) {
    const v = pop();
    const d = Math.floor(v / 65536);
    const k = v % 65536;
    const x = k % 256;
    const z = (k - x) / 256;
    if (d > (dist.get(k) ?? Infinity)) continue;
    if (x === gx && z === gz) return d;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = x + dx;
        const nz = z + dz;
        if (!open(nx, nz)) continue;
        if (dx && dz && (!open(x + dx, z) || !open(x, z + dz))) continue;
        const nd = d + (dx && dz ? 14 : 10);
        const nk = key(nx, nz);
        if (nd < (dist.get(nk) ?? Infinity)) {
          dist.set(nk, nd);
          push(nd * 65536 + nk);
        }
      }
    }
  }
  return Infinity;
}

function polylineLength(sx: number, sz: number, wp: Float32Array, gx: number, gz: number): number {
  let len = 0;
  let px = sx;
  let pz = sz;
  for (let i = 0; i < wp.length; i += 2) {
    len += Math.hypot(wp[i] - px, wp[i + 1] - pz);
    px = wp[i];
    pz = wp[i + 1];
  }
  return len + Math.hypot(gx - px, gz - pz);
}

describe('PathFinder (grid A*)', { timeout: 60_000 }, () => {
  it('matches a ground-truth search on random walled grids: found iff reachable, valid, near-optimal', () => {
    let found = 0;
    let unreachable = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const h = makeGame({ seed });
      const rnd = lcg(seed * 977);
      const taken = new Set<string>();
      // a 40x40 box of random wall segments; start/goal sit in opposite corners so the search window covers the box
      for (let i = 0; i < 14; i++) {
        const horiz = rnd() < 0.5;
        const len = 4 + Math.floor(rnd() * 14);
        const x = 100 + Math.floor(rnd() * 36);
        const z = 100 + Math.floor(rnd() * 36);
        for (let k = 0; k < len; k++) {
          const cx = horiz ? x + k : x;
          const cz = horiz ? z : z + k;
          if (cx > 139 || cz > 139 || taken.has(`${cx},${cz}`)) continue;
          if ((cx < 105 && cz < 105) || (cx > 134 && cz > 134)) continue; // keep the corners free
          taken.add(`${cx},${cz}`);
          wall(h, cx, cz);
        }
      }
      const bs = h.game.sys.buildings;
      const open = (x: number, z: number) => x >= 0 && z >= 0 && x < 256 && z < 256 && !bs.blocked(x, z, 'colonist');
      const [sx, sz, gx, gz] = [101, 101, 138, 138];
      if (!open(sx, sz) || !open(gx, gz)) continue;
      const pf = new PathFinder(h.game);
      const kind = find(pf, cellCenter(sx), cellCenter(sz), cellCenter(gx), cellCenter(gz));
      const best = optimal(open, sx, sz, gx, gz);
      if (best === Infinity) {
        unreachable++;
        expect(kind === R_BEST || kind === R_NONE || kind === R_BUDGET).toBe(true);
        continue;
      }
      found++;
      expect(kind).toBe(R_FOUND);
      // every leg of the string-pulled path is walkable with a body-width margin
      pf.begin(-1, sx, sz, gx, gz);
      let px = cellCenter(sx);
      let pz = cellCenter(sz);
      for (let i = 0; i < pf.wp.length; i += 2) {
        expect(pf.lineClear(px, pz, pf.wp[i], pf.wp[i + 1], 0.3)).toBe(true);
        px = pf.wp[i];
        pz = pf.wp[i + 1];
      }
      expect(pf.lineClear(px, pz, cellCenter(gx), cellCenter(gz), 0.3)).toBe(true);
      // weighted A* (x1.2) + string pulling: never worse than 1.2 x the optimal 8-connected cost
      const len = polylineLength(cellCenter(sx), cellCenter(sz), pf.wp, cellCenter(gx), cellCenter(gz));
      expect(len).toBeLessThanOrEqual((best / 10) * 2 * 1.2 + 0.01);
    }
    expect(found).toBeGreaterThan(10);
    expect(found + unreachable).toBeGreaterThan(12);
  });

  it('never cuts a corner: a diagonal gap between two diagonal walls is closed', () => {
    const h = makeGame();
    wall(h, 120, 120);
    wall(h, 121, 121);
    const pf = new PathFinder(h.game);
    // (121,120) -> (120,121) is a diagonal step squeezing between the walls: forbidden, must detour
    const kind = find(pf, cellCenter(121), cellCenter(120), cellCenter(120), cellCenter(121));
    expect(kind).toBe(R_FOUND);
    expect(polylineLength(cellCenter(121), cellCenter(120), pf.wp, cellCenter(120), cellCenter(121))).toBeGreaterThan(2 * Math.SQRT2 + 0.5);
    pf.begin(-1, 121, 120, 120, 121);
    expect(pf.lineClear(cellCenter(121), cellCenter(120), cellCenter(120), cellCenter(121))).toBe(false);
  });

  it('doors and gates are passable, walls are not; the destination and start footprints are passable', () => {
    const h = makeGame();
    for (let z = 110; z <= 130; z++) wall(h, 120, z);
    const pf = new PathFinder(h.game);
    const detour = find(pf, cellCenter(115), cellCenter(120), cellCenter(125), cellCenter(120));
    expect(detour).toBe(R_FOUND);
    const longLen = polylineLength(cellCenter(115), cellCenter(120), pf.wp, cellCenter(125), cellCenter(120));
    expect(longLen).toBeGreaterThan(40); // straight would be 20 world units
    // open a door and a gate in the wall
    h.game.sys.buildings.remove(h.game.sys.buildings.objectAt(120, 120)!.id);
    const door = addBuilding(h.game, 'door', 120, 120);
    expect(h.game.sys.buildings.blocked(120, 120, 'colonist')).toBe(false);
    expect(find(pf, cellCenter(115), cellCenter(120), cellCenter(125), cellCenter(120))).toBe(R_FOUND);
    expect(polylineLength(cellCenter(115), cellCenter(120), pf.wp, cellCenter(125), cellCenter(120))).toBeLessThan(22);
    h.game.sys.buildings.remove(door.id);
    addBuilding(h.game, 'gate', 120, 120);
    expect(find(pf, cellCenter(115), cellCenter(120), cellCenter(125), cellCenter(120))).toBe(R_FOUND);
    expect(polylineLength(cellCenter(115), cellCenter(120), pf.wp, cellCenter(125), cellCenter(120))).toBeLessThan(22);

    // a bed inside a solid building: unreachable unless its footprint is the entered building
    const shelter = addBuilding(h.game, 'shelter', 130, 120);
    const sx = cellCenter(131);
    const sz = cellCenter(121);
    expect(find(pf, cellCenter(125), cellCenter(120), sx, sz, -1)).not.toBe(R_NONE); // goal cell itself is always allowed
    expect(find(pf, cellCenter(125), cellCenter(120), sx, sz, shelter.id)).toBe(R_FOUND);
    // standing inside a solid building: walk out of it
    expect(find(pf, sx, sz, cellCenter(140), cellCenter(120), -1)).toBe(R_FOUND);
  });

  it('unreachable goals give the closest reachable cell (or nothing for an enclosed start)', () => {
    const h = makeGame();
    // sealed 7x7 box
    for (let x = 120; x <= 126; x++) {
      for (let z = 120; z <= 126; z++) if (x === 120 || x === 126 || z === 120 || z === 126) wall(h, x, z);
    }
    const pf = new PathFinder(h.game);
    const kind = find(pf, cellCenter(110), cellCenter(123), cellCenter(123), cellCenter(123));
    expect(kind).toBe(R_BEST);
    // it leads to the wall facing the goal
    const ex = pf.wp[pf.wp.length - 2];
    const ez = pf.wp[pf.wp.length - 1];
    expect(cellOf(ex)).toBe(119);
    expect(Math.abs(cellOf(ez) - 123)).toBeLessThanOrEqual(1);
    // from inside the box the goal outside is unreachable, and an enclosed start in a 1-cell cell has nowhere to go
    wall(h, 123, 122);
    wall(h, 123, 124);
    wall(h, 122, 123);
    wall(h, 124, 123);
    wall(h, 122, 122);
    wall(h, 124, 124);
    wall(h, 122, 124);
    wall(h, 124, 122);
    expect(find(pf, cellCenter(123), cellCenter(123), cellCenter(110), cellCenter(123))).toBe(R_NONE);
  });

  it('is resumable: slicing the search gives the same path as running it in one go, and the budget is bounded', () => {
    const h = makeGame();
    for (let z = 110; z <= 150; z++) wall(h, 128, z);
    const pf = new PathFinder(h.game);
    const full = find(pf, cellCenter(120), cellCenter(130), cellCenter(136), cellCenter(130));
    const fullWp = Array.from(pf.wp);
    const expanded = pf.expanded;
    expect(full).toBe(R_FOUND);
    expect(expanded).toBeGreaterThan(100);

    pf.begin(-1, cellOf(cellCenter(120)), cellOf(cellCenter(130)), cellOf(cellCenter(136)), cellOf(cellCenter(130)));
    pf.startSearch(cellCenter(120), cellCenter(130), 128, 128, 12);
    let kind = R_RUNNING;
    let slices = 0;
    while (kind === R_RUNNING && slices < 10000) {
      kind = pf.advance(37);
      slices++;
      expect(pf.last).toBeLessThanOrEqual(37);
    }
    expect(kind).toBe(R_FOUND);
    expect(slices).toBeGreaterThan(Math.floor(expanded / 37));
    expect(Array.from(pf.wp)).toEqual(fullWp);

    // an unreachable goal in a huge sealed ring stops at the expansion budget at the latest
    const h2 = makeGame();
    for (let x = 60; x <= 200; x++) {
      for (let z = 60; z <= 200; z++) if (x === 60 || x === 200 || z === 60 || z === 200) wall(h2, x, z);
    }
    const pf2 = new PathFinder(h2.game);
    const k2 = find(pf2, cellCenter(128), cellCenter(128), cellCenter(40), cellCenter(40));
    expect([R_BEST, R_BUDGET, R_NONE]).toContain(k2);
    expect(pf2.expanded).toBeLessThanOrEqual(MAX_EXPAND + 1);
  });

  it('respects world walkability (water / locked regions) through world.walkable', () => {
    const h = makeGame();
    addCore(h.game);
    // a lake across x 130..132 for z in 110..140
    h.game.sys.world.walkable = (x: number, z: number) => !(x > cellCenter(130) - 1 && x < cellCenter(132) + 1 && z > cellCenter(110) && z < cellCenter(140));
    const pf = new PathFinder(h.game);
    const kind = find(pf, cellCenter(120), cellCenter(125), cellCenter(142), cellCenter(125));
    expect(kind).toBe(R_FOUND);
    expect(polylineLength(cellCenter(120), cellCenter(125), pf.wp, cellCenter(142), cellCenter(125))).toBeGreaterThan(60); // 44 straight
    // and the straight line over the water is not "clear"
    pf.begin(-1, 120, 125, 142, 125);
    expect(pf.lineClear(cellCenter(120), cellCenter(125), cellCenter(142), cellCenter(125))).toBe(false);
  });
});
