/**
 * Deterministic world generation (pure function of the data registry + seed; no game state, no DOM).
 *
 * Pipeline: regions (noise-warped additively-weighted Voronoi, Crash Valley guaranteed) -> water
 * (lakes / marsh pools) -> terrain heights (gentle, biome relief, flat colony valley) -> POIs ->
 * resource nodes (+ Crash Valley tutorial guarantee) -> decorative props.
 *
 * Determinism: every random decision comes from seeded `Rng` streams / the integer-hash noise in
 * `./noise`; iteration orders are fixed. Cost is a few tens of ms on desktop (typed arrays only).
 */
import { ANCHOR_IDS, type NodeDef, type PoiDef } from '../../data/schema';
import type { DataRegistry } from '../../data';
import { CELL, HALF_WORLD, WORLD_CELLS } from '../../core/constants';
import { Rng } from '../../core/rng';
import { fbm2, ridged2, seedMix, vnoise } from './noise';
import type { WorldGen, WorldNode, WorldPoi, WorldProp } from '../world';

declare module '../../data/schema' {
  interface BiomeDef {
    /** Optional water budget override: number of lakes / marsh pools (otherwise derived from the biome mood). */
    water?: { lakes?: number; pools?: number };
  }
}

const N = WORLD_CELLS;
const V = N + 1;
const HALF_CELLS = N / 2;

/** Water surface height (world units). Lake beds are carved below this; land never dips under 0. */
export const WATER_LEVEL = -0.2;
/** Crash Valley is guaranteed to cover at least this many cells around the origin (spec: >= 56). */
export const VALLEY_RADIUS_CELLS = 57;
/** Terrain is dead flat inside this radius (cells) so the colony sits on level ground. */
export const FLAT_RADIUS_CELLS = 50;
/** Colony decor radius (cells): props are skipped inside except a few flowers. */
export const COLONY_DISC_CELLS = 50;
/** No nodes/props inside this radius (cells) of the origin: the 3x3 pod and the player spawn live there. */
export const CLEAR_RADIUS_CELLS = 5;
/** Tutorial resources are guaranteed in this annulus (cells). */
export const TUTORIAL_MIN_CELLS = 5;
export const TUTORIAL_MAX_CELLS = 14;
/** Minimum distance (world units) between any two POIs. */
const POI_MIN_SEP = 26;

/** Region-border warp amplitudes (cells): broad and fine. Kept modest so every region keeps its territory. */
const WARP_A = 60;
const WARP_B = 20;
const START_RADIUS_BONUS = 13;
const START_SOFT_BONUS = 16;
/** Every region owns at least a disc of this radius (cells) around its centre. */
const CORE_RADIUS_CELLS = 12;

const RES_BIT_WATER = 1;
const RES_BIT_MARGIN = 2;
const RES_BIT_POD = 4;
const RES_BIT_POI = 8;

const sstep = (a: number, b: number, v: number): number => {
  const t = v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a);
  return t * t * (3 - 2 * t);
};

interface RegionBuild {
  regionMap: Uint8Array;
  startIdx: number;
  /** Region centres in cells relative to the origin. */
  centers: { x: number; z: number }[];
  /** Cell indices per region (for random picking). */
  cells: Int32Array[];
}

// ------------------------------------------------------------------------------------------------
// Regions
// ------------------------------------------------------------------------------------------------

