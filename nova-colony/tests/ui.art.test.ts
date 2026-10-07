/**
 * Illustrated UI art (docs/ART.md): every piece of content that the UI shows with an illustration must have
 * one, and every URL the lookups return must be a real file under public/ (a typo would 404 in the app and
 * silently fall back to the emoji).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createDataRegistry } from '../src/data';
import { alienArt, biomeArt, buildingArt, buildingArtIds, eventArt, isArtSrc, itemArt, itemArtIds, keyArt, professionArt, researchArt, researchArtIds, resourceArt, rewardArt, shopArt, tierArt, vehicleArt, vehicleArtIds } from '../src/ui/art';
import { itemToast, rewardParts } from '../src/ui/logic/rewards';
import { buildingEffects, buildingUnlock, tierUnlocks, vehicleUnlock } from '../src/ui/logic/describe';
import { threatGroups } from '../src/ui/hud/Threats';
import { makeGame } from './world.helpers';

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

  it('every item has an icon file', () => {
    expect(data.items.length).toBeGreaterThan(0);
    for (const it of data.items) {
      const url = itemArt(it.id);
      expect(url, `item ${it.id}`).not.toBeNull();
      expect(url, `item ${it.id}`).toBe(`art/items/${it.id}.webp`);
      expect(exists(url), `${it.id} -> ${url}`).toBe(true);
    }
  });

  it('the item art ids match the item data exactly, and public/art/items has no orphans', () => {
    expect([...itemArtIds()].sort()).toEqual(data.items.map((i) => i.id).sort());
    const files = fs.readdirSync(path.join(PUBLIC, 'art', 'items'));
    const wanted = data.items.map((i) => `${i.id}.webp`).sort();
    expect(files.sort()).toEqual(wanted);
  });

  it('every building has a thumbnail file', () => {
    expect(data.buildings.length).toBeGreaterThan(100);
    for (const b of data.buildings) {
      const url = buildingArt(b.id);
      expect(url, `building ${b.id}`).toBe(`art/buildings/${b.id}.webp`);
      expect(exists(url), `${b.id} -> ${url}`).toBe(true);
    }
  });

  it('every vehicle has a thumbnail file', () => {
    expect(data.vehicles).toHaveLength(6);
    for (const v of data.vehicles) {
      const url = vehicleArt(v.id);
      expect(url, `vehicle ${v.id}`).toBe(`art/vehicles/${v.id}.webp`);
      expect(exists(url), `${v.id} -> ${url}`).toBe(true);
    }
  });

  it('the building / vehicle art ids match the data exactly, and their folders have no orphans', () => {
    expect([...buildingArtIds()].sort()).toEqual(data.buildings.map((b) => b.id).sort());
    expect([...vehicleArtIds()].sort()).toEqual(data.vehicles.map((v) => v.id).sort());
    for (const [dir, ids] of [['buildings', data.buildings.map((b) => b.id)], ['vehicles', data.vehicles.map((v) => v.id)]] as const) {
      const files = fs.readdirSync(path.join(PUBLIC, 'art', dir));
      expect(files.sort(), `public/art/${dir}`).toEqual(ids.map((id) => `${id}.webp`).sort());
    }
  });

  it('every research node has a painted icon, the ids match the data and the folder has no orphans', () => {
    expect(data.research.length).toBeGreaterThanOrEqual(90);
    for (const r of data.research) {
      const url = researchArt(r.id);
      expect(url, `research ${r.id}`).toBe(`art/research/${r.id}.webp`);
      expect(exists(url), `${r.id} -> ${url}`).toBe(true);
    }
    expect([...researchArtIds()].sort()).toEqual(data.research.map((r) => r.id).sort());
    const files = fs.readdirSync(path.join(PUBLIC, 'art', 'research'));
    expect(files.sort()).toEqual(data.research.map((r) => `${r.id}.webp`).sort());
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
    expect(itemArt('unobtainium_axe')).toBeNull();
    expect(itemArt('')).toBeNull();
    expect(buildingArt('death_star')).toBeNull();
    expect(buildingArt('')).toBeNull();
    expect(vehicleArt('tank')).toBeNull();
    expect(vehicleArt('')).toBeNull();
    // a vehicle id is not a building id (and vice versa): the two folders never answer for each other
    expect(buildingArt('atv')).toBeNull();
    expect(vehicleArt('garage')).toBeNull();
    expect(researchArt('time_travel')).toBeNull();
    expect(researchArt('')).toBeNull();
  });

  it('URLs are relative (vite base "./", Capacitor) and recognised as art', () => {
    for (const url of [resourceArt('wood'), professionArt('cook'), alienArt('crawler'), tierArt(0), shopArt('nova_starter_pack'), itemArt('medkit'), buildingArt('wall'), vehicleArt('atv')]) {
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
    for (const it of data.items) add(itemArt(it.id));
    for (const b of data.buildings) add(buildingArt(b.id));
    for (const v of data.vehicles) add(vehicleArt(v.id));
    for (const r of data.research) add(researchArt(r.id));
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
    expect(files.length).toBeGreaterThanOrEqual(77 + data.items.length + data.buildings.length + data.vehicles.length + data.research.length);
    expect(files.filter((f) => !used.has(f))).toEqual([]);
  });
});

describe('ui art wiring helpers', () => {
  it('reward parts carry resource / Nova / item art, other kinds keep their emoji', () => {
    const parts = rewardParts({ resources: { wood: 20, titanium: 1 }, nova: 5, rp: 3, xp: 2, items: { bandage: 1 } }, data);
    expect(parts[0].art).toBe(resourceArt('wood'));
    expect(parts[1].art).toBe(resourceArt('titanium'));
    const nova = parts.find((p) => p.kind === 'nova')!;
    expect(nova.art).toBe(resourceArt('nova'));
    expect(parts.find((p) => p.kind === 'rp')!.art).toBeNull();
    expect(parts.find((p) => p.kind === 'xp')!.art).toBeNull();
    const item = parts.find((p) => p.kind === 'item')!;
    expect(item.art).toBe(itemArt('bandage'));
    expect(item.icon).toBe(data.item('bandage')!.icon);
    expect(item.amount).toBe('×1');
  });

  it('an item without art keeps its emoji in reward parts', () => {
    const [p] = rewardParts({ items: { not_an_item: 2 } }, data);
    expect(p.kind).toBe('item');
    expect(p.art).toBeNull();
    expect(p.icon).toBe('🎁');
  });

  it('every item in a real reward (missions, packs, season, daily, spin) resolves to art', () => {
    const rewards = [
      ...data.missions.map((m) => m.reward),
      ...data.products.map((p) => p.grants),
      ...data.spinSegments.map((s) => s.reward),
      ...data.dailyRewards,
      ...data.season.levels.flatMap((l) => [l.free, l.premium]),
    ];
    let items = 0;
    for (const r of rewards) {
      for (const part of rewardParts(r, data)) {
        if (part.kind !== 'item') continue;
        items++;
        expect(part.art, part.label).not.toBeNull();
      }
    }
    expect(items).toBeGreaterThan(10);
  });

  it('item toasts ("Crafted X!", "<icon> X opened!") get the item illustration', () => {
    const med = itemToast('Crafted Medkit!', data)!;
    expect(med).toEqual({ text: 'Crafted Medkit!', icon: itemArt('medkit') });
    const crate = data.item('supply_crate')!;
    expect(itemToast(`${crate.icon} ${crate.name} opened!`, data)).toEqual({ text: `${crate.name} opened!`, icon: itemArt('supply_crate') });
    // every craftable item and every consumable / crate maps to its own illustration
    for (const r of data.recipes) {
      const id = r.outputs.items ? Object.keys(r.outputs.items)[0] : null;
      if (id) expect(itemToast(`Crafted ${r.name}!`, data)?.icon, r.id).toBe(itemArt(id));
    }
    for (const d of data.items.filter((i) => i.use)) {
      expect(itemToast(`${d.icon} ${d.name} opened!`, data)?.icon, d.id).toBe(itemArt(d.id));
    }
    // other text (and non-item crafts) is left alone
    expect(itemToast('Crafted Nothing Special!', data)).toBeNull();
    expect(itemToast('Researched Stone Tools!', data)).toBeNull();
    expect(itemToast('🎁 Supply crate opened!', data)).toBeNull();
    expect(itemToast('Backpack full!', data)).toBeNull();
  });

  it('the sim phrases its item toasts the way itemToast expects', () => {
    const { game, step } = makeGame();
    const seen: string[] = [];
    game.bus.on('ui:toast', (e) => seen.push(e.text));
    game.sys.economy.add('fiber', 100, 'gather');
    expect(game.sys.crafting.craft('r_bandage')).not.toBeNull();
    step(10);
    game.sys.player.addItem('supply_crate');
    expect(game.sys.player.useItem('supply_crate')).toBe(true);
    const crafted = seen.find((t) => t.startsWith('Crafted'));
    const opened = seen.find((t) => t.includes('opened!'));
    expect(crafted, seen.join(' | ')).toBeDefined();
    expect(opened, seen.join(' | ')).toBeDefined();
    expect(itemToast(crafted!, data)?.icon).toBe(itemArt('bandage'));
    expect(itemToast(opened!, data)?.icon).toBe(itemArt('supply_crate'));
  });

  it('a vehicle reward carries the vehicle thumbnail, an unknown one keeps its emoji', () => {
    const [v] = rewardParts({ vehicle: 'hover_bike' }, data);
    expect(v.kind).toBe('vehicle');
    expect(v.art).toBe(vehicleArt('hover_bike'));
    expect(v.icon).toBe(data.vehicle('hover_bike')!.icon);
    const [u] = rewardParts({ vehicle: 'tank' }, data);
    expect(u.art).toBeNull();
    expect(u.icon).toBe('🚙');
  });

  it('every vehicle granted by a mission, pack or craft recipe resolves to art', () => {
    const rewards = [...data.missions.map((m) => m.reward), ...data.products.map((p) => p.grants), ...data.spinSegments.map((s) => s.reward), ...data.dailyRewards];
    for (const r of rewards) {
      for (const part of rewardParts(r, data)) if (part.kind === 'vehicle') expect(part.art, part.label).not.toBeNull();
    }
    expect(data.recipes.filter((r) => r.outputs.vehicle).length).toBe(data.vehicles.length);
  });

  it('vehicle craft toasts ("Crafted ATV!") get the vehicle illustration', () => {
    expect(itemToast('Crafted ATV!', data)).toEqual({ text: 'Crafted ATV!', icon: vehicleArt('atv') });
    for (const r of data.recipes.filter((x) => x.outputs.vehicle)) {
      expect(itemToast(`Crafted ${r.name}!`, data)?.icon, r.id).toBe(vehicleArt(r.outputs.vehicle!));
    }
    // item crafts still resolve to their own item art
    expect(itemToast('Crafted Medkit!', data)?.icon).toBe(itemArt('medkit'));
  });

  it('building / vehicle unlock entries carry the thumbnail and keep the emoji as the fallback', () => {
    const b = buildingUnlock(data, 'guard_tower');
    expect(b).toEqual({ kind: 'building', id: 'guard_tower', icon: data.building('guard_tower')!.icon, art: buildingArt('guard_tower'), name: data.building('guard_tower')!.name });
    const v = vehicleUnlock(data, 'atv');
    expect(v).toEqual({ kind: 'vehicle', id: 'atv', icon: data.vehicle('atv')!.icon, art: vehicleArt('atv'), name: 'ATV' });
    // unknown ids degrade to a plain entry
    expect(buildingUnlock(data, 'nope')).toEqual({ kind: 'building', id: 'nope', icon: '🏠', art: null, name: 'nope' });
    expect(vehicleUnlock(data, 'nope')).toEqual({ kind: 'vehicle', id: 'nope', icon: '🚙', art: null, name: 'nope' });
    // everything research can unlock has a picture
    for (const r of data.research) {
      for (const id of r.unlocks?.buildings ?? []) expect(buildingUnlock(data, id).art, `${r.id} -> ${id}`).not.toBeNull();
      for (const id of r.unlocks?.vehicles ?? []) expect(vehicleUnlock(data, id).art, `${r.id} -> ${id}`).not.toBeNull();
    }
  });

  it('tier unlock lists: pieces and the core are left out, ungated ones come first, freeOnly drops the research-gated', () => {
    let sawGated = 0;
    let sawFree = 0;
    for (let t = 0; t < data.tiers.length; t++) {
      const all = tierUnlocks(data, t);
      const free = tierUnlocks(data, t, true);
      const wantB = data.buildings.filter((b) => b.unlockTier === t && !b.piece && !b.core).map((b) => b.id).sort();
      expect(all.filter((u) => u.kind === 'building').map((u) => u.id).sort(), `tier ${t}`).toEqual(wantB);
      expect(all.filter((u) => u.kind === 'vehicle').map((u) => u.id).sort(), `tier ${t} vehicles`).toEqual(data.vehicles.filter((v) => v.unlockTier === t).map((v) => v.id).sort());
      // the free list is the research-free subset of the full one, in the same order
      const needsResearch = (u: { kind: string; id: string }) => !!(u.kind === 'building' ? data.building(u.id)!.research : data.vehicle(u.id)!.research);
      expect(free.map((u) => u.id)).toEqual(all.filter((u) => !needsResearch(u)).map((u) => u.id));
      // within each kind the ungated come before the gated
      for (const kind of ['building', 'vehicle'] as const) {
        const flags = all.filter((u) => u.kind === kind).map(needsResearch);
        expect(flags, `tier ${t} ${kind} order`).toEqual([...flags].sort((a, z) => Number(a) - Number(z)));
      }
      for (const u of all) {
        expect(u.art, u.id).not.toBeNull();
        expect(data.building(u.id)?.piece, u.id).toBeFalsy();
        expect(data.building(u.id)?.core, u.id).toBeFalsy();
      }
      sawGated += all.length - free.length;
      sawFree += free.length;
    }
    expect(sawFree).toBeGreaterThan(0);
    expect(sawGated).toBeGreaterThan(sawFree);
    expect(tierUnlocks(data, 99)).toEqual([]);
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
