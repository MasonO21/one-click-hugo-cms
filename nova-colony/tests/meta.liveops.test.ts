import { describe, expect, it, vi } from 'vitest';
import { SPIN_GRANT_DELAY } from '../src/sim/liveops';
import { crateReward, researchGrantRp, scaleReward } from '../src/sim/meta/util';
import type { OfflineSummary } from '../src/sim/economy';
import { DAY, T0, fakeBuilding, makeGame, makeServices, tickMeta, type TestGame } from './meta.helpers';

const events = <K extends string>(g: TestGame, type: K): unknown[] => {
  const out: unknown[] = [];
  (g.game.bus as unknown as { on(t: string, f: (p: unknown) => void): void }).on(type, (p) => out.push(p));
  return out;
};

describe('liveops: Nova, boosts, VIP', () => {
  it('adds and spends Nova and reports changes', () => {
    const g = makeGame();
    const ev = events(g, 'nova:changed');
    const lo = g.game.sys.liveops;
    lo.addNova(40, 'test');
    expect(lo.spendNova(100, 'x')).toBe(false);
    expect(lo.spendNova(15, 'x')).toBe(true);
    expect(lo.nova()).toBe(25);
    expect(ev).toEqual([
      { amount: 40, delta: 40 },
      { amount: 25, delta: -15 },
    ]);
    expect(lo.spendNova(-5, 'x')).toBe(false);
    lo.addNova(-5, 'x'); // ignored
    expect(lo.nova()).toBe(25);
  });

  it('boosts expire by the wall clock and same-strength boosts extend instead of stacking', () => {
    const g = makeGame();
    const lo = g.game.sys.liveops;
    lo.activateBoost('production', 2, 10);
    expect(lo.activeBoosts()).toHaveLength(1);
    expect(lo.boostMultiplier('production')).toBe(2);
    expect(lo.boostMultiplier('research')).toBe(1);
    g.clock.now += 6 * 60_000;
    lo.activateBoost('production', 2, 10); // +10 min on the same boost
    expect(lo.activeBoosts()).toHaveLength(1);
    expect(lo.boostSecondsLeft('production')).toBe(14 * 60);
    lo.activateBoost('production', 3, 5); // different strength: separate boost
    expect(lo.activeBoosts()).toHaveLength(2);
    expect(lo.boostMultiplier('production')).toBe(3);
    g.clock.now += 15 * 60_000;
    expect(lo.activeBoosts()).toHaveLength(0);
    tickMeta(g, 1.5);
    expect(g.game.state.liveops.boosts).toHaveLength(0); // pruned from the save
  });

  it('VIP: active until `until`, daily Nova granted automatically once per local day', () => {
    const g = makeGame();
    const lo = g.game.sys.liveops;
    expect(lo.isVip()).toBe(false);
    g.game.state.liveops.vip.until = g.clock.now + 3 * DAY;
    expect(lo.isVip()).toBe(true);
    expect(lo.vipDaysLeft()).toBe(3);
    tickMeta(g, 1.5);
    expect(lo.nova()).toBe(g.game.data.vip.dailyNova);
    tickMeta(g, 5);
    expect(lo.nova()).toBe(g.game.data.vip.dailyNova); // not again today
    g.clock.now += DAY;
    tickMeta(g, 1.5);
    expect(lo.nova()).toBe(g.game.data.vip.dailyNova * 2);
    g.clock.now += 3 * DAY;
    expect(lo.isVip()).toBe(false);
    tickMeta(g, 1.5);
    expect(lo.nova()).toBe(g.game.data.vip.dailyNova * 2);
  });
});

describe('liveops: daily login (7-day cycle)', () => {
  it('claims once per local day and walks the 7-day cycle; the streak never resets', () => {
    const g = makeGame();
    const lo = g.game.sys.liveops;
    const rewards = g.game.data.dailyRewards;
    const days: number[] = [];
    g.game.bus.on('daily:claimed', (e) => days.push(e.day));
    expect(lo.dailyAvailable()).toBe(true);
    expect(lo.dailyDay()).toBe(1);

    const r1 = lo.claimDaily();
    expect(r1).toEqual(rewards[0]);
    expect(lo.dailyAvailable()).toBe(false);
    expect(lo.claimDaily()).toBeNull(); // once per day
    expect(g.game.state.resources.amounts.wood).toBeGreaterThanOrEqual(100); // D1 resources arrived

    g.clock.now += 2 * DAY; // missed a day: no reset, just the next step
    expect(lo.dailyAvailable()).toBe(true);
    expect(lo.dailyDay()).toBe(2);
    for (let d = 2; d <= 8; d++) {
      expect(lo.claimDaily()).not.toBeNull();
      g.clock.now += DAY;
    }
    expect(days).toEqual([1, 2, 3, 4, 5, 6, 7, 1]); // day 8 wraps to day 1 of the cycle
    expect(g.game.state.liveops.daily.streak).toBe(8);
    expect(g.game.state.liveops.nova).toBeGreaterThan(0);
  });

  it('pays the reward through game.grant (Nova on D3, colonist crate on D4)', () => {
    const g = makeGame();
    const grant = vi.spyOn(g.game, 'grant');
    const lo = g.game.sys.liveops;
    const rewards = g.game.data.dailyRewards;
    for (let i = 0; i < 4; i++) {
      lo.claimDaily();
      g.clock.now += DAY;
    }
    expect(grant).toHaveBeenCalledTimes(4);
    // the 7-day brief: D3 is a Nova day, D4 a colonist crate day (amounts come from the content)
    expect(rewards[2].nova).toBeGreaterThan(0);
    expect(rewards[3].colonist).toBeTruthy();
    expect(grant.mock.calls[2][0]).toEqual(rewards[2]);
    expect(grant.mock.calls[3][0]).toEqual(rewards[3]);
    expect(grant.mock.calls[3][1]).toBe('daily');
  });

  it('VIP doubles the daily reward', () => {
    const g = makeGame();
    const lo = g.game.sys.liveops;
    const d3 = g.game.data.dailyRewards[2]; // D3 is a Nova-only day
    expect(Object.keys(d3)).toEqual(['nova']);
    expect(g.game.data.vip.dailyRewardMult).toBe(2);
    g.game.state.liveops.daily.streak = 2; // D3
    g.game.state.liveops.vip.until = g.clock.now + DAY * 5;
    g.game.state.liveops.vip.lastDailyNova = '2026-06-15'; // isolate from the VIP daily Nova
    expect(lo.claimDaily()).toEqual({ nova: d3.nova! * 2 });
    expect(lo.nova()).toBe(d3.nova! * 2);
  });

  it('opens the daily panel shortly after launch on a returning player, not on a brand-new game', () => {
    const fresh = makeGame();
    const opened: string[] = [];
    fresh.game.bus.on('ui:open', (e) => opened.push(e.panel));
    tickMeta(fresh, 10);
    expect(opened).not.toContain('daily');

    const state = JSON.parse(JSON.stringify(fresh.game.state));
    const next = makeGame({ state, at: T0 + DAY });
    next.game.pendingOffline = null; // no Welcome Back to wait for (covered by the next test)
    const opened2: string[] = [];
    next.game.bus.on('ui:open', (e) => opened2.push(e.panel));
    tickMeta(next, 6);
    expect(opened2).toContain('daily');
  });

  it('waits for the Welcome Back panel before opening the daily panel', () => {
    const fresh = makeGame();
    const state = JSON.parse(JSON.stringify(fresh.game.state));
    const next = makeGame({ state, at: T0 + DAY, start: false });
    next.game.start();
    next.game.pendingOffline = { seconds: 60, away: 60, gains: { wood: 5 }, rp: 0 };
    const opened: string[] = [];
    next.game.bus.on('ui:open', (e) => opened.push(e.panel));
    tickMeta(next, 8);
    expect(opened).not.toContain('daily');
    next.game.sys.liveops.claimOffline(false);
    tickMeta(next, 8);
    expect(opened).toContain('daily');
  });
});