function buildRegions(data: DataRegistry, seed: number): RegionBuild {
  const biomes = data.biomes;
  const n = biomes.length;
  let startIdx = biomes.findIndex((b) => b.id === ANCHOR_IDS.startRegion);
  if (startIdx < 0) startIdx = 0;
  const s1 = seedMix(seed, 0x1001);
  const s2 = seedMix(seed, 0x1002);
  const s3 = seedMix(seed, 0x1003);
  const s4 = seedMix(seed, 0x1004);

  // centres (cells relative to origin) and additive "radii"
  const cxs = new Float64Array(n);
  const czs = new Float64Array(n);
  const rad = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const b = biomes[i];
    if (i !== startIdx) {
      const a = (b.center.angle * Math.PI) / 180;
      let x = Math.cos(a) * b.center.dist * HALF_CELLS;
      let z = Math.sin(a) * b.center.dist * HALF_CELLS;
      const len = Math.sqrt(x * x + z * z);
      // keep other regions' centres outside the valley so they never vanish under the guaranteed disc
      const minLen = VALLEY_RADIUS_CELLS + 14;
      if (len < minLen) {
        const k = len < 1e-6 ? 0 : minLen / len;
        x = len < 1e-6 ? minLen : x * k;
        z = len < 1e-6 ? 0 : z * k;
      }
      const lim = HALF_CELLS - 22;
      cxs[i] = Math.max(-lim, Math.min(lim, x));
      czs[i] = Math.max(-lim, Math.min(lim, z));
    }
    rad[i] = 30 + (b.size - 1) * 45 + (i === startIdx ? START_RADIUS_BONUS : 0);
  }

  const warpX = (ux: number, uz: number) =>
    (fbm2(ux * 0.021, uz * 0.021, s1, 2) - 0.5) * WARP_A + (vnoise(ux * 0.065, uz * 0.065, s3) - 0.5) * WARP_B;
  const warpZ = (ux: number, uz: number) =>
    (fbm2(ux * 0.021 + 37.1, uz * 0.021 - 11.7, s2, 2) - 0.5) * WARP_A + (vnoise(ux * 0.065 - 5.3, uz * 0.065 + 9.1, s4) - 0.5) * WARP_B;
  const cwx = new Float64Array(n);
  const cwz = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    cwx[i] = warpX(cxs[i], czs[i]);
    cwz[i] = warpZ(cxs[i], czs[i]);
  }
  // the warp is smooth (>= 15-cell wavelength), so sample it on a 4-cell lattice and interpolate
  const WS = 4;
  const WL = N / WS + 2;
  const wxl = new Float32Array(WL * WL);
  const wzl = new Float32Array(WL * WL);
  for (let j = 0; j < WL; j++) {
    for (let i = 0; i < WL; i++) {
      const ux = i * WS - HALF_CELLS;
      const uz = j * WS - HALF_CELLS;
      wxl[j * WL + i] = warpX(ux, uz);
      wzl[j * WL + i] = warpZ(ux, uz);
    }
  }

  const regionMap = new Uint8Array(N * N);
  const counts = new Int32Array(n);
  const startR2 = VALLEY_RADIUS_CELLS * VALLEY_RADIUS_CELLS;

  /** Exact region of a cell (warped additively-weighted Voronoi + guaranteed valley disc). */
  const regionOfCell = (cx: number, cz: number): number => {
    const ux = cx + 0.5 - HALF_CELLS;
    const uz = cz + 0.5 - HALF_CELLS;
    const d0sq = ux * ux + uz * uz;
    if (d0sq < startR2) return startIdx;
    for (let i = 0; i < n; i++) {
      if (i === startIdx) continue;
      const dx = ux - cxs[i];
      const dz = uz - czs[i];
      if (dx * dx + dz * dz < CORE_RADIUS_CELLS * CORE_RADIUS_CELLS) return i;
    }
    const gx = (cx + 0.5) / WS;
    const gz = (cz + 0.5) / WS;
    const li = Math.floor(gx);
    const lj = Math.floor(gz);
    const fx = gx - li;
    const fz = gz - lj;
    const k0 = lj * WL + li;
    const wx = wxl[k0] * (1 - fx) * (1 - fz) + wxl[k0 + 1] * fx * (1 - fz) + wxl[k0 + WL] * (1 - fx) * fz + wxl[k0 + WL + 1] * fx * fz;
    const wz = wzl[k0] * (1 - fx) * (1 - fz) + wzl[k0 + 1] * fx * (1 - fz) + wzl[k0 + WL] * (1 - fx) * fz + wzl[k0 + WL + 1] * fx * fz;
    // soft pull toward the start region around the guaranteed disc so the border never traces a perfect circle
    const bonus = START_SOFT_BONUS * (1 - sstep(VALLEY_RADIUS_CELLS, 92, Math.sqrt(d0sq)));
    let best = startIdx;
    let bestScore = Infinity;
    for (let i = 0; i < n; i++) {
      const dx = ux - cxs[i] + (wx - cwx[i]);
      const dz = uz - czs[i] + (wz - cwz[i]);
      const sc = Math.sqrt(dx * dx + dz * dz) - rad[i] - (i === startIdx ? bonus : 0);
      if (sc < bestScore) {
        bestScore = sc;
        best = i;
      }
    }
    return best;
  };

  // evaluate exactly on a 4-cell lattice; blocks whose four corners agree are filled without further work,
  // border blocks are resolved cell by cell (the region field is smooth, so features are >> 4 cells)
  const BL = N / 4 + 1;
  const lattice = new Uint8Array(BL * BL);
  for (let j = 0; j < BL; j++) {
    for (let i = 0; i < BL; i++) lattice[j * BL + i] = regionOfCell(Math.min(N - 1, i * 4), Math.min(N - 1, j * 4));
  }
  for (let bz = 0; bz < N / 4; bz++) {
    for (let bx = 0; bx < N / 4; bx++) {
      const r00 = lattice[bz * BL + bx];
      const o = bz * 4 * N + bx * 4;
      if (r00 === lattice[bz * BL + bx + 1] && r00 === lattice[(bz + 1) * BL + bx] && r00 === lattice[(bz + 1) * BL + bx + 1]) {
        for (let dz = 0; dz < 4; dz++) {
          const row = o + dz * N;
          regionMap[row] = regionMap[row + 1] = regionMap[row + 2] = regionMap[row + 3] = r00;
        }
        counts[r00] += 16;
      } else {
        for (let dz = 0; dz < 4; dz++) {
          for (let dx = 0; dx < 4; dx++) {
            const r = dx === 0 && dz === 0 ? r00 : regionOfCell(bx * 4 + dx, bz * 4 + dz);
            regionMap[o + dz * N + dx] = r;
            counts[r]++;
          }
        }
      }
    }
  }
  const cells: Int32Array[] = [];
  for (let i = 0; i < n; i++) cells.push(new Int32Array(counts[i]));
  const fill = new Int32Array(n);
  for (let k = 0; k < N * N; k++) {
    const r = regionMap[k];
    cells[r][fill[r]++] = k;
  }
  const centers = [];
  for (let i = 0; i < n; i++) centers.push({ x: cxs[i], z: czs[i] });
  return { regionMap, startIdx, centers, cells };
}

