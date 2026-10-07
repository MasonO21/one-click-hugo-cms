/**
 * Illustrated UI art (docs/ART.md): every piece of content that the UI shows with an illustration must have
 * one, and every URL the lookups return must be a real file under public/ (a typo would 404 in the app and
 * silently fall back to the emoji).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createDataRegistry } from '../src/data';
import { alienArt, biomeArt, eventArt, isArtSrc, keyArt, professionArt, resourceArt, rewardArt, shopArt, tierArt } from '../src/ui/art';
import { rewardParts } from '../src/ui/logic/rewards';
import { buildingEffects } from '../src/ui/logic/describe';
import { threatGroups } from '../src/ui/hud/Threats';

const data = createDataRegistry();
const PUBLIC = path.resolve(__dirname, '..', 'public');
const exists = (url: string | null): boolean => !!url && fs.existsSync(path.join(PUBLIC, url));

describe('ui art lookups', () => {
  it('every resource (and Nova) has an icon file', () => {
    for (const id of [...data.resources.map((r) => r.id), 'nova']) {
      const url = resourceArt(id);
      expect(url, `resource ${id}`).not.toBeNull();
      expect(exists(url), `${id} -> ${url}`).toBe(true);
    }
  });

  it('every profession has a portrait', () => {
    expect(data.professions.length).toBeGreaterThan(0);
    for (const p of data.professions) {
      const url = professionArt(p.id);
      expect(url, `profession ${p.id}`).not.toBeNull();
      expect(exists(url), `${p.id} -> ${url}`).toBe(true);
    }
  });

  it('every alien model has a portrait (variants share their base model)', () => {
    const models = new Set(data.aliens.map((a) => a.model));
    expect(models.size).toBeGreaterThan(0);
    for (const m of models) {
      const url = alienArt(m);
      expect(url, `alien model ${m}`).not.toBeNull();
      expect(exists(url), `${m} -> ${url}`).toBe(true);
    }
  });

  it('every biome has a postcard', () => {
    for (const b of data.biomes) {
      const url = biomeArt(b.id);
      expect(url, `biome ${b.id}`).not.toBeNull();
      expect(exists(url), `${b.id} -> ${url}`).toBe(true);
    }
  });

  it('every colony tier has an illustration', () => {
    expect(data.tiers).toHaveLength(7);
    for (let i = 0; i <= 6; i++) {
      const url = tierArt(i);
      expect(url, `tier ${i}`).not.toBeNull();
      expect(exists(url), `tier ${i} -> ${url}`).toBe(true);
    }
    expect(tierArt(7)).toBeNull();
  });

  it('every world event kind has header art', () => {
    const kinds = new Set(data.worldEvents.map((e) => e.kind));
    expect(kinds.size).toBeGreaterThan(0);
    for (const k of kinds) {
      const url = eventArt(k);
      expect(url, `event kind ${k}`).not.toBeNull();
      expect(exists(url), `${k} -> ${url}`).toBe(true);
    }
  });

  it('every crystals / packs / vip / season product has a card', () => {
    const prods = data.products.filter((p) => ['crystals', 'packs', 'vip', 'season'].includes(p.section));
    expect(prods.length).toBeGreaterThanOrEqual(12);
    for (const p of prods) {
      const url = shopArt(p.id);
      expect(url, `product ${p.id}`).not.toBeNull();
      expect(exists(url), `${p.id} -> ${url}`).toBe(true);
    }
  });

  it('reward and key art exist', () => {
    for (const id of ['victory_chest', 'supply_crate', 'daily_gift']) expect(exists(rewardArt(id)), id).toBe(true);
    expect(exists(keyArt(false))).toBe(true);
    expect(exists(keyArt(true))).toBe(true);
  });

  it('unknown ids fall back to null (callers show the emoji)', () => {
    expect(resourceArt('unobtainium')).toBeNull();
    expect(professionArt('astronaut')).toBeNull();
    expect(alienArt('dragon')).toBeNull();
    expect(biomeArt('moon')).toBeNull();
    expect(eventArt('parade')).toBeNull();
    expect(shopArt('nope')).toBeNull();
    expect(rewardArt('nope')).toBeNull();
  });

  it('URLs are relative (vite base "./", Capacitor) and recognised as art', () => {
    for (const url of [resourceArt('wood'), professionArt('cook'), alienArt('crawler'), tierArt(0), shopArt('nova_starter_pack')]) {
      expect(url!.startsWith('/')).toBe(false);
      expect(url!.startsWith('art/')).toBe(true);
      expect(isArtSrc(url)).toBe(true);
    }
    expect(isArtSrc('🪵')).toBe(false);
    expect(isArtSrc(null)).toBe(false);
  });

  it('no art file is orphaned (every webp is reachable from a lookup)', () => {
    const used = new Set<string>();
    const add = (u: string | null) => u && used.add(u);
    for (const r of data.resources) add(resourceArt(r.id));
    add(resourceArt('nova'));
    for (const p of data.professions) add(professionArt(p.id));
    for (const a of data.aliens) add(alienArt(a.model));
    for (const b of data.biomes) add(biomeArt(b.id));
    for (let i = 0; i <= 6; i++) add(tierArt(i));
    for (const e of data.worldEvents) add(eventArt(e.kind));
    for (const p of data.products) add(shopArt(p.id));
    for (const id of ['victory_chest', 'supply_crate', 'daily_gift']) add(rewardArt(id));
    add(keyArt(false));
    add(keyArt(true));
    const root = path.join(PUBLIC, 'art');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        if (f.isDirectory()) walk(path.join(dir, f.name));
        else if (f.name.endsWith('.webp')) files.push(path.relative(PUBLIC, path.join(dir, f.name)).split(path.sep).join('/'));
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThanOrEqual(77);
    expect(files.filter((f) => !used.has(f))).toEqual([]);
  });
});

describe('ui art wiring helpers', () => {
  it('reward parts carry resource / Nova art, other kinds keep their emoji', () => {
    const parts = rewardParts({ resources: { wood: 20, titanium: 1 }, nova: 5, rp: 3, xp: 2, items: { bandage: 1 } }, data);
    expect(parts[0].art).toBe(resourceArt('wood'));
    expect(parts[1].art).toBe(resourceArt('titanium'));
    const nova = parts.find((p) => p.kind === 'nova')!;
    expect(nova.art).toBe(resourceArt('nova'));
    expect(parts.find((p) => p.kind === 'rp')!.art).toBeNull();
    expect(parts.find((p) => p.kind === 'xp')!.art).toBeNull();
    expect(parts.find((p) => p.kind === 'item')!.art).toBeNull();
  });

  it('building effect tags for production carry the resource icon', () => {
    const def = data.building('berry_patch')!;
    const tags = buildingEffects(def, data);
    const prod = tags.find((t) => t.text.includes('/min'))!;
    expect(prod.art).toBeTruthy();
    expect(prod.icon).not.toBe('');
  });

  it('threat groups name the most common attacker (a boss outweighs a crowd)', () => {
    const pts = [
      { x: 100, z: 0, model: 'crawler' },
      { x: 102, z: 2, model: 'crawler' },
      { x: 98, z: -1, model: 'spitter' },
      { x: -100, z: 0, model: 'crawler' },
      { x: -101, z: 0, model: 'queen', boss: true },
      { x: -99, z: 1, model: 'crawler' },
      { x: -98, z: 1, model: 'crawler' },
    ];
    const g = threatGroups(pts, 0, 0);
    expect(g).toHaveLength(2);
    const east = g.find((x) => x.x > 0)!;
    const west = g.find((x) => x.x < 0)!;
    expect(east.model).toBe('crawler');
    expect(west.model).toBe('queen');
    expect(west.boss).toBe(true);
  });
});