describe('liveops: lucky wheel', () => {
  it('gives one free spin a day, returns the index at once and pays after the animation delay', () => {
    const g = makeGame();
    const lo = g.game.sys.liveops;
    const results: number[] = [];
    g.game.bus.on('spin:result', (e) => results.push(e.index));
    expect(lo.canSpinFree()).toBe(true);
    let index: number | null = null;
    void lo.spin(false).then((i) => (index = i));
    return Promise.resolve().then(() => {
      expect(index).not.toBeNull();
      expect(results).toEqual([index]);
      expect(lo.canSpinFree()).toBe(false);
      // a second free spin the same day is refused
      let second: number | null | undefined;
      void lo.spin(false).then((i) => (second = i));
      return Promise.resolve().then(() => {
        expect(second).toBeNull();
        expect(results).toHaveLength(1);
        // reward lands only after the animation delay
        const granted = vi.spyOn(g.game, 'grant');
        tickMeta(g, SPIN_GRANT_DELAY - 1);
        expect(granted).not.toHaveBeenCalled();
        tickMeta(g, 2);
        expect(granted).toHaveBeenCalledTimes(1);
        expect(granted.mock.calls[0][0]).toEqual(g.game.data.spinSegments[index!].reward);
        expect(granted.mock.calls[0][1]).toBe('spin');
        // new day: free again
        g.clock.now += DAY;
        expect(lo.canSpinFree()).toBe(true);
      });
    });
  });

  it('is deterministic for a given seed and follows the segment weights', async () => {
    const run = async (seed: number, n: number) => {
      const g = makeGame({ seed });
      const lo = g.game.sys.liveops;
      const out: number[] = [];
      for (let i = 0; i < n; i++) {
        g.game.state.liveops.spin.lastFree = null;
        out.push((await lo.spin(false))!);
        g.game.state.liveops.pendingSpins = [];
      }
      return out;
    };
    expect(await run(5, 40)).toEqual(await run(5, 40));
    expect(await run(5, 40)).not.toEqual(await run(6, 40));

    const sample = await run(11, 4000);
    const segs = makeGame().game.data.spinSegments;
    const total = segs.reduce((s, x) => s + x.weight, 0);
    segs.forEach((seg, i) => {
      const expected = seg.weight / total;
      const got = sample.filter((x) => x === i).length / sample.length;
      expect(Math.abs(got - expected)).toBeLessThan(0.03);
    });
  });

  it('extra spins include the rewarded ad, limited per day by the extra_spin placement', async () => {
    const g = makeGame();
    const lo = g.game.sys.liveops;
    const limit = g.game.data.ad('extra_spin')!.dailyLimit;
    expect(limit).toBe(3);
    const results: number[] = [];
    g.game.bus.on('spin:result', (e) => results.push(e.index));
    expect(lo.extraSpinsLeft()).toBe(3);
    for (let i = 0; i < limit; i++) {
      const idx = await lo.spin(true);
      expect(idx).toBe(results[i]);
      expect(idx).toBeGreaterThanOrEqual(0);
    }
    expect(g.services.showRewarded).toHaveBeenCalledTimes(3); // every extra spin was preceded by an ad
    expect(g.game.state.liveops.spin.adSpins).toBe(3);
    expect(g.game.state.liveops.ads.counts.extra_spin).toBe(3);
    expect(lo.extraSpinsLeft()).toBe(0);
    expect(lo.canWatchAd('extra_spin')).toBe(false);
    expect(await lo.spin(true)).toBeNull();
    expect(await lo.watchAd('extra_spin')).toBe(false);
    expect(g.services.showRewarded).toHaveBeenCalledTimes(3); // no ad is shown when there is nothing to win
    g.clock.now += DAY;
    expect(lo.extraSpinsLeft()).toBe(3);
    expect(typeof (await lo.spin(true))).toBe('number');
  });

  it('a skipped or failed extra-spin ad gives no spin and uses nothing up', async () => {
    const g = makeGame();
    const lo = g.game.sys.liveops;
    const results: number[] = [];
    g.game.bus.on('spin:result', (e) => results.push(e.index));
    g.services.adResult = 'skipped';
    expect(await lo.spin(true)).toBeNull();
    g.services.adResult = 'unavailable';
    expect(await lo.spin(true)).toBeNull();
    expect(results).toHaveLength(0);
    expect(g.game.state.liveops.spin.adSpins).toBe(0);
    expect(lo.extraSpinsLeft()).toBe(3);
  });

  it('watchAd("extra_spin") and spin(true) share one spin: no double spin from either entry point', async () => {
    const g = makeGame();
    const lo = g.game.sys.liveops;
    const results: number[] = [];
    g.game.bus.on('spin:result', (e) => results.push(e.index));
    expect(await lo.watchAd('extra_spin')).toBe(true);
    expect(results).toHaveLength(1);
    expect(g.game.state.liveops.spin.adSpins).toBe(1);
    expect(await lo.spin(true)).toBe(results[1]);
    expect(results).toHaveLength(2);
    expect(g.game.state.liveops.spin.adSpins).toBe(2);
    expect(g.services.showRewarded).toHaveBeenCalledTimes(2);
  });

  it('a spin reward survives quitting mid-animation', async () => {
    const g = makeGame();
    await g.game.sys.liveops.spin(false);
    expect(g.game.state.liveops.pendingSpins).toHaveLength(1);
    const state = JSON.parse(JSON.stringify(g.game.state));
    const g2 = makeGame({ state, at: g.clock.now });
    const granted = vi.spyOn(g2.game, 'grant');
    tickMeta(g2, SPIN_GRANT_DELAY + 2);
    expect(granted).toHaveBeenCalledTimes(1);
    expect(g2.game.state.liveops.pendingSpins).toHaveLength(0);
  });
});

