import { describe, expect, it } from 'vitest';
import { cellMin } from '../src/core/constants';
import { addBuilding, addColonist, makeGame, record, staff, stepEconomy } from './economy.helpers';

describe('economy: production', () => {
  it('produces continuously and credits whole units', () => {
    const t = makeGame();
    const { game } = t;
    addBuilding(game, 't_mine'); // 6 ore / min, no workers needed
    stepEconomy(t, 60);
    expect(game.sys.economy.amount('t_ore')).toBe(6);
    expect(game.derived.producePerMin.t_ore).toBeCloseTo(6);
    expect(game.derived.netPerMin.t_ore).toBeCloseTo(6);
  });

  it('applies the level effect to production', () => {
    const t = makeGame();
    addBuilding(t.game, 't_mine', { level: 3 }); // levelEffect 0.5 -> 200%
    stepEconomy(t, 60);
    expect(t.game.sys.economy.amount('t_ore')).toBe(12);
  });

  it('only active buildings produce', () => {
    const t = makeGame();
    addBuilding(t.game, 't_mine', { status: 'building', progress: 0.5 });
    addBuilding(t.game, 't_mine', { status: 'off' });
    addBuilding(t.game, 't_mine', { status: 'damaged' });
    stepEconomy(t, 60);
    expect(t.game.sys.economy.amount('t_ore')).toBe(0);
  });

  it('required workers: efficiency = Σ productivity / slots', () => {
    const t = makeGame();
    const { game } = t;
    const eco = game.sys.economy;
    let productivity = 1;
    game.sys.colonists.productivity = () => productivity;
    const mine = addBuilding(game, 't_staffed_mine'); // 12 / min, 2 slots, required
    eco.recompute();
    expect(mine.eff).toBe(0);
    expect(eco.buildingEconomy(mine.id)?.idle).toBe('no_workers');
    expect(game.derived.producePerMin.t_ore ?? 0).toBe(0);

    staff(game, mine, 1);
    eco.recompute();
    expect(mine.eff).toBeCloseTo(0.5);
    expect(game.derived.producePerMin.t_ore).toBeCloseTo(6);

    staff(game, mine, 2); // only 2 slots count
    productivity = 1.5;
    eco.recompute();
    expect(mine.eff).toBeCloseTo(1.5);
    expect(game.derived.producePerMin.t_ore).toBeCloseTo(18);
  });

  it('optional workers: automated at 100%, each worker adds 25% × productivity', () => {
    const t = makeGame();
    const { game } = t;
    game.sys.colonists.productivity = () => 1;
    const farm = addBuilding(game, 't_farm'); // 6 food / min
    game.sys.economy.recompute();
    expect(game.derived.producePerMin.food).toBeCloseTo(6);
    staff(game, farm, 2);
    game.sys.economy.recompute();
    // 2 colonists also eat 0.5 food/min each
    expect(game.derived.producePerMin.food).toBeCloseTo(9);
    expect(game.derived.consumePerMin.food).toBeCloseTo(1);
    expect(game.derived.netPerMin.food).toBeCloseTo(8);
  });

  it('power shortage scales consumers by the power ratio', () => {
    const t = makeGame();
    const { game } = t;
    const eco = game.sys.economy;
    const pump = addBuilding(game, 't_pump'); // −10 power, 12 fuel / min
    eco.recompute();
    expect(game.derived.power).toEqual({ produced: 0, consumed: 10, ratio: 0 });
    expect(eco.buildingEconomy(pump.id)?.idle).toBe('no_power');

    const gen = addBuilding(game, 't_generator'); // +10
    addBuilding(game, 't_pump');
    eco.recompute();
    expect(game.derived.power).toEqual({ produced: 10, consumed: 20, ratio: 0.5 });
    expect(pump.eff).toBeCloseTo(0.5);
    expect(eco.buildingEconomy(pump.id)?.idle).toBe('low_power');
    expect(game.derived.producePerMin.t_fuel).toBeCloseTo(12);

    gen.level = 3; // positive power scales with level: 10 × 2 = 20
    eco.recompute();
    expect(game.derived.power.produced).toBe(20);
    expect(game.derived.power.ratio).toBe(1);
    expect(game.derived.producePerMin.t_fuel).toBeCloseTo(24);

    gen.status = 'off';
    eco.recompute();
    expect(game.derived.power.produced).toBe(0);
  });

  it('a power shortage triggers one gentle hint', () => {
    const t = makeGame();
    const toasts = record(t.game, 'ui:toast');
    addBuilding(t.game, 't_pump');
    stepEconomy(t, 10);
    expect(toasts.filter((x) => x.text.includes('Power'))).toHaveLength(1);
  });

  it('fuel generators need fuel and only burn what the grid uses', () => {
    const t = makeGame();
    const { game } = t;
    const eco = game.sys.economy;
    addBuilding(game, 't_fuel_generator'); // +20 power, 6 fuel / min at full load
    stepEconomy(t, 10);
    expect(game.derived.power.produced).toBeLessThan(1); // no fuel at all

    eco.add('t_fuel', 100, 'gather');
    stepEconomy(t, 10);
    expect(game.derived.power.produced).toBeGreaterThan(19);
    expect(eco.amount('t_fuel')).toBe(100); // nothing draws power -> no fuel burnt

    addBuilding(game, 't_assembler'); // −10 power -> 50% load
    stepEconomy(t, 60);
    expect(game.derived.power.ratio).toBe(1);
    expect(eco.amount('t_fuel')).toBeCloseTo(97, 0);
    expect(game.derived.consumePerMin.t_fuel).toBeCloseTo(3, 1);
  });
});

