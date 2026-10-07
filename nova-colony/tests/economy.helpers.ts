/**
 * Shared fixtures for economy/research/crafting/progression tests.
 * Uses test-only content (t_* ids) + pinned balance so tests don't break when content is re-tuned.
 */
import { Game } from '../src/core/Game';
import { createDataRegistry, defaultData } from '../src/data';
import type { BuildingDef, ItemDef, RecipeDef, ResearchDef, ResourceDef, TierDef } from '../src/data/schema';
import type { BuildingInstance, Colonist } from '../src/core/state';
import type { GameEvents } from '../src/core/events';

export const T0 = 1_700_000_000_000;

const base = (id: string, extra: Partial<BuildingDef>): BuildingDef => ({
  id,
  name: id,
  description: '',
  icon: '🧪',
  category: 'production',
  size: [2, 2],
  unlockTier: 0,
  cost: {},
  buildTime: 1,
  hp: 100,
  maxLevel: 5,
  solid: true,
  model: 'crate',
  ...extra,
});

export const TEST_RESOURCES: ResourceDef[] = [
  { id: 't_ore', name: 'Ore', icon: '⛏️', color: '#888', category: 'intermediate', baseCapacity: 1000, sort: 90, description: '' },
  { id: 't_fuel', name: 'Fuel', icon: '⚫', color: '#222', category: 'intermediate', baseCapacity: 1000, sort: 91, description: '' },
  { id: 't_bar', name: 'Bar', icon: '🔩', color: '#aaa', category: 'intermediate', baseCapacity: 1000, sort: 92, description: '' },
  { id: 't_part', name: 'Part', icon: '⚙️', color: '#ccc', category: 'advanced', baseCapacity: 1000, sort: 93, description: '' },
];

export const TEST_BUILDINGS: BuildingDef[] = [
  base('t_mine', { produces: { t_ore: 6 }, levelEffect: 0.5 }),
  base('t_staffed_mine', { produces: { t_ore: 12 }, workers: { slots: 2, job: 'miner', required: true } }),
  base('t_farm', { produces: { food: 6 }, workers: { slots: 2, job: 'farmer', required: false } }),
  base('t_well', { produces: { water: 6 } }),
  base('t_generator', { power: 10, category: 'power' }),
  base('t_fuel_generator', { power: 20, consumes: { t_fuel: 6 }, category: 'power' }),
  base('t_pump', { produces: { t_fuel: 12 }, power: -10 }),
  base('t_smelter', { consumes: { t_ore: 6, t_fuel: 3 }, produces: { t_bar: 3 } }),
  base('t_lab', { research_rate: 6, workers: { slots: 2, job: 'scientist', required: true }, category: 'research' }),
  base('t_vault', { storage: { t_ore: 100, wood: 50 }, levelEffect: 1, category: 'storage' }),
  base('t_bench', { station: 't_bench', category: 'crafting', maxLevel: 1 }),
  base('t_forge', { station: 't_forge', category: 'crafting', maxLevel: 1 }),
  base('t_assembler', { factory: 't_assembly', power: -10, category: 'production' }),
];

export const TEST_RECIPES: RecipeDef[] = [
  { id: 't_r_part', name: 'Part', category: 'materials', station: 't_bench', inputs: { t_ore: 4 }, outputs: { resources: { t_part: 2 } }, time: 10, unlockTier: 0 },
  { id: 't_r_tool', name: 'Tool', category: 'tools', station: 't_bench', inputs: { t_bar: 1 }, outputs: { items: { t_tool: 1 } }, time: 20, unlockTier: 0 },
  { id: 't_r_ingot', name: 'Ingot', category: 'materials', station: 't_forge', inputs: { t_ore: 2 }, outputs: { resources: { t_bar: 1 } }, time: 5, unlockTier: 0 },
  { id: 't_r_hand', name: 'Hand thing', category: 'utility', station: 'hand', inputs: { t_ore: 1 }, outputs: { items: { t_tool: 1 } }, time: 3, unlockTier: 0 },
  { id: 't_r_upgrade', name: 'Upgrade', category: 'tools', station: 'hand', inputs: {}, itemInputs: { t_tool: 2 }, outputs: { items: { t_super_tool: 1 } }, time: 1, unlockTier: 0 },
  { id: 't_r_secret', name: 'Secret', category: 'tools', station: 'hand', inputs: { t_ore: 1 }, outputs: { items: { t_tool: 1 } }, time: 1, unlockTier: 0, research: 't_res_secret' },
  { id: 't_r_late', name: 'Late', category: 'tools', station: 'hand', inputs: { t_ore: 1 }, outputs: { items: { t_tool: 1 } }, time: 1, unlockTier: 3 },
  { id: 't_r_assemble', name: 'Assemble', category: 'machines', station: 't_assembly', inputs: { t_bar: 2 }, outputs: { resources: { t_part: 1 } }, time: 10, unlockTier: 0 },
  { id: 't_r_assemble_item', name: 'Assemble item', category: 'machines', station: 't_assembly', inputs: { t_ore: 1 }, outputs: { items: { t_tool: 1 } }, time: 10, unlockTier: 0 },
];