describe('liveops: season pass', () => {
  it('earns XP from play events and levels up at xpPerLevel', () => {
    const g = makeGame();
    const { game } = g;
    const lo = game.sys.liveops;
    const xp = game.data.season.xp;
    const per = game.data.season.xpPerLevel;
    const levelUps: number[] = [];
    game.bus.on('season:levelUp', (e) => levelUps.push(e.level));
    expect(game.state.liveops.season.id).toBe(game.data.season.id);
    expect(game.state.liveops.season.xp).toBe(0);

    const bus = game.bus;
    bus.emit('gather:hit', { node: 1, model: 'tree', x: 0, z: 0, drop: { wood: 3 } });
    bus.emit('building:completed', { id: 1, def: 'shelter' });
    bus.emit('craft:completed', { recipe: 'x' });
    bus.emit('alien:killed', { id: 1, def: 'crawler', x: 0, z: 0, by: 'turret' });
    bus.emit('combat:ended', { wave: 1, kills: 1, reward: {} });
    bus.emit('mission:claimed', { id: 'm' });
    bus.emit('world:regionDiscovered', { id: 'r' });
    bus.emit('research:completed', { id: 'x' });
    const expected = xp.gather + xp.build + xp.craft + xp.kill + xp.defend + xp.mission + xp.discover + xp.research;
    expect(game.state.liveops.season.xp).toBe(expected);
    expect(lo.seasonLevel()).toBe(Math.floor(expected / per));

    lo.addXp(per * 3);
    expect(lo.seasonLevel()).toBe(Math.floor((expected + per * 3) / per));
    expect(levelUps).toEqual(Array.from({ length: lo.seasonLevel() }, (_, i) => i + 1));
    const p = lo.seasonProgress();
    expect(p.level).toBe(lo.seasonLevel());
    expect(p.xpInLevel).toBe(game.state.liveops.season.xp - p.level * per);
    lo.addXp(-5);
    lo.addXp(0);
    expect(game.state.liveops.season.xp).toBe(expected + per * 3);
  });

  it('keeps fractional gather XP (a hit is worth a fraction of a point) instead of rounding it away', () => {
    const g = makeGame();
    const { game } = g;
    const lo = game.sys.liveops;
    const { gather } = game.data.season.xp;
    const per = game.data.season.xpPerLevel;
    expect(gather).toBeGreaterThan(0);
    expect(Number.isInteger(gather)).toBe(false);
    const hit = () => game.bus.emit('gather:hit', { node: 1, model: 'tree', x: 0, z: 0, drop: { wood: 1 } });
    const hitsPerLevel = Math.ceil(per / gather);
    for (let i = 0; i < hitsPerLevel - 1; i++) hit();
    expect(game.state.liveops.season.xp).toBeCloseTo((hitsPerLevel - 1) * gather, 9);
    expect(lo.seasonLevel()).toBe(0);
    const p = lo.seasonProgress();
    expect(p.xpInLevel).toBeCloseTo(p.xp, 9);
    hit();
    expect(lo.seasonLevel()).toBe(1);
    // the fraction survives a save / load
    const state = JSON.parse(JSON.stringify(game.state));
    const g2 = makeGame({ state, at: g.clock.now });
    expect(g2.game.state.liveops.season.xp).toBeCloseTo(hitsPerLevel * gather, 9);
    expect(g2.game.sys.liveops.seasonLevel()).toBe(1);
  });

  it('caps the level at the track length', () => {
    const g = makeGame();
    const lo = g.game.sys.liveops;
    lo.addXp(1_000_000);
    expect(lo.seasonLevel()).toBe(g.game.data.season.levels.length);
    expect(lo.seasonProgress().xpInLevel).toBe(g.game.data.season.xpPerLevel);
  });

  it('claims free rewards by level, once; premium needs the premium track', async () => {
    const g = makeGame();
    const { game } = g;
    const lo = game.sys.liveops;
    const per = game.data.season.xpPerLevel;
    expect(lo.claimSeason(1, false)).toBe(false); // not reached yet
    lo.addXp(per * 5 + 1);
    expect(lo.seasonClaimable()).toBe(5);
    const wood = game.state.resources.amounts.wood ?? 0;
    expect(lo.claimSeason(1, false)).toBe(true);
    expect(game.state.resources.amounts.wood ?? 0).toBeGreaterThan(wood);
    expect(lo.claimSeason(1, false)).toBe(false); // already claimed
    expect(lo.claimSeason(6, false)).toBe(false); // not reached
    expect(lo.claimSeason(0, false)).toBe(false);
    expect(lo.claimSeason(999, false)).toBe(false);
    expect(lo.claimSeason(5, false)).toBe(true);
    const lv5 = game.data.season.levels[4]; // every 5th level pays Nova on both tracks
    expect(lv5.free.nova).toBeGreaterThan(0);
    expect(lv5.premium.nova).toBeGreaterThan(0);
    expect(game.state.liveops.nova).toBe(lv5.free.nova);

    expect(lo.claimSeason(1, true)).toBe(false); // premium locked
    expect(await lo.buy('season_pass_premium')).toBe(true);
    expect(game.state.liveops.season.premium).toBe(true);
    expect(lo.claimSeason(1, true)).toBe(true);
    expect(lo.claimSeason(1, true)).toBe(false);
    expect(lo.claimSeason(5, true)).toBe(true);
    expect(game.state.liveops.nova).toBe(lv5.free.nova! + lv5.premium.nova!);
    expect(lo.claimAllSeason()).toBe(3 + 3); // levels 2-4 free + premium, level 5 both already claimed
    expect(lo.seasonClaimable()).toBe(0);
  });

  it('a new season resets progress and premium', () => {
    const g = makeGame();
    g.game.state.liveops.season = { id: 'old_season', xp: 999, premium: true, claimedFree: [1], claimedPremium: [1] };
    const state = JSON.parse(JSON.stringify(g.game.state));
    const g2 = makeGame({ state, at: g.clock.now });
    expect(g2.game.state.liveops.season).toEqual({ id: g2.game.data.season.id, xp: 0, premium: false, claimedFree: [], claimedPremium: [] });
  });
});

