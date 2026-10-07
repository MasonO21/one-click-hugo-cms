/**
 * CraftingSystem — manual crafting queue at stations, automated factories (BuildingDef.factory with a
 * selected recipe), instant-finish via ad/nova.
 *
 * OWNER: economy agent. Writes state.crafting. Item inventory lives in state.player.items and is
 * modified through PlayerSystem.addItem().
 *
 * - Manual queue: jobs run in order, one at a time per station type, and keep running while the
 *   player is away (advanced on load).
 * - Factories: every active factory building with a recipe crafts continuously. Inputs are paid at
 *   the start of each cycle (idle while missing); cycle speed scales with power, staffing, level,
 *   'craftSpeed' and 'production' modifiers. Resource outputs join the economy's throttled
 *   production stream, so 30 factories don't flood the UI with events.
 */
import { System } from './System';
import type { BuildingDef, RecipeDef } from '../data/schema';
import type { BuildingInstance, CraftJob, Id } from '../core/state';
import { bagEntries } from '../core/bag';
import { centerX, centerZ, factorySpeed, levelMult } from './econ/effects';

declare module '../core/state' {
  interface BuildingInstance {
    /** Factory: inputs for the current cycle have been paid. */
    cyclePaid?: boolean;
    /** Factory: recipe the paid cycle belongs to (refunded if the recipe changes mid-cycle). */
    cycleRecipe?: string | null;
  }
}

export interface CraftCheck {
  ok: boolean;
  reason?: string;
}

/** Nova Crystals per started 30 seconds of remaining craft time. */
const FINISH_SECONDS_PER_NOVA = 30;
/** Min seconds between factory "craft done" sounds (presentation throttle). */
const FACTORY_SFX_COOLDOWN = 4;
/** Safety cap on factory cycles completed in one frame (very fast factories). */
const MAX_CYCLES_PER_FRAME = 8;

const STATION_EVENTS = [
  'building:placed',
  'building:completed',
  'building:removed',
  'building:broken',
  'building:repaired',
  'building:changed',
  'building:upgraded',
  'building:moved',
  'colony:tierUp',
] as const;

export class CraftingSystem extends System {
  private stationCache: string[] | null = null;
  private factories: BuildingInstance[] = [];
  private factoriesDirty = true;
  private refreshTimer = 0;
  /** Smoothed factory activity 0..1 (1 = running, 0 = idle for lack of inputs). */
  private readonly activity = new Map<Id, number>();
  private readonly budgets = new Map<string, number>();
  private readonly finished: CraftJob[] = [];
  private sfxCooldown = 0;

  override init(): void {
    const invalidate = () => {
      this.stationCache = null;
      this.factoriesDirty = true;
    };
    for (const ev of STATION_EVENTS) this.game.bus.on(ev, invalidate);
    // Removing a factory mid-cycle gives its paid inputs back (cozy: nothing is ever lost).
    this.game.bus.on('building:removed', ({ id }) => {
      const b = this.factories.find((f) => f.id === id);
      if (b?.cyclePaid) this.refundCycle(b);
    });
  }

  override onLoad(fresh: boolean): void {
    this.stationCache = null;
    this.factoriesDirty = true;
    this.activity.clear();
    if (fresh) return;
    // Crafting keeps going while the player is away.
    const bal = this.game.data.balance;
    const away = Math.max(0, (this.game.now() - this.game.state.lastTickAt) / 1000);
    const cap = bal.offlineHours * 3600 * this.game.sys.economy.modifier('offlineHours');
    if (away > 0) this.advanceQueue(Math.min(away, cap));
  }

  override update(dt: number): void {
    this.refreshTimer += dt;
    if (this.refreshTimer >= 1) {
      this.refreshTimer = 0;
      this.stationCache = null;
      this.factoriesDirty = true;
    }
    if (this.sfxCooldown > 0) this.sfxCooldown -= dt;
    if (this.game.state.crafting.queue.length) this.advanceQueue(dt);
    this.updateFactories(dt);
  }

  // ---------------------------------------------------------------- recipes & stations

  /** Is a recipe unlocked by colony tier and research? */
  isUnlocked(recipe: RecipeDef): boolean {
    if (recipe.unlockTier > this.game.state.colony.tier) return false;
    return !recipe.research || this.game.state.research.completed.includes(recipe.research);
  }

