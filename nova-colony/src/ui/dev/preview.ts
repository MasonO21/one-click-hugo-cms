/**
 * Dev-only preview helpers (loaded when the page is opened with `?uidev` under `vite dev`; the
 * dynamic import is guarded by `import.meta.env.DEV`, so production builds drop it entirely).
 *
 * The simulation systems are stubs in the UI worktree, so this module seeds believable game state
 * and installs tiny fake implementations of the system methods the UI calls. That lets every panel
 * be exercised and screenshotted. It never runs in the real game.
 *
 * Console / screenshot usage:   uiDev.seed(); uiDev.open('research'); uiDev.scene('attack');
 */
import type { Game } from '../../core/Game';
import type { UiCtx } from '../ctx';
import type { UI } from '../UI';
import type { BuildingDef, ResearchDef, RecipeDef, ResourceBag } from '../../data/schema';
import type { BuildingInstance, Colonist } from '../../core/state';
import { CELL, CENTER_CELL, HALF_WORLD, WORLD_CELLS, cellCenter, cellMin } from '../../core/constants';
import { bagCovers, bagEntries } from '../../core/bag';

const R = (min: number, max: number) => min + Math.random() * (max - min);

// ------------------------------------------------------------------ extra content for richer previews

function extraContent(game: Game): void {
  const d = game.data as unknown as { buildings: BuildingDef[]; research: ResearchDef[]; recipes: RecipeDef[]; maps: Record<string, Map<string, unknown>> };
  const addB = (b: BuildingDef) => {
    if (d.maps.building.has(b.id)) return;
    d.buildings.push(b);
    d.maps.building.set(b.id, b);
  };
  const base = { size: [1, 1] as [number, number], unlockTier: 0, cost: {}, buildTime: 3, hp: 100, maxLevel: 1, solid: true };
  addB({ ...base, id: 'solar_panel', name: 'Solar Panel', icon: '☀️', category: 'power', description: 'Clean power from the sun.', unlockTier: 1, cost: { stone: 20, fiber: 15 }, model: 'solar_panel', power: 40, maxLevel: 5, levelCostMult: 1.7, levelEffect: 0.5 });
  addB({ ...base, id: 'wind_turbine', name: 'Wind Turbine', icon: '🌬️', category: 'power', description: 'Spins up a breeze into power.', unlockTier: 2, cost: { wood: 40, stone: 40, iron: 20 }, model: 'wind_turbine', power: 90, research: 'wind_power' });
  addB({ ...base, id: 'fuel_generator', name: 'Fuel Generator', icon: '⛽', category: 'power', description: 'Burns coal for steady power.', unlockTier: 3, cost: { steel: 40, iron: 60 }, model: 'fuel_generator', power: 220, consumes: { coal: 3 } });
  addB({ ...base, id: 'water_pump', name: 'Water Pump', icon: '🚰', category: 'water', description: 'Pumps water from deep underground.', size: [2, 1], unlockTier: 1, cost: { wood: 30, stone: 25 }, model: 'water_pump', produces: { water: 12 }, power: -10, workers: { slots: 1, job: 'water_tech', required: false } });
  addB({ ...base, id: 'greenhouse', name: 'Greenhouse', icon: '🪴', category: 'food', description: 'Grows food all year round.', size: [3, 2], unlockTier: 1, cost: { wood: 60, fiber: 40, stone: 20 }, model: 'greenhouse', produces: { food: 10 }, workers: { slots: 2, job: 'farmer', required: false }, maxLevel: 5, levelCostMult: 1.7, levelEffect: 0.5 });
  addB({ ...base, id: 'bunkhouse', name: 'Bunkhouse', icon: '🏠', category: 'housing', description: 'Six comfy beds.', size: [3, 2], unlockTier: 1, cost: { wood: 80, stone: 30 }, model: 'bunkhouse', housing: 6, comfort: 2, maxLevel: 3, levelCostMult: 2, levelEffect: 0.5 });
  addB({ ...base, id: 'recruit_board', name: 'Recruitment Board', icon: '📌', category: 'utility', description: 'Post a call for survivors on the radio.', cost: { wood: 30, stone: 10 }, model: 'radio_tower', recruit: true, maxCount: 1 });
  addB({ ...base, id: 'warehouse', name: 'Warehouse', icon: '🏬', category: 'storage', description: 'Big storage for everything.', size: [3, 3], unlockTier: 2, cost: { wood: 120, stone: 80 }, model: 'warehouse', storage: { wood: 500, stone: 500, fiber: 300, food: 300, water: 300 }, maxLevel: 5, levelCostMult: 1.8, levelEffect: 1 });
  addB({ ...base, id: 'smelter', name: 'Smelter', icon: '🏭', category: 'crafting', description: 'Smelts ore into steel.', size: [2, 2], unlockTier: 3, cost: { stone: 120, iron: 40 }, model: 'smelter', factory: 'smelter', workers: { slots: 1, job: 'mechanic', required: true }, power: -20 });
  addB({ ...base, id: 'guard_tower', name: 'Guard Tower', icon: '🗼', category: 'defense', description: 'A watchful tower with a sharp-eyed sentry.', size: [2, 2], unlockTier: 1, cost: { wood: 60, stone: 40 }, model: 'guard_tower', turret: { range: 9, damage: 14, fireRate: 1.2, projectile: 'bullet', mannedBy: 'guard' }, workers: { slots: 1, job: 'guard', required: false }, maxLevel: 5, levelCostMult: 1.8, levelEffect: 0.4 });
  addB({ ...base, id: 'turret_mg', name: 'Machine Gun Turret', icon: '🔫', category: 'defense', description: 'Rapid-fire defense.', unlockTier: 3, cost: { steel: 50, iron: 30 }, model: 'turret_mg', turret: { range: 10, damage: 8, fireRate: 6, projectile: 'bullet' } });
  addB({ ...base, id: 'garage', name: 'Garage', icon: '🚙', category: 'utility', description: 'Build and park vehicles.', size: [3, 2], unlockTier: 1, cost: { wood: 100, stone: 60 }, model: 'garage', garage: true, station: 'garage' });
  addB({ ...base, id: 'fountain', name: 'Fountain', icon: '⛲', category: 'decor', description: 'Calming splashes. Colonists love it.', size: [2, 2], unlockTier: 1, cost: { stone: 40 }, model: 'fountain', comfort: 3 });
  addB({ ...base, id: 'bench', name: 'Park Bench', icon: '🪑', category: 'decor', description: 'A cozy place to sit.', cost: { wood: 8 }, model: 'bench', comfort: 1, solid: false });
  addB({ ...base, id: 'med_bay', name: 'Med Bay', icon: '🏥', category: 'utility', description: 'Keeps everyone healthy and happy.', size: [2, 2], unlockTier: 2, cost: { wood: 60, stone: 60, fiber: 30 }, model: 'med_bay', medical: 3, workers: { slots: 1, job: 'doctor', required: false } });

  const res = (r: ResearchDef) => {
    if (d.maps.research.has(r.id)) return;
    d.research.push(r);
    d.maps.research.set(r.id, r);
  };
  const rb = { tier: 0, requires: [] as string[], cost: 30 };
  res({ ...rb, id: 'wind_power', name: 'Wind Power', icon: '🌬️', category: 'power', description: 'Harness the wind for clean power.', pos: [0, 0], cost: 60, tier: 1, unlocks: { buildings: ['wind_turbine'] } });
  res({ ...rb, id: 'solar', name: 'Solar Cells', icon: '☀️', category: 'power', description: 'Photovoltaic panels.', pos: [0, 1], cost: 50, tier: 1, unlocks: { buildings: ['solar_panel'] } });
  res({ ...rb, id: 'batteries', name: 'Batteries', icon: '🔋', category: 'power', description: 'Store power for the night.', pos: [1, 0], requires: ['wind_power'], cost: 120, tier: 2 });
  res({ ...rb, id: 'fusion', name: 'Fusion Core', icon: '⚛️', category: 'power', description: 'Near-limitless power.', pos: [2, 0], requires: ['batteries'], cost: 800, tier: 5, effects: [{ stat: 'power', add: 0.5 }] });
  res({ ...rb, id: 'greenhouses', name: 'Greenhouses', icon: '🪴', category: 'food', description: 'Grow food in any weather.', pos: [0, 0], cost: 40, unlocks: { buildings: ['greenhouse'] } });
  res({ ...rb, id: 'turret_basics', name: 'Guard Towers', icon: '🗼', category: 'defense', description: 'Sturdy towers for your sentries.', pos: [0, 0], cost: 45, unlocks: { buildings: ['guard_tower'] } });
  res({ ...rb, id: 'mg_turret', name: 'Machine Guns', icon: '🔫', category: 'defense', description: 'Rapid-fire turrets.', pos: [1, 0], requires: ['turret_basics'], cost: 200, tier: 3, unlocks: { buildings: ['turret_mg'] } });
  res({ ...rb, id: 'rifles', name: 'Better Rifles', icon: '🎯', category: 'weapons', description: 'More damage, more fun.', pos: [0, 0], cost: 90, effects: [{ stat: 'playerDamage', add: 0.25 }] });
  res({ ...rb, id: 'drones', name: 'Drone Hub', icon: '🛸', category: 'robotics', description: 'Helpful little drones.', pos: [0, 0], cost: 500, tier: 4 });
  res({ ...rb, id: 'maps', name: 'Cartography', icon: '🧭', category: 'exploration', description: 'Reveal more of the map.', pos: [0, 1], cost: 35 });
  res({ ...rb, id: 'recruiting', name: 'Radio Calls', icon: '📡', category: 'colonists', description: 'More recruits on the board.', pos: [0, 0], cost: 70, effects: [{ stat: 'recruitSlots', add: 1 }] });

  const rec = (r: RecipeDef) => {
    if (d.maps.recipe.has(r.id)) return;
    d.recipes.push(r);
    d.maps.recipe.set(r.id, r);
  };
  rec({ id: 'r_wood_wall_kit', name: 'Wall Kit', category: 'materials', station: 'workbench', inputs: { wood: 20, fiber: 5 }, outputs: { resources: { stone: 4 } }, time: 6, unlockTier: 0 });
  rec({ id: 'r_atv', name: 'ATV', category: 'vehicles', station: 'garage', inputs: { wood: 80, stone: 60, fiber: 40 }, outputs: { vehicle: 'atv' }, time: 30, unlockTier: 1 });
  rec({ id: 'r_steel', name: 'Steel Bar', category: 'materials', station: 'smelter', inputs: { iron: 5, coal: 2 }, outputs: { resources: { steel: 1 } }, time: 8, unlockTier: 3 });
}

