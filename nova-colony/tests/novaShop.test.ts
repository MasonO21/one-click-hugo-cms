/**
 * Nova Shop (src/sim/novaShop.ts, data/novaShop.ts): prices, daily caps, availability, what each item does, that
 * Nova is only charged when the effect happened, the `nova_spent` analytics event, and old saves.
 */
import { describe, expect, it, vi } from 'vitest';
import { NOVA_SHOP, EXPEDITION_RUSH } from '../src/data/novaShop';
import { buyNovaItem, cacheReward, expeditionRushPrice, novaBoughtToday, novaOffer, novaOffers, novaShopItem, skipLevelXp } from '../src/sim/novaShop';
import { installAnalyticsHooks } from '../src/platform/analyticsHooks';
import { migrateState } from '../src/platform/saveMigrate';
import { deserializeState, serializeState } from '../src/core/state';
import { DAY, makeGame } from './meta.helpers';
import { HOUR, MIN, crew, makeColony, placeNear } from './expeditions.helpers';

const rich = (g: { game: { state: { liveops: { nova: number } } } }, n = 100_000) => {
  g.game.state.liveops.nova = n;
};

describe('nova shop — catalogue', () => {
  it('ids are unique, prices sane and tuned against the packs ($4.99 = 500 Nova, Acorn chest 60)', () => {
    const ids = NOVA_SHOP.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of NOVA_SHOP) {
      expect(d.nova, d.id).toBeGreaterThan(0);
      expect(d.nova, d.id).toBeLessThanOrEqual(500); // nothing costs more than a $4.99 pouch
      expect(d.dailyCap, d.id).toBeGreaterThanOrEqual(0);
      expect(d.description.length, d.id).toBeGreaterThan(10);
    }
    // the 4-hour boost is cheaper per hour than the 1-hour one
    expect(novaShopItem('nova_production_4h')!.nova / 4).toBeLessThan(novaShopItem('nova_production_1h')!.nova);
    // a season level costs a little more than a tenth of the $4.99 / 10-level Season Boost (500 Nova)
    expect(novaShopItem('nova_season_level')!.nova).toBeGreaterThanOrEqual(50);
    // every kind the brief asked for is there
    for (const k of ['boost', 'expedition', 'cache', 'recruit', 'recruit_refresh', 'merchant', 'spin', 'season_level']) expect(NOVA_SHOP.some((d) => d.kind === k), k).toBe(true);
    for (const b of ['production', 'research', 'gather']) expect(NOVA_SHOP.some((d) => d.boost?.kind === b), b).toBe(true);
  });

  it('the expedition rush scales with the time left (8 h ≈ 100 Nova)', () => {
    expect(expeditionRushPrice(0)).toBe(EXPEDITION_RUSH.base);
    expect(expeditionRushPrice(15 * 60)).toBeLessThan(expeditionRushPrice(3600));
    expect(expeditionRushPrice(3600)).toBeLessThan(expeditionRushPrice(8 * 3600));
    expect(expeditionRushPrice(8 * 3600)).toBeGreaterThanOrEqual(90);
    expect(expeditionRushPrice(8 * 3600)).toBeLessThanOrEqual(110);
  });
});

