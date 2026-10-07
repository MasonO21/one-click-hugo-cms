/**
 * Regressions found by the mid/late-game integration QA pass (real content, real systems).
 */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/Game';
import { createMockServices } from '../src/platform/mock';
import { CELL } from '../src/core/constants';
import { planWave } from '../src/sim/combat/waves';
import { threatGroups } from '../src/ui/hud/Threats';

function lateGame(tier: number): Game {
  let now = 1_700_000_000_000;
  const game = new Game({ seed: 77, services: createMockServices(), clock: () => (now += 16) });
  game.start();
  const rich = () => {
    for (const r of game.data.resources) game.state.resources.amounts[r.id] = 1e6;
    game.state.research.points = 1e7;
  };
  for (let t = 0; t < tier; t++) {
    let any = true;
    while (any) {
      any = false;
      for (const d of game.data.research) {
        if (d.tier <= game.state.colony.tier && game.sys.research.status(d.id) === 'available') {
          rich();
          if (game.sys.research.research(d.id)) any = true;
        }
      }
    }
    rich();
    expect(game.sys.progression.tierUp()).toBe(true);
  }
  rich();
  return game;
}

/** Place a building near the core (spiral search), free + instant. */
function placeNear(game: Game, def: string): number {
  const B = game.sys.buildings;
  for (let r = 3; r < 40; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const id = B.place(def, 128 + dx, 128 + dz, 0, { free: true, instant: true });
        if (id != null) return id;
      }
    }
  }
  throw new Error(`no room for ${def}`);
}

describe('QA mid/late: vehicles are crafted once', () => {
  it('refuses a second build of a vehicle that is queued or already owned (materials are never swallowed)', () => {
    const game = lateGame(1);
    if (!game.sys.research.isDone('engine_basics')) game.sys.research.research('engine_basics');
    placeNear(game, 'garage');
    game.update(0.1);
    const c = game.sys.crafting;
    expect(c.canCraft('r_vehicle_atv').ok).toBe(true);
    expect(c.craft('r_vehicle_atv')).not.toBeNull();
    const wood = game.sys.economy.amount('wood');
    expect(c.canCraft('r_vehicle_atv')).toEqual({ ok: false, reason: 'Already being built' });
    expect(c.craft('r_vehicle_atv')).toBeNull();
    expect(game.sys.economy.amount('wood')).toBe(wood);
    for (let i = 0; i < 600 && game.state.crafting.queue.length; i++) game.update(0.25);
    expect(game.state.player.vehicles).toContain('atv');
    expect(c.canCraft('r_vehicle_atv')).toEqual({ ok: false, reason: 'You already own this vehicle' });
  });
});

describe('QA mid/late: invasion spawn ring', () => {
  it('spawns past the turrets’ reach but never beyond the flow field', () => {
    const game = lateGame(2);
    const R = game.state.colony.radius;
    const dist = (p: { x: number; z: number }) => Math.hypot(p.x, p.z) / CELL;
    const base = planWave(game, 0, 0, 0, 0);
    const pushed = planWave(game, 0, 0, 0, 0, R + 9);
    const capped = planWave(game, 0, 0, 0, 0, R + 999);
    const mean = (q: { x: number; z: number }[]) => q.reduce((s, p) => s + dist(p), 0) / q.length;
    expect(mean(base.queue)).toBeLessThan(R + 7.5);
    expect(mean(pushed.queue)).toBeGreaterThan(R + 8);
    expect(mean(capped.queue)).toBeLessThan(R + 12.5);
  });
});

describe('QA mid/late: threat markers group attackers by direction', () => {
  it('buckets aliens into direction sectors, bosses first, then by size', () => {
    const pts = [
      { x: 100, z: 1 },
      { x: 102, z: -2 },
      { x: 98, z: 3 },
      { x: -100, z: 0 },
      { x: 0, z: 100, boss: true },
    ];
    const g = threatGroups(pts, 0, 0);
    expect(g).toHaveLength(3);
    expect(g[0].boss).toBe(true);
    expect(g[1].n).toBe(3);
    expect(g[1].x).toBeCloseTo(100, 0);
    expect(g[2].n).toBe(1);
  });
});

describe('QA mid/late: supply crate', () => {
  it('announces a crate with a short toast (the UI shows the full contents on a reward card)', () => {
    const game = lateGame(5);
    const toasts: string[] = [];
    const grants: string[] = [];
    game.bus.on('ui:toast', (e) => toasts.push(e.text));
    game.bus.on('reward:granted', (e) => grants.push(e.source));
    game.state.liveops.freeCrateAt = 0;
    expect(game.sys.liveops.openFreeCrate(false)).not.toBeNull();
    const t = toasts.find((x) => x.includes('crate'));
    expect(t).toBeTruthy();
    expect(t!.length).toBeLessThan(40);
    expect(grants).toContain('crate');
  });
});
