import { describe, expect, it } from 'vitest';
import { makeGame, record, stepEconomy } from './economy.helpers';

describe('progression: colony tiers', () => {
  it('describes the next tier requirements', () => {
    const { game } = makeGame({ tiers: true });
    const p = game.sys.progression;
    expect(p.tier()).toBe(0);
    expect(p.next()).toEqual({ tier: 1, research: 't_tier1', researchDone: false, cost: { wood: 50, stone: 20 }, affordable: false });
    expect(p.canTierUp()).toBe(false);
    expect(p.unlocksAt(0).buildings).toContain('t_mine');
  });

  it('requires the tier research before upgrading', () => {
    const { game } = makeGame({ tiers: true });
    const toasts = record(game, 'ui:toast');
    game.sys.economy.add('wood', 100, 'gather');
    game.sys.economy.add('stone', 100, 'gather');
    expect(game.sys.progression.next()?.affordable).toBe(true);
    expect(game.sys.progression.tierUp()).toBe(false);
    expect(game.state.colony.tier).toBe(0);
    expect(toasts[0].text).toContain('Tier One');
    expect(game.sys.economy.amount('wood')).toBe(100);
  });

  it('tierUp spends the cost, raises the tier, expands the radius and celebrates', () => {
    const t = makeGame({ tiers: true });
    const { game } = t;
    const p = game.sys.progression;
    const tierUp = record(game, 'colony:tierUp');
    const expanded = record(game, 'colony:expanded');
    const celebrate = record(game, 'ui:celebrate');
    const sfx = record(game, 'sfx');
    const toasts = record(game, 'ui:toast');

    game.state.research.points = 5;
    expect(game.sys.research.research('t_tier1')).toBe(true);
    game.sys.economy.add('wood', 60, 'gather');
    game.sys.economy.add('stone', 25, 'gather');
    stepEconomy(t, 1);
    expect(toasts.some((x) => x.text.includes('Reinforced Wood tier is ready'))).toBe(true);
    expect(p.canTierUp()).toBe(true);

    expect(p.tierUp()).toBe(true);
    expect(game.state.colony.tier).toBe(1);
    expect(game.state.colony.radius).toBe(15);
    expect(game.sys.economy.amount('wood')).toBe(10);
    expect(game.sys.economy.amount('stone')).toBe(5);
    expect(tierUp).toEqual([{ tier: 1 }]);
    expect(expanded).toEqual([{ radius: 15 }]);
    expect(celebrate.at(-1)?.title).toBe('Reinforced Wood Tier Reached!');
    expect(sfx.some((s) => s.id === 'tier_up')).toBe(true);
    expect(p.next()?.tier).toBe(2);
  });

  it('reaching the final tier is a big moment, then there is no next tier', () => {
    const { game } = makeGame({ tiers: true });
    const p = game.sys.progression;
    const celebrate = record(game, 'ui:celebrate');
    const shake = record(game, 'fx:shake');
    game.state.colony.tier = 1;
    game.state.research.completed.push('t_res_secret');
    game.sys.economy.add('wood', 100, 'gather');
    game.sys.economy.add('stone', 40, 'gather');
    expect(p.tierUp()).toBe(true);
    expect(celebrate.at(-1)?.title).toBe('TITANIUM TIER REACHED!');
    expect(shake).toHaveLength(1);
    expect(p.next()).toBeNull();
    expect(p.canTierUp()).toBe(false);
    expect(p.tierUp()).toBe(false);
  });

  it('works with the real tier table', () => {
    const { game } = makeGame();
    const n = game.sys.progression.next()!;
    expect(n.tier).toBe(1);
    expect(n.research).toBe(game.data.tiers[1].research);
  });
});
