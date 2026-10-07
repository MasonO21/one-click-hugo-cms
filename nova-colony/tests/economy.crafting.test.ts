import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/Game';
import { deserializeState, serializeState } from '../src/core/state';
import { addBuilding, makeData, makeGame, record, stepEconomy } from './economy.helpers';

describe('crafting: manual queue', () => {
  it('lists recipes unlocked by tier and research', () => {
    const { game } = makeGame();
    const c = game.sys.crafting;
    const ids = c.recipes().map((r) => r.id);
    expect(ids).toContain('t_r_part');
    expect(ids).not.toContain('t_r_secret');
    expect(ids).not.toContain('t_r_late');
    expect(c.recipes('t_bench').map((r) => r.id)).toEqual(['t_r_part', 't_r_tool']);
    game.state.research.completed.push('t_res_secret');
    expect(c.recipes().map((r) => r.id)).toContain('t_r_secret');
  });

  it('stations come from active station buildings plus hand', () => {
    const t = makeGame();
    const c = t.game.sys.crafting;
    expect(c.stations()).toEqual(['hand']);
    const bench = addBuilding(t.game, 't_bench', { status: 'building', progress: 0.1 });
    t.game.bus.emit('building:placed', { id: bench.id, def: 't_bench' });
    expect(c.stations()).toEqual(['hand']);
    bench.status = 'active';
    t.game.bus.emit('building:completed', { id: bench.id, def: 't_bench' });
    expect(c.stations()).toEqual(['hand', 't_bench']);
  });

  it('explains why a recipe cannot be crafted', () => {
    const t = makeGame();
    const { game } = t;
    const c = game.sys.crafting;
    expect(c.canCraft('t_r_part')).toEqual({ ok: false, reason: 'Requires t_bench' });
    addBuilding(game, 't_bench');
    game.bus.emit('building:completed', { id: 0, def: 't_bench' });
    expect(c.canCraft('t_r_part')).toEqual({ ok: false, reason: 'Not enough resources' });
    game.sys.economy.add('t_ore', 4, 'gather');
    expect(c.canCraft('t_r_part')).toEqual({ ok: true });
    expect(c.canCraft('t_r_upgrade')).toEqual({ ok: false, reason: 'Requires Tool' });
    expect(c.canCraft('t_r_secret').reason).toContain('Requires research');
    expect(c.canCraft('t_r_late').reason).toContain('tier');
    expect(c.canCraft('missing').ok).toBe(false);
  });

  it('pays, queues and processes one job per station type at a time', () => {
    const t = makeGame();
    const { game } = t;
    const eco = game.sys.economy;
    const c = game.sys.crafting;
    addBuilding(game, 't_bench');
    addBuilding(game, 't_forge');
    game.bus.emit('building:completed', { id: 0, def: 't_bench' });
    eco.add('t_ore', 100, 'gather');
    const done = record(game, 'craft:completed');

    const a = c.craft('t_r_part')!; // bench, 10 s
    const b = c.craft('t_r_part')!; // bench, waits for a
    const ingot = c.craft('t_r_ingot')!; // forge, runs in parallel, 5 s
    expect(a).not.toBeNull();
    expect(eco.amount('t_ore')).toBe(90);
    expect(game.state.crafting.queue.map((j) => j.id)).toEqual([a, b, ingot]);

    stepEconomy(t, 5);
    expect(done.map((d) => d.recipe)).toEqual(['t_r_ingot']);
    expect(c.progress(a)).toBeCloseTo(0.5);
    expect(c.progress(b)).toBe(0);

    stepEconomy(t, 5);
    expect(done.map((d) => d.recipe)).toEqual(['t_r_ingot', 't_r_part']);
    expect(eco.amount('t_part')).toBe(2);

    stepEconomy(t, 10);
    expect(eco.amount('t_part')).toBe(4);
    expect(game.state.crafting.queue).toHaveLength(0);
    expect(game.state.crafting.crafted).toEqual({ t_r_ingot: 1, t_r_part: 2 });
    expect(game.state.stats.crafted).toBe(3);
  });

  it('craftSpeed shortens jobs; items and item inputs flow through the inventory', () => {
    const t = makeGame();
    const { game } = t;
    const c = game.sys.crafting;
    game.state.research.completed.push('t_res_craft'); // craftSpeed ×2
    game.sys.economy.markDirty();
    game.sys.economy.add('t_ore', 10, 'gather');
    const id = c.craft('t_r_hand')!; // 3 s -> 1.5 s
    expect(c.job(id)?.total).toBeCloseTo(1.5);
    c.craft('t_r_hand');
    stepEconomy(t, 3);
    expect(game.state.player.items.t_tool).toBe(2);

    const up = c.craft('t_r_upgrade')!;
    expect(up).not.toBeNull();
    expect(game.state.player.items.t_tool ?? 0).toBe(0);
    stepEconomy(t, 1);
    expect(game.state.player.items.t_super_tool).toBe(1);
  });

  it('finishNow completes instantly; finishCost is 1 Nova per started 30 s', () => {
    const t = makeGame();
    const { game } = t;
    const c = game.sys.crafting;
    addBuilding(game, 't_bench');
    game.sys.economy.add('t_bar', 5, 'gather');
    const id = c.craft('t_r_tool')!; // 20 s
    expect(c.finishCost(id)).toBe(1);
    game.state.crafting.queue[0].remaining = 100;
    expect(c.finishCost(id)).toBe(4);
    expect(c.finishNow(id)).toBe(true);
    expect(game.state.player.items.t_tool).toBe(1);
    expect(c.finishNow(id)).toBe(false);
    expect(c.finishCost(id)).toBe(0);
  });

  it('cancel refunds the inputs', () => {
    const t = makeGame();
    const { game } = t;
    game.sys.economy.add('t_ore', 4, 'gather');
    const id = game.sys.crafting.craft('t_r_hand')!;
    expect(game.sys.economy.amount('t_ore')).toBe(3);
    expect(game.sys.crafting.cancel(id)).toBe(true);
    expect(game.sys.economy.amount('t_ore')).toBe(4);
    expect(game.state.crafting.queue).toHaveLength(0);
  });

  it('keeps crafting while the player is away', () => {
    const first = makeGame();
    addBuilding(first.game, 't_bench');
    first.game.sys.economy.add('t_ore', 8, 'gather');
    first.game.sys.crafting.craft('t_r_part');
    first.game.sys.crafting.craft('t_r_part');
    const saved = serializeState(first.game.state);
    const game = new Game({ state: deserializeState(saved), clock: () => first.clock.now + 15_000, data: makeData() });
    game.start();
    expect(game.sys.economy.amount('t_part')).toBe(2);
    expect(game.state.crafting.queue).toHaveLength(1);
    expect(game.state.crafting.queue[0].remaining).toBeCloseTo(5);
  });
});

