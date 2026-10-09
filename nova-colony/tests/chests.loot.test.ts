/**
 * Nova chests: the loot roller, its guarantees and pity, and the odds the Shop discloses before purchase (App Store
 * 3.1.1 / Google Play: loot-box odds must be shown, and must be the real ones, so they come from the same tables).
 */
import { describe, expect, it } from 'vitest';
import { createDataRegistry } from '../src/data';
import { Rng } from '../src/core/rng';
import {
  CARD_RARITIES,
  chestCosmetics,
  chestOdds,
  crateCards,
  guaranteeLine,
  guaranteedRank,
  rarityRank,
  rollChest,
  STORAGE_SHARE,
  type ChestCard,
  type LootContext,
} from '../src/sim/chests';
import { CHEST_LOOT, CHEST_NOVA_BUDGET, COSMETIC_PITY, DUPLICATE_SHARE, MIN_REFUND, TYPICAL_COSMETIC_NOVA } from '../src/data/chestLoot';
import type { ChestDef } from '../src/data/schema';

const data = createDataRegistry();
const chest = (id: string): ChestDef => data.chest(id)!;
const allChestCosmetics = data.cosmetics.filter((c) => c.chest).map((c) => c.id);
const ctx = (over: Partial<LootContext> = {}): LootContext => ({ data, tier: 3, owned: [], ...over });
const best = (cards: ChestCard[]) => Math.max(...cards.map((c) => rarityRank(c.rarity)));

describe('chests: odds disclosure', () => {
  it('every chest has a loot table and its odds sum to 100%', () => {
    expect(data.chests.length).toBe(5);
    for (const c of data.chests) {
      expect(CHEST_LOOT[c.id], c.id).toBeDefined();
      const o = chestOdds(c);
      const total = (xs: { pct: number }[]) => xs.reduce((s, x) => s + x.pct, 0);
      expect(total(o.quality), `${c.id} quality`).toBeCloseTo(100, 9);
      expect(total(o.kinds), `${c.id} kinds`).toBeCloseTo(100, 9);
      // the cosmetic-by-rarity odds split exactly the cosmetic kind's share
      expect(total(o.cosmetics), `${c.id} cosmetics`).toBeCloseTo(o.kinds.find((k) => k.kind === 'cosmetic')!.pct, 9);
      for (const x of [...o.quality, ...o.kinds, ...o.cosmetics]) expect(x.pct).toBeGreaterThan(0);
    }
  });

  it('cosmetic rarity never exceeds the chest tier; mythic only from the Nova Core', () => {
    for (const c of data.chests) {
      const o = chestOdds(c);
      for (const x of o.cosmetics) expect(rarityRank(x.rarity), c.id).toBeLessThanOrEqual(rarityRank(c.rarity));
      expect(o.cosmetics.some((x) => x.rarity === 'mythic')).toBe(c.id === 'chest_nova');
    }
  });

  it('better chests have better odds: more cards, more cosmetics, a higher guarantee', () => {
    const order = ['chest_supply', 'chest_explorer', 'chest_prospector', 'chest_relic', 'chest_nova'].map(chest);
    for (let i = 1; i < order.length; i++) {
      const a = chestOdds(order[i - 1]);
      const b = chestOdds(order[i]);
      expect(b.cards).toBeGreaterThan(a.cards);
      expect(order[i].nova).toBeGreaterThan(order[i - 1].nova);
      expect(b.kinds.find((k) => k.kind === 'cosmetic')!.pct).toBeGreaterThan(a.kinds.find((k) => k.kind === 'cosmetic')!.pct);
      expect(b.quality.find((q) => q.rarity === 'common')!.pct).toBeLessThan(a.quality.find((q) => q.rarity === 'common')!.pct);
    }
    expect(order.map((c) => guaranteeLine(c))).toEqual([
      'Everyday field supplies',
      'Rare or better guaranteed',
      'Epic or better guaranteed',
      'A legendary find guaranteed',
      'Mythic cosmetic + legendary find',
    ]);
  });

  it('the disclosed per-card odds are what the roller does (Supply Cache: no guarantee bends them)', () => {
    const c = chest('chest_supply');
    const o = chestOdds(c);
    const rng = new Rng(1234);
    const n = 6000;
    const q: Record<string, number> = {};
    const k: Record<string, number> = {};
    let cards = 0;
    for (let i = 0; i < n; i++) {
      for (const card of rollChest(ctx({ tier: 2 }), c, rng).cards) {
        cards++;
        q[card.rarity] = (q[card.rarity] ?? 0) + 1;
        k[card.kind] = (k[card.kind] ?? 0) + 1;
      }
    }
    for (const x of o.quality) expect(Math.abs(((q[x.rarity] ?? 0) / cards) * 100 - x.pct), x.rarity).toBeLessThan(0.8);
    for (const x of o.kinds) expect(Math.abs(((k[x.kind] ?? 0) / cards) * 100 - x.pct), x.kind).toBeLessThan(1.2);
  });
});