describe('liveops: rewarded ads', () => {
  it('enforces daily limits and cooldowns (production_boost: 6/day, 60 s apart)', async () => {
    const g = makeGame();
    const lo = g.game.sys.liveops;
    const def = g.game.data.ad('production_boost')!;
    expect(def.dailyLimit).toBe(6);
    expect(def.cooldown).toBe(60);
    expect(lo.canWatchAd('production_boost')).toBe(true);
    expect(await lo.watchAd('production_boost')).toBe(true);
    // cooldown
    expect(lo.canWatchAd('production_boost')).toBe(false);
    expect(lo.adCooldownLeft('production_boost')).toBe(60);
    expect(await lo.watchAd('production_boost')).toBe(false);
    expect(g.services.showRewarded).toHaveBeenCalledTimes(1); // the player was never shown a useless ad
    g.clock.now += 30_000;
    expect(lo.adCooldownLeft('production_boost')).toBe(30);
    g.clock.now += 31_000;
    expect(lo.canWatchAd('production_boost')).toBe(true);
    for (let i = 1; i < 6; i++) {
      expect(await lo.watchAd('production_boost')).toBe(true);
      g.clock.now += 61_000;
    }
    expect(lo.adsToday('production_boost')).toBe(6);
    expect(lo.adsLeft('production_boost')).toBe(0);
    expect(lo.canWatchAd('production_boost')).toBe(false);
    expect(await lo.watchAd('production_boost')).toBe(false);
    // next local day: counters reset
    g.clock.now += DAY;
    expect(lo.adsToday('production_boost')).toBe(0);
    expect(lo.canWatchAd('production_boost')).toBe(true);
    expect(g.game.state.stats.adsWatched).toBe(6);
    expect(g.game.state.liveops.ads.total).toBe(6);
  });

  it('never offers an ad the ad service cannot show right now', async () => {
    const g = makeGame();
    const lo = g.game.sys.liveops;
    let ready = false;
    g.game.services.ads = { isReady: () => ready, showRewarded: g.services.showRewarded as never };
    expect(lo.canWatchAd('production_boost')).toBe(false);
    ready = true;
    expect(lo.canWatchAd('production_boost')).toBe(true);
    expect(await lo.watchAd('production_boost')).toBe(true);
  });

  it('unlimited placements (offline_double, invasion_bonus) have no limit or cooldown', () => {
    const g = makeGame();
    const lo = g.game.sys.liveops;
    expect(lo.adsLeft('offline_double')).toBe(Infinity);
    expect(lo.adCooldownLeft('offline_double')).toBe(0);
    expect(lo.canWatchAd('nope')).toBe(false);
  });

  it('emits ad:started / ad:rewarded, pauses the game while the ad plays and then resumes', async () => {
    const g = makeGame();
    const ev: string[] = [];
    g.game.bus.on('ad:started', (e) => ev.push(`started:${e.placement}`));
    g.game.bus.on('ad:rewarded', (e) => ev.push(`rewarded:${e.placement}`));
    g.game.bus.on('ad:failed', (e) => ev.push(`failed:${e.placement}`));
    let pausedDuring = false;
    g.services.showRewarded.mockImplementation(async () => {
      pausedDuring = g.game.isPaused();
      return 'rewarded';
    });
    expect(await g.game.sys.liveops.watchAd('production_boost')).toBe(true);
    expect(pausedDuring).toBe(true);
    expect(g.game.isPaused()).toBe(false);
    expect(ev).toEqual(['started:production_boost', 'rewarded:production_boost']);
  });

  it('a skipped or unavailable ad gives nothing, costs no daily use and emits ad:failed', async () => {
    const g = makeGame();
    const lo = g.game.sys.liveops;
    const failed: string[] = [];
    g.game.bus.on('ad:failed', (e) => failed.push(e.placement));
    const toasts: string[] = [];
    g.game.bus.on('ui:toast', (e) => toasts.push(e.text));
    g.services.adResult = 'skipped';
    expect(await lo.watchAd('production_boost')).toBe(false);
    g.services.adResult = 'unavailable';
    expect(await lo.watchAd('production_boost')).toBe(false);
    expect(failed).toEqual(['production_boost', 'production_boost']);
    expect(lo.activeBoosts()).toHaveLength(0);
    expect(lo.adsToday('production_boost')).toBe(0);
    expect(lo.adCooldownLeft('production_boost')).toBe(0);
    expect(toasts.filter((t) => t.includes('No video'))).toHaveLength(1); // only "unavailable" explains itself
    expect(g.game.isPaused()).toBe(false);
    // a throwing ad service is treated as unavailable
    g.services.showRewarded.mockRejectedValueOnce(new Error('boom'));
    expect(await lo.watchAd('production_boost')).toBe(false);
    expect(g.game.isPaused()).toBe(false);
  });

  it('does not run two ads at once', async () => {
    const g = makeGame();
    const lo = g.game.sys.liveops;
    let release: (v: 'rewarded') => void = () => {};
    g.services.showRewarded.mockImplementation(() => new Promise((r) => (release = r as never)));
    const first = lo.watchAd('production_boost');
    expect(await lo.watchAd('research_bonus')).toBe(false);
    release('rewarded');
    expect(await first).toBe(true);
  });

  describe('reward application', () => {
    it('offline_double: doubles the offline summary exactly once', async () => {
      const g = makeGame();
      const { game } = g;
      const lo = game.sys.liveops;
      expect(lo.canWatchAd('offline_double')).toBe(false); // nothing to double
      const summary: OfflineSummary = { seconds: 3600, away: 4000, gains: { wood: 50, stone: 20 }, rp: 10 };
      game.pendingOffline = summary;
      const apply = vi.spyOn(game.sys.economy, 'applyOffline');
      const claimed = events(g, 'offline:claimed');
      expect(lo.canWatchAd('offline_double')).toBe(true);
      expect(await lo.watchAd('offline_double')).toBe(true);
      expect(apply).toHaveBeenCalledWith(summary, 2);
      expect(game.pendingOffline).toBeNull();
      expect(claimed).toEqual([{ doubled: true }]);
      expect(game.state.research.points).toBe(20);
      expect(game.state.resources.amounts.stone).toBe(40);
      expect(await lo.watchAd('offline_double')).toBe(false);
      lo.claimOffline(true); // nothing pending: no-op
      expect(apply).toHaveBeenCalledTimes(1);
    });

    it('claimOffline(false) applies the summary once at 1x', () => {
      const g = makeGame();
      const { game } = g;
      game.pendingOffline = { seconds: 100, away: 100, gains: { wood: 30 }, rp: 5 };
      const claimed = events(g, 'offline:claimed');
      const wood = game.state.resources.amounts.wood ?? 0;
      game.sys.liveops.claimOffline(false);
      expect(game.state.resources.amounts.wood).toBe(wood + 30);
      expect(game.state.research.points).toBe(5);
      expect(claimed).toEqual([{ doubled: false }]);
      game.sys.liveops.claimOffline(false);
      expect(game.state.resources.amounts.wood).toBe(wood + 30);
    });

    it('production_boost: 2x production for 10 minutes', async () => {
      const g = makeGame();
      await g.game.sys.liveops.watchAd('production_boost');
      const b = g.game.sys.liveops.activeBoosts()[0];
      expect(b).toMatchObject({ kind: 'production', mult: 2 });
      expect(b.until - g.clock.now).toBe(10 * 60_000);
    });

    it('drone_assistant: drone boost for 5 minutes', async () => {
      const g = makeGame();
      await g.game.sys.liveops.watchAd('drone_assistant');
      const b = g.game.sys.liveops.activeBoosts()[0];
      expect(b.kind).toBe('drone');
      expect(b.until - g.clock.now).toBe(5 * 60_000);
    });

    it('instant_craft: finishes the given job, only offered when a job exists', async () => {
      const g = makeGame();
      const { game } = g;
      const finish = vi.spyOn(game.sys.crafting, 'finishNow').mockReturnValue(true);
      expect(game.sys.liveops.canWatchAd('instant_craft')).toBe(false);
      expect(await game.sys.liveops.watchAd('instant_craft', 3)).toBe(false);
      game.state.crafting.queue.push({ id: 3, recipe: 'r', remaining: 30, total: 30 }, { id: 4, recipe: 'r', remaining: 30, total: 30 });
      expect(game.sys.liveops.canWatchAd('instant_craft')).toBe(true);
      expect(await game.sys.liveops.watchAd('instant_craft', 4)).toBe(true);
      expect(finish).toHaveBeenCalledWith(4);
      expect(await game.sys.liveops.watchAd('instant_craft', 99)).toBe(false); // unknown job
      g.clock.now += 60_000;
      expect(await game.sys.liveops.watchAd('instant_craft')).toBe(true); // defaults to the first queued job
      expect(finish).toHaveBeenLastCalledWith(3);
    });

    it('free_crate: a tier-scaled crate and the timed crate restarts', async () => {
      const g = makeGame();
      const { game } = g;
      const lo = game.sys.liveops;
      game.derived.capacity.wood = 10_000;
      const before = game.state.resources.amounts.wood ?? 0;
      expect(lo.freeCrateReady()).toBe(true); // fresh game: ready immediately
      expect(await lo.watchAd('free_crate')).toBe(true);
      const t0 = game.state.resources.amounts.wood! - before;
      expect(t0).toBe(crateReward(game.data, 0).resources!.wood! * 2); // the timed crate was ready: the ad doubles it
      expect(lo.freeCrateReady()).toBe(false);
      expect(game.state.liveops.freeCrateAt).toBe(g.clock.now + game.data.balance.freeCrateHours * 3_600_000);
      // tier scaling
      game.state.colony.tier = 3;
      g.clock.now += 700_000;
      const w1 = game.state.resources.amounts.wood!;
      await lo.watchAd('free_crate'); // not ready: single crate, timer untouched
      const t3 = game.state.resources.amounts.wood! - w1;
      expect(t3).toBe(crateReward(game.data, 3).resources!.wood!);
      expect(t3).toBeGreaterThan(crateReward(game.data, 0).resources!.wood!);
      expect(game.state.liveops.freeCrateAt).toBe(T0 + game.data.balance.freeCrateHours * 3_600_000);
    });

    it('free crate (no ad): needs the timer, restarts it, higher tiers add intermediate resources', () => {
      const g = makeGame();
      const { game } = g;
      const lo = game.sys.liveops;
      expect(lo.openFreeCrate(false)).not.toBeNull();
      expect(lo.openFreeCrate(false)).toBeNull();
      expect(lo.freeCrateSeconds()).toBe(game.data.balance.freeCrateHours * 3600);
      g.clock.now += game.data.balance.freeCrateHours * 3_600_000;
      expect(lo.freeCrateReady()).toBe(true);
      expect(crateReward(game.data, 0).resources!.iron).toBeUndefined();
      expect(crateReward(game.data, 2).resources!.iron).toBeGreaterThan(0);
      expect(crateReward(game.data, 4).resources!.crystal).toBeGreaterThan(0);
    });

    it('free crate readiness is announced when it turns ready while playing', () => {
      const g = makeGame();
      g.game.sys.liveops.openFreeCrate(false);
      const toasts: string[] = [];
      g.game.bus.on('ui:toast', (e) => toasts.push(e.text));
      g.clock.now += 4 * 3_600_000 + 1000;
      tickMeta(g, 2);
      expect(toasts.some((t) => t.includes('free crate is ready'))).toBe(true);
    });

    it('recruit_refresh: forces a new candidate pool', async () => {
      const g = makeGame();
      const refresh = vi.spyOn(g.game.sys.colonists, 'refreshCandidates').mockImplementation(() => {});
      expect(await g.game.sys.liveops.watchAd('recruit_refresh')).toBe(true);
      expect(refresh).toHaveBeenCalledWith(true);
    });

    it('invasion_bonus: doubles the pending victory chest, only offered when one is waiting', async () => {
      const g = makeGame();
      const { game } = g;
      const claim = vi.spyOn(game.sys.combat, 'claimReward').mockReturnValue(true);
      expect(game.sys.liveops.canWatchAd('invasion_bonus')).toBe(false);
      expect(await game.sys.liveops.watchAd('invasion_bonus')).toBe(false);
      game.state.combat.pendingReward = { resources: { wood: 10 } };
      expect(game.sys.liveops.canWatchAd('invasion_bonus')).toBe(true);
      expect(await game.sys.liveops.watchAd('invasion_bonus')).toBe(true);
      expect(claim).toHaveBeenCalledWith(true);
    });

    it('research_bonus: tier-scaled research points', async () => {
      const g = makeGame();
      const { game } = g;
      expect(await game.sys.liveops.watchAd('research_bonus')).toBe(true);
      expect(game.state.research.points).toBe(researchGrantRp(0));
      game.state.colony.tier = 4;
      g.clock.now += 200_000;
      await game.sys.liveops.watchAd('research_bonus');
      expect(game.state.research.points).toBe(researchGrantRp(0) + researchGrantRp(4));
      expect(researchGrantRp(4)).toBeGreaterThan(researchGrantRp(1));
    });
  });
});

