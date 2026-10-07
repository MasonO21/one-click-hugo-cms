import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/Game';
import { deserializeState, serializeState } from '../src/core/state';
import { simulateOffline } from '../src/sim/econ/offline';
import { addBuilding, addColonist, makeData, makeGame, record, staff } from './economy.helpers';

const H = 3600;

describe('economy: offline progress', () => {
  it('credits positive net production for the time away', () => {
    const { game } = makeGame();
    addBuilding(game, 't_mine'); // 6 ore / min
    addBuilding(game, 't_vault', { level: 5 }); // ore capacity 1000 + 500
    const s = game.sys.economy.computeOffline(4 * H);
    expect(s.away).toBe(4 * H);
    expect(s.seconds).toBe(4 * H);
    expect(s.gains.t_ore).toBe(1440);
    expect(s.spent).toBeUndefined();
  });

  it('caps credited time at offlineHours (extended by VIP)', () => {
    const { game, clock } = makeGame();
    addBuilding(game, 't_well');
    const eco = game.sys.economy;
    expect(eco.computeOffline(20 * H).seconds).toBe(8 * H);
    game.state.liveops.vip.until = clock.now + 86400_000;
    eco.markDirty();
    expect(eco.computeOffline(20 * H).seconds).toBe(12 * H);
    expect(eco.computeOffline(2 * H).seconds).toBe(2 * H);
  });

  it('clamps gains to free storage capacity', () => {
    const { game } = makeGame();
    addBuilding(game, 't_mine');
    game.sys.economy.add('t_ore', 900, 'gather');
    expect(game.sys.economy.computeOffline(4 * H).gains.t_ore).toBe(100);
    game.sys.economy.add('t_ore', 100, 'gather');
    expect(game.sys.economy.computeOffline(4 * H).gains.t_ore).toBeUndefined();
  });

  it('balance.offlineStorageMult can make Welcome Back more generous', () => {
    const { game } = makeGame();
    addBuilding(game, 't_mine');
    game.sys.economy.add('t_ore', 900, 'gather');
    game.data.balance.offlineStorageMult = 2;
    expect(game.sys.economy.computeOffline(4 * H).gains.t_ore).toBe(1100);
  });

  it('excludes temporary boosts but keeps research and VIP bonuses', () => {
    const { game, clock } = makeGame();
    addBuilding(game, 't_mine');
    game.state.research.completed.push('t_res_prod'); // +20%
    game.state.liveops.vip.until = clock.now + 86400_000; // +10%
    game.sys.liveops.activateBoost('production', 2, 60);
    game.sys.economy.markDirty();
    const s = game.sys.economy.computeOffline(60 * 60);
    expect(s.gains.t_ore).toBe(Math.floor(6 * 1.3 * 60));
  });

  it('runs converter chains and reports stockpiled inputs as spent', () => {
    const { game } = makeGame();
    const eco = game.sys.economy;
    addBuilding(game, 't_mine'); // 6 ore / min
    addBuilding(game, 't_smelter'); // 6 ore + 3 fuel -> 3 bar / min
    eco.add('t_fuel', 1000, 'gather');
    const s = eco.computeOffline(4 * H);
    expect(s.gains.t_bar).toBeGreaterThanOrEqual(715);
    expect(s.gains.t_bar).toBeLessThanOrEqual(720);
    expect(s.gains.t_ore ?? 0).toBeLessThan(10);
    expect(s.spent?.t_fuel).toBeGreaterThanOrEqual(715);

    eco.applyOffline(s);
    expect(eco.amount('t_bar')).toBe(s.gains.t_bar);
    expect(eco.amount('t_fuel')).toBe(1000 - s.spent!.t_fuel!);
  });

  it('a converter without upstream supply only uses what is stockpiled', () => {
    const { game } = makeGame();
    const eco = game.sys.economy;
    addBuilding(game, 't_smelter');
    eco.add('t_ore', 100, 'gather');
    eco.add('t_fuel', 100, 'gather');
    const s = eco.computeOffline(8 * H);
    expect(s.gains.t_bar).toBe(50);
    expect(s.spent).toEqual({ t_ore: 100, t_fuel: 50 });
  });

  it('colonist upkeep never eats the stockpile while away (cozy)', () => {
    const { game } = makeGame();
    const eco = game.sys.economy;
    for (let i = 0; i < 4; i++) addColonist(game); // 2 food + 2 water / min
    eco.add('food', 50, 'gather');
    let s = eco.computeOffline(4 * H);
    expect(s.gains.food).toBeUndefined();
    expect(s.spent).toBeUndefined();

    addBuilding(game, 't_farm'); // 6 food / min -> net +4
    s = eco.computeOffline(10 * 60);
    expect(s.gains.food).toBe(40);
  });

  it('credits research points without a cap', () => {
    const { game } = makeGame();
    game.sys.colonists.productivity = () => 1;
    staff(game, addBuilding(game, 't_lab'), 2); // 6 RP / min
    expect(game.sys.economy.computeOffline(4 * H).rp).toBe(1440);
  });

  it('end to end: load after 4h -> Welcome Back summary -> doubled claim', () => {
    const first = makeGame();
    addBuilding(first.game, 't_mine');
    addBuilding(first.game, 't_vault', { level: 5 });
    first.game.sys.economy.recompute();
    const saved = serializeState(first.game.state);

    const now = first.clock.now + 4 * H * 1000 + 5000;
    const game = new Game({ state: deserializeState(saved), clock: () => now, data: makeData() });
    const ready = record(game, 'offline:ready');
    game.start();
    expect(ready).toHaveLength(1);
    const summary = game.pendingOffline!;
    expect(summary.gains.t_ore).toBe(1440);
    expect(ready[0].gains.t_ore).toBe(1440);

    const gained = record(game, 'resource:gained');
    const before = game.sys.economy.amount('t_ore');
    game.sys.economy.applyOffline(summary, 2); // rewarded ad: double, even beyond capacity
    expect(game.sys.economy.amount('t_ore') - before).toBe(2880);
    expect(gained.some((g) => g.id === 't_ore' && g.source === 'offline' && g.amount === 2880)).toBe(true);
  });
});

describe('simulateOffline (pure)', () => {
  it('matches rate × time for simple producers and stays non-negative', () => {
    const r = simulateOffline(
      { flows: [{ ins: [], outs: [['a', 10]] }], upkeep: [['b', 5]], rpPerMin: 2.5 },
      600,
      { b: 3 },
      { a: 1e9, b: 100 },
    );
    expect(r.gains).toEqual({ a: 100 });
    expect(r.spent).toEqual({});
    expect(r.rp).toBe(25);
  });

  it('returns nothing for zero time', () => {
    const r = simulateOffline({ flows: [{ ins: [], outs: [['a', 10]] }], upkeep: [], rpPerMin: 5 }, 0, {}, { a: 100 });
    expect(r).toEqual({ gains: {}, spent: {}, rp: 0 });
  });
});
