import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/data/buildings';
import { RESEARCH } from '../src/data/research';
import { TIERS } from '../src/data/tiers';
import { BALANCE } from '../src/data/balance';
import { INVASIONS } from '../src/data/aliens';
import { MISSIONS, FIRST_MISSION } from '../src/data/missions';
import { copyMult } from '../src/data/pacing';
import { creditedSeconds } from '../src/sim/econ/offline';
import { MASTERY_GROWTH, MASTERY_LINES, MASTERY_SOFT_CAP, MASTERY_SOFT_FACTOR } from '../src/data/mastery';
import { EXPEDITION_RULES } from '../src/data/expeditions';
import type { BuildingDef, ResourceBag } from '../src/data/schema';

/**
 * ANALYTICAL PACING MODEL
 * -----------------------
 * Simulates an *engaged* player in the four-week economy (data/pacing.ts): five 20-minute sessions a day (the first
 * one 25 minutes), the app closed in between, with a plausible build-out per tier, and asks: when can they afford the
 * next tier's upgradeCost + the research gate chain? Targets (calendar days since install):
 *   Reinforced in the first session · Stone end of day 1 · Steel day 3 · Alloy day 6.5 · Nano day 13.5 · Titanium day 28.
 * We assert each lands within +-40% of its target and print a table. (The pacing bot, scripts/pacing-bot.mjs, is the
 * real check: it plays the real game; this model is a fast guard against a content change that breaks the schedule.)
 *
 * Model assumptions (all documented here so they can be argued with):
 *  - Time step 0.5 wall-clock minutes through the first session, then 2. After the first session, each minute is the
 *    day's average: the online share (100 of 1440 minutes) at full speed plus Welcome Back's credit for the gaps
 *    (BALANCE offline curve and cap). Manual gathering only happens online.
 *  - Staffing follows the game's job rules (sim/colony/jobs.ts): required slots of the machines making what the next
 *    tier lacks first, machines with full stores last. Output is scaled by staffing, happiness, research and Mastery,
 *    and by CREW (what the model leaves out, fitted once to the pacing bot).
 *  - Expedition hauls, loot, crates and chests add EXTRA x the value the machines made, as the goods the next few
 *    purchases and the tier-up are short of (an equal share each).
 *  - Colonists follow the target curve (recruit board, rescues, rewards), capped by beds.
 *  - Purchases follow a fixed per-tier PLAN (the pacing bot's colony at each tier-up; greedy in plan order); every copy
 *    past the first few costs more (data/pacing.ts copies). Research: whatever the tier offers once the RP is there
 *    (the gate first, cheapest first), then Production and Logistics Mastery with the RP left over.
 *  - Main-mission rewards are credited proportionally as the plan progresses; invasion chests every invasionInterval
 *    of online play.
 *  - Storage caps are enforced: the colony must actually be able to HOLD the next tier's upgrade cost.
 *  - The first 14 minutes are scripted (the first attack lands at ~13 min), so tier 1 cannot come earlier than that.
 */

const TARGET_DAY = [0, 15 / 1440, 1, 3, 6.5, 13.5, 28];
const TOLERANCE = 0.4;
/** Model time step (minutes): fine through the first session, then coarser (each step is an average minute of a day). */
const STEP = 0.5;
const STEP_LATER = 2;
const DAY = 1440;
const MAX_MIN = 60 * DAY;
/** Online minutes a day (five 20-minute sessions) and the gaps between them (hours, the night last). */
const ONLINE_PER_DAY = 100;
const GAPS_H = [3.2, 3.2, 3.2, 3.2, 9.7];
const FIRST_SESSION_MIN = 25;
/** Welcome Back's production minutes per day of five sessions (the real offline curve). */
const OFFLINE_PER_DAY = GAPS_H.reduce((a, h) => a + creditedSeconds(h * 3600, BALANCE.offlineHours * 3600, BALANCE.offlineEfficiency, (BALANCE.offlineFullMinutes ?? 0) * 60) / 60, 0);
/**
 * Expedition hauls, loot, crates and invasion chests per unit of machine output, valued with the expedition table's
 * worth of each good (the bot measures 0.4-0.9 from Stone on), delivered as what the next tier-up still lacks.
 */
