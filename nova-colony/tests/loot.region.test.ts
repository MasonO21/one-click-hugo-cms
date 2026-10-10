/**
 * Paid random items by region (sim/meta/lootRegion.ts): where the store's country restricts paid loot boxes
 * (Belgium), bundles holding caches are hidden and refused, and the paid season track pays a cache's Nova value.
 */
import { describe, expect, it } from 'vitest';
import { createDataRegistry } from '../src/data';
import { productHasRandomItems, regionRestrictsPaidRandom, rewardHasRandomItems, seasonAsPaid, withoutRandomItems } from '../src/sim/meta/lootRegion';
import { bonusLine, highlightChips, seasonHighlights } from '../src/ui/logic/season';
import { claimSeasonBonus, seasonTrackXp } from '../src/sim/seasonBonus';
import { makeGame } from './meta.helpers';

const data = createDataRegistry();

describe('paid random items by region', () => {
  it('knows the restricted store countries (alpha-2 and alpha-3, any case)', () => {
    for (const c of ['BE', 'BEL', 'be', ' bel ']) expect(regionRestrictsPaidRandom(c), c).toBe(true);
    for (const c of ['US', 'NL', 'GB', '', null, undefined]) expect(regionRestrictsPaidRandom(c), String(c)).toBe(false);
  });

  it('spots caches in rewards and products', () => {
    expect(productHasRandomItems(data, data.product('bundle_cache_hunter')!)).toBe(true);
    expect(productHasRandomItems(data, data.product('nova_starter_pack')!)).toBe(false); // supply crates are fixed rewards
    expect(rewardHasRandomItems(data, { items: { medkit: 2 } })).toBe(false);
  });

  it('swaps each cache for half its Nova price and keeps everything else', () => {
    const r = withoutRandomItems(data, { nova: 10, items: { chest_nova: 1, chest_supply: 2, medkit: 1 }, rp: 5 });
    expect(r.items).toEqual({ medkit: 1 });
    expect(r.nova).toBe(10 + 1100 + 2 * 30);
    expect(r.rp).toBe(5);
    expect(withoutRandomItems(data, { items: { chest_relic: 1 } })).toEqual({ nova: 500 });
  });

  it('the Season panel shows the premium track as it pays: Nova instead of caches where restricted, free track untouched', () => {
    const season = data.season;
    expect(seasonAsPaid(data, season, true)).toBe(season);
    const paid = seasonAsPaid(data, season, false);
    expect(paid.levels).toHaveLength(season.levels.length);
    for (let i = 0; i < season.levels.length; i++) {
      expect(rewardHasRandomItems(data, paid.levels[i].premium), `level ${i + 1}`).toBe(false);
      expect(paid.levels[i].free).toBe(season.levels[i].free);
    }
    const here = seasonHighlights(data, paid);
    const there = seasonHighlights(data, season);
    expect(there.chests.length).toBeGreaterThan(0);
    expect(here.chests).toEqual([]);
    expect(here.nova).toBeGreaterThan(there.nova);
    expect(highlightChips(here).join(' ')).not.toMatch(/chest|cache/i);
  });

  it('the bonus past level 50 shows as it pays: its Nova where restricted, the Explorer\'s Case elsewhere', () => {
    const season = data.season;
    const last = season.levels.length;
    const paid = seasonAsPaid(data, season, false);
    expect(rewardHasRandomItems(data, season.bonus!.reward)).toBe(true);
    expect(paid.bonus!.xp).toBe(season.bonus!.xp);
    expect(rewardHasRandomItems(data, paid.bonus!.reward)).toBe(false);
    expect(paid.bonus!.reward).toEqual(withoutRandomItems(data, season.bonus!.reward));
    const here = seasonHighlights(data, paid).bonus!;
    expect(here.chest).toBeNull();
    const per = season.bonus!.xp.toLocaleString('en-US');
    expect(bonusLine(data, here, last)).toBe(`${paid.bonus!.reward.nova} Nova every ${per} XP after level ${last}`);
    expect(bonusLine(data, seasonHighlights(data, season).bonus!, last)).toBe(`an Explorer's Case every ${per} XP after level ${last}`);
  });

  it('in Belgium the cache bundle is not offered, the paid track pays Nova instead of caches; elsewhere unchanged', () => {
    const level = data.season.levels.findIndex((l) => Object.keys(l.premium.items ?? {}).some((id) => data.item(id)?.use?.chest)) + 1;
    expect(level).toBeGreaterThan(0);
    for (const country of ['BE', 'US']) {
      const { game } = makeGame();
      (game.services.iap as { storefrontCountry?: () => string | null }).storefrontCountry = () => country;
      const lo = game.sys.liveops;
      const be = country === 'BE';
      expect(lo.paidRandomAllowed()).toBe(!be);
      expect(lo.canBuy('bundle_cache_hunter')).toBe(!be);
      expect(lo.canBuy('nova_crystals_small')).toBe(true);
      game.state.liveops.nova = 5000;
      expect(game.sys.chests.forSale('chest_supply')).toBe(!be);
      expect(game.sys.chests.canAfford('chest_supply')).toBe(!be);
      const nova = game.state.liveops.nova;
      expect(game.sys.chests.buy('chest_supply', false) !== null).toBe(!be);
      expect(game.state.liveops.nova).toBe(be ? nova : nova - 60);
      game.state.liveops.season.premium = true;
      lo.addXp(seasonTrackXp(data.season) + data.season.bonus!.xp);
      const items = () => Object.entries(game.state.player.items).filter(([id, n]) => (n ?? 0) > 0 && data.item(id)?.use?.chest).length;
      const before = items();
      expect(lo.claimSeason(level, true)).toBe(true);
      expect(claimSeasonBonus(game)).toBe(1);
      expect(items() > before).toBe(!be);
    }
  });
});