describe('nova shop — buying', () => {
  it('a boost charges once, runs, emits nova:spent and counts toward the daily cap', () => {
    const g = makeGame();
    const { game } = g;
    rich(g, 1000);
    const spent: { amount: number; reason: string }[] = [];
    game.bus.on('nova:spent', (e) => spent.push(e));
    const res = buyNovaItem(game, 'nova_production_1h');
    expect(res).toMatchObject({ ok: true, price: 80 });
    expect(game.state.liveops.nova).toBe(920);
    expect(game.sys.liveops.boostMultiplier('production')).toBe(2);
    expect(game.sys.liveops.boostSecondsLeft('production')).toBeGreaterThan(3500);
    expect(spent).toEqual([{ amount: 80, reason: 'nova_shop:nova_production_1h', balance: 920 }]);
    expect(novaBoughtToday(game, 'nova_production_1h')).toBe(1);
    // the same boost extends instead of stacking
    buyNovaItem(game, 'nova_production_1h');
    expect(game.sys.liveops.boostMultiplier('production')).toBe(2);
    expect(game.sys.liveops.boostSecondsLeft('production')).toBeGreaterThan(7100);
    expect(novaOffer(game, 'nova_production_1h')!.detail).toMatch(/Running/);
  });

  it('daily caps sell out and come back the next day', () => {
    const g = makeGame();
    rich(g);
    const cap = novaShopItem('nova_research_1h')!.dailyCap;
    for (let i = 0; i < cap; i++) expect(buyNovaItem(g.game, 'nova_research_1h').ok).toBe(true);
    const before = g.game.state.liveops.nova;
    const o = novaOffer(g.game, 'nova_research_1h')!;
    expect(o.ok).toBe(false);
    expect(o.left).toBe(0);
    expect(o.reason).toMatch(/Sold out/);
    expect(buyNovaItem(g.game, 'nova_research_1h').ok).toBe(false);
    expect(g.game.state.liveops.nova).toBe(before);
    g.clock.now += DAY;
    expect(novaOffer(g.game, 'nova_research_1h')!.left).toBe(cap);
    expect(buyNovaItem(g.game, 'nova_research_1h').ok).toBe(true);
  });

  it('never charges without enough Nova', () => {
    const g = makeGame();
    g.game.state.liveops.nova = 10;
    const o = novaOffer(g.game, 'nova_gather_1h')!;
    expect(o.ok).toBe(false);
    expect(o.reason).toMatch(/Not enough Nova/);
    expect(buyNovaItem(g.game, 'nova_gather_1h').ok).toBe(false);
    expect(g.game.state.liveops.nova).toBe(10);
    expect(g.game.sys.liveops.boostMultiplier('gather')).toBe(1);
  });

  it('supply caches scale with the colony tier and only give resources', () => {
    const g = makeGame();
    rich(g);
    const small = novaShopItem('nova_cache_small')!;
    const large = novaShopItem('nova_cache_large')!;
    g.game.state.colony.tier = 0;
    const t0 = cacheReward(g.game, small);
    g.game.state.colony.tier = 3;
    const t3 = cacheReward(g.game, small);
    expect(t3.resources!.wood!).toBeGreaterThan(t0.resources!.wood!);
    expect(t3.resources!.steel).toBeGreaterThan(0);
    expect(t0.xp).toBeUndefined();
    const big = cacheReward(g.game, large);
    expect(big.resources!.wood!).toBe(t3.resources!.wood! * 3);
    // a large cache only accelerates, like the packs: under half of the next tier-up bill at every tier
    for (let t = 1; t <= 5; t++) {
      g.game.state.colony.tier = t;
      const r = cacheReward(g.game, large).resources!;
      const cost = g.game.data.tiers[t + 1].upgradeCost;
      const bill = Object.values(cost).reduce<number>((s, v) => s + (v ?? 0), 0);
      const covered = Object.entries(cost).reduce<number>((s, [k, v]) => s + Math.min(r[k] ?? 0, v ?? 0), 0);
      expect(covered / bill, `tier ${t}`).toBeLessThanOrEqual(0.5);
    }
    g.game.state.colony.tier = 3;
    const res = buyNovaItem(g.game, 'nova_cache_small');
    expect(res.ok).toBe(true);
    expect(res.reward).toEqual(t3);
  });

  it('a spin runs outside the free / ad allowance and pays out after the wheel animation', () => {
    const g = makeGame();
    rich(g);
    const lo = g.game.state.liveops;
    const adSpins = lo.spin.adSpins;
    const res = buyNovaItem(g.game, 'nova_spin');
    expect(res.ok).toBe(true);
    expect(res.spin).toBeGreaterThanOrEqual(0);
    expect(lo.pendingSpins).toHaveLength(1);
    expect(lo.spin.adSpins).toBe(adSpins);
    expect(lo.spin.lastFree).toBeNull(); // the free spin is still there
  });

  it('skipping a season level lands exactly on the next level; past 50 it heads for the next bonus chest', () => {
    const g = makeGame();
    rich(g);
    const lo = g.game.sys.liveops;
    const per = g.game.data.season.xpPerLevel;
    lo.addXp(per * 3 + 123);
    expect(skipLevelXp(g.game)).toBe(per - 123);
    expect(novaOffer(g.game, 'nova_season_level')!.detail).toBe('Level 3 → 4');
    expect(buyNovaItem(g.game, 'nova_season_level').ok).toBe(true);
    expect(lo.seasonLevel()).toBe(4);
    expect(g.game.state.liveops.season.xp).toBe(per * 4);
    // the end of the track: free players are done, premium heads for bonus chests
    lo.addXp(per * 60);
    expect(novaOffer(g.game, 'nova_season_level')!.reason).toMatch(/complete/);
    g.game.state.liveops.season.premium = true;
    expect(novaOffer(g.game, 'nova_season_level')!.ok).toBe(true);
    expect(skipLevelXp(g.game)).toBeGreaterThan(0);
  });
});