/** Cell index of the region cell nearest to a point (cells relative to origin). */
function nearestRegionCell(cells: Int32Array, ux: number, uz: number): number {
  let best = cells.length ? cells[0] : 0;
  let bd = Infinity;
  for (let k = 0; k < cells.length; k++) {
    const c = cells[k];
    const x = (c % N) + 0.5 - HALF_CELLS - ux;
    const z = ((c / N) | 0) + 0.5 - HALF_CELLS - uz;
    const d = x * x + z * z;
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

/** The cell at a region's nominal centre when it belongs to the region (almost always), else the nearest region cell. */
function hubCell(reg: RegionBuild, ri: number): number {
  const c = reg.centers[ri];
  const cx = Math.min(N - 1, Math.max(0, Math.round(c.x + HALF_CELLS - 0.5)));
  const cz = Math.min(N - 1, Math.max(0, Math.round(c.z + HALF_CELLS - 0.5)));
  if (reg.regionMap[cz * N + cx] === ri) return cz * N + cx;
  return nearestRegionCell(reg.cells[ri], c.x, c.z);
}

/** True when the cell and the 8 samples at distance `m` cells all belong to region `r`. */
function interior(regionMap: Uint8Array, cx: number, cz: number, m: number, r: number): boolean {
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx * m;
      const z = cz + dz * m;
      if (x < 2 || z < 2 || x >= N - 2 || z >= N - 2) return false;
      if (regionMap[z * N + x] !== r) return false;
    }
  }
  return true;
}

// ------------------------------------------------------------------------------------------------
// Water
// ------------------------------------------------------------------------------------------------

interface Lake {
  x: number;
  z: number;
  r: number;
}

function buildWater(data: DataRegistry, seed: number, reg: RegionBuild): Uint8Array {
  const water = new Uint8Array(N * N);
  const rng = new Rng(seedMix(seed, 0x2001));
  const noiseSeed = seedMix(seed, 0x2002);
  const lakes: Lake[] = [];
  const biomes = data.biomes;

  const tryPlace = (ri: number, radius: number, sep: number): boolean => {
    const list = reg.cells[ri];
    if (!list.length) return false;
    for (let attempt = 0; attempt < 70; attempt++) {
      const c = list[(rng.next() * list.length) | 0];
      const cx = c % N;
      const cz = (c / N) | 0;
      const ux = cx + 0.5 - HALF_CELLS;
      const uz = cz + 0.5 - HALF_CELLS;
      if (Math.sqrt(ux * ux + uz * uz) < VALLEY_RADIUS_CELLS + 4 + radius * 1.4) continue;
      if (!interior(reg.regionMap, cx, cz, Math.ceil(radius * 1.5) + 4, ri)) continue;
      let ok = true;
      for (const l of lakes) {
        const dx = l.x - ux;
        const dz = l.z - uz;
        const min = l.r + radius + sep;
        if (dx * dx + dz * dz < min * min) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      lakes.push({ x: ux, z: uz, r: radius });
      // irregular blob: noise-modulated radius, slight axis stretch
      const stretch = 0.75 + rng.next() * 0.5;
      const ax = radius * stretch;
      const az = radius / stretch;
      const reach = Math.ceil(radius * 1.6) + 1;
      for (let z = cz - reach; z <= cz + reach; z++) {
        for (let x = cx - reach; x <= cx + reach; x++) {
          if (x < 1 || z < 1 || x >= N - 1 || z >= N - 1) continue;
          const dx = (x - cx) / ax;
          const dz = (z - cz) / az;
          const wob = 0.74 + 0.5 * vnoise((x + 0.5) * 0.3, (z + 0.5) * 0.3, noiseSeed);
          if (dx * dx + dz * dz < wob * wob) water[z * N + x] = 1;
        }
      }
      return true;
    }
    return false;
  };

  for (let ri = 0; ri < biomes.length; ri++) {
    const b = biomes[ri];
    const area = reg.cells[ri].length;
    const eerie = b.mood === 'eerie';
    let lakesN = b.water?.lakes ?? (eerie ? 1 : area > 11000 ? 2 : 1);
    let poolsN = b.water?.pools ?? (eerie ? 8 : 0);
    if (b.water === undefined && ri === reg.startIdx) {
      lakesN = 2;
      poolsN = 2;
    }
    for (let k = 0; k < lakesN; k++) tryPlace(ri, 3.5 + rng.next() * 3.5, 16);
    for (let k = 0; k < poolsN; k++) tryPlace(ri, 1.6 + rng.next() * 1.6, 7);
  }
  return water;
}

// ------------------------------------------------------------------------------------------------
// Terrain
// ------------------------------------------------------------------------------------------------

const RL = 64; // relief lattice resolution (4x4 cells per sample)

/** Relief on a coarse 64x64 lattice (sampled at each block's centre, box-blurred twice so hills never step at borders). */
function buildReliefMap(data: DataRegistry, regionMap: Uint8Array): Float32Array {
  const perRegion = data.biomes.map((b) => b.relief);
  const step = N / RL;
  let a = new Float32Array(RL * RL);
  let b = new Float32Array(RL * RL);
  for (let j = 0; j < RL; j++) {
    for (let i = 0; i < RL; i++) a[j * RL + i] = perRegion[regionMap[(j * step + step / 2) * N + i * step + step / 2]];
  }
  const R = 2;
  const inv = 1 / (2 * R + 1);
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < RL; j++) {
      for (let i = 0; i < RL; i++) {
        let sum = 0;
        for (let k = -R; k <= R; k++) sum += a[j * RL + Math.min(RL - 1, Math.max(0, i + k))];
        b[j * RL + i] = sum * inv;
      }
    }
    for (let j = 0; j < RL; j++) {
      for (let i = 0; i < RL; i++) {
        let sum = 0;
        for (let k = -R; k <= R; k++) sum += b[Math.min(RL - 1, Math.max(0, j + k)) * RL + i];
        a[j * RL + i] = sum * inv;
      }
    }
  }
  return a;
}

