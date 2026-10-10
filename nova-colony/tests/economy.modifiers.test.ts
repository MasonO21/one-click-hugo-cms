import { describe, expect, it } from 'vitest';
import { addBuilding, makeGame, stepEconomy } from './economy.helpers';
import { Game } from '../src/core/Game';

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

  it('equipment feeds gather/move stats and gather boosts multiply yield', () => {
    const t = makeGame();
    const { game } = t;
    const eco = game.sys.economy;
    game.state.player.equip = { tool: 't_tool', armor: 't_vest' };
    eco.markDirty();
    expect(eco.modifier('gatherYield')).toBeCloseTo(1.5);
    expect(eco.modifier('gatherSpeed')).toBeCloseTo(1.1);
    expect(eco.modifier('moveSpeed')).toBeCloseTo(1.1);
    expect(eco.modifier('playerHp')).toBeCloseTo(1); // armor hp is a flat add in PlayerSystem.maxHp, not a modifier
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

  it('research "Offline hours +N" adds N hours to the offline cap (not N × the base)', () => {
    const now = Date.UTC(2026, 9, 8, 12);
    const game = new Game({ seed: 7, clock: () => now });
    game.start();
    const eco = game.sys.economy;
    const base = game.data.balance.offlineHours;
    const hours = (id: string) => game.data.researchDef(id)!.effects!.filter((e) => e.stat === 'offlineHours').reduce((a, e) => a + (e.add ?? 0), 0);
    const ids = ['automated_logistics', 'quantum_storage_tech', 'colony_mastery'];
    expect(ids.map(hours).every((h) => h > 0)).toBe(true);
    game.state.research.completed.push(ids[0]);
    eco.markDirty();
    expect(base * eco.modifier('offlineHours')).toBeCloseTo(base + hours(ids[0]));
    game.state.research.completed.push(ids[1], ids[2]);
    eco.markDirty();
    const total = base + ids.reduce((a, id) => a + hours(id), 0);
    expect(base * eco.modifier('offlineHours')).toBeCloseTo(total);
    // and the Welcome Back credit stops there
    const full = (game.data.balance.offlineFullMinutes ?? 0) * 60;
    expect(eco.computeOffline(100 * 3600).seconds).toBeCloseTo(full + (total * 3600 - full) * game.data.balance.offlineEfficiency);
    // the Colony Pass still adds its hours on top
    game.state.liveops.vip.until = now + 86_400_000;
    eco.markDirty();
    expect(base * eco.modifier('offlineHours')).toBeCloseTo(total + game.data.vip.offlineHoursBonus);
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
