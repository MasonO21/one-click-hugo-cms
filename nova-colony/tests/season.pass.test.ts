/**
 * The richer season pass: bonus chests past level 50 (sim/seasonBonus.ts), the premium highlights the panel shows
 * (computed from the data: ui/logic/season.ts), a reward's hero picture, and the bundles in the Shop (several
 * cosmetics in one product, restored on a new device).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createDataRegistry } from '../src/data';
import { claimSeasonBonus, seasonBonusEarned, seasonBonusReady, seasonBonusView, seasonTrackXp } from '../src/sim/seasonBonus';
import { friendlyAmount, highlightChips, rewardHero, seasonHighlights } from '../src/ui/logic/season';
import { rewardParts } from '../src/ui/logic/rewards';
import { claimableSeason } from '../src/ui/logic/badges';
import { migrateState } from '../src/platform/saveMigrate';
import { serializeState } from '../src/core/state';
import { cosmeticArt } from '../src/ui/art';
import { makeGame } from './meta.helpers';

const data = createDataRegistry();

describe('season bonus chests (past level 50, premium)', () => {
  it('one every bonus.xp past the end of the track', () => {
    const s = data.season;
    const end = seasonTrackXp(s);
    expect(end).toBe(50 * s.xpPerLevel);
    expect(seasonBonusEarned(s, 0)).toBe(0);
    expect(seasonBonusEarned(s, end)).toBe(0);
    expect(seasonBonusEarned(s, end + 399)).toBe(0);
    expect(seasonBonusEarned(s, end + 400)).toBe(1);
    expect(seasonBonusEarned(s, end + 4000)).toBe(10);
    expect(seasonBonusEarned({ ...s, bonus: undefined }, end + 4000)).toBe(0);
  });

  it('only the premium track gets them; claiming grants Moonlit chests, once each, and badges count them', async () => {
    const g = makeGame();
    const { game } = g;
    const lo = game.sys.liveops;
    lo.addXp(seasonTrackXp(game.data.season) + 1000);
    expect(seasonBonusReady(game)).toBe(0);
    expect(claimSeasonBonus(game)).toBe(0);
    expect(seasonBonusView(game)).toMatchObject({ enabled: true, unlocked: true, premium: false, earned: 2, ready: 0, xpInto: 200, xpPer: 400 });

    expect(await lo.buy('season_pass_premium')).toBe(true);
    expect(seasonBonusReady(game)).toBe(2);
    const badge = claimableSeason(game);
    expect(badge).toBe(50 * 2 + 2);
    expect(lo.seasonClaimable()).toBe(badge);
    const before = game.state.player.items.chest_moonlit ?? 0;
    expect(claimSeasonBonus(game)).toBe(2);
    expect(game.state.player.items.chest_moonlit ?? 0).toBe(before + 2);
    expect(seasonBonusReady(game)).toBe(0);
    expect(claimSeasonBonus(game)).toBe(0);
    // more play, another chest (and a toast pointing at the season pass)
    const toasts: string[] = [];
    game.bus.on('ui:toast', (e) => toasts.push(e.text));
    lo.addXp(250);
    expect(seasonBonusReady(game)).toBe(1);
    expect(toasts.some((t) => /bonus chest/i.test(t))).toBe(true);
  });

  it('is kept per season and survives a save; an old save without it loads with none claimed', async () => {
    const g = makeGame();
    const { game } = g;
    await game.sys.liveops.buy('season_pass_premium');
    game.sys.liveops.addXp(seasonTrackXp(game.data.season) + 1200);
    expect(claimSeasonBonus(game)).toBe(3);
    const raw = JSON.parse(serializeState(game.state));
    const again = makeGame({ state: migrateState(JSON.parse(JSON.stringify(raw))), at: g.clock.now });
    expect(seasonBonusReady(again.game)).toBe(0);
    expect(again.game.state.liveops.seasonBonus).toEqual({ id: game.data.season.id, claimed: 3 });
    delete raw.liveops.seasonBonus;
    const old = makeGame({ state: migrateState(raw), at: g.clock.now });
    expect(seasonBonusReady(old.game)).toBe(3);
    // a claim count from another season does not carry over
    old.game.state.liveops.seasonBonus = { id: 'season_0', claimed: 9 };
    expect(seasonBonusReady(old.game)).toBe(3);
  });
});

describe('season premium highlights (computed, never typed in)', () => {
  it('counts the premium track: 10 cosmetics, 8 chests, 3,000 Nova', () => {
    const h = seasonHighlights(data);
    expect(h.cosmetics).toHaveLength(10);
    expect(h.chests).toHaveLength(8);
    expect(h.chests[h.chests.length - 1]).toBe('chest_cosmic');
    const nova = data.season.levels.reduce((s, l) => s + (l.premium.nova ?? 0), 0);
    expect(h.nova).toBe(nova);
    expect(h.exclusive).toBe(3); // bubble helmet, moon bunny, honey frame: only from the season
    expect(h.bonus).toEqual({ xp: 400, chest: 'chest_moonlit' });
    expect(highlightChips(h)).toEqual([`10 cosmetics`, `8 chests`, `${friendlyAmount(nova)} Nova`, `${h.colonists} colonists`]);
  });

  it('follows the data when it changes', () => {
    const season = { ...data.season, levels: data.season.levels.slice(0, 10) };
    const h = seasonHighlights(data, season);
    expect(h.cosmetics).toEqual(['hat_cat_ears', 'outfit_astro']);
    expect(highlightChips(h)[0]).toBe('2 cosmetics');
  });

  it('friendly amounts round down with a "+"', () => {
    expect(friendlyAmount(3000)).toBe('3,000');
    expect(friendlyAmount(3240)).toBe('3,200+');
    expect(friendlyAmount(2950)).toBe('2,900+');
    expect(friendlyAmount(875)).toBe('850+');
    expect(friendlyAmount(42)).toBe('42');
  });

  it('a cell leads with its cosmetic, else its best chest, and the chips keep the rest', () => {
    const lv50 = data.season.levels[49].premium;
    const h = rewardHero(data, lv50)!;
    expect(h.kind).toBe('cosmetic');
    expect(h.id).toBe('outfit_neon_runner');
    expect(h.chest).toBe('chest_cosmic');
    expect(h.rest.cosmetic).toBeUndefined();
    expect(h.rest.items?.chest_cosmic).toBeUndefined();
    expect(h.rest.items?.titan_crate).toBe(1);
    expect(rewardHero(data, data.season.levels[4].premium)).toMatchObject({ kind: 'cosmetic', id: 'hat_cat_ears', chest: null });
    const c = rewardHero(data, { nova: 5, items: { chest_acorn: 2, chest_sunny: 1, bandage: 1 } })!;
    expect(c).toMatchObject({ kind: 'chest', id: 'chest_sunny' });
    expect(c.rest.items).toEqual({ chest_acorn: 2, bandage: 1 });
    expect(rewardHero(data, { nova: 5 })).toBeNull();
  });
});

describe('bundles', () => {
  it('a bundle grants several cosmetics; reward cards show each with its icon', async () => {
    const g = makeGame();
    const { game } = g;
    const p = game.data.product('bundle_cozy_wardrobe')!;
    expect(p.section).toBe('bundles');
    expect(p.grants.cosmetics).toHaveLength(3);
    expect(await game.sys.liveops.buy(p.id)).toBe(true);
    for (const c of p.grants.cosmetics!) expect(game.state.liveops.cosmetics.owned).toContain(c);
    expect(game.state.liveops.nova).toBe(p.grants.nova);
    // once per account
    expect(game.sys.liveops.canBuy(p.id)).toBe(false);
    const parts = rewardParts(p.grants, game.data).filter((x) => x.kind === 'cosmetic');
    expect(parts.map((x) => x.label)).toEqual(p.grants.cosmetics!.map((c) => game.data.cosmetic(c)!.name));
    expect(parts[0].icon).toBe(game.data.cosmetic(p.grants.cosmetics![0])!.icon);
    expect(parts[0].art).toBe(cosmeticArt(p.grants.cosmetics![0]));
  });

  it('a restore re-grants the cosmetics of a non-consumable bundle (never its Nova)', async () => {
    const g = makeGame();
    const { game, services } = g;
    vi.spyOn(services.iap, 'restore').mockResolvedValue(['bundle_photo_frames', 'bundle_chest_lover']);
    await game.sys.liveops.restorePurchases();
    expect(game.state.liveops.cosmetics.owned).toEqual(expect.arrayContaining(['frame_cozy_knit', 'frame_sakura', 'frame_starry']));
    expect(game.state.liveops.nova).toBe(0);
    expect(game.state.player.items.chest_moonlit ?? 0).toBe(0); // consumable: nothing to restore
  });

  it('every bundle is worth more than its price in Nova, and is listed in docs/MOBILE.md', () => {
    const doc = fs.readFileSync(path.resolve(__dirname, '..', 'docs', 'MOBILE.md'), 'utf8');
    const bundles = data.products.filter((p) => p.section === 'bundles');
    expect(bundles.length).toBeGreaterThanOrEqual(2);
    for (const p of bundles) {
      expect(doc, p.id).toContain('`' + p.id + '`');
      const dollars = parseFloat(p.fallbackPrice.slice(1));
      const cosmetics = (p.grants.cosmetics ?? []).reduce((s, c) => s + (data.cosmetic(c)?.nova ?? 0), 0);
      const chests = Object.entries(p.grants.items ?? {}).reduce((s, [id, n]) => s + (data.chest(id)?.nova ?? 0) * n, 0);
      const worth = (p.grants.nova ?? 0) + cosmetics + chests;
      expect(worth, p.id).toBeGreaterThan(dollars * 100); // the Crystal Pouch: 500 Nova for $4.99
    }
  });
});