describe('nova shop — colony items', () => {
  it('rushes the expedition due home soonest, priced by its time left', () => {
    const c = makeColony({ tier: 2 });
    const { game } = c;
    game.state.liveops.nova = 1000;
    expect(novaOffer(game, 'nova_expedition_rush')!.reason).toMatch(/No squad/);
    const ids = crew(game).map((x) => x.id);
    const a = game.sys.expeditions.launch('cv_debris', [ids[0]])!;
    expect(a).toBeTruthy();
    const o = novaOffer(game, 'nova_expedition_rush')!;
    expect(o.ok).toBe(true);
    expect(o.price).toBe(expeditionRushPrice(game.sys.expeditions.secondsLeft(a)));
    expect(o.detail).toMatch(/left/);
    c.clock.now += 10 * MIN;
    const res = buyNovaItem(game, 'nova_expedition_rush');
    expect(res.ok).toBe(true);
    expect(game.sys.expeditions.get(a.id)!.status).toBe('back');
    expect(game.state.liveops.nova).toBe(1000 - res.price!);
    expect(game.sys.expeditions.collect(a.id)).toBeTruthy();
    void HOUR;
  });

  it('refreshes the recruitment board, recruits an epic colonist when there is a bed, calls a merchant', () => {
    const c = makeColony({ tier: 2 });
    const { game } = c;
    game.state.liveops.nova = 5000;
    const before = game.state.colonists.candidates.map((x) => x.colonist.name).join();
    expect(buyNovaItem(game, 'nova_recruit_refresh').ok).toBe(true);
    expect(game.state.colonists.candidates.map((x) => x.colonist.name).join()).not.toBe(before);

    // epic recruit: only with a free bed
    if (game.sys.colonists.freeBeds() <= 0) {
      expect(novaOffer(game, 'nova_recruit_epic')!.reason).toMatch(/bed/);
      for (let i = 0; i < 3; i++) placeNear(game, 'cabin');
      game.sys.colonists.update(0.1);
    }
    expect(game.sys.colonists.freeBeds()).toBeGreaterThan(0);
    const n = game.state.colonists.list.length;
    expect(buyNovaItem(game, 'nova_recruit_epic').ok).toBe(true);
    expect(game.state.colonists.list.length).toBe(n + 1);
    expect(game.state.colonists.list[n].rarity).toBe('epic');

    // a merchant: spawns the best one for the tier, only one at a time
    const m = novaOffer(game, 'nova_merchant')!;
    expect(m.ok).toBe(true);
    expect(m.detail).toBe('Wandering Merchant');
    expect(buyNovaItem(game, 'nova_merchant').ok).toBe(true);
    expect(game.state.world.events.some((e) => game.data.worldEvent(e.def)?.kind === 'merchant')).toBe(true);
    expect(novaOffer(game, 'nova_merchant')!.reason).toMatch(/already here/);
  });

  it('merchants wait for the tier they visit at; the board needs a Radio Tower', () => {
    const g = makeGame();
    rich(g);
    g.game.state.colony.tier = 0;
    expect(novaOffer(g.game, 'nova_merchant')!.reason).toMatch(/Merchants visit from/);
    expect(novaOffer(g.game, 'nova_recruit_refresh')!.reason).toMatch(/recruitment board/);
    expect(novaOffers(g.game)).toHaveLength(NOVA_SHOP.length);
  });
});

describe('nova shop — analytics and saves', () => {
  it('reports nova_spent with the sink, the item, the amount and the balance', () => {
    const g = makeGame();
    const calls: { name: string; props: Record<string, unknown> }[] = [];
    g.game.services.analytics = { setConsent: vi.fn(), track: vi.fn((name: string, props?: Record<string, unknown>) => void calls.push({ name, props: props ?? {} })), flush: vi.fn(async () => {}) } as never;
    g.game.state.settings.analytics = true;
    g.game.state.settings.analyticsAsked = true;
    installAnalyticsHooks(g.game);
    g.game.state.liveops.nova = 500;
    buyNovaItem(g.game, 'nova_gather_1h');
    g.game.sys.liveops.buyCosmetic('hat_straw');
    const ev = calls.filter((c) => c.name === 'nova_spent').map((c) => c.props);
    expect(ev).toEqual([
      expect.objectContaining({ amount: 60, sink: 'nova_shop', item: 'nova_gather_1h', balance: 440 }),
      expect.objectContaining({ amount: 150, sink: 'cosmetic', item: 'hat_straw', balance: 290 }),
    ]);
  });

  it('an old save without Nova Shop state loads as "nothing bought today"; counts survive a reload', () => {
    const g = makeGame();
    rich(g);
    buyNovaItem(g.game, 'nova_gather_1h');
    const raw = JSON.parse(serializeState(g.game.state));
    const copy = JSON.parse(JSON.stringify(raw));
    delete copy.liveops.novaShop;
    const old = makeGame({ state: migrateState(copy), at: g.clock.now });
    expect(novaBoughtToday(old.game, 'nova_gather_1h')).toBe(0);
    expect(novaOffer(old.game, 'nova_gather_1h')!.left).toBe(novaShopItem('nova_gather_1h')!.dailyCap);
    const again = makeGame({ state: migrateState(deserializeState(JSON.stringify(raw))), at: g.clock.now });
    expect(novaBoughtToday(again.game, 'nova_gather_1h')).toBe(1);
  });
});
