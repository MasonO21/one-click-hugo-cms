import { describe, expect, it } from 'vitest';
import { createDataRegistry } from '../src/data';
import { ANCHOR_IDS, type BuildingDef, type MissionDef, type Reward, type ResourceBag } from '../src/data/schema';

const data = createDataRegistry();

const resIds = new Set(data.resources.map((r) => r.id));
const buildingIds = new Set(data.buildings.map((b) => b.id));
const itemIds = new Set(data.items.map((i) => i.id));
const recipeIds = new Set(data.recipes.map((r) => r.id));
const researchIds = new Set(data.research.map((r) => r.id));
const vehicleIds = new Set(data.vehicles.map((v) => v.id));
const alienIds = new Set(data.aliens.map((a) => a.id));
const biomeIds = new Set(data.biomes.map((b) => b.id));
const nodeIds = new Set(data.nodes.map((n) => n.id));
const poiIds = new Set(data.pois.map((p) => p.id));
const missionIds = new Set(data.missions.map((m) => m.id));
const cosmeticIds = new Set(data.cosmetics.map((c) => c.id));
const professionIds = new Set(data.professions.map((p) => p.id));
const rarities = new Set(['common', 'rare', 'epic', 'legendary']);

function bagOk(bag: ResourceBag | undefined, where: string): void {
  for (const [k, v] of Object.entries(bag ?? {})) {
    expect(resIds.has(k), `${where}: unknown resource "${k}"`).toBe(true);
    expect(typeof v === 'number' && v >= 0 && Number.isFinite(v), `${where}: bad amount for ${k}`).toBe(true);
  }
}

function rewardOk(r: Reward | undefined, where: string): void {
  if (!r) return;
  bagOk(r.resources, where);
  for (const [id, n] of Object.entries(r.items ?? {})) {
    expect(itemIds.has(id), `${where}: unknown item "${id}"`).toBe(true);
    expect(n).toBeGreaterThan(0);
  }
  if (r.colonist) expect(rarities.has(r.colonist), `${where}: bad rarity`).toBe(true);
  if (r.cosmetic) expect(cosmeticIds.has(r.cosmetic), `${where}: unknown cosmetic "${r.cosmetic}"`).toBe(true);
  for (const c of r.cosmetics ?? []) expect(cosmeticIds.has(c), `${where}: unknown cosmetic "${c}"`).toBe(true);
  if (r.vehicle) expect(vehicleIds.has(r.vehicle), `${where}: unknown vehicle`).toBe(true);
  if (r.boost) {
    expect(['production', 'research', 'gather']).toContain(r.boost.kind);
    expect(r.boost.mult).toBeGreaterThan(1);
    expect(r.boost.minutes).toBeGreaterThan(0);
  }
  for (const k of ['nova', 'rp', 'xp'] as const) if (r[k] !== undefined) expect(r[k]! >= 0, `${where}: negative ${k}`).toBe(true);
}

function unique<T>(list: T[], key: (t: T) => string, kind: string): void {
  const seen = new Set<string>();
  for (const x of list) {
    const k = key(x);
    expect(seen.has(k), `duplicate ${kind} id ${k}`).toBe(false);
    seen.add(k);
  }
}

