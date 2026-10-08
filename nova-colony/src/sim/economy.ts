/**
 * EconomySystem — resources, storage capacity, production/consumption, power, food & water upkeep,
 * modifiers, and offline-progress calculation.
 *
 * OWNER: economy agent. Writes state.resources and game.derived.{capacity, *PerMin, power, research}.
 *
 * Performance model (mobile):
 *  - `recompute()` walks the building list once per second, or on the next frame after a relevant
 *    event (building/colonist/research/tier/boost changes). It caches per-building flow records.
 *  - The resource "tick" runs once per second: simple producers are pre-aggregated per resource,
 *    converters are processed individually. Gains are accumulated fractionally and credited in
 *    whole units, so at most one `resource:gained` event fires per resource per second.
 */
import { System } from './System';
import { ANCHOR_IDS, type BuildingDef, type ModifierStat, type ResourceBag } from '../data/schema';
import type { GainSource } from '../core/events';
import type { BuildingInstance, Colonist, Id } from '../core/state';
import { bagCovers, bagEntries, bagMissing } from '../core/bag';
import { ModifierTable } from './econ/modifiers';
import { simulateOffline, type OfflineFlow, type OfflineModel } from './econ/offline';
import { centerX, centerZ, defEffects, factorySpeed, levelMult, recipeFlows, type Entries } from './econ/effects';

declare module '../data/schema' {
  interface BalanceDef {
    /**
     * Optional generosity knob for Welcome Back: offline gains may fill storage up to
     * capacity × this (default 1 = clamp to free capacity).
     */
    offlineStorageMult?: number;
  }
}

export interface OfflineSummary {
  /** Seconds credited (after cap). */
  seconds: number;
  /** Seconds actually away. */
  away: number;
  gains: ResourceBag;
  rp: number;
  /** Stockpiled inputs consumed by converters/factories while away (deducted once, never doubled). */
  spent?: ResourceBag;
}

/** Why a building is not running at full speed (building panel / render hints). */
export type IdleReason = 'building' | 'off' | 'damaged' | 'no_power' | 'low_power' | 'no_workers' | 'no_inputs' | null;

/** Per-building economy snapshot for the UI building panel. */
export interface BuildingEconomy {
  /** Operating efficiency: power × staffing (0 when not active). */
  eff: number;
  /** Level effect multiplier. */
  levelMult: number;
  /** Current per-minute outputs / inputs (after efficiency, modifiers and input availability). */
  produces: ResourceBag;
  consumes: ResourceBag;
  /** Research points per minute. */
  research: number;
  /** Power units generated (+) or drawn (−). */
  power: number;
  idle: IdleReason;
}

/** Cached production record for one building (or the rate mirror of one factory). */
interface FlowRec {
  b: BuildingInstance;
  /** World position used for "+12 Wood" pop-ups. */
  x: number;
  z: number;
  /** Base per-minute inputs/outputs (before level/efficiency/modifiers). */
  ins: Entries;
  outs: Entries;
  /** Per-minute inputs/outputs at current level, efficiency and modifiers (full availability, full load). */
  inRate: number[];
  outRate: number[];
  lm: number;
  /** Operating efficiency (power × staffing). */
  eff: number;
  /** Fuelled generators: share of their output the grid currently needs (fuel is burnt accordingly). */
  load: number;
  /** Input availability vs. the full-load need in the last tick (0..1) and a smoothed copy for UI/power. */
  frac: number;
  fracSmooth: number;
  seen: number;
}

/** Seconds between economy ticks / periodic recomputes. */
const TICK = 1;
const RECOMPUTE_INTERVAL = 1;
/** A shortage stays flagged this long after upkeep last went unpaid (prevents flicker). */
const SHORT_GRACE = 3;
const SHORT_TOAST_COOLDOWN = 180;
const POWER_TOAST_COOLDOWN = 120;

/** Events after which derived economy data must be recomputed. */
const DIRTY_EVENTS = [
  'building:placed',
  'building:completed',
  'building:upgraded',
  'building:moved',
  'building:removed',
  'building:broken',
  'building:repaired',
  'building:changed',
  'colonist:recruited',
  'colonist:assigned',
  'colonist:skillUp',
  'research:completed',
  'colony:tierUp',
  'boost:started',
  'player:equipped',
] as const;