describe('chests: guarantees', () => {
  const owneds: [string, string[]][] = [
    ['nothing owned', []],
    ['half owned', allChestCosmetics.filter((_, i) => i % 2 === 0)],
    ['every rare+epic owned', data.cosmetics.filter((c) => c.chest && (c.rarity === 'rare' || c.rarity === 'epic')).map((c) => c.id)],
    ['everything owned', allChestCosmetics],
  ];
  for (const [label, owned] of owneds) {
    it(`hold over many seeded rolls (${label})`, () => {
      for (const c of data.chests) {
        const rng = new Rng(99 + c.cards);
        for (let i = 0; i < 700; i++) {
          const { cards } = rollChest(ctx({ owned, tier: i % 7 }), c, rng);
          expect(cards).toHaveLength(c.cards);
          const min = guaranteedRank(c);
          const rest = cards.filter((x) => x.lift !== 'core');
          expect(Math.max(...rest.map((x) => rarityRank(x.rarity))), `${c.id} #${i}`).toBeGreaterThanOrEqual(min);
          if (c.id === 'chest_nova') {
            const core = cards.filter((x) => x.lift === 'core');
            expect(core).toHaveLength(1);
            const mythicLeft = chestCosmetics(data, 'mythic').some((m) => !owned.includes(m.id));
            if (mythicLeft) {
              expect(core[0]).toMatchObject({ kind: 'cosmetic', rarity: 'mythic' });
              expect(core[0].dupe).toBeFalsy();
            }
            // the core card is the finale
            expect(cards[cards.length - 1].lift).toBe('core');
          }
        }
      }
    });
  }

  it('reveals in rising rarity so the best card comes last', () => {
    const rng = new Rng(5);
    for (let i = 0; i < 200; i++) {
      const { cards } = rollChest(ctx(), chest('chest_relic'), rng);
      const ranks = cards.map((c) => rarityRank(c.rarity));
      expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
      expect(best(cards)).toBe(ranks[ranks.length - 1]);
    }
  });

  it('is deterministic for a seed', () => {
    const a = rollChest(ctx(), chest('chest_prospector'), new Rng(42));
    const b = rollChest(ctx(), chest('chest_prospector'), new Rng(42));
    expect(a).toEqual(b);
  });
});

