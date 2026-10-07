import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/data/buildings';
import { RESEARCH } from '../src/data/research';
import { TIERS } from '../src/data/tiers';
import { BALANCE } from '../src/data/balance';
import { INVASIONS } from '../src/data/aliens';
import { MISSIONS, FIRST_MISSION } from '../src/data/missions';
import type { BuildingDef, ResourceBag } from '../src/data/schema';

/**
 * ANALYTICAL PACING MODEL
 * -----------------------
 * Simulates an *engaged* player (online + offline wall-clock) with a plausible build-out per tier and asks:
 * when can they afford the next tier's upgradeCost + the research gate chain?  Targets (minutes since start):
 *   Reinforced 15 · Stone 60 · Steel 180 · Alloy 360 · Nano 720 · Titanium ~1620 (24-30 h).
 * We assert each lands within +-40% of its target and print a table.
 *
 * Model assumptions (all documented here so they can be argued with):
 *  - Time step 0.5 min. Machines produce continuously, scaled by staffing (required workers) and happiness.
 *  - Player online fraction decays as the colony automates; offline production runs at BALANCE.offlineEfficiency.
 *    Manual gathering only happens while online (rates include tool multipliers + research gather bonuses).
 *  - Colonists grow from the recruit board (3 candidates / refresh) + survivor camps, capped by beds.
 *  - Purchases follow a fixed per-tier PLAN (cheapest-first greedy among plan items that are unlocked).
 *    Research is bought on demand (prerequisite closure, RP + resources); the tier gate chain is bought before tier-up.
 *  - Main-mission rewards are credited proportionally as the plan progresses; invasion chests every invasionInterval.
 *  - Storage caps are enforced: the colony must actually be able to HOLD the next tier's upgrade cost.
 *  - The first 14 minutes are scripted (the first attack lands at ~13 min), so tier 1 cannot come earlier than that.
 */

const TARGET_MIN = [0, 15, 60, 180, 360, 720, 1620];
const TOLERANCE = 0.4;
const STEP = 0.5;
const MAX_MIN = 6000;

const ONLINE = [1, 0.85, 0.65, 0.5, 0.4, 0.35, 0.3];
const HAPPY = [1, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3];
const SCRIPTED_FIRST_TIER_MIN = 14;

/** Manual gathering per ACTIVE online minute, by colony tier (includes tool yield multipliers). */
const MANUAL: ResourceBag[] = [
  { wood: 55, stone: 22, fiber: 18 },
  { wood: 40, stone: 28, fiber: 25, iron: 8, copper: 4, coal: 4 },
  { wood: 28, stone: 32, fiber: 16, iron: 18, copper: 10, coal: 10, crystal: 6 },
  { stone: 30, iron: 22, copper: 14, coal: 14, crystal: 10 },
  { stone: 20, iron: 20, copper: 16, coal: 16, crystal: 16, biomass: 6 },
  { crystal: 22, iron: 20, biomass: 8, titanium: 5 },
  { crystal: 25, titanium: 8, biomass: 8 },
];

interface Buy { id: string; n?: number; lvl?: number }
interface PlanStep { buy?: Buy; structure?: number }

const b = (id: string, n = 1, lvl = 1): PlanStep => ({ buy: { id, n, lvl } });
const walls = (n: number): PlanStep => ({ structure: n });