export class EconomySystem extends System {
  private dirty = true;
  private sinceRecompute = 0;
  private tickAcc = 0;
  private stamp = 0;

  private modsDirty = true;
  private readonly mods = new ModifierTable();
  private readonly offlineMods = new ModifierTable();
  private readonly prodKeys = new Map<string, string>();

  /** Flow records for buildings with produces/consumes, by building id. */
  private readonly flows = new Map<Id, FlowRec>();
  /** Rate-only mirrors of running factories (online cycles are processed by CraftingSystem). */
  private readonly factoryFlows = new Map<Id, FlowRec>();
  /** Converters (flows with inputs) processed individually each tick. */
  private readonly converters: FlowRec[] = [];
  /** Operating efficiency per building id. */
  private readonly opEffs = new Map<Id, number>();
  private readonly staffCache = new Map<Id, number>();
  private readonly colonistById = new Map<Id, Colonist>();

  /** Input-free production per second per resource (current modifiers). */
  private readonly plainPerSec = new Map<string, number>();
  /** Biggest input-free producer per resource (pop-up position). */
  private readonly bigProducer = new Map<string, { x: number; z: number; perSec: number }>();
  /** Fractional production not yet credited, and its biggest contributor since the last credit. */
  private readonly acc = new Map<string, number>();
  private readonly accSrc = new Map<string, { x: number; z: number; amt: number }>();
  private rpBasePerMin = 0;
  private rpPerSec = 0;
  private rpAcc = 0;
  private readonly upkeepPerMin = new Map<string, number>();

  private readonly shortUntil = new Map<string, number>();
  private readonly shortToastAt = new Map<string, number>();
  private readonly fullNotified = new Set<string>();
  private powerShort = false;
  private powerToastAt = Number.NEGATIVE_INFINITY;

  // ---------------------------------------------------------------- lifecycle

  override init(): void {
    const markDirty = () => this.markDirty();
    for (const ev of DIRTY_EVENTS) this.game.bus.on(ev, markDirty);
  }

  override onLoad(fresh = false): void {
    this.resetRuntime();
    const amounts = this.game.state.resources.amounts;
    for (const k of Object.keys(amounts)) if (!Number.isFinite(amounts[k]) || amounts[k] < 0) amounts[k] = 0;
    this.recompute();
    if (fresh) {
      // The starter kit is the colony's initial state, not a "gain": set silently.
      for (const [id, n] of Object.entries(this.game.data.starterKit.resources)) {
        const cur = amounts[id] ?? 0;
        amounts[id] = Math.max(cur, Math.min(cur + n, this.capacity(id)));
      }
    }
  }

  override update(dt: number): void {
    this.sinceRecompute += dt;
    if (this.dirty || this.sinceRecompute >= RECOMPUTE_INTERVAL) this.recompute();
    this.tickAcc += dt;
    if (this.tickAcc >= TICK) {
      const step = this.tickAcc;
      this.tickAcc = 0;
      this.tick(step);
    }
  }

  /** Request a recompute on the next update (call after changing buildings/colonists directly). */
  markDirty(): void {
    this.dirty = true;
    this.modsDirty = true;
  }

  // ---------------------------------------------------------------- resources

  amount(id: string): number {
    return this.game.state.resources.amounts[id] ?? 0;
  }

  capacity(id: string): number {
    return this.game.derived.capacity[id] ?? this.game.data.resource(id)?.baseCapacity ?? 0;
  }

  /** Room left in storage for a resource. */
  freeCapacity(id: string): number {
    return Math.max(0, this.capacity(id) - this.amount(id));
  }

  isFull(id: string): boolean {
    return this.amount(id) >= this.capacity(id) - 1e-9;
  }

  canAfford(cost: ResourceBag | undefined): boolean {
    return bagCovers(this.game.state.resources.amounts, cost);
  }

  missing(cost: ResourceBag | undefined): ResourceBag {
    return bagMissing(this.game.state.resources.amounts, cost);
  }

