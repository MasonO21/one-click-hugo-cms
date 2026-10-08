/** Shared fixtures for the expedition tests (not a test file). */
import { Game } from '../src/core/Game';
import { createMockServices } from '../src/platform/mock';
import type { DataRegistry } from '../src/data';
import type { Colonist, GameState, Id } from '../src/core/state';
import type { ProfessionId } from '../src/data/schema';
import { CENTER_CELL } from '../src/core/constants';
import { deserializeState, serializeState } from '../src/core/state';
import { migrateState } from '../src/platform/saveMigrate';

export const T0 = Date.UTC(2026, 9, 8, 9, 0);
export const MIN = 60_000;
export const HOUR = 3_600_000;

export interface Colony {
  game: Game;
  clock: { now: number };
  /** Advance the wall clock by `ms` and run the sim for `simSeconds` (default 2 s, enough for the per-second checks). */
  wait(ms: number, simSeconds?: number): void;
  /** Step the full simulation for `seconds` (clock moves along). */
  step(seconds: number, dt?: number): void;
}

export interface ColonyOpts {
  seed?: number;
  tier?: number;
  /** Specialties of the colonists to add (default: three gatherers and three miners). */
  crew?: ProfessionId[];
  /** Build the Radio Tower (default true). */
  tower?: boolean;
  /** Discover every region (default true). */
  regions?: boolean;
  data?: DataRegistry;
  state?: GameState;
  at?: number;
}

/** Find a free spot near the core and place a building there instantly (free). */
export function placeNear(game: Game, def: string): Id {
  const bs = game.sys.buildings;
  for (let r = 4; r < 30; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (const dz of [-r, r]) {
        const id = bs.place(def, CENTER_CELL + dx, CENTER_CELL + dz, 0, { free: true, instant: true, quiet: true });
        if (id != null) return id;
      }
    }
  }
  throw new Error(`no room for ${def}: ${bs.lastReason}`);
}

/** A real, started colony at `tier` with a Radio Tower and a crew (every region discovered, research done). */
export function makeColony(o: ColonyOpts = {}): Colony {
  const clock = { now: o.at ?? T0 };
  const game = new Game({ seed: o.seed ?? 4321, services: createMockServices(), clock: () => clock.now, data: o.data, state: o.state });
  game.start();
  const st = game.state;
  if (!o.state) {
    st.colony.tier = o.tier ?? 2;
    st.colony.radius = game.data.tier(st.colony.tier).colonyRadius;
    for (const r of game.data.research) if (!st.research.completed.includes(r.id)) st.research.completed.push(r.id);
    if (o.regions !== false) {
      for (const b of game.data.biomes) {
        if (!st.world.regionsUnlocked.includes(b.id)) st.world.regionsUnlocked.push(b.id);
        if (!st.world.regionsDiscovered.includes(b.id)) st.world.regionsDiscovered.push(b.id);
      }
    }
    if (o.tower !== false) placeNear(game, 'radio_tower');
    for (const p of o.crew ?? ['gatherer', 'gatherer', 'gatherer', 'miner', 'miner', 'miner']) {
      const id = game.sys.colonists.grant('common');
      const c = game.sys.colonists.get(id)!;
      c.specialty = p;
      c.skill = 2;
    }
    game.sys.economy.recompute();
  }
  const rig: Colony = {
    game,
    clock,
    step(seconds, dt = 0.25) {
      const n = Math.round(seconds / dt);
      for (let i = 0; i < n; i++) {
        clock.now += dt * 1000;
        game.update(dt);
      }
    },
    wait(ms, simSeconds = 2) {
      clock.now += ms;
      rig.step(simSeconds);
    },
  };
  return rig;
}

export function crew(game: Game, specialty?: string): Colonist[] {
  return game.state.colonists.list.filter((c) => !specialty || c.specialty === specialty);
}

export function collect<T = unknown>(game: Game, type: string): T[] {
  const out: T[] = [];
  game.bus.on(type as never, ((p: T) => out.push(p)) as never);
  return out;
}

/** Round-trip a game's state through the save pipeline (serialize → parse → migrate) and boot a new game from it. */
export function reload(rig: Colony, atMs?: number): Colony {
  const state = migrateState(deserializeState(serializeState(rig.game.state)));
  return makeColony({ state, at: atMs ?? rig.clock.now, data: rig.game.data });
}