describe('liveops: unclaimed offline earnings survive quitting', () => {
  const summary = () => ({ seconds: 3600, away: 4000, gains: { wood: 50 }, rp: 10 });

  it('keeps the summary in the save until it is claimed', () => {
    const g = makeGame();
    g.game.pendingOffline = summary();
    g.game.bus.emit('offline:ready', { seconds: 3600, gains: { wood: 50 }, rp: 10 });
    expect(g.game.state.liveops.pendingOffline).toEqual(summary());
    g.game.sys.liveops.claimOffline(false);
    expect(g.game.state.liveops.pendingOffline).toBeNull();
  });

  it('offers it again after a restart when nothing new was earned, and a claim clears it for good', () => {
    const g = makeGame();
    g.game.pendingOffline = summary();
    g.game.bus.emit('offline:ready', { seconds: 3600, gains: { wood: 50 }, rp: 10 });
    const state = JSON.parse(JSON.stringify(g.game.state)); // the app was killed here
    const g2 = makeGame({ state, at: g.clock.now + 5000, start: false });
    const ready: unknown[] = [];
    g2.game.bus.on('offline:ready', (e) => ready.push(e));
    // (this launch has no new offline gains: Game.start() only computes them when there are some)
    g2.game.start();
    expect(g2.game.pendingOffline).toEqual(summary());
    expect(ready).toEqual([{ seconds: 3600, gains: { wood: 50 }, rp: 10 }]); // announced exactly once, not doubled
    expect(g2.game.state.liveops.pendingOffline).toEqual(summary());
    const wood = g2.game.state.resources.amounts.wood ?? 0;
    g2.game.sys.liveops.claimOffline(true);
    expect(g2.game.state.resources.amounts.wood).toBe(wood + 100);
    expect(g2.game.state.liveops.pendingOffline).toBeNull();
    g2.game.bus.emit('game:ready', { fresh: false });
    expect(ready).toHaveLength(1);
    expect(g2.game.pendingOffline).toBeNull(); // claimed: never offered again
  });

  it('merges leftovers into a new summary so nothing is lost', () => {
    const g = makeGame();
    g.game.state.liveops.pendingOffline = { seconds: 1000, away: 1100, gains: { wood: 40, stone: 5 }, rp: 3 };
    g.game.pendingOffline = { seconds: 500, away: 500, gains: { wood: 10 }, rp: 2 };
    g.game.bus.emit('offline:ready', { seconds: 500, gains: g.game.pendingOffline.gains, rp: 2 });
    expect(g.game.pendingOffline).toEqual({ seconds: 1500, away: 1600, gains: { wood: 50, stone: 5 }, rp: 5 });
    expect(g.game.state.liveops.pendingOffline).toEqual(g.game.pendingOffline);
  });
});