  /** Deduct cost if affordable. Emits resource:spent or resource:insufficient. */
  spend(cost: ResourceBag | undefined, reason: string): boolean {
    if (!this.canAfford(cost)) {
      this.game.bus.emit('resource:insufficient', { missing: this.missing(cost) });
      return false;
    }
    const a = this.game.state.resources.amounts;
    for (const [k, v] of bagEntries(cost)) a[k] = (a[k] ?? 0) - v;
    this.game.bus.emit('resource:spent', { bag: cost ?? {}, reason });
    return true;
  }

  /**
   * Deduct without presentation events (automated consumers such as factory cycles).
   * Returns false (and deducts nothing) when not affordable.
   */
  deduct(cost: ResourceBag | undefined): boolean {
    if (!this.canAfford(cost)) return false;
    const a = this.game.state.resources.amounts;
    for (const [k, v] of bagEntries(cost)) a[k] = Math.max(0, (a[k] ?? 0) - v);
    return true;
  }

  /**
   * Add resources (clamped to capacity). Returns the amount actually added.
   * `x/z` (world units) lets UI/render animate resources flying from that spot.
   */
  add(id: string, amount: number, source: GainSource, x?: number, z?: number): number {
    const st = this.game.state.resources;
    const cur = st.amounts[id] ?? 0;
    const cap = this.capacity(id);
    const added = Math.max(0, Math.min(amount, cap - cur));
    st.amounts[id] = cur + added;
    st.lifetime[id] = (st.lifetime[id] ?? 0) + added;
    if (added > 0) this.game.bus.emit('resource:gained', { id, amount: added, source, x, z });
    if (amount > 0 && cap > 0 && cur + amount >= cap - 1e-9 && !this.fullNotified.has(id)) {
      this.fullNotified.add(id);
      this.game.bus.emit('resource:full', { id });
    }
    return added;
  }

  addBag(bag: ResourceBag | undefined, source: GainSource, x?: number, z?: number): ResourceBag {
    const out: ResourceBag = {};
    for (const [k, v] of bagEntries(bag)) out[k] = this.add(k, v, source, x, z);
    return out;
  }

  /**
   * Feed automated production (e.g. factory outputs) into the throttled production stream: credited
   * in whole units with the economy tick (≤ 1 `resource:gained` per resource per second).
   */
  addProduction(id: string, amount: number, x?: number, z?: number): void {
    this.accrue(id, amount, x, z, amount);
  }

  // ---------------------------------------------------------------- modifiers

  /**
   * Aggregated multiplier for a stat: (1 + sum of adds) * product of mults, from completed research,
   * equipped items, VIP, active boosts and colony happiness (for 'production').
   */
  modifier(stat: ModifierStat): number {
    if (this.modsDirty) {
      this.mods.rebuild(this.game, { boosts: true });
      this.modsDirty = false;
    }
    return this.mods.get(stat);
  }

  // ---------------------------------------------------------------- per-building queries

  /** Level effect multiplier for a facility instance. */
  levelMult(b: BuildingInstance): number {
    const def = this.game.data.building(b.def);
    return def ? levelMult(def, b.level) : 1;
  }

  /** Operating efficiency (power × staffing; 0 unless active), as of the last recompute. */
  efficiency(b: BuildingInstance): number {
    return this.opEffs.get(b.id) ?? 0;
  }