describe('crafting: factories', () => {
  function factorySetup() {
    const t = makeGame();
    const { game } = t;
    const gen = addBuilding(game, 't_generator'); // +10 power
    const fac = addBuilding(game, 't_assembler', { recipe: 't_r_assemble' }); // −10 power, 2 bar -> 1 part / 10 s
    game.sys.economy.recompute();
    return { t, game, gen, fac };
  }

  it('idles without inputs', () => {
    const { t, game, fac } = factorySetup();
    stepEconomy(t, 5);
    expect(fac.cyclePaid ?? false).toBe(false);
    expect(fac.eff).toBe(0);
    expect(game.sys.crafting.factoryActivity(fac.id)).toBeLessThan(0.05);
    expect(game.sys.economy.buildingEconomy(fac.id)?.idle).toBe('no_inputs');
  });

  it('pays inputs at cycle start and delivers outputs each cycle', () => {
    const { t, game, fac } = factorySetup();
    const eco = game.sys.economy;
    const done = record(game, 'craft:completed');
    eco.add('t_bar', 5, 'gather');
    stepEconomy(t, 0.25);
    expect(fac.cyclePaid).toBe(true);
    expect(eco.amount('t_bar')).toBe(3);
    expect(game.sys.crafting.factoryProgress(fac)).toBeCloseTo(0.025);

    stepEconomy(t, 11);
    expect(done).toContainEqual({ recipe: 't_r_assemble', factory: fac.id });
    expect(eco.amount('t_part')).toBe(1);
    expect(eco.amount('t_bar')).toBe(1); // second cycle paid
    stepEconomy(t, 10);
    expect(eco.amount('t_part')).toBe(2);
    expect(eco.amount('t_bar')).toBe(1); // not enough for a third
    expect(fac.cyclePaid).toBe(false);
    expect(game.state.crafting.crafted.t_r_assemble).toBe(2);
  });

  it('cycle speed scales with power', () => {
    const { t, game, fac } = factorySetup();
    addBuilding(game, 't_pump'); // another −10 -> ratio 0.5
    game.sys.economy.recompute();
    game.sys.economy.add('t_bar', 2, 'gather');
    stepEconomy(t, 12);
    expect(game.sys.economy.amount('t_part')).toBe(0);
    expect(game.sys.crafting.factorySpeed(fac)).toBeCloseTo(0.5);
    stepEconomy(t, 10);
    expect(game.sys.economy.amount('t_part')).toBe(1);
  });

  it('can produce items', () => {
    const { t, game, fac } = factorySetup();
    fac.recipe = 't_r_assemble_item';
    game.sys.economy.add('t_ore', 1, 'gather');
    stepEconomy(t, 10.5);
    expect(game.state.player.items.t_tool).toBe(1);
  });

  it('refunds a paid cycle when the recipe changes or the factory is removed', () => {
    const { t, game, fac } = factorySetup();
    const eco = game.sys.economy;
    eco.add('t_bar', 2, 'gather');
    stepEconomy(t, 1);
    expect(eco.amount('t_bar')).toBe(0);
    fac.recipe = null;
    stepEconomy(t, 0.25);
    expect(eco.amount('t_bar')).toBe(2);
    expect(fac.craft).toBe(0);

    fac.recipe = 't_r_assemble';
    stepEconomy(t, 1);
    expect(eco.amount('t_bar')).toBe(0);
    game.state.buildings.list.splice(game.state.buildings.list.indexOf(fac), 1);
    game.bus.emit('building:removed', { id: fac.id, def: fac.def });
    expect(eco.amount('t_bar')).toBe(2);
  });

  it('mirrors factory throughput into rates and offline progress', () => {
    const { t, game } = factorySetup();
    const eco = game.sys.economy;
    eco.add('t_bar', 100, 'gather');
    stepEconomy(t, 1);
    expect(game.derived.producePerMin.t_part).toBeCloseTo(6);
    expect(game.derived.consumePerMin.t_bar).toBeCloseTo(12);
    const s = eco.computeOffline(4 * 3600);
    expect(s.gains.t_part).toBe(49); // 98 bars left in stock -> 49 parts
    expect(s.spent?.t_bar).toBe(98);
  });
});