  /** Recipes unlocked (tier + research) for a station type ('hand', 'workbench', ...), or all. */
  recipes(station?: string): RecipeDef[] {
    return this.game.data.recipes.filter((r) => (station === undefined || r.station === station) && this.isUnlocked(r));
  }

  /** Station types currently available (built stations + 'hand'). */
  stations(): string[] {
    if (!this.stationCache) {
      const set = new Set<string>(['hand']);
      for (const b of this.game.state.buildings.list) {
        // A station damaged during an attack keeps working (never punish).
        if (b.status !== 'active' && b.status !== 'damaged') continue;
        const st = this.game.data.building(b.def)?.station;
        if (st) set.add(st);
      }
      this.stationCache = [...set];
    }
    return this.stationCache;
  }

  /** Display name of a station type ("Crafting Table"), for "Requires …" messages. */
  stationName(station: string): string {
    if (station === 'hand') return 'Hand';
    const def = this.game.data.buildings.find((d) => d.station === station || d.factory === station);
    return def?.name ?? station;
  }

  canCraft(recipeId: string): CraftCheck {
    const g = this.game;
    const r = g.data.recipe(recipeId);
    if (!r) return { ok: false, reason: 'Unknown recipe' };
    if (r.unlockTier > g.state.colony.tier) return { ok: false, reason: `Requires ${g.data.tier(r.unlockTier).name} tier` };
    if (r.research && !g.state.research.completed.includes(r.research)) {
      return { ok: false, reason: `Requires research: ${g.data.researchDef(r.research)?.name ?? r.research}` };
    }
    if (!this.stations().includes(r.station)) return { ok: false, reason: `Requires ${this.stationName(r.station)}` };
    if (!g.sys.economy.canAfford(r.inputs)) return { ok: false, reason: 'Not enough resources' };
    for (const [id, n] of Object.entries(r.itemInputs ?? {})) {
      if ((g.state.player.items[id] ?? 0) < n) return { ok: false, reason: `Requires ${g.data.item(id)?.name ?? id}` };
    }
    const outRes = bagEntries(r.outputs.resources);
    if (outRes.length && !r.outputs.items && !r.outputs.vehicle && outRes.every(([id]) => g.sys.economy.isFull(id))) {
      return { ok: false, reason: 'Storage full' };
    }
    return { ok: true };
  }

  /** Pay inputs and queue. Returns job id. */
  craft(recipeId: string): Id | null {
    const g = this.game;
    const r = g.data.recipe(recipeId);
    const check = this.canCraft(recipeId);
    if (!r || !check.ok) {
      if (r && check.reason === 'Not enough resources') g.bus.emit('resource:insufficient', { missing: g.sys.economy.missing(r.inputs) });
      g.bus.emit('sfx', { id: 'ui_error' });
      return null;
    }
    if (!g.sys.economy.spend(r.inputs, `craft:${r.id}`)) return null;
    for (const [id, n] of Object.entries(r.itemInputs ?? {})) g.sys.player.removeItem(id, n);

    const cs = g.state.crafting;
    const time = Math.max(0, r.time / Math.max(0.01, g.sys.economy.modifier('craftSpeed')));
    const job: CraftJob = { id: cs.nextJobId++, recipe: r.id, remaining: time, total: time };
    cs.queue.push(job);
    g.bus.emit('craft:queued', { job: job.id, recipe: r.id });
    g.bus.emit('sfx', { id: 'craft_start' });
    return job.id;
  }

  /** Complete a queued job immediately (rewarded ad or nova). */
  finishNow(jobId: Id): boolean {
    const job = this.job(jobId);
    if (!job) return false;
    this.completeJob(job);
    return true;
  }

  /** Nova cost to finish a job now. */
  finishCost(jobId: Id): number {
    const job = this.job(jobId);
    return job ? Math.max(1, Math.ceil(job.remaining / FINISH_SECONDS_PER_NOVA)) : 0;
  }

  /** Cancel a queued job with a full refund of its inputs. */
  cancel(jobId: Id): boolean {
    const g = this.game;
    const job = this.job(jobId);
    if (!job) return false;
    this.removeJob(job);
    const r = g.data.recipe(job.recipe);
    if (r) {
      g.sys.economy.addBag(r.inputs, 'refund');
      for (const [id, n] of Object.entries(r.itemInputs ?? {})) g.sys.player.addItem(id, n);
    }
    return true;
  }

