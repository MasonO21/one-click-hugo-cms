/**
 * Render showcase (dev only, served from /showcase.html). Builds a Game with synthetic content —
 * a procedural world, every building model at every tier, colonists, aliens of every type,
 * projectiles of every kind, roofed rooms — and renders it with a free camera so the renderer can
 * be judged visually without the simulation systems.
 *
 * URL params: scene=colony|tiers|all|battle|night · t=0..1 (time of day) · focus=x,z · yaw · zoom ·
 * q=low|medium|high · animate=1 · fx=1 (fire VFX events) · unlockall=1
 */
import { Game } from '../../core/Game';
import { createDataRegistry, defaultData } from '../../data';
import { Renderer } from '../Renderer';
import { registeredModelKeys } from '../models/spec';
import type { BuildingDef, AlienDef } from '../../data/schema';
import type { BuildingInstance, Colonist, Alien, Projectile } from '../../core/state';
import type { WorldGen, WorldNode, WorldPoi, WorldProp } from '../../sim/world';
import { CELL, WORLD_CELLS, HALF_WORLD, cellIndex, CENTER_CELL, cellOf } from '../../core/constants';
import { fbm, Rng } from '../../core/rng';

const params = new URLSearchParams(location.search);
const scene = params.get('scene') ?? 'colony';
const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);

// ------------------------------------------------------------------------------ synthetic data

const SMALL = new Set(['crate', 'bed', 'campfire', 'lamp', 'plant', 'bench', 'banner', 'spikes', 'barricade', 'conveyor', 'solar_panel', 'battery', 'power_pylon', 'rain_collector', 'water_pump', 'research_desk', 'spin_wheel', 'beacon', 'electric_fence', 'statue', 'arcade', 'drone_pad']);
const LARGE = new Set(['warehouse', 'factory', 'hangar', 'fusion_reactor', 'advanced_lab', 'medical_center', 'industrial_purifier', 'atmo_generator', 'harvester', 'skyscraper', 'quantum_storage', 'command_center']);

function sizeOf(key: string): [number, number] {
  if (key.startsWith('turret')) return [1, 1];
  if (key === 'workbench') return [2, 1];
  if (SMALL.has(key)) return [1, 1];
  if (LARGE.has(key)) return [3, 3];
  return [2, 2];
}

function makeData() {
  const data = defaultData();
  const have = new Set(data.buildings.map((b) => b.model));
  const extra: BuildingDef[] = [];
  for (const key of registeredModelKeys()) {
    if (have.has(key)) continue;
    extra.push({
      id: `sc_${key}`, name: key, description: '', icon: '', category: key.startsWith('turret') ? 'defense' : 'utility', size: sizeOf(key), unlockTier: 0, cost: {}, buildTime: 1, hp: 100, maxLevel: 5, solid: true, model: key,
      turret: key.startsWith('turret') || key === 'guard_tower' ? { range: 8, damage: 1, fireRate: 1, projectile: 'bullet', antiAir: true } : undefined,
      shield: key === 'shield_generator' ? { radius: 4, capacity: 100, regen: 1 } : undefined,
    });
  }
  const aliens: AlienDef[] = [...data.aliens];
  const haveA = new Set(aliens.map((a) => a.model));
  const synth: Partial<AlienDef>[] = [
    { id: 'brute', model: 'brute', color: '#e0894a', scale: 1.3, speed: 0.8 },
    { id: 'burrower', model: 'burrower', color: '#c9a86b', scale: 1.0, speed: 1.0, burrow: true },
    { id: 'flyer', model: 'flyer', color: '#6fd8ff', scale: 0.9, speed: 2.0, flying: true },
    { id: 'queen', model: 'queen', color: '#b05cd8', scale: 1.8, speed: 0.6, boss: true },
    { id: 'titan', model: 'titan', color: '#7a4a9a', scale: 2.4, speed: 0.5, boss: true },
  ];
  for (const s of synth) {
    if (haveA.has(s.model!)) continue;
    aliens.push({ id: s.id!, name: s.id!, description: '', model: s.model!, color: s.color!, scale: s.scale!, hp: 100, speed: s.speed!, damage: 5, attackRate: 1, range: 1, prefers: 'any', drop: {}, flying: s.flying, burrow: s.burrow, boss: s.boss });
  }
  return createDataRegistry({ ...data, buildings: [...data.buildings, ...extra], aliens });
}

