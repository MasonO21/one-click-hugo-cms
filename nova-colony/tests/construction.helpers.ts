/**
 * Shared helpers for construction tests. Isolates the BuildingSystem from other systems' per-frame
 * behaviour (and from world nodes / modifiers) so assertions stay exact before and after integration.
 */
import { Game } from '../src/core/Game';
import { CENTER_CELL } from '../src/core/constants';
import { createDataRegistry, defaultData } from '../src/data';
import type { BalanceDef, BuildingDef } from '../src/data/schema';
import type { Colonist, Id } from '../src/core/state';
import { createMockServices } from '../src/platform/mock';
import type { Systems } from '../src/core/Game';

/** The cell containing the origin (center of the core). */
export const C = CENTER_CELL;

export interface EventRecord {
  type: string;
  payload: any;
}

export interface TestGameOptions {
  extraBuildings?: BuildingDef[];
  balance?: Partial<BalanceDef>;
  resources?: Record<string, number>;
  /** Keep other systems' update() running (default false). */
  live?: boolean;
}

export function makeGame(opts: TestGameOptions = {}) {
  const base = defaultData();
  const data = createDataRegistry({
    ...base,
    buildings: [...base.buildings, ...(opts.extraBuildings ?? [])],
    balance: { ...base.balance, ...(opts.balance ?? {}) },
  });
  let now = 1_700_000_000_000;
  const game = new Game({ seed: 7, data, services: createMockServices(), clock: () => (now += 16) });
  game.start();
  // Start from just the core: other systems (e.g. live-ops' free Lucky Wheel) may place starter buildings.
  const st = game.state;
  st.buildings.list = st.buildings.list.filter((x) => x.id === st.colony.coreId);
  st.stats.built = 0;
  (game.sys.buildings as unknown as { rebuild(): void }).rebuild();
  isolate(game, opts.live);
  game.state.resources.amounts = { ...(opts.resources ?? {}) };
  const events: EventRecord[] = [];
  game.bus.onAny((type, payload) => events.push({ type, payload }));
  return { game, b: game.sys.buildings, events };
}

/** Neutral world + modifiers; optionally freeze every other system's update(). */
export function isolate(game: Game, live = false): void {
  game.sys.world.walkable = () => true;
  game.sys.world.clearNodesInRect = () => ({});
  game.sys.economy.modifier = () => 1;
  if (live) return;
  for (const key of Object.keys(game.sys) as (keyof Systems)[]) {
    if (key !== 'buildings') game.sys[key].update = () => {};
  }
}

/** Advance the simulation by `seconds` in fixed steps. */
export function step(game: Game, seconds: number, dt = 0.1): void {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) game.update(dt);
}

export function count(events: EventRecord[], type: string): number {
  return events.filter((e) => e.type === type).length;
}

export function last(events: EventRecord[], type: string): any {
  for (let i = events.length - 1; i >= 0; i--) if (events[i].type === type) return events[i].payload;
  return undefined;
}

/** Add a minimal colonist working at / sleeping in a building. */
export function addColonist(game: Game, workplace: Id | null, bed: Id | null = null): Colonist {
  const st = game.state.colonists;
  const c: Colonist = {
    id: st.nextId++,
    name: 'Test',
    bio: '',
    rarity: 'common',
    appearance: { skin: 0, hair: 0, hairColor: 0, outfit: 0, height: 1 },
    trait: 'cheerful',
    specialty: 'engineer',
    skill: 1,
    xp: 0,
    happiness: 50,
    workplace,
    bed,
    x: 0,
    z: 0,
    rot: 0,
    activity: 'idle',
    tx: 0,
    tz: 0,
    joinedAt: 0,
  };
  st.list.push(c);
  return c;
}

/** Place a closed square ring of walls with min corner (x0,z0) and outer size n×n, instantly and free. */
export function wallRing(game: Game, x0: number, z0: number, n: number, door?: { x: number; z: number }): Id[] {
  const b = game.sys.buildings;
  const ids: Id[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== 0 && j !== 0 && i !== n - 1 && j !== n - 1) continue;
      const x = x0 + i;
      const z = z0 + j;
      const def = door && door.x === x && door.z === z ? 'door' : 'wall';
      const id = b.place(def, x, z, 0, { free: true, instant: true, tier: 0 });
      if (id == null) throw new Error(`wallRing: ${def} at ${x},${z} failed: ${b.lastReason}`);
      ids.push(id);
    }
  }
  return ids;
}

/** Custom content used across tests. */
export const ENGINEER_BAY: BuildingDef = {
  id: 'test_engineer_bay', name: 'Engineer Bay', description: '', icon: '🛠️', category: 'utility',
  size: [1, 1], unlockTier: 0, cost: { wood: 5 }, buildTime: 1, hp: 100, maxLevel: 1, solid: true, model: 'workbench',
  workers: { slots: 3, job: 'engineer', required: false },
};

export const REPAIR_BAY: BuildingDef = {
  id: 'test_repair_bay', name: 'Repair Bay', description: '', icon: '🔧', category: 'utility',
  size: [1, 1], unlockTier: 0, cost: { wood: 5 }, buildTime: 1, hp: 100, maxLevel: 3, levelEffect: 0.5, solid: true, model: 'repair_bay',
  repair: 10,
};

export const AUTO_BENCH: BuildingDef = {
  id: 'test_auto_bench', name: 'Auto Bench', description: '', icon: '🏭', category: 'production',
  size: [2, 2], unlockTier: 0, cost: { wood: 5 }, buildTime: 1, hp: 100, maxLevel: 1, solid: true, model: 'factory',
  factory: 'workbench',
};

export const LAB_LOCKED: BuildingDef = {
  id: 'test_lab', name: 'Locked Lab', description: '', icon: '🧪', category: 'research',
  size: [1, 1], unlockTier: 0, research: 'tier_stone', cost: { wood: 5 }, buildTime: 1, hp: 100, maxLevel: 1, solid: true, model: 'research_lab',
};

export const ALL_TEST_DEFS = [ENGINEER_BAY, REPAIR_BAY, AUTO_BENCH, LAB_LOCKED];