/** What a reasonably engaged player builds before moving to the next tier (tier index = the tier they are in). */
const PLAN: PlanStep[][] = [
  // ---- tier 0 (the guided first 15 minutes)
  [b('shelter'), b('campfire'), b('storage_crate'), b('logging_camp'), b('scrap_turret'), b('berry_patch'), b('rain_collector'), b('workbench'), walls(30)],
  // ---- tier 1 Reinforced
  [b('research_desk', 3, 2), b('radio_tower'), b('cabin', 2), b('veggie_farm', 2, 2), b('sawmill', 1, 3), b('logging_camp', 1, 3), b('quarry', 2, 2), b('storage_shed', 3), b('water_tank'), b('rain_collector', 3, 3), b('larder'), b('guard_tower', 2), b('garage'), b('herb_garden', 2), b('banner', 2), b('lamp_post', 4), b('flower_bed', 4), b('log_trap', 3), b('log_bench', 2), b('shelter', 3), b('spin_wheel'), walls(70)],
  // ---- tier 2 Stone
  [b('stone_lodge', 2), b('warehouse', 2), b('ore_silo'), b('greenhouse', 2), b('kitchen'), b('water_pump', 2, 2), b('iron_mine', 3, 3), b('copper_mine', 1, 3), b('coal_mine', 2, 3), b('smelter', 1, 3), b('forge'), b('workshop'), b('research_lab', 2, 2), b('med_bay'), b('fountain'), b('stone_statue'), b('crossfire_tower', 2), b('sentry_gun', 4), b('quarry', 2, 4), b('sawmill', 1, 4), walls(130)],
  // ---- tier 3 Steel
  [b('fuel_generator', 3, 2), b('wind_turbine', 6, 2), b('solar_panel', 6, 2), b('battery_bank', 2), b('steel_dorm', 2), b('steel_vault', 2), b('bulk_silo', 2), b('hydroponics', 2), b('purifier', 2, 2), b('auto_harvester', 1), b('electric_drill', 4, 3), b('crystal_extractor', 2, 3), b('electronics_lab', 2, 3), b('alloy_foundry', 1, 3), b('smelter', 4, 3), b('factory'), b('repair_bay'), b('clinic'), b('observatory'), b('arcade'), b('mg_turret', 4), b('electric_fence', 6), b('flamethrower', 2), b('research_lab', 3, 3), walls(200)],
  // ---- tier 4 Alloy
  [b('geothermal_plant', 3, 2), b('solar_array', 2), b('mining_rig', 3, 3), b('robot_bay', 1, 2), b('fabricator'), b('large_factory'), b('cell_plant', 1, 3), b('nanoforge', 1, 2), b('auto_farm', 2), b('industrial_purifier', 2), b('hangar'), b('advanced_lab', 3, 2), b('crystal_vault', 2, 2), b('mega_warehouse', 2), b('alloy_habitat', 3), b('missile_turret', 3), b('heavy_sentry', 3), b('cannon_turret', 2), b('aa_gun', 3), b('shield_generator'), b('alloy_foundry', 2, 4), b('smelter', 4, 5), b('crystal_extractor', 3, 5), b('bio_digester', 2, 3), b('electric_drill', 4, 5), b('electronics_lab', 2, 4), walls(320)],
  // ---- tier 5 Nano
  [b('fusion_reactor', 2), b('drone_hub', 1, 2), b('mining_drone_hub', 2, 2), b('matter_processor'), b('titanium_drill', 2, 2), b('titanium_refinery', 1, 2), b('nano_factory'), b('teleporter'), b('atmo_generator', 2), b('vertical_farm', 2), b('nano_residence', 3), b('nano_vault', 3, 4), b('nanoforge', 1, 3), b('advanced_lab', 4, 3), b('laser_turret', 4), b('drone_pad', 2), b('energy_barrier'), b('flak_battery', 2), b('alloy_foundry', 2, 4), b('cell_plant', 1, 4), b('smelter', 4, 4), walls(520)],
  // ---- tier 6 Titanium (post-game; used only for balance checks, no further tier-up)
  [],
];

// ---------------------------------------------------------------------------------------------

const byId = new Map(BUILDINGS.map((x) => [x.id, x]));
const researchById = new Map(RESEARCH.map((r) => [r.id, r]));
const RES_IDS = ['wood', 'stone', 'fiber', 'food', 'water', 'iron', 'copper', 'coal', 'steel', 'electronics', 'biomass', 'crystal', 'alloy', 'energy_cell', 'nano', 'titanium'];

const lvlMult = (d: BuildingDef, lvl: number) => 1 + (d.levelEffect ?? 0) * (lvl - 1);
const bagAdd = (a: ResourceBag, b2: ResourceBag | undefined, s = 1) => { for (const [k, v] of Object.entries(b2 ?? {})) a[k] = (a[k] ?? 0) + (v as number) * s; return a; };

