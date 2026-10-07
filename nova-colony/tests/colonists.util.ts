/**
 * Test helpers for the colonist system. In this worktree the construction/world systems may be stubs, so
 * tests push buildings straight into `state.buildings.list` and stub world data on the game instance.
 */
import { Game } from '../src/core/Game';
import { createDataRegistry, defaultData } from '../src/data';
import type { BuildingDef, TraitDef } from '../src/data/schema';
import type { BuildingInstance, Colonist } from '../src/core/state';
import type { Rarity } from '../src/data/schema';

const base = { description: '', icon: '?', unlockTier: 0, cost: {}, buildTime: 1, maxLevel: 1, solid: true } as const;

/** Extra content used by tests (the seed data has no guard/cook/medical/recruit buildings yet). */
export const TEST_BUILDINGS: BuildingDef[] = [
  { ...base, id: 'recruit_hall', name: 'Recruit Hall', category: 'utility', size: [2, 2], hp: 100, model: 'bunkhouse', recruit: true },
  {
    ...base,
    id: 'guard_post',
    name: 'Guard Post',
    category: 'defense',
    size: [2, 2],
    hp: 200,
    model: 'guard_tower',
    workers: { slots: 2, job: 'guard', required: false },
    turret: { range: 8, damage: 5, fireRate: 1, projectile: 'bullet', mannedBy: 'guard' },
  },
  {
    ...base,
    id: 'kitchen',
    name: 'Kitchen',
    category: 'food',
    size: [2, 2],
    hp: 100,
    model: 'kitchen',
    workers: { slots: 1, job: 'cook', required: true },
    produces: { food: 4 },
    feeds: true,
  },
  { ...base, id: 'med_bay', name: 'Med Bay', category: 'utility', size: [2, 2], hp: 100, model: 'med_bay', medical: 1 },
  { ...base, id: 'bench', name: 'Bench', category: 'decor', size: [1, 1], hp: 50, model: 'bench', comfort: 2, entertainment: 2, solid: false },
  {
    ...base,
    id: 'big_bunk',
    name: 'Big Bunkhouse',
    category: 'housing',
    size: [3, 2],
    hp: 100,
    model: 'bunkhouse',
    housing: 6,
    maxLevel: 3,
    levelEffect: 0.5,
  },
];

export const TEST_TRAITS: TraitDef[] = [
  { id: 'grumpy', name: 'Grumpy', description: 'Test trait with a negative productivity.', productivity: -0.9 },
  { id: 'plain', name: 'Plain', description: 'No effect.' },
];

export interface Harness {
  game: Game;
  clock: { now: number };
  /** Advance `seconds` of simulated time in steps of `dt`. */
  run(seconds: number, dt?: number): void;
}

export function makeGame(opts: { seed?: number; start?: boolean } = {}): Harness {
  const clock = { now: 1_700_000_000_000 };
  const d = defaultData();
  const data = createDataRegistry({ ...d, buildings: [...d.buildings, ...TEST_BUILDINGS], traits: [...d.traits, ...TEST_TRAITS] });
  const game = new Game({ seed: opts.seed ?? 4242, clock: () => clock.now, data });
  if (opts.start !== false) {
    game.start();
    // These tests control the colony layout themselves: drop the auto-placed core and the starter kit.
    game.state.buildings.list.length = 0;
    game.state.colony.coreId = null;
    game.state.resources.amounts = {};
    syncGrid(game);
  }
  return {
    game,
    clock,
    run(seconds, dt = 0.1) {
      const n = Math.round(seconds / dt);
      for (let i = 0; i < n; i++) {
        clock.now += dt * 1000;
        game.update(dt);
      }
    },
  };
}

/** Push a building straight into state (construction is a stub in this worktree). */
export function addBuilding(game: Game, defId: string, cx: number, cz: number, over: Partial<BuildingInstance> = {}): BuildingInstance {
  const def = game.data.building(defId);
  if (!def) throw new Error(`unknown building ${defId}`);
  const b: BuildingInstance = {
    id: game.state.buildings.nextId++,
    def: defId,
    x: cx,
    z: cz,
    rot: 0,
    level: 1,
    tier: 0,
    hp: def.hp,
    maxHp: def.hp,
    status: 'active',
    progress: 1,
    workers: [],
    recipe: null,
    craft: 0,
    eff: 1,
    ...over,
  };
  if (over.status === 'building' && over.progress === undefined) b.progress = 0;
  game.state.buildings.list.push(b);
  syncGrid(game);
  return b;
}

/** Buildings pushed straight into state must be registered with the construction grid. */
function syncGrid(game: Game): void {
  const bs = game.sys.buildings as unknown as { rebuild(): void; recomputeRooms(): void };
  bs.rebuild();
  bs.recomputeRooms();
  game.sys.economy.markDirty();
  game.derived.buildingsVersion++;
}

/** Place the command center near the origin and register it as the core. */
export function addCore(game: Game): BuildingInstance {
  const existing = game.sys.buildings.core();
  if (existing) return existing;
  const b = addBuilding(game, 'command_center', 127, 127);
  game.state.colony.coreId = b.id;
  syncGrid(game);
  return b;
}

export function removeBuilding(game: Game, b: BuildingInstance): void {
  const i = game.state.buildings.list.indexOf(b);
  if (i >= 0) game.state.buildings.list.splice(i, 1);
  syncGrid(game);
  game.bus.emit('building:removed', { id: b.id, def: b.def });
}

/** Generate + add a colonist with optional overrides (applied before add so they stick). */
export function addColonist(game: Game, rarity: Rarity = 'common', over: Partial<Colonist> = {}, x?: number, z?: number): Colonist {
  const c = Object.assign(game.sys.colonists.generate(rarity), over);
  game.sys.colonists.add(c, x, z);
  return c;
}

export function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

/**
 * Replace the generated world with a hand-placed node list. The real world/player/event systems read the full
 * generated map, so they are paused for these colonist-focused tests.
 */
export function fakeNodes(game: Game, nodes: unknown[]): void {
  (game.sys.world as unknown as { gen: unknown }).gen = { nodes };
  game.sys.world.update = () => {};
  game.sys.player.update = () => {};
  game.sys.worldEvents.update = () => {};
}