describe('liveops: shop & IAP', () => {
  it('grants a consumable pack, records it and reports the purchase', async () => {
    const g = makeGame();
    const { game } = g;
    const bought: string[] = [];
    game.bus.on('iap:purchased', (e) => bought.push(e.product));
    expect(await game.sys.liveops.buy('nova_crystals_small')).toBe(true);
    expect(game.state.liveops.nova).toBe(500);
    expect(bought).toEqual(['nova_crystals_small']);
    expect(game.state.liveops.purchases).toEqual([{ id: 'nova_crystals_small', at: T0 }]);
    expect(game.state.stats.purchases).toBe(1);
    // consumables can be bought again
    expect(await game.sys.liveops.buy('nova_crystals_small')).toBe(true);
    expect(game.state.liveops.nova).toBe(1000);
    expect(game.sys.liveops.purchaseCount('nova_crystals_small')).toBe(2);
  });

  it('enforces the per-account limit (Starter Pack once) and grants its contents + cosmetic', async () => {
    const g = makeGame();
    const { game } = g;
    const lo = game.sys.liveops;
    game.derived.capacity.wood = 5000;
    game.derived.capacity.stone = 5000;
    expect(lo.canBuy('nova_starter_pack')).toBe(true);
    expect(await lo.buy('nova_starter_pack')).toBe(true);
    expect(game.state.liveops.nova).toBe(300);
    expect(game.state.resources.amounts.wood).toBeGreaterThanOrEqual(500);
    expect(game.state.liveops.cosmetics.owned).toContain('outfit_pioneer');
    expect(lo.canBuy('nova_starter_pack')).toBe(false);
    const failed: { product: string; reason: string }[] = [];
    game.bus.on('iap:failed', (e) => failed.push(e));
    expect(await lo.buy('nova_starter_pack')).toBe(false);
    expect(failed).toEqual([{ product: 'nova_starter_pack', reason: 'limit' }]);
    expect(game.state.liveops.nova).toBe(300); // not granted twice
    expect(game.state.stats.purchases).toBe(1);
  });

  it('Colony Pass extends VIP by 30 days and stacks on renewal', async () => {
    const g = makeGame();
    const lo = g.game.sys.liveops;
    expect(await lo.buy('colony_pass_monthly')).toBe(true);
    expect(lo.isVip()).toBe(true);
    expect(g.game.state.liveops.vip.until).toBe(T0 + 30 * DAY);
    g.clock.now += 10 * DAY;
    await lo.buy('colony_pass_monthly');
    expect(g.game.state.liveops.vip.until).toBe(T0 + 60 * DAY);
    g.clock.now += 100 * DAY; // lapsed: starts from now
    expect(lo.isVip()).toBe(false);
    await lo.buy('colony_pass_monthly');
    expect(g.game.state.liveops.vip.until).toBe(g.clock.now + 30 * DAY);
  });

  it('a cancelled purchase grants nothing and reports "cancelled"; a failed one warns', async () => {
    const g = makeGame();
    const { game, services } = g;
    const failed: { product: string; reason: string }[] = [];
    game.bus.on('iap:failed', (e) => failed.push(e));
    const toasts: string[] = [];
    game.bus.on('ui:toast', (e) => toasts.push(e.text));
    vi.spyOn(services.iap, 'purchase').mockResolvedValueOnce({ ok: false, productId: 'nova_crystals_small', cancelled: true });
    expect(await game.sys.liveops.buy('nova_crystals_small')).toBe(false);
    expect(toasts).toHaveLength(0);
    vi.spyOn(services.iap, 'purchase').mockResolvedValueOnce({ ok: false, productId: 'nova_crystals_small', error: 'network' });
    expect(await game.sys.liveops.buy('nova_crystals_small')).toBe(false);
    vi.spyOn(services.iap, 'purchase').mockRejectedValueOnce(new Error('store exploded'));
    expect(await game.sys.liveops.buy('nova_crystals_small')).toBe(false);
    expect(failed.map((f) => f.reason)).toEqual(['cancelled', 'network', 'store exploded']);
    expect(toasts).toHaveLength(2);
    expect(game.state.liveops.nova).toBe(0);
    expect(game.state.liveops.purchases).toHaveLength(0);
    expect(await game.sys.liveops.buy('does_not_exist')).toBe(false);
    expect(failed.at(-1)).toEqual({ product: 'does_not_exist', reason: 'unknown_product' });
  });

  it('ignores a second tap while a purchase is in flight', async () => {
    const g = makeGame();
    let finish: (r: { ok: boolean; productId: string }) => void = () => {};
    vi.spyOn(g.services.iap, 'purchase').mockImplementation(() => new Promise((r) => (finish = r)));
    const first = g.game.sys.liveops.buy('nova_crystals_small');
    await Promise.resolve();
    expect(await g.game.sys.liveops.buy('nova_crystals_small')).toBe(false);
    finish({ ok: true, productId: 'nova_crystals_small' });
    expect(await first).toBe(true);
    expect(g.game.state.liveops.nova).toBe(500);
  });

  it('initialises the store with the catalogue and prefers the store price over the fallback', async () => {
    const g = makeGame({ start: false });
    const init = vi.spyOn(g.services.iap, 'init');
    g.game.start();
    expect(init).toHaveBeenCalledTimes(1);
    const ids = (init.mock.calls[0][0] as { id: string }[]).map((p) => p.id);
    expect(ids).toEqual(g.game.data.products.map((p) => p.id));
    const lo = g.game.sys.liveops;
    expect(lo.price('nova_crystals_small')).toBe('$4.99'); // mock store has no price: fallback
    vi.spyOn(g.services.iap, 'products').mockReturnValue([{ id: 'nova_crystals_small', price: '4,99 €', available: true }]);
    expect(lo.price('nova_crystals_small')).toBe('4,99 €');
    vi.spyOn(g.services.iap, 'products').mockReturnValue([{ id: 'nova_crystals_small', price: '', available: false }]);
    expect(lo.price('nova_crystals_small')).toBe('$4.99');
    expect(lo.price('nope')).toBe('');
  });

  it('a store that fails to initialise never blocks the game or purchases', async () => {
    const g = makeGame({ start: false });
    vi.spyOn(g.services.iap, 'init').mockRejectedValue(new Error('offline'));
    g.game.start();
    expect(await g.game.sys.liveops.buy('nova_crystals_small')).toBe(true);
  });

  it('restores non-consumables without duplicating currency, and re-syncs a subscription', async () => {
    const g = makeGame();
    const { game, services } = g;
    vi.spyOn(services.iap, 'restore').mockResolvedValue(['nova_starter_pack', 'season_pass_premium', 'nova_crystals_small', 'unknown']);
    services.iap.subscriptionExpiry = vi.fn().mockResolvedValue(T0 + 12 * DAY);
    await game.sys.liveops.restorePurchases();
    expect(game.state.liveops.nova).toBe(0); // no currency re-granted
    expect(game.state.liveops.cosmetics.owned).toContain('outfit_pioneer');
    expect(game.state.liveops.season.premium).toBe(true);
    expect(game.state.liveops.purchases.map((p) => p.id).sort()).toEqual(['nova_starter_pack', 'season_pass_premium']);
    expect(game.state.liveops.vip.until).toBe(T0 + 12 * DAY);
    await game.sys.liveops.restorePurchases(); // idempotent
    expect(game.state.liveops.purchases).toHaveLength(2);
  });

  it('a failed restore leaves everything untouched', async () => {
    const g = makeGame();
    vi.spyOn(g.services.iap, 'restore').mockRejectedValue(new Error('no network'));
    await g.game.sys.liveops.restorePurchases();
    expect(g.game.state.liveops.purchases).toHaveLength(0);
  });

  it('cosmetics: buy with Nova, then equip one per kind', () => {
    const g = makeGame();
    const lo = g.game.sys.liveops;
    expect(lo.buyCosmetic('theme_sakura')).toBe(false); // not enough Nova
    expect(lo.buyCosmetic('outfit_pioneer')).toBe(false); // Nova price 0: pack/reward only
    lo.addNova(650, 'test');
    expect(lo.buyCosmetic('theme_sakura')).toBe(true);
    expect(lo.nova()).toBe(50);
    expect(lo.buyCosmetic('theme_sakura')).toBe(false); // already owned
    expect(lo.equipCosmetic('outfit_pioneer')).toBe(false); // not owned
    expect(lo.equipCosmetic('theme_sakura')).toBe(true);
    expect(g.game.state.liveops.cosmetics.equipped.base_theme).toBe('theme_sakura');
    lo.unequipCosmetic('base_theme');
    expect(g.game.state.liveops.cosmetics.equipped.base_theme).toBeUndefined();
  });
});