  /** Detailed rates for one building (UI building panel). */
  buildingEconomy(id: Id): BuildingEconomy | null {
    const b = this.game.state.buildings.list.find((x) => x.id === id);
    const def = b && this.game.data.building(b.def);
    if (!b || !def) return null;
    const lm = levelMult(def, b.level);
    const eff = this.opEffs.get(id) ?? 0;
    const produces: ResourceBag = {};
    const consumes: ResourceBag = {};
    let frac = 1;
    const rec = this.flows.get(id);
    if (rec) {
      frac = rec.ins.length ? rec.fracSmooth : 1;
      const run = rec.ins.length ? Math.min(rec.load, frac) : 1;
      rec.outs.forEach(([r], i) => (produces[r] = (produces[r] ?? 0) + rec.outRate[i] * run));
      rec.ins.forEach(([r], i) => (consumes[r] = (consumes[r] ?? 0) + rec.inRate[i] * run));
    }
    const frec = this.factoryFlows.get(id);
    let factoryActivity = 1;
    if (frec) {
      factoryActivity = this.game.sys.crafting.factoryActivity(id);
      frec.outs.forEach(([r], i) => (produces[r] = (produces[r] ?? 0) + frec.outRate[i] * factoryActivity));
      frec.ins.forEach(([r], i) => (consumes[r] = (consumes[r] ?? 0) + frec.inRate[i] * factoryActivity));
    }
    const p = def.power ?? 0;
    let power = 0;
    if (b.status === 'active') {
      power = p > 0 ? p * lm * (this.staffCache.get(id) ?? 1) * frac * this.modifier('power') : p;
    }
    const ratio = this.game.derived.power.ratio;
    let idle: IdleReason = null;
    if (b.status !== 'active') idle = b.status;
    else if (p < 0 && ratio <= 0) idle = 'no_power';
    else if (def.workers?.required && (this.staffCache.get(id) ?? 0) <= 0) idle = 'no_workers';
    else if ((rec && rec.ins.length && rec.frac < 0.999) || (frec && factoryActivity < 0.5)) idle = 'no_inputs';
    else if (p < 0 && ratio < 1) idle = 'low_power';
    return {
      eff,
      levelMult: lm,
      produces,
      consumes,
      research: (def.research_rate ?? 0) * lm * eff * this.modifier('research'),
      power,
      idle,
    };
  }

  // ---------------------------------------------------------------- colonist upkeep

  /** Colonist upkeep per minute for a resource (food/water). */
  upkeep(id: string): number {
    return this.upkeepPerMin.get(id) ?? 0;
  }

  /**
   * True while colonist upkeep for this resource is going unpaid (empty storage). Colonists use it as
   * a gentle happiness factor — never starvation.
   */
  isShort(resourceId: string): boolean {
    return this.game.state.playTime < (this.shortUntil.get(resourceId) ?? Number.NEGATIVE_INFINITY);
  }

  // ---------------------------------------------------------------- derived