function makeGen(game: Game, rng: Rng): WorldGen {
  const V = WORLD_CELLS + 1;
  const heights = new Float32Array(V * V);
  const regionMap = new Uint8Array(WORLD_CELLS * WORLD_CELLS);
  const water = new Uint8Array(WORLD_CELLS * WORLD_CELLS);
  const biomes = game.data.biomes;
  const regionIds = biomes.map((b) => b.id);
  const centers = biomes.map((b) => {
    const a = (b.center.angle * Math.PI) / 180;
    const d = b.center.dist * HALF_WORLD;
    return { x: Math.cos(a) * d, z: Math.sin(a) * d, w: b.size };
  });
  const regionAt = (x: number, z: number) => {
    if (Math.hypot(x, z) < 118) return 0;
    let best = 0;
    let bd = Infinity;
    for (let i = 1; i < centers.length; i++) {
      const c = centers[i];
      const d = Math.hypot(x - c.x, z - c.z) / c.w;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  };
  for (let cz = 0; cz < WORLD_CELLS; cz++) for (let cx = 0; cx < WORLD_CELLS; cx++) regionMap[cellIndex(cx, cz)] = regionAt((cx + 0.5) * CELL - HALF_WORLD, (cz + 0.5) * CELL - HALF_WORLD);
  for (let vz = 0; vz < V; vz++) {
    for (let vx = 0; vx < V; vx++) {
      const x = vx * CELL - HALF_WORLD;
      const z = vz * CELL - HALF_WORLD;
      const r = regionAt(x, z);
      const relief = biomes[r].relief;
      const n = fbm(x * 0.012, z * 0.012, 5, 4);
      const n2 = fbm(x * 0.05, z * 0.05, 9, 2);
      let h = (n - 0.45) * relief * 2 + (n2 - 0.5) * relief * 0.3;
      // flatten the colony area
      const d = Math.hypot(x, z);
      const flat = Math.min(1, Math.max(0, (d - 60) / 60));
      h *= flat;
      // a lake north-east of the colony
      const lake = Math.hypot(x - 70, z + 40) / 18;
      if (lake < 1) h = Math.min(h, -1.2 * (1 - lake) - 0.2);
      heights[vz * V + vx] = h;
    }
  }
  for (let cz = 0; cz < WORLD_CELLS - 1; cz++) for (let cx = 0; cx < WORLD_CELLS - 1; cx++) {
    const i = cz * V + cx;
    const m = Math.max(heights[i], heights[i + 1], heights[i + V], heights[i + V + 1]);
    if (m < -0.35) water[cellIndex(cx, cz)] = 1;
  }
  // nodes + props + pois
  const nodes: WorldNode[] = [];
  const props: WorldProp[] = [];
  const pois: WorldPoi[] = [];
  let ni = 0;
  for (let cz = 0; cz < WORLD_CELLS; cz += 2) {
    for (let cx = 0; cx < WORLD_CELLS; cx += 2) {
      const x = (cx + 0.5) * CELL - HALF_WORLD + (rng.next() - 0.5) * 3;
      const z = (cz + 0.5) * CELL - HALF_WORLD + (rng.next() - 0.5) * 3;
      if (Math.hypot(x, z) < 20) continue;
      if (water[cellIndex(cx, cz)]) continue;
      const r = regionMap[cellIndex(cx, cz)];
      const biome = biomes[r];
      for (const nd of biome.nodes) {
        if (rng.next() < nd.density * 2.2) {
          nodes.push({ i: ni++, def: nd.node, x, z, rot: rng.next() * Math.PI * 2, scale: 0.85 + rng.next() * 0.3, region: biome.id, hits: 5 });
          break;
        }
      }
      if (rng.next() < 0.12) props.push({ model: rng.pick(biome.props), x: x + 1, z: z - 1, rot: rng.next() * Math.PI * 2, scale: 0.8 + rng.next() * 0.5 });
    }
  }
  let pi = 0;
  for (let r = 0; r < biomes.length; r++) {
    for (const pp of biomes[r].pois) {
      for (let k = 0; k < pp.count; k++) {
        const a = rng.next() * Math.PI * 2;
        const d = r === 0 ? 30 + rng.next() * 60 : 25 + rng.next() * 60;
        const x = centers[r].x + Math.cos(a) * d;
        const z = centers[r].z + Math.sin(a) * d;
        if (Math.abs(x) > HALF_WORLD - 10 || Math.abs(z) > HALF_WORLD - 10) continue;
        pois.push({ id: `poi_${pi++}`, def: pp.poi, x, z, region: biomes[r].id, rot: rng.next() * Math.PI * 2 });
      }
    }
  }
  const regionCenters = regionIds.map((id, i) => ({ id, x: centers[i].x, z: centers[i].z }));
  return { regionMap, regionIds, regionCenters, heights, water, nodes, pois, props, version: 1 };
}

// ------------------------------------------------------------------------------ scene builders

let nextId = 1;
function building(game: Game, def: string, x: number, z: number, tier: number, opts: Partial<BuildingInstance> = {}): BuildingInstance {
  const d = game.data.building(def);
  const b: BuildingInstance = {
    id: nextId++, def, x, z, rot: 0, level: 1, tier, hp: d?.hp ?? 100, maxHp: d?.hp ?? 100, status: 'active', progress: 1, workers: [], recipe: null, craft: 0, eff: 1, ...opts,
  };
  game.state.buildings.list.push(b);
  return b;
}

/** cells relative to the origin cell (CENTER_CELL). */
const C = (dx: number) => CENTER_CELL + dx;

function defFor(game: Game, model: string): string {
  const d = game.data.buildings.find((b) => b.model === model);
  return d?.id ?? model;
}

function room(game: Game, x0: number, z0: number, w: number, h: number, tier: number, withRoof = true): void {
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) {
      const edge = i === 0 || j === 0 || i === w - 1 || j === h - 1;
      const cx = C(x0 + i);
      const cz = C(z0 + j);
      if (!edge) {
        building(game, 'floor', cx, cz, tier);
        if (withRoof) game.derived.roofCells.add(cellIndex(cx, cz));
        continue;
      }
      let def = 'wall';
      if (j === h - 1 && i === Math.floor(w / 2)) def = 'door';
      else if ((j === 0 && i % 2 === 1) || (i === 0 && j % 2 === 1 && j !== h - 1)) def = 'window';
      building(game, def, cx, cz, tier);
    }
  }
  if (withRoof) game.derived.rooms.push({ id: game.derived.rooms.length + 1, cells: [...game.derived.roofCells], buildings: game.state.buildings.list.filter((b) => b.tier === tier && game.data.building(b.def)?.piece).map((b) => b.id) });
}

