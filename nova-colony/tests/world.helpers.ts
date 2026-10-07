/** Shared helpers for the world/player/event tests (not a test file). */
import { Game } from '../src/core/Game';
import { createMockServices } from '../src/platform/mock';
import { CELL, cellOf } from '../src/core/constants';

export interface Rig {
  game: Game;
  /** Advance the simulation by `seconds` in `dt` steps (also advances the injectable wall clock). */
  step(seconds: number, dt?: number): void;
}

export function makeGame(seed = 1234, opts: { state?: Game['state'] } = {}): Rig {
  let now = 1_700_000_000_000;
  const game = new Game({ seed, state: opts.state, services: createMockServices(), clock: () => now });
  game.start();
  return {
    game,
    step(seconds, dt = 0.05) {
      const n = Math.round(seconds / dt);
      for (let i = 0; i < n; i++) {
        now += dt * 1000;
        game.update(dt);
      }
    },
  };
}

/** A flat, node-free, dry, unlocked spot at least `clear` units from anything solid (deterministic scan). */
export function findClearSpot(game: Game, clear = 9, minFromOrigin = 70): { x: number; z: number } {
  const w = game.sys.world;
  for (let r = minFromOrigin; r < 200; r += 6) {
    for (let a = 0; a < 24; a++) {
      const x = Math.cos((a / 24) * Math.PI * 2) * r;
      const z = Math.sin((a / 24) * Math.PI * 2) * r;
      if (!w.walkable(x, z) || w.solidNear(x, z, clear)) continue;
      let wet = false;
      for (let dz = -6; dz <= 6 && !wet; dz++) for (let dx = -6; dx <= 6; dx++) if (w.isWaterCell(cellOf(x) + dx, cellOf(z) + dz)) wet = true;
      if (wet) continue;
      // snap to a cell centre so wall cells line up predictably
      return { x: (cellOf(x) + 0.5) * CELL - 256, z: (cellOf(z) + 0.5) * CELL - 256 };
    }
  }
  throw new Error('no clear spot');
}

/** Replace the building-occupancy queries with a plain set of blocked cells ("cx,cz"). */
export function stubWalls(game: Game, cells: Set<string>): void {
  const b = game.sys.buildings as unknown as { blocked: (cx: number, cz: number) => boolean; at: (cx: number, cz: number) => unknown };
  b.blocked = (cx, cz) => cells.has(`${cx},${cz}`);
  b.at = (cx, cz) => (cells.has(`${cx},${cz}`) ? { id: 9999 } : undefined);
}

export function collectEvents(game: Game, type: string): any[] {
  const out: any[] = [];
  game.bus.on(type as never, ((p: unknown) => out.push(p)) as never);
  return out;
}