describe('liveops: fresh game setup', () => {
  it('initialises the season, the free crate and places the Lucky Wheel for free near the core', () => {
    const g = makeGame({ start: false });
    const { game } = g;
    const canPlace = vi.spyOn(game.sys.buildings, 'canPlace').mockReturnValue({ ok: true });
    const place = vi.spyOn(game.sys.buildings, 'place').mockImplementation((def) => {
      // placing emits completion events like the real construction system
      game.bus.emit('building:placed', { id: 500, def });
      game.bus.emit('building:completed', { id: 500, def });
      return 500;
    });
    game.start();
    expect(game.state.liveops.season.id).toBe(game.data.season.id);
    expect(game.state.liveops.freeCrateAt).toBe(g.clock.now);
    expect(canPlace).toHaveBeenCalled();
    expect(place).toHaveBeenCalledTimes(1);
    const [def, x, z, rot, opts] = place.mock.calls[0];
    expect(def).toBe('spin_wheel');
    expect(rot).toBe(0);
    expect(opts).toEqual({ free: true, instant: true });
    expect(Math.abs(x - 128)).toBeLessThan(14);
    expect(Math.abs(z - 128)).toBeLessThan(14);
    expect(game.state.liveops.wheelPlaced).toBe(true);
    // the free wheel is not "player progress"
    expect(game.sys.missions.counter('build', 'spin_wheel')).toBe(0);
    expect(game.state.liveops.season.xp).toBe(0);
  });

  it('retries a few times if there was no room, then stops; never re-places on a loaded save', () => {
    const g = makeGame({ start: false });
    const { game } = g;
    vi.spyOn(game.sys.buildings, 'canPlace').mockReturnValue({ ok: false });
    const place = vi.spyOn(game.sys.buildings, 'place');
    game.start();
    expect(place).not.toHaveBeenCalled();
    expect(game.state.liveops.wheelPlaced).toBeUndefined();
    vi.spyOn(game.sys.buildings, 'canPlace').mockReturnValue({ ok: true });
    place.mockReturnValue(501);
    tickMeta(g, 3);
    expect(place).toHaveBeenCalledTimes(1);
    expect(game.state.liveops.wheelPlaced).toBe(true);
    tickMeta(g, 3);
    expect(place).toHaveBeenCalledTimes(1);

    const state = JSON.parse(JSON.stringify(game.state));
    state.liveops.wheelPlaced = false;
    const g2 = makeGame({ state, start: false });
    const place2 = vi.spyOn(g2.game.sys.buildings, 'place');
    g2.game.start();
    tickMeta(g2, 5);
    expect(place2).not.toHaveBeenCalled();
  });

  it('does not place a second wheel if one already exists', () => {
    const g = makeGame({ start: false });
    const { game } = g;
    game.state.buildings.list.push(fakeBuilding('spin_wheel', 3));
    const place = vi.spyOn(game.sys.buildings, 'place');
    game.start();
    expect(place).not.toHaveBeenCalled();
    expect(game.state.liveops.wheelPlaced).toBe(true);
  });
});

describe('liveops helpers', () => {
  it('scaleReward multiplies quantities but keeps a colonist grant single', () => {
    const r = scaleReward({ resources: { wood: 100 }, nova: 15, rp: 3, colonist: 'rare', items: { bandage: 3 }, boost: { kind: 'production', mult: 2, minutes: 30 } }, 2);
    expect(r).toEqual({ resources: { wood: 200 }, nova: 30, rp: 6, colonist: 'rare', items: { bandage: 6 }, boost: { kind: 'production', mult: 2, minutes: 60 } });
    expect(scaleReward({ nova: 5 }, 1)).toEqual({ nova: 5 });
  });

  it('services are untouched by a game without ads configured', () => {
    expect(makeServices().adResult).toBe('rewarded');
  });
});
