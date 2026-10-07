/**
 * Shared helpers for combat tests: deterministic game, direct building placement (bypassing the
 * construction system so tests work whether or not it is implemented), damage patching, stepping.
 */
import { Game } from '../src/core/Game';
import { createDataRegistry, defaultData, type GameData } from '../src/data';
import { createMockServices } from '../src/platform/mock';
import type { BuildingInstance } from '../src/core/state';
import type { AlienDef, BuildingDef } from '../src/data/schema';
import type { GameEvents } from '../src/core/events';

export const CORE_CELL = 127; // 3x3 core centered on the origin cell (128)

export interface TestGame {
  game: Game;
  /** Simulate `seconds` in fixed `dt` steps; stops early when `until()` is true. Returns time stepped. */
  step(seconds: number, until?: () => boolean, dt?: number): number;
  /** Record every emission of an event type. */
  record<K extends keyof GameEvents>(type: K): GameEvents[K][];
  /** Ids/amounts passed to BuildingSystem.damage (after shields). */
  damageLog: { id: number; amount: number }[];
  core: BuildingInstance;
}

/** Extra content used by tests (flyer, AA turret, shield generator, railgun, drone pad). */
export const TEST_ALIENS: AlienDef[] = [
  { id: 't_flyer', name: 'Test Flyer', description: '', model: 'flyer', color: '#fff', scale: 0.8, hp: 40, speed: 1.5, damage: 4, attackRate: 1, range: 0.8, flying: true, prefers: 'core', drop: { fiber: 1 } },
  { id: 't_brute', name: 'Test Brute', description: '', model: 'brute', color: '#fff', scale: 1.4, hp: 200, speed: 0.8, damage: 20, attackRate: 0.8, range: 0.8, prefers: 'wall', drop: { stone: 4 } },
  { id: 't_queen', name: 'Test Queen', description: '', model: 'queen', color: '#fff', scale: 1.6, hp: 300, speed: 0.6, damage: 10, attackRate: 0.5, range: 0.8, prefers: 'any', spawns: { alien: 'crawler', every: 2, count: 2 }, drop: { biomass: 5 } },
  { id: 't_burrower', name: 'Test Burrower', description: '', model: 'burrower', color: '#fff', scale: 0.8, hp: 30, speed: 1.2, damage: 5, attackRate: 1, range: 0.7, burrow: true, prefers: 'any', drop: { stone: 1 } },
];

export const TEST_BUILDINGS: BuildingDef[] = [
  {
    id: 't_aa', name: 'Test AA', description: '', icon: '', category: 'defense', size: [1, 1], unlockTier: 0, cost: {}, buildTime: 1, hp: 300, maxLevel: 1, solid: true, model: 'turret_aa',
    turret: { range: 8, damage: 20, fireRate: 2, projectile: 'missile', antiAir: true, airOnly: true },
  },
  {
    id: 't_shield', name: 'Test Shield', description: '', icon: '', category: 'utility', size: [1, 1], unlockTier: 0, cost: {}, buildTime: 1, hp: 300, maxLevel: 1, solid: true, model: 'shield_generator',
    shield: { radius: 6, capacity: 100, regen: 5 },
  },
  {
    id: 't_rail', name: 'Test Rail', description: '', icon: '', category: 'defense', size: [1, 1], unlockTier: 0, cost: {}, buildTime: 1, hp: 300, maxLevel: 1, solid: true, model: 'turret_rail',
    turret: { range: 20, damage: 500, fireRate: 0.5, projectile: 'rail', pierce: 4 },
  },
  {
    id: 't_drone', name: 'Test Drone Pad', description: '', icon: '', category: 'defense', size: [1, 1], unlockTier: 0, cost: {}, buildTime: 1, hp: 300, maxLevel: 1, solid: true, model: 'drone_pad',
    turret: { range: 12, damage: 15, fireRate: 1, projectile: 'drone' },
  },
  {
    id: 't_cannon', name: 'Test Cannon', description: '', icon: '', category: 'defense', size: [2, 2], unlockTier: 0, cost: {}, buildTime: 1, hp: 500, maxLevel: 1, solid: true, model: 'turret_cannon',
    turret: { range: 10, damage: 40, fireRate: 0.5, projectile: 'cannon', splash: 1.5 },
  },
];

export function testData(extra: Partial<GameData> = {}) {
  const base = defaultData();
  return createDataRegistry({
    ...base,
    aliens: [...base.aliens, ...TEST_ALIENS],
    buildings: [...base.buildings, ...TEST_BUILDINGS],
    ...extra,
  });
}

let nextTestId = 10_000;

/** Push a building straight into state (min-corner cell x/z), active and at full HP. */
export function addBuilding(game: Game, def: string, x: number, z: number, patch: Partial<BuildingInstance> = {}): BuildingInstance {
  const d = game.data.building(def);
  if (!d) throw new Error(`unknown building ${def}`);
  const b: BuildingInstance = {
    id: nextTestId++, def, x, z, rot: 0, level: 1, tier: 0, hp: d.hp, maxHp: d.hp, status: 'active', progress: 1, workers: [], recipe: null, craft: 0, eff: 1,
    ...patch,
  };
  game.state.buildings.list.push(b);
  game.bus.emit('building:changed', {});
  return b;
}

/** World-space center of a 1x1 cell. */
export function cellWorld(c: number): number {
  return (c + 0.5) * 2 - 256;
}

/**
 * New deterministic game with a core at the origin. BuildingSystem.damage is patched to apply HP and
 * mark buildings 'damaged' at 0 (what the construction system does), logging every call.
 */
export function makeGame(opts: { seed?: number; data?: ReturnType<typeof createDataRegistry>; armed?: boolean } = {}): TestGame {
  let now = 1_700_000_000_000;
  const game = new Game({ seed: opts.seed ?? 7, services: createMockServices(), clock: () => now, data: opts.data ?? testData() });
  game.start();
  const st = game.state;
  let core = st.colony.coreId != null ? st.buildings.list.find((b) => b.id === st.colony.coreId) : undefined;
  if (!core) {
    core = addBuilding(game, 'command_center', CORE_CELL, CORE_CELL);
    st.colony.coreId = core.id;
  }
  // player parked far away and unarmed unless requested
  st.player.x = 150;
  st.player.z = 150;
  if (opts.armed) st.player.equip.weapon = 'flare_pistol';
  else delete st.player.equip.weapon;

  const damageLog: { id: number; amount: number }[] = [];
  game.sys.buildings.damage = (id: number, amount: number) => {
    damageLog.push({ id, amount });
    const b = st.buildings.list.find((x) => x.id === id);
    if (!b || b.status === 'damaged') return;
    b.hp = Math.max(0, b.hp - amount);
    if (b.hp <= 0) {
      b.status = 'damaged';
      game.bus.emit('building:broken', { id: b.id, def: b.def });
    }
  };

  const step = (seconds: number, until?: () => boolean, dt = 1 / 30) => {
    let t = 0;
    while (t < seconds - 1e-9) {
      if (until && until()) break;
      now += dt * 1000;
      game.update(dt);
      t += dt;
    }
    return t;
  };

  const record = <K extends keyof GameEvents>(type: K) => {
    const out: GameEvents[K][] = [];
    game.bus.on(type, (p) => out.push(p));
    return out;
  };

  return { game, step, record, damageLog, core };
}
