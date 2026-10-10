import { describe, expect, it } from 'vitest';
import { createDataRegistry } from '../src/data';
import { generateWorld, WATER_LEVEL, VALLEY_RADIUS_CELLS, TUTORIAL_MAX_CELLS, TUTORIAL_MIN_CELLS } from '../src/sim/world/generate';
import { CELL, HALF_WORLD, WORLD_CELLS, cellOf } from '../src/core/constants';
import { NodeGrid } from '../src/sim/world/grid';
import { Rng } from '../src/core/rng';

const data = createDataRegistry();
const SEEDS = [1, 7, 99, 1234, 31337];

function distCells(x: number, z: number) {
  return Math.hypot(x, z) / CELL;
}

describe('world generation', () => {
  it('is deterministic from the seed', () => {
    const a = generateWorld(data, 4242);
    const b = generateWorld(data, 4242);
    expect(Buffer.from(a.regionMap).equals(Buffer.from(b.regionMap))).toBe(true);
    expect(Buffer.from(a.heights.buffer).equals(Buffer.from(b.heights.buffer))).toBe(true);
    expect(Buffer.from(a.water).equals(Buffer.from(b.water))).toBe(true);
    expect(JSON.stringify(a.nodes)).toBe(JSON.stringify(b.nodes));
    expect(JSON.stringify(a.pois)).toBe(JSON.stringify(b.pois));
    expect(JSON.stringify(a.props)).toBe(JSON.stringify(b.props));
    const c = generateWorld(data, 4243);
    expect(JSON.stringify(c.nodes)).not.toBe(JSON.stringify(a.nodes));
  });

  it('generates well within the mobile budget', () => {
    const t0 = performance.now();
    generateWorld(data, 555);
    const cold = performance.now() - t0;
    // target is < 300 ms on a phone; desktop runs in ~100 ms cold, so 500 leaves CI headroom
    expect(cold).toBeLessThan(500);
  });

  for (const seed of SEEDS) {
    describe(`seed ${seed}`, () => {
      const gen = generateWorld(data, seed);
      const idOf = (cx: number, cz: number) => gen.regionIds[gen.regionMap[cz * WORLD_CELLS + cx]];

      it('Crash Valley fully contains a 56-cell disc around the origin', () => {
        for (let cz = 0; cz < WORLD_CELLS; cz++) {
          for (let cx = 0; cx < WORLD_CELLS; cx++) {
            const ux = cx + 0.5 - WORLD_CELLS / 2;
            const uz = cz + 0.5 - WORLD_CELLS / 2;
            if (Math.hypot(ux, uz) <= 56) expect(idOf(cx, cz)).toBe('crash_valley');
          }
        }
        expect(VALLEY_RADIUS_CELLS).toBeGreaterThanOrEqual(56);
      });

      it('every region exists with a sensible share of the map and exactly its configured POIs', () => {
        const counts = new Map<string, number>();
        for (const r of gen.regionMap) counts.set(gen.regionIds[r], (counts.get(gen.regionIds[r]) ?? 0) + 1);
        for (const b of data.biomes) {
          expect(counts.get(b.id) ?? 0, b.id).toBeGreaterThan(1500);
          const mine = gen.pois.filter((p) => p.region === b.id);
          expect(mine.filter((p) => data.poi(p.def)!.kind === 'beacon').length, `${b.id} beacon`).toBe(1);
          for (const e of b.pois) expect(mine.filter((p) => p.def === e.poi).length, `${b.id}/${e.poi}`).toBe(e.count);
        }
        // POIs are spread apart
        for (let i = 0; i < gen.pois.length; i++)
          for (let j = i + 1; j < gen.pois.length; j++) expect(Math.hypot(gen.pois[i].x - gen.pois[j].x, gen.pois[i].z - gen.pois[j].z)).toBeGreaterThan(20);
      });

      it('has the Crash Valley tutorial resources close to the pod and keeps the pod area clear', () => {
        const within = (def: string) =>
          gen.nodes.filter((n) => n.def === def && distCells(n.x, n.z) >= TUTORIAL_MIN_CELLS && distCells(n.x, n.z) <= TUTORIAL_MAX_CELLS).length;
        expect(within('tree_round')).toBeGreaterThanOrEqual(10);
        expect(within('rock')).toBeGreaterThanOrEqual(5);
        expect(within('bush_berry')).toBeGreaterThanOrEqual(4);
        expect(within('fiber_grass')).toBeGreaterThanOrEqual(6);
        for (const n of gen.nodes) expect(Math.hypot(n.x, n.z), `node ${n.i} too close to the pod`).toBeGreaterThan(CELL * 5);
        for (const p of gen.props) expect(Math.hypot(p.x, p.z)).toBeGreaterThan(CELL * 5);
      });

      it('has stable node indices, full hits and sensible spacing; nothing in water', () => {
        const spots = new Map<number, number[]>();
        gen.nodes.forEach((n, i) => {
          expect(n.i).toBe(i);
          expect(n.hits).toBe(data.node(n.def)!.hits);
          expect(gen.water[cellOf(n.z) * WORLD_CELLS + cellOf(n.x)]).toBe(0);
          expect(Math.abs(n.x)).toBeLessThan(HALF_WORLD);
          const key = cellOf(n.z) * WORLD_CELLS + cellOf(n.x);
          (spots.get(key) ?? spots.set(key, []).get(key)!).push(i);
        });
        // at most 2 nodes per cell and none overlapping
        for (const list of spots.values()) expect(list.length).toBeLessThanOrEqual(2);
        let tooClose = 0;
        for (const n of gen.nodes) {
          const cx = cellOf(n.x);
          const cz = cellOf(n.z);
          for (let dz = -1; dz <= 1; dz++)
            for (let dx = -1; dx <= 1; dx++)
              for (const j of spots.get((cz + dz) * WORLD_CELLS + cx + dx) ?? []) {
                if (j <= n.i) continue;
                if (Math.hypot(gen.nodes[j].x - n.x, gen.nodes[j].z - n.z) < 1.05) tooClose++;
              }
        }
        expect(tooClose).toBe(0);
        expect(gen.nodes.length).toBeGreaterThan(2000);
      });

      it('has gentle terrain: flat colony, water only outside the valley and clear of POIs', () => {
        const V = WORLD_CELLS + 1;
        let maxStep = 0;
        let maxH = 0;
        for (let vz = 0; vz < V; vz++)
          for (let vx = 0; vx < V; vx++) {
            const wx = vx * CELL - HALF_WORLD;
            const wz = vz * CELL - HALF_WORLD;
            const h = gen.heights[vz * V + vx];
            maxH = Math.max(maxH, h);
            if (distCells(wx, wz) <= 47) expect(h).toBe(0);
            else if (distCells(wx, wz) <= 50) expect(h).toBeLessThan(0.05);
            if (vx + 1 < V) maxStep = Math.max(maxStep, Math.abs(gen.heights[vz * V + vx + 1] - h));
            if (vz + 1 < V) maxStep = Math.max(maxStep, Math.abs(gen.heights[(vz + 1) * V + vx] - h));
          }
        expect(maxStep).toBeLessThan(2.6); // never a cliff between neighbouring vertices
        expect(maxH).toBeGreaterThan(2); // but there are real hills
        expect(maxH).toBeLessThan(14);
        let water = 0;
        for (let cz = 0; cz < WORLD_CELLS; cz++)
          for (let cx = 0; cx < WORLD_CELLS; cx++) {
            if (!gen.water[cz * WORLD_CELLS + cx]) continue;
            water++;
            expect(Math.hypot(cx + 0.5 - 128, cz + 0.5 - 128)).toBeGreaterThan(56);
            // lake bed is below the water surface on all four corners
            for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) expect(gen.heights[(cz + oz) * V + cx + ox]).toBeLessThan(WATER_LEVEL);
          }
        expect(water).toBeGreaterThan(100);
        for (const p of gen.pois) {
          const cx = cellOf(p.x);
          const cz = cellOf(p.z);
          for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) expect(gen.water[(cz + dz) * WORLD_CELLS + cx + dx]).toBe(0);
        }
      });

      it('skips props inside the colony disc except flowers', () => {
        for (const p of gen.props) {
          if (distCells(p.x, p.z) < 50) expect(p.model).toContain('flower');
          expect(gen.water[cellOf(p.z) * WORLD_CELLS + cellOf(p.x)]).toBe(0);
        }
        expect(gen.props.length).toBeGreaterThan(1500);
      });

      it('stands no prop in a lake: every prop foot is above the water surface', () => {
        const V = WORLD_CELLS + 1;
        for (const p of gen.props) {
          const gx = (p.x + HALF_WORLD) / CELL;
          const gz = (p.z + HALF_WORLD) / CELL;
          const ix = Math.floor(gx);
          const iz = Math.floor(gz);
          const tx = gx - ix;
          const tz = gz - iz;
          const i = iz * V + ix;
          const h = (gen.heights[i] * (1 - tx) + gen.heights[i + 1] * tx) * (1 - tz) + (gen.heights[i + V] * (1 - tx) + gen.heights[i + V + 1] * tx) * tz;
          expect(h, `${p.model} at ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`).toBeGreaterThanOrEqual(WATER_LEVEL);
        }
      });
    });
  }
});

describe('NodeGrid', () => {
  it('collect() returns a superset of every node inside the box', () => {
    const rng = new Rng(5);
    const n = 3000;
    const xs = new Float32Array(n);
    const zs = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      xs[i] = rng.range(-HALF_WORLD, HALF_WORLD);
      zs[i] = rng.range(-HALF_WORLD, HALF_WORLD);
    }
    const grid = new NodeGrid();
    grid.build(xs, zs, n);
    const out = new Int32Array(4096);
    for (let t = 0; t < 200; t++) {
      const cx = rng.range(-HALF_WORLD, HALF_WORLD);
      const cz = rng.range(-HALF_WORLD, HALF_WORLD);
      const r = rng.range(1, 20);
      const got = new Set<number>();
      const k = grid.collect(cx - r, cz - r, cx + r, cz + r, out);
      for (let i = 0; i < k; i++) got.add(out[i]);
      for (let i = 0; i < n; i++) if (Math.abs(xs[i] - cx) <= r && Math.abs(zs[i] - cz) <= r) expect(got.has(i)).toBe(true);
      // and it is a *local* query, not a scan of the whole world
      expect(k).toBeLessThan(n / 4);
    }
  });
});
