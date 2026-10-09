/**
 * Exclusive decor from `decoration` cosmetics (data/decorCosmetic.ts): every decoration cosmetic
 * unlocks one or two decor buildings, they stay locked (with a Wardrobe hint) until the cosmetic is
 * owned, and they are cosmetic first — never better than the free decor of their tier.
 */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/Game';
import { createMockServices } from '../src/platform/mock';
import { createDataRegistry } from '../src/data';
import { COSMETICS } from '../src/data/monetization';
import { COSMETIC_DECOR } from '../src/data/decorCosmetic';
import { hasModel } from '../src/render/models';
import { COSMETIC_DECOR_MODELS } from '../src/render/models/decorCosmetic';
import { lockInfo, tierUnlocks } from '../src/ui/logic/describe';
import { CENTER_CELL } from '../src/core/constants';

const data = createDataRegistry();

describe('cosmetic decor data', () => {
  it('every decoration cosmetic unlocks 1-2 decor buildings, and every one of them points at a real decoration', () => {
    const decos = COSMETICS.filter((c) => c.kind === 'decoration');
    expect(decos.length).toBeGreaterThanOrEqual(6);
    for (const c of decos) {
      const n = COSMETIC_DECOR.filter((b) => b.cosmetic === c.id).length;
      expect(n, c.id).toBeGreaterThanOrEqual(1);
      expect(n, c.id).toBeLessThanOrEqual(2);
    }
    for (const b of COSMETIC_DECOR) {
      expect(data.cosmetic(b.cosmetic!)?.kind, b.id).toBe('decoration');
      expect(b.category).toBe('decor');
      expect(data.building(b.id)).toBe(b);
      expect(hasModel(b.model), b.model).toBe(true);
      expect(COSMETIC_DECOR_MODELS).toContain(b.model);
      expect((b.comfort ?? 0) + (b.entertainment ?? 0), `${b.id} gives some happiness`).toBeGreaterThan(0);
    }
  });

  it('is never better than the free decor of the same tier (happiness per cell)', () => {
    const perCell = (b: { comfort?: number; entertainment?: number; size: [number, number] }) => ((b.comfort ?? 0) + (b.entertainment ?? 0)) / (b.size[0] * b.size[1]);
    for (const b of COSMETIC_DECOR) {
      const free = data.buildings.filter((d) => d.category === 'decor' && !d.cosmetic && d.unlockTier <= b.unlockTier);
      expect(free.length).toBeGreaterThan(0);
      const best = Math.max(...free.map(perCell));
      expect(perCell(b), b.id).toBeLessThanOrEqual(best);
      expect(b.research).toBeUndefined();
    }
  });
});

describe('cosmetic decor unlock', () => {
  it('stays locked with a Wardrobe hint until the cosmetic is owned, then places like any decor', () => {
    const game = new Game({ seed: 21, services: createMockServices() });
    game.start();
    const B = game.sys.buildings;
    for (const r of game.data.resources) game.state.resources.amounts[r.id] = 1e5;
    expect(B.isUnlocked('bonsai_stand')).toBe(false);
    expect(B.lockReason('bonsai_stand')).toMatch(/Wardrobe/);
    const lock = lockInfo(data.building('bonsai_stand')!, data, 0, [], game.state.liveops.cosmetics.owned);
    expect(lock).toMatchObject({ locked: true, kind: 'cosmetic' });
    expect(lock.text).toMatch(/Wardrobe/);
    const spot = () => {
      for (let k = 0; k < 400; k++) {
        const x = CENTER_CELL - 10 + (k % 20) * 2;
        const z = CENTER_CELL + 6 + Math.floor(k / 20) * 2;
        const chk = B.canPlace('bonsai_stand', x, z, 0);
        if (chk.ok || chk.code === 'locked') return { x, z, chk };
      }
      throw new Error('no spot');
    };
    const s = spot();
    expect(s.chk).toMatchObject({ ok: false, code: 'locked' });
    expect(B.place('bonsai_stand', s.x, s.z, 0)).toBeNull();

    game.state.liveops.cosmetics.owned.push('deco_zen_garden');
    expect(B.isUnlocked('bonsai_stand')).toBe(true);
    expect(B.isUnlocked('zen_garden')).toBe(true);
    expect(B.isUnlocked('harvest_display')).toBe(false);
    expect(lockInfo(data.building('bonsai_stand')!, data, 0, [], game.state.liveops.cosmetics.owned).locked).toBe(false);
    expect(B.canPlace('bonsai_stand', s.x, s.z, 0).ok).toBe(true);
    expect(B.place('bonsai_stand', s.x, s.z, 0)).not.toBeNull();
  });

  it('is not announced as a tier unlock (it is not earned by tiers)', () => {
    for (let t = 0; t < data.tiers.length; t++) for (const u of tierUnlocks(data, t)) expect(data.building(u.id)?.cosmetic, u.id).toBeUndefined();
  });
});