/** Bilinear sample of the relief lattice at a world position. */
function reliefAt(relief: Float32Array, wx: number, wz: number): number {
  const gx = Math.min(RL - 1.001, Math.max(0, (wx + HALF_WORLD) / (CELL * (N / RL)) - 0.5));
  const gz = Math.min(RL - 1.001, Math.max(0, (wz + HALF_WORLD) / (CELL * (N / RL)) - 0.5));
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = gx - ix;
  const fz = gz - iz;
  const i = iz * RL + ix;
  const top = relief[i] + (relief[i + 1] - relief[i]) * fx;
  const bot = relief[i + RL] + (relief[i + RL + 1] - relief[i + RL]) * fx;
  return top + (bot - top) * fz;
}

function buildHeights(seed: number, relief: Float32Array, water: Uint8Array): Float32Array {
  const heights = new Float32Array(V * V);
  const sA = seedMix(seed, 0x3001);
  const sB = seedMix(seed, 0x3002);
  const sC = seedMix(seed, 0x3003);

  // The terrain is smooth, so evaluate the full height model on a 2-vertex lattice (4 world units) and
  // interpolate the vertices in between: 4x less noise and a naturally soft, low-poly-friendly surface.
  const HL = N / 2 + 1;
  const lat = new Float32Array(HL * HL);
  for (let j = 0; j < HL; j++) {
    const wz = j * 2 * CELL - HALF_WORLD;
    for (let i = 0; i < HL; i++) {
      const wx = i * 2 * CELL - HALF_WORLD;
      const dCells = Math.sqrt(wx * wx + wz * wz) / CELL;
      const flat = sstep(FLAT_RADIUS_CELLS, FLAT_RADIUS_CELLS + 40, dCells);
      if (flat <= 0) continue;
      const rel = reliefAt(relief, wx, wz);
      if (rel <= 0) continue;
      // rolling hills: broad base + detail, remapped so low ground stays low and crests are soft
      let shape = sstep(0.28, 0.72, fbm2(wx / 85, wz / 85, sA, 4));
      // dramatic regions (high relief) get ridged crests, terraced canyon walls and a little extra height
      const dramatic = sstep(3, 9, rel);
      let boost = 1;
      if (dramatic > 0) {
        const ridge = ridged2(wx / 64, wz / 64, sB, 3);
        const canyon = fbm2(wx / 52, wz / 52, sC, 2);
        const terr = Math.floor(canyon * 4) / 4 + sstep(0, 1, (canyon * 4) % 1) * 0.25;
        shape = shape * (1 - dramatic * 0.55) + (ridge * 0.6 + terr * 0.4) * dramatic * 0.55;
        boost = 1 + 0.35 * dramatic;
      }
      lat[j * HL + i] = rel * shape * flat * boost;
    }
  }
  // gentle banks: cap the lattice terrain by a linear ramp (grade ~0.18) away from the shore, via a chamfer
  // distance field over the lattice (lattice points touching a water cell are distance 0)
  const dist = new Float32Array(HL * HL).fill(1e9);
  for (let cz = 0; cz < N; cz++) {
    for (let cx = 0; cx < N; cx++) {
      if (!water[cz * N + cx]) continue;
      const i0 = (cx + 1) >> 1;
      const j0 = (cz + 1) >> 1;
      // cell (cx,cz) touches vertices cx..cx+1 -> lattice points floor/ceil of half that
      dist[(cz >> 1) * HL + (cx >> 1)] = 0;
      dist[(cz >> 1) * HL + i0] = 0;
      dist[j0 * HL + (cx >> 1)] = 0;
      dist[j0 * HL + i0] = 0;
    }
  }
  for (let j = 0; j < HL; j++) {
    for (let i = 0; i < HL; i++) {
      const k = j * HL + i;
      let d = dist[k];
      if (i > 0 && dist[k - 1] + 1 < d) d = dist[k - 1] + 1;
      if (j > 0) {
        if (dist[k - HL] + 1 < d) d = dist[k - HL] + 1;
        if (i > 0 && dist[k - HL - 1] + 1.414 < d) d = dist[k - HL - 1] + 1.414;
        if (i < HL - 1 && dist[k - HL + 1] + 1.414 < d) d = dist[k - HL + 1] + 1.414;
      }
      dist[k] = d;
    }
  }
  for (let j = HL - 1; j >= 0; j--) {
    for (let i = HL - 1; i >= 0; i--) {
      const k = j * HL + i;
      let d = dist[k];
      if (i < HL - 1 && dist[k + 1] + 1 < d) d = dist[k + 1] + 1;
      if (j < HL - 1) {
        if (dist[k + HL] + 1 < d) d = dist[k + HL] + 1;
        if (i < HL - 1 && dist[k + HL + 1] + 1.414 < d) d = dist[k + HL + 1] + 1.414;
        if (i > 0 && dist[k + HL - 1] + 1.414 < d) d = dist[k + HL - 1] + 1.414;
      }
      dist[k] = d;
      if (d < 20) {
        const cap = d * 0.72;
        if (lat[k] > cap) lat[k] = cap;
      }
    }
  }

  for (let vz = 0; vz < V; vz++) {
    const j = vz >> 1;
    const j1 = Math.min(HL - 1, j + 1);
    const oddZ = vz & 1;
    for (let vx = 0; vx < V; vx++) {
      const i = vx >> 1;
      const i1 = Math.min(HL - 1, i + 1);
      const a = lat[j * HL + i];
      let h = a;
      if (vx & 1) h = oddZ ? (a + lat[j * HL + i1] + lat[j1 * HL + i] + lat[j1 * HL + i1]) * 0.25 : (a + lat[j * HL + i1]) * 0.5;
      else if (oddZ) h = (a + lat[j1 * HL + i]) * 0.5;
      heights[vz * V + vx] = h;
    }
  }

  // carve lake beds: every corner of a water cell sits at the bed height
  const wv = new Uint8Array(V * V); // 1 = water vertex
  for (let cz = 0; cz < N; cz++) {
    for (let cx = 0; cx < N; cx++) {
      if (!water[cz * N + cx]) continue;
      wv[cz * V + cx] = wv[cz * V + cx + 1] = wv[(cz + 1) * V + cx] = wv[(cz + 1) * V + cx + 1] = 1;
    }
  }
  for (let i = 0; i < V * V; i++) if (wv[i]) heights[i] = -0.9;
  return heights;
}

