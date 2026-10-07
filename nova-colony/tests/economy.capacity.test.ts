import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/Game';
import { addBuilding, makeData, makeGame, record, T0 } from './economy.helpers';

describe('economy: storage capacity', () => {
  it('starts at each resource baseCapacity', () => {
    const { game } = makeGame();
    for (const r of game.data.resources) expect(game.derived.capacity[r.id]).toBe(r.baseCapacity);
    expect(game.sys.economy.capacity('t_ore')).toBe(1000);
  });

  it('adds storage of built buildings scaled by the level effect', () => {
    const { game } = makeGame();
    const eco = game.sys.economy;
    const vault = addBuilding(game, 't_vault'); // +100 ore, +50 wood, levelEffect 1
    eco.recompute();
    expect(eco.capacity('t_ore')).toBe(1100);
    expect(eco.capacity('wood')).toBe(game.data.resource('wood')!.baseCapacity + 50);

    vault.level = 3; // 1 + 2 × 1 = 300%
    eco.recompute();
    expect(eco.capacity('t_ore')).toBe(1300);
  });

  it('ignores storage under construction but keeps it while damaged or switched off (cozy)', () => {
    const { game } = makeGame();
    const eco = game.sys.economy;
    const vault = addBuilding(game, 't_vault', { status: 'building', progress: 0.3 });
    eco.recompute();
    expect(eco.capacity('t_ore')).toBe(1000);
    vault.status = 'damaged';
    eco.recompute();
    expect(eco.capacity('t_ore')).toBe(1100);
    vault.status = 'off';
    eco.recompute();
    expect(eco.capacity('t_ore')).toBe(1100);
  });

  it("applies modifier('storage') from research", () => {
    const { game } = makeGame();
    const eco = game.sys.economy;
    addBuilding(game, 't_vault');
    game.state.research.completed.push('t_res_storage'); // storage ×2
    eco.markDirty();
    eco.recompute();
    expect(eco.modifier('storage')).toBe(2);
    expect(eco.capacity('t_ore')).toBe(2200);
  });

  it('add() clamps to capacity, tracks lifetime and emits resource:full once', () => {
    const { game } = makeGame();
    const eco = game.sys.economy;
    const full = record(game, 'resource:full');
    const gained = record(game, 'resource:gained');
    expect(eco.add('t_ore', 900, 'gather')).toBe(900);
    expect(eco.add('t_ore', 500, 'gather')).toBe(100);
    expect(eco.add('t_ore', 5, 'gather')).toBe(0);
    expect(eco.amount('t_ore')).toBe(1000);
    expect(game.state.resources.lifetime.t_ore).toBe(1000);
    expect(full).toEqual([{ id: 't_ore' }]);
    expect(gained.map((g) => g.amount)).toEqual([900, 100]);
    expect(eco.isFull('t_ore')).toBe(true);
    expect(eco.freeCapacity('t_ore')).toBe(0);
  });

  it('spend() deducts or reports what is missing', () => {
    const { game } = makeGame();
    const eco = game.sys.economy;
    const missing = record(game, 'resource:insufficient');
    eco.add('wood', 30, 'gather');
    expect(eco.spend({ wood: 50 }, 'test')).toBe(false);
    expect(missing[0].missing).toEqual({ wood: 20 });
    expect(eco.spend({ wood: 25 }, 'test')).toBe(true);
    expect(eco.amount('wood')).toBe(5);
  });

  it('fresh game grants the starter kit silently', () => {
    const fresh = new Game({ seed: 7, clock: () => T0, data: makeData() });
    const gained = record(fresh, 'resource:gained');
    fresh.start();
    for (const [id, n] of Object.entries(fresh.data.starterKit.resources)) {
      expect(fresh.sys.economy.amount(id)).toBeGreaterThanOrEqual(Math.min(n, fresh.sys.economy.capacity(id)));
    }
    expect(gained.filter((g) => g.source === 'reward' && g.amount === fresh.data.starterKit.resources[g.id])).toHaveLength(0);
  });
});