const EXTRA = 0.6;
const VALUE = EXPEDITION_RULES.value;
/**
 * What the model leaves out of a machine's output, by tier: colonist skill and friendship hearts, Crew Mastery, Colony
 * Spirit, levels above the plan's median, timed boosts. One factor from Reinforced on, fitted once to the pacing bot's
 * 20x5 run (scripts/pacing-bot.mjs); the guided first session is as authored. The +-40% tolerance guards content changes.
 */
const CREW = [1, 1.6, 1.6, 1.6, 1.6, 1.6, 1.6];
/** Target colonists by calendar day (data/balance.ts recruitArrivalMinutes + rescues and rewards). */
const COLONISTS: [number, number][] = [[0, 1], [0.02, 6], [1, 10], [3, 22], [6.5, 32], [13.5, 40], [28, 50], [60, 60]];

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

/**
 * What a reasonably engaged player has built when each tier-up comes (tier index = the tier they are in): copies and
 * typical levels from the pacing bot's colony at each tier-up (tests/pacing/run.ts `buildout`), decor left out.
 */
const PLAN: PlanStep[][] = [
  // ---- tier 0 (the guided first 15 minutes)
  [b('shelter'), b('campfire'), b('storage_crate'), b('logging_camp'), b('scrap_turret'), b('berry_patch'), b('rain_collector'), b('workbench'), walls(30)],
  // ---- tier 1
  [b('shelter', 4), b('campfire', 2), b('storage_crate', 7, 2), b('logging_camp', 3, 5), b('scrap_turret', 3, 5), b('workbench'), b('research_desk', 8, 3), b('berry_patch', 2, 5), b('rain_collector', 2, 5), b('radio_tower'), b('veggie_farm', 2, 4), b('cabin'), b('water_tank'), b('garage'), b('guard_tower', 1, 3), b('storage_shed', 2, 4), b('quarry', 4, 5), b('larder', 2), b('sawmill', 2, 3), walls(70)],
  // ---- tier 2
  [b('shelter', 9), b('campfire', 2), b('storage_crate', 10, 2), b('logging_camp', 3, 5), b('scrap_turret', 3, 5), b('workbench'), b('research_desk', 10, 3), b('berry_patch', 2, 5), b('rain_collector', 2, 5), b('radio_tower'), b('veggie_farm', 2, 5), b('cabin'), b('water_tank', 8), b('garage'), b('guard_tower', 2, 5), b('storage_shed', 8, 3), b('quarry', 5, 5), b('larder', 2), b('sawmill', 2, 5), b('forge'), b('iron_mine', 3, 5), b('water_pump', 1, 5), b('ore_silo', 2, 3), b('smelter', 1, 4), b('greenhouse', 1, 5), b('kitchen', 1, 5), b('research_lab', 12, 3), b('crossfire_tower', 1, 5), b('warehouse', 8), walls(130)],
  // ---- tier 3
  [b('shelter', 10), b('campfire', 4), b('storage_crate', 10, 2), b('logging_camp', 3, 5), b('scrap_turret', 3, 5), b('workbench'), b('research_desk', 10, 3), b('berry_patch', 2, 5), b('rain_collector', 2, 5), b('radio_tower'), b('veggie_farm', 2, 5), b('cabin', 2), b('water_tank', 8, 2), b('garage'), b('guard_tower', 3, 5), b('storage_shed', 8, 3), b('quarry', 5, 5), b('larder', 2), b('sawmill', 2, 5), b('forge'), b('iron_mine', 3, 5), b('water_pump', 1, 5), b('ore_silo', 3, 2), b('smelter', 6, 5), b('greenhouse', 1, 5), b('kitchen', 1, 5), b('research_lab', 26, 3), b('crossfire_tower', 1, 5), b('warehouse', 8), b('workshop'), b('wind_turbine', 8, 3), b('solar_panel', 8, 3), b('battery_bank', 2, 3), b('electronics_lab', 8, 2), b('electric_drill', 2, 4), b('factory', 2, 3), b('mg_turret', 8, 4), b('alloy_foundry', 4, 2), b('steel_dorm', 3), b('purifier', 1, 3), b('steel_vault', 2, 2), b('crystal_extractor', 10, 2), b('hydroponics', 2, 3), b('observatory', 10, 3), b('coal_mine', 1, 5), walls(200)],
  // ---- tier 4
  [b('shelter', 10), b('campfire', 4), b('storage_crate', 10, 2), b('logging_camp', 3, 5), b('scrap_turret', 3, 5), b('workbench'), b('research_desk', 10, 3), b('berry_patch', 2, 5), b('rain_collector', 2, 5), b('radio_tower'), b('veggie_farm', 2, 5), b('cabin', 2), b('water_tank', 8, 2), b('garage'), b('guard_tower', 3, 5), b('storage_shed', 8, 3), b('quarry', 5, 5), b('larder', 2), b('sawmill', 2, 5), b('forge'), b('iron_mine', 3, 5), b('water_pump', 1, 5), b('ore_silo', 10, 2), b('smelter', 6, 5), b('greenhouse', 1, 5), b('kitchen', 1, 5), b('research_lab', 26, 3), b('crossfire_tower', 1, 5), b('warehouse', 8), b('workshop'), b('wind_turbine', 8, 3), b('solar_panel', 8, 3), b('battery_bank', 2, 3), b('electronics_lab', 8, 5), b('electric_drill', 2, 5), b('factory', 2, 3), b('mg_turret', 8, 5), b('alloy_foundry', 8, 5), b('steel_dorm', 3), b('purifier', 1, 5), b('steel_vault', 6), b('crystal_extractor', 10, 5), b('hydroponics', 2, 5), b('observatory', 33, 3), b('coal_mine', 1, 5), b('aa_gun', 2, 5), b('missile_turret', 3, 5), b('geothermal_plant', 3, 3), b('shield_generator', 1, 3), b('mining_rig', 3, 5), b('nanoforge', 3, 5), b('hangar'), b('fabricator'), b('large_factory', 1, 3), b('alloy_habitat', 2, 3), b('crystal_vault', 2, 3), b('cell_plant', 5, 5), b('auto_farm', 1, 5), b('advanced_lab', 10, 3), walls(320)],
  // ---- tier 5
  [b('shelter', 10), b('campfire', 4), b('storage_crate', 10, 2), b('logging_camp', 3, 5), b('scrap_turret', 3, 5), b('workbench'), b('research_desk', 10, 3), b('berry_patch', 2, 5), b('rain_collector', 2, 5), b('radio_tower'), b('veggie_farm', 2, 5), b('cabin', 2), b('water_tank', 8, 2), b('garage'), b('guard_tower', 5, 5), b('storage_shed', 8, 3), b('quarry', 5, 5), b('larder', 2), b('sawmill', 2, 5), b('forge'), b('iron_mine', 3, 5), b('water_pump', 1, 5), b('ore_silo', 10, 2), b('smelter', 6, 5), b('greenhouse', 1, 5), b('kitchen', 1, 5), b('research_lab', 26, 3), b('crossfire_tower', 2, 5), b('warehouse', 8), b('workshop'), b('wind_turbine', 8, 3), b('solar_panel', 8, 3), b('battery_bank', 2, 3), b('electronics_lab', 8, 5), b('electric_drill', 2, 5), b('factory', 2, 3), b('mg_turret', 8, 5), b('alloy_foundry', 10, 5), b('steel_dorm', 3), b('purifier', 1, 5), b('steel_vault', 8, 2), b('crystal_extractor', 10, 5), b('hydroponics', 2, 5), b('observatory', 33, 3), b('coal_mine', 1, 5), b('aa_gun', 2, 5), b('missile_turret', 3, 5), b('geothermal_plant', 3, 3), b('shield_generator', 1, 3), b('mining_rig', 3, 5), b('nanoforge', 7, 5), b('hangar'), b('fabricator'), b('large_factory', 1, 3), b('alloy_habitat', 2, 3), b('crystal_vault', 4, 2), b('cell_plant', 5, 5), b('auto_farm', 1, 5), b('advanced_lab', 22, 3), b('fusion_reactor', 1, 3), b('nano_residence', 3, 3), b('drone_hub', 1, 5), b('atmo_generator', 1, 5), b('laser_turret', 4, 5), b('teleporter'), b('titanium_drill', 1, 5), b('nano_vault', 2, 4), b('titanium_refinery', 5, 5), b('matter_processor', 1, 5), b('nano_factory', 1, 3), b('sculpture_garden', 2), b('sentry_gun', 4, 5), b('neon_park'), walls(520)],
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

/** A new copy (`owned` already standing) taken to `lvl`: the copy price, then the level-ups. */
function copyCost(d: BuildingDef, owned: number, lvl: number): ResourceBag {
  const decor = d.category === 'decor' || d.piece || d.cosmetic;
  const out = bagAdd({}, d.cost, decor ? 1 : copyMult(owned));
  return bagAdd(out, levelCost(d, 1, lvl));
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
  /** The storage modifier (research + Logistics Mastery) when the tier-up was paid. */
  storageMod: number;
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

/** Target colonists on a calendar day (linear between the points of COLONISTS). */
function colonistsAt(day: number): number {
  for (let i = 1; i < COLONISTS.length; i++) {
    const [d1, c1] = COLONISTS[i];
    const [d0, c0] = COLONISTS[i - 1];
    if (day <= d1) return c0 + ((c1 - c0) * (day - d0)) / (d1 - d0);
  }
  return COLONISTS[COLONISTS.length - 1][1];
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
  let researchAt = -Infinity;
  let lastBottleneck = '';
  const planDoneAt: Record<number, number> = {};
  const stepLog: Record<number, string[]> = {};
  const bottleAtDone: Record<number, string> = {};

  // Research Mastery (data/mastery.ts): the RP left over buys levels of Production and Logistics (storage)
  const masteryLevel: Record<string, number> = {};
  const masteryBonus = (stat: string) => {
    let b = 0;
    for (const l of MASTERY_LINES) {
      if (l.stat !== stat) continue;
      const n = masteryLevel[l.id] ?? 0;
      b += l.per * (Math.min(n, MASTERY_SOFT_CAP) + Math.max(0, n - MASTERY_SOFT_CAP) * MASTERY_SOFT_FACTOR);
    }
    return b;
  };
  const mod = (stat: string) => 1 + researchMods.filter((m) => m.stat === stat).reduce((s, m) => s + m.add, 0) + masteryBonus(stat);
  /** RP still needed for the next tier's gate research and what it requires. */
  const gateRp = (): number => {
    const gate = TIERS[tier + 1]?.research;
    if (!gate) return 0;
    let n = 0;
    const seen = new Set<string>();
    const visit = (id: string) => {
      if (done.has(id) || seen.has(id)) return;
      seen.add(id);
      const r = researchById.get(id)!;
      n += r.cost;
      for (const q of r.requires) visit(q);
    };
    visit(gate);
    return n;
  };

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
    // buy as many copies as are affordable one at a time (a player does not wait to afford them all at once); every
    // copy past the first few costs more (data/pacing.ts copies), level-ups do not
    let boughtAny = false;
    for (const tgt of targets) {
      const c1 = tgt.from > 0 ? levelCost(d, tgt.from, lvl) : copyCost(d, insts.filter((i) => i.def === d).length, lvl);
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

  // Staffing follows the game's job rules (sim/colony/jobs.ts): required slots first, those making what the next tier
  // lacks (or feeding a machine that does) before the rest, machines whose every output store is full last; whoever
  // is left fills optional slots. Recomputed every STAFF_EVERY model minutes.
  const STAFF_EVERY = 30;
  let staffAt = -Infinity;
  const staffOf = new Map<Inst, number>();
  let optStaff = 0;
  const restaff = () => {
    const nextCost = TIERS[tier + 1]?.upgradeCost ?? {};
    const need = new Set(Object.keys(nextCost).filter((r) => (stock[r] ?? 0) < (nextCost[r] as number)));
    for (const i of insts) if (i.def.consumes && Object.keys(i.def.produces ?? {}).some((r) => need.has(r))) for (const r of Object.keys(i.def.consumes)) need.add(r);
    const cap = capacity();
    const band = (i: Inst) => {
      const out = Object.keys(i.def.produces ?? {});
      if (out.length && out.every((r) => (stock[r] ?? 0) >= (cap[r] ?? 0) - 1e-6)) return 2;
      return out.some((r) => need.has(r)) ? 0 : 1;
    };
    const req = insts.filter((i) => i.def.workers?.required).sort((a, c) => band(a) - band(c));
    let left = colonistsNow;
    staffOf.clear();
    for (const i of req) {
      const n = Math.min(i.def.workers!.slots, left);
      left -= n;
      staffOf.set(i, n / i.def.workers!.slots);
    }
    const optSlots = insts.reduce((a, i) => a + (i.def.workers && !i.def.workers.required ? i.def.workers.slots : 0), 0);
    optStaff = optSlots > 0 ? Math.min(1, left / optSlots) : 0;
    staffAt = t;
    // what the next few purchases and the tier-up ask for (where hauls go)
    for (const k of Object.keys(wants)) delete wants[k];
    bagAdd(wants, nextCost);
    let n = 0;
    for (const [idx, st] of plan[tier].entries()) {
      if (n >= 3 || stepsBought.has(`${tier}:${idx}`) || !st.buy) continue;
      // the next copy or level-up of this step, priced as tryBuy pays it
      const d = byId.get(st.buy.id)!;
      const lvl = st.buy.lvl ?? 1;
      const have = insts.filter((i) => i.def === d).sort((a, c) => c.lvl - a.lvl);
      const under = have.slice(0, st.buy.n ?? 1).find((i) => i.lvl < lvl);
      bagAdd(wants, under ? levelCost(d, under.lvl, lvl) : copyCost(d, have.length, lvl));
      n++;
    }
  };
  const wants: Record<string, number> = {};

  const rates = (dt: number, mach: number) => {
    if (t - staffAt >= STAFF_EVERY) restaff();
    const work = (i: Inst) => (i.def.workers ? (i.def.workers.required ? (staffOf.get(i) ?? 0) : 1 + 0.25 * i.def.workers.slots * optStaff) : 1);
    const crew = CREW[tier];
    const happy = HAPPY[tier] * crew;
    const prodMod = mod('production');
    const cap = capacity();
    /** Adds what fits; returns what was added. */
    const add = (r: string, v: number): number => {
      const before = stock[r] ?? 0;
      stock[r] = Math.min(cap[r] ?? 0, before + v);
      return Math.max(0, stock[r] - before);
    };
    let made = 0;
    // raw producers first
    const conv: Inst[] = [];
    for (const i of insts) {
      const d = i.def;
      if (!d.produces && !d.research_rate) continue;
      if (d.consumes) { conv.push(i); continue; }
      const eff = work(i) * lvlMult(d, i.lvl);
      for (const [r, v] of Object.entries(d.produces ?? {})) made += add(r, (v as number) * eff * happy * prodMod * mod(`production:${r}`) * mach * dt) * (VALUE[r] ?? 1);
      if (d.research_rate) rp += d.research_rate * eff * mod('research') * mach * (1 + EXTRA) * dt;
    }
    rp += (byId.get('command_center')!.research_rate ?? 0) * mod('research') * mach * dt;
    // converters (limited by stock)
    for (const i of conv) {
      const d = i.def;
      const eff = work(i) * lvlMult(d, i.lvl);
      // a converter burns its inputs as fast as its crew works it
      const burn = eff * crew;
      let scale = 1;
      for (const [r, v] of Object.entries(d.consumes!)) {
        const need = (v as number) * burn * mach * dt;
        if (need > 0) scale = Math.min(scale, (stock[r] ?? 0) / need);
      }
      // idle when the outputs are already full (no point burning inputs)
      for (const [r, v] of Object.entries(d.produces ?? {})) {
        const out = (v as number) * eff * happy * prodMod * mod(`production:${r}`) * mach * dt;
        if (out > 0) scale = Math.min(scale, ((cap[r] ?? 0) - (stock[r] ?? 0)) / out);
      }
      scale = Math.max(0, Math.min(1, scale));
      if (scale <= 0) continue;
      for (const [r, v] of Object.entries(d.consumes!)) stock[r] = Math.max(0, stock[r] - (v as number) * burn * mach * dt * scale);
      for (const [r, v] of Object.entries(d.produces ?? {})) made += add(r, (v as number) * eff * happy * prodMod * mod(`production:${r}`) * mach * dt * scale) * (VALUE[r] ?? 1);
    }
    // expedition hauls and loot: EXTRA x the value the machines made, in the goods the colony is short of for its next
    // purchases and the tier-up (data/expeditions.ts: hauls lean on what a colony at that tier lacks)
    if (made > 0) {
      // an equal share of the value for every good still short (a squad goes where the next thing is missing)
      const short = Object.entries(wants).filter(([r, v]) => v > (stock[r] ?? 0));
      for (const [r] of short) add(r, (EXTRA * made) / short.length / (VALUE[r] ?? 1));
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
    const step = t < FIRST_SESSION_MIN ? STEP : STEP_LATER;
    t += step;
    // the first session is played straight through; after it, each minute is an average minute of a day of sessions
    const first = t <= FIRST_SESSION_MIN;
    const online = first ? 1 : ONLINE_PER_DAY / DAY;
    const mach = first ? 1 : (ONLINE_PER_DAY + OFFLINE_PER_DAY) / DAY;
    // colonists follow the target curve, capped by beds
    colonistsNow = Math.max(1, Math.min(housing(), Math.floor(colonistsAt(t / DAY))));
    // manual gathering (online only)
    const cap0 = capacity();
    for (const [r, v] of Object.entries(MANUAL[tier])) stock[r] = Math.min(cap0[r] ?? 0, (stock[r] ?? 0) + (v as number) * online * step);
    rates(step, mach);
    // invasion chests (the first one is part of the scripted opening); raids come every invasionInterval of online play
    if (t >= nextInvasionAt) {
      const inv = INVASIONS.filter((x) => x.tier <= tier).sort((a, c) => c.tier - a.tier)[0];
      const f = mod('invasionReward');
      for (const [k, v] of Object.entries(inv.reward.resources ?? {})) stock[k] = Math.min(capacity()[k] ?? 0, (stock[k] ?? 0) + (v as number) * f);
      rp += (inv.reward.rp ?? 0) * f;
      nextInvasionAt = t + TIERS[tier].invasionInterval / 60 / online;
    }
    // research: an engaged player studies whatever their tier offers once the RP is there (the gate first), cheapest
    // first, keeping the resources the next tier-up needs (tests/pacing bot: research binds ~30% of the time)
    if (t - researchAt >= 10) {
      researchAt = t;
      const gate = TIERS[tier + 1]?.research;
      if (gate && !done.has(gate) && researchById.get(gate)!.tier <= tier) canResearch(gate, {});
      const open = RESEARCH.filter((r) => !done.has(r.id) && r.tier <= tier && r.requires.every((q) => done.has(q))).sort((a, c) => a.cost - c.cost);
      for (const r of open) {
        if (r.cost > rp) break;
        canResearch(r.id, {});
      }
      // then Mastery with what is left over (the gate's RP stays put)
      const reserve = gateRp();
      for (;;) {
        const lines = MASTERY_LINES.filter((l) => (l.stat === 'production' || l.stat === 'storage') && l.tier <= tier);
        if (!lines.length) break;
        const price = (l: (typeof lines)[number]) => l.base * Math.pow(MASTERY_GROWTH, masteryLevel[l.id] ?? 0);
        const l = lines.sort((a, c) => price(a) - price(c))[0];
        if (rp - price(l) < reserve) break;
        rp -= price(l);
        masteryLevel[l.id] = (masteryLevel[l.id] ?? 0) + 1;
      }
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
          results.push({ tier, at: t, buildDone: planDoneAt[tier - 1] ?? t, bottleneck: bottleAtDone[tier - 1] ?? '', storageMod: mod('storage') });
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

/** Power made and drawn by a planned base, with the power research of its tier done (an engaged player has it). */
function powerBalance(insts: Inst[], tier = 0): { prod: number; cons: number } {
  let prod = 0;
  let cons = 0;
  const powerMod = 1 + RESEARCH.filter((r) => r.tier <= tier).reduce((a, r) => a + (r.effects ?? []).filter((e) => e.stat === 'power').reduce((x, e) => x + (e.add ?? 0), 0), 0);
  for (const i of insts) {
    // generators make more per level; a consumer draws the same at any level (sim/economy.ts)
    const p = i.def.power ?? 0;
    if (p > 0) prod += p * lvlMult(i.def, i.lvl) * powerMod;
    else cons -= p;
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
    rows.push('tier            target(day)  model(day)  ratio   plan-built@(day)  short-at-plan-done');
    for (const r of out.results) {
      const tgt = TARGET_DAY[r.tier];
      rows.push(`${TIERS[r.tier].name.padEnd(15)} ${String(tgt).padStart(8)} ${(r.at / DAY).toFixed(2).padStart(11)}  ${(r.at / DAY / tgt).toFixed(2).padStart(6)}   ${(r.buildDone / DAY).toFixed(2).padStart(8)}   ${r.bottleneck || '-'}`);
    }
    console.log('\n' + rows.join('\n') + '\n');
    for (let tr = 0; tr <= 5; tr++) {
      const snap = planSnapshot(tr);
      const col = Math.min(1 + snap.reduce((a, i) => a + (i.def.housing ?? 0) * lvlMult(i.def, i.lvl), 0), Math.floor(3 + 4 * ([0, 1, 3, 6, 12, 22][tr] ?? 0)));
      const inc = incomeSnapshot(snap, col, tr);
      const pw = powerBalance(snap, tr);
      console.log(`economy@tier${tr} col=${col} power ${pw.prod.toFixed(0)}/${pw.cons.toFixed(0)} :: ` + Object.entries(inc).map(([k, v]) => `${k}${(v as number) >= 0 ? '+' : ''}${(v as number).toFixed(0)}`).join(' '));
    }
    if (out.diag) console.log(out.diag);
    expect(out.stuckAt, `simulation got stuck at ${out.stuckAt?.toFixed(0)} min (a cost exceeds storage or an input is never produced)`).toBeUndefined();
    expect(out.results.length).toBe(6);
    for (const r of out.results) {
      const tgt = TARGET_DAY[r.tier] * DAY;
      expect(r.at, `${TIERS[r.tier].name}: day ${(r.at / DAY).toFixed(2)} vs target ${TARGET_DAY[r.tier]}`).toBeGreaterThanOrEqual(tgt * (1 - TOLERANCE));
      expect(r.at, `${TIERS[r.tier].name}: day ${(r.at / DAY).toFixed(2)} vs target ${TARGET_DAY[r.tier]}`).toBeLessThanOrEqual(tgt * (1 + TOLERANCE));
    }
  });

  it('the build plan only uses real buildings, respects maxCount and never buys ahead of the tier', () => {
    for (let tr = 0; tr < PLAN.length; tr++) {
      for (const s of PLAN[tr]) {
        if (!s.buy) continue;
        const d = byId.get(s.buy.id);
        expect(d, `plan references unknown building ${s.buy.id}`).toBeTruthy();
        expect(d!.unlockTier, `${d!.id} is tier ${d!.unlockTier} but planned at tier ${tr}`).toBeLessThanOrEqual(tr);
        if (d!.maxCount) expect(s.buy.n ?? 1, `${d!.id} maxCount`).toBeLessThanOrEqual(d!.maxCount);
        expect(s.buy.lvl ?? 1, `${d!.id} level`).toBeLessThanOrEqual(d!.maxLevel);
      }
    }
  });

  it('tiers are strictly increasing in time', () => {
    for (let i = 1; i < out.results.length; i++) expect(out.results[i].at).toBeGreaterThan(out.results[i - 1].at);
  });

  it('every tier-up cost fits in storage once the planned storage is built (with the Logistics the model bought)', () => {
    for (let tr = 0; tr < 6; tr++) {
      const cost = TIERS[tr + 1].upgradeCost;
      const insts = planSnapshot(tr);
      const base: Record<string, number> = {};
      const cc = byId.get('command_center')!;
      const baseRes: Record<string, number> = { wood: 200, stone: 200, fiber: 150, food: 150, water: 150, iron: 100, copper: 100, coal: 100, steel: 80, electronics: 60, biomass: 60, crystal: 50, alloy: 40, energy_cell: 40, nano: 30, titanium: 30 };
      const storageMod = out.results.find((r) => r.tier === tr + 1)?.storageMod ?? 1;
      for (const r of RES_IDS) base[r] = (baseRes[r] ?? 0) + (cc.storage?.[r] ?? 0);
      for (const i of insts) for (const [r, v] of Object.entries(i.def.storage ?? {})) base[r] += (v as number) * lvlMult(i.def, i.lvl) * storageMod;
      for (const [r, v] of Object.entries(cost)) expect(base[r], `storage for ${r} before ${TIERS[tr + 1].name}`).toBeGreaterThanOrEqual(v as number);
    }
  });

  it('the planned base keeps power balanced, fed and housed at every tier', () => {
    for (let tr = 3; tr <= 5; tr++) {
      const p = powerBalance(planSnapshot(tr), tr);
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