describe('chests: cosmetics never repeat', () => {
  it('opening chest after chest never hands out a cosmetic twice, then refunds Nova', () => {
    const owned: string[] = [];
    const rng = new Rng(77);
    let refunds = 0;
    for (let i = 0; i < 400; i++) {
      const c = data.chests[i % data.chests.length];
      const { cards } = rollChest(ctx({ owned }), c, rng);
      const before = [...owned];
      for (const card of cards) {
        if (card.kind !== 'cosmetic' || card.dupe) continue;
        const id = card.reward.cosmetic!;
        expect(owned, `${id} dropped twice`).not.toContain(id);
        const def = data.cosmetic(id)!;
        expect(def.chest).toBe(true);
        expect(rarityRank(def.rarity)).toBeLessThanOrEqual(rarityRank(c.rarity));
        expect(card.rarity).toBe(def.rarity);
        owned.push(id);
      }
      for (const card of cards) {
        if (card.dupe) {
          refunds++;
          // a refund only when nothing is left at that rarity or below
          const left = data.cosmetics.filter((x) => x.chest && rarityRank(x.rarity) <= rarityRank(card.rarity) && !owned.includes(x.id));
          expect(left, `${c.id} refunded a ${card.rarity} with cosmetics left`).toHaveLength(0);
          expect(card.reward.nova).toBeGreaterThanOrEqual(MIN_REFUND);
          expect(card.reward.cosmetic).toBeUndefined();
          // the owned cosmetic it stands for
          if (card.cosmetic) expect(before.concat(owned)).toContain(card.cosmetic);
        }
      }
    }
    expect(new Set(owned).size).toBe(owned.length);
    expect(owned.length).toBe(allChestCosmetics.length); // every chest cosmetic was found in the end
    expect(refunds).toBeGreaterThan(0);
  });

  it('a duplicate refund is about 40% of a typical price, and a chest never pays back more than half its price in Nova', () => {
    const rng = new Rng(3);
    for (const c of data.chests) {
      for (let i = 0; i < 300; i++) {
        const { cards } = rollChest(ctx({ owned: allChestCosmetics }), c, rng);
        const nova = cards.reduce((s, x) => s + (x.reward.nova ?? 0), 0);
        const cos = cards.filter((x) => x.kind === 'cosmetic');
        expect(cos.every((x) => x.dupe)).toBe(true);
        for (const x of cos) expect(x.reward.nova).toBeLessThanOrEqual(Math.round(TYPICAL_COSMETIC_NOVA[x.rarity] * DUPLICATE_SHARE));
        expect(nova, `${c.id}`).toBeLessThanOrEqual(c.nova * CHEST_NOVA_BUDGET + MIN_REFUND * c.cards);
        expect(nova).toBeLessThan(c.nova);
      }
    }
    // with room in the budget the refund is the full 40%
    const { cards } = rollChest(ctx({ owned: allChestCosmetics }), chest('chest_nova'), new Rng(8));
    const core = cards.find((x) => x.lift === 'core')!;
    expect(core.dupe).toBe(true);
    expect(core.reward.nova).toBe(Math.round(TYPICAL_COSMETIC_NOVA.mythic * DUPLICATE_SHARE));
  });

  it('steps down a rarity when the rolled one is all collected', () => {
    const owned = chestCosmetics(data, 'mythic').map((c) => c.id);
    const rng = new Rng(11);
    for (let i = 0; i < 50; i++) {
      const core = rollChest(ctx({ owned }), chest('chest_nova'), rng).cards.find((c) => c.lift === 'core')!;
      expect(core.kind).toBe('cosmetic');
      expect(core.dupe).toBeUndefined();
      expect(core.rarity).toBe('legendary');
    }
  });
});

describe('chests: pity', () => {
  it(`the ${COSMETIC_PITY}th Explorer-or-better cache in a row without a cosmetic brings one`, () => {
    for (const c of data.chests.filter((x) => rarityRank(x.rarity) >= 1)) {
      const rng = new Rng(21);
      for (let i = 0; i < 300; i++) {
        const r = rollChest(ctx({ pity: COSMETIC_PITY - 1 }), c, rng);
        expect(r.newCosmetics, c.id).toBeGreaterThan(0);
        expect(r.pity).toBe(0);
        // the chest's own guarantee still holds
        expect(best(r.cards.filter((x) => x.lift !== 'core'))).toBeGreaterThanOrEqual(guaranteedRank(c));
      }
    }
  });

  it('counts misses, resets on a cosmetic, ignores Supply Caches and stops when nothing is left', () => {
    const moon = chest('chest_explorer');
    let pity = 0;
    let longest = 0;
    let run = 0;
    const rng = new Rng(4);
    for (let i = 0; i < 2000; i++) {
      const r = rollChest(ctx({ pity }), moon, rng);
      if (r.newCosmetics > 0) {
        expect(r.pity).toBe(0);
        run = 0;
      } else {
        expect(r.pity).toBe(pity + 1);
        run++;
        longest = Math.max(longest, run);
      }
      pity = r.pity;
    }
    expect(longest).toBeLessThan(COSMETIC_PITY);
    expect(longest).toBeGreaterThan(3); // the timer did have to step in now and then
    const supply = rollChest(ctx({ pity: 7 }), chest('chest_supply'), new Rng(1));
    expect(supply.pity).toBe(7);
    expect(rollChest(ctx({ pity: 5, owned: allChestCosmetics }), moon, new Rng(1)).pity).toBe(0);
  });
});