export const TEST_ITEMS: ItemDef[] = [
  { id: 't_tool', name: 'Tool', description: '', icon: '🔧', category: 'tool', slot: 'tool', tier: 0, stats: { gatherYield: 0.5, gatherSpeed: 0.1 } },
  { id: 't_super_tool', name: 'Super Tool', description: '', icon: '🔧', category: 'tool', slot: 'tool', tier: 0, stats: { gatherYield: 1 } },
  { id: 't_vest', name: 'Vest', description: '', icon: '🦺', category: 'armor', slot: 'armor', tier: 0, stats: { hp: 50, moveSpeed: 0.1 } },
];

export const TEST_RESEARCH: ResearchDef[] = [
  { id: 't_res_prod', name: 'Prod', description: '', icon: '⚙️', category: 'automation', tier: 0, cost: 10, requires: [], pos: [0, 0], effects: [{ stat: 'production', add: 0.2 }] },
  { id: 't_res_ore', name: 'Ore+', description: '', icon: '⛏️', category: 'automation', tier: 0, cost: 10, requires: ['t_res_prod'], pos: [1, 0], effects: [{ stat: 'production:t_ore', mult: 1.5 }] },
  { id: 't_res_storage', name: 'Storage', description: '', icon: '📦', category: 'construction', tier: 0, cost: 5, resources: { wood: 10 }, requires: [], pos: [0, 1], effects: [{ stat: 'storage', mult: 2 }] },
  { id: 't_res_secret', name: 'Secret', description: '', icon: '❓', category: 'exploration', tier: 0, cost: 5, requires: [], pos: [0, 2] },
  { id: 't_res_late', name: 'Late', description: '', icon: '⏳', category: 'exploration', tier: 2, cost: 5, requires: [], pos: [0, 3] },
  { id: 't_res_craft', name: 'Craft', description: '', icon: '🛠️', category: 'automation', tier: 0, cost: 5, requires: [], pos: [0, 4], effects: [{ stat: 'craftSpeed', add: 1 }] },
  { id: 't_tier1', name: 'Tier One', description: '', icon: '🪵', category: 'construction', tier: 0, cost: 5, requires: [], pos: [0, 5] },
];

/** Three test tiers so tier-up math is independent of real balance. */
export const TEST_TIERS: TierDef[] = [0, 1, 2].map((i) => ({
  index: i,
  id: (['wood', 'reinforced', 'titanium'] as const)[i],
  name: ['Wood', 'Reinforced Wood', 'Titanium'][i],
  description: `Tier ${i}.`,
  color: '#fff',
  accent: '#fff',
  glow: 0,
  colonyRadius: 10 + i * 5,
  hpMult: 1,
  pieceCost: { wood: 1 },
  upgradeCost: i === 0 ? {} : { wood: 50 * i, stone: 20 * i },
  research: i === 0 ? null : i === 1 ? 't_tier1' : 't_res_secret',
  invasionInterval: 900,
}));

