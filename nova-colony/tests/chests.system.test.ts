/**
 * Nova chests in the running game: buying with Nova, opening from the inventory, granting every card exactly once,
 * the crate variant, the pity counter in the save, earned chests (daily day 7, first defense per tier) and analytics.
 */
import { describe, expect, it, vi } from 'vitest';
import { installAnalyticsHooks } from '../src/platform/analyticsHooks';
import { migrateState } from '../src/platform/saveMigrate';
import { createInitialState, deserializeState, serializeState } from '../src/core/state';
import { normalizeChestSave, type ChestOpened } from '../src/sim/chests';
import { COSMETIC_PITY, FIRST_DEFENSE_CHEST } from '../src/data/chestLoot';
import { makeGame, type TestGame } from './meta.helpers';

function rig(seed = 7): TestGame & { opened: ChestOpened[]; bought: unknown[] } {
  const g = makeGame({ seed });
  const opened: ChestOpened[] = [];
  const bought: unknown[] = [];
  g.game.bus.on('chest:opened', (e) => opened.push(e));
  g.game.bus.on('chest:bought', (e) => bought.push(e));
  return { ...g, opened, bought };
}

describe('chests: buying with Nova', () => {
  it('Buy & open spends the price once, grants every card once and hands the cards to the scene', () => {
    const r = rig();
    const g = r.game;
    g.sys.liveops.addNova(1000, 'test');
    const grants: { source: string; item?: string }[] = [];
    g.bus.on('reward:granted', (e) => grants.push({ source: e.source, item: e.item }));
    const ownedBefore = g.state.liveops.cosmetics.owned.length;
    const colonistsBefore = g.state.colonists.list.length;
    const cards = g.sys.chests.buy('chest_prospector')!;
    expect(cards).toHaveLength(5);
    const nova = cards.reduce((s, c) => s + (c.reward.nova ?? 0), 0);
    expect(g.state.liveops.nova).toBe(1000 - 450 + nova);
    expect(r.bought).toEqual([{ chest: 'chest_prospector', nova: 450, open: true }]);
    expect(r.opened).toHaveLength(1);
    expect(r.opened[0]).toMatchObject({ chest: 'chest_prospector', variant: 'chest', via: 'shop' });
    expect(r.opened[0].cards).toBe(cards);
    expect(grants).toHaveLength(5);
    expect(grants.every((x) => x.source === 'chest' && x.item === 'chest_prospector')).toBe(true);
    const newCos = cards.filter((c) => c.kind === 'cosmetic' && !c.dupe);
    expect(g.state.liveops.cosmetics.owned.length).toBe(ownedBefore + newCos.length);
    for (const c of newCos) expect(g.sys.liveops.ownsCosmetic(c.cosmetic!)).toBe(true);
    const col = cards.filter((c) => c.kind === 'colonist');
    expect(g.state.colonists.list.length).toBe(colonistsBefore + col.length);
    for (const c of col) expect(g.sys.colonists.get(c.colonist!.id)?.name).toBe(c.colonist!.name);
    // nothing landed in the inventory: Buy & open never touches it
    expect(g.state.player.items.chest_prospector).toBeUndefined();
    expect(g.state.liveops.chests!.opened.chest_prospector).toBe(1);
  });

  it('without enough Nova nothing is spent and nothing opens', () => {
    const r = rig();
    r.game.sys.liveops.addNova(100, 'test');
    expect(r.game.sys.chests.canAfford('chest_explorer')).toBe(false);
    expect(r.game.sys.chests.buy('chest_explorer')).toBeNull();
    expect(r.game.state.liveops.nova).toBe(100);
    expect(r.opened).toHaveLength(0);
    expect(r.bought).toHaveLength(0);
    expect(r.game.sys.chests.buy('nope')).toBeNull();
  });

  it('Buy keeps the chest in the inventory; it opens from there through useItem, once per chest', () => {
    const r = rig();
    const g = r.game;
    g.sys.liveops.addNova(60, 'test');
    expect(g.sys.chests.buy('chest_supply', false)).toEqual([]);
    expect(g.state.liveops.nova).toBe(0);
    expect(g.sys.chests.owned('chest_supply')).toBe(1);
    expect(g.sys.chests.ownedTotal()).toBe(1);
    expect(r.opened).toHaveLength(0);
    expect(g.sys.player.useItem('chest_supply')).toBe(true);
    expect(r.opened).toHaveLength(1);
    expect(r.opened[0]).toMatchObject({ chest: 'chest_supply', variant: 'chest', via: 'inventory' });
    expect(r.opened[0].cards).toHaveLength(3);
    expect(g.sys.chests.owned('chest_supply')).toBe(0);
    expect(g.sys.player.useItem('chest_supply')).toBe(false);
    expect(g.sys.chests.open('chest_supply')).toBeNull();
    expect(r.opened).toHaveLength(1);
  });

  it('keeps the pity counter in the save across Explorer-or-better caches', () => {
    const r = rig(3);
    const g = r.game;
    g.state.liveops.cosmetics.owned = g.data.cosmetics.filter((c) => c.chest && c.rarity !== 'common').map((c) => c.id);
    let misses = 0;
    for (let i = 0; i < 30; i++) {
      g.sys.player.addItem('chest_explorer');
      const before = g.state.liveops.chests!.pity;
      const cards = g.sys.chests.open('chest_explorer')!;
      const got = cards.some((c) => c.kind === 'cosmetic' && !c.dupe);
      const commonsLeft = g.data.cosmetics.some((c) => c.chest && c.rarity === 'common' && !g.state.liveops.cosmetics.owned.includes(c.id));
      if (before === COSMETIC_PITY - 1 && (commonsLeft || got)) expect(got).toBe(true);
      expect(g.state.liveops.chests!.pity).toBe(got || !commonsLeft ? 0 : before + 1);
      if (!got) misses++;
      expect(g.sys.chests.pityLeft()).toBe(COSMETIC_PITY - g.state.liveops.chests!.pity);
    }
    expect(misses).toBeGreaterThan(0);
  });
});