describe('chests: card contents', () => {
  it('resources are tier goods, scale with the colony tier and never overflow storage', () => {
    const value = (tier: number) => {
      const rng = new Rng(9);
      let total = 0;
      for (let i = 0; i < 200; i++) {
        for (const card of rollChest(ctx({ tier }), chest('chest_prospector'), rng).cards) {
          if (card.kind !== 'resources') continue;
          for (const [k, v] of Object.entries(card.reward.resources!)) {
            expect(data.resource(k), k).toBeDefined();
            expect(v).toBeGreaterThan(0);
            total += (v ?? 0) * data.expeditionRules.value[k];
          }
        }
      }
      return total;
    };
    const t0 = value(0);
    const t3 = value(3);
    const t6 = value(6);
    expect(t3).toBeGreaterThan(t0 * 3);
    expect(t6).toBeGreaterThan(t3);
    // tier-0 colonies get tier-0 goods only
    const rng = new Rng(2);
    for (let i = 0; i < 100; i++) {
      for (const card of rollChest(ctx({ tier: 0 }), chest('chest_relic'), rng).cards) {
        for (const k of Object.keys(card.reward.resources ?? {})) expect(['wood', 'stone', 'fiber', 'food', 'water']).toContain(k);
        for (const id of Object.keys(card.reward.items ?? {})) expect(['titan_crate', 'nano_crate', 'alloy_crate', 'quantum_chip']).not.toContain(id);
      }
    }
    // capacity: a legendary card into a tiny storage brings at most STORAGE_SHARE of it
    const cap = () => 100;
    const r2 = new Rng(6);
    for (let i = 0; i < 100; i++) {
      for (const card of rollChest(ctx({ tier: 4, capacity: cap }), chest('chest_nova'), r2).cards) {
        for (const v of Object.values(card.reward.resources ?? {})) expect(v).toBeLessThanOrEqual(100 * STORAGE_SHARE);
      }
    }
  });

  it('every card grants something real: known items, boosts, colonists and Nova', () => {
    const rng = new Rng(13);
    for (let i = 0; i < 300; i++) {
      for (const c of data.chests) {
        for (const card of rollChest(ctx({ tier: i % 7 }), c, rng).cards) {
          expect(CARD_RARITIES).toContain(card.rarity);
          const r = card.reward;
          const parts = [r.resources, r.items, r.boost, r.colonist, r.nova, r.cosmetic].filter((x) => x != null);
          expect(parts.length, JSON.stringify(card)).toBe(1);
          for (const id of Object.keys(r.items ?? {})) expect(data.item(id), id).toBeDefined();
          if (r.boost) expect(['production', 'research', 'gather']).toContain(r.boost.kind);
          if (r.colonist) expect(['common', 'rare', 'epic', 'legendary']).toContain(r.colonist);
        }
      }
    }
  });

  it('crates become one common card per part (colonists keep their rarity)', () => {
    const def = data.item('defense_crate')!;
    const cards = crateCards(data, def.use!.reward!);
    expect(cards.map((c) => c.kind)).toEqual(['resources', 'resources', 'resources', 'resources', 'item']);
    expect(cards.every((c) => c.rarity === 'common')).toBe(true);
    const mystery = crateCards(data, data.item('mystery_crate')!.use!.reward!);
    expect(mystery.map((c) => c.kind)).toEqual(['resources', 'resources', 'resources', 'resources', 'xp', 'nova']);
    expect(crateCards(data, { colonist: 'rare' })).toEqual([{ kind: 'colonist', rarity: 'rare', reward: { colonist: 'rare' } }]);
  });
});