// ------------------------------------------------------------------------------------------------
// POIs
// ------------------------------------------------------------------------------------------------

function buildPois(data: DataRegistry, seed: number, reg: RegionBuild, water: Uint8Array, reserved: Uint8Array): WorldPoi[] {
  const rng = new Rng(seedMix(seed, 0x4001));
  const biomes = data.biomes;
  const pois: WorldPoi[] = [];
  const beaconDef: PoiDef | undefined = data.pois.find((p) => p.kind === 'beacon');

  const wetNear = (cx: number, cz: number, r: number): boolean => {
    for (let z = cz - r; z <= cz + r; z++)
      for (let x = cx - r; x <= cx + r; x++) if (x >= 0 && z >= 0 && x < N && z < N && water[z * N + x]) return true;
    return false;
  };

  /** Rings (cells from origin) tried in order for the start region so early POIs are reachable. */
  const startRings = (kind: PoiDef['kind']): [number, number][] =>
    kind === 'beacon'
      ? [[VALLEY_RADIUS_CELLS - 7, VALLEY_RADIUS_CELLS + 5], [40, 80], [20, 200]]
      : [[22, 46], [18, 56], [14, 200]];

  const place = (ri: number, def: PoiDef) => {
    const list = reg.cells[ri];
    if (!list.length) return;
    const isStart = ri === reg.startIdx;
    const beacon = def.kind === 'beacon';
    // POIs cluster around the heart of their region so exploring never means a marathon; beacons sit closest
    const hub = !isStart ? hubCell(reg, ri) : -1;
    const hubX = hub >= 0 ? (hub % N) + 0.5 - HALF_CELLS : 0;
    const hubZ = hub >= 0 ? ((hub / N) | 0) + 0.5 - HALF_CELLS : 0;
    const rings: [number, number][] = isStart ? startRings(def.kind) : [[0, 1e9], [0, 1e9], [0, 1e9]];
    for (let ringIdx = 0; ringIdx < rings.length; ringIdx++) {
      const [rmin, rmax] = rings[ringIdx];
      // progressively relax border margin / hub radius if a region is cramped
      const margin = [6, 3, 1][Math.min(ringIdx, 2)];
      const hubR = (beacon ? [12, 22, 1e9] : [42, 70, 1e9])[Math.min(ringIdx, 2)];
      let best = -1;
      let bestScore = -Infinity;
      for (let k = 0; k < 80; k++) {
        const c = list[(rng.next() * list.length) | 0];
        const cx = c % N;
        const cz = (c / N) | 0;
        const ux = cx + 0.5 - HALF_CELLS;
        const uz = cz + 0.5 - HALF_CELLS;
        const d0 = Math.sqrt(ux * ux + uz * uz);
        if (d0 < rmin || d0 > rmax) continue;
        if (hub >= 0) {
          const hx = ux - hubX;
          const hz = uz - hubZ;
          if (hx * hx + hz * hz > hubR * hubR) continue;
        }
        if (!interior(reg.regionMap, cx, cz, margin, ri) || wetNear(cx, cz, 3)) continue;
        // best-candidate: maximise distance to the closest existing POI (spreads them out)
        let minD = Infinity;
        const wx = ux * CELL;
        const wz = uz * CELL;
        for (const p of pois) {
          const dx = p.x - wx;
          const dz = p.z - wz;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d < minD) minD = d;
        }
        if (minD < POI_MIN_SEP) continue;
        const score = Math.min(minD, 220) + rng.next() * 6;
        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }
      if (best >= 0) {
        const cx = best % N;
        const cz = (best / N) | 0;
        const x = (cx + 0.5 - HALF_CELLS) * CELL + (rng.next() - 0.5) * 1.2;
        const z = (cz + 0.5 - HALF_CELLS) * CELL + (rng.next() - 0.5) * 1.2;
        pois.push({ id: `poi_${pois.length}`, def: def.id, x, z, region: biomes[ri].id, rot: rng.next() * Math.PI * 2 });
        // reserve the surroundings so nodes/props leave the POI clear
        for (let zz = cz - 2; zz <= cz + 2; zz++)
          for (let xx = cx - 2; xx <= cx + 2; xx++) if (xx >= 0 && zz >= 0 && xx < N && zz < N) reserved[zz * N + xx] |= RES_BIT_POI;
        return;
      }
    }
  };

  for (let ri = 0; ri < biomes.length; ri++) {
    const b = biomes[ri];
    let hasBeacon = false;
    // beacons first so they claim the region hub before other POIs scatter around
    const entries = [...b.pois].sort((a, c) => Number(data.poi(c.poi)?.kind === 'beacon') - Number(data.poi(a.poi)?.kind === 'beacon'));
    for (const e of entries) {
      const def = data.poi(e.poi);
      if (!def) continue;
      if (def.kind === 'beacon') hasBeacon = true;
      for (let k = 0; k < e.count; k++) place(ri, def);
    }
    if (!hasBeacon && beaconDef) place(ri, beaconDef);
  }
  return pois;
}