  /** Recompute capacity, rates, power, research rate and building efficiencies. */
  recompute(): void {
    const g = this.game;
    const d = g.derived;
    const data = g.data;
    const st = g.state;
    this.dirty = false;
    this.sinceRecompute = 0;
    this.modsDirty = true; // pick up boost/VIP expiry and happiness changes
    const stamp = ++this.stamp;

    this.colonistById.clear();
    for (const c of st.colonists.list) this.colonistById.set(c.id, c);

    // ---- pass 1: storage, staffing, power balance
    const cap: Record<string, number> = {};
    for (const r of data.resources) cap[r.id] = r.baseCapacity;
    let produced = 0;
    let consumed = 0;
    this.staffCache.clear();
    for (const b of st.buildings.list) {
      const def = data.building(b.def);
      if (!def) continue;
      const lm = levelMult(def, b.level);
      // Storage counts once built — damage or switching off never shrinks capacity (cozy).
      if (b.status !== 'building') for (const [r, n] of defEffects(def).storage) cap[r] = (cap[r] ?? 0) + n * lm;
      if (b.status !== 'active') continue;
      const staff = def.workers ? this.staffing(b, def) : 1;
      this.staffCache.set(b.id, staff);
      const p = def.power ?? 0;
      if (p > 0) produced += p * lm * staff * (def.consumes ? (this.flows.get(b.id)?.fracSmooth ?? 1) : 1);
      else if (p < 0) consumed -= p;
    }
    produced *= this.modifier('power');
    const ratio = consumed > 0 ? Math.min(1, produced / consumed) : 1;
    d.power.produced = produced;
    d.power.consumed = consumed;
    d.power.ratio = ratio;
    // Fuelled generators throttle to demand, so an idle grid never wastes fuel.
    const load = produced > 0 ? Math.min(1, consumed / produced) : 1;

    const storageMod = this.modifier('storage');
    for (const r in cap) cap[r] = Math.round(cap[r] * storageMod);
    assignInPlace(d.capacity, cap);

    // ---- pass 2: efficiencies, flows, research
    const prodMod = this.modifier('production');
    const craftMod = this.modifier('craftSpeed');
    const produce: Record<string, number> = {};
    const consume: Record<string, number> = {};
    this.plainPerSec.clear();
    for (const big of this.bigProducer.values()) big.perSec = 0;
    this.converters.length = 0;
    this.opEffs.clear();
    let rpBase = 0;

    for (const b of st.buildings.list) {
      const def = data.building(b.def);
      if (!def) continue;
      const lm = levelMult(def, b.level);
      let eff = 0;
      if (b.status === 'active') {
        eff = this.staffCache.get(b.id) ?? 1;
        if ((def.power ?? 0) < 0) eff *= ratio;
      }
      this.opEffs.set(b.id, eff);
      b.eff = eff;
      if (def.research_rate) rpBase += def.research_rate * lm * eff;

      const fx = defEffects(def);
      if (fx.produces.length || fx.consumes.length) {
        const rec = this.flowRec(this.flows, b, def, fx.consumes, fx.produces, lm, eff, stamp);
        rec.load = (def.power ?? 0) > 0 && rec.ins.length ? load : 1;
        for (let i = 0; i < rec.outs.length; i++) {
          const r = rec.outs[i][0];
          rec.outRate[i] = rec.outs[i][1] * lm * eff * prodMod * this.modifier(this.prodKey(r));
        }
        for (let i = 0; i < rec.ins.length; i++) rec.inRate[i] = rec.ins[i][1] * lm * eff;
        if (rec.ins.length) {
          this.converters.push(rec);
          b.eff = eff * rec.fracSmooth;
          const run = Math.min(rec.load, rec.fracSmooth);
          for (let i = 0; i < rec.outs.length; i++) addTo(produce, rec.outs[i][0], rec.outRate[i] * run);
          for (let i = 0; i < rec.ins.length; i++) addTo(consume, rec.ins[i][0], rec.inRate[i] * run);
        } else {
          for (let i = 0; i < rec.outs.length; i++) {
            const r = rec.outs[i][0];
            const perMin = rec.outRate[i];
            if (perMin <= 0) continue;
            addTo(produce, r, perMin);
            this.plainPerSec.set(r, (this.plainPerSec.get(r) ?? 0) + perMin / 60);
            let big = this.bigProducer.get(r);
            if (!big) this.bigProducer.set(r, (big = { x: rec.x, z: rec.z, perSec: 0 }));
            if (perMin / 60 > big.perSec) {
              big.x = rec.x;
              big.z = rec.z;
              big.perSec = perMin / 60;
            }
          }
        }
      }

      // Factory with a selected recipe: mirror its throughput for rates & offline progress.
      const recipe = def.factory && b.recipe ? data.recipe(b.recipe) : undefined;
      if (recipe && recipe.station === def.factory) {
        const rf = recipeFlows(recipe);
        const rec = this.flowRec(this.factoryFlows, b, def, rf.ins, rf.outs, lm, eff, stamp);
        const speed = factorySpeed(eff, lm, craftMod, prodMod);
        const activity = g.sys.crafting.factoryActivity(b.id);
        for (let i = 0; i < rec.outs.length; i++) {
          rec.outRate[i] = rec.outs[i][1] * speed;
          addTo(produce, rec.outs[i][0], rec.outRate[i] * activity);
        }
        for (let i = 0; i < rec.ins.length; i++) {
          rec.inRate[i] = rec.ins[i][1] * speed;
          addTo(consume, rec.ins[i][0], rec.inRate[i] * activity);
        }
      }
    }
    for (const [id, rec] of this.flows) if (rec.seen !== stamp) this.flows.delete(id);
    for (const [id, rec] of this.factoryFlows) if (rec.seen !== stamp) this.factoryFlows.delete(id);

    // ---- research
    this.rpBasePerMin = rpBase;
    const rpPerMin = rpBase * this.modifier('research');
    this.rpPerSec = rpPerMin / 60;
    d.research.perMin = rpPerMin;

    // ---- colonist upkeep
    const colonists = st.colonists.list.length;
    this.upkeepPerMin.clear();
    const bal = data.balance;
    if (colonists > 0) {
      if (bal.foodPerColonistPerMin > 0) this.upkeepPerMin.set(ANCHOR_IDS.food, colonists * bal.foodPerColonistPerMin);
      if (bal.waterPerColonistPerMin > 0) this.upkeepPerMin.set(ANCHOR_IDS.water, colonists * bal.waterPerColonistPerMin);
    }
    for (const [r, n] of this.upkeepPerMin) addTo(consume, r, n);

    // ---- UI rates
    const net: Record<string, number> = {};
    for (const r in produce) net[r] = produce[r];
    for (const r in consume) net[r] = (net[r] ?? 0) - consume[r];
    assignInPlace(d.producePerMin, produce);
    assignInPlace(d.consumePerMin, consume);
    assignInPlace(d.netPerMin, net);
  }