function colonyScene(game: Game, rng: Rng, tier: number): void {
  const st = game.state;
  st.colony.tier = tier;
  st.colony.radius = game.data.tier(tier).colonyRadius;
  const core = building(game, 'command_center', C(-1), C(-1), tier);
  st.colony.coreId = core.id;
  // a roofed house + an open fenced farm
  room(game, 4, -8, 6, 5, tier);
  room(game, -12, 2, 5, 5, tier);
  for (let i = 0; i < 6; i++) building(game, 'fence', C(-10 + i), C(-10), Math.min(tier, 2));
  for (let j = 0; j < 4; j++) building(game, 'fence', C(-10), C(-9 + j), Math.min(tier, 2));
  building(game, 'gate', C(-4), C(-10), tier);
  for (let j = 0; j < 4; j++) building(game, 'fence', C(-4), C(-9 + j), Math.min(tier, 2));
  building(game, defFor(game, 'farm_plot'), C(-9), C(-9), tier);
  building(game, defFor(game, 'farm_plot'), C(-7), C(-9), tier, { level: 3 });
  // facilities ring
  const place: [string, number, number, Partial<BuildingInstance>?][] = [
    ['campfire', 3, 2], ['storage_crate', 5, 2, { level: 3 }], ['storage_crate', 6, 2], ['workbench', 3, 4], ['research_desk', 6, 4],
    ['shelter', -5, 4], ['rain_collector', -6, -2], ['logging_camp', 8, -2], ['quarry', -8, -4, { status: 'building', progress: 0.45 }],
    ['spin_wheel', 1, 5], ['lamp_post', -2, 5], ['lamp_post', 6, -5], ['flower_bed', -3, 4], ['scrap_turret', 10, 3], ['scrap_turret', -10, -7], ['scrap_turret', 11, -8],
    ['barricade', 12, 0], ['barricade', 12, 1], ['barricade', 12, 2], ['spike_trap', 11, 0],
  ];
  for (const [def, dx, dz, o] of place) building(game, def, C(dx), C(dz), tier, o);
  // some tier-appropriate extra facilities
  const extras = ['wind_turbine', 'solar_panel', 'greenhouse', 'water_pump', 'kitchen', 'smelter', 'factory', 'research_lab', 'fusion_reactor', 'teleporter', 'turret_mg', 'turret_laser', 'turret_missile', 'drone_hub', 'habitat', 'skyscraper'];
  let k = 0;
  for (const m of extras) {
    const dx = -16 + (k % 4) * 5;
    const dz = 9 + Math.floor(k / 4) * 4;
    building(game, defFor(game, m), C(dx), C(dz), tier, { status: k === 5 ? 'damaged' : k === 6 ? 'off' : 'active' });
    k++;
  }
  // colonists
  const acts: Colonist['activity'][] = ['walking', 'working', 'idle', 'relaxing', 'eating', 'sleeping', 'walking', 'working'];
  for (let i = 0; i < 28; i++) {
    const a = rng.next() * Math.PI * 2;
    const d = 6 + rng.next() * 18;
    const c: Colonist = {
      id: i + 1, name: `Colonist ${i + 1}`, bio: '', rarity: 'common',
      appearance: { skin: rng.int(0, 5), hair: rng.int(0, 3), hairColor: rng.int(0, 7), outfit: rng.int(0, 7), height: 0.9 + rng.next() * 0.2 },
      trait: 'cheerful', specialty: 'farmer', skill: 1, xp: 0, happiness: 70, workplace: null, bed: null,
      x: Math.cos(a) * d, z: Math.sin(a) * d, rot: rng.next() * Math.PI * 2, activity: acts[i % acts.length], tx: 0, tz: 0, joinedAt: 0,
    };
    st.colonists.list.push(c);
  }
  st.player.x = 4;
  st.player.z = 6;
  st.player.rot = 0.6;
  st.player.equip.tool = 'survival_tool';
}