/** Cost to take one instance of `d` from level `from` to level `to` (from 0 = brand new at level 1). */
function levelCost(d: BuildingDef, from: number, to: number): ResourceBag {
  const out: ResourceBag = {};
  for (let l = from + 1; l <= to; l++) bagAdd(out, d.cost, Math.pow(d.levelCostMult ?? 1.8, l - 1));
  return out;
}

interface Inst { def: BuildingDef; lvl: number }

/** Approximate net machine income per minute (stock limits ignored) for a set of buildings. */
function incomeSnapshot(insts: Inst[], colonists: number, tier: number): ResourceBag {
  const out: ResourceBag = {};
  const jobs = insts.filter((i) => i.def.workers);
  const reqSlots = jobs.reduce((s, i) => s + (i.def.workers!.required ? i.def.workers!.slots : 0), 0);
  const optSlots = jobs.reduce((s, i) => s + (!i.def.workers!.required ? i.def.workers!.slots : 0), 0);
  const staffReq = reqSlots > 0 ? Math.min(1, colonists / reqSlots) : 1;
  const optStaff = optSlots > 0 ? Math.min(1, Math.max(0, colonists - reqSlots) / optSlots) : 0;
  for (const i of insts) {
    const d = i.def;
    const eff = (d.workers ? (d.workers.required ? staffReq : 1 + 0.25 * d.workers.slots * optStaff) : 1) * lvlMult(d, i.lvl) * HAPPY[tier];
    for (const [r, v] of Object.entries(d.produces ?? {})) out[r] = (out[r] ?? 0) + (v as number) * eff;
    for (const [r, v] of Object.entries(d.consumes ?? {})) out[r] = (out[r] ?? 0) - (v as number) * lvlMult(d, i.lvl);
    if (d.research_rate) out.rp = (out.rp ?? 0) + d.research_rate * eff;
  }
  return out;
}

interface Result {
  tier: number;
  at: number;
  buildDone: number;
  bottleneck: string;
  note?: string;
}

interface SimOut {
  diag?: string;
  results: Result[];
  insts: Inst[];
  colonists: number;
  stuckAt?: number;
}

function missionPhases(): { phaseRewards: { res: ResourceBag; rp: number }[]; tierRewards: { res: ResourceBag; rp: number }[] } {
  // walk the main chain; a 'tier' mission closes the phase it is in
  const byMid = new Map(MISSIONS.map((m) => [m.id, m]));
  const phaseRewards: { res: ResourceBag; rp: number }[] = [{ res: {}, rp: 0 }];
  const tierRewards: { res: ResourceBag; rp: number }[] = [];
  let cur = byMid.get(FIRST_MISSION);
  while (cur) {
    const phase = phaseRewards[phaseRewards.length - 1];
    if (cur.type === 'tier') {
      const tr = { res: bagAdd({}, cur.reward.resources), rp: cur.reward.rp ?? 0 };
      tierRewards.push(tr);
      phaseRewards.push({ res: {}, rp: 0 });
    } else {
      bagAdd(phase.res, cur.reward.resources);
      phase.rp += cur.reward.rp ?? 0;
    }
    const nxt = cur.next?.[0];
    cur = nxt ? byMid.get(nxt) : undefined;
  }
  return { phaseRewards, tierRewards };
}

