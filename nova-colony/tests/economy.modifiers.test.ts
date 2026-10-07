import { describe, expect, it } from 'vitest';
import { addBuilding, makeGame, stepEconomy } from './economy.helpers';

describe('economy: modifiers', () => {
  it('combines research adds, VIP and boosts as (1 + Σadd) × Πmult', () => {
    const t = makeGame();
    const { game, clock } = t;
    const eco = game.sys.economy;
    expect(eco.modifier('production')).toBe(1);

    game.state.research.completed.push('t_res_prod'); // +0.2
    eco.markDirty();
    expect(eco.modifier('production')).toBeCloseTo(1.2);

    game.state.liveops.vip.until = clock.now + 3600_000; // +0.1
    eco.markDirty();
    expect(eco.modifier('production')).toBeCloseTo(1.3);

    game.sys.liveops.activateBoost('production', 2, 10);
    expect(eco.modifier('production')).toBeCloseTo(2.6);

    // same-kind boosts don't stack: the strongest applies
    game.sys.liveops.activateBoost('production', 3, 5);
    expect(eco.modifier('production')).toBeCloseTo(3.9);

    // boosts expire (picked up by the once-per-second refresh)
    clock.now += 11 * 60_000;
    stepEconomy(t, 1);
    expect(eco.modifier('production')).toBeCloseTo(1.3);

    clock.now += 3600_000; // VIP lapses
    stepEconomy(t, 1);
    expect(eco.modifier('production')).toBeCloseTo(1.2);
  });

  it('per-resource production modifiers and happiness productivity affect rates', () => {
    const t = makeGame();
    const { game } = t;
    const eco = game.sys.economy;
    addBuilding(game, 't_mine'); // 6 ore / min
    addBuilding(game, 't_well'); // 6 water / min
    game.state.research.completed.push('t_res_prod', 't_res_ore'); // +20% all, ×1.5 ore
    game.derived.happiness.productivity = 1.25;
    eco.recompute();
    expect(game.derived.producePerMin.t_ore).toBeCloseTo(6 * 1.2 * 1.5 * 1.25);
    expect(game.derived.producePerMin.water).toBeCloseTo(6 * 1.2 * 1.25);
  });

  it('equipment feeds gather/move/hp stats and gather boosts multiply yield', () => {
    const t = makeGame();
    const { game } = t;
    const eco = game.sys.economy;
    game.state.player.equip = { tool: 't_tool', armor: 't_vest' };
    eco.markDirty();
    expect(eco.modifier('gatherYield')).toBeCloseTo(1.5);
    expect(eco.modifier('gatherSpeed')).toBeCloseTo(1.1);
    expect(eco.modifier('moveSpeed')).toBeCloseTo(1.1);
    expect(eco.modifier('playerHp')).toBeCloseTo(1.5); // +50 hp on a 100 hp base
    game.sys.liveops.activateBoost('gather', 2, 5);
    expect(eco.modifier('gatherYield')).toBeCloseTo(3);
    game.bus.emit('player:equipped', { item: 't_super_tool', slot: 'tool' });
    game.state.player.equip.tool = 't_super_tool';
    expect(eco.modifier('gatherYield')).toBeCloseTo(4);
  });

  it('VIP extends the offline cap', () => {
    const { game, clock } = makeGame();
    const eco = game.sys.economy;
    expect(eco.modifier('offlineHours')).toBe(1);
    game.state.liveops.vip.until = clock.now + 86400_000;
    eco.markDirty();
    expect(eco.modifier('offlineHours')).toBeCloseTo(1.5); // 8h + 4h
    expect(eco.modifier('turretDamage')).toBe(1);
  });

  it('research completion marks derived data dirty', () => {
    const t = makeGame();
    const { game } = t;
    addBuilding(game, 't_mine');
    game.sys.economy.recompute();
    expect(game.derived.producePerMin.t_ore).toBeCloseTo(6);
    game.state.research.points = 100;
    expect(game.sys.research.research('t_res_prod')).toBe(true);
    stepEconomy(t, 0.25);
    expect(game.derived.producePerMin.t_ore).toBeCloseTo(7.2);
  });
});