function tiersScene(game: Game): void {
  const st = game.state;
  st.colony.tier = 6;
  st.colony.radius = 48;
  const models = ['command_center', 'wall', 'bunkhouse', 'crate', 'turret_mg', 'wind_turbine', 'lamp'];
  for (let t = 0; t < 7; t++) {
    const cx = -22 + t * 7;
    let cz = -14;
    for (const m of models) {
      const def = defFor(game, m);
      const d = game.data.building(def);
      const sz = d?.size ?? [1, 1];
      if (m === 'wall') {
        // small roofed room: walls + window + door with an auto roof
        const cells: number[] = [];
        for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
          const edge = i === 0 || j === 0 || i === 3 || j === 2;
          const x = C(cx + i);
          const z = C(cz + j);
          if (!edge) {
            building(game, 'floor', x, z, t);
            cells.push(cellIndex(x, z));
            st && game.derived.roofCells.add(cellIndex(x, z));
            continue;
          }
          const def2 = j === 2 && i === 1 ? 'door' : j === 0 && i === 2 ? 'window' : 'wall';
          building(game, def2, x, z, t);
        }
        game.derived.rooms.push({ id: t + 1, cells, buildings: st.buildings.list.filter((b) => b.tier === t && game.data.building(b.def)?.piece).map((b) => b.id) });
        cz += 4;
        continue;
      }
      if (m === 'command_center') {
        const core = building(game, def, C(cx), C(cz), t);
        if (t === 0) st.colony.coreId = core.id;
      } else building(game, def, C(cx), C(cz), t, { level: 1 + (t % 3) });
      cz += sz[1] + 1;
    }
  }
  st.player.x = 0;
  st.player.z = 30;
}