// ------------------------------------------------------------------ fake simulation

type Any = any; // dev-only monkeypatching

function patchSystems(game: Game): void {
  const g = game as Any;
  const s = g.sys as Any;
  const st = game.state;
  const data = game.data;
  const tierOf = (b: BuildingInstance) => data.tier(b.tier);

  // ---- buildings
  const bs = s.buildings;
  let occKey = -1;
  let occ = new Map<number, number>();
  const occupancy = () => {
    if (occKey !== game.derived.buildingsVersion) {
      occKey = game.derived.buildingsVersion;
      occ = new Map();
      for (const b of st.buildings.list) {
        const def = data.building(b.def)!;
        const [w, h] = b.rot % 2 ? [def.size[1], def.size[0]] : def.size;
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) occ.set((b.z + j) * WORLD_CELLS + b.x + i, b.id);
      }
    }
    return occ;
  };
  const bump = () => {
    game.derived.buildingsVersion++;
    s.economy.recompute();
  };
  bs.center = (b: BuildingInstance) => {
    const def = data.building(b.def)!;
    const [w, h] = b.rot % 2 ? [def.size[1], def.size[0]] : def.size;
    return { x: cellMin(b.x) + (w * CELL) / 2, z: cellMin(b.z) + (h * CELL) / 2 };
  };
  bs.at = (cx: number, cz: number) => st.buildings.list.find((b) => occupancy().get(cz * WORLD_CELLS + cx) === b.id);
  bs.cost = (id: string, tier = 0) => {
    const def = data.building(id)!;
    if (def.piece) {
      const out: ResourceBag = {};
      for (const [k, v] of bagEntries(data.tier(tier).pieceCost)) out[k] = Math.ceil(v * (def.costMult ?? 1));
      for (const [k, v] of bagEntries(def.cost)) out[k] = (out[k] ?? 0) + v;
      return out;
    }
    return { ...def.cost };
  };
  bs.canPlace = (id: string, x: number, z: number, rot: number, ignore?: number) => {
    const def = data.building(id);
    if (!def) return { ok: false, reason: 'Unknown building' };
    const [w, h] = rot % 2 ? [def.size[1], def.size[0]] : def.size;
    const o = occupancy();
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const cx = x + i;
        const cz = z + j;
        if (Math.hypot(cx - CENTER_CELL, cz - CENTER_CELL) > st.colony.radius + 1) return { ok: false, reason: 'Outside your colony area' };
        const at = o.get(cz * WORLD_CELLS + cx);
        if (at != null && at !== ignore) return { ok: false, reason: 'Something is already there' };
      }
    }
    return { ok: true };
  };
  bs.lineCells = (x0: number, z0: number, x1: number, z1: number) => {
    const out: { x: number; z: number }[] = [];
    const sx = Math.sign(x1 - x0) || 1;
    const sz = Math.sign(z1 - z0) || 1;
    if (Math.abs(x1 - x0) >= Math.abs(z1 - z0)) {
      for (let x = x0; x !== x1 + sx; x += sx) out.push({ x, z: z0 });
      for (let z = z0 + sz; z !== z1 + sz && z0 !== z1; z += sz) out.push({ x: x1, z });
    } else {
      for (let z = z0; z !== z1 + sz; z += sz) out.push({ x: x0, z });
      for (let x = x0 + sx; x !== x1 + sx && x0 !== x1; x += sx) out.push({ x, z: z1 });
    }
    return out;
  };
  const makeInst = (id: string, x: number, z: number, rot: number, tier: number): BuildingInstance => {
    const def = data.building(id)!;
    const hp = def.hp * (def.piece ? data.tier(tier).hpMult : 1);
    return { id: st.buildings.nextId++, def: id, x, z, rot: rot as 0, level: 1, tier, hp, maxHp: hp, status: 'active', progress: 1, workers: [], recipe: null, craft: 0, eff: 1 };
  };
  bs.place = (id: string, x: number, z: number, rot: number, opts?: { tier?: number }) => {
    const def = data.building(id)!;
    const tier = opts?.tier ?? st.colony.tier;
    if (!bs.canPlace(id, x, z, rot).ok) return null;
    if (!s.economy.spend(bs.cost(id, tier), 'build')) return null;
    const inst = makeInst(id, x, z, rot, def.piece ? tier : st.colony.tier);
    st.buildings.list.push(inst);
    bump();
    game.bus.emit('building:placed', { id: inst.id, def: id });
    game.bus.emit('building:completed', { id: inst.id, def: id });
    game.bus.emit('sfx', { id: 'place' });
    const c = bs.center(inst);
    game.bus.emit('ui:float', { text: `+${def.name}`, x: c.x, z: c.z, color: '#9cf0c4' });
    return inst.id;
  };
  bs.placeLine = (id: string, x0: number, z0: number, x1: number, z1: number, tier: number) => {
    const ids: number[] = [];
    for (const c of bs.lineCells(x0, z0, x1, z1)) {
      const nid = bs.place(id, c.x, c.z, 0, { tier });
      if (nid != null) ids.push(nid);
    }
    return ids;
  };
  bs.move = (id: number, x: number, z: number, rot: number) => {
    const b = bs.get(id);
    if (!b || !bs.canPlace(b.def, x, z, rot, id).ok) return false;
    b.x = x;
    b.z = z;
    b.rot = rot;
    bump();
    return true;
  };
  bs.rotate = (id: number) => {
    const b = bs.get(id);
    if (!b) return false;
    b.rot = ((b.rot + 1) & 3) as 0;
    bump();
    return true;
  };
  bs.remove = (id: number) => {
    const i = st.buildings.list.findIndex((b) => b.id === id);
    if (i < 0 || data.building(st.buildings.list[i].def)?.core) return false;
    const b = st.buildings.list[i];
    s.economy.addBag(bs.cost(b.def, b.tier), 'refund');
    st.buildings.list.splice(i, 1);
    bump();
    return true;
  };
  bs.toggle = (id: number) => {
    const b = bs.get(id);
    if (b) b.status = b.status === 'off' ? 'active' : 'off';
  };
  bs.levelUpCost = (id: number) => {
    const b = bs.get(id);
    const def = b && data.building(b.def);
    if (!b || !def || b.level >= def.maxLevel) return null;
    const out: ResourceBag = {};
    for (const [k, v] of bagEntries(def.cost)) out[k] = Math.ceil(v * Math.pow(def.levelCostMult ?? 1.5, b.level));
    return out;
  };
  bs.levelUp = (id: number) => {
    const c = bs.levelUpCost(id);
    const b = bs.get(id);
    if (!c || !b || !s.economy.spend(c, 'upgrade')) return false;
    b.level++;
    bump();
    return true;
  };
  bs.tierUpCost = (id: number, to: number) => {
    const b = bs.get(id);
    if (!b) return null;
    const def = data.building(b.def)!;
    const out: ResourceBag = {};
    for (const [k, v] of bagEntries(data.tier(to).pieceCost)) out[k] = Math.ceil(v * (def.costMult ?? 1) * 0.6);
    return out;
  };
  bs.tierUp = (id: number, to: number) => {
    const c = bs.tierUpCost(id, to);
    const b = bs.get(id);
    if (!c || !b || to > st.colony.tier || !s.economy.spend(c, 'upgrade')) return false;
    b.tier = to;
    bump();
    return true;
  };
  bs.massTierUpCost = (ids: number[], to: number) => {
    const out: ResourceBag = {};
    for (const id of ids) for (const [k, v] of bagEntries(bs.tierUpCost(id, to) ?? {})) out[k] = (out[k] ?? 0) + v;
    return out;
  };
  bs.massTierUp = (ids: number[], to: number) => {
    const c = bs.massTierUpCost(ids, to);
    if (to > st.colony.tier || !s.economy.spend(c, 'upgrade')) return 0;
    for (const id of ids) {
      const b = bs.get(id);
      if (b) b.tier = to;
    }
    bump();
    return ids.length;
  };
  bs.roomPieces = (cx: number, cz: number) => {
    // dev: the room is every piece within 4 cells
    const out: number[] = [];
    for (const b of st.buildings.list) if (data.building(b.def)?.piece && Math.hypot(b.x - cx, b.z - cz) < 5) out.push(b.id);
    return out.length > 2 ? out : [];
  };
  bs.setRecipe = (id: number, recipe: string | null) => {
    const b = bs.get(id);
    if (b) {
      b.recipe = recipe;
      b.craft = 0;
    }
  };
  bs.saveBlueprint = (name: string, ids: number[]) => {
    if (!ids.length) return null;
    const first = bs.get(ids[0])!;
    const id = `bp_${st.buildings.blueprints.length + 1}`;
    st.buildings.blueprints.push({ id, name, parts: ids.map((i) => bs.get(i)!).map((b) => ({ def: b.def, dx: b.x - first.x, dz: b.z - first.z, rot: b.rot, tier: b.tier })) });
    return id;
  };
  bs.blueprintCost = (id: string) => {
    const bp = st.buildings.blueprints.find((b) => b.id === id);
    const out: ResourceBag = {};
    for (const p of bp?.parts ?? []) for (const [k, v] of bagEntries(bs.cost(p.def, p.tier))) out[k] = (out[k] ?? 0) + v;
    return out;
  };
  bs.placeBlueprint = (id: string, x: number, z: number, rot: number) => {
    const bp = st.buildings.blueprints.find((b) => b.id === id);
    const ids: number[] = [];
    for (const p of bp?.parts ?? []) {
      const nid = bs.place(p.def, x + p.dx, z + p.dz, (p.rot + rot) & 3, { tier: p.tier });
      if (nid != null) ids.push(nid);
    }
    return ids;
  };

  // ---- economy (simple derived numbers)
  s.economy.recompute = () => {
    const d = game.derived;
    for (const r of data.resources) d.capacity[r.id] = r.baseCapacity;
    let prod: Record<string, number> = {};
    let cons: Record<string, number> = {};
    let pp = 0;
    let pc = 0;
    let beds = 0;
    let rp = 0;
    let turrets = 0;
    let rating = 0;
    for (const b of st.buildings.list) {
      if (b.status === 'building') continue;
      const def = data.building(b.def)!;
      const m = 1 + (def.levelEffect ?? 0) * (b.level - 1);
      for (const [k, v] of bagEntries(def.storage)) d.capacity[k] = (d.capacity[k] ?? 0) + v * m;
      if (b.status === 'off') continue;
      for (const [k, v] of bagEntries(def.produces)) prod[k] = (prod[k] ?? 0) + v * m * b.eff;
      for (const [k, v] of bagEntries(def.consumes)) cons[k] = (cons[k] ?? 0) + v;
      if ((def.power ?? 0) > 0) pp += def.power! * m;
      if ((def.power ?? 0) < 0) pc += -def.power!;
      beds += (def.housing ?? 0) * m;
      rp += (def.research_rate ?? 0) * m;
      if (def.turret) {
        turrets++;
        rating += def.turret.damage * def.turret.fireRate * m * 2;
      }
    }
    const n = st.colonists.list.length;
    cons.food = (cons.food ?? 0) + n * data.balance.foodPerColonistPerMin;
    cons.water = (cons.water ?? 0) + n * data.balance.waterPerColonistPerMin;
    d.producePerMin = prod;
    d.consumePerMin = cons;
    const keys = new Set([...Object.keys(prod), ...Object.keys(cons)]);
    d.netPerMin = {};
    for (const k of keys) d.netPerMin[k] = (prod[k] ?? 0) - (cons[k] ?? 0);
    d.power = { produced: pp, consumed: pc, ratio: pc > 0 ? Math.min(1, pp / pc) : 1 };
    d.housing = { beds, used: n };
    d.research = { perMin: rp };
    d.defense = { rating: Math.round(rating), turrets };
    d.happiness = { average: n ? st.colonists.list.reduce((a, c) => a + c.happiness, 0) / n : 50, productivity: 1 };
  };
  s.economy.modifier = () => 1;

  // ---- progression
  s.progression.next = () => {
    if (st.colony.tier >= 6) return null;
    const nt = data.tier(st.colony.tier + 1);
    return { tier: nt.index, research: nt.research, researchDone: !nt.research || st.research.completed.includes(nt.research), cost: nt.upgradeCost, affordable: s.economy.canAfford(nt.upgradeCost) };
  };
  s.progression.canTierUp = () => {
    const n = s.progression.next();
    return !!n && n.researchDone && n.affordable;
  };
  s.progression.tierUp = () => {
    const n = s.progression.next();
    if (!n || !s.progression.canTierUp() || !s.economy.spend(n.cost, 'tier')) return false;
    st.colony.tier = n.tier;
    st.colony.radius = data.tier(n.tier).colonyRadius;
    bump();
    game.bus.emit('colony:tierUp', { tier: n.tier });
    return true;
  };

  // ---- research
  const rs = s.research;
  rs.status = (id: string) => {
    const d = data.researchDef(id);
    if (!d) return 'locked_tier';
    if (rs.isDone(id)) return 'done';
    if (d.tier > st.colony.tier) return 'locked_tier';
    return d.requires.every((r: string) => rs.isDone(r)) ? 'available' : 'locked_prereq';
  };
  rs.available = () => data.research.filter((r) => rs.status(r.id) === 'available');
  rs.canResearch = (id: string) => {
    const d = data.researchDef(id);
    return !!d && rs.status(id) === 'available' && st.research.points >= d.cost && s.economy.canAfford(d.resources);
  };
  rs.research = (id: string) => {
    const d = data.researchDef(id);
    if (!d || !rs.canResearch(id) || !s.economy.spend(d.resources, 'research')) return false;
    st.research.points -= d.cost;
    st.research.completed.push(id);
    game.bus.emit('research:completed', { id });
    return true;
  };

  // ---- crafting
  const cr = s.crafting;
  cr.stations = () => ['hand', ...new Set(st.buildings.list.map((b) => data.building(b.def)?.station ?? data.building(b.def)?.factory).filter(Boolean) as string[])];
  cr.recipes = (station?: string) => data.recipes.filter((r) => (!station || r.station === station) && r.unlockTier <= st.colony.tier);
  cr.canCraft = (id: string) => {
    const r = data.recipe(id);
    if (!r) return { ok: false, reason: 'Unknown recipe' };
    return s.economy.canAfford(r.inputs) ? { ok: true } : { ok: false, reason: 'Not enough resources yet' };
  };
  cr.craft = (id: string) => {
    const r = data.recipe(id);
    if (!r || !s.economy.spend(r.inputs, 'craft')) return null;
    const jid = st.crafting.nextJobId++;
    st.crafting.queue.push({ id: jid, recipe: id, remaining: r.time, total: r.time });
    game.bus.emit('craft:queued', { job: jid, recipe: id });
    return jid;
  };
  cr.finishCost = (id: number) => {
    const j = st.crafting.queue.find((q) => q.id === id);
    return j ? Math.max(1, Math.ceil(j.remaining / 6)) : 0;
  };
  const finish = (id: number) => {
    const i = st.crafting.queue.findIndex((q) => q.id === id);
    if (i < 0) return false;
    const j = st.crafting.queue[i];
    const r = data.recipe(j.recipe)!;
    st.crafting.queue.splice(i, 1);
    for (const [k, v] of Object.entries(r.outputs.items ?? {})) s.player.addItem(k, v);
    s.economy.addBag(r.outputs.resources, 'craft');
    if (r.outputs.vehicle) st.player.vehicles.push(r.outputs.vehicle);
    game.bus.emit('craft:completed', { recipe: r.id });
    return true;
  };
  cr.finishNow = finish;
  const origCraftUpdate = cr.update?.bind(cr);
  cr.update = (dt: number) => {
    origCraftUpdate?.(dt);
    const q = st.crafting.queue[0];
    if (q) {
      q.remaining -= dt;
      if (q.remaining <= 0) finish(q.id);
    }
  };

  // ---- colonists
  const cs = s.colonists;
  cs.freeBeds = () => Math.max(0, game.derived.housing.beds - st.colonists.list.length);
  cs.assign = (cid: number, bid: number | null) => {
    const c = cs.get(cid);
    if (!c) return false;
    if (c.workplace != null) {
      const old = bs.get(c.workplace);
      if (old) old.workers = old.workers.filter((w: number) => w !== cid);
    }
    c.workplace = null;
    if (bid != null) {
      const b = bs.get(bid);
      const w = b && data.building(b.def)?.workers;
      if (!b || !w || b.workers.length >= w.slots) return false;
      b.workers.push(cid);
      c.workplace = bid;
    }
    game.bus.emit('colonist:assigned', { id: cid, workplace: bid });
    return true;
  };
  cs.autoAssign = () => {
    let n = 0;
    for (const c of st.colonists.list) {
      if (c.workplace != null) continue;
      const b = st.buildings.list.find((x) => {
        const w = data.building(x.def)?.workers;
        return w && x.workers.length < w.slots;
      });
      if (b && cs.assign(c.id, b.id)) n++;
    }
    return n;
  };
  cs.recruit = (i: number) => {
    const cand = st.colonists.candidates[i];
    if (!cand || cs.freeBeds() <= 0 || !s.economy.spend(cand.cost, 'recruit')) return false;
    st.colonists.list.push(cand.colonist);
    st.colonists.candidates.splice(i, 1);
    bump();
    game.bus.emit('colonist:recruited', { id: cand.colonist.id, rarity: cand.colonist.rarity });
    return true;
  };
  cs.refreshCandidates = () => {
    st.colonists.candidates = [mkCand(game, 'common'), mkCand(game, 'rare'), mkCand(game, Math.random() < 0.3 ? 'epic' : 'common')];
    st.colonists.refreshAt = game.now() + 2 * 3600 * 1000;
  };
  cs.happinessFactors = (c: Colonist) => [
    { label: 'Has a bed', value: 15, ok: true },
    { label: 'Fed', value: 12, ok: true },
    { label: 'Drinking water', value: 12, ok: true },
    { label: 'Power on', value: 0, ok: false },
    { label: 'Comfy rooms', value: Math.round(c.happiness / 10), ok: true },
    { label: 'Feels safe', value: 5, ok: true },
  ];

  // ---- missions
  const ms = s.missions;
  ms.active = () => st.missions.active.map((id: string) => data.mission(id)).filter(Boolean);
  ms.progress = (id: string) => {
    const m = data.mission(id)!;
    const v = st.missions.progress[id] ?? 0;
    return { value: Math.min(v, m.count), target: m.count, done: v >= m.count };
  };
  ms.current = () => ms.active().find((m: Any) => m.chain === 'main') ?? null;
  ms.claim = (id: string) => {
    const m = data.mission(id);
    if (!m || !ms.progress(id).done) return false;
    game.grant(m.reward, 'mission');
    st.missions.active = st.missions.active.filter((x) => x !== id);
    st.missions.completed.push(id);
    for (const n of m.next ?? []) st.missions.active.push(n);
    game.bus.emit('mission:claimed', { id });
    return true;
  };

  // ---- liveops
  const lo = s.liveops;
  let nextSpin = 0;
  lo.canWatchAd = () => true;
  lo.watchAd = async (p: string) => {
    game.bus.emit('ad:rewarded', { placement: p });
    if (p === 'offline_double') game.bus.emit('offline:claimed', { doubled: true });
    if (p === 'invasion_bonus') game.bus.emit('combat:rewardClaimed', { doubled: true });
    return true;
  };
  lo.canSpinFree = () => st.liveops.spin.lastFree == null;
  lo.spin = async () => {
    st.liveops.spin.lastFree = 'today';
    nextSpin = Math.floor(Math.random() * data.spinSegments.length);
    return nextSpin;
  };
  lo.dailyAvailable = () => st.liveops.daily.lastClaim !== 'today';
  lo.claimDaily = () => {
    const r = data.dailyRewards[st.liveops.daily.streak % data.dailyRewards.length];
    st.liveops.daily.streak++;
    st.liveops.daily.lastClaim = 'today';
    game.grant(r, 'daily');
    return r;
  };
  lo.seasonLevel = () => Math.min(data.season.levels.length, Math.floor(st.liveops.season.xp / data.season.xpPerLevel));
  lo.claimSeason = (lvl: number, premium: boolean) => {
    const sl = st.liveops.season;
    const list = premium ? sl.claimedPremium : sl.claimedFree;
    if (list.includes(lvl) || lvl > lo.seasonLevel() || (premium && !sl.premium)) return false;
    list.push(lvl);
    game.grant(premium ? data.season.levels[lvl - 1].premium : data.season.levels[lvl - 1].free, 'season');
    return true;
  };
  lo.price = (id: string) => data.product(id)?.fallbackPrice ?? '';
  lo.buy = async (id: string) => {
    const p = data.product(id);
    if (!p) return false;
    game.grant(p.grants, 'purchase');
    st.liveops.purchases.push({ id, at: game.now() });
    return true;
  };
  lo.freeCrateReady = () => st.liveops.freeCrateAt <= game.now();
  lo.openFreeCrate = () => {
    if (!lo.freeCrateReady()) return null;
    const r = { resources: { wood: 120, stone: 80, fiber: 50 } };
    game.grant(r, 'drop');
    st.liveops.freeCrateAt = game.now() + 4 * 3600 * 1000;
    return r;
  };
  lo.claimOffline = (doubled: boolean) => {
    const p = game.pendingOffline;
    if (p) s.economy.applyOffline(p, doubled ? 2 : 1);
    game.pendingOffline = null;
    game.bus.emit('offline:claimed', { doubled });
  };

  // ---- combat
  const cb = s.combat;
  cb.secondsToAttack = () => (st.combat.phase === 'warning' ? st.combat.nextAt - st.playTime : Infinity);
  cb.startNow = () => {
    st.combat.phase = 'attack';
    st.combat.nextAt = st.playTime;
  };
  cb.claimReward = () => {
    if (!st.combat.pendingReward) return false;
    game.grant(st.combat.pendingReward, 'reward');
    st.combat.pendingReward = null;
    st.combat.phase = 'peace';
    game.bus.emit('combat:rewardClaimed', { doubled: false });
    return true;
  };
  cb.defenseRating = () => game.derived.defense.rating;

  // ---- world
  const ws = s.world;
  ws.gen = makeWorld(game);
  // the real WorldSystem indexed the generated world's nodes; re-index the stand-in (it has none), or the
  // first gather lookup reads a stale node index, throws, and stops the preview's game loop
  ws.indexWorld();
  ws.isUnlocked = (id: string) => st.world.regionsUnlocked.includes(id);
  ws.lockReason = (id: string) => {
    const b = data.biome(id);
    if (!b || ws.isUnlocked(id)) return null;
    return b.unlock.tier != null ? `Requires ${data.tier(b.unlock.tier).name} tier` : 'Locked';
  };
  ws.revealed = (x: number, z: number) => Math.hypot(x, z) < 140 || Math.hypot(x - 150, z + 60) < 60 || Math.hypot(x + 120, z - 130) < 50;
  ws.fastTravelTargets = () => [{ id: 'poi_beacon_1', name: 'Pinewood Beacon', x: -110, z: 120 }];

  // ---- player
  s.player.carried = () => Object.values(st.player.backpack).reduce((a, v) => a + (v ?? 0), 0);
  s.player.unequip = (slot: string) => {
    delete (st.player.equip as Any)[slot];
  };
  s.player.equip = (id: string) => {
    const it = data.item(id);
    if (!it?.slot) return false;
    (st.player.equip as Any)[it.slot] = id;
    return true;
  };
  s.player.useItem = (id: string) => {
    const it = data.item(id);
    if (!it?.use || !s.player.removeItem(id)) return false;
    game.grant(it.use.reward, 'item');
    return true;
  };
  s.player.fastTravel = () => true;
  s.player.mount = (id: string) => {
    st.player.vehicle = id;
    return true;
  };
  s.player.dismount = () => {
    st.player.vehicle = null;
  };
  s.player.depositBackpack = () => {
    s.economy.addBag(st.player.backpack, 'gather');
    st.player.backpack = {};
  };

  // ---- world events
  s.worldEvents.claim = () => true;
}