// ------------------------------------------------------------------------------------------------
// Nodes
// ------------------------------------------------------------------------------------------------

function buildNodes(data: DataRegistry, seed: number, reg: RegionBuild, reserved: Uint8Array): WorldNode[] {
  const rng = new Rng(seedMix(seed, 0x5001));
  const biomes = data.biomes;
  const nodes: WorldNode[] = [];
  const solid: boolean[] = [];

  // occupancy hash (CELL-sized buckets, linked lists)
  const head = new Int32Array(N * N).fill(-1);
  const next: number[] = [];

  const spacingOk = (x: number, z: number, isSolid: boolean): boolean => {
    const cx = Math.floor((x + HALF_WORLD) / CELL);
    const cz = Math.floor((z + HALF_WORLD) / CELL);
    for (let zz = Math.max(0, cz - 1); zz <= Math.min(N - 1, cz + 1); zz++) {
      for (let xx = Math.max(0, cx - 1); xx <= Math.min(N - 1, cx + 1); xx++) {
        for (let i = head[zz * N + xx]; i >= 0; i = next[i]) {
          const n = nodes[i];
          const sep = isSolid && solid[i] ? 2.3 : isSolid || solid[i] ? 1.7 : 1.1;
          const dx = n.x - x;
          const dz = n.z - z;
          if (dx * dx + dz * dz < sep * sep) return false;
        }
      }
    }
    return true;
  };

  const add = (def: NodeDef, region: string, x: number, z: number): void => {
    const idx = nodes.length;
    nodes.push({ i: idx, def: def.id, x, z, rot: rng.next() * Math.PI * 2, scale: def.scale * (0.85 + rng.next() * 0.35), region, hits: def.hits });
    solid.push(def.solid);
    const c = Math.floor((z + HALF_WORLD) / CELL) * N + Math.floor((x + HALF_WORLD) / CELL);
    next.push(head[c]);
    head[c] = idx;
  };

  const blocked = (x: number, z: number, mask: number): boolean => {
    const cx = Math.floor((x + HALF_WORLD) / CELL);
    const cz = Math.floor((z + HALF_WORLD) / CELL);
    if (cx < 1 || cz < 1 || cx >= N - 1 || cz >= N - 1) return true;
    return (reserved[cz * N + cx] & mask) !== 0;
  };

  // ---- Crash Valley tutorial guarantee: ~10 trees, 5 boulders, 4 berry bushes, fiber grass, 5-14 cells out
  const startBiome = biomes[reg.startIdx];
  const startNodes = startBiome.nodes.map((e) => data.node(e.node)).filter((d): d is NodeDef => !!d);
  const pickFor = (resource: string): NodeDef | undefined => {
    const score = (d: NodeDef) => {
      const v = d.drop[resource] ?? 0;
      const total = Object.values(d.drop).reduce<number>((s, a) => s + (a ?? 0), 0);
      return d.toolTier === 0 && v > 0 ? v / Math.max(1, total) + v * 0.01 : -1;
    };
    const rank = (list: NodeDef[]) => list.filter((d) => score(d) > 0).sort((a, b) => score(b) - score(a))[0];
    return rank(startNodes) ?? rank(data.nodes);
  };
  const tutorial: [string, number][] = [
    [ANCHOR_IDS.wood, 10],
    [ANCHOR_IDS.stone, 5],
    [ANCHOR_IDS.food, 4],
    [ANCHOR_IDS.fiber, 6],
  ];
  const tutorialPts: { x: number; z: number }[] = [];
  const rMin = TUTORIAL_MIN_CELLS * CELL + 0.6;
  const rMax = TUTORIAL_MAX_CELLS * CELL - 0.6;
  for (const [res, count] of tutorial) {
    const def = pickFor(res);
    if (!def) continue;
    for (let k = 0; k < count; k++) {
      let best: { x: number; z: number } | null = null;
      let bestD = -1;
      for (let attempt = 0; attempt < 30; attempt++) {
        // uniform direction without trig (cross-engine determinism)
        let a = 0;
        let b = 0;
        let l2 = 0;
        do {
          a = rng.next() * 2 - 1;
          b = rng.next() * 2 - 1;
          l2 = a * a + b * b;
        } while (l2 > 1 || l2 < 0.01);
        const inv = 1 / Math.sqrt(l2);
        const r = rMin + Math.sqrt(rng.next()) * (rMax - rMin);
        const x = a * inv * r;
        const z = b * inv * r;
        if (blocked(x, z, RES_BIT_WATER | RES_BIT_MARGIN | RES_BIT_POI)) continue;
        if (!spacingOk(x, z, def.solid)) continue;
        let minD = Infinity;
        for (const p of tutorialPts) {
          const dx = p.x - x;
          const dz = p.z - z;
          const d = dx * dx + dz * dz;
          if (d < minD) minD = d;
        }
        if (minD > bestD) {
          bestD = minD;
          best = { x, z };
        }
      }
      if (best) {
        add(def, startBiome.id, best.x, best.z);
        tutorialPts.push(best);
      }
    }
  }

  // ---- regular density-driven placement (2x2-cell blocks: one Bernoulli per block per node type)
  const BS = 2;
  const NB = N / BS;
  const nEntries = biomes.map((b, ri) =>
    b.nodes
      .map((e, k) => ({ def: data.node(e.node), p: e.density * BS * BS, seed: seedMix(seed, 0x6000 + ri * 16 + k) }))
      .filter((e): e is { def: NodeDef; p: number; seed: number } => !!e.def && e.p > 0),
  );
  const noReserve = RES_BIT_WATER | RES_BIT_MARGIN | RES_BIT_POD | RES_BIT_POI;
  for (let bz = 0; bz < NB; bz++) {
    for (let bx = 0; bx < NB; bx++) {
      const c0 = bz * BS * N + bx * BS;
      const ri = reg.regionMap[c0];
      const entries = nEntries[ri];
      for (let k = 0; k < entries.length; k++) {
        const e = entries[k];
        const roll = rng.next();
        if (roll >= e.p * 1.85) continue;
        // clumped groves / ore fields: low-frequency modulation, mean ~1
        const m = 0.15 + 1.7 * sstep(0.35, 0.65, fbm2((bx * BS + 1 - HALF_CELLS) * 0.035, (bz * BS + 1 - HALF_CELLS) * 0.035, e.seed, 2));
        if (roll >= e.p * m) continue;
        const cx = bx * BS + ((rng.next() * BS) | 0);
        const cz = bz * BS + ((rng.next() * BS) | 0);
        const c = cz * N + cx;
        if (reg.regionMap[c] !== ri || (reserved[c] & noReserve) !== 0) continue;
        const x = (cx + 0.12 + rng.next() * 0.76 - HALF_CELLS) * CELL;
        const z = (cz + 0.12 + rng.next() * 0.76 - HALF_CELLS) * CELL;
        if (!spacingOk(x, z, e.def.solid)) continue;
        add(e.def, biomes[ri].id, x, z);
      }
    }
  }
  return nodes;
}

