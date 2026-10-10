/**
 * Fixed-content crates grow with the colony tier (crafted bundles keep their recipe's contents), and a crate that is
 * small next to storage opens with a toast instead of the full-screen scene.
 */
import { describe, expect, it } from 'vitest';
import type { ChestOpened } from '../src/sim/chests';
import { crateScale, isSmallCrate, tierCrateReward } from '../src/sim/meta/crates';
import { deserializeState, serializeState } from '../src/core/state';
import { makeGame } from './meta.helpers';

function rig(tier = 0, capacity = 1e9) {
  const g = makeGame();
  const game = g.game;
  game.state.colony.tier = tier;
  game.sys.economy.capacity = () => capacity;
  const opened: ChestOpened[] = [];
  const toasts: string[] = [];
  const gains: Record<string, number> = {};
  game.bus.on('chest:opened', (e) => opened.push(e));
  game.bus.on('ui:toast', (e) => toasts.push(e.text));
  game.bus.on('reward:granted', (e) => {
    if (e.source !== 'crate') return;
    for (const [id, n] of Object.entries(e.reward.resources ?? {})) gains[id] = (gains[id] ?? 0) + (n ?? 0);
  });
  return { game, opened, toasts, gains };
}

describe('crates grow with the colony', () => {
  it('a Supply Crate at Nano brings 7x its base (the free crate curve); a crate at its own tier is unchanged', () => {
    const { game } = rig();
    const base = game.data.item('supply_crate')!.use!.reward!;
    expect(tierCrateReward(game.data, 'supply_crate', base, 0)).toEqual(base);
    const nano = tierCrateReward(game.data, 'supply_crate', base, 5);
    expect(crateScale(5) / crateScale(0)).toBeCloseTo(7);
    expect(nano.resources?.wood).toBe(420);
    expect(nano.resources?.stone).toBe(280);
    const tech = game.data.item('tech_crate')!.use!.reward!;
    expect(tierCrateReward(game.data, 'tech_crate', tech, 3)).toEqual(tech);
    expect(tierCrateReward(game.data, 'tech_crate', tech, 5).resources!.electronics!).toBeGreaterThan(tech.resources!.electronics!);
    // Nova and items never grow
    const mystery = game.data.item('mystery_crate')!.use!.reward!;
    expect(tierCrateReward(game.data, 'mystery_crate', mystery, 6).nova).toBe(mystery.nova);
  });

  it('a Timber Bundle tied at the Crafting Table opens at 90 wood; a reward bundle grows', () => {
    const { game, gains } = rig(4, 50);
    game.sys.player.addItem('timber_bundle', 1);
    game.bus.emit('craft:completed', { recipe: 'r_timber_bundle' });
    expect(game.state.crafting.madeCrates?.timber_bundle).toBe(1);
    game.sys.player.addItem('timber_bundle', 1); // and one from a medal
    expect(game.sys.player.useItem('timber_bundle')).toBe(true);
    expect(gains.wood).toBe(90);
    expect(game.state.crafting.madeCrates?.timber_bundle).toBeUndefined();
    expect(game.sys.player.useItem('timber_bundle')).toBe(true);
    expect(gains.wood).toBe(90 + Math.round((90 * crateScale(4)) / 10) * 10);
  });

  it('a save from before the count treats the craftable crates it holds as crafted', () => {
    const { game } = rig();
    game.state.player.items.timber_bundle = 3;
    game.state.player.items.supply_crate = 2;
    const raw = JSON.parse(serializeState(game.state));
    delete raw.crafting.madeCrates;
    const g2 = makeGame({ state: deserializeState(JSON.stringify(raw)) }).game;
    expect(g2.state.crafting.madeCrates).toEqual({ timber_bundle: 3 });
  });
});

describe('small crates open with a toast', () => {
  it('a crate under 2% of storage skips the scene; a bigger one keeps it', () => {
    const big = rig(0, 1e6);
    big.game.sys.player.addItem('supply_crate', 1);
    expect(big.game.sys.player.useItem('supply_crate')).toBe(true);
    expect(big.opened).toHaveLength(0);
    expect(big.toasts.some((t) => t.startsWith('Supply Crate opened: 60 Wood'))).toBe(true);
    expect(big.gains.wood).toBe(60);

    const small = rig(0, 500);
    small.game.sys.player.addItem('supply_crate', 1);
    small.game.sys.player.useItem('supply_crate');
    expect(small.opened).toHaveLength(1);
    expect(small.opened[0].variant).toBe('crate');
  });

  it('colonists, cosmetics and Nova caches always get the scene', () => {
    expect(isSmallCrate({ colonist: 'rare' }, () => 1e9)).toBe(false);
    expect(isSmallCrate({ resources: { wood: 10 }, cosmetic: 'x' }, () => 1e9)).toBe(false);
    expect(isSmallCrate({ resources: { wood: 10 }, nova: 5, xp: 3 }, () => 1e9)).toBe(true);
    const r = rig(0, 1e9);
    r.game.sys.player.addItem('chest_supply', 1);
    r.game.sys.player.useItem('chest_supply');
    expect(r.opened).toHaveLength(1);
    expect(r.opened[0].variant).toBe('chest');
  });
});