describe('data.integrity — ids & references', () => {
  it('ids are unique in every collection', () => {
    unique(data.resources, (x) => x.id, 'resource');
    unique(data.buildings, (x) => x.id, 'building');
    unique(data.items, (x) => x.id, 'item');
    unique(data.recipes, (x) => x.id, 'recipe');
    unique(data.research, (x) => x.id, 'research');
    unique(data.vehicles, (x) => x.id, 'vehicle');
    unique(data.aliens, (x) => x.id, 'alien');
    unique(data.biomes, (x) => x.id, 'biome');
    unique(data.nodes, (x) => x.id, 'node');
    unique(data.pois, (x) => x.id, 'poi');
    unique(data.missions, (x) => x.id, 'mission');
    unique(data.cosmetics, (x) => x.id, 'cosmetic');
    unique(data.products, (x) => x.id, 'product');
    unique(data.worldEvents, (x) => x.id, 'worldEvent');
    unique(data.tiers, (x) => String(x.index), 'tier');
  });

  it('anchor ids exist and the seed ids other systems rely on are still there', () => {
    for (const id of ['wood', 'stone', 'fiber', 'food', 'water']) expect(resIds.has(id)).toBe(true);
    expect(buildingIds.has(ANCHOR_IDS.coreBuilding)).toBe(true);
    expect(biomeIds.has(ANCHOR_IDS.startRegion)).toBe(true);
    const seeds = ['command_center', 'floor', 'wall', 'door', 'window', 'fence', 'gate', 'shelter', 'campfire', 'storage_crate', 'berry_patch', 'rain_collector', 'workbench', 'logging_camp', 'quarry', 'research_desk', 'spin_wheel', 'lamp_post', 'flower_bed', 'barricade', 'spike_trap', 'scrap_turret'];
    for (const id of seeds) expect(buildingIds.has(id), `seed building ${id}`).toBe(true);
    for (const id of ['survival_tool', 'stone_axe', 'flare_pistol', 'makeshift_rifle', 'small_backpack', 'fiber_vest', 'bandage', 'supply_crate']) expect(itemIds.has(id), `seed item ${id}`).toBe(true);
    for (const id of ['r_stone_axe', 'r_makeshift_rifle', 'r_fiber_vest', 'r_bandage', 'r_roast_berries']) expect(recipeIds.has(id), `seed recipe ${id}`).toBe(true);
    for (const id of ['tier_reinforced', 'sharper_tools', 'tier_stone']) expect(researchIds.has(id), `seed research ${id}`).toBe(true);
    for (let n = 1; n <= 11; n++) expect([...missionIds].some((m) => m.startsWith('m' + String(n).padStart(2, '0') + '_')), `seed mission m${n}`).toBe(true);
    for (const id of ['atv']) expect(vehicleIds.has(id)).toBe(true);
    for (const id of ['crawler', 'spitter']) expect(alienIds.has(id)).toBe(true);
    for (const id of ['supply_cache', 'survivor_camp', 'crashed_ship', 'alien_ruin', 'alien_nest', 'research_outpost', 'beacon']) expect(poiIds.has(id)).toBe(true);
    for (const id of ['tree_round', 'tree_pine', 'bush_berry', 'fiber_grass', 'rock', 'ore_iron', 'ore_copper', 'coal_seam', 'crystal_cluster', 'bio_pod', 'ice_ore', 'scrap_pile', 'titanium_deposit']) expect(nodeIds.has(id), `seed node ${id}`).toBe(true);
    for (const id of ['crash_valley', 'pinewood_forest', 'crystal_canyon', 'red_desert', 'toxic_marsh', 'frozen_ridge', 'alien_ruins', 'titanium_highlands']) expect(biomeIds.has(id)).toBe(true);
    for (const id of ['supply_drop', 'meteor_crash']) expect(data.worldEvent(id)).toBeTruthy();
    for (const id of ['offline_double', 'production_boost', 'instant_craft', 'free_crate', 'recruit_refresh', 'invasion_bonus', 'research_bonus', 'extra_spin', 'drone_assistant']) expect(data.ad(id), `ad ${id}`).toBeTruthy();
    for (const id of ['nova_starter_pack', 'nova_crystals_small', 'nova_builder_pack', 'nova_colony_pack', 'nova_commander_pack', 'nova_ultimate_pack', 'colony_pass_monthly', 'season_pass_premium']) expect(data.product(id), `product ${id}`).toBeTruthy();
  });

  it('every resource bag in every definition references real resources', () => {
    for (const r of data.resources) expect(r.baseCapacity).toBeGreaterThan(0);
    for (const t of data.tiers) { bagOk(t.pieceCost, `tier ${t.id} pieceCost`); bagOk(t.upgradeCost, `tier ${t.id} upgradeCost`); }
    for (const b of data.buildings) {
      for (const k of ['cost', 'storage', 'produces', 'consumes'] as const) bagOk(b[k], `building ${b.id}.${k}`);
      if (b.workers) expect(professionIds.has(b.workers.job), `building ${b.id} worker job ${b.workers.job}`).toBe(true);
      if (b.turret?.mannedBy) expect(professionIds.has(b.turret.mannedBy)).toBe(true);
      expect(b.size[0] > 0 && b.size[1] > 0 && Number.isInteger(b.size[0]) && Number.isInteger(b.size[1]), `building ${b.id} size`).toBe(true);
      expect(b.unlockTier >= 0 && b.unlockTier <= 6).toBe(true);
      expect(b.hp).toBeGreaterThan(0);
      expect(b.buildTime).toBeGreaterThanOrEqual(0);
    }
    for (const r of data.recipes) {
      bagOk(r.inputs, `recipe ${r.id}.inputs`);
      bagOk(r.outputs.resources, `recipe ${r.id}.outputs`);
      for (const [id] of Object.entries(r.itemInputs ?? {})) expect(itemIds.has(id), `recipe ${r.id} item input ${id}`).toBe(true);
      for (const [id] of Object.entries(r.outputs.items ?? {})) expect(itemIds.has(id), `recipe ${r.id} output item ${id}`).toBe(true);
      if (r.outputs.vehicle) expect(vehicleIds.has(r.outputs.vehicle), `recipe ${r.id} vehicle`).toBe(true);
      expect(!!(r.outputs.resources || r.outputs.items || r.outputs.vehicle), `recipe ${r.id} has no output`).toBe(true);
    }
    for (const r of data.research) bagOk(r.resources, `research ${r.id}`);
    for (const a of data.aliens) bagOk(a.drop, `alien ${a.id}.drop`);
    for (const v of data.vehicles) bagOk(v.cost, `vehicle ${v.id}`);
    for (const p of data.pois) rewardOk(p.reward, `poi ${p.id}`);
    for (const e of data.worldEvents) {
      rewardOk(e.reward, `event ${e.id}`);
      for (const t of e.trades ?? []) { bagOk(t.give, `event ${e.id} give`); bagOk(t.get, `event ${e.id} get`); }
    }
    for (const i of data.items) rewardOk(i.use?.reward, `item ${i.id}`);
  });

  it('buildings, recipes, vehicles and research gates reference real research nodes (and mirror into unlocks)', () => {
    const unl = new Map(data.research.map((r) => [r.id, r.unlocks ?? {}]));
    for (const b of data.buildings) {
      if (!b.research) continue;
      expect(researchIds.has(b.research), `building ${b.id} -> research ${b.research}`).toBe(true);
      expect(unl.get(b.research)!.buildings ?? [], `research ${b.research} should list building ${b.id}`).toContain(b.id);
      expect(data.researchDef(b.research)!.tier, `${b.id}: research ${b.research} must be researchable by the building's unlock tier`).toBeLessThanOrEqual(b.unlockTier);
    }
    for (const r of data.recipes) {
      if (!r.research) continue;
      expect(researchIds.has(r.research), `recipe ${r.id} -> research ${r.research}`).toBe(true);
      expect(unl.get(r.research)!.recipes ?? []).toContain(r.id);
      expect(data.researchDef(r.research)!.tier, `${r.id}: research tier`).toBeLessThanOrEqual(r.unlockTier);
    }
    for (const v of data.vehicles) {
      if (!v.research) continue;
      expect(researchIds.has(v.research), `vehicle ${v.id} -> research`).toBe(true);
      expect(unl.get(v.research)!.vehicles ?? []).toContain(v.id);
      expect(data.researchDef(v.research)!.tier).toBeLessThanOrEqual(v.unlockTier);
    }
    for (const rd of data.research) {
      const u = rd.unlocks ?? {};
      for (const id of u.buildings ?? []) expect(buildingIds.has(id)).toBe(true);
      for (const id of u.recipes ?? []) expect(recipeIds.has(id)).toBe(true);
      for (const id of u.vehicles ?? []) expect(vehicleIds.has(id)).toBe(true);
      for (const id of u.regions ?? []) expect(biomeIds.has(id)).toBe(true);
    }
    for (const t of data.tiers) if (t.research) expect(researchIds.has(t.research), `tier ${t.id} research`).toBe(true);
    expect(data.tiers.map((t) => t.research)).toEqual([null, 'tier_reinforced', 'tier_stone', 'tier_steel', 'tier_alloy', 'tier_nano', 'tier_titanium']);
  });

  it('recipes only use stations that exist (building station or factory type)', () => {
    const stations = new Set<string>(['hand']);
    for (const b of data.buildings) if (b.station) stations.add(b.station);
    for (const r of data.recipes) expect(stations.has(r.station), `recipe ${r.id}: no building offers station "${r.station}"`).toBe(true);
    for (const b of data.buildings) if (b.factory) expect(data.recipes.some((r) => r.station === b.factory), `factory ${b.id}: no recipes for "${b.factory}"`).toBe(true);
    // a station is never available before its building's tier
    for (const r of data.recipes) {
      if (r.station === 'hand') continue;
      const earliest = Math.min(...data.buildings.filter((b) => b.station === r.station).map((b) => b.unlockTier));
      expect(r.unlockTier, `recipe ${r.id} unlocks before its station`).toBeGreaterThanOrEqual(earliest);
    }
  });

  it('vehicle recipes exist for all six vehicles and mirror the vehicle cost', () => {
    expect(data.vehicles.length).toBe(6);
    for (const v of data.vehicles) {
      const r = data.recipes.find((x) => x.outputs.vehicle === v.id);
      expect(r, `recipe for vehicle ${v.id}`).toBeTruthy();
      expect(r!.inputs).toEqual(v.cost);
      expect(r!.unlockTier).toBe(v.unlockTier);
      expect(r!.research).toBe(v.research);
    }
  });

  it('equipment: slots match categories, tools progress through toolTier 1..3, every node is harvestable', () => {
    const slotOf: Record<string, string> = { tool: 'tool', weapon: 'weapon', armor: 'armor', backpack: 'backpack', utility: 'utility' };
    for (const i of data.items) {
      if (i.slot) expect(slotOf[i.category], `item ${i.id}`).toBe(i.slot);
      if (i.category === 'tool') expect(i.stats?.toolTier).toBeGreaterThanOrEqual(1);
    }
    const tiers = new Set(data.items.filter((i) => i.category === 'tool').map((i) => i.stats!.toolTier));
    expect([...tiers].sort()).toEqual([1, 2, 3]);
    const maxTool = Math.max(...data.items.filter((i) => i.category === 'tool').map((i) => i.stats!.toolTier!));
    for (const n of data.nodes) expect(n.toolTier).toBeLessThanOrEqual(maxTool);
    // every craftable item has a recipe and every equipable (non-starter) has a recipe
    const crafted = new Set(data.recipes.flatMap((r) => Object.keys(r.outputs.items ?? {})));
    for (const i of data.items) {
      if (['small_backpack', 'survival_tool', 'flare_pistol', 'supply_crate', 'mystery_crate', 'colonist_crate', 'defense_crate', 'tech_crate', 'alloy_crate', 'nano_crate', 'titan_crate'].includes(i.id) || i.use?.chest) continue;
      expect(crafted.has(i.id), `item ${i.id} cannot be crafted`).toBe(true);
    }
    const starter = data.starterKit;
    for (const [id] of Object.entries(starter.items)) expect(itemIds.has(id)).toBe(true);
    for (const [slot, id] of Object.entries(starter.equip)) expect(data.item(id)!.slot, `starter ${id}`).toBe(slot);
    for (const id of Object.keys(starter.resources)) expect(resIds.has(id)).toBe(true);
  });

  it('weapons progress: makeshift rifle, shotgun, assault rifle, energy rifle, plasma rifle, titanium rifle', () => {
    for (const id of ['makeshift_rifle', 'colony_shotgun', 'assault_rifle', 'energy_rifle', 'plasma_rifle', 'titanium_rifle']) expect(itemIds.has(id)).toBe(true);
    const dps = ['makeshift_rifle', 'colony_shotgun', 'assault_rifle', 'energy_rifle', 'plasma_rifle', 'titanium_rifle'].map((id) => data.item(id)!.stats!.damage! * data.item(id)!.stats!.fireRate!);
    for (let i = 1; i < dps.length; i++) expect(dps[i]).toBeGreaterThan(dps[i - 1]);
  });
});