// ------------------------------------------------------------------------------------------------
// Props
// ------------------------------------------------------------------------------------------------

function buildProps(data: DataRegistry, seed: number, reg: RegionBuild, reserved: Uint8Array, nodes: WorldNode[]): WorldProp[] {
  const rng = new Rng(seedMix(seed, 0x7001));
  const biomes = data.biomes;
  const props: WorldProp[] = [];
  const colonyR2 = COLONY_DISC_CELLS * COLONY_DISC_CELLS;
  const flowers = biomes.map((b) => b.props.filter((m) => m.includes('flower')));
  const hard = RES_BIT_WATER | RES_BIT_POD | RES_BIT_POI;

  // baseline sprinkle: one Bernoulli per 2x2-cell block
  const BS = 2;
  const NB = N / BS;
  for (let bz = 0; bz < NB; bz++) {
    for (let bx = 0; bx < NB; bx++) {
      const c0 = bz * BS * N + bx * BS;
      const ri = reg.regionMap[c0];
      const models = biomes[ri].props;
      if (!models.length) continue;
      const roll = rng.next();
      if (roll >= 0.24) continue;
      const cx = bx * BS + ((rng.next() * BS) | 0);
      const cz = bz * BS + ((rng.next() * BS) | 0);
      const c = cz * N + cx;
      if (reg.regionMap[c] !== ri || (reserved[c] & hard) !== 0) continue;
      const x = (cx + 0.05 + rng.next() * 0.9 - HALF_CELLS) * CELL;
      const z = (cz + 0.05 + rng.next() * 0.9 - HALF_CELLS) * CELL;
      let model: string;
      if ((x * x + z * z) / (CELL * CELL) < colonyR2) {
        // colony disc: only a sprinkle of flowers
        if (!flowers[ri].length || roll >= 0.05) continue;
        model = flowers[ri][(rng.next() * flowers[ri].length) | 0];
      } else {
        model = models[(rng.next() * models.length) | 0];
      }
      props.push({
        model,
        x,
        z,
        rot: rng.next() * Math.PI * 2,
        scale: 0.7 + rng.next() * 0.6,
      });
    }
  }

  // denser near nodes (undergrowth around trees and rocks), outside the colony disc
  for (const n of nodes) {
    const cx = Math.floor((n.x + HALF_WORLD) / CELL);
    const cz = Math.floor((n.z + HALF_WORLD) / CELL);
    const c = cz * N + cx;
    const ri = reg.regionMap[c];
    const models = biomes[ri].props;
    if (!models.length || rng.next() >= 0.4) continue;
    const ang = rng.next();
    const r = 1.4 + rng.next() * 1.8;
    // cheap ring offset without trig: pick one of 8 compass directions + jitter
    const dir = Math.floor(ang * 8);
    const dx = dir === 0 || dir === 1 || dir === 7 ? 1 : dir === 3 || dir === 4 || dir === 5 ? -1 : 0;
    const dz = dir >= 1 && dir <= 3 ? 1 : dir >= 5 ? -1 : 0;
    const norm = dx !== 0 && dz !== 0 ? 0.7071 : 1;
    const x = n.x + dx * norm * r + (rng.next() - 0.5) * 0.6;
    const z = n.z + dz * norm * r + (rng.next() - 0.5) * 0.6;
    const pcx = Math.floor((x + HALF_WORLD) / CELL);
    const pcz = Math.floor((z + HALF_WORLD) / CELL);
    if (pcx < 1 || pcz < 1 || pcx >= N - 1 || pcz >= N - 1 || reserved[pcz * N + pcx] & hard) continue;
    if ((x * x + z * z) / (CELL * CELL) < colonyR2) continue; // colony disc stays tidy (flowers only, see above)
    props.push({ model: models[(rng.next() * models.length) | 0], x, z, rot: rng.next() * Math.PI * 2, scale: 0.6 + rng.next() * 0.6 });
  }
  return props;
}

