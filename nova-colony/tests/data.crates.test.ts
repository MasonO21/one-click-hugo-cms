/**
 * Every crate in the item catalogue must be obtainable somewhere: a recipe, a mission, the shop, the daily gift, the
 * spin wheel, the season pass, a point of interest, a world event, an invasion chest, the starter kit, another crate,
 * or an expedition (finds, Frontier finds and Star Chart milestones). The Alloy Crate used to have no source at all.
 */
import { describe, expect, it } from 'vitest';
import { createDataRegistry } from '../src/data';
import type { Reward } from '../src/data/schema';

const data = createDataRegistry();

/** Item id -> where it comes from. */
function itemSources(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (r: Reward | null | undefined, where: string) => {
    for (const id of Object.keys(r?.items ?? {})) out.set(id, [...(out.get(id) ?? []), where]);
  };
  for (const r of data.recipes) for (const id of Object.keys(r.outputs.items ?? {})) out.set(id, [...(out.get(id) ?? []), `recipe ${r.id}`]);
  for (const m of data.missions) add(m.reward, `mission ${m.id}`);
  for (const p of data.products) add(p.grants, `product ${p.id}`);
  data.dailyRewards.forEach((r, i) => add(r, `daily ${i + 1}`));
  data.spinSegments.forEach((s) => add(s.reward, `spin ${s.label}`));
  data.season.levels.forEach((l, i) => {
    add(l.free, `season ${i + 1} free`);
    add(l.premium, `season ${i + 1} premium`);
  });
  for (const p of data.pois) add(p.reward, `poi ${p.id}`);
  for (const e of data.worldEvents) add(e.reward, `event ${e.id}`);
  for (const inv of data.invasions) add(inv.reward, `invasion T${inv.tier}`);
  for (const id of Object.keys(data.starterKit.items)) out.set(id, [...(out.get(id) ?? []), 'starter kit']);
  for (const it of data.items) add(it.use?.reward, `inside ${it.id}`);
  for (const x of data.expeditions) for (const f of x.finds ?? []) add(f.reward, `expedition ${x.id}`);
  const fr = data.expeditionRules.frontier;
  for (const f of fr.finds) add(f.reward, `frontier find ${f.label}`);
  for (const m of fr.milestones) add(m.reward, `star chart ${m.count}`);
  add(fr.repeat.reward, 'star chart (repeat)');
  for (const c of data.chests) if (c.nova > 0) out.set(c.id, [...(out.get(c.id) ?? []), 'shop (Nova)']);
  return out;
}

describe('data.crates — every crate has a source', () => {
  const sources = itemSources();

  it('each crate item can be obtained somewhere in the game', () => {
    const crates = data.items.filter((i) => i.category === 'crate');
    expect(crates.length).toBeGreaterThan(5);
    for (const c of crates) expect(sources.get(c.id) ?? [], `${c.id} has no source`).not.toHaveLength(0);
  });

  it('the Alloy Crate drops on Advanced Alloy expeditions', () => {
    const where = (sources.get('alloy_crate') ?? []).filter((s) => s.startsWith('expedition '));
    expect(where.length).toBeGreaterThan(0);
    for (const w of where) expect(data.expedition(w.slice('expedition '.length))!.tier).toBe(4);
  });

  it('each tier crate turns up on expeditions of its tier or later', () => {
    for (const id of ['timber_bundle', 'stone_bundle', 'ore_bundle', 'steel_bundle', 'tech_crate', 'alloy_crate', 'nano_crate', 'titan_crate', 'mystery_crate']) {
      const item = data.item(id)!;
      const trips = data.expeditions.filter((x) => (x.finds ?? []).some((f) => f.reward.items?.[id]));
      expect(trips.length, `${id} is not an expedition find`).toBeGreaterThan(0);
      for (const t of trips) expect(t.tier, `${id} (tier ${item.tier}) on ${t.id}`).toBeGreaterThanOrEqual(item.tier);
    }
  });
});