  // ---------------------------------------------------------------- offline

  /** Compute (but do not apply) offline gains for `awaySeconds`, respecting caps. */
  computeOffline(awaySeconds: number): OfflineSummary {
    const bal = this.game.data.balance;
    this.recompute();
    const away = Math.max(0, awaySeconds);
    const capSeconds = bal.offlineHours * 3600 * this.modifier('offlineHours');
    const seconds = Math.min(away, capSeconds) * bal.offlineEfficiency;
    const storageMult = bal.offlineStorageMult ?? 1;
    let capacity: Record<string, number> = this.game.derived.capacity;
    if (storageMult !== 1) {
      capacity = {};
      for (const r in this.game.derived.capacity) capacity[r] = this.game.derived.capacity[r] * storageMult;
    }
    const res = simulateOffline(this.offlineModel(), seconds, this.game.state.resources.amounts, capacity);
    const summary: OfflineSummary = { seconds, away, gains: res.gains, rp: res.rp };
    if (Object.keys(res.spent).length) summary.spent = res.spent;
    return summary;
  }

  /**
   * Apply an offline summary (optionally multiplied, e.g. x2 from a rewarded ad). The credited amounts
   * are exactly what the Welcome Back screen promised — the ad bonus may exceed storage capacity.
   */
  applyOffline(summary: OfflineSummary, mult = 1): void {
    const m = Math.max(0, mult);
    const st = this.game.state.resources;
    for (const [k, v] of bagEntries(summary.spent)) st.amounts[k] = Math.max(0, (st.amounts[k] ?? 0) - v);
    for (const [k, v] of bagEntries(summary.gains)) {
      const n = Math.floor(v * m);
      if (n <= 0) continue;
      st.amounts[k] = (st.amounts[k] ?? 0) + n;
      st.lifetime[k] = (st.lifetime[k] ?? 0) + n;
      this.game.bus.emit('resource:gained', { id: k, amount: n, source: 'offline' });
    }
    if (summary.rp > 0) this.game.sys.research.addPoints(Math.floor(summary.rp * m));
  }

  // ---------------------------------------------------------------- internals

  private resetRuntime(): void {
    this.dirty = true;
    this.modsDirty = true;
    this.sinceRecompute = 0;
    this.tickAcc = 0;
    this.flows.clear();
    this.factoryFlows.clear();
    this.converters.length = 0;
    this.acc.clear();
    this.accSrc.clear();
    this.rpAcc = 0;
    this.shortUntil.clear();
    this.fullNotified.clear();
    this.powerShort = false;
  }

  private prodKey(r: string): ModifierStat {
    let k = this.prodKeys.get(r);
    if (!k) this.prodKeys.set(r, (k = `production:${r}`));
    return k as ModifierStat;
  }

  /** Staffing factor: required → Σproductivity / slots; optional → 1 + 25% × Σproductivity. */
  private staffing(b: BuildingInstance, def: BuildingDef): number {
    const spec = def.workers!;
    const colonists = this.game.sys.colonists;
    let sum = 0;
    let n = 0;
    for (const cid of b.workers) {
      if (n >= spec.slots) break;
      const c = this.colonistById.get(cid);
      if (!c) continue;
      const p = colonists.productivity(c);
      sum += Number.isFinite(p) && p >= 0 ? p : 1;
      n++;
    }
    if (spec.required) return spec.slots > 0 ? sum / spec.slots : 1;
    return 1 + 0.25 * sum;
  }