// ------------------------------------------------------------------------------------------------
// Entry point
// ------------------------------------------------------------------------------------------------

/** Generate the whole world for a seed. Pure and deterministic. */
export function generateWorld(data: DataRegistry, seed: number, profile?: Record<string, number>): WorldGen {
  let t = performance.now();
  const lap = (name: string) => {
    if (!profile) return;
    const n = performance.now();
    profile[name] = n - t;
    t = n;
  };
  const reg = buildRegions(data, seed);
  lap('regions');
  const water = buildWater(data, seed, reg);
  lap('water');
  const relief = buildReliefMap(data, reg.regionMap);
  lap('relief');
  const heights = buildHeights(seed, relief, water);
  lap('heights');

  // reservation mask shared by POI / node / prop placement
  const reserved = new Uint8Array(N * N);
  const podR = CLEAR_RADIUS_CELLS + 0.5;
  for (let cz = 0; cz < N; cz++) {
    for (let cx = 0; cx < N; cx++) {
      const i = cz * N + cx;
      const ux = cx + 0.5 - HALF_CELLS;
      const uz = cz + 0.5 - HALF_CELLS;
      if (ux * ux + uz * uz < podR * podR) reserved[i] |= RES_BIT_POD;
      if (water[i]) {
        reserved[i] |= RES_BIT_WATER;
        for (let dz = -1; dz <= 1; dz++)
          for (let dx = -1; dx <= 1; dx++) {
            const x = cx + dx;
            const z = cz + dz;
            if (x >= 0 && z >= 0 && x < N && z < N && !water[z * N + x]) reserved[z * N + x] |= RES_BIT_MARGIN;
          }
      }
    }
  }

  lap('reserve');
  const pois = buildPois(data, seed, reg, water, reserved);
  lap('pois');
  const nodes = buildNodes(data, seed, reg, reserved);
  lap('nodes');
  const props = buildProps(data, seed, reg, reserved, nodes);
  lap('props');

  const regionCenters = data.biomes.map((b, i) => {
    const c = hubCell(reg, i);
    return { id: b.id, x: ((c % N) + 0.5 - HALF_CELLS) * CELL, z: (((c / N) | 0) + 0.5 - HALF_CELLS) * CELL };
  });

  return {
    regionMap: reg.regionMap,
    regionIds: data.biomes.map((b) => b.id),
    heights,
    water,
    nodes,
    pois,
    props,
    regionCenters,
    version: 0,
  };
}