describe('chests: crates open in the scene too', () => {
  it('a fixed-reward crate grants its reward once and sends the crate variant to the scene', () => {
    const r = rig();
    const g = r.game;
    const grants: unknown[] = [];
    g.bus.on('reward:granted', (e) => grants.push([e.source, e.item]));
    const toasts: string[] = [];
    g.bus.on('ui:toast', (e) => toasts.push(e.text));
    g.sys.player.addItem('defense_crate');
    expect(g.sys.player.useItem('defense_crate')).toBe(true);
    expect(grants).toEqual([['crate', 'defense_crate']]);
    expect(r.opened).toHaveLength(1);
    expect(r.opened[0]).toMatchObject({ chest: 'defense_crate', variant: 'crate', via: 'inventory' });
    expect(r.opened[0].cards.map((c) => c.kind)).toEqual(['resources', 'resources', 'resources', 'resources', 'item']);
    expect(toasts.some((t) => t.includes('opened!'))).toBe(false); // the scene, not a toast
    expect(g.state.player.items.medkit).toBe(2);
  });

  it('a colonist crate names who woke up', () => {
    const r = rig();
    const g = r.game;
    g.sys.player.addItem('colonist_crate');
    g.sys.player.useItem('colonist_crate');
    const card = r.opened[0].cards[0];
    expect(card.kind).toBe('colonist');
    expect(card.rarity).toBe('rare');
    expect(g.sys.colonists.get(card.colonist!.id)?.name).toBe(card.colonist!.name);
  });

  it('consumables keep their quick toast (no scene)', () => {
    const r = rig();
    const g = r.game;
    const toasts: string[] = [];
    g.bus.on('ui:toast', (e) => toasts.push(e.text));
    g.sys.player.addItem('research_chip');
    expect(g.sys.player.useItem('research_chip')).toBe(true);
    expect(r.opened).toHaveLength(0);
    expect(toasts.some((t) => t.endsWith('Research Chip opened!'))).toBe(true);
  });
});