  job(jobId: Id): CraftJob | undefined {
    return this.game.state.crafting.queue.find((j) => j.id === jobId);
  }

  /** Queued jobs (optionally for one station type), in processing order. */
  jobs(station?: string): CraftJob[] {
    const q = this.game.state.crafting.queue;
    return station === undefined ? q : q.filter((j) => this.game.data.recipe(j.recipe)?.station === station);
  }

  /** 0..1 progress of a job (only the first job per station advances). */
  progress(jobId: Id): number {
    const job = this.job(jobId);
    if (!job) return 0;
    return job.total > 0 ? 1 - job.remaining / job.total : 1;
  }

  // ---------------------------------------------------------------- factories

  /** Smoothed activity of a factory: 1 = running, 0 = idle (missing inputs / no recipe). */
  factoryActivity(buildingId: Id): number {
    return this.activity.get(buildingId) ?? 1;
  }

  /** Current cycle speed of a factory (1 = one cycle per recipe.time seconds). */
  factorySpeed(b: BuildingInstance): number {
    const def = this.game.data.building(b.def);
    if (!def?.factory || b.status !== 'active') return 0;
    const eco = this.game.sys.economy;
    return factorySpeed(eco.efficiency(b), levelMult(def, b.level), eco.modifier('craftSpeed'), eco.modifier('production'));
  }

  /** 0..1 progress of a factory's current cycle. */
  factoryProgress(b: BuildingInstance): number {
    const r = b.recipe ? this.game.data.recipe(b.recipe) : undefined;
    return r && r.time > 0 ? Math.min(1, b.craft / r.time) : 0;
  }

  // ---------------------------------------------------------------- internals

  /** Advance the manual queue by `dt` seconds: one job at a time per station type. */
  private advanceQueue(dt: number): void {
    const q = this.game.state.crafting.queue;
    this.budgets.clear();
    this.finished.length = 0;
    for (const job of q) {
      const station = this.game.data.recipe(job.recipe)?.station ?? 'hand';
      const budget = this.budgets.get(station) ?? dt;
      if (budget <= 0) continue;
      if (job.remaining <= budget) {
        this.budgets.set(station, budget - Math.max(0, job.remaining));
        job.remaining = 0;
        this.finished.push(job);
      } else {
        job.remaining -= budget;
        this.budgets.set(station, 0);
      }
    }
    for (const job of this.finished) this.completeJob(job);
    this.finished.length = 0;
  }

  private removeJob(job: CraftJob): void {
    const q = this.game.state.crafting.queue;
    const i = q.indexOf(job);
    if (i >= 0) q.splice(i, 1);
  }

  private completeJob(job: CraftJob): void {
    const g = this.game;
    this.removeJob(job);
    job.remaining = 0;
    const r = g.data.recipe(job.recipe);
    if (!r) return;
    const at = this.stationPos(r.station);
    for (const [id, n] of bagEntries(r.outputs.resources)) g.sys.economy.add(id, n, 'craft', at?.x, at?.z);
    this.grantItemsAndVehicle(r);
    this.countCraft(r);
    g.bus.emit('craft:completed', { recipe: r.id });
    g.bus.emit('sfx', { id: 'craft_done' });
    const icon = r.outputs.items ? g.data.item(Object.keys(r.outputs.items)[0])?.icon : undefined;
    g.toast(`Crafted ${r.name}!`, 'success', icon);
  }

  private grantItemsAndVehicle(r: RecipeDef): void {
    const g = this.game;
    for (const [id, n] of Object.entries(r.outputs.items ?? {})) if (n > 0) g.sys.player.addItem(id, n);
    if (r.outputs.vehicle && !g.state.player.vehicles.includes(r.outputs.vehicle)) g.grant({ vehicle: r.outputs.vehicle }, 'craft');
  }

  private countCraft(r: RecipeDef): void {
    const st = this.game.state;
    st.crafting.crafted[r.id] = (st.crafting.crafted[r.id] ?? 0) + 1;
    st.stats.crafted++;
  }

  /** Center of the nearest-to-player station building of a type (resource fly-out origin). */
  private stationPos(station: string): { x: number; z: number } | undefined {
    const g = this.game;
    if (station === 'hand') return { x: g.state.player.x, z: g.state.player.z };
    let best: { x: number; z: number } | undefined;
    let bestD = Infinity;
    for (const b of g.state.buildings.list) {
      const def = g.data.building(b.def);
      if (def?.station !== station) continue;
      const x = centerX(b, def);
      const z = centerZ(b, def);
      const d = (x - g.state.player.x) ** 2 + (z - g.state.player.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { x, z };
      }
    }
    return best;
  }