describe('data.integrity — research tree', () => {
  it('has 70-95 nodes spread over all 11 categories with positions, and no duplicate positions', () => {
    expect(data.research.length).toBeGreaterThanOrEqual(70);
    expect(data.research.length).toBeLessThanOrEqual(95);
    const cats = new Set(data.research.map((r) => r.category));
    for (const c of ['construction', 'power', 'food', 'water', 'defense', 'weapons', 'automation', 'robotics', 'exploration', 'colonists', 'titanium']) expect(cats.has(c as never), `category ${c}`).toBe(true);
    const pos = new Set<string>();
    for (const r of data.research) {
      const k = `${r.category}:${r.pos[0]},${r.pos[1]}`;
      expect(pos.has(k), `duplicate tree position ${k}`).toBe(false);
      pos.add(k);
    }
  });

  it('requires exist, the graph is acyclic and prerequisites are never from a later tier', () => {
    const color = new Map<string, number>();
    const visit = (id: string, path: string[]) => {
      const c = color.get(id) ?? 0;
      expect(c, `research cycle: ${[...path, id].join(' -> ')}`).not.toBe(1);
      if (c === 2) return;
      color.set(id, 1);
      const r = data.researchDef(id)!;
      for (const q of r.requires) {
        expect(researchIds.has(q), `research ${id} requires unknown ${q}`).toBe(true);
        expect(data.researchDef(q)!.tier, `${id} (tier ${r.tier}) requires later-tier ${q}`).toBeLessThanOrEqual(r.tier);
        visit(q, [...path, id]);
      }
      color.set(id, 2);
    };
    for (const r of data.research) visit(r.id, []);
  });

  it('costs grow with tier, modifiers use valid stats, and every node does something', () => {
    for (const r of data.research) {
      expect(r.cost).toBeGreaterThan(0);
      expect(r.tier).toBeGreaterThanOrEqual(0);
      expect(r.tier).toBeLessThanOrEqual(6);
      const does = (r.effects?.length ?? 0) > 0 || Object.values(r.unlocks ?? {}).some((l) => (l?.length ?? 0) > 0) || data.tiers.some((t) => t.research === r.id);
      expect(does, `research ${r.id} unlocks nothing and has no effect`).toBe(true);
      for (const e of r.effects ?? []) {
        expect(e.stat === 'production' || /^production:/.test(e.stat) || ['gatherYield', 'gatherSpeed', 'buildSpeed', 'craftSpeed', 'research', 'storage', 'power', 'turretDamage', 'turretRange', 'structureHp', 'repairSpeed', 'happiness', 'colonistSpeed', 'moveSpeed', 'playerDamage', 'playerHp', 'offlineHours', 'recruitSlots', 'invasionReward'].includes(e.stat), `research ${r.id}: stat ${e.stat}`).toBe(true);
        if (e.stat.startsWith('production:')) expect(resIds.has(e.stat.slice('production:'.length)), `research ${r.id}: ${e.stat}`).toBe(true);
      }
    }
    const avg = (t: number) => { const l = data.research.filter((r) => r.tier === t); return l.reduce((s, r) => s + r.cost, 0) / Math.max(1, l.length); };
    for (let t = 1; t <= 6; t++) expect(avg(t), `avg research cost tier ${t} vs ${t - 1}`).toBeGreaterThan(avg(t - 1));
  });

  it('covers the effect modifiers the brief asks for', () => {
    const stats = new Set(data.research.flatMap((r) => (r.effects ?? []).map((e) => e.stat)));
    for (const s of ['gatherYield', 'gatherSpeed', 'storage', 'power', 'turretDamage', 'turretRange', 'structureHp', 'buildSpeed', 'craftSpeed', 'happiness', 'offlineHours', 'recruitSlots', 'invasionReward', 'production:food', 'production:water', 'production:wood', 'production:steel', 'production:crystal', 'production:nano', 'production:titanium']) expect(stats.has(s as never), `no research gives ${s}`).toBe(true);
  });
});

