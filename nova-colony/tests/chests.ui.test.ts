/**
 * The chest scene's pure parts: where the chest and cards sit on every screen shape, what each card shows, the sounds
 * and particle budgets it picks, and what Android back does (skip the reveal, then close).
 */
import { describe, expect, it } from 'vitest';
import { createDataRegistry } from '../src/data';
import { Rng } from '../src/core/rng';
import { rollChest, crateCards, type ChestCard } from '../src/sim/chests';
import { CARD_RATIO, PEDESTAL, FEET, fitGrid, placeGrid, sceneLayout, type Rect } from '../src/ui/chest/layout';
import { cardFace, chestBack, findsLabel, fxBudget, revealGap, revealSound, tapHint, tapsToOpen, teaseMs } from '../src/ui/chest/logic';
import { backAction } from '../src/ui/logic/back';
import { resolveSoundId } from '../src/audio/ids';
import { pctText } from '../src/ui/shop/ChestOddsPanel';

const data = createDataRegistry();
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('chest scene layout', () => {
  const screens = [
    { w: 393, h: 852, safe: { t: 47, r: 0, b: 34, l: 0 } },
    { w: 360, h: 740, safe: { t: 24, r: 0, b: 0, l: 0 } },
    { w: 430, h: 932, safe: { t: 59, r: 0, b: 34, l: 0 } },
  ];
  for (const s of screens) {
    for (const [id, ped] of Object.entries(PEDESTAL)) {
      it(`portrait ${s.w}x${s.h} ${id}: the chest stands on its pedestal and the cards fit above it`, () => {
        for (let n = 1; n <= 7; n++) {
          const L = sceneLayout({ w: s.w, h: s.h, safe: s.safe, cards: n, pedestal: ped });
          expect(L.landscape).toBe(false);
          // feet on the pedestal
          expect(Math.abs(L.chest.y + L.chest.h * FEET - ped * s.h)).toBeLessThan(L.chest.h * 0.06);
          expect(L.cards).toHaveLength(n);
          const settledTop = L.chest.y + L.chest.h * FEET * (1 - L.settle) + L.shift;
          for (const c of L.cards) {
            expect(c.x).toBeGreaterThanOrEqual(0);
            expect(c.x + c.w).toBeLessThanOrEqual(s.w);
            expect(c.y).toBeGreaterThanOrEqual(s.safe.t + 60); // under the title
            expect(c.y + c.h).toBeLessThanOrEqual(settledTop + L.chest.h * 0.12); // above the chest's lid
            expect(c.w).toBeGreaterThanOrEqual(s.w < 380 ? 76 : 80); // readable
            expect(c.h).toBeCloseTo(c.w * CARD_RATIO, -1);
          }
          for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(overlap(L.cards[i], L.cards[j])).toBe(false);
          for (const c of L.cards) expect(overlap(c, L.actions)).toBe(false);
          // the chest never steps into the buttons
          expect(L.chest.y + L.chest.h + L.shift).toBeLessThanOrEqual(L.actions.y + 8);
          expect(L.actions.y + L.actions.h).toBeLessThanOrEqual(s.h - s.safe.b);
        }
      });
    }
  }

  it('landscape: the chest in the middle, the cards in two wings that never cover it', () => {
    for (const s of [{ w: 852, h: 393 }, { w: 740, h: 360 }]) {
      for (let n = 1; n <= 7; n++) {
        const L = sceneLayout({ w: s.w, h: s.h, cards: n, pedestal: 0.6 });
        expect(L.landscape).toBe(true);
        expect(Math.abs(L.chest.x + L.chest.w / 2 - s.w / 2)).toBeLessThanOrEqual(1);
        for (const c of L.cards) {
          expect(overlap(c, L.chest)).toBe(false);
          expect(overlap(c, L.actions)).toBe(false);
          expect(c.y + c.h).toBeLessThanOrEqual(s.h);
          expect(c.x).toBeGreaterThanOrEqual(0);
          expect(c.x + c.w).toBeLessThanOrEqual(s.w);
          expect(c.w).toBeGreaterThanOrEqual(70);
        }
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(overlap(L.cards[i], L.cards[j])).toBe(false);
        // the reveal hops left, right, left…
        if (n >= 2) expect(L.cards[0].x < L.chest.x && L.cards[1].x > L.chest.x).toBe(true);
      }
    }
  });

  it('fits the biggest cards it can', () => {
    expect(fitGrid(4, { w: 369, h: 330 }, 132)).toMatchObject({ cols: 2, rows: 2 });
    expect(fitGrid(7, { w: 369, h: 240 }, 132).cols).toBe(4);
    const r = placeGrid(5, { x: 0, y: 0, w: 369, h: 400 }, 132);
    expect(r[3].y).toBeGreaterThan(r[0].y); // two rows, the short one centred
    expect(r[3].x + r[4].x + r[4].w).toBeCloseTo(369, -1);
    expect(placeGrid(0, { x: 0, y: 0, w: 100, h: 100 }, 132)).toEqual([]);
  });
});