function mkColonist(game: Game, rarity: Colonist['rarity'], name?: string): Colonist {
  const g = game.data;
  const specs = g.professions;
  const id = game.state.colonists.nextId++;
  const first = g.names.first[Math.floor(Math.random() * g.names.first.length)];
  const last = g.names.last[Math.floor(Math.random() * g.names.last.length)];
  const nm = name ?? `${first} ${last}`;
  return {
    id,
    name: nm,
    bio: g.names.bios[Math.floor(Math.random() * g.names.bios.length)].replace('{name}', nm.split(' ')[0]),
    rarity,
    appearance: { skin: Math.floor(R(0, 6)), hair: Math.floor(R(0, 3)), hairColor: Math.floor(R(0, 8)), outfit: Math.floor(R(0, 8)), height: 1 },
    trait: g.traits[Math.floor(Math.random() * g.traits.length)].id,
    specialty: specs[Math.floor(Math.random() * specs.length)].id,
    skill: 1 + Math.floor(R(0, rarity === 'epic' ? 5 : rarity === 'rare' ? 4 : 3)),
    xp: Math.random(),
    happiness: Math.round(R(35, 95)),
    workplace: null,
    bed: null,
    x: R(-8, 8),
    z: R(-8, 8),
    rot: 0,
    activity: 'idle',
    tx: 0,
    tz: 0,
    joinedAt: game.now(),
  };
}