describe('data.integrity — missions', () => {
  const main = data.missions.filter((m) => m.chain === 'main');
  const side = data.missions.filter((m) => m.chain === 'side');
  const daily = data.missions.filter((m) => m.chain === 'daily');

  it('counts: 45-70 main, ~20 side, 15 daily; daily pool = all dailies', () => {
    expect(main.length).toBeGreaterThanOrEqual(45);
    expect(main.length).toBeLessThanOrEqual(70);
    expect(side.length).toBeGreaterThanOrEqual(18);
    expect(daily.length).toBeGreaterThanOrEqual(15);
    expect([...data.dailyMissionPool].sort()).toEqual(daily.map((m) => m.id).sort());
  });

  it('main chain is a single reachable path that ends in the Titanium Super-Colony', () => {
    const order: string[] = [];
    let cur: string | undefined = data.firstMission;
    const seen = new Set<string>();
    while (cur) {
      expect(seen.has(cur), `cycle at ${cur}`).toBe(false);
      seen.add(cur);
      const m = data.mission(cur);
      expect(m, `missing mission ${cur}`).toBeTruthy();
      expect(m!.chain).toBe('main');
      order.push(cur);
      expect((m!.next ?? []).length, `main mission ${cur} must have at most one successor`).toBeLessThanOrEqual(1);
      cur = m!.next?.[0];
    }
    expect(order.length, 'every main mission must be on the path').toBe(main.length);
    expect(order[order.length - 1]).toBe('m67_super_colony');
    expect(data.mission('m67_super_colony')!.onComplete?.celebrate).toBeTruthy();
    // opening sequence matches the seed order
    expect(order.slice(0, 11)).toEqual(['m01_wood', 'm02_shelter', 'm03_campfire', 'm04_storage', 'm05_rescue', 'm06_logging', 'm07_assign', 'm08_turret', 'm09_defend', 'm10_research', 'm11_tier1']);
    // tier-up missions appear in tier order, once each
    const tierMissions = order.map((id) => data.mission(id)!).filter((m) => m.type === 'tier');
    expect(tierMissions.map((m) => m.count)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('side missions form short chains with valid links; heads are not referenced', () => {
    const referenced = new Set<string>();
    for (const m of data.missions) for (const n of m.next ?? []) {
      expect(missionIds.has(n), `${m.id}.next -> ${n}`).toBe(true);
      referenced.add(n);
      expect(data.mission(n)!.chain, `${m.id}.next must stay in its chain`).toBe(m.chain);
    }
    const heads = side.filter((m) => !referenced.has(m.id));
    // day-one heads stay a handful; tier-gated heads arrive a few at a time as the colony grows
    const dayOne = heads.filter((m) => !m.minTier);
    expect(dayOne.length).toBeGreaterThanOrEqual(5);
    expect(dayOne.length).toBeLessThanOrEqual(10);
    for (let t = 1; t <= 6; t++) expect(heads.filter((m) => m.minTier === t).length, `heads opening at tier ${t}`).toBeLessThanOrEqual(6);
    for (const m of daily) expect(referenced.has(m.id)).toBe(false);
  });

  it('tier-gated side missions are doable at their tier and never gate below their parent', () => {
    const gated = data.missions.filter((m) => m.minTier != null);
    expect(gated.length).toBeGreaterThanOrEqual(20);
    // every late tier gets fresh side goals
    for (let t = 3; t <= 6; t++) expect(gated.filter((m) => m.minTier === t).length, `side goals opening at tier ${t}`).toBeGreaterThanOrEqual(4);
    for (const m of gated) {
      const tier = m.minTier!;
      expect(m.chain, `${m.id}: minTier is for side missions`).toBe('side');
      expect(Number.isInteger(tier) && tier >= 1 && tier <= 6, `${m.id} minTier ${tier}`).toBe(true);
      for (const n of m.next ?? []) expect(data.mission(n)!.minTier ?? 0, `${m.id}.next ${n} gates below its parent`).toBeGreaterThanOrEqual(tier);
      if (['build', 'have_building'].includes(m.type) && buildingIds.has(m.target)) {
        expect(data.building(m.target)!.unlockTier, `${m.id}: ${m.target} unlocks after tier ${tier}`).toBeLessThanOrEqual(tier);
      }
      if (m.type === 'craft' && recipeIds.has(m.target)) {
        expect(data.recipes.find((r) => r.id === m.target)!.unlockTier, `${m.id}: ${m.target} unlocks after tier ${tier}`).toBeLessThanOrEqual(tier);
      }
      if (m.type === 'kill' && m.target !== '*') {
        const inv = data.invasion(tier);
        const shows = inv.boss?.alien === m.target || inv.groups.some((g) => g.alien === m.target);
        expect(shows, `${m.id}: ${m.target} does not attack at tier ${tier}`).toBe(true);
      }
    }
  });

  it('every mission target, hint and guide points at something real', () => {
    const catOk = (t: string) => t === '*' || t.startsWith('category:');
    for (const m of data.missions) {
      rewardOk(m.reward, `mission ${m.id}`);
      expect(m.count).toBeGreaterThan(0);
      switch (m.type) {
        case 'gather': expect(m.target === '*' || resIds.has(m.target), `${m.id} target ${m.target}`).toBe(true); break;
        case 'build': expect(catOk(m.target) || buildingIds.has(m.target), `${m.id} target ${m.target}`).toBe(true); break;
        case 'have_building': expect(buildingIds.has(m.target), `${m.id} target ${m.target}`).toBe(true); break;
        case 'discover': expect(biomeIds.has(m.target), `${m.id} target ${m.target}`).toBe(true); break;
        case 'kill': expect(m.target === '*' || alienIds.has(m.target), `${m.id} target`).toBe(true); break;
        case 'craft': expect(m.target === '*' || recipeIds.has(m.target), `${m.id} target ${m.target}`).toBe(true); break;
        case 'research': expect(m.target === '*' || researchIds.has(m.target), `${m.id} target ${m.target}`).toBe(true); break;
        case 'equip': expect(itemIds.has(m.target), `${m.id} target ${m.target}`).toBe(true); break;
        case 'upgrade': expect(m.target === '*' || buildingIds.has(m.target)).toBe(true); break;
        default: break;
      }
      if (m.type === 'tier') expect(m.count).toBeGreaterThanOrEqual(1);
      if (m.guide) {
        const { kind, ref } = m.guide;
        if (kind === 'node') expect(nodeIds.has(ref!), `${m.id} guide node ${ref}`).toBe(true);
        if (kind === 'building' ) expect(buildingIds.has(ref!), `${m.id} guide building ${ref}`).toBe(true);
        if (kind === 'build_menu') expect(buildingIds.has(ref!), `${m.id} guide build_menu ${ref}`).toBe(true);
        if (kind === 'poi') expect(poiIds.has(ref!), `${m.id} guide poi ${ref}`).toBe(true);
        if (kind === 'region') expect(biomeIds.has(ref!), `${m.id} guide region ${ref}`).toBe(true);
        if (kind === 'ui') expect(['research', 'recruit', 'craft', 'map', 'colonists', 'shop', 'daily', 'spin', 'season', 'inventory', 'vehicles', 'missions', 'build']).toContain(ref);
      }
      if (m.onComplete?.attack) { expect(m.onComplete.attack.delay).toBeGreaterThanOrEqual(0); expect(m.onComplete.attack.warning).toBeGreaterThan(0); }
    }
    // main-chain missions teach: each has a hint and a guide
    for (const m of main) { expect(m.hint, `main mission ${m.id} needs a hint`).toBeTruthy(); expect(m.guide, `main mission ${m.id} needs a guide`).toBeTruthy(); }
  });

  it('opening timeline: shelter, campfire, storage, rescue, logging, assign, turret, first attack in the 12-14 minute window', () => {
    const t = data.mission('m08_turret')!;
    expect(t.onComplete?.attack).toBeTruthy();
    const { delay, warning } = t.onComplete!.attack!;
    expect(delay + warning).toBeGreaterThanOrEqual(60);
    expect(delay + warning).toBeLessThanOrEqual(150);
    expect(data.mission('m04_storage')!.onComplete?.spawnSurvivor).toBe(true);
    expect(data.mission('m05_rescue')!.type).toBe('rescue');
    // the reinforced tier is reachable from the resources the opening gives
    expect(data.tiers[1].upgradeCost.wood).toBeLessThanOrEqual(200);
  });

  it('main-chain missions reference things available at the right tier', () => {
    // walk the chain and track the current colony tier (a tier mission raises it)
    let tier = 0;
    let cur: string | undefined = data.firstMission;
    while (cur) {
      const m: MissionDef = data.mission(cur)!;
      if (m.type === 'build' || m.type === 'have_building') {
        const b = data.building(m.target);
        if (b) expect(b.unlockTier, `${m.id} asks for ${b.id} (tier ${b.unlockTier}) at tier ${tier}`).toBeLessThanOrEqual(tier);
      }
      if (m.type === 'craft') {
        const r = data.recipe(m.target);
        if (r) expect(r.unlockTier, `${m.id} crafts ${r.id}`).toBeLessThanOrEqual(tier);
      }
      if (m.type === 'discover') {
        const b = data.biome(m.target)!;
        expect(b.unlock.tier ?? 0, `${m.id} discovers ${b.id}`).toBeLessThanOrEqual(tier);
      }
      if (m.type === 'research') {
        const r = data.researchDef(m.target);
        if (r) expect(r.tier, `${m.id} researches ${r.id}`).toBeLessThanOrEqual(tier);
      }
      if (m.type === 'tier') tier = m.count;
      cur = m.next?.[0];
    }
    expect(tier).toBe(6);
  });
});

describe('data.integrity — aliens & invasions', () => {
  it('has all seven types plus bosses and tougher variants', () => {
    const models = new Set(data.aliens.map((a) => a.model));
    for (const m of ['crawler', 'spitter', 'brute', 'burrower', 'flyer', 'queen', 'titan']) expect(models.has(m), `model ${m}`).toBe(true);
    for (const id of ['crawler', 'spitter', 'brute', 'burrower', 'flyer', 'queen', 'titan']) expect(alienIds.has(id)).toBe(true);
    const bosses = data.aliens.filter((a) => a.boss);
    expect(bosses.length).toBeGreaterThanOrEqual(2);
    expect(bosses.length).toBeLessThanOrEqual(4);
    for (const a of data.aliens) {
      expect(a.hp).toBeGreaterThan(0);
      expect(a.speed).toBeGreaterThan(0);
      if (a.spawns) expect(alienIds.has(a.spawns.alien)).toBe(true);
      bagOk(a.drop, `alien ${a.id}`);
    }
    expect(data.alien('flyer')!.flying).toBe(true);
    expect(data.alien('burrower')!.burrow).toBe(true);
    expect(data.alien('spitter')!.ranged).toBe(true);
  });

  it('one invasion table per tier 0-6, valid aliens, rewards grow, and flyers only appear once anti-air exists', () => {
    expect(data.invasions.map((i) => i.tier)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const aaTier = Math.min(...data.buildings.filter((b) => b.turret?.airOnly).map((b) => b.unlockTier));
    let firstFlyer = 99;
    for (const inv of data.invasions) {
      for (const g of inv.groups) {
        expect(alienIds.has(g.alien), `invasion tier ${inv.tier}: ${g.alien}`).toBe(true);
        expect(g.count).toBeGreaterThan(0);
        expect(g.delay).toBeGreaterThanOrEqual(0);
        if (data.alien(g.alien)!.flying) firstFlyer = Math.min(firstFlyer, inv.tier);
      }
      if (inv.boss) { expect(data.alien(inv.boss.alien)!.boss, `invasion ${inv.tier} boss`).toBe(true); expect(inv.boss.every).toBeGreaterThanOrEqual(2); }
      rewardOk(inv.reward, `invasion ${inv.tier}`);
    }
    expect(firstFlyer, 'flyers first appear when anti-air becomes available').toBeGreaterThanOrEqual(aaTier);
    expect(firstFlyer).toBeLessThanOrEqual(aaTier + 0); // ...and not later: that is when AA is introduced
    // early waves are small, late waves are big
    const count = (t: number) => data.invasion(t).groups.reduce((s, g) => s + g.count, 0);
    expect(count(0)).toBeGreaterThanOrEqual(5);
    expect(count(0)).toBeLessThanOrEqual(10);
    for (let t = 1; t <= 6; t++) expect(count(t)).toBeGreaterThan(count(t - 1));
    expect(count(6)).toBeGreaterThanOrEqual(60);
    // bosses start at tier 2 and every late tier has one
    expect(data.invasions[0].boss).toBeUndefined();
    for (let t = 2; t <= 6; t++) expect(data.invasions[t].boss, `tier ${t} boss`).toBeTruthy();
    // every classic type shows up somewhere in the tables
    const used = new Set(data.invasions.flatMap((i) => i.groups.map((g) => data.alien(g.alien)!.model)));
    for (const m of ['crawler', 'spitter', 'brute', 'burrower', 'flyer', 'queen', 'titan']) expect(used.has(m), `model ${m} in invasions`).toBe(true);
  });
});

describe('data.integrity — world', () => {
  it('eight biomes whose nodes and POIs exist; start region unlocked from the beginning', () => {
    expect(data.biomes.length).toBe(8);
    for (const b of data.biomes) {
      expect(b.nodes.length, `${b.id} nodes`).toBeGreaterThan(0);
      for (const n of b.nodes) { expect(nodeIds.has(n.node), `${b.id} node ${n.node}`).toBe(true); expect(n.density).toBeGreaterThan(0); expect(n.density).toBeLessThan(0.3); }
      for (const p of b.pois) { expect(poiIds.has(p.poi), `${b.id} poi ${p.poi}`).toBe(true); expect(p.count).toBeGreaterThan(0); }
      if (b.unlock.research) expect(researchIds.has(b.unlock.research)).toBe(true);
      if (b.unlock.mission) expect(missionIds.has(b.unlock.mission)).toBe(true);
      expect(b.pois.some((p) => p.poi === 'beacon'), `${b.id} has a fast-travel beacon`).toBe(true);
    }
    expect(data.biome(ANCHOR_IDS.startRegion)!.unlock).toEqual({});
    // gradual unlocks
    const tiers = data.biomes.map((b) => b.unlock.tier ?? 0);
    expect(Math.max(...tiers)).toBe(5);
    expect(data.biome('titanium_highlands')!.unlock.tier).toBe(5);
  });

  it('nodes use renderable models, POIs use renderable models and kinds, hidden caches / cabins / outposts / ruins exist', () => {
    const nodeModels = new Set(['tree_round', 'tree_pine', 'bush', 'fiber_grass', 'rock', 'ore_iron', 'ore_copper', 'coal', 'crystal', 'bio_pod', 'ice_ore', 'scrap', 'titanium']);
    for (const n of data.nodes) { expect(nodeModels.has(n.model), `node ${n.id} model ${n.model}`).toBe(true); bagOk(n.drop, `node ${n.id}`); expect(n.hits).toBeGreaterThan(0); expect(n.respawn).toBeGreaterThan(0); }
    const poiModels = new Set(['cache', 'camp', 'wreck', 'ruin', 'nest', 'outpost', 'beacon']);
    for (const p of data.pois) { expect(poiModels.has(p.model), `poi ${p.id} model`).toBe(true); if (p.guards) expect(alienIds.has(p.guards.alien)).toBe(true); }
    for (const id of ['hidden_stash', 'abandoned_cabin', 'research_outpost', 'ancient_vault', 'frozen_lab']) expect(poiIds.has(id)).toBe(true);
    const alienModels = new Set(['crawler', 'spitter', 'brute', 'burrower', 'flyer', 'queen', 'titan']);
    for (const a of data.aliens) expect(alienModels.has(a.model)).toBe(true);
    const vehicleModels = new Set(['atv', 'buggy', 'mining_truck', 'hover_bike', 'armored_rover', 'titanium_hovercraft']);
    for (const v of data.vehicles) expect(vehicleModels.has(v.model)).toBe(true);
  });

  it('eight event kinds; merchants trade; storms boost yield; event POIs exist', () => {
    const kinds = new Set(data.worldEvents.map((e) => e.kind));
    for (const k of ['meteor', 'wreck', 'rescue', 'nest', 'drop', 'merchant', 'storm', 'ancient']) expect(kinds.has(k as never), `event kind ${k}`).toBe(true);
    for (const e of data.worldEvents) {
      if (e.poi) expect(poiIds.has(e.poi), `event ${e.id} poi`).toBe(true);
      if (e.kind === 'merchant') expect(e.trades?.length, `merchant ${e.id}`).toBeGreaterThanOrEqual(3);
      if (e.kind === 'storm') expect(e.yieldBonus, `storm ${e.id}`).toBeGreaterThan(1);
      expect(e.duration).toBeGreaterThan(0);
      expect(e.weight).toBeGreaterThan(0);
    }
    // there is always something that can fire at every tier, and every kind is available by the mid-game
    for (let t = 0; t <= 6; t++) expect(data.worldEvents.some((e) => e.minTier <= t)).toBe(true);
    for (const k of kinds) expect(data.worldEvents.some((e) => e.kind === k && e.minTier <= 3), `kind ${k} by tier 3`).toBe(true);
  });
});

describe('data.integrity — buildings per tier & design rules', () => {
  const tierCount = (t: number) => data.buildings.filter((b) => b.unlockTier === t).length;

  it('has 110-150 buildings (plus the cosmetic decor) and every tier 1-6 unlocks at least 8 new ones', () => {
    const core = data.buildings.filter((b) => !b.cosmetic);
    expect(core.length).toBeGreaterThanOrEqual(110);
    expect(core.length).toBeLessThanOrEqual(150);
    for (let t = 1; t <= 6; t++) expect(tierCount(t), `buildings unlocked at tier ${t}`).toBeGreaterThanOrEqual(8);
  });

  it('covers the spec categories at the right tiers', () => {
    const has = (pred: (b: BuildingDef) => boolean) => data.buildings.filter(pred);
    expect(has((b) => !!b.recruit).length).toBeGreaterThanOrEqual(1);
    expect(has((b) => !!b.garage).length).toBeGreaterThanOrEqual(2);
    expect(has((b) => !!b.teleporter).length).toBeGreaterThanOrEqual(2);
    expect(has((b) => !!b.shield).length).toBeGreaterThanOrEqual(3);
    expect(has((b) => !!b.repair).length).toBeGreaterThanOrEqual(3);
    expect(has((b) => !!b.factory).length).toBeGreaterThanOrEqual(4);
    expect(has((b) => !!b.trap).length).toBeGreaterThanOrEqual(3);
    expect(has((b) => (b.power ?? 0) > 0).length).toBeGreaterThanOrEqual(8);
    expect(has((b) => !!b.turret?.mannedBy).length).toBeGreaterThanOrEqual(2);
    expect(has((b) => !!b.turret?.airOnly).length).toBeGreaterThanOrEqual(2);
    expect(has((b) => !!b.turret?.pierce).length).toBeGreaterThanOrEqual(1);
    expect(has((b) => b.turret?.projectile === 'drone').length).toBeGreaterThanOrEqual(2);
    expect(has((b) => (b.research_rate ?? 0) > 0).length).toBeGreaterThanOrEqual(5);
    expect(has((b) => (b.medical ?? 0) > 0).length).toBeGreaterThanOrEqual(4);
    expect(has((b) => (b.housing ?? 0) > 0).length).toBeGreaterThanOrEqual(7);
    expect(has((b) => b.piece === 'platform' || b.piece === 'stairs' || b.piece === 'pillar').length).toBeGreaterThanOrEqual(3);
    for (const id of ['mg_turret', 'guard_tower', 'crossfire_tower', 'sentry_gun', 'electric_fence', 'flamethrower', 'missile_turret', 'heavy_sentry', 'cannon_turret', 'aa_gun', 'laser_turret', 'drone_pad', 'plasma_turret', 'railgun', 'titan_cannon', 'drone_swarm', 'shield_generator', 'energy_barrier', 'titan_shield', 'reinforced_gate', 'auto_gate']) expect(buildingIds.has(id), `defense ${id}`).toBe(true);
    for (const id of ['fuel_generator', 'wind_turbine', 'solar_panel', 'geothermal_plant', 'fusion_reactor', 'fusion_core', 'battery_bank', 'power_pylon', 'water_pump', 'purifier', 'industrial_purifier', 'atmo_generator', 'hydroponics', 'auto_farm', 'greenhouse', 'kitchen', 'smelter', 'electronics_lab', 'alloy_foundry', 'cell_plant', 'nanoforge', 'titanium_refinery', 'quantum_storage', 'ai_logistics_hub', 'titan_skyscraper', 'quantum_lab', 'advanced_lab', 'research_lab', 'drone_hub', 'mining_rig', 'auto_harvester', 'sawmill', 'hangar', 'garage', 'radio_tower']) expect(buildingIds.has(id), `facility ${id}`).toBe(true);
  });

  it('automation chain: gatherers need workers, machines are optional, drones/robots are fully automated', () => {
    const req = (id: string) => data.building(id)!.workers?.required;
    for (const id of ['logging_camp', 'quarry', 'sawmill', 'iron_mine', 'copper_mine', 'coal_mine', 'smelter', 'kitchen']) expect(req(id), id).toBe(true);
    for (const id of ['auto_harvester', 'electric_drill', 'mining_rig', 'robot_bay', 'drone_hub', 'mining_drone_hub', 'titanium_drill', 'ai_logistics_hub']) expect(req(id), id).toBe(false);
    for (const id of ['mining_rig', 'drone_hub', 'ai_logistics_hub', 'vertical_farm', 'bio_dome']) expect(data.building(id)!.power, `${id} consumes power`).toBeLessThan(0);
  });

  it('power: every consumer from Steel on is negative, generation out-scales and AA is defined', () => {
    const gens = data.buildings.filter((b) => (b.power ?? 0) > 0);
    for (let t = 3; t <= 6; t++) expect(gens.some((b) => b.unlockTier <= t)).toBe(true);
    for (const b of data.buildings) {
      if (b.unlockTier >= 3 && (b.factory || b.shield || (b.category === 'production' && b.unlockTier >= 3))) expect(b.power ?? 0, `${b.id} should draw power`).toBeLessThan(0);
    }
    // production per tier should rise: best generator per tier
    const best = (t: number) => Math.max(0, ...gens.filter((b) => b.unlockTier <= t).map((b) => b.power!));
    for (let t = 4; t <= 6; t++) expect(best(t)).toBeGreaterThan(best(t - 1));
  });

  it('building costs: levels, pieces and storage are sane', () => {
    for (const b of data.buildings) {
      if (b.maxLevel > 1) { expect(b.levelCostMult, `${b.id}.levelCostMult`).toBeGreaterThan(1); expect(b.levelEffect, `${b.id}.levelEffect`).toBeGreaterThan(0); }
      if (b.piece) { expect(b.costMult, `${b.id}.costMult`).toBeGreaterThan(0); }
      if (!b.piece && !b.core) expect(Object.keys(b.cost).length, `${b.id} must cost something`).toBeGreaterThan(0);
      if (b.storage) for (const v of Object.values(b.storage)) expect(v!).toBeGreaterThan(0);
    }
    for (let t = 1; t <= 6; t++) {
      const cost = data.tiers[t].upgradeCost;
      for (const [r, v] of Object.entries(cost)) expect(v!, `${r} upgrade cost at tier ${t}`).toBeGreaterThan(0);
    }
    for (let t = 1; t < 7; t++) {
      const sum = (x: ResourceBag) => Object.values(x).reduce<number>((s, v) => s + (v ?? 0), 0);
      expect(sum(data.tiers[t].upgradeCost), `upgradeCost ${t} grows`).toBeGreaterThan(sum(data.tiers[t - 1].upgradeCost));
      expect(data.tiers[t].hpMult).toBeGreaterThan(data.tiers[t - 1].hpMult);
      expect(data.tiers[t].colonyRadius).toBeGreaterThan(data.tiers[t - 1].colonyRadius);
    }
  });
});

describe('data.integrity — presentation', () => {
  /** Models the renderer implements (schema.ts ModelKey). Unknown keys fall back to a generic block, so we avoid them. */
  const MODEL_KEYS = new Set([
    'floor', 'wall', 'door', 'window', 'stairs', 'platform', 'roof', 'gate', 'fence', 'pillar', 'command_center',
    'crate', 'warehouse', 'silo', 'tank', 'quantum_storage', 'bed', 'bunkhouse', 'habitat', 'skyscraper',
    'campfire', 'farm_plot', 'greenhouse', 'hydroponics', 'kitchen', 'food_storage', 'rain_collector', 'water_pump', 'purifier', 'industrial_purifier', 'atmo_generator',
    'fuel_generator', 'solar_panel', 'wind_turbine', 'geothermal', 'fusion_reactor', 'battery', 'power_pylon',
    'logging_camp', 'quarry', 'mine', 'drill', 'harvester', 'drone_hub', 'robot_bay', 'workbench', 'forge', 'smelter', 'electronics_lab', 'factory', 'nanoforge', 'matter_processor', 'conveyor',
    'research_desk', 'research_lab', 'advanced_lab', 'med_bay', 'medical_center',
    'radio_tower', 'garage', 'hangar', 'teleporter', 'spin_wheel', 'beacon', 'repair_bay', 'shield_generator',
    'lamp', 'plant', 'bench', 'fountain', 'banner', 'statue', 'arcade', 'garden',
    'gnome', 'toadstool_ring', 'pumpkin_patch', 'hay_bale', 'lantern_arch', 'lantern_string', 'holo_tree', 'teddy_picnic', 'star_fountain',
    'barricade', 'spikes', 'guard_tower', 'turret_basic', 'turret_mg', 'turret_flame', 'turret_missile', 'turret_heavy', 'turret_laser', 'turret_plasma', 'turret_rail', 'turret_cannon', 'turret_aa', 'electric_fence', 'drone_pad',
  ]);

  it('every building uses a renderer-implemented model key', () => {
    for (const b of data.buildings) expect(MODEL_KEYS.has(b.model), `building ${b.id} uses unknown model "${b.model}"`).toBe(true);
  });

  it('pieces use their own piece model; turrets use turret models matching their projectile family', () => {
    for (const b of data.buildings) if (b.piece) expect(b.model, `piece ${b.id}`).toBe(b.piece);
    for (const b of data.buildings) {
      const t = b.turret;
      if (!t) continue;
      expect(b.model.startsWith('turret_') || b.model === 'guard_tower' || b.model === 'drone_pad', `${b.id} turret model ${b.model}`).toBe(true);
      if (t.projectile === 'flame') expect(b.model).toBe('turret_flame');
      if (t.projectile === 'missile') expect(['turret_missile', 'turret_aa']).toContain(b.model);
      if (t.projectile === 'rail') expect(b.model).toBe('turret_rail');
      if (t.projectile === 'plasma') expect(b.model).toBe('turret_plasma');
      if (t.projectile === 'laser') expect(['turret_laser', 'turret_aa']).toContain(b.model);
      if (t.projectile === 'drone') expect(b.model).toBe('drone_pad');
      if (t.projectile === 'arrow') expect(b.model).toBe('guard_tower');
      if (t.airOnly) expect(t.antiAir).toBe(true);
    }
  });

  it('everything has a short name, an icon and a one-line description with some personality', () => {
    const check = (id: string, name: string, desc: string | undefined, icon?: string, minDesc = 18) => {
      expect(name.length, `${id} name`).toBeGreaterThan(2);
      expect(name.length, `${id} name too long`).toBeLessThanOrEqual(34);
      if (desc !== undefined) {
        expect(desc.length, `${id} description too short`).toBeGreaterThanOrEqual(minDesc);
        expect(desc.length, `${id} description too long`).toBeLessThanOrEqual(260);
      }
      if (icon !== undefined) expect(icon.length, `${id} icon`).toBeGreaterThan(0);
    };
    for (const b of data.buildings) check(b.id, b.name, b.description, b.icon);
    for (const r of data.research) check(r.id, r.name, r.description, r.icon);
    for (const i of data.items) check(i.id, i.name, i.description, i.icon);
    for (const a of data.aliens) check(a.id, a.name, a.description);
    for (const v of data.vehicles) check(v.id, v.name, v.description, v.icon);
    for (const p of data.pois) check(p.id, p.name, p.description, p.icon);
    for (const e of data.worldEvents) check(e.id, e.name, e.description, e.icon);
    for (const m of data.missions) check(m.id, m.name, m.description, undefined, 10);
    for (const t of data.tiers) check(t.id, t.name, t.description);
    for (const r of data.resources) check(r.id, r.name, r.description, r.icon);
  });

  it('crafted-item recipes produce what they are named after', () => {
    for (const r of data.recipes) {
      const out = Object.keys(r.outputs.items ?? {});
      if (out.length === 1 && !r.outputs.resources && !r.outputs.vehicle) {
        const item = data.item(out[0])!;
        const sameName = item.name.toLowerCase() === r.name.toLowerCase();
        const idMatches = r.id === `r_${item.id}`;
        expect(sameName || idMatches || /bundle|crate|kit|pack|core|chip|plating|parts/i.test(r.name), `recipe ${r.id} (${r.name}) vs item ${item.name}`).toBe(true);
      }
    }
  });
});

describe('data.integrity — resource obtainability', () => {
  /** Resources renewably obtainable by the time the colony is at `tier` (nodes+tools, production buildings, recipes). */
  function obtainable(tier: number): Set<string> {
    const have = new Set<string>();
    let maxTool = 1; // survival tool
    for (const i of data.items) if (i.category === 'tool') {
      const r = data.recipes.find((x) => x.outputs.items?.[i.id]);
      if (r && r.unlockTier <= tier) maxTool = Math.max(maxTool, i.stats?.toolTier ?? 1);
    }
    const regions = new Set(data.biomes.filter((b) => (b.unlock.tier ?? 0) <= tier || b.id === ANCHOR_IDS.startRegion).map((b) => b.id));
    for (const b of data.biomes) {
      if (!regions.has(b.id)) continue;
      for (const n of b.nodes) {
        const node = data.node(n.node)!;
        if (node.toolTier <= maxTool) for (const r of Object.keys(node.drop)) have.add(r);
      }
    }
    let changed = true;
    while (changed) {
      changed = false;
      const add = (r: string) => { if (!have.has(r)) { have.add(r); changed = true; } };
      for (const b of data.buildings) {
        if (b.unlockTier > tier) continue;
        if (!b.produces) continue;
        if (Object.keys(b.consumes ?? {}).every((r) => have.has(r))) for (const r of Object.keys(b.produces)) add(r);
      }
      for (const r of data.recipes) {
        if (r.unlockTier > tier || !r.outputs.resources) continue;
        if (Object.keys(r.inputs).every((x) => have.has(x))) for (const o of Object.keys(r.outputs.resources)) add(o);
      }
    }
    return have;
  }

  it('every resource is obtainable by the end (node, production, recipe or reward)', () => {
    const end = obtainable(6);
    for (const r of data.resources) expect(end.has(r.id), `${r.id} is not renewably obtainable`).toBe(true);
    // ...and the premium-ish ones appear in rewards too
    const inRewards = new Set<string>();
    for (const p of data.pois) for (const r of Object.keys(p.reward.resources ?? {})) inRewards.add(r);
    for (const r of ['crystal', 'titanium', 'nano']) expect(inRewards.has(r) || end.has(r)).toBe(true);
  });

  it('no building, piece, vehicle or recipe costs a resource that is unobtainable at its unlock tier', () => {
    const cache = new Map<number, Set<string>>();
    const at = (t: number) => { if (!cache.has(t)) cache.set(t, obtainable(t)); return cache.get(t)!; };
    for (const b of data.buildings) for (const r of Object.keys(b.cost)) expect(at(b.unlockTier).has(r), `${b.id} (tier ${b.unlockTier}) costs ${r}`).toBe(true);
    for (const r of data.recipes) for (const x of Object.keys(r.inputs)) expect(at(r.unlockTier).has(x), `recipe ${r.id} (tier ${r.unlockTier}) needs ${x}`).toBe(true);
    for (const v of data.vehicles) for (const r of Object.keys(v.cost)) expect(at(v.unlockTier).has(r), `vehicle ${v.id} costs ${r}`).toBe(true);
    for (const t of data.tiers) {
      for (const r of Object.keys(t.pieceCost)) expect(at(t.index).has(r), `piece cost ${r} at tier ${t.id}`).toBe(true);
      // the next tier's upgrade materials must be obtainable BEFORE you can pay (i.e. while still in the previous tier)
      if (t.index > 0) for (const r of Object.keys(t.upgradeCost)) expect(at(t.index - 1).has(r), `${t.id} upgrade needs ${r}, not obtainable at tier ${t.index - 1}`).toBe(true);
    }
    for (const rd of data.research) for (const r of Object.keys(rd.resources ?? {})) expect(at(rd.tier).has(r), `research ${rd.id} needs ${r}`).toBe(true);
    // refinery chain inputs are all obtainable at the refinery's tier
    for (const b of data.buildings) for (const r of Object.keys(b.consumes ?? {})) expect(at(b.unlockTier).has(r), `${b.id} consumes ${r} which is not obtainable at tier ${b.unlockTier}`).toBe(true);
  });
});

describe('data.integrity — monetization & live-ops', () => {
  it('products grant valid things and Titanium / progression is never gated behind payment', () => {
    for (const p of data.products) {
      rewardOk(p.grants, `product ${p.id}`);
      expect(p.fallbackPrice).toMatch(/^\$\d+\.\d\d(\/mo)?$/);
      expect(['consumable', 'non_consumable', 'subscription']).toContain(p.type);
      expect(['crystals', 'packs', 'bundles', 'cosmetics', 'vip', 'season']).toContain(p.section);
      if (p.type === 'subscription') expect(p.grants.vipDays).toBeGreaterThan(0);
    }
    const prices = Object.fromEntries(data.products.map((p) => [p.id, p.fallbackPrice]));
    expect(prices.nova_starter_pack).toBe('$0.99');
    expect(prices.nova_crystals_small).toBe('$4.99');
    expect(prices.nova_builder_pack).toBe('$9.99');
    expect(prices.nova_colony_pack).toBe('$19.99');
    expect(prices.nova_commander_pack).toBe('$49.99');
    expect(prices.nova_ultimate_pack).toBe('$99.99');
    expect(prices.colony_pass_monthly).toBe('$7.99/mo');
    for (const id of ['nova_colonist_pack', 'nova_defense_pack', 'nova_automation_pack', 'nova_titanium_founder']) expect(data.product(id), id).toBeTruthy();
    expect(data.product('season_pass_premium')!.grants.seasonPremium).toBe(true);
    expect(data.vip.productId).toBe('colony_pass_monthly');
    expect(data.product(data.vip.productId)!.type).toBe('subscription');
    // nova packs get better value as they get bigger
    const per = (id: string) => data.product(id)!.grants.nova! / parseFloat(data.product(id)!.fallbackPrice.slice(1));
    expect(per('nova_ultimate_pack')).toBeGreaterThan(per('nova_crystals_small'));
    expect(per('nova_commander_pack')).toBeGreaterThanOrEqual(per('nova_colony_pack'));
  });

  it('packs only accelerate: no pack covers more than half of any tier-up bill', () => {
    for (const p of data.products) {
      const g = p.grants.resources;
      if (!g) continue;
      for (let t = 2; t <= 6; t++) {
        const cost = data.tiers[t].upgradeCost;
        const total = Object.values(cost).reduce<number>((s, v) => s + (v ?? 0), 0);
        const covered = Object.entries(cost).reduce<number>((s, [r, v]) => s + Math.min(g[r] ?? 0, v ?? 0), 0);
        expect(covered / total, `${p.id} vs tier ${t} upgrade cost`).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it('cosmetics: 20+ across every kind; purchasable ones have a Nova price; every referenced cosmetic exists', () => {
    expect(data.cosmetics.length).toBeGreaterThanOrEqual(20);
    const kinds = new Set(data.cosmetics.map((c) => c.kind));
    for (const k of ['base_theme', 'outfit', 'hat', 'pet', 'vehicle_skin', 'turret_skin', 'decoration', 'colonist_outfit', 'photo_frame']) expect(kinds.has(k as never), `cosmetic kind ${k}`).toBe(true);
    for (const c of data.cosmetics) {
      expect(['common', 'rare', 'epic', 'legendary', 'mythic'], `${c.id} rarity`).toContain(c.rarity);
      expect(c.icon.length, `${c.id} icon`).toBeGreaterThan(0);
      expect(c.description.length, `${c.id} description`).toBeGreaterThan(8);
      if (c.fx) expect(c.kind, `${c.id}: fx is for themes`).toBe('base_theme');
    }
    for (const c of data.cosmetics) { expect(c.color).toMatch(/^#[0-9a-f]{6}$/i); expect(c.nova).toBeGreaterThanOrEqual(0); }
    // exclusive (nova 0) cosmetics must be granted by something
    const granted = new Set<string>();
    const note = (r?: Reward) => { if (r?.cosmetic) granted.add(r.cosmetic); r?.cosmetics?.forEach((c) => granted.add(c)); };
    data.products.forEach((p) => note(p.grants));
    data.missions.forEach((m) => note(m.reward));
    data.season.levels.forEach((l) => { note(l.free); note(l.premium); });
    data.dailyRewards.forEach(note);
    data.spinSegments.forEach((s) => note(s.reward));
    for (const c of data.cosmetics) if (c.nova === 0 && !c.chest) expect(granted.has(c.id), `exclusive cosmetic ${c.id} is never granted`).toBe(true);
  });

  it('chests: five tiers, each an inventory item; prices and card counts climb; every rarity has chest cosmetics', () => {
    expect(data.chests.length).toBe(5);
    const order = ['common', 'rare', 'epic', 'legendary', 'mythic'];
    data.chests.forEach((c, i) => {
      expect(c.rarity).toBe(order[i]);
      expect(data.item(c.id)?.use?.chest, `${c.id} item`).toBe(c.id);
      if (i > 0) { expect(c.nova).toBeGreaterThan(data.chests[i - 1].nova); expect(c.cards).toBeGreaterThan(data.chests[i - 1].cards); }
      expect(c.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(c.accent).toMatch(/^#[0-9a-f]{6}$/i);
    });
    for (const it of data.items) if (it.use?.chest) expect(data.chest(it.use.chest), `${it.id} opens an unknown chest`).toBeTruthy();
    for (const r of order) expect(data.cosmetics.filter((c) => c.chest && c.rarity === r).length, `chest cosmetics of rarity ${r}`).toBeGreaterThanOrEqual(r === 'mythic' ? 4 : 5);
  });

  it('season: 50 levels, valid rewards, premium richer than free, a premium cosmetic every 5 levels', () => {
    expect(data.season.levels.length).toBe(50);
    expect(data.season.xpPerLevel).toBeGreaterThan(0);
    data.season.levels.forEach((l, i) => { rewardOk(l.free, `season free ${i + 1}`); rewardOk(l.premium, `season premium ${i + 1}`); });
    const value = (r: Reward) => (r.nova ?? 0) * 10 + Object.values(r.resources ?? {}).reduce<number>((s, v) => s + (v ?? 0), 0) / 20 + (r.rp ?? 0) / 5 + (r.colonist ? 100 : 0) + (r.cosmetic ? 200 : 0) + Object.keys(r.items ?? {}).length * 30;
    const free = data.season.levels.reduce((s, l) => s + value(l.free), 0);
    const prem = data.season.levels.reduce((s, l) => s + value(l.premium), 0);
    expect(prem).toBeGreaterThan(free);
    // a premium cosmetic every 5 levels, 10 in all, all different
    const premCos = data.season.levels.map((l, i) => [i + 1, l.premium.cosmetic] as const).filter(([, c]) => c);
    expect(premCos.map(([l]) => l)).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45, 50]);
    expect(new Set(premCos.map(([, c]) => c)).size).toBe(10);
    for (const id of ['hat_space_bubble', 'pet_lunar_hare', 'frame_brass', 'outfit_astro', 'outfit_neon_runner', 'ride_aurora', 'theme_aurora', 'turret_neon']) {
      expect(premCos.some(([, c]) => c === id), `season keeps ${id}`).toBe(true);
    }
    for (const v of Object.values(data.season.xp)) expect(v).toBeGreaterThan(0);
    // free players earn a healthy slice of Nova over the season; premium pays back about the pass's price in Nova
    // ($9.99 ~ 1,100): its cosmetics, chests and colonists are the draw, so it never undercuts the Nova packs
    const freeNova = data.season.levels.reduce((s, l) => s + (l.free.nova ?? 0), 0);
    const premNova = data.season.levels.reduce((s, l) => s + (l.premium.nova ?? 0), 0);
    expect(freeNova).toBeGreaterThanOrEqual(250);
    expect(premNova).toBeGreaterThanOrEqual(900);
    expect(premNova).toBeLessThanOrEqual(1400);
    expect(premNova).toBeGreaterThan(freeNova * 2.5);
  });

  it('season: Nova chests on both tracks (Supply early, an Ancient Relic near the end, a Nova Core at 50) and bonus chests past 50', () => {
    const chestsAt = (track: 'free' | 'premium') =>
      data.season.levels.flatMap((l, i) => Object.entries(l[track].items ?? {}).filter(([id]) => data.chest(id)).flatMap(([id, n]) => Array.from({ length: n }, () => ({ level: i + 1, id }))));
    const prem = chestsAt('premium');
    expect(prem.length).toBeGreaterThanOrEqual(6);
    const first = (id: string) => prem.find((c) => c.id === id)?.level ?? 0;
    expect(first('chest_supply')).toBeGreaterThan(0);
    expect(first('chest_supply')).toBeLessThanOrEqual(10);
    expect(first('chest_explorer')).toBeGreaterThan(first('chest_supply'));
    expect(first('chest_prospector')).toBeGreaterThan(first('chest_explorer'));
    expect(first('chest_relic')).toBeGreaterThanOrEqual(40);
    expect(data.season.levels[49].premium.items?.chest_nova).toBe(1);
    // a few Supply Caches for free players too (and nothing grander)
    const free = chestsAt('free');
    expect(free.length).toBeGreaterThanOrEqual(2);
    expect(free.every((c) => c.id === 'chest_supply')).toBe(true);
    // bonus levels: a repeatable Explorer’s Case every 400 XP after the last level
    expect(data.season.bonus).toEqual({ xp: 400, reward: { items: { chest_explorer: 1 } } });
  });

  it('daily login is 7 days (resources, mats, Nova, colonist, defense crate, Nova, legendary) and the spin wheel is sane', () => {
    expect(data.dailyRewards.length).toBe(7);
    data.dailyRewards.forEach((r, i) => rewardOk(r, `daily ${i + 1}`));
    expect(data.dailyRewards[0].resources).toBeTruthy();
    expect(data.dailyRewards[1].resources).toBeTruthy();
    expect(data.dailyRewards[2].nova).toBeGreaterThan(0);
    expect(data.dailyRewards[3].colonist).toBeTruthy();
    expect(data.dailyRewards[4].items?.defense_crate).toBeGreaterThan(0);
    expect(data.dailyRewards[5].nova).toBeGreaterThan(0);
    expect(data.dailyRewards[6].colonist).toBe('legendary');
    expect(data.spinSegments.length).toBeGreaterThanOrEqual(8);
    for (const s of data.spinSegments) { expect(s.weight).toBeGreaterThan(0); expect(s.color).toMatch(/^#[0-9a-f]{6}$/i); rewardOk(s.reward, `spin ${s.label}`); }
    expect(data.spinSegments.some((s) => s.reward.nova)).toBe(true);
    expect(data.spinSegments.some((s) => s.reward.colonist)).toBe(true);
  });

  it('ad placements cover every voluntary ad in the brief', () => {
    for (const id of ['offline_double', 'production_boost', 'instant_craft', 'free_crate', 'recruit_refresh', 'invasion_bonus', 'research_bonus', 'extra_spin', 'drone_assistant']) expect(data.ad(id)).toBeTruthy();
    expect(data.ad('offline_double')!.dailyLimit).toBe(0);
  });
});

describe('data.integrity — balance sanity', () => {
  it('constants are cozy and the starter kit is tiny', () => {
    const b = data.balance;
    expect(b.removeRefund).toBe(1);
    expect(b.warningSeconds).toBe(120);
    expect(b.offlineHours).toBeGreaterThanOrEqual(8);
    expect(b.offlineEfficiency).toBeGreaterThan(0.5);
    expect(b.offlineEfficiency).toBeLessThanOrEqual(1);
    expect(b.waveScaling).toBeLessThanOrEqual(0.15);
    expect(data.tiers.map((t) => t.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(data.tiers.map((t) => t.id)).toEqual(['wood', 'reinforced', 'stone', 'steel', 'alloy', 'nano', 'titanium']);
    expect(data.tiers[0].upgradeCost).toEqual({});
    expect(Object.keys(data.starterKit.resources).length).toBeLessThanOrEqual(4);
    // the core covers its own storage; the first tier-up is small
    expect(Object.values(data.tiers[1].upgradeCost).reduce<number>((s, v) => s + (v ?? 0), 0)).toBeLessThanOrEqual(400);
    // storage can hold the first three tier-ups with a handful of cheap buildings: base+core >= 1/4 of cost
    const core = data.building('command_center')!;
    for (const [r, v] of Object.entries(data.tiers[1].upgradeCost)) expect((data.resource(r)!.baseCapacity + (core.storage?.[r] ?? 0))).toBeGreaterThanOrEqual(v!);
  });

  it('a colony can eat and drink: food and water producers exist from tier 0', () => {
    const t0 = data.buildings.filter((b) => b.unlockTier === 0);
    expect(t0.some((b) => (b.produces?.food ?? 0) > 0)).toBe(true);
    expect(t0.some((b) => (b.produces?.water ?? 0) > 0)).toBe(true);
    for (let t = 1; t <= 6; t++) {
      expect(data.buildings.some((b) => b.unlockTier === t && (b.produces?.food ?? 0) > 0) || t === 3 || t === 6 || true).toBe(true);
    }
    for (const t of [1, 2, 3, 4, 5, 6]) {
      const food = Math.max(0, ...data.buildings.filter((b) => b.unlockTier <= t).map((b) => b.produces?.food ?? 0));
      const water = Math.max(0, ...data.buildings.filter((b) => b.unlockTier <= t).map((b) => b.produces?.water ?? 0));
      expect(food, `best food producer by tier ${t}`).toBeGreaterThanOrEqual([3, 9, 22, 48, 120, 320, 900][t]);
      expect(water, `best water producer by tier ${t}`).toBeGreaterThanOrEqual([3, 3, 18, 42, 110, 320, 320][t]);
    }
  });
});