  private refreshFactories(): void {
    this.factoriesDirty = false;
    this.factories = this.game.state.buildings.list.filter((b) => !!this.game.data.building(b.def)?.factory);
    if (this.activity.size > this.factories.length) {
      for (const id of this.activity.keys()) if (!this.factories.some((f) => f.id === id)) this.activity.delete(id);
    }
  }

  private updateFactories(dt: number): void {
    if (this.factoriesDirty) this.refreshFactories();
    if (!this.factories.length) return;
    const g = this.game;
    const eco = g.sys.economy;
    const craftMod = eco.modifier('craftSpeed');
    const prodMod = eco.modifier('production');
    const smooth = Math.min(1, dt * 2);

    for (const b of this.factories) {
      const def = g.data.building(b.def) as BuildingDef;
      // Recipe changed or cleared mid-cycle: give the paid inputs back.
      if (b.cyclePaid && b.cycleRecipe !== b.recipe) this.refundCycle(b);
      const recipe = b.recipe ? g.data.recipe(b.recipe) : undefined;
      let running = false;
      if (recipe && recipe.station === def.factory && b.status === 'active') {
        const speed = factorySpeed(eco.efficiency(b), levelMult(def, b.level), craftMod, prodMod);
        running = speed > 0 && this.runFactory(b, def, recipe, dt * speed);
      }
      const a = this.activity.get(b.id) ?? 1;
      this.activity.set(b.id, a + ((running ? 1 : 0) - a) * smooth);
      b.eff = running ? eco.efficiency(b) : 0;
    }
  }

  /** Spend `budget` seconds of recipe time on a factory. Returns false when idle for lack of inputs. */
  private runFactory(b: BuildingInstance, def: BuildingDef, recipe: RecipeDef, budget: number): boolean {
    for (let cycles = 0; budget > 0 && cycles < MAX_CYCLES_PER_FRAME; ) {
      if (!b.cyclePaid && !this.payCycle(b, recipe)) return false;
      const need = recipe.time - b.craft;
      if (budget < need) {
        b.craft += budget;
        return true;
      }
      budget -= Math.max(0, need);
      b.craft = 0;
      b.cyclePaid = false;
      b.cycleRecipe = null;
      this.deliverFactory(b, def, recipe);
      cycles++;
    }
    return true;
  }

  private payCycle(b: BuildingInstance, recipe: RecipeDef): boolean {
    const g = this.game;
    for (const [id, n] of Object.entries(recipe.itemInputs ?? {})) if ((g.state.player.items[id] ?? 0) < n) return false;
    if (!g.sys.economy.deduct(recipe.inputs)) return false;
    for (const [id, n] of Object.entries(recipe.itemInputs ?? {})) g.sys.player.removeItem(id, n);
    b.cyclePaid = true;
    b.cycleRecipe = recipe.id;
    return true;
  }

  private refundCycle(b: BuildingInstance): void {
    const g = this.game;
    const r = b.cycleRecipe ? g.data.recipe(b.cycleRecipe) : undefined;
    b.cyclePaid = false;
    b.cycleRecipe = null;
    b.craft = 0;
    if (!r) return;
    g.sys.economy.addBag(r.inputs, 'refund');
    for (const [id, n] of Object.entries(r.itemInputs ?? {})) g.sys.player.addItem(id, n);
  }

  private deliverFactory(b: BuildingInstance, def: BuildingDef, recipe: RecipeDef): void {
    const g = this.game;
    const x = centerX(b, def);
    const z = centerZ(b, def);
    for (const [id, n] of bagEntries(recipe.outputs.resources)) g.sys.economy.addProduction(id, n, x, z);
    this.grantItemsAndVehicle(recipe);
    this.countCraft(recipe);
    g.bus.emit('craft:completed', { recipe: recipe.id, factory: b.id });
    if (this.sfxCooldown <= 0) {
      this.sfxCooldown = FACTORY_SFX_COOLDOWN;
      g.bus.emit('sfx', { id: 'craft_done', x, z, volume: 0.35 });
    }
  }
}