  private flowRec(
    map: Map<Id, FlowRec>,
    b: BuildingInstance,
    def: BuildingDef,
    ins: Entries,
    outs: Entries,
    lm: number,
    eff: number,
    stamp: number,
  ): FlowRec {
    let rec = map.get(b.id);
    if (!rec || rec.ins !== ins || rec.outs !== outs) {
      rec = {
        b,
        x: 0,
        z: 0,
        ins,
        outs,
        inRate: ins.map(() => 0),
        outRate: outs.map(() => 0),
        lm,
        eff,
        load: 1,
        frac: 1,
        fracSmooth: 1,
        seen: stamp,
      };
      map.set(b.id, rec);
    }
    rec.b = b;
    rec.x = centerX(b, def);
    rec.z = centerZ(b, def);
    rec.lm = lm;
    rec.eff = eff;
    rec.seen = stamp;
    return rec;
  }

  /** One economy tick: production, upkeep, converters, research, whole-unit crediting. */
  private tick(step: number): void {
    const st = this.game.state;
    const amounts = st.resources.amounts;
    const now = st.playTime;

    // 1. input-free producers (pre-aggregated per resource)
    for (const [r, perSec] of this.plainPerSec) {
      const big = this.bigProducer.get(r);
      this.accrue(r, perSec * step, big?.x, big?.z, (big?.perSec ?? 0) * step);
    }

    // 2. colonist upkeep — fresh production first, then storage; never below zero
    for (const [r, perMin] of this.upkeepPerMin) {
      let need = (perMin / 60) * step;
      need -= this.takeAcc(r, need);
      const have = amounts[r] ?? 0;
      const take = Math.min(have, need);
      if (take > 0) amounts[r] = have - take;
      need -= take;
      if (need > 1e-6) this.markShort(r, now);
    }

    // 3. converters run only as far as their inputs allow (fuelled generators also only as far as
    //    the grid needs: `load`)
    for (const rec of this.converters) {
      let f = rec.eff > 0 ? 1 : 0;
      for (let i = 0; i < rec.ins.length && f > 0; i++) {
        const need = (rec.inRate[i] / 60) * step;
        if (need <= 0) continue;
        const r = rec.ins[i][0];
        const have = (amounts[r] ?? 0) + (this.acc.get(r) ?? 0);
        if (have < need) f = Math.min(f, have / need);
      }
      const run = Math.min(f, rec.load);
      if (run > 0) {
        for (let i = 0; i < rec.ins.length; i++) {
          const r = rec.ins[i][0];
          let need = (rec.inRate[i] / 60) * step * run;
          need -= this.takeAcc(r, need);
          if (need > 0) amounts[r] = Math.max(0, (amounts[r] ?? 0) - need);
        }
        for (let i = 0; i < rec.outs.length; i++) {
          const amt = (rec.outRate[i] / 60) * step * run;
          this.accrue(rec.outs[i][0], amt, rec.x, rec.z, amt);
        }
      }
      rec.frac = f;
      rec.fracSmooth += (f - rec.fracSmooth) * 0.35;
      if (rec.fracSmooth < 1e-3) rec.fracSmooth = 0;
      rec.b.eff = rec.eff * rec.fracSmooth;
    }

    // 4. research points (whole points, fractional carry)
    this.rpAcc += this.rpPerSec * step;
    if (this.rpAcc >= 1 - 1e-9) {
      const whole = Math.floor(this.rpAcc + 1e-9);
      this.rpAcc = Math.max(0, this.rpAcc - whole);
      this.game.sys.research.addPoints(whole);
    }

    // 5. credit whole units — at most one resource:gained per resource per tick
    for (const [r, v] of this.acc) {
      if (v < 1 - 1e-9) continue;
      const whole = Math.floor(v + 1e-9);
      this.acc.set(r, Math.max(0, v - whole));
      const src = this.accSrc.get(r);
      this.add(r, whole, 'production', src?.x, src?.z);
      if (src) src.amt = 0;
    }

    this.housekeeping(now);
  }