describe('chest scene: card faces', () => {
  it('every rolled card has a picture (or emoji), a name and a short line', () => {
    const rng = new Rng(31);
    for (let i = 0; i < 60; i++) {
      for (const chest of data.chests) {
        for (const card of rollChest({ data, tier: i % 7, owned: [] }, chest, rng).cards) {
          const f = cardFace(card, data);
          expect(f.name, JSON.stringify(card)).not.toBe('');
          expect(f.icons.length).toBeGreaterThan(0);
          for (const ic of f.icons) expect(ic.art ?? ic.emoji).toBeTruthy();
          if (card.kind === 'cosmetic' && !card.dupe) {
            expect(f.isNew).toBe(true);
            const def = data.cosmetic(card.cosmetic!)!;
            expect(f.equip).toBe(def.kind === 'decoration' ? undefined : def.id);
          }
        }
      }
    }
  });

  it('duplicates show their Nova and the cosmetic they stand for', () => {
    const owned = data.cosmetics.filter((c) => c.chest).map((c) => c.id);
    const dupes = rollChest({ data, tier: 3, owned }, data.chest('chest_nova')!, new Rng(2)).cards.filter((c) => c.dupe);
    expect(dupes.length).toBeGreaterThan(0);
    const f = cardFace(dupes[0], data);
    expect(f.dupe).toBe(true);
    expect(f.amount).toBe(`+${dupes[0].reward.nova}`);
    expect(f.sub).toMatch(/^Already yours: /);
  });

  it('resources, boosts, items, colonists and crate extras read well', () => {
    const one: ChestCard = { kind: 'resources', rarity: 'common', reward: { resources: { wood: 1200 } } };
    expect(cardFace(one, data)).toMatchObject({ amount: '+1.2K', name: 'Wood' });
    const two: ChestCard = { kind: 'resources', rarity: 'epic', reward: { resources: { iron: 300, steel: 80 } } };
    expect(cardFace(two, data)).toMatchObject({ name: 'Supplies', amount: '' });
    expect(cardFace(two, data).icons.map((i) => i.amount)).toEqual(['+300', '+80']);
    expect(cardFace({ kind: 'boost', rarity: 'rare', reward: { boost: { kind: 'production', mult: 2, minutes: 10 } } }, data)).toMatchObject({ amount: '2×', name: 'Production boost', sub: '10 min' });
    expect(cardFace({ kind: 'item', rarity: 'rare', reward: { items: { worker_drone: 2 } } }, data)).toMatchObject({ amount: '×2', name: 'Worker Drone Kit' });
    const col = cardFace({ kind: 'colonist', rarity: 'epic', reward: { colonist: 'epic' }, colonist: { id: 3, name: 'Mira Vale', specialty: 'farmer' } }, data);
    expect(col).toMatchObject({ name: 'Mira Vale', amount: '', sub: 'Joins as a farmer' });
    for (const card of crateCards(data, data.item('mystery_crate')!.use!.reward!)) expect(cardFace(card, data).name).not.toBe('');
  });
});

describe('chest scene: pacing, sound, particles, back', () => {
  it('rarer cards get a longer moment, crates are quick, chests take three taps', () => {
    expect(revealGap('mythic', false)).toBeGreaterThan(revealGap('legendary', false));
    expect(revealGap('legendary', false)).toBeGreaterThan(revealGap('common', false));
    expect(revealGap('mythic', true)).toBe(revealGap('common', true));
    expect(teaseMs('common')).toBe(0);
    expect(teaseMs('mythic')).toBeGreaterThan(teaseMs('legendary'));
    expect(tapsToOpen('chest')).toBe(3);
    expect(tapsToOpen('crate')).toBe(1);
    expect([0, 1, 2].map((t) => tapHint(t, 3))).toEqual(['Tap to open', 'Again', 'Once more']);
    expect([findsLabel(1), findsLabel(7)]).toEqual(['1 find', '7 finds']);
  });

  it('uses existing sounds', () => {
    for (const r of ['common', 'rare', 'epic', 'legendary', 'mythic'] as const) expect(resolveSoundId(revealSound(r)), r).not.toBeNull();
    for (const id of ['place', 'spin_tick', 'crate_open', 'collect', 'reward', 'ui_open']) expect(resolveSoundId(id)).not.toBeNull();
  });

  it('fewer particles on low quality and with reduced motion', () => {
    expect(fxBudget('high', false).amount).toBeGreaterThan(fxBudget('medium', false).amount);
    expect(fxBudget('medium', false).amount).toBeGreaterThan(fxBudget('low', false).amount);
    expect(fxBudget('high', true)).toEqual({ amount: 0.25, ambient: false, dpr: 1 });
    expect(fxBudget('low', false).dpr).toBe(1);
  });

  it('Android back skips to everything revealed, then closes; the scene takes the press before anything else', () => {
    expect(chestBack('drop')).toBe('skip');
    expect(chestBack('idle')).toBe('skip');
    expect(chestBack('cards')).toBe('skip');
    expect(chestBack('done')).toBe('close');
    expect(chestBack('off')).toBe('none');
    expect(backAction({ chestScene: true, photoMode: true, panelOpen: true, buildActive: true, hasSelection: true })).toBe('chest');
    expect(backAction({ chestScene: false, panelOpen: true, buildActive: false, hasSelection: false })).toBe('panel');
  });

  it('the odds sheet rounds kindly', () => {
    expect(pctText(24)).toBe('24%');
    expect(pctText(6.24)).toBe('6.2%');
    expect(pctText(0.04)).toBe('<0.1%');
  });
});
