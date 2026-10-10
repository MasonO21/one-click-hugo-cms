/**
 * Wardrobe, the pure parts (src/ui/logic/wardrobe.ts): tabs, where a cosmetic comes from, sorting, filtering, what
 * each kind changes and the "big spend" confirmation. Plus the Menu tile and the HUD icon wiring.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDataRegistry } from '../src/data';
import type { CosmeticDef } from '../src/data/schema';
import {
  KIND_LABEL,
  RARITY_ORDER,
  RARITY_STYLE,
  WARDROBE_TABS,
  cosmeticEffect,
  cosmeticSources,
  cosmeticState,
  filterCosmetics,
  needsNovaConfirm,
  ownedFrames,
  packLabel,
  primarySource,
  sortCosmetics,
  tabOfKind,
  tabProgress,
  wardrobeTab,
} from '../src/ui/logic/wardrobe';
import { hudArt } from '../src/ui/art';
import { NOVA_CONFIRM_AT } from '../src/data/novaShop';

const data = createDataRegistry();
const cos = (id: string): CosmeticDef => {
  const c = data.cosmetic(id);
  if (!c) throw new Error(`no cosmetic ${id}`);
  return c;
};
const none = { owned: [] as string[], equipped: {} as Record<string, string> };

describe('wardrobe — tabs', () => {
  it('six tabs in the order of the brief, every cosmetic kind on exactly one of them', () => {
    expect(WARDROBE_TABS.map((t) => t.label)).toEqual(['Outfits', 'Hats', 'Pets', 'Colony', 'Rides & Turrets', 'Frames']);
    const kinds = Object.keys(KIND_LABEL);
    for (const k of kinds) expect(WARDROBE_TABS.filter((t) => t.kinds.includes(k as never)), k).toHaveLength(1);
    expect(wardrobeTab('colony').kinds).toEqual(['base_theme', 'colonist_outfit', 'decoration']);
    expect(wardrobeTab('rides').kinds).toEqual(['vehicle_skin', 'turret_skin']);
    expect(wardrobeTab('nope').id).toBe('outfits');
    expect(tabOfKind('photo_frame')).toBe('frames');
    expect(tabOfKind('decoration')).toBe('colony');
  });

  it('every cosmetic shows up on some tab', () => {
    const seen = new Set<string>();
    for (const t of WARDROBE_TABS) for (const c of filterCosmetics(data.cosmetics, t.id, none)) seen.add(c.id);
    expect(seen.size).toBe(data.cosmetics.length);
  });

  it('rarity colours: cream, blue, purple, gold, rainbow', () => {
    expect(RARITY_ORDER).toEqual(['common', 'rare', 'epic', 'legendary', 'mythic']);
    expect(RARITY_STYLE.common.label).toBe('Common');
    expect(RARITY_STYLE.mythic.ring).toMatch(/conic-gradient/);
    for (const r of RARITY_ORDER) expect(RARITY_STYLE[r].color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('wardrobe — where a cosmetic comes from', () => {
  it('a Nova price comes first', () => {
    const s = cosmeticSources(data, cos('hat_ranger'));
    expect(s[0]).toMatchObject({ kind: 'nova', nova: 150 });
    expect(primarySource(s)?.kind).toBe('nova');
    // also in chests, as a second way
    expect(s.find((x) => x.kind === 'chest')?.label).toBe('Nova caches: Supply Cache or better');
  });

  it('chest-only cosmetics name the cheapest chest that drops them', () => {
    expect(primarySource(cosmeticSources(data, cos('hat_commander')))?.label).toBe('Cache exclusive: Ancient Relic or better');
    expect(primarySource(cosmeticSources(data, cos('outfit_nomad')))?.label).toBe("Cache exclusive: Prospector's Vault or better");
    // the top chest has nothing "better"
    expect(primarySource(cosmeticSources(data, cos('pet_sky_whale')))?.label).toBe('Cache exclusive: Nova Core');
    expect(primarySource(cosmeticSources(data, cos('hat_commander')))?.chest).toBe('chest_relic');
  });

  it('season, pack and mission rewards', () => {
    expect(primarySource(cosmeticSources(data, cos('hat_space_bubble')))).toMatchObject({ kind: 'season', label: 'Season pass · level 15', level: 15, premium: true });
    expect(primarySource(cosmeticSources(data, cos('outfit_pioneer')))).toMatchObject({ kind: 'pack', label: 'Starter Pack' });
    expect(primarySource(cosmeticSources(data, cos('outfit_founder')))).toMatchObject({ kind: 'pack', label: 'Founder Pack' });
    expect(primarySource(cosmeticSources(data, cos('theme_titanium_dawn')))?.label).toMatch(/^Mission: /);
    expect(packLabel('Titanium Founder Pack')).toBe('Founder Pack');
    // a chest drop the season also hands out: the season is the sure way, the chest a second one
    const fox = cosmeticSources(data, cos('pet_ember_fox'));
    expect(fox[0]).toMatchObject({ kind: 'season', level: 45 });
    expect(fox[1].label).toBe('Nova caches: Ancient Relic or better');
  });

  it('every cosmetic has at least one source (nothing in the wardrobe is unobtainable)', () => {
    for (const c of data.cosmetics) expect(cosmeticSources(data, c).length, c.id).toBeGreaterThan(0);
  });
});

describe('wardrobe — state, sorting and filtering', () => {
  const own = { owned: ['hat_watch_cap', 'hat_pith_helmet', 'hat_ranger'], equipped: { hat: 'hat_pith_helmet' } as Record<string, string> };

  it('equipped / owned / locked', () => {
    expect(cosmeticState(cos('hat_pith_helmet'), own)).toBe('equipped');
    expect(cosmeticState(cos('hat_watch_cap'), own)).toBe('owned');
    expect(cosmeticState(cos('hat_headset'), own)).toBe('locked');
    // "equipped" needs ownership too (a stale save)
    expect(cosmeticState(cos('hat_pith_helmet'), { owned: [], equipped: { hat: 'hat_pith_helmet' } })).toBe('locked');
  });

  it('sorts what you wear, then what you own, then Nova buys (cheapest first), then the rest', () => {
    const list = sortCosmetics(filterCosmetics(data.cosmetics, 'hats', own), own, 'hats');
    expect(list[0].id).toBe('hat_pith_helmet');
    expect(list.slice(1, 3).map((c) => c.id).sort()).toEqual(['hat_ranger', 'hat_watch_cap']);
    const buyable = list.slice(3).filter((c) => c.nova > 0);
    expect(buyable.map((c) => c.nova)).toEqual([...buyable.map((c) => c.nova)].sort((a, b) => a - b));
    const firstLocked = list.findIndex((c) => c.nova === 0 && !own.owned.includes(c.id));
    const lastBuyable = list.map((c) => c.nova > 0 && !own.owned.includes(c.id)).lastIndexOf(true);
    expect(firstLocked).toBeGreaterThan(lastBuyable);
  });

  it('the Colony tab keeps themes, colonist outfits and decorations together', () => {
    const list = sortCosmetics(filterCosmetics(data.cosmetics, 'colony', none), none, 'colony');
    const kinds = list.filter((c) => c.nova > 0).map((c) => c.kind);
    expect(kinds.indexOf('decoration')).toBeGreaterThan(kinds.lastIndexOf('base_theme'));
  });

  it('filters owned / locked and counts progress', () => {
    expect(filterCosmetics(data.cosmetics, 'hats', own, 'owned').map((c) => c.id).sort()).toEqual(own.owned.slice().sort());
    const locked = filterCosmetics(data.cosmetics, 'hats', own, 'locked');
    expect(locked.every((c) => !own.owned.includes(c.id))).toBe(true);
    const p = tabProgress(data.cosmetics, 'hats', own);
    expect(p.owned).toBe(3);
    expect(p.total).toBe(data.cosmetics.filter((c) => c.kind === 'hat').length);
  });

  it('the frame picker lists owned frames only', () => {
    expect(ownedFrames(data.cosmetics, ['frame_blossom', 'hat_watch_cap', 'frame_geode']).map((c) => c.id)).toEqual(['frame_blossom', 'frame_geode']);
    expect(ownedFrames(data.cosmetics, [])).toEqual([]);
  });
});

describe('wardrobe — detail text and confirmation', () => {
  it('says what each kind changes; decorations point to Build › Decor, frames to Photo Mode', () => {
    for (const c of data.cosmetics) expect(cosmeticEffect(c).length, c.id).toBeGreaterThan(0);
    expect(cosmeticEffect(cos('deco_zen_garden')).join(' ')).toContain('Build › Decor');
    expect(cosmeticEffect(cos('frame_blossom')).join(' ')).toContain('Photo Mode');
    expect(cosmeticEffect(cos('theme_winter')).join(' ')).toContain('snowfall');
  });

  it('asks before spending 300 Nova or more', () => {
    expect(NOVA_CONFIRM_AT).toBe(300);
    expect(needsNovaConfirm(299)).toBe(false);
    expect(needsNovaConfirm(300)).toBe(true);
    expect(needsNovaConfirm(1000)).toBe(true);
  });
});

describe('wardrobe — wiring', () => {
  const src = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', 'src', f), 'utf8');

  it('has a painted Wardrobe tile in the Menu (coat emoji fallback) and a registered panel', () => {
    expect(hudArt('wardrobe')).toBe('art/hud/wardrobe.webp');
    const menu = src('ui/panels/MenuPanel.ts');
    expect(menu).toMatch(/hudArt\('wardrobe'\)/);
    expect(menu).toContain("panel: 'wardrobe'");
    expect(menu).toContain('🧥');
    expect(src('ui/UI.ts')).toMatch(/reg\('wardrobe'/);
  });

  it('Shop and Wardrobe buy cosmetics through the same confirming card', () => {
    expect(src('ui/panels/ShopPanel.ts')).toContain('cosmeticCard(');
    expect(src('ui/panels/WardrobePanel.ts')).toContain('cosmeticCard(');
    expect(src('ui/panels/wardrobe/cards.ts')).toContain('needsNovaConfirm(def.nova)');
  });
});