function simulate(plan: PlanStep[][] = PLAN, verbose = false): SimOut {
  const stock: Record<string, number> = {};
  for (const r of RES_IDS) stock[r] = 0;
  stock.wood = 10; stock.food = 20; stock.water = 20;
  const insts: Inst[] = [];
  const done = new Set<string>();
  let rp = 0;
  let tier = 0;
  let t = 0;
  const results: Result[] = [];
  const { phaseRewards, tierRewards } = missionPhases();
  const researchMods: { stat: string; add: number }[] = [];
  let colonistsNow = 1;
  let structureDone = new Set<number>();
  const stepsBought = new Set<string>();
  let nextInvasionAt = SCRIPTED_FIRST_TIER_MIN - 0.5;
  let lastBottleneck = '';
  const planDoneAt: Record<number, number> = {};
  const stepLog: Record<number, string[]> = {};
  const bottleAtDone: Record<number, string> = {};

  const mod = (stat: string) => 1 + researchMods.filter((m) => m.stat === stat).reduce((s, m) => s + m.add, 0);

  const capacity = (): Record<string, number> => {
    const cap: Record<string, number> = {};
    const ccDef = byId.get('command_center')!;
    const storageMod = mod('storage');
    const baseRes: Record<string, number> = { wood: 200, stone: 200, fiber: 150, food: 150, water: 150, iron: 100, copper: 100, coal: 100, steel: 80, electronics: 60, biomass: 60, crystal: 50, alloy: 40, energy_cell: 40, nano: 30, titanium: 30 };
    for (const r of RES_IDS) cap[r] = (baseRes[r] ?? 0) + (ccDef.storage?.[r] ?? 0);
    for (const i of insts) {
      if (!i.def.storage) continue;
      for (const [r, v] of Object.entries(i.def.storage)) cap[r] = (cap[r] ?? 0) + (v as number) * lvlMult(i.def, i.lvl) * storageMod;
    }
    return cap;
  };

  const housing = () => 1 + insts.reduce((s, i) => s + (i.def.housing ?? 0) * lvlMult(i.def, i.lvl), 0);

  const canResearch = (id: string, spendResources: ResourceBag): boolean => {
    // returns true if the whole closure can be bought right now (and buys it)
    const chain: string[] = [];
    const seen = new Set<string>();
    const visit = (nid: string) => {
      if (done.has(nid) || seen.has(nid)) return;
      seen.add(nid);
      const n = researchById.get(nid);
      if (!n) throw new Error(`unknown research ${nid}`);
      for (const r of n.requires) visit(r);
      chain.push(nid);
    };
    visit(id);
    let needRp = 0;
    const needRes: ResourceBag = {};
    for (const nid of chain) {
      const n = researchById.get(nid)!;
      if (n.tier > tier) throw new Error(`plan needs research ${nid} (tier ${n.tier}) while at tier ${tier}`);
      needRp += n.cost;
      bagAdd(needRes, n.resources);
    }
    bagAdd(needRes, spendResources);
    if (rp < needRp) return false;
    for (const [k, v] of Object.entries(needRes)) if ((stock[k] ?? 0) < (v as number)) return false;
    rp -= needRp;
    for (const [k, v] of Object.entries(needRes)) stock[k] -= v as number;
    for (const nid of chain) {
      done.add(nid);
      for (const e of researchById.get(nid)!.effects ?? []) researchMods.push({ stat: e.stat, add: e.add ?? 0 });
    }
    return true;
  };

  const tryBuy = (buy: Buy): boolean => {
    const d = byId.get(buy.id);
    if (!d) throw new Error(`plan references unknown building ${buy.id}`);
    if (d.unlockTier > tier) throw new Error(`plan buys ${buy.id} (tier ${d.unlockTier}) while at tier ${tier}`);
    const have = insts.filter((i) => i.def === d).sort((a, c) => c.lvl - a.lvl);
    const n = buy.n ?? 1;
    const lvl = buy.lvl ?? 1;
    // incremental cost to have n instances at >= lvl
    const cost: ResourceBag = {};
    const targets: { inst?: Inst; from: number }[] = [];
    for (let k = 0; k < n; k++) {
      const inst = have[k];
      const from = inst ? inst.lvl : 0;
      if (from >= lvl) continue;
      bagAdd(cost, levelCost(d, from, lvl));
      targets.push({ inst, from });
    }
    if (targets.length === 0) return true;
    if (d.research && !done.has(d.research)) {
      // research the unlock first (only if affordable together with the first copy)
      if (!canResearch(d.research, {})) return false;
    }
    // buy as many copies as are affordable one at a time (a player does not wait to afford them all at once)
    let boughtAny = false;
    for (const tgt of targets) {
      const c1 = levelCost(d, tgt.from, lvl);
      if (!Object.entries(c1).every(([k, v]) => (stock[k] ?? 0) >= (v as number))) break;
      for (const [k, v] of Object.entries(c1)) stock[k] -= v as number;
      if (tgt.inst) tgt.inst.lvl = lvl; else insts.push({ def: d, lvl });
      boughtAny = true;
      creditMission(tier);
    }
    void boughtAny;
    // satisfied only when all targets done
    const haveNow = insts.filter((i) => i.def === d && i.lvl >= lvl).length;
    return haveNow >= n;
  };

  const planItemCount = (tr: number) => Math.max(1, plan[tr].length);
  const creditMission = (tr: number) => {
    const ph = phaseRewards[tr];
    if (!ph) return;
    const f = 1 / (planItemCount(tr) * 1.6);
    for (const [k, v] of Object.entries(ph.res)) stock[k] = (stock[k] ?? 0) + (v as number) * f;
    rp += ph.rp * f;
  };

  const rates = (dt: number, mach: number) => {
    // staffing
    const jobs = insts.filter((i) => i.def.workers);
    const reqSlots = jobs.reduce((s, i) => s + (i.def.workers!.required ? i.def.workers!.slots : 0), 0);
    const optSlots = jobs.reduce((s, i) => s + (!i.def.workers!.required ? i.def.workers!.slots : 0), 0);
    const staffReq = reqSlots > 0 ? Math.min(1, colonistsNow / reqSlots) : 1;
    const leftover = Math.max(0, colonistsNow - reqSlots);
    const optStaff = optSlots > 0 ? Math.min(1, leftover / optSlots) : 0;
    const happy = HAPPY[tier];
    const prodMod = mod('production');
    const cap = capacity();
    const add = (r: string, v: number) => { stock[r] = Math.min(cap[r] ?? 0, (stock[r] ?? 0) + v); };
    // raw producers first
    const conv: Inst[] = [];
    for (const i of insts) {
      const d = i.def;
      if (!d.produces && !d.research_rate) continue;
      if (d.consumes) { conv.push(i); continue; }
      const eff = (d.workers ? (d.workers.required ? staffReq : 1 + 0.25 * d.workers.slots * optStaff) : 1) * lvlMult(d, i.lvl);
      for (const [r, v] of Object.entries(d.produces ?? {})) add(r, (v as number) * eff * happy * prodMod * mod(`production:${r}`) * mach * dt);
      if (d.research_rate) rp += d.research_rate * eff * mod('research') * mach * dt;
    }
    rp += (byId.get('command_center')!.research_rate ?? 0) * mod('research') * mach * dt;
    // converters (limited by stock)
    for (const i of conv) {
      const d = i.def;
      const eff = (d.workers ? (d.workers.required ? staffReq : 1 + 0.25 * d.workers.slots * optStaff) : 1) * lvlMult(d, i.lvl);
      let scale = 1;
      for (const [r, v] of Object.entries(d.consumes!)) {
        const need = (v as number) * lvlMult(d, i.lvl) * mach * dt;
        if (need > 0) scale = Math.min(scale, (stock[r] ?? 0) / need);
      }
      // idle when the outputs are already full (no point burning inputs)
      for (const [r, v] of Object.entries(d.produces ?? {})) {
        const out = (v as number) * eff * happy * prodMod * mod(`production:${r}`) * mach * dt;
        if (out > 0) scale = Math.min(scale, ((cap[r] ?? 0) - (stock[r] ?? 0)) / out);
      }
      scale = Math.max(0, Math.min(1, scale));
      if (scale <= 0) continue;
      for (const [r, v] of Object.entries(d.consumes!)) stock[r] = Math.max(0, stock[r] - (v as number) * lvlMult(d, i.lvl) * mach * dt * scale);
      for (const [r, v] of Object.entries(d.produces ?? {})) add(r, (v as number) * eff * happy * prodMod * mod(`production:${r}`) * mach * dt * scale);
    }
    // upkeep
    const need = colonistsNow * BALANCE.foodPerColonistPerMin * dt;
    stock.food = Math.max(0, stock.food - need);
    stock.water = Math.max(0, stock.water - colonistsNow * BALANCE.waterPerColonistPerMin * dt);
    // water/food are also consumed by converters above
  };

  const structureCost = (n: number, tr: number): ResourceBag => {
    const out: ResourceBag = {};
    bagAdd(out, TIERS[tr].pieceCost, n * 0.9);
    return out;
  };

  const maxTierPlans = plan.length - 1; // index of last tier (6)
  while (t < MAX_MIN && tier < maxTierPlans) {
    t += STEP;
    const online = ONLINE[tier];
    const mach = online + (1 - online) * BALANCE.offlineEfficiency;
    // colonists
    colonistsNow = Math.max(1, Math.min(housing(), Math.floor(2 + 4 * (t / 60) + 1)));
    // manual gathering (online only)
    const cap0 = capacity();
    for (const [r, v] of Object.entries(MANUAL[tier])) stock[r] = Math.min(cap0[r] ?? 0, (stock[r] ?? 0) + (v as number) * online * STEP);
    rates(STEP, mach);
    // invasion chests (the first one is part of the scripted opening)
    if (t >= nextInvasionAt) {
      const inv = INVASIONS.filter((x) => x.tier <= tier).sort((a, c) => c.tier - a.tier)[0];
      const f = mod('invasionReward');
      for (const [k, v] of Object.entries(inv.reward.resources ?? {})) stock[k] = Math.min(capacity()[k] ?? 0, (stock[k] ?? 0) + (v as number) * f);
      rp += (inv.reward.rp ?? 0) * f;
      nextInvasionAt = t + TIERS[tier].invasionInterval / 60;
    }
    // purchases (greedy over the plan, in order)
    const steps = plan[tier];
    let allDone = true;
    steps.forEach((s, idx) => {
      const key = `${tier}:${idx}`;
      if (stepsBought.has(key)) return;
      const note = () => { (stepLog[tier] ??= []).push(`${s.buy ? s.buy.id + 'x' + (s.buy.n ?? 1) + 'L' + (s.buy.lvl ?? 1) : 'walls' + s.structure}@${t.toFixed(0)}`); };
      if (s.structure) {
        const c = structureCost(s.structure, tier);
        if (Object.entries(c).every(([k, v]) => (stock[k] ?? 0) >= (v as number))) {
          for (const [k, v] of Object.entries(c)) stock[k] -= v as number;
          stepsBought.add(key);
          structureDone.add(idx);
          note();
          creditMission(tier);
        } else allDone = false;
        return;
      }
      if (tryBuy(s.buy!)) { stepsBought.add(key); note(); } else allDone = false;
    });
    // tier-up
    if (allDone && planDoneAt[tier] === undefined) {
      planDoneAt[tier] = t;
      if (tier < maxTierPlans) {
        const need0 = TIERS[tier + 1].upgradeCost;
        const gate0 = TIERS[tier + 1].research;
        const short = Object.entries(need0).filter(([k, v]) => (stock[k] ?? 0) < (v as number)).map(([k, v]) => `${k}:${Math.round(stock[k] ?? 0)}/${v}`);
        const inc = incomeSnapshot(insts, colonistsNow, tier);
        const incStr = Object.entries(inc).filter(([k]) => k === 'rp' || k in TIERS[tier + 1].upgradeCost).map(([k, v]) => `${k}${(v as number) >= 0 ? '+' : ''}${(v as number).toFixed(0)}/m`).join(' ');
        bottleAtDone[tier] = `col=${colonistsNow} inc[${incStr}] ` + short.join(' ') + (gate0 && !done.has(gate0) ? ` +research(${gate0})` : '') + ` rp=${Math.round(rp)}`;
      }
    }
    if (allDone && tier < maxTierPlans - 0) {
      const next = TIERS[tier + 1];
      const gate = next.research;
      const need = next.upgradeCost;
      const ready = Object.entries(need).every(([k, v]) => (stock[k] ?? 0) >= (v as number));
      const scriptedOk = tier > 0 || t >= SCRIPTED_FIRST_TIER_MIN;
      lastBottleneck = Object.entries(need).filter(([k, v]) => (stock[k] ?? 0) < (v as number)).map(([k]) => k).join('+');
      if (ready && scriptedOk) {
        // the gate research (closure) must be affordable too
        const gateOk = !gate || done.has(gate) || canResearch(gate, {});
        if (gateOk) {
          for (const [k, v] of Object.entries(need)) stock[k] -= v as number;
          tier++;
          results.push({ tier, at: t, buildDone: planDoneAt[tier - 1] ?? t, bottleneck: bottleAtDone[tier - 1] ?? '' });
          const tr = tierRewards[tier - 1];
          if (tr) { for (const [k, v] of Object.entries(tr.res)) stock[k] = (stock[k] ?? 0) + (v as number); rp += tr.rp; }
          nextInvasionAt = Math.max(nextInvasionAt, t + 1);
          if (verbose) console.log(`  tier ${tier} @ ${t.toFixed(0)} min; plan log: ${(stepLog[tier - 1] ?? []).join(' ')}`);
        }
      }
    }
  }
  const pending = plan[tier].map((s, idx) => ({ s, idx })).filter((x) => !stepsBought.has(`${tier}:${x.idx}`)).map((x) => (x.s.buy ? `${x.s.buy.id}x${x.s.buy.n ?? 1}L${x.s.buy.lvl ?? 1}` : `walls${x.s.structure}`));
  const diag = tier < maxTierPlans ? `tier ${tier} stock=${JSON.stringify(Object.fromEntries(Object.entries(stock).map(([k, v]) => [k, Math.round(v)])))} cap=${JSON.stringify(Object.fromEntries(Object.entries(capacity()).map(([k, v]) => [k, Math.round(v)])))} rp=${Math.round(rp)} pending=${pending.join(',')} bottleneck=${lastBottleneck}` : undefined;
  return { diag, results, insts, colonists: colonistsNow, stuckAt: tier < maxTierPlans ? t : undefined };
}