function allScene(game: Game, tier: number): void {
  const st = game.state;
  st.colony.tier = tier;
  st.colony.radius = 48;
  const keys = registeredModelKeys().filter((k) => k !== 'command_center');
  const cols = 10;
  let i = 0;
  for (const key of keys) {
    const def = defFor(game, key);
    const cx = -40 + (i % cols) * 8;
    const cz = -40 + Math.floor(i / cols) * 8;
    building(game, def, C(cx), C(cz), tier, { level: 1 + (i % 3) });
    i++;
  }
  const core = building(game, 'command_center', C(-1), C(44), tier);
  st.colony.coreId = core.id;
}

function aliensScene(game: Game, rng: Rng): void {
  colonyScene(game, rng, 2);
  const st = game.state;
  const models = ['crawler', 'spitter', 'brute', 'burrower', 'flyer', 'queen', 'titan'];
  const states: Alien['state'][] = ['moving', 'attacking', 'moving', 'spawning', 'moving', 'attacking', 'moving'];
  let x = -14;
  models.forEach((m, i) => {
    const def = game.data.alien(m);
    const s = def?.scale ?? 1;
    x += 2.5 * s;
    st.combat.aliens.push({ id: i + 1, def: m, x, z: 22, y: def?.flying ? 2.5 : 0, rot: Math.PI, hp: 10, maxHp: 10, state: states[i], target: null, cd: 0, slowT: 0, slow: 0, spawnT: 0, t: 0 });
    x += 2.5 * s;
  });
  st.player.x = -16;
  st.player.z = 24;
  st.player.rot = -Math.PI / 2;
  st.player.equip.weapon = 'flare_pistol';
}

function battleScene(game: Game, rng: Rng): void {
  colonyScene(game, rng, 4);
  const st = game.state;
  const turrets = ['turret_mg', 'turret_flame', 'turret_missile', 'turret_heavy', 'turret_laser', 'turret_plasma', 'turret_rail', 'turret_cannon', 'turret_aa', 'guard_tower'];
  turrets.forEach((t, i) => building(game, defFor(game, t), C(14), C(-10 + i * 2), 4));
  building(game, defFor(game, 'shield_generator'), C(16), C(-2), 4);
  const models = ['crawler', 'spitter', 'brute', 'burrower', 'flyer', 'queen', 'titan'];
  let id = 1;
  for (let i = 0; i < models.length; i++) {
    for (let k = 0; k < (i < 2 ? 4 : 1); k++) {
      const a: Alien = {
        id: id++, def: models[i], x: 36 + k * 3 + rng.next() * 2, z: -12 + i * 4 + rng.next() * 2, y: models[i] === 'flyer' ? 3 : 0, rot: -Math.PI / 2, hp: 10, maxHp: 10,
        state: i === 3 ? 'spawning' : 'moving', target: null, cd: 0, slowT: 0, slow: 0, spawnT: 0, t: 0,
      };
      st.combat.aliens.push(a);
    }
  }
  const kinds: Projectile['kind'][] = ['bullet', 'arrow', 'flame', 'missile', 'laser', 'plasma', 'rail', 'cannon', 'drone'];
  kinds.forEach((kind, i) => {
    st.combat.projectiles.push({ id: i + 1, kind, x: 30, y: 1.5 + (kind === 'drone' ? 2 : 0), z: -12 + i * 2.5, vx: 14, vy: 0, vz: 0, ttl: 10, damage: 1, splash: kind === 'missile' || kind === 'cannon' ? 2 : 0, pierce: 0, slow: 0, team: 'friendly', target: null, antiAir: false });
  });
  st.combat.phase = 'attack';
}