export function makeData(opts: { tiers?: boolean } = {}) {
  const d = defaultData();
  return createDataRegistry({
    ...d,
    resources: [...d.resources, ...TEST_RESOURCES],
    buildings: [...d.buildings, ...TEST_BUILDINGS],
    recipes: [...d.recipes, ...TEST_RECIPES],
    items: [...d.items, ...TEST_ITEMS],
    research: [...d.research, ...TEST_RESEARCH],
    tiers: opts.tiers ? TEST_TIERS : d.tiers,
    vip: { ...d.vip, productionBonus: 0.1, offlineHoursBonus: 4 },
    balance: { ...d.balance, offlineHours: 8, offlineEfficiency: 1, foodPerColonistPerMin: 0.5, waterPerColonistPerMin: 0.5, playerHp: 100 },
  });
}

export interface TestGame {
  game: Game;
  clock: { now: number };
}

/**
 * Started game with an empty colony (no buildings, colonists or resources) so assertions are exact
 * regardless of what other systems seed on a fresh start.
 */
export function makeGame(opts: { tiers?: boolean } = {}): TestGame {
  const clock = { now: T0 };
  const game = new Game({ seed: 42, clock: () => clock.now, data: makeData(opts) });
  game.start();
  resetColony(game);
  return { game, clock };
}

export function resetColony(game: Game): void {
  const st = game.state;
  st.buildings.list.length = 0;
  st.colony.coreId = null;
  st.colonists.list.length = 0;
  st.resources.amounts = {};
  st.resources.lifetime = {};
  st.crafting.queue.length = 0;
  st.liveops.boosts.length = 0;
  game.derived.happiness.productivity = 1;
  game.sys.economy.recompute();
}

let cellCursor = 20;

export function addBuilding(game: Game, def: string, opts: Partial<BuildingInstance> = {}): BuildingInstance {
  const st = game.state.buildings;
  const d = game.data.building(def);
  if (!d) throw new Error(`unknown building ${def}`);
  cellCursor += 4;
  const b: BuildingInstance = {
    id: st.nextId++,
    def,
    x: 100 + (cellCursor % 60),
    z: 120,
    rot: 0,
    level: 1,
    tier: 0,
    hp: d.hp,
    maxHp: d.hp,
    status: 'active',
    progress: 1,
    workers: [],
    recipe: null,
    craft: 0,
    eff: 1,
    ...opts,
  };
  st.list.push(b);
  game.sys.economy.markDirty();
  return b;
}

export function addColonist(game: Game, opts: Partial<Colonist> = {}): Colonist {
  const st = game.state.colonists;
  const c: Colonist = {
    id: st.nextId++,
    name: 'Test',
    bio: '',
    rarity: 'common',
    appearance: { skin: 0, hair: 0, hairColor: 0, outfit: 0, height: 1 },
    trait: 'cheerful',
    specialty: 'miner',
    skill: 1,
    xp: 0,
    happiness: 60,
    workplace: null,
    bed: null,
    x: 0,
    z: 0,
    rot: 0,
    activity: 'idle',
    tx: 0,
    tz: 0,
    joinedAt: 0,
    ...opts,
  };
  st.list.push(c);
  game.sys.economy.markDirty();
  return c;
}

/** Put colonists to work at a building. */
export function staff(game: Game, b: BuildingInstance, count: number): Colonist[] {
  const out: Colonist[] = [];
  for (let i = 0; i < count; i++) {
    const c = addColonist(game, { workplace: b.id });
    b.workers.push(c.id);
    out.push(c);
  }
  return out;
}

/**
 * Advance only the economy-owned systems (isolated from other agents' systems), keeping playTime and
 * the wall clock in step.
 */
export function stepEconomy(t: TestGame, seconds: number, dt = 0.25): void {
  const { game, clock } = t;
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    clock.now += dt * 1000;
    game.state.playTime += dt;
    game.sys.economy.update(dt);
    game.sys.crafting.update(dt);
    game.sys.research.update(dt);
    game.sys.progression.update(dt);
  }
}

/** Record every emission of an event. */
export function record<K extends keyof GameEvents>(game: Game, type: K): GameEvents[K][] {
  const out: GameEvents[K][] = [];
  game.bus.on(type, (p) => out.push(p));
  return out;
}