  /** Add fractional production; remembers the biggest contributor's position for the pop-up. */
  private accrue(r: string, amt: number, x: number | undefined, z: number | undefined, contrib: number): void {
    if (!(amt > 0)) return;
    this.acc.set(r, (this.acc.get(r) ?? 0) + amt);
    if (x === undefined || z === undefined) return;
    const src = this.accSrc.get(r);
    if (!src) this.accSrc.set(r, { x, z, amt: contrib });
    else if (contrib > src.amt) {
      src.x = x;
      src.z = z;
      src.amt = contrib;
    }
  }

  /** Take up to `amt` from uncredited production. Returns what was taken. */
  private takeAcc(r: string, amt: number): number {
    const have = this.acc.get(r);
    if (!have || amt <= 0) return 0;
    const take = Math.min(have, amt);
    this.acc.set(r, have - take);
    return take;
  }

  private markShort(r: string, now: number): void {
    const was = this.isShort(r);
    this.shortUntil.set(r, now + SHORT_GRACE);
    if (was || now < (this.shortToastAt.get(r) ?? Number.NEGATIVE_INFINITY)) return;
    this.shortToastAt.set(r, now + SHORT_TOAST_COOLDOWN);
    const def = this.game.data.resource(r);
    const name = def?.name ?? r;
    this.game.toast(`${name} is running low — colonists are a little less cheerful. Produce more ${name.toLowerCase()}!`, 'warning', def?.icon);
  }

  /** Cheap periodic bookkeeping: storage-full flags and a gentle power-shortage hint. */
  private housekeeping(now: number): void {
    for (const r of this.fullNotified) if (this.amount(r) < this.capacity(r) * 0.9) this.fullNotified.delete(r);

    const p = this.game.derived.power;
    const short = p.consumed > 0 && p.ratio < 0.999;
    if (short && !this.powerShort && now >= this.powerToastAt) {
      this.powerToastAt = now + POWER_TOAST_COOLDOWN;
      this.game.toast('Power is running short — machines slow down. Build more generators!', 'warning', '⚡');
    }
    this.powerShort = short;
  }

  /**
   * Flow model for offline progress: current efficiencies, modifiers without temporary boosts. Reflects the last
   * `recompute()`. Public so the notification planner (platform/notifyPlan.ts) can forecast with the very model
   * Welcome Back will credit.
   */
  offlineModel(): OfflineModel {
    const mods = this.offlineMods;
    mods.rebuild(this.game, { boosts: false });
    const prodMod = mods.get('production');
    const craftMod = mods.get('craftSpeed');
    const flows: OfflineFlow[] = [];
    for (const rec of this.flows.values()) {
      const k = rec.lm * rec.eff * rec.load;
      if (k <= 0) continue;
      flows.push({
        ins: rec.ins.map(([r, n]) => [r, n * k]),
        outs: rec.outs.map(([r, n]) => [r, n * k * prodMod * mods.get(this.prodKey(r))]),
      });
    }
    for (const rec of this.factoryFlows.values()) {
      const speed = factorySpeed(rec.eff, rec.lm, craftMod, prodMod);
      if (speed <= 0 || rec.outs.length === 0) continue;
      flows.push({ ins: rec.ins.map(([r, n]) => [r, n * speed]), outs: rec.outs.map(([r, n]) => [r, n * speed]) });
    }
    return {
      flows,
      upkeep: [...this.upkeepPerMin],
      rpPerMin: this.rpBasePerMin * mods.get('research'),
    };
  }
}

function addTo(bag: Record<string, number>, k: string, v: number): void {
  if (v !== 0) bag[k] = (bag[k] ?? 0) + v;
}

/** Replace a record's contents without replacing the object (UI may hold references). */
function assignInPlace(target: Record<string, number>, src: Record<string, number>): void {
  for (const k in target) if (!(k in src)) delete target[k];
  for (const k in src) target[k] = src[k];
}