describe('chests: earned for free', () => {
  it('the first won defense at each tier adds one Supply Cache to the spoils', () => {
    const r = rig();
    const g = r.game;
    const reward = { resources: { wood: 10 }, items: { medkit: 1 } };
    expect(g.sys.chests.firstDefense(reward)).toBe(true);
    expect(reward.items).toEqual({ medkit: 1, [FIRST_DEFENSE_CHEST]: 1 });
    const again = { resources: { wood: 10 } } as { resources: Record<string, number>; items?: Record<string, number> };
    expect(g.sys.chests.firstDefense(again)).toBe(false);
    expect(again.items).toBeUndefined();
    g.state.colony.tier = 1;
    const next: { items?: Record<string, number> } = {};
    expect(g.sys.chests.firstDefense(next)).toBe(true);
    expect(next.items).toEqual({ [FIRST_DEFENSE_CHEST]: 1 });
    expect(g.state.liveops.chests!.defended).toEqual([0, 1]);
  });

  it('the victory chest of a won raid carries it (combat hook)', () => {
    const r = rig();
    const g = r.game;
    const c = g.state.combat;
    c.phase = 'attack';
    (g.sys.combat as unknown as { endAttack(reason: string): void }).endAttack('victory');
    expect(c.pendingReward?.items?.[FIRST_DEFENSE_CHEST]).toBe(1);
    c.pendingReward = null;
    c.phase = 'attack';
    (g.sys.combat as unknown as { endAttack(reason: string): void }).endAttack('victory');
    const again = g.state.combat.pendingReward as { items?: Record<string, number> } | null;
    expect(again?.items?.[FIRST_DEFENSE_CHEST]).toBeUndefined();
  });

  it("day 7 of the login gift brings an Explorer's Case", () => {
    const r = rig();
    expect(r.game.data.dailyRewards[6].items?.chest_explorer).toBe(1);
  });
});

describe('chests: save', () => {
  it('a save from before chests loads with a fresh chest state, and the state round-trips', () => {
    const raw = JSON.parse(serializeState(createInitialState(5, Date.now()))) as Record<string, any>;
    delete raw.liveops.chests;
    const state = migrateState(raw);
    const g = makeGame({ state });
    expect(g.game.state.liveops.chests).toEqual({ pity: 0, opened: {}, defended: [] });
    g.game.state.liveops.chests!.pity = 4;
    g.game.state.liveops.chests!.defended.push(2);
    const back = migrateState(deserializeState(serializeState(g.game.state)));
    expect(makeGame({ state: back }).game.state.liveops.chests).toEqual({ pity: 4, opened: {}, defended: [2] });
  });

  it('repairs a damaged chest state', () => {
    expect(normalizeChestSave(null)).toEqual({ pity: 0, opened: {}, defended: [] });
    expect(normalizeChestSave({ pity: 'x', opened: { a: 2, b: 'no', c: -1 }, defended: [1, 1, 'z', 9, 3] })).toEqual({ pity: 0, opened: { a: 2 }, defended: [1, 3] });
    const raw = JSON.parse(serializeState(createInitialState(5, Date.now()))) as Record<string, any>;
    raw.liveops.chests = { pity: -3, opened: [], defended: 'nope' };
    const g = makeGame({ state: migrateState(raw) });
    expect(g.game.state.liveops.chests).toEqual({ pity: 0, opened: {}, defended: [] });
  });
});

describe('chests: analytics', () => {
  it('reports chest_bought and chest_opened (game facts only)', () => {
    const r = rig();
    const g = r.game;
    const track = vi.spyOn(g.services.analytics, 'track');
    const off = installAnalyticsHooks(g);
    g.state.settings.analytics = true;
    g.state.settings.analyticsAsked = true;
    g.sys.liveops.addNova(500, 'test');
    g.sys.chests.buy('chest_explorer');
    const calls = track.mock.calls.filter((c) => c[0].startsWith('chest_'));
    expect(calls.map((c) => c[0])).toEqual(['chest_bought', 'chest_opened']);
    expect(calls[0][1]).toEqual({ chest: 'chest_explorer', nova: 180, open: true, tier: 0 });
    expect(calls[1][1]).toMatchObject({ chest: 'chest_explorer', variant: 'chest', via: 'shop', cards: 4, tier: 0 });
    expect(['rare', 'epic', 'legendary']).toContain(calls[1][1]!.best);
    off();
  });
});