// ------------------------------------------------------------------------------ boot

function boot() {
  const data = makeData();
  const game = new Game({ seed: 7, data });
  game.start();
  const rng = new Rng(42);
  game.sys.world.gen = makeGen(game, rng);
  game.state.world.regionsUnlocked = params.get('unlockall') ? game.data.biomes.map((b) => b.id) : ['crash_valley', 'pinewood_forest', 'red_desert'];
  for (const p of game.sys.world.gen.pois) game.state.world.pois[p.id] = { discovered: true, looted: Math.random() < 0.3, lootedAt: 0 };
  game.state.world.events.push({ id: 1, def: 'supply_drop', x: 40, z: 30, endsAt: 1e9, claimed: false });
  game.state.settings.quality = (params.get('q') as 'low' | 'medium' | 'high') ?? 'high';
  game.state.buildings.list.length = 0;

  const tier = num('tier', 3);
  switch (scene) {
    case 'tiers': tiersScene(game); break;
    case 'all': allScene(game, tier); break;
    case 'battle': battleScene(game, rng); break;
    case 'aliens': aliensScene(game, rng); break;
    case 'night': colonyScene(game, rng, tier); break;
    default: colonyScene(game, rng, tier);
  }
  if (params.get('vehicle')) {
    game.state.player.vehicle = params.get('vehicle');
    game.state.player.vehicles = [params.get('vehicle')!];
  }
  game.derived.buildingsVersion++;
  game.state.time.dayTime = num('t', scene === 'night' ? 0.95 : 0.4);

  const renderer = new Renderer(game);
  renderer.init(document.getElementById('game')!);
  (window as any).game = game;
  (window as any).renderer = renderer;

  // free camera
  const view = game.view;
  view.camera.mode = 'overview';
  const focus = (params.get('focus') ?? (scene === 'tiers' ? '0,-8' : scene === 'all' ? '0,0' : '2,0')).split(',').map(Number);
  view.camera.tx = focus[0] || 0;
  view.camera.tz = focus[1] || 0;
  view.camera.yaw = num('yaw', scene === 'tiers' ? 0.0 : 0.6);
  view.camera.zoom = num('zoom', scene === 'all' ? 0.9 : scene === 'tiers' ? 0.8 : 0.45);
  if (params.get('grid')) view.showGrid = true;
  if (params.has('pitch')) renderer.setPitchBias(num('pitch', 0));
  if (params.get('build')) {
    view.mode = 'build';
    view.build.def = 'shelter';
    view.build.x = C(2);
    view.build.z = C(8);
    view.build.cells = [{ x: C(2), z: C(8) }, { x: C(3), z: C(8) }, { x: C(2), z: C(9) }, { x: C(3), z: C(9) }];
    view.build.valid = params.get('build') !== 'bad';
    view.build.tier = tier;
  }
  if (params.get('select')) view.selection = { kind: 'building', id: game.state.colony.coreId };

  let dragging = false;
  let lx = 0;
  const el = renderer.three.renderer.domElement;
  el.addEventListener('pointerdown', (e) => {
    dragging = true;
    lx = e.clientX;
  });
  window.addEventListener('pointerup', () => (dragging = false));
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    view.camera.yaw += (e.clientX - lx) * 0.006;
    lx = e.clientX;
  });
  window.addEventListener('wheel', (e) => (view.camera.zoom = Math.max(0, Math.min(1, view.camera.zoom + e.deltaY * 0.0008))));
  const keys = new Set<string>();
  window.addEventListener('keydown', (e) => {
    keys.add(e.key.toLowerCase());
    if (e.key >= '1' && e.key <= '7') game.state.time.dayTime = [0.0, 0.22, 0.3, 0.5, 0.72, 0.8, 0.9][Number(e.key) - 1];
    if (e.key.toLowerCase() === 'b') view.showGrid = !view.showGrid;
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

  const hud = document.getElementById('hud')!;
  if (params.get('hud') === '0') {
    hud.style.display = 'none';
    const help = document.getElementById('help');
    if (help) help.style.display = 'none';
  }
  const animate = !!params.get('animate');
  const fx = !!params.get('fx');
  let last = performance.now();
  let fxTimer = 0;
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const yaw = view.camera.yaw;
    const sp = dt * 25;
    if (keys.has('w')) { view.camera.tx -= Math.sin(yaw) * sp; view.camera.tz -= Math.cos(yaw) * sp; }
    if (keys.has('s')) { view.camera.tx += Math.sin(yaw) * sp; view.camera.tz += Math.cos(yaw) * sp; }
    if (keys.has('a')) { view.camera.tx -= Math.cos(yaw) * sp; view.camera.tz += Math.sin(yaw) * sp; }
    if (keys.has('d')) { view.camera.tx += Math.cos(yaw) * sp; view.camera.tz -= Math.sin(yaw) * sp; }
    if (animate) game.state.time.dayTime = (game.state.time.dayTime + dt / 60) % 1;
    // minimal motion so the scene feels alive without the sim
    const st = game.state;
    st.playTime += dt;
    for (const a of st.combat.aliens) {
      a.t += dt;
      if (scene === 'aliens') {
        if (a.state === 'spawning' && a.t > 3) a.t = 0;
        continue;
      }
      if (a.state === 'spawning' && a.t > 0.6) { a.state = 'moving'; a.t = 0; }
      if (a.state === 'moving') {
        a.x -= dt * 1.5;
        if (a.x < 24) { a.state = 'attacking'; a.t = 0; }
      }
    }
    for (const p of st.combat.projectiles) {
      p.x += p.vx * dt;
      if (p.x > 52) p.x = 30;
    }
    for (const c of st.colonists.list) if (c.activity === 'walking') {
      c.x += Math.sin(c.rot) * dt * 2.2;
      c.z += Math.cos(c.rot) * dt * 2.2;
      if (Math.hypot(c.x, c.z) > 26) c.rot += Math.PI;
    }
    for (const b of st.buildings.list) if (b.status === 'building') {
      b.progress += dt * 0.12;
      if (b.progress > 1) b.progress = 0;
    }
    if (fx) {
      fxTimer += dt;
      if (fxTimer > 0.4) {
        fxTimer = 0;
        const turrets = st.buildings.list.filter((b) => game.data.building(b.def)?.turret);
        const tb = turrets[Math.floor(Math.random() * turrets.length)];
        if (tb) game.bus.emit('turret:fired', { building: tb.id, kind: game.data.building(tb.def)!.turret!.projectile, x: 0, z: 0, tx: 30, tz: 0 });
        const al = st.combat.aliens[Math.floor(Math.random() * st.combat.aliens.length)];
        if (al) game.bus.emit('alien:hit', { id: al.id, x: al.x, z: al.z, damage: 5 });
        game.bus.emit('projectile:impact', { kind: Math.random() < 0.5 ? 'missile' : 'bullet', x: 28 + Math.random() * 8, y: 0.5, z: -10 + Math.random() * 20, splash: Math.random() < 0.5 ? 2 : 0 });
        if (Math.random() < 0.2) game.bus.emit('fx:shake', { strength: 0.2 });
      }
    }
    renderer.render(dt);
    const s = renderer.stats();
    hud.textContent = `scene=${scene} t=${game.state.time.dayTime.toFixed(2)} q=${game.state.settings.quality}\nfps ${s.fps} · draw calls ${s.drawCalls} · tris ${(s.triangles / 1000).toFixed(0)}k\nbuildings ${st.buildings.list.length} · colonists ${st.colonists.list.length} · aliens ${st.combat.aliens.length}`;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot();
void cellOf;
