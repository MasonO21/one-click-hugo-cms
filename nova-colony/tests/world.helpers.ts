/** Shared helpers for the world/player/event tests (not a test file). */
import { Game } from '../src/core/Game';
import { createMockServices } from '../src/platform/mock';
import { CELL, cellOf } from '../src/core/constants';
import type { WorldNode } from '../src/sim/world';

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

/**
 * A flat, dry, unlocked spot at least `clear` units from anything solid (deterministic scan). With `bare`, also
 * no resource node of any kind within min(clear, 5) units: bushes and grass are not solid but are gatherable, and
 * the dense content puts some within interaction range of most spots (needed to assert "nothing to interact with").
 */
export function findClearSpot(game: Game, clear = 9, minFromOrigin = 70, bare = false): { x: number; z: number } {
  const w = game.sys.world;
  const near: WorldNode[] = [];
  // a dense forest leaves few spots with a big solid-free disc: scan coarsely first, then finer when bare
  for (const angles of bare ? [24, 96] : [24]) {
    for (let r = minFromOrigin; r < 200; r += 6) {
      for (let a = 0; a < angles; a++) {
        const x = Math.cos((a / angles) * Math.PI * 2) * r;
        const z = Math.sin((a / angles) * Math.PI * 2) * r;
        if (!w.walkable(x, z) || w.solidNear(x, z, clear)) continue;
        if (bare && w.nodesNear(x, z, Math.min(clear, 5), near) > 0) continue;
        let wet = false;
        for (let dz = -6; dz <= 6 && !wet; dz++) for (let dx = -6; dx <= 6; dx++) if (w.isWaterCell(cellOf(x) + dx, cellOf(z) + dz)) wet = true;
        if (wet) continue;
        // snap to a cell centre so wall cells line up predictably
        return { x: (cellOf(x) + 0.5) * CELL - 256, z: (cellOf(z) + 0.5) * CELL - 256 };
      }
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

/**
 * A tree_round with open ground for straight east-bound runs, so movement/gather tests do not depend on how dense
 * the forest happens to be around one seed's first tree. Each lane is relative to the tree: it starts at
 * `(tree.x - back, tree.z + side)` and runs to `tree.x + ahead`; nothing solid may touch the lane (player + node
 * radius), it must be dry, unlocked and clear of the colony, and no gatherable node may sit within 4.5 units of
 * the start (the player auto-gathers anything in range while still accelerating from rest).
 */
export function findOpenTree(game: Game, lanes: { back: number; side: number; ahead: number }[]): WorldNode {
  const w = game.sys.world;
  const near: WorldNode[] = [];
  for (const n of w.gen.nodes) {
    if (n.def !== 'tree_round' || !w.isUnlocked(n.region)) continue;
    let ok = true;
    for (const { back, side, ahead } of lanes) {
      const z = n.z + side;
      const x0 = n.x - back;
      if (w.nodesNear(x0, z, 4.5, near) > 0) ok = false;
      for (let x = x0; ok && x <= n.x + ahead; x += 0.5) {
        if (Math.hypot(x, z) < 12 || !w.walkable(x, z) || !w.isUnlocked(w.regionAt(x, z)) || w.solidNear(x, z, 1.1)) ok = false;
      }
      if (!ok) break;
    }
    if (ok) return n;
  }
  throw new Error('no tree with an open lane');
}