// ---------------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------------

function powerBalance(insts: Inst[]): { prod: number; cons: number } {
  let prod = 0;
  let cons = 0;
  for (const i of insts) {
    const p = (i.def.power ?? 0) * lvlMult(i.def, i.lvl);
    if (p > 0) prod += p; else cons -= p;
  }
  return { prod, cons };
}

function planSnapshot(upToTier: number): Inst[] {
  // all items from tiers 0..upToTier, at their final levels
  const map = new Map<string, Inst[]>();
  for (let tr = 0; tr <= upToTier; tr++) {
    for (const s of PLAN[tr]) {
      if (!s.buy) continue;
      const d = byId.get(s.buy.id)!;
      const arr = map.get(d.id) ?? [];
      const n = s.buy.n ?? 1;
      while (arr.length < n) arr.push({ def: d, lvl: 1 });
      for (let k = 0; k < n; k++) arr[k].lvl = Math.max(arr[k].lvl, s.buy.lvl ?? 1);
      map.set(d.id, arr);
    }
  }
  return [...map.values()].flat();
}

describe('data.pacing — tier timeline of an engaged player', () => {
  const out = simulate(PLAN, false);

  it('prints the pacing table and every tier lands within ±40% of target', () => {
    const rows: string[] = [];
    rows.push('tier            target(min)  model(min)  ratio   plan-built@  short-at-plan-done');
    for (const r of out.results) {
      const tgt = TARGET_MIN[r.tier];
      rows.push(`${TIERS[r.tier].name.padEnd(15)} ${String(tgt).padStart(8)} ${r.at.toFixed(0).padStart(11)}  ${(r.at / tgt).toFixed(2).padStart(6)}   ${r.buildDone.toFixed(0).padStart(8)}   ${r.bottleneck || '-'}`);
    }
    console.log('\n' + rows.join('\n') + '\n');
    for (let tr = 0; tr <= 5; tr++) {
      const snap = planSnapshot(tr);
      const col = Math.min(1 + snap.reduce((a, i) => a + (i.def.housing ?? 0) * lvlMult(i.def, i.lvl), 0), Math.floor(3 + 4 * ([0, 1, 3, 6, 12, 22][tr] ?? 0)));
      const inc = incomeSnapshot(snap, col, tr);
      const pw = powerBalance(snap);
      console.log(`economy@tier${tr} col=${col} power ${pw.prod.toFixed(0)}/${pw.cons.toFixed(0)} :: ` + Object.entries(inc).map(([k, v]) => `${k}${(v as number) >= 0 ? '+' : ''}${(v as number).toFixed(0)}`).join(' '));
    }
    if (out.diag) console.log(out.diag);
    expect(out.stuckAt, `simulation got stuck at ${out.stuckAt?.toFixed(0)} min (a cost exceeds storage or an input is never produced)`).toBeUndefined();
    expect(out.results.length).toBe(6);
    for (const r of out.results) {
      const tgt = TARGET_MIN[r.tier];
      expect(r.at, `${TIERS[r.tier].name}: ${r.at.toFixed(0)} min vs target ${tgt}`).toBeGreaterThanOrEqual(tgt * (1 - TOLERANCE));
      expect(r.at, `${TIERS[r.tier].name}: ${r.at.toFixed(0)} min vs target ${tgt}`).toBeLessThanOrEqual(tgt * (1 + TOLERANCE));
    }
  });

  it('tiers are strictly increasing in time', () => {
    for (let i = 1; i < out.results.length; i++) expect(out.results[i].at).toBeGreaterThan(out.results[i - 1].at);
  });

  it('every tier-up cost fits in storage once the planned storage is built', () => {
    for (let tr = 0; tr < 6; tr++) {
      const cost = TIERS[tr + 1].upgradeCost;
      const insts = planSnapshot(tr);
      const base: Record<string, number> = {};
      const cc = byId.get('command_center')!;
      const baseRes: Record<string, number> = { wood: 200, stone: 200, fiber: 150, food: 150, water: 150, iron: 100, copper: 100, coal: 100, steel: 80, electronics: 60, biomass: 60, crystal: 50, alloy: 40, energy_cell: 40, nano: 30, titanium: 30 };
      for (const r of RES_IDS) base[r] = (baseRes[r] ?? 0) + (cc.storage?.[r] ?? 0);
      for (const i of insts) for (const [r, v] of Object.entries(i.def.storage ?? {})) base[r] += (v as number) * lvlMult(i.def, i.lvl);
      for (const [r, v] of Object.entries(cost)) expect(base[r], `storage for ${r} before ${TIERS[tr + 1].name}`).toBeGreaterThanOrEqual(v as number);
    }
  });

  it('the planned base keeps power balanced, fed and housed at every tier', () => {
    for (let tr = 3; tr <= 5; tr++) {
      const p = powerBalance(planSnapshot(tr));
      expect(p.prod, `power at tier ${tr}`).toBeGreaterThanOrEqual(p.cons);
    }
    for (let tr = 0; tr <= 5; tr++) {
      const insts = planSnapshot(tr);
      let food = 0;
      let water = 0;
      let beds = 1;
      let req = 0;
      for (const i of insts) {
        food += (i.def.produces?.food ?? 0) * lvlMult(i.def, i.lvl) - (i.def.consumes?.food ?? 0) * lvlMult(i.def, i.lvl);
        water += (i.def.produces?.water ?? 0) * lvlMult(i.def, i.lvl) - (i.def.consumes?.water ?? 0) * lvlMult(i.def, i.lvl);
        beds += (i.def.housing ?? 0) * lvlMult(i.def, i.lvl);
        if (i.def.workers?.required) req += i.def.workers.slots;
      }
      const colonists = Math.min(beds, 4 + tr * 8);
      expect(food, `food balance tier ${tr}`).toBeGreaterThanOrEqual(colonists * BALANCE.foodPerColonistPerMin * 0.5);
      expect(water, `water balance tier ${tr}`).toBeGreaterThanOrEqual(colonists * BALANCE.waterPerColonistPerMin * 0.5);
      expect(beds, `beds tier ${tr}`).toBeGreaterThanOrEqual(Math.min(colonists, 3));
      void req;
    }
  });
});