function mkCand(game: Game, rarity: Colonist['rarity']) {
  return { colonist: mkColonist(game, rarity), cost: { ...game.data.balance.recruitCost[rarity] } };
}

function makeWorld(game: Game) {
  const N = WORLD_CELLS;
  const biomes = game.data.biomes;
  const ids = biomes.map((b) => b.id);
  const regionMap = new Uint8Array(N * N);
  const centers = biomes.map((b) => {
    const a = (b.center.angle * Math.PI) / 180;
    return { x: Math.cos(a) * b.center.dist * HALF_WORLD * 0.85, z: Math.sin(a) * b.center.dist * HALF_WORLD * 0.85, w: Math.sqrt(b.size) };
  });
  for (let cz = 0; cz < N; cz++) {
    for (let cx = 0; cx < N; cx++) {
      const x = cellCenter(cx);
      const z = cellCenter(cz);
      let best = 0;
      let bd = Infinity;
      centers.forEach((c, i) => {
        const wob = Math.sin(x * 0.03 + i) * 12 + Math.cos(z * 0.035 - i) * 12;
        const d = (Math.hypot(x - c.x, z - c.z) + wob) / c.w;
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      regionMap[cz * N + cx] = best;
    }
  }
  return {
    regionMap,
    regionIds: ids,
    heights: new Float32Array(1),
    water: new Uint8Array(1),
    nodes: [],
    pois: [
      { id: 'poi_beacon_1', def: 'beacon', x: -110, z: 120, region: 'pinewood_forest', rot: 0 },
      { id: 'poi_cache_1', def: 'supply_cache', x: 40, z: 30, region: 'crash_valley', rot: 0 },
      { id: 'poi_camp_1', def: 'survivor_camp', x: -90, z: 90, region: 'pinewood_forest', rot: 0 },
      { id: 'poi_ruin_1', def: 'alien_ruin', x: 160, z: -60, region: 'alien_ruins', rot: 0 },
    ],
    props: [],
  };
}

// ------------------------------------------------------------------ seeding

export function seedGame(game: Game, opts: { tier?: number } = {}): void {
  const st = game.state;
  const s = game.sys as Any;
  const data = game.data;
  const tier = opts.tier ?? 2;
  st.colony.tier = tier;
  st.colony.radius = data.tier(tier).colonyRadius;
  st.colony.name = 'New Hope';
  st.resources.amounts = { wood: 842, stone: 366, fiber: 128, food: 212, water: 158, iron: 74, copper: 22, coal: 31, steel: 12, crystal: 4 };
  st.resources.lifetime = { ...st.resources.amounts };
  for (const k of Object.keys(st.resources.amounts)) st.resources.lifetime[k] += 200;
  st.liveops.nova = 1250;
  st.research.points = 140;
  st.research.completed = ['tier_reinforced', 'sharper_tools', 'turret_basics', 'greenhouses', 'recruiting'].slice(0, tier + 2);
  st.world.regionsUnlocked = ['crash_valley', 'pinewood_forest', ...(tier >= 1 ? ['red_desert'] : []), ...(tier >= 2 ? ['crystal_canyon'] : [])];
  st.world.regionsDiscovered = ['crash_valley', 'pinewood_forest'];
  st.world.beacons = ['poi_beacon_1'];
  st.world.pois = { poi_beacon_1: { discovered: true, looted: false, lootedAt: 0 }, poi_cache_1: { discovered: true, looted: false, lootedAt: 0 }, poi_camp_1: { discovered: true, looted: false, lootedAt: 0 } };
  st.time.dayTime = 0.43;
  st.time.day = 3;
  st.player.items = { survival_tool: 1, stone_axe: 1, flare_pistol: 1, makeshift_rifle: 1, small_backpack: 1, fiber_vest: 1, bandage: 3, supply_crate: 2 };
  st.player.equip = { tool: 'stone_axe', weapon: 'flare_pistol', backpack: 'small_backpack' };
  st.player.backpack = { wood: 24, stone: 11 };
  st.player.hp = 72;
  st.player.vehicles = [];
  st.stats = { ...st.stats, kills: 42, wavesWon: 3, gathered: 1880, online: 5420 };
  st.liveops.season.xp = 1180;
  st.liveops.daily = { streak: 2, lastClaim: null };
  st.liveops.freeCrateAt = 0;

  // buildings
  const id = (def: string, x: number, z: number, rot = 0, t = 0): BuildingInstance => {
    const d = data.building(def)!;
    const hp = d.hp * (d.piece ? data.tier(t).hpMult : 1);
    return { id: st.buildings.nextId++, def, x, z, rot: rot as 0, level: 1, tier: d.piece ? t : tier, hp: hp * 0.88, maxHp: hp, status: 'active', progress: 1, workers: [], recipe: null, craft: 0, eff: 1 };
  };
  st.buildings.list = [];
  const c = CENTER_CELL;
  const core = id('command_center', c - 1, c - 1);
  st.buildings.list.push(core);
  st.colony.coreId = core.id;
  const add = (def: string, dx: number, dz: number, rot = 0, t = 0) => {
    const b = id(def, c + dx, c + dz, rot, t);
    st.buildings.list.push(b);
    return b;
  };
  add('shelter', 4, -2);
  add('shelter', 4, 1);
  add('campfire', -4, 2);
  add('storage_crate', -5, -3);
  const log = add('logging_camp', -7, 4);
  const quarry = add('quarry', 6, 5);
  add('berry_patch', -8, -5);
  add('rain_collector', 2, 5);
  add('workbench', 1, -6);
  add('research_desk', 3, -6);
  add('spin_wheel', -3, 6);
  add('scrap_turret', 8, -2);
  add('scrap_turret', -8, 0);
  const ensure = (idd: string) => data.building(idd);
  if (ensure('solar_panel')) {
    add('solar_panel', 7, -6);
    add('solar_panel', 8, -6);
  }
  // a roofed room of walls for the room-upgrade preview
  for (let i = 0; i < 6; i++) {
    add('wall', -3 + i, -9, 0, i < 3 ? 0 : Math.min(1, tier));
    add('wall', -3 + i, -5, 0, 0);
  }
  for (let j = 0; j < 3; j++) {
    add('wall', -3, -8 + j, 0, 0);
    add('wall', 2, -8 + j, 0, 0);
  }
  add('door', 0, -5, 0, 0);
  (log as BuildingInstance).status = 'active';
  (quarry as BuildingInstance).hp = quarry.maxHp * 0.3;

  // colonists
  st.colonists.list = [];
  const crew: [string, Colonist['rarity']][] = [
    ['Ava Reyes', 'rare'],
    ['Kai Tanaka', 'common'],
    ['Mara Okafor', 'epic'],
    ['Theo Moreau', 'common'],
    ['Nia Quinn', 'legendary'],
  ];
  for (const [n, r] of crew) st.colonists.list.push(mkColonist(game, r, n));
  s.colonists.assign(st.colonists.list[0].id, log.id);
  s.colonists.assign(st.colonists.list[1].id, quarry.id);
  st.colonists.candidates = [mkCand(game, 'common'), mkCand(game, 'rare'), mkCand(game, 'epic')];
  st.colonists.refreshAt = game.now() + 83 * 60 * 1000;

  st.crafting.queue = [
    { id: 1, recipe: 'r_makeshift_rifle', remaining: 55, total: 80 },
    { id: 2, recipe: 'r_stone_axe', remaining: 50, total: 50 },
  ];
  st.crafting.nextJobId = 3;

  // missions
  st.missions.active = ['m08_turret', 's_farm', 's_water', 'd_gather_wood', 'd_kill', 'd_build'];
  st.missions.completed = ['m01_wood', 'm02_shelter', 'm03_campfire', 'm04_storage', 'm05_rescue', 'm06_logging', 'm07_assign'];
  st.missions.progress = { m08_turret: 1, s_farm: 1, s_water: 0, d_gather_wood: 146, d_kill: 4, d_build: 10 };
  st.missions.daily = ['d_gather_wood', 'd_kill', 'd_build'];

  game.derived.buildingsVersion++;
  s.economy.recompute();
  game.state.liveops.boosts = [{ id: 'b1', kind: 'production', mult: 2, until: game.now() + 9 * 60 * 1000 + 42000 }];
}

// ------------------------------------------------------------------ scenes

export function installPreview(ui: UI, game: Game, ctx: UiCtx): void {
  extraContent(game);
  let patched = false;
  const patch = () => {
    if (patched) return;
    patched = true;
    patchSystems(game);
  };
  patch();
  const api = {
    ui,
    game,
    seed(opts?: { tier?: number }) {
      patch();
      seedGame(game, opts);
    },
    open(panel: string, arg?: unknown) {
      game.bus.emit('ui:open', { panel, arg });
    },
    closeAll() {
      (ui as unknown as { panels: { closeAll(): void } }).panels.closeAll();
      ctx.build.cancel();
    },
    /** Visual scenes for screenshots. */
    scene(name: string) {
      patch();
      const st = game.state;
      switch (name) {
        case 'attack':
          st.combat.phase = 'warning';
          st.combat.nextAt = st.playTime + 98;
          break;
        case 'fight':
          st.combat.phase = 'attack';
          st.combat.aliens = Array.from({ length: 7 }, (_, i) => ({ id: i, def: 'crawler', x: 0, z: 0, y: 0, rot: 0, hp: 10, maxHp: 30, state: 'moving', target: null, cd: 0, slowT: 0, slow: 0, spawnT: 0, t: 0 }));
          break;
        case 'victory':
          st.combat.pendingReward = { resources: { wood: 120, stone: 80, fiber: 40 }, rp: 20, nova: 5, xp: 50 };
          st.combat.phase = 'victory';
          game.bus.emit('combat:ended', { wave: 3, kills: 18, reward: st.combat.pendingReward });
          break;
        case 'welcome': {
          const summary = { seconds: 16320, away: 16320, gains: { wood: 4250, stone: 2100, fiber: 880, food: 960, water: 1400 }, rp: 64 };
          game.pendingOffline = summary;
          game.bus.emit('offline:ready', { seconds: summary.seconds, gains: summary.gains, rp: summary.rp });
          break;
        }
        case 'tierup':
          game.bus.emit('colony:tierUp', { tier: 3 });
          break;
        case 'toasts':
          game.toast('Research complete: Sharper Tools', 'success', '🔬');
          game.toast('Colonist Ava joined your colony!', 'reward', '🧑‍🚀');
          game.toast('Backpack full! Walk back to unload.', 'warning', '🎒');
          break;
        case 'interact':
          (game.sys.player as Any).interaction = () => ({ kind: 'gather', label: 'Chop', icon: '🪓', target: 1, x: 0, z: 0 });
          break;
        case 'hint':
          (game.sys.tutorial as Any).guide = () => ({ text: 'Open the Build menu and place a Lean-to Shelter.', world: null, ui: '[data-build="shelter"]' });
          break;
        case 'clear':
          (game.sys.tutorial as Any).guide = () => null;
          (game.sys.player as Any).interaction = () => null;
          st.combat.phase = 'peace';
          st.combat.nextAt = Infinity;
          break;
        case 'edge':
          (game.sys.tutorial as Any).guide = () => ({ text: 'Follow the marker to the survivor camp.', world: { x: 60, z: -80 }, ui: null });
          break;
      }
    },
    build(defId: string) {
      ctx.build.start(defId);
    },
    gain(id: string, n: number) {
      game.sys.economy.add(id, n, 'gather', game.state.player.x + 2, game.state.player.z + 2);
    },
  };
  (window as unknown as Record<string, unknown>).uiDev = api;
  if (/[?&]uidev=seed/.test(location.search)) api.seed();
}
