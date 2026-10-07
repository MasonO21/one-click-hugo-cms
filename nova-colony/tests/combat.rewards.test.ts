import { describe, expect, it } from 'vitest';
import { addBuilding, cellWorld, makeGame, testData } from './combat.helpers';
import { defaultData } from '../src/data';
import type { Reward } from '../src/data/schema';
import { TUNE } from '../src/sim/combat/types';

describe('victory rewards & core breach', () => {
  it('a core breach makes the aliens retreat: attack ends at once with half the chest, nothing destroyed', () => {
    const t = makeGame(); // no turrets, player away: the crawlers reach the core
    const { game, step } = t;
    const c = game.state.combat;
    t.core.hp = 30; // fragile core so the breach happens quickly
    const toasts = t.record('ui:toast');
    const retreated = t.record('combat:retreated');
    const ended = t.record('combat:ended');
    const opens = t.record('ui:open');
    game.sys.combat.schedule(0, 0);
    step(120, () => c.phase === 'victory');
    expect(c.phase).toBe('victory');
    expect(t.core.status).toBe('damaged');
    expect(game.state.buildings.list).toContain(t.core); // never destroyed
    expect(retreated).toEqual([{ wave: 1 }]);
    expect(toasts.some((x) => x.text === 'The aliens retreated — your colony held!')).toBe(true);
    expect(ended).toHaveLength(1);
    // base tier-0 chest {wood 120, stone 80, fiber 40, rp 20, nova 5, xp 50} at 50% (no kills)
    expect(ended[0].reward).toEqual({ resources: { wood: 60, stone: 40, fiber: 20 }, rp: 10, nova: 3, xp: 25 });
    expect(c.pendingReward).toEqual(ended[0].reward);
    expect((opens.find((o) => o.panel === 'victory')?.arg as { reason: string }).reason).toBe('breach');
    expect(c.wave).toBe(1);
    expect(game.state.stats.wavesWon).toBe(1);
    expect(c.spawnQueue).toHaveLength(0);
    // the remaining aliens run off and despawn without dropping loot or counting as kills
    expect(c.aliens.filter((a) => !a.retreat && a.state !== 'dying')).toHaveLength(0);
    const kills = game.state.stats.kills;
    step(TUNE.RETREAT_TIME + 0.5);
    expect(c.aliens).toHaveLength(0);
    expect(game.state.stats.kills).toBe(kills);
  });

  it('a lone straggler gives up after a while instead of nibbling at the core for minutes', () => {
    const base = defaultData();
    const data = testData({ invasions: [{ ...base.invasions[0], groups: [{ alien: 'crawler', count: 1, delay: 0 }] }] });
    const t = makeGame({ data });
    const { game, step } = t;
    const toasts = t.record('ui:toast');
    const opens = t.record('ui:open');
    game.sys.combat.schedule(0, 0);
    const dur = step(200, () => game.state.combat.phase === 'victory');
    expect(dur).toBeGreaterThan(TUNE.STALL_SECONDS);
    expect(dur).toBeLessThan(TUNE.STALL_SECONDS + 5);
    expect((opens.find((o) => o.panel === 'victory')?.arg as { reason: string }).reason).toBe('timeout');
    expect(toasts.some((x) => x.text === 'The last aliens fled — victory!')).toBe(true);
    expect(t.core.status).toBe('active');
    expect(game.state.combat.pendingReward?.resources?.wood).toBe(120); // full chest, no kill bonus
  });

  it('a core that was already damaged when the attack began does not count as a breach', () => {
    const t = makeGame();
    const { game, step } = t;
    addBuilding(game, 'scrap_turret', 131, 128);
    t.core.status = 'damaged';
    t.core.hp = 0;
    const retreated = t.record('combat:retreated');
    game.sys.combat.schedule(0, 0);
    step(2);
    expect(game.state.combat.phase).toBe('attack');
    expect(retreated).toHaveLength(0);
  });

  it('claimReward grants the chest once, doubled when an ad was watched', () => {
    const { game } = makeGame();
    const grants: { reward: Reward; source: string }[] = [];
    game.grant = (reward, source) => {
      if (reward) grants.push({ reward, source });
    };
    const rewardClaimed: { doubled: boolean }[] = [];
    game.bus.on('combat:rewardClaimed', (p) => rewardClaimed.push(p));
    const c = game.state.combat;
    expect(game.sys.combat.claimReward(true)).toBe(false);

    c.pendingReward = { resources: { wood: 134, stone: 90 }, rp: 22, nova: 5, xp: 56, items: { bandage: 1 } };
    expect(game.sys.combat.claimReward(true)).toBe(true);
    expect(grants[0]).toEqual({ source: 'invasion', reward: { resources: { wood: 268, stone: 180 }, rp: 44, nova: 10, xp: 112, items: { bandage: 2 } } });
    expect(rewardClaimed).toEqual([{ doubled: true }]);
    expect(c.pendingReward).toBeNull();
    expect(game.sys.combat.claimReward(true)).toBe(false);

    c.pendingReward = { resources: { wood: 50 } };
    expect(game.sys.combat.claimReward(false)).toBe(true);
    expect(grants[1].reward).toEqual({ resources: { wood: 50 } });
  });

  it('an unclaimed chest is auto-granted when the next victory arrives (never lost)', () => {
    const t = makeGame();
    const { game, step } = t;
    addBuilding(game, 'scrap_turret', 131, 128);
    const grants: Reward[] = [];
    const real = game.grant.bind(game);
    game.grant = (reward, source, x, z) => {
      if (reward) grants.push(reward);
      real(reward, source, x, z);
    };
    game.state.combat.pendingReward = { resources: { wood: 7 } };
    game.sys.combat.schedule(0, 0);
    step(180, () => game.state.combat.phase === 'victory');
    expect(grants).toEqual([{ resources: { wood: 7 } }]);
    expect(game.state.combat.pendingReward).not.toBeNull();
  });

  it('kill bonus and waves survived at the tier grow the chest', () => {
    const t = makeGame({ armed: true });
    const { game, step } = t;
    addBuilding(game, 'scrap_turret', 131, 128);
    game.state.player.x = cellWorld(132);
    game.state.player.z = cellWorld(129);
    game.state.combat.waveAtTier = 2; // 1.5x aliens and reward
    game.state.combat.wave = 2;
    const started = t.record('combat:started');
    game.sys.combat.schedule(0, 0);
    step(240, () => game.state.combat.phase === 'victory');
    const kills = game.state.combat.killsThisWave;
    expect(started[0].aliens).toBe(13); // round(5 * 1.5) + round(3 * 1.5)
    expect(kills).toBe(13);
    const mult = 1.5 * (1 + kills * 0.015);
    expect(game.state.combat.pendingReward?.resources?.wood).toBe(Math.round(120 * mult));
    expect(game.state.combat.pendingReward?.nova).toBe(5); // premium currency is not inflated
  });
});