describe('economy: converters', () => {
  it('idles without inputs', () => {
    const t = makeGame();
    const { game } = t;
    const smelter = addBuilding(game, 't_smelter'); // 6 ore + 3 fuel -> 3 bar / min
    stepEconomy(t, 30);
    expect(game.sys.economy.amount('t_bar')).toBe(0);
    expect(smelter.eff).toBeLessThan(0.01);
    expect(game.sys.economy.buildingEconomy(smelter.id)?.idle).toBe('no_inputs');
  });

  it('consumes inputs proportionally while running', () => {
    const t = makeGame();
    const { game } = t;
    const eco = game.sys.economy;
    const smelter = addBuilding(game, 't_smelter');
    eco.add('t_ore', 100, 'gather');
    eco.add('t_fuel', 100, 'gather');
    stepEconomy(t, 60);
    expect(eco.amount('t_bar')).toBe(3);
    expect(eco.amount('t_ore')).toBeCloseTo(94, 5);
    expect(eco.amount('t_fuel')).toBeCloseTo(97, 5);
    expect(smelter.eff).toBeCloseTo(1);
    expect(game.derived.consumePerMin.t_ore).toBeCloseTo(6);
  });

  it('runs partially when inputs run out, never going negative', () => {
    const t = makeGame();
    const { game } = t;
    const eco = game.sys.economy;
    addBuilding(game, 't_smelter');
    eco.add('t_ore', 3, 'gather'); // 30 s worth
    eco.add('t_fuel', 100, 'gather');
    stepEconomy(t, 120);
    expect(eco.amount('t_ore')).toBe(0);
    expect(eco.amount('t_fuel')).toBeCloseTo(98.5, 5);
    expect(eco.amount('t_bar')).toBe(1); // 1.5 produced, whole units credited
  });

  it('feeds on fresh production from upstream buildings', () => {
    const t = makeGame();
    const { game } = t;
    const eco = game.sys.economy;
    addBuilding(game, 't_mine'); // 6 ore / min
    addBuilding(game, 't_smelter');
    eco.add('t_fuel', 100, 'gather');
    stepEconomy(t, 600);
    expect(eco.amount('t_bar')).toBeGreaterThanOrEqual(28);
    expect(eco.amount('t_ore')).toBeLessThan(2);
  });
});

describe('economy: colonist upkeep', () => {
  it('draws food & water and flags shortfalls (never below zero)', () => {
    const t = makeGame();
    const { game } = t;
    const eco = game.sys.economy;
    const toasts = record(game, 'ui:toast');
    for (let i = 0; i < 4; i++) addColonist(game); // 2 food + 2 water / min
    eco.add('water', 100, 'gather');
    stepEconomy(t, 60);
    expect(eco.upkeep('food')).toBe(2);
    expect(eco.isShort('food')).toBe(true);
    expect(eco.isShort('water')).toBe(false);
    expect(eco.amount('food')).toBe(0);
    expect(eco.amount('water')).toBeCloseTo(98, 5);
    expect(game.derived.netPerMin.food).toBeCloseTo(-2);
    expect(toasts.filter((x) => x.kind === 'warning' && x.text.startsWith('Food'))).toHaveLength(1);

    eco.add('food', 50, 'gather');
    stepEconomy(t, 5);
    expect(eco.isShort('food')).toBe(false);
  });

  it('production that covers upkeep never flags a shortage', () => {
    const t = makeGame();
    const { game } = t;
    const eco = game.sys.economy;
    addBuilding(game, 't_farm'); // 6 food / min
    addBuilding(game, 't_well'); // 6 water / min
    for (let i = 0; i < 4; i++) addColonist(game);
    let everShort = false;
    for (let s = 0; s < 120; s++) {
      stepEconomy(t, 1);
      everShort ||= eco.isShort('food') || eco.isShort('water');
    }
    expect(everShort).toBe(false);
    expect(eco.amount('food')).toBeGreaterThanOrEqual(7);
    expect(eco.amount('food')).toBeLessThanOrEqual(8);
  });
});

describe('economy: events & research', () => {
  it('emits at most one resource:gained per resource per second, at the biggest producer', () => {
    const t = makeGame();
    const { game } = t;
    const big = addBuilding(game, 't_mine', { level: 5 });
    for (let i = 0; i < 4; i++) addBuilding(game, 't_mine');
    const gained = record(game, 'resource:gained');
    stepEconomy(t, 30);
    const ore = gained.filter((g) => g.id === 't_ore');
    expect(ore.length).toBeGreaterThan(0);
    expect(ore.length).toBeLessThanOrEqual(30);
    for (const g of ore) {
      expect(g.source).toBe('production');
      expect(Number.isInteger(g.amount)).toBe(true);
      expect(g.x).toBe(cellMin(big.x) + 2);
      expect(g.z).toBe(cellMin(big.z) + 2);
    }
    const total = ore.reduce((s, g) => s + g.amount, 0);
    expect(total).toBe(game.sys.economy.amount('t_ore'));
    expect(total).toBeGreaterThanOrEqual(20); // (18 + 4 × 6) per min -> 21 per 30 s
  });

  it('research buildings generate RP with scientists and modifiers', () => {
    const t = makeGame();
    const { game } = t;
    game.sys.colonists.productivity = () => 1;
    const lab = addBuilding(game, 't_lab'); // 6 RP / min with both slots filled
    staff(game, lab, 2);
    const before = game.state.research.points;
    stepEconomy(t, 60);
    expect(game.derived.research.perMin).toBeCloseTo(6);
    expect(game.state.research.points - before).toBe(6);

    game.sys.liveops.activateBoost('research', 2, 10);
    stepEconomy(t, 60);
    expect(game.derived.research.perMin).toBeCloseTo(12);
    expect(game.state.research.points - before).toBeGreaterThanOrEqual(17);
  });
});
