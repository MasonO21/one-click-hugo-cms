/**
 * Pacing bot: plays Nova Colony like a reasonable, engaged mobile player, through the public sim API only
 * (joystick + context button for the world, system methods for what the menus do). Not a test; driven by
 * tests/pacing/run.ts.
 *
 * Priorities each decision (every ~0.5 s of play):
 *  1. claim everything waiting (victory chest, missions, medals, season, expeditions, daily gift, spin, free crate,
 *     crates in the backpack), tier up when possible;
 *  2. during an alien warning/attack, stand by the defenses (turrets do the work, the hero's gun helps);
 *  3. research: the mission / tier-gate path first, then the cheapest available tech when it does not delay the gate,
 *     then (from the Stone tier) the cheapest Mastery level with the points left over beyond the next tier gate;
 *  4. recruit into free beds, auto-assign workers, craft better gear and vehicles, grant wishes, send expeditions;
 *  5. build: the current main mission, then "fix what is idle" (no workers, no power, no inputs), housing, food,
 *     water, storage for the next goal, research, defenses scaled to the tier, comfort, then production for the
 *     resource that binds the next goal, then level-ups from surplus;
 *  6. move: discover/loot/rescue/chat for the mission or a wish, else hand-gather what the next goal lacks, else
 *     explore points of interest, else top up basic materials.
 *  7. walk out now and then (sim/survey.ts): about 15% of online time goes into excursions, taken when the next goal
 *     is minutes away or when a session opens (caches restock while the app is closed). An excursion follows the
 *     survey suggestions (restocked caches, unopened POIs, signals, uncharted ground), fast travels to a beacon when
 *     one is much closer, and ends with a hop home. Survey milestones are claimed from the Map like other rewards.
 */
import type { Game } from '../../src/core/Game';
import type { BuildingDef, MissionDef, RecipeDef, ResourceBag } from '../../src/data/schema';
import type { BuildingInstance, Colonist } from '../../src/core/state';
import { CELL, cellOf, rotatedSize } from '../../src/core/constants';
import { buyNovaItem } from '../../src/sim/novaShop';
import { betterItem } from '../../src/sim/meta/missionRules';
import { upgradeAll, upgradeAllPlan } from '../../src/sim/build/upgradeAll';
import { Mover, Nav, type Pt } from './nav';

export type NovaPolicy = 'save' | 'spend';

export interface BotOptions {
  nova: NovaPolicy;
  /**
   * 'human': menu time per action like a person tapping through panels, recruits to staff idle workplaces (plus one
   * optional hire every few minutes), at most one need-driven copy of a building every couple of minutes.
   * 'fast': an optimiser (short menus, fills every slot, no build cooldown): the upper bound of progress speed.
   */
  pace: 'human' | 'fast';
  /** Leave the victory chest to the on-screen card (in-browser playtests tap it like a player). */
  uiVictory?: boolean;
}

/** What the bot is doing this second (for the "waiting with nothing useful to do" metric). */
export type Activity = 'act' | 'gather_goal' | 'gather_filler' | 'travel' | 'explore' | 'defend' | 'wait';

type Task =
  | { kind: 'gather'; res: string; node: number; goal: boolean }
  | { kind: 'goto'; x: number; z: number; why: 'discover' | 'deposit' | 'defend' | 'home' | 'survey' }
  | { kind: 'poi'; id: string; why: 'mission' | 'explore' }
  | { kind: 'event'; id: number }
  | { kind: 'chat'; colonist: number };

export interface GoalInfo {
  /** Short label of what the bot is working toward ("tier 3", "build smelter"...). */
  label: string;
  /** Resource (or 'rp', 'capacity:<res>', 'beds', 'workers', 'power', 'travel', 'none') that binds the goal. */
  binding: string;
  /** Estimated minutes until the goal is affordable from production alone (Infinity if never). */
  eta: number;
}

const DEFENSE_COUNT = [1, 3, 5, 7, 9, 11, 13];
/** Share of online time the player is happy to spend walking out (seconds of excursion per second played). */
const EXPLORE_SHARE = 0.15;
/** Most excursion time saved up (seconds), and what it takes to set out. */
const EXPLORE_CAP = 240;
const EXPLORE_START = 100;
/** How far an excursion looks for something to survey (world units). */
const EXPLORE_RANGE = 420;
const SLOTS = ['tool', 'backpack', 'armor', 'weapon', 'utility'] as const;

export class PacingBot {
  game!: Game;
  nav!: Nav;
  mover!: Mover;
  task: Task | null = null;
  activity: Activity = 'wait';
  goal: GoalInfo = { label: '', binding: 'none', eta: 0 };
  /** What production planning aims at: the mission when it is resource-bound, else the next tier's bill. */
  prodGoal: GoalInfo = { label: '', binding: 'none', eta: 0 };
  /** Counters for the report. */
  stats = { builds: 0, upgrades: 0, research: 0, mastery: 0, crafts: 0, recruits: 0, wishes: 0, expeditions: 0, novaSpent: 0, paths: 0, stuck: 0, excursions: 0, surveyClaims: 0 };
  /** Seconds of walking out saved up (EXPLORE_SHARE of online play, capped). */
  exploreBudget = 0;
  /** On an excursion right now. */
  excursion = false;
  private sessionStartT = 0;
  private excursionCooldown = 0;
  /** Seconds remaining in the current session (set by the runner; used for expedition sizing). */
  sessionLeft = Infinity;
  nextGap = 0;
  log: string[] = [];

  private decideT = 0;
  private actedAt = -1e9;
  private banned = new Map<string, number>();
  /** Seconds the player is still busy in a menu (placing, researching, crafting...): a human, not a script. */
  private busy = 0;
  private taskAt = 0;
  private lastOptionalHire = -1e9;
  private storageAt = new Map<string, number>();
  /** Extra turrets the player adds after raids that hurt (a person reacts to broken buildings). */
  defenseExtra = 0;
  private raidStart = 0;
  private raidBroken = 0;
  /** playTime of the last need-driven new building per def (human pace: no spamming copies). */
  private lastBuilt = new Map<string, number>();

  constructor(readonly opts: BotOptions) {}

  attach(game: Game): void {
    this.game = game;
    this.nav = new Nav(game);
    this.mover = new Mover(game, this.nav);
    this.task = null;
    this.decideT = 0;
    this.excursion = false;
    this.sessionStartT = game.state.playTime;
    game.state.settings.autoGather = true;
    game.bus.on('combat:started', () => {
      this.raidStart = game.state.playTime;
      this.raidBroken = 0;
    });
    game.bus.on('building:broken', () => {
      if (game.state.combat.phase === 'attack') this.raidBroken++;
    });
    game.bus.on('combat:ended', () => {
      if (this.raidBroken > 0 || game.state.playTime - this.raidStart > 150) this.defenseExtra += 2;
    });
    game.bus.on('colony:tierUp', () => {
      this.defenseExtra = Math.max(0, this.defenseExtra - 2);
    });
  }

  private now(): number {
    return this.game.state.playTime;
  }

  /** Human menu time per action kind (seconds of play the player spends tapping instead of walking). */
  static readonly MENU = { build: 12, level: 6, research: 8, mastery: 3, craft: 6, recruit: 8, claim: 2.5, wish: 5, expedition: 10, nova: 6 };

  /** The runner counts menu actions (taps) per tier. */
  onAct: ((what: string) => void) | null = null;

  private acted(what: string, menu = 0): void {
    this.onAct?.(what);
    this.actedAt = this.now();
    // a person also glances around for a couple of seconds before the next thing
    this.busy = Math.max(this.busy, this.opts.pace === 'fast' ? menu * 0.4 : menu + 2);
    if (this.log.length < 4000) this.log.push(`${(this.now() / 60).toFixed(1)}m ${what}`);
  }

  // ====================================================================== frame

  /** Called every sim frame before game.update(dt). */
  frame(dt: number): void {
    const g = this.game;
    this.decideT -= dt;
    this.exploreBudget = Math.max(0, Math.min(EXPLORE_CAP, this.exploreBudget + dt * EXPLORE_SHARE - (this.excursion ? dt : 0)));
    if (this.excursion && this.exploreBudget <= 0) this.endExcursion();
    if (this.busy > 0) {
      this.busy -= dt;
      this.mover.release();
      this.activity = 'act';
      // an attack warning pulls the player out of the menus
      const c = g.state.combat;
      if (!(c.phase === 'attack' || (c.phase === 'warning' && c.nextAt - g.state.playTime < 30))) return;
      this.busy = 0;
    }
    if (this.decideT <= 0) {
      this.decideT = 0.5;
      try {
        this.decide();
      } catch (e) {
        if (this.log.length < 4000) this.log.push(`decide error: ${(e as Error).stack?.split('\n').slice(0, 3).join(' | ')}`);
      }
    }
    this.drive(dt);
    // activity classification
    const st = g.state;
    if (st.combat.phase === 'attack' || (st.combat.phase === 'warning' && st.combat.nextAt - st.playTime < 40)) this.activity = 'defend';
    else if (this.now() - this.actedAt < 2) this.activity = 'act';
    else if (this.task?.kind === 'gather') this.activity = this.task.goal ? 'gather_goal' : 'gather_filler';
    else if ((this.task?.kind === 'poi' && this.task.why === 'explore') || (this.task?.kind === 'goto' && this.task.why === 'survey') || this.excursion) this.activity = 'explore';
    else if (this.task) this.activity = 'travel';
    else this.activity = 'wait';
  }

  // ====================================================================== decisions

  private decide(): void {
    const g = this.game;
    const st = g.state;
    if (g.sys.player.isDown()) {
      this.task = null;
      this.mover.clear();
      return;
    }
    const M = PacingBot.MENU;
    this.goal = this.computeGoal();
    // one menu action per decision: a human taps through one thing at a time
    if (this.claims()) return;
    const mission = g.sys.missions.current();
    if (g.sys.progression.canTierUp() && (!this.guided() || mission?.type === 'tier') && g.sys.progression.tierUp()) {
      this.acted(`TIER UP -> ${st.colony.tier}`, M.build);
      return;
    }
    const inFight = st.combat.phase === 'attack' || (st.combat.phase === 'warning' && st.combat.nextAt - st.playTime < 30);
    // the tracker says "go there": a player heads out first and taps menus later
    if (!inFight && mission && this.travelMission(mission)) {
      this.doMovement();
      return;
    }
    // out on an excursion: the menus wait until the walk is over (claims above still happen)
    if (!inFight && !this.excursion) this.maybeSetOut();
    if (!inFight && this.excursion) {
      this.doMovement();
      return;
    }
    if (!inFight) {
      if (this.doResearch()) return;
      if (this.doColonists()) return;
      if (this.doCrafting()) return;
      if (!this.guided()) {
        if (this.doWishes()) return;
        if (this.doExpeditions()) return;
        if (this.doNova()) return;
      }
      if (this.doBuild()) return;
    }
    this.doMovement();
  }

  /** A main mission that needs the hero somewhere (discover a region, rescue a survivor) and is not done. */
  private travelMission(m: MissionDef): boolean {
    const g = this.game;
    if (g.sys.missions.progress(m.id).done) return false;
    if (m.type === 'discover') return g.sys.world.isUnlocked(m.target) && !g.sys.world.isDiscovered(m.target) && (this.banned.get(`r:${m.target}`) ?? 0) <= this.now();
    return m.type === 'rescue';
  }

  /** The guided first session (until the Reinforced Wood tier mission is done): follow the tracker only. */
  guided(): boolean {
    return !this.game.state.missions.completed.includes('m11_tier1');
  }

  // ---------------------------------------------------------------------- claims

  /** Claim one thing that is waiting (a tap or two each). Returns true when something was claimed. */
  private claims(): boolean {
    const g = this.game;
    const s = g.sys;
    const st = g.state;
    const tap = PacingBot.MENU.claim;
    if (st.combat.pendingReward && st.combat.phase !== 'attack' && !this.opts.uiVictory) {
      s.combat.claimReward(false);
      this.acted('claim victory chest', tap);
      return true;
    }
    // main missions claim themselves; side and daily ones wait for a tap in the Missions panel
    if (s.missions.claimable().some((m) => m.chain !== 'main') && s.missions.claimAll() > 0) {
      this.acted('claim missions', tap * 2);
      return true;
    }
    if (this.guided()) return false;
    if (s.achievements.claimableCount() > 0 && s.achievements.claimAll() > 0) {
      this.acted('claim medals', tap * 2);
      return true;
    }
    if (s.liveops.seasonClaimable() > 0 && s.liveops.claimAllSeason() > 0) {
      this.acted('claim season', tap * 2);
      return true;
    }
    if (s.expeditions.ready().length && s.expeditions.collectAll() > 0) {
      this.acted('collect expedition', tap * 2);
      return true;
    }
    for (const m of s.expeditions.claimableMilestones()) {
      s.expeditions.claimMilestone(m.count);
      this.acted('star chart milestone', tap);
      return true;
    }
    // region survey milestones: open the Map, tap the region, Claim, read the card
    for (const p of s.survey.all()) {
      if (!p.unlocked || p.claimed >= p.reached) continue;
      const c = s.survey.claim(p.region);
      if (c) {
        this.stats.surveyClaims++;
        this.acted(`survey ${p.region} ${c.pct}%`, tap * 3);
        return true;
      }
    }
    if (s.liveops.offersUnlocked()) {
      if (s.liveops.dailyAvailable() && s.liveops.claimDaily()) {
        this.acted('daily gift', tap);
        return true;
      }
      if (s.liveops.canSpinFree() && st.buildings.list.some((b) => g.data.building(b.def)?.spinWheel)) {
        void s.liveops.spin(false);
        this.acted('spin', tap * 3);
        return true;
      }
      if (s.liveops.freeCrateReady() && s.liveops.openFreeCrate(false)) {
        this.acted('free crate', tap);
        return true;
      }
    }
    // crates, chests, chips and boost drones from the backpack
    for (const [id, n] of Object.entries(st.player.items)) {
      if (n <= 0) continue;
      const def = g.data.item(id);
      if (!def?.use) continue;
      if (def.category === 'crate' || def.use.reward?.rp || def.use.reward?.boost) {
        if (s.player.useItem(id)) {
          this.acted(`open ${id}`, tap * 2);
          return true;
        }
      }
    }
    return false;
  }

  // ---------------------------------------------------------------------- goal & bottleneck

  /** The next thing the player works toward and what binds it. */
  private computeGoal(): GoalInfo {
    const g = this.game;
    const m = g.sys.missions.current();
    const need: ResourceBag = {};
    let rp = 0;
    let label = 'none';
    const add = (bag: ResourceBag | undefined) => {
      for (const [k, v] of Object.entries(bag ?? {})) need[k] = (need[k] ?? 0) + (v ?? 0);
    };
    const tierGoal = () => {
      const tn: ResourceBag = {};
      let trp = 0;
      const nx = g.sys.progression.next();
      if (!nx) return null;
      for (const [k, v] of Object.entries(nx.cost)) tn[k] = v ?? 0;
      if (nx.research && !nx.researchDone) {
        for (const r of this.researchChain(nx.research)) {
          trp += g.data.researchDef(r)!.cost;
          for (const [k, v] of Object.entries(g.data.researchDef(r)!.resources ?? {})) tn[k] = (tn[k] ?? 0) + (v ?? 0);
        }
      }
      return this.bindingOf(`tier ${nx.tier}`, tn, trp);
    };
    if (m) {
      label = `${m.id}`;
      const c = this.missionCost(m);
      add(c.res);
      rp += c.rp;
      const mg = c.binding ? { label, binding: c.binding, eta: c.binding === 'none' ? 0 : Infinity } : this.bindingOf(label, need, rp);
      const resourceBound = mg.binding === 'rp' || mg.binding.startsWith('capacity:') || !!g.data.resource(mg.binding);
      this.prodGoal = resourceBound ? mg : (tierGoal() ?? mg);
      return mg;
    }
    if (!Object.keys(need).length && !rp) {
      const nx = g.sys.progression.next();
      if (nx) {
        label = `tier ${nx.tier}`;
        add(nx.cost);
        if (nx.research && !nx.researchDone) {
          const chain = this.researchChain(nx.research);
          for (const r of chain) {
            rp += g.data.researchDef(r)!.cost;
            add(g.data.researchDef(r)!.resources);
          }
        }
      }
    }
    this.prodGoal = this.bindingOf(label, need, rp);
    return this.prodGoal;
  }

  private bindingOf(label: string, need: ResourceBag, rp: number): GoalInfo {
    const g = this.game;
    const eco = g.sys.economy;
    const d = g.derived;
    let binding = 'none';
    let eta = 0;
    for (const [k, v] of Object.entries(need)) {
      const want = v ?? 0;
      if (want > eco.capacity(k) + 1e-6) {
        return { label, binding: `capacity:${k}`, eta: Infinity };
      }
      const miss = want - eco.amount(k);
      if (miss <= 0) continue;
      const rate = Math.max(0, d.netPerMin[k] ?? 0);
      const t = rate > 0 ? miss / rate : Infinity;
      if (t > eta || binding === 'none') {
        eta = t;
        binding = k;
      }
    }
    const missRp = rp - g.state.research.points;
    if (missRp > 0) {
      const t = d.research.perMin > 0 ? missRp / d.research.perMin : Infinity;
      if (t > eta || binding === 'none') {
        eta = t;
        binding = 'rp';
      }
    }
    return { label, binding, eta };
  }

  /** Research ids still to buy on the way to `id` (prerequisites first). */
  private researchChain(id: string): string[] {
    const g = this.game;
    const out: string[] = [];
    const seen = new Set<string>();
    const visit = (r: string) => {
      if (seen.has(r) || g.sys.research.isDone(r)) return;
      seen.add(r);
      const def = g.data.researchDef(r);
      if (!def) return;
      for (const p of def.requires) visit(p);
      out.push(r);
    };
    visit(id);
    return out;
  }

  /** Resources a mission still needs (for the bottleneck metric) and a non-resource binding if any. */
  private missionCost(m: MissionDef): { res: ResourceBag; rp: number; binding?: string } {
    const g = this.game;
    const res: ResourceBag = {};
    let rp = 0;
    const p = g.sys.missions.progress(m.id);
    if (p.done) return { res, rp, binding: 'none' };
    const addR = (bag: ResourceBag | undefined, n = 1) => {
      for (const [k, v] of Object.entries(bag ?? {})) res[k] = (res[k] ?? 0) + (v ?? 0) * n;
    };
    const unlockChain = (r: string | undefined) => {
      if (!r) return;
      for (const id of this.researchChain(r)) {
        const def = g.data.researchDef(id)!;
        rp += def.cost;
        addR(def.resources);
      }
    };
    switch (m.type) {
      case 'build':
      case 'have_building': {
        const t = m.target.startsWith('category:') ? this.cheapestInCategory(m.target.slice(9)) : m.target;
        const def = t ? g.data.building(t) : undefined;
        if (def) {
          unlockChain(def.research);
          addR(g.sys.buildings.cost(def.id), Math.max(1, p.target - p.value));
        }
        break;
      }
      case 'research':
        unlockChain(m.target);
        break;
      case 'tier': {
        const nx = g.sys.progression.next();
        if (nx) {
          addR(nx.cost);
          if (nx.research) unlockChain(nx.research);
        }
        break;
      }
      case 'craft': {
        const plan = this.craftPlan(m.target);
        for (const r of plan.research) unlockChain(r);
        for (const st of plan.stations) addR(g.sys.buildings.cost(st));
        addR(plan.inputs);
        break;
      }
      case 'colonists':
      case 'recruit':
        if (g.sys.colonists.freeBeds() <= 0) return { res, rp, binding: 'beds' };
        addR({ food: 25 });
        break;
      case 'power':
        return { res, rp, binding: 'power' };
      case 'discover':
        return { res, rp, binding: g.sys.world.isUnlocked(m.target) ? 'travel' : 'locked' };
      case 'gather':
        addR({ [m.target]: Math.max(0, p.target - p.value) });
        break;
      default:
        return { res, rp, binding: m.type };
    }
    return { res, rp };
  }

  /**
   * What crafting a recipe takes, including the items it consumes that are not in the backpack yet (Robotic Core
   * -> Machine Parts ...): research to buy, station buildings to build, raw inputs.
   */
  craftPlan(id: string, out = { research: new Set<string>(), stations: new Set<string>(), inputs: {} as ResourceBag }, depth = 0): { research: Set<string>; stations: Set<string>; inputs: ResourceBag } {
    const g = this.game;
    const r = g.data.recipe(id);
    if (!r || depth > 3) return out;
    if (r.research && !g.sys.research.isDone(r.research)) out.research.add(r.research);
    if (r.station !== 'hand' && !g.sys.crafting.stations().includes(r.station)) {
      const def = g.data.buildings.find((d) => d.station === r.station);
      if (def) {
        out.stations.add(def.id);
        if (def.research && !g.sys.research.isDone(def.research)) out.research.add(def.research);
      }
    }
    for (const [k, v] of Object.entries(r.inputs)) out.inputs[k] = (out.inputs[k] ?? 0) + (v ?? 0);
    for (const [item, n] of Object.entries(r.itemInputs ?? {})) {
      const missing = n - (g.state.player.items[item] ?? 0);
      const sub = g.data.recipes.find((x) => x.outputs.items?.[item]);
      if (!sub) continue;
      for (let k = 0; k < missing; k++) this.craftPlan(sub.id, out, depth + 1);
    }
    return out;
  }

  private cheapestInCategory(cat: string): string | undefined {
    const g = this.game;
    let best: BuildingDef | undefined;
    let bv = Infinity;
    for (const d of g.data.buildings) {
      if (d.category !== cat || d.piece || d.cosmetic || !g.sys.buildings.isUnlocked(d.id)) continue;
      const v = this.value(g.sys.buildings.cost(d.id));
      if (v < bv) {
        bv = v;
        best = d;
      }
    }
    return best?.id;
  }

  // ---------------------------------------------------------------------- helpers

  value(bag: ResourceBag | undefined): number {
    const val = this.game.data.expeditionRules.value;
    let s = 0;
    for (const [k, v] of Object.entries(bag ?? {})) s += (v ?? 0) * (val[k] ?? 1);
    return s;
  }

  /** Can pay `bag` and still keep `keep` × the next goal's needs of each resource? (keep 0 = just affordable) */
  private canSpare(bag: ResourceBag | undefined, frac = 0.6): boolean {
    const eco = this.game.sys.economy;
    if (!eco.canAfford(bag)) return false;
    for (const [k, v] of Object.entries(bag ?? {})) if ((v ?? 0) > eco.amount(k) * frac + 1e-6) return false;
    return true;
  }

  private count(def: string): number {
    return this.game.sys.buildings.countOf(def);
  }

  private instances(def: string): BuildingInstance[] {
    return this.game.state.buildings.list.filter((b) => b.def === def);
  }

  private unlocked(def: string): boolean {
    const d = this.game.data.building(def);
    if (!d || d.piece || d.cosmetic) return false;
    if (!this.game.sys.buildings.isUnlocked(def)) return false;
    if (d.maxCount != null && this.count(def) >= d.maxCount) return false;
    return true;
  }

  private freeWorkers(): number {
    const st = this.game.state;
    return st.colonists.list.filter((c) => c.workplace == null && !c.away).length;
  }

  // ---------------------------------------------------------------------- research

  private doResearch(): boolean {
    const g = this.game;
    const R = g.sys.research;
    const M = PacingBot.MENU;
    const targets: string[] = [];
    const m = g.sys.missions.current();
    if (m?.type === 'research') targets.push(m.target);
    if (m && (m.type === 'build' || m.type === 'have_building')) {
      const r = g.data.building(m.target)?.research;
      if (r) targets.push(r);
    }
    if (m?.type === 'craft' && !g.sys.missions.progress(m.id).done) targets.push(...this.craftPlan(m.target).research);
    const nx = g.sys.progression.next();
    if (nx?.research && !nx.researchDone && !this.guided()) targets.push(nx.research);
    let gateStepCost = 0;
    for (const t of targets) {
      const step = R.nextStep(t);
      if (!step) continue;
      if (R.canResearch(step)) {
        R.research(step);
        this.stats.research++;
        this.acted(`research ${step}`, M.research);
        return true;
      }
      if (!gateStepCost) gateStepCost = g.data.researchDef(step)?.cost ?? 0;
    }
    if (this.guided()) return false;
    // filler: the cheapest available tech that does not delay the path above
    const avail = R.available().sort((a, b) => a.cost - b.cost);
    for (const d of avail) {
      if (!R.canResearch(d.id)) continue;
      const pts = g.state.research.points;
      if (gateStepCost && pts - d.cost < gateStepCost && d.cost > gateStepCost * 0.25) continue;
      if (d.resources && !this.canSpare(d.resources, 0.5)) continue;
      R.research(d.id);
      this.stats.research++;
      this.acted(`research ${d.id} (filler)`, M.research);
      return true;
    }
    return this.doMastery(gateStepCost);
  }

  /**
   * Mastery (sim/mastery.ts): what an engaged player does with a research backlog. The cheapest next level across the
   * open lines (levels spread evenly, a few quick taps per visit), only with the points left over after the whole
   * research chain to the next tier gate and the cheapest tech still open in the tree (new buildings come first).
   */
  private doMastery(gateStepCost: number): boolean {
    const g = this.game;
    const R = g.sys.research;
    if (!R.masteryOpen()) return false;
    let reserve = gateStepCost;
    const nx = g.sys.progression.next();
    if (nx?.research && !nx.researchDone) {
      let chain = 0;
      for (const r of this.researchChain(nx.research)) chain += g.data.researchDef(r)?.cost ?? 0;
      reserve = Math.max(reserve, chain);
    }
    let tree = Infinity;
    for (const d of R.available()) tree = Math.min(tree, d.cost);
    if (tree < Infinity) reserve += tree;
    let best: string | null = null;
    let bestCost = Infinity;
    for (const m of R.masteryInfo()) if (m.open && m.cost < bestCost) {
      best = m.line.id;
      bestCost = m.cost;
    }
    if (!best || g.state.research.points - bestCost < reserve || !R.master(best)) return false;
    this.stats.mastery++;
    this.acted(`mastery ${best} ${R.masteryLevel(best)}`, PacingBot.MENU.mastery);
    return true;
  }

  // ---------------------------------------------------------------------- colonists

  private doColonists(): boolean {
    const g = this.game;
    const C = g.sys.colonists;
    if (C.boardAvailable() && C.freeBeds() > 0 && this.wantColonist()) {
      const cands = g.state.colonists.candidates;
      // prefer a specialty somebody is missing, then the cheapest
      let pick = -1;
      let best = -Infinity;
      cands.forEach((cand, i) => {
        if (!C.canRecruit(i).ok) return;
        const food = g.sys.economy.amount('food');
        const cost = this.value(cand.cost);
        if ((cand.cost.food ?? 0) > food * 0.7) return;
        const score = cand.colonist.skill * 10 - cost * 0.05;
        if (score > best) {
          best = score;
          pick = i;
        }
      });
      if (pick >= 0 && C.recruit(pick)) {
        if (this.openRequiredSlots() <= this.freeWorkers()) this.lastOptionalHire = this.now();
        this.stats.recruits++;
        this.acted('recruit', PacingBot.MENU.recruit);
        C.autoAssign();
        return true;
      }
    }
    C.autoAssign();
    return false;
  }

  // ---------------------------------------------------------------------- crafting (gear, vehicles, mission items)

  private itemTier(id: string | undefined): number {
    if (!id) return -1;
    const d = this.game.data.item(id);
    return d ? d.tier + (d.stats?.toolTier ?? 0) * 0.01 : -1;
  }

  private doCrafting(): boolean {
    const g = this.game;
    const C = g.sys.crafting;
    const P = g.sys.player;
    const st = g.state;
    if (st.crafting.queue.length >= 3) return false;
    // equip the best owned item per slot
    for (const slot of SLOTS) {
      let best = st.player.equip[slot];
      for (const [id, n] of Object.entries(st.player.items)) {
        if (n <= 0) continue;
        const d = g.data.item(id);
        if (d?.slot !== slot) continue;
        if (this.itemTier(id) > this.itemTier(best)) best = id;
      }
      if (best && best !== st.player.equip[slot] && P.equip(best)) {
        this.acted(`equip ${best}`, PacingBot.MENU.claim * 2);
        return true;
      }
    }
    // mission craft target
    const m = g.sys.missions.current();
    if (m?.type === 'craft' && !g.sys.missions.progress(m.id).done && !st.crafting.queue.some((j) => j.recipe === m.target)) {
      if (this.tryCraft(m.target, 1.0)) return true;
    }
    if (this.guided()) return false;
    // side chain steps a player follows from the Missions panel (the Crafting Table chain: craft a Stone Axe, equip it)
    for (const sm of g.sys.missions.activeByChain('side')) {
      if (g.sys.missions.progress(sm.id).done) continue;
      if (sm.type === 'craft' && !st.crafting.queue.some((j) => j.recipe === sm.target) && this.tryCraft(sm.target, 0.35)) return true;
      if (sm.type === 'equip' && (st.player.items[sm.target] ?? 0) > 0) {
        const slot = g.data.item(sm.target)?.slot as (typeof SLOTS)[number] | undefined;
        const cur = slot ? st.player.equip[slot] : undefined;
        if (slot && cur !== sm.target && !betterItem(g.data, cur, sm.target) && P.equip(sm.target)) {
          this.acted(`equip ${sm.target} (side)`, PacingBot.MENU.claim * 2);
          return true;
        }
      }
    }
    // mission equip target (side) and gear upgrades
    const want: RecipeDef[] = [];
    for (const r of C.recipes()) {
      const out = r.outputs.items ? Object.keys(r.outputs.items)[0] : undefined;
      if (r.outputs.vehicle) {
        if (!st.player.vehicles.includes(r.outputs.vehicle)) want.push(r);
        continue;
      }
      if (!out) continue;
      const d = g.data.item(out);
      if (!d?.slot || !SLOTS.includes(d.slot as (typeof SLOTS)[number])) continue;
      const have = Object.entries(st.player.items).some(([id, n]) => n > 0 && g.data.item(id)?.slot === d.slot && this.itemTier(id) >= this.itemTier(out));
      if (!have) want.push(r);
    }
    want.sort((a, b) => this.value(a.inputs) - this.value(b.inputs));
    for (const r of want) {
      if (st.crafting.queue.some((j) => j.recipe === r.id)) continue;
      if (this.tryCraft(r.id, 0.45)) return true;
    }
    // gear needs a station that is not built yet (the Crafting Table has no mission pointing at it): a curious
    // player finds it in the build menu
    for (const r of want) {
      for (const station of this.craftPlan(r.id).stations) {
        if (this.unlocked(station) && this.pendingOf(station) === 0 && this.buy(station, 0.3, `station for ${r.id}`)) return true;
      }
    }
    return false;
  }

  /** Craft a recipe (and its missing item inputs first) if the inputs are spare. */
  private tryCraft(id: string, frac: number, depth = 0): boolean {
    const g = this.game;
    const C = g.sys.crafting;
    const r = g.data.recipe(id);
    if (!r || depth > 2) return false;
    if (!C.isUnlocked(r)) return false;
    for (const [item, n] of Object.entries(r.itemInputs ?? {})) {
      if ((g.state.player.items[item] ?? 0) >= n) continue;
      if (g.state.crafting.queue.some((j) => g.data.recipe(j.recipe)?.outputs.items?.[item])) return false;
      const sub = g.data.recipes.find((x) => x.outputs.items?.[item]);
      if (sub) return this.tryCraft(sub.id, frac, depth + 1);
      return false;
    }
    if (!this.canSpare(r.inputs, frac)) return false;
    if (!C.canCraft(id).ok) return false;
    if (C.craft(id) != null) {
      this.stats.crafts++;
      this.acted(`craft ${id}`, PacingBot.MENU.craft);
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------- wishes

  private doWishes(): boolean {
    const g = this.game;
    const W = g.sys.wishes;
    for (const w of W.open()) {
      const d = W.def(w);
      if (!d) continue;
      if (d.kind === 'give') {
        if (W.refusal(w) == null && g.sys.economy.amount(d.target) >= w.need * 2 && W.give(w.id)) {
          this.stats.wishes++;
          this.acted(`wish give ${d.target}`, PacingBot.MENU.wish);
          return true;
        }
      } else if (d.kind === 'build') {
        if (w.done < w.need && this.pendingOf(d.target) === 0 && this.unlocked(d.target) && this.canSpare(g.sys.buildings.cost(d.target), 0.5) && this.placeNear(d.target)) {
          this.acted(`wish build ${d.target}`, PacingBot.MENU.build);
          return true;
        }
      } else if (d.kind === 'craft') {
        if (!g.state.crafting.queue.some((j) => j.recipe === d.target) && this.tryCraft(d.target, 0.5)) return true;
      }
    }
    return false;
  }

  /** Buildings of a def still under construction. */
  pendingOf(def: string): number {
    let n = 0;
    for (const b of this.game.state.buildings.list) if (b.def === def && b.status === 'building') n++;
    return n;
  }

  /** Any building matching `pred` still under construction (its effect is not in the rates yet). */
  private anyPending(pred: (d: BuildingDef) => boolean): boolean {
    const g = this.game;
    for (const b of g.state.buildings.list) {
      if (b.status !== 'building') continue;
      const d = g.data.building(b.def);
      if (d && pred(d)) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------- expeditions

  private doExpeditions(): boolean {
    const g = this.game;
    const E = g.sys.expeditions;
    if (!E.unlocked() || E.freeSlots() <= 0) return false;
    if (g.state.combat.phase === 'attack') return false;
    const horizon = this.sessionLeft + this.nextGap; // back by the next check-in
    let bestId: string | null = null;
    let bestScore = -Infinity;
    const home = E.candidates().filter((c) => !E.isAway(c.id));
    if (home.length < 4) return false; // keep the colony running
    const squad = this.pickSquad(home);
    const vehicle = this.spareVehicle();
    const consider = (id: string, seconds: number, tierBonus: number) => {
      if (seconds > horizon + 60) return;
      const plan = E.preview(id, squad, vehicle);
      if (!plan) return;
      // longest trip that fits, newest region first
      const score = seconds + tierBonus * 600;
      if (score > bestScore) {
        bestScore = score;
        bestId = id;
      }
    };
    for (const ds of E.destinations()) if (ds.ok) consider(ds.def.id, ds.def.duration, ds.def.tier);
    for (const s of E.frontierSites()) consider(s.id, s.duration, 7);
    if (bestId && E.canLaunch(bestId, squad, vehicle) == null && E.launch(bestId, squad, vehicle)) {
      this.stats.expeditions++;
      this.acted(`expedition ${bestId}`, PacingBot.MENU.expedition);
      return true;
    }
    return false;
  }

  private pickSquad(home: Colonist[]): number[] {
    // jobless first, then optional-slot workers (machines keep running), never sole required workers
    const g = this.game;
    const scored = home.map((c) => {
      let s = 0;
      if (c.workplace == null) s = 3;
      else {
        const b = g.sys.buildings.get(c.workplace);
        const w = b ? g.data.building(b.def)?.workers : undefined;
        s = w && !w.required ? 2 : 0;
      }
      return { c, s };
    });
    scored.sort((a, b) => b.s - a.s || a.c.skill - b.c.skill);
    return scored.slice(0, Math.min(3, Math.max(1, home.length - 3))).map((x) => x.c.id);
  }

  private spareVehicle(): string | null {
    const g = this.game;
    const riding = g.state.player.vehicle;
    const free = g.sys.expeditions.vehicles().filter((v) => v.id !== riding);
    free.sort((a, b) => (b.storage ?? 0) - (a.storage ?? 0));
    return free[0]?.id ?? null;
  }

  // ---------------------------------------------------------------------- Nova

  private doNova(): boolean {
    if (this.opts.nova !== 'spend') return false;
    const g = this.game;
    const nova = g.sys.liveops.nova();
    const boostLeft = g.sys.liveops.boostSecondsLeft('production');
    // a 4-hour production boost right before a long break, else an hour of it while playing
    if (this.sessionLeft < 60 && this.nextGap >= 3 * 3600 && nova >= 250 && boostLeft < 600) {
      if (buyNovaItem(g, 'nova_production_4h').ok) {
        this.stats.novaSpent += 250;
        this.acted('nova 4h boost', PacingBot.MENU.nova);
        return true;
      }
    } else if (this.sessionLeft > 20 * 60 && nova >= 160 && boostLeft <= 0) {
      if (buyNovaItem(g, 'nova_production_1h').ok) {
        this.stats.novaSpent += 80;
        this.acted('nova 1h boost', PacingBot.MENU.nova);
        return true;
      }
    }
    return false;
  }

  // ====================================================================== building

  /** One build/upgrade action; returns true when something was bought. */
  private doBuild(): boolean {
    const g = this.game;
    const st = g.state;
    if (st.combat.phase === 'attack') return false;
    const m = g.sys.missions.current();
    // 1. main mission
    if (m && !g.sys.missions.progress(m.id).done) {
      if (m.type === 'build' || m.type === 'have_building') {
        const t = m.target.startsWith('category:') ? this.cheapestInCategory(m.target.slice(9)) : m.target;
        const p = g.sys.missions.progress(m.id);
        if (t && this.unlocked(t) && this.pendingOf(t) < p.target - p.value && this.buy(t, 1.0, 'mission', true)) return true;
      }
      if (m.type === 'craft') {
        for (const st of this.craftPlan(m.target).stations) if (this.unlocked(st) && this.pendingOf(st) === 0 && this.buy(st, 1.0, 'mission station', true)) return true;
      }
      if (m.type === 'power' && !this.anyPending((d) => (d.power ?? 0) > 0)) {
        if (this.buildPower(1.0)) return true;
      }
    }
    if (this.guided()) return false;
    // 2. side missions that are cheap
    for (const sm of g.sys.missions.activeByChain('side')) {
      const p = g.sys.missions.progress(sm.id);
      if (p.done) continue;
      if (sm.type !== 'build' && sm.type !== 'have_building') continue;
      const t = sm.target.startsWith('category:') ? this.cheapestInCategory(sm.target.slice(9)) : sm.target;
      if (!t || this.pendingOf(t) >= p.target - p.value) continue;
      if (this.unlocked(t) && this.canSpare(g.sys.buildings.cost(t), 0.35) && this.buy(t, 0.35, 'side', true)) return true;
    }
    // 3. needs
    for (const need of this.needs()) if (need()) return true;
    return false;
  }

  private needs(): (() => boolean)[] {
    return [
      () => this.fixIdle(),
      () => this.needHousing(),
      () => this.needFoodWater('food'),
      () => this.needFoodWater('water'),
      () => this.needPower(),
      () => this.needStorage(),
      () => this.needResearch(),
      () => this.needDefense(),
      () => this.needComfort(),
      () => this.needProduction(),
      () => this.needUpgrades(),
    ];
  }

  /** Idle buildings: no power -> generator, no inputs -> producer of the input. */
  private fixIdle(): boolean {
    const g = this.game;
    const eco = g.sys.economy;
    let noPower = false;
    const starved = new Map<string, number>();
    for (const b of g.state.buildings.list) {
      const e = eco.buildingEconomy(b.id);
      if (!e) continue;
      if (e.idle === 'no_power' || e.idle === 'low_power') noPower = true;
      if (e.idle === 'no_inputs') {
        const d = g.data.building(b.def);
        for (const k of Object.keys(d?.consumes ?? {})) {
          if (eco.amount(k) < (d!.consumes![k] ?? 0) * 2) starved.set(k, (starved.get(k) ?? 0) + (d!.consumes![k] ?? 0));
        }
      }
    }
    if (noPower && this.buildPower(0.8)) return true;
    for (const [res] of [...starved].sort((a, b) => b[1] - a[1])) if (this.buildProducer(res, 0.8)) return true;
    return false;
  }

  /**
   * A reasonable player recruits to staff the colony: when a workplace has an empty slot nobody idle can fill, or a
   * mission asks for more colonists. (Nothing in the game itself limits growth beyond beds and food.)
   */
  wantColonist(): boolean {
    const g = this.game;
    const m = g.sys.missions.current();
    if (m && (m.type === 'colonists' || m.type === 'recruit') && !g.sys.missions.progress(m.id).done) return true;
    for (const sm of g.sys.missions.activeByChain('side')) {
      if (sm.type === 'colonists' && !g.sys.missions.progress(sm.id).done && g.sys.missions.progress(sm.id).target - g.state.colonists.list.length <= 4) return true;
    }
    if (this.opts.pace === 'fast') return this.openSlots() > this.freeWorkers();
    // idle workplaces (a required slot nobody fills) always; optional slots now and then
    if (this.openRequiredSlots() > this.freeWorkers()) return true;
    return this.openSlots() > this.freeWorkers() && this.now() - this.lastOptionalHire > 300;
  }

  /** Empty worker slots in finished buildings (required and optional). */
  private openSlots(): number {
    const g = this.game;
    let n = 0;
    for (const b of g.state.buildings.list) {
      const w = g.data.building(b.def)?.workers;
      if (w && b.status !== 'building') n += Math.max(0, w.slots - b.workers.length);
    }
    return n;
  }

  private needHousing(): boolean {
    const g = this.game;
    const C = g.sys.colonists;
    if (!C.boardAvailable() && g.state.colonists.list.length > 0) return false;
    if (C.freeBeds() > 0 || !this.wantColonist()) return false;
    if ((g.derived.netPerMin.food ?? 0) < 0.5 && g.sys.economy.amount('food') < 60) return false;
    if (this.anyPending((d) => (d.housing ?? 0) > 0)) return false;
    const best = this.bestBy((d) => (d.housing ?? 0) > 0, (d) => d.housing ?? 0);
    if (!best) return false;
    return this.buyOrLevel(best, (d) => d.housing ?? 0, 0.8, 'housing');
  }

  private openRequiredSlots(): number {
    const g = this.game;
    let n = 0;
    for (const b of g.state.buildings.list) {
      const w = g.data.building(b.def)?.workers;
      if (w?.required && b.status !== 'building') n += Math.max(0, w.slots - b.workers.length);
    }
    return n;
  }

  private needFoodWater(res: 'food' | 'water'): boolean {
    const g = this.game;
    const net = g.derived.netPerMin[res] ?? 0;
    const n = g.state.colonists.list.length;
    const target = 1.5 + n * 0.6 + (res === 'food' ? 3 : 1);
    if (net >= target) return false;
    if (this.anyPending((d) => (d.produces?.[res] ?? 0) > 0)) return false;
    return this.buildProducer(res, 0.8);
  }

  private needPower(): boolean {
    const p = this.game.derived.power;
    if (p.consumed <= 0) return false;
    if (p.produced >= p.consumed * 1.25 + 10) return false;
    if (this.anyPending((d) => (d.power ?? 0) > 0)) return false;
    return this.buildPower(0.8);
  }

  private buildPower(frac: number): boolean {
    const best = this.bestBy((d) => (d.power ?? 0) > 0 && !d.consumes, (d) => d.power ?? 0) ?? this.bestBy((d) => (d.power ?? 0) > 0, (d) => d.power ?? 0);
    if (!best) return false;
    return this.buyOrLevel(best, (d) => d.power ?? 0, frac, 'power');
  }

  /** Storage when the next goal needs more than fits, or a produced resource sits at its cap. */
  private needStorage(): boolean {
    const g = this.game;
    const eco = g.sys.economy;
    const want = new Map<string, number>();
    for (const gl of [this.goal, this.prodGoal]) if (gl.binding.startsWith('capacity:')) want.set(gl.binding.slice(9), 1e9);
    for (const r of g.data.resources) {
      const cap = eco.capacity(r.id);
      if (cap <= 0) continue;
      // production is being wasted at the cap (an offline overflow above the cap is not fixed by one more crate)
      const amt = eco.amount(r.id);
      if ((g.derived.producePerMin[r.id] ?? 0) > 0 && amt >= cap * 0.97 && amt <= cap * 1.15 && this.now() - (this.storageAt.get(r.id) ?? -1e9) > 600) {
        want.set(r.id, Math.max(want.get(r.id) ?? 0, cap));
      }
    }
    for (const res of [...want.keys()].sort((a, b) => (want.get(b) ?? 0) - (want.get(a) ?? 0))) {
      if (this.anyPending((d) => (d.storage?.[res] ?? 0) > 0)) continue;
      const best = this.bestBy((d) => (d.storage?.[res] ?? 0) > 0, (d) => d.storage?.[res] ?? 0);
      if (best && this.buyOrLevel(best, (d) => d.storage?.[res] ?? 0, 0.7, `storage ${res}`)) {
        this.storageAt.set(res, this.now());
        return true;
      }
    }
    return false;
  }

  private needResearch(): boolean {
    const g = this.game;
    const tier = g.state.colony.tier;
    const perMin = g.derived.research.perMin;
    const nx = g.sys.progression.next();
    let gate = 0;
    if (nx?.research && !nx.researchDone) for (const r of this.researchChain(nx.research)) gate += g.data.researchDef(r)!.cost;
    // aim for the gate chain within ~40 min of research, and at least some research every tier
    const wantRate = Math.max(2 + tier * 6, gate / 40);
    if (perMin >= wantRate) return false;
    if (this.anyPending((d) => (d.research_rate ?? 0) > 0)) return false;
    const best = this.bestBy((d) => (d.research_rate ?? 0) > 0 && !d.core, (d) => d.research_rate ?? 0);
    if (!best) return false;
    return this.buyOrLevel(best, (d) => d.research_rate ?? 0, 0.7, 'research');
  }

  private needDefense(): boolean {
    const g = this.game;
    const tier = g.state.colony.tier;
    const turrets = g.state.buildings.list.filter((b) => g.data.building(b.def)?.turret);
    const want = DEFENSE_COUNT[tier] ?? 13;
    const best = this.bestBy((d) => !!d.turret && !d.turret.manual, (d) => {
      const t = d.turret!;
      return t.damage * t.fireRate * (1 + (t.splash ?? 0)) * (t.antiAir ? 1.2 : 1) * (d.workers?.required ? 0.5 : 1);
    }) ?? this.bestBy((d) => !!d.turret, (d) => d.turret!.damage * d.turret!.fireRate);
    if (!best) return false;
    if (turrets.length < want + this.defenseExtra) return this.buy(best.id, 0.6, 'defense');
    // after a raid that hurt, also level up the turrets
    if (this.defenseExtra > 0) {
      const B = g.sys.buildings;
      const weak = turrets.filter((b) => b.status === 'active' && B.levelUpCost(b.id)).sort((a, b) => a.level - b.level || g.data.building(b.def)!.unlockTier - g.data.building(a.def)!.unlockTier);
      for (const b of weak.slice(0, 3)) {
        const c = B.levelUpCost(b.id)!;
        if (this.canSpare(c, 0.5) && B.levelUp(b.id)) {
          this.stats.upgrades++;
          this.acted(`level up turret ${b.def} -> ${b.level}`, PacingBot.MENU.level);
          return true;
        }
      }
    }
    return false;
  }

  private needComfort(): boolean {
    const g = this.game;
    const n = g.state.colonists.list.length;
    if (n < 2) return false;
    if (g.derived.happiness.average >= 72) return false;
    const best = this.bestBy((d) => d.category === 'decor' && !d.cosmetic && ((d.comfort ?? 0) + (d.entertainment ?? 0)) > 0, (d) => (d.comfort ?? 0) + (d.entertainment ?? 0));
    if (!best) return false;
    return this.buy(best.id, 0.3, 'comfort');
  }

  /** Producer for the resource that binds the next goal (or the next tier's cost). */
  private needProduction(): boolean {
    const b = this.prodGoal.binding;
    if (b === 'rp') return this.needResearchMore();
    if (b === 'none' || b.startsWith('capacity:') || !this.game.data.resource(b)) return false;
    if (this.prodGoal.eta < 3) return false;
    if (this.anyPending((d) => (d.produces?.[b] ?? 0) > 0)) return false;
    return this.buildProducer(b, 0.7);
  }

  private needResearchMore(): boolean {
    if (this.anyPending((d) => (d.research_rate ?? 0) > 0)) return false;
    const best = this.bestBy((d) => (d.research_rate ?? 0) > 0 && !d.core, (d) => d.research_rate ?? 0);
    if (!best) return false;
    return this.buyOrLevel(best, (d) => d.research_rate ?? 0, 0.7, 'research+');
  }

  /** Level up producers / storage / turrets with genuine surplus. */
  private needUpgrades(): boolean {
    const g = this.game;
    const B = g.sys.buildings;
    const list = g.state.buildings.list.filter((b) => {
      const d = g.data.building(b.def);
      return d && !d.piece && !d.core && b.status === 'active' && b.level < d.maxLevel && (d.produces || d.research_rate || d.turret || d.power);
    });
    list.sort((a, b) => a.level - b.level);
    for (const b of list) {
      const cost = B.levelUpCost(b.id);
      if (!cost || !this.canSpare(cost, 0.25)) continue;
      // several of a kind: "Upgrade all" levels them in one go when the whole bill is spare too
      const all = upgradeAllPlan(g, b.def);
      if (all.ids.length > 1 && all.affordable.length === all.ids.length && this.canSpare(all.total, 0.25)) {
        const n = upgradeAll(g, b.def);
        if (n > 0) {
          this.stats.upgrades += n;
          this.acted(`upgrade all ${b.def} x${n}`, PacingBot.MENU.level + 2);
          return true;
        }
      }
      if (B.levelUp(b.id)) {
        this.stats.upgrades++;
        this.acted(`level up ${b.def} -> ${b.level}`, PacingBot.MENU.level);
        return true;
      }
    }
    return false;
  }

  /** Best unlocked def by `gain / cost value` among those matching `pred`. */
  private bestBy(pred: (d: BuildingDef) => boolean, gain: (d: BuildingDef) => number): BuildingDef | null {
    const g = this.game;
    let best: BuildingDef | null = null;
    let bs = -Infinity;
    const free = this.freeWorkers();
    for (const d of g.data.buildings) {
      if (!pred(d) || !this.unlocked(d.id)) continue;
      let gv = gain(d);
      if (gv <= 0) continue;
      if (d.workers?.required && free < d.workers.slots) gv *= 0.5;
      const s = gv / Math.max(1, this.value(g.sys.buildings.cost(d.id)));
      // the newest tier's buildings are worth a little more (bigger footprint per gain, fewer pieces to manage)
      const score = s * (1 + 0.15 * d.unlockTier);
      if (score > bs) {
        bs = score;
        best = d;
      }
    }
    return best;
  }

  /** Build a new `def`, or level up an existing one when that is the better deal. */
  private buyOrLevel(def: BuildingDef, gain: (d: BuildingDef) => number, frac: number, why: string): boolean {
    const g = this.game;
    const B = g.sys.buildings;
    const newCost = this.value(B.cost(def.id));
    let lvl: BuildingInstance | null = null;
    let lvlScore = 0;
    for (const b of this.instances(def.id)) {
      if (b.status !== 'active') continue;
      const c = B.levelUpCost(b.id);
      if (!c) continue;
      const s = (gain(def) * (def.levelEffect ?? 0)) / Math.max(1, this.value(c));
      if (s > lvlScore) {
        lvlScore = s;
        lvl = b;
      }
    }
    const newScore = (gain(def) * (def.workers?.required && this.freeWorkers() < def.workers.slots ? 0.5 : 1)) / Math.max(1, newCost);
    if (lvl && lvlScore >= newScore) {
      const c = B.levelUpCost(lvl.id)!;
      if (!this.canSpare(c, frac)) return false;
      if (B.levelUp(lvl.id)) {
        this.stats.upgrades++;
        this.acted(`level up ${def.id} -> ${lvl.level} (${why})`, PacingBot.MENU.level);
        return true;
      }
      return false;
    }
    return this.buy(def.id, frac, why);
  }

  private buildProducer(res: string, frac: number): boolean {
    const best = this.bestBy((d) => (d.produces?.[res] ?? 0) > 0 && !(d.consumes?.[res]), (d) => {
      const own = d.produces![res] ?? 0;
      // converters only help if their inputs are flowing
      let ok = 1;
      for (const k of Object.keys(d.consumes ?? {})) if ((this.game.derived.netPerMin[k] ?? 0) <= 0 && this.game.sys.economy.amount(k) < 50) ok = 0.3;
      if ((d.power ?? 0) < 0) {
        const p = this.game.derived.power;
        if (p.produced - p.consumed < -(d.power ?? 0)) ok *= 0.6;
      }
      return own * ok;
    });
    if (!best) return false;
    return this.buyOrLevel(best, (d) => d.produces?.[res] ?? 0, frac, `prod ${res}`);
  }

  private buy(def: string, frac: number, why: string, parallel = false): boolean {
    const g = this.game;
    if (!parallel && this.pendingOf(def) > 0) return false;
    if (!parallel && this.opts.pace === 'human' && this.now() - (this.lastBuilt.get(def) ?? -1e9) < 120) return false;
    const cost = g.sys.buildings.cost(def);
    if (!this.canSpare(cost, frac)) return false;
    if (this.placeNear(def)) {
      this.lastBuilt.set(def, this.now());
      this.acted(`build ${def} (${why})`, PacingBot.MENU.build);
      return true;
    }
    return false;
  }

  /** Place a building on the first good spot spiralling out from the core (turrets: on a ring). */
  placeNear(def: string): boolean {
    const g = this.game;
    const B = g.sys.buildings;
    const d = g.data.building(def);
    if (!d) return false;
    const spot = d.turret || d.trap ? this.ringSpot(d) : this.spot(d);
    if (!spot) return false;
    const id = B.place(def, spot.x, spot.z, spot.rot);
    if (id == null) return false;
    this.stats.builds++;
    return true;
  }

  private padOk(x: number, z: number, w: number, h: number): boolean {
    const B = this.game.sys.buildings;
    for (let cz = z - 1; cz <= z + h; cz++) {
      for (let cx = x - 1; cx <= x + w; cx++) {
        if (cx >= x && cx < x + w && cz >= z && cz < z + h) continue;
        if (B.at(cx, cz)) return false;
      }
    }
    return true;
  }

  private spot(d: BuildingDef): { x: number; z: number; rot: 0 } | null {
    const B = this.game.sys.buildings;
    const R = this.game.state.colony.radius;
    const [w, h] = rotatedSize(d.size, 0);
    const c = B.colonyCenter();
    const ccx = cellOf(c.x);
    const ccz = cellOf(c.z);
    for (let r = 4; r <= R; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          // leave a cross-shaped street from the core free for walking
          if (Math.abs(dx) <= 1 || Math.abs(dz) <= 1) continue;
          const x = ccx + dx;
          const z = ccz + dz;
          if (!B.canPlace(d.id, x, z, 0).ok) continue;
          if (!this.padOk(x, z, w, h)) continue;
          return { x, z, rot: 0 };
        }
      }
    }
    return null;
  }

  private ringSpot(d: BuildingDef): { x: number; z: number; rot: 0 } | null {
    const g = this.game;
    const B = g.sys.buildings;
    const R = g.state.colony.radius;
    const c = B.colonyCenter();
    const turrets = g.state.buildings.list.filter((b) => g.data.building(b.def)?.turret);
    const n = turrets.length;
    const ring = Math.max(5, Math.round(R * 0.7));
    // golden-angle spread so turrets cover every side
    for (let k = 0; k < 64; k++) {
      const a = (n + k) * 2.399963;
      for (const rr of [ring, ring - 2, ring + 2, ring - 4]) {
        const x = cellOf(c.x + Math.cos(a) * rr * CELL);
        const z = cellOf(c.z + Math.sin(a) * rr * CELL);
        const [w, h] = rotatedSize(d.size, 0);
        if (B.canPlace(d.id, x, z, 0).ok && this.padOk(x, z, w, h)) return { x, z, rot: 0 };
      }
    }
    return this.spot(d);
  }

  // ====================================================================== movement

  private doMovement(): void {
    const g = this.game;
    const st = g.state;
    const P = g.sys.player;
    // best vehicle for getting around
    const ride = [...st.player.vehicles].filter((v) => !g.sys.expeditions.vehicleAway(v)).sort((a, b) => (g.data.vehicle(b)?.speed ?? 0) - (g.data.vehicle(a)?.speed ?? 0))[0];
    if (ride && st.player.vehicle !== ride) P.mount(ride);

    // combat: be at the defenses
    const c = st.combat;
    if (c.phase === 'attack' || (c.phase === 'warning' && c.nextAt - st.playTime < 30)) {
      if (this.task?.kind !== 'goto' || this.task.why !== 'defend') {
        const manual = st.buildings.list.find((b) => g.data.building(b.def)?.turret?.manual);
        const at = manual ? g.sys.buildings.center(manual) : g.sys.world.coreCenter();
        this.setTask({ kind: 'goto', x: at.x + 2.5, z: at.z + 2.5, why: 'defend' }, 3);
      }
      return;
    }
    if (this.task?.kind === 'goto' && this.task.why === 'defend') this.task = null;

    // a full backpack goes home first
    if (!P.inColony() && P.carried() >= P.capacity() - 2 && this.depositable() >= P.carried() * 0.25) {
      if (this.task?.kind !== 'goto' || this.task.why !== 'deposit') {
        const core = g.sys.world.coreCenter();
        this.setTask({ kind: 'goto', x: core.x + 6, z: core.z + 6, why: 'deposit' }, 4);
      }
      return;
    }
    if (this.task && this.task.kind !== 'gather') return; // let travel finish

    // the mission needs us somewhere
    const m = g.sys.missions.current();
    if (m && !g.sys.missions.progress(m.id).done) {
      if (m.type === 'discover' && g.sys.world.isUnlocked(m.target) && !g.sys.world.isDiscovered(m.target)) {
        if (this.goDiscover(m.target)) return;
      }
      if (m.type === 'rescue') {
        const guide = g.sys.tutorial.guide();
        const camp = g.sys.world.gen.pois.find((p) => g.data.poi(p.def)?.kind === 'camp' && !st.world.pois[p.id]?.looted && g.sys.world.isUnlocked(p.region));
        if (camp) {
          this.setTask({ kind: 'poi', id: camp.id, why: 'mission' }, 3.5);
          return;
        }
        if (guide?.world) {
          this.setTask({ kind: 'goto', x: guide.world.x, z: guide.world.z, why: 'home' }, 2);
          return;
        }
      }
    }
    // chat wishes
    for (const w of g.sys.wishes.open()) {
      if (g.sys.wishes.def(w)?.kind !== 'chat') continue;
      const col = g.sys.colonists.get(w.colonist);
      if (col && !col.away && col.activity !== 'sheltering') {
        this.setTask({ kind: 'chat', colonist: col.id }, 3);
        return;
      }
    }
    // world events (supply pods, merchants, meteors...) close enough
    const p = st.player;
    for (const ev of st.world.events) {
      if (ev.claimed || ev.endsAt <= st.playTime) continue;
      const def = g.data.worldEvent(ev.def);
      if (!def || def.kind === 'storm') continue;
      if (Math.hypot(ev.x - p.x, ev.z - p.z) > 160) continue;
      this.setTask({ kind: 'event', id: ev.id }, 4);
      return;
    }
    // walk out now and then: restocked caches, unopened ruins, uncharted ground
    if (this.doExcursion()) return;
    // gather what the goal lacks
    const goalRes = this.gatherTarget();
    if (goalRes) {
      if (this.task?.kind === 'gather' && this.task.res === goalRes && !g.sys.world.isDepleted(this.task.node)) return;
      if (this.startGather(goalRes, true)) return;
    }
    // explore a point of interest (loot, survivors, beacons) within reach
    if (this.task?.kind === 'gather' && !this.task.goal && !g.sys.world.isDepleted(this.task.node)) return;
    if (this.guided()) {
      const filler = this.fillerResource();
      if (filler) this.startGather(filler, false);
      return;
    }
    const poi = this.nextPoi();
    if (poi) {
      this.setTask({ kind: 'poi', id: poi, why: 'explore' }, 3.5);
      return;
    }
    // undiscovered unlocked regions
    for (const id of st.world.regionsUnlocked) if (!st.world.regionsDiscovered.includes(id) && this.goDiscover(id)) return;
    // top up basics
    const filler = this.fillerResource();
    if (filler) this.startGather(filler, false);
  }

  /**
   * An excursion (see the class comment, step 7). Returns true while it has the hero walking somewhere.
   */
  private doExcursion(): boolean {
    const g = this.game;
    const st = g.state;
    const P = g.sys.player;
    if (!this.excursion) return false;
    const end = () => {
      this.endExcursion();
      return false;
    };
    if (this.exploreBudget <= 0) return end();
    const t0 = this.task;
    if (t0 && ((t0.kind === 'poi' && t0.why === 'explore') || (t0.kind === 'goto' && t0.why === 'survey')) && this.mover.active) return true;
    const p = st.player;
    const key = (t: { poi?: string; x: number; z: number }) => t.poi ?? `goto:${t.x | 0},${t.z | 0}`;
    const t = g.sys.survey.suggest(p.x, p.z, EXPLORE_RANGE, undefined, (c) => (this.banned.get(key(c)) ?? 0) > this.now() || (c.kind === 'signal' && !!c.poi && g.data.poi(g.sys.world.poi(c.poi)?.def ?? '')?.kind === 'nest' && st.colony.tier < 3));
    if (!t) return end();
    // a beacon much closer to the target: hop there first
    if (t.dist > 150) {
      let best: { id: string; d: number } | null = null;
      for (const f of g.sys.world.fastTravelTargets()) {
        const d = Math.hypot(f.x - t.x, f.z - t.z);
        if (d < t.dist - 90 && (!best || d < best.d)) best = { id: f.id, d };
      }
      if (best && P.fastTravel(best.id)) {
        this.acted(`fast travel ${best.id}`, 3);
        return true;
      }
    }
    if (t.poi) this.setTask({ kind: 'poi', id: t.poi, why: 'explore' }, 3.5);
    else this.setTask({ kind: 'goto', x: t.x, z: t.z, why: 'survey' }, 4);
    if (!this.task) {
      // unreachable: try something else next time
      this.banned.set(key(t), this.now() + 600);
      return false;
    }
    return true;
  }

  /** Set out on an excursion when enough walking time is saved up, or right after opening the app (caches restock). */
  private maybeSetOut(): void {
    if (this.guided() || this.now() < this.excursionCooldown) return;
    const opening = this.now() - this.sessionStartT < 90 && this.exploreBudget >= 40;
    if (!opening && this.exploreBudget < EXPLORE_START) return;
    const p = this.game.state.player;
    if (!this.game.sys.survey.suggest(p.x, p.z, EXPLORE_RANGE)) {
      this.excursionCooldown = this.now() + 120;
      return;
    }
    this.excursion = true;
    this.stats.excursions++;
    if (this.log.length < 4000) this.log.push(`${(this.now() / 60).toFixed(1)}m excursion (${Math.round(this.exploreBudget)} s)`);
  }

  /** Back from an excursion: hop home when far out (the menus are waiting). */
  private endExcursion(): void {
    const g = this.game;
    this.excursion = false;
    this.excursionCooldown = this.now() + 30;
    if (this.task && ((this.task.kind === 'poi' && this.task.why === 'explore') || (this.task.kind === 'goto' && this.task.why === 'survey'))) {
      this.task = null;
      this.mover.clear();
    }
    const p = g.state.player;
    const core = g.sys.world.coreCenter();
    if (Math.hypot(p.x - core.x, p.z - core.z) > 120 && !g.sys.player.isDown() && g.sys.player.fastTravel('base')) this.acted('fast travel home');
  }

  /** How much of the backpack colony storage could take right now (a full colony can't be "unloaded" into). */
  private depositable(): number {
    const g = this.game;
    let n = 0;
    for (const [k, v] of Object.entries(g.state.player.backpack)) n += Math.min(v, g.sys.economy.freeCapacity(k));
    return n;
  }

  /** Hand-gatherable resource the next goal is missing (the binding one first). */
  private gatherTarget(): string | null {
    const g = this.game;
    const eco = g.sys.economy;
    const b = this.goal.binding;
    const cands: string[] = [];
    if (g.data.resource(b)) cands.push(b);
    // anything else missing for the current mission/tier
    const m = g.sys.missions.current();
    if (m?.type === 'gather' && !g.sys.missions.progress(m.id).done) cands.unshift(m.target);
    const c = m ? this.missionCost(m) : null;
    for (const k of Object.keys(c?.res ?? {})) if (eco.amount(k) < (c!.res[k] ?? 0)) cands.push(k);
    const nx = g.sys.progression.next();
    for (const k of Object.keys(nx?.cost ?? {})) if (eco.amount(k) < (nx!.cost[k] ?? 0)) cands.push(k);
    for (const r of cands) {
      if (r === 'food' || r === 'water') continue;
      if (eco.isFull(r)) continue;
      if (this.handSource(r)) return r;
    }
    return null;
  }

  private handSource(res: string): boolean {
    const g = this.game;
    const tier = g.sys.player.toolTier();
    return g.data.nodes.some((n) => (n.drop[res] ?? 0) > 0 && n.toolTier <= tier);
  }

  private fillerResource(): string | null {
    const g = this.game;
    const eco = g.sys.economy;
    let best: string | null = null;
    let bf = 0.9;
    for (const r of ['wood', 'stone', 'fiber', 'iron', 'copper', 'coal', 'crystal', 'biomass', 'titanium']) {
      if (!this.handSource(r)) continue;
      const cap = eco.capacity(r);
      if (cap <= 0) continue;
      const f = eco.amount(r) / cap;
      if (f < bf) {
        bf = f;
        best = r;
      }
    }
    return best;
  }

  private nextPoi(): string | null {
    const g = this.game;
    const st = g.state;
    const p = st.player;
    const W = g.sys.world;
    let best: string | null = null;
    let bd = 260;
    for (const poi of W.gen.pois) {
      if (!W.isUnlocked(poi.region)) continue;
      if ((this.banned.get(poi.id) ?? 0) > st.playTime) continue;
      const def = g.data.poi(poi.def);
      if (!def) continue;
      const s = st.world.pois[poi.id];
      if (def.kind === 'beacon') {
        if (st.world.beacons.includes(poi.id)) continue;
      } else {
        if (s?.looted && !W.poiReady(poi.id)) continue;
        if (def.kind === 'nest' && st.colony.tier < 2) continue;
      }
      const d = Math.hypot(poi.x - p.x, poi.z - p.z);
      if (d < bd) {
        bd = d;
        best = poi.id;
      }
    }
    return best;
  }

  private goDiscover(region: string): boolean {
    const g = this.game;
    const W = g.sys.world;
    const idx = W.gen.regionIds.indexOf(region);
    if (idx < 0) return false;
    const p = g.state.player;
    if ((this.banned.get(`r:${region}`) ?? 0) > g.state.playTime) return false;
    const centre = W.gen.regionCenters.find((c) => c.id === region);
    const path = this.nav.path(p.x, p.z, (cx, cz) => W.gen.regionMap[cz * 256 + cx] === idx, centre ? { x: centre.x, z: centre.z } : undefined, 120000);
    this.stats.paths++;
    if (!path || !path.length) {
      this.banned.set(`r:${region}`, g.state.playTime + 120);
      return false;
    }
    const last = path[path.length - 1];
    this.task = { kind: 'goto', x: last.x, z: last.z, why: 'discover' };
    this.taskAt = this.now();
    this.mover.set(path, last, 1.2);
    return true;
  }

  private startGather(res: string, goal: boolean): boolean {
    const g = this.game;
    const W = g.sys.world;
    const p = g.state.player;
    const tier = g.sys.player.toolTier();
    // nearest few candidates by straight distance, then path to the first reachable
    const cands: { i: number; d: number }[] = [];
    for (const n of W.gen.nodes) {
      if (W.isDepleted(n.i) || !W.isUnlocked(n.region)) continue;
      if ((this.banned.get(`n:${n.i}`) ?? 0) > g.state.playTime) continue;
      const def = W.nodeDef(n.i);
      if (!(def.drop[res] ?? 0) || def.toolTier > tier) continue;
      cands.push({ i: n.i, d: Math.hypot(n.x - p.x, n.z - p.z) });
    }
    cands.sort((a, b) => a.d - b.d);
    for (const c of cands.slice(0, 4)) {
      const n = W.gen.nodes[c.i];
      const path = this.nav.pathNear(p.x, p.z, n.x, n.z, g.data.balance.interactRange);
      this.stats.paths++;
      if (!path) {
        this.banned.set(`n:${c.i}`, g.state.playTime + 300);
        continue;
      }
      this.task = { kind: 'gather', res, node: c.i, goal };
      this.taskAt = this.now();
      this.mover.set(path, { x: n.x, z: n.z }, Math.max(1.2, g.data.balance.interactRange - 0.6));
      return true;
    }
    return false;
  }

  private setTask(t: Task, near: number): void {
    const g = this.game;
    const p = g.state.player;
    let dest: Pt | null = null;
    if (t.kind === 'goto') dest = { x: t.x, z: t.z };
    else if (t.kind === 'poi') {
      const poi = g.sys.world.poi(t.id);
      if (poi) dest = { x: poi.x, z: poi.z };
    } else if (t.kind === 'event') {
      const ev = g.state.world.events.find((e) => e.id === t.id);
      if (ev) dest = { x: ev.x, z: ev.z };
    } else if (t.kind === 'chat') {
      const c = g.sys.colonists.get(t.colonist);
      if (c) dest = { x: c.x, z: c.z };
    }
    if (!dest) return;
    const same = this.task && JSON.stringify(this.task) === JSON.stringify(t) && this.mover.active;
    if (same) return;
    const path = this.nav.pathNear(p.x, p.z, dest.x, dest.z, near + 0.6);
    this.stats.paths++;
    if (!path) {
      const key = t.kind === 'poi' ? t.id : `${t.kind}:${dest.x | 0},${dest.z | 0}`;
      this.banned.set(key, g.state.playTime + 300);
      this.task = null;
      return;
    }
    this.task = t;
    this.taskAt = this.now();
    this.mover.set(path, dest, near);
  }

  /** Steer toward the current task and perform its interaction on arrival. */
  private drive(dt: number): void {
    const g = this.game;
    const t = this.task;
    if (!t) {
      this.mover.release();
      return;
    }
    // chat targets move: refresh the destination
    if (t.kind === 'chat') {
      const c = g.sys.colonists.get(t.colonist);
      const w = c ? g.sys.wishes.of(c.id) : undefined;
      if (!c || !w || g.sys.wishes.def(w)?.kind !== 'chat') {
        this.task = null;
        return;
      }
      if (this.mover.dest && Math.hypot(this.mover.dest.x - c.x, this.mover.dest.z - c.z) > 3) {
        this.mover.dest = { x: c.x, z: c.z };
        if (this.mover.path.length) this.mover.path[this.mover.path.length - 1] = { x: c.x, z: c.z };
      }
    }
    // give up on anything that drags on (a nest the gun cannot clear, a target that keeps moving)
    if (t.kind !== 'gather' && !(t.kind === 'goto' && t.why === 'defend') && this.now() - this.taskAt > 150) {
      if (t.kind === 'poi') this.banned.set(t.id, g.state.playTime + 900);
      this.task = null;
      this.mover.clear();
      return;
    }
    const r = this.mover.step(dt);
    if (r === 'stuck') {
      this.stats.stuck++;
      if (this.log.length < 4000) this.log.push(`${(this.now() / 60).toFixed(1)}m stuck at ${g.state.player.x.toFixed(0)},${g.state.player.z.toFixed(0)} on ${t.kind}${t.kind === 'goto' ? ' ' + t.why : ''} (${g.state.player.vehicle ?? 'on foot'})`);
      if (t.kind === 'gather') this.banned.set(`n:${t.node}`, g.state.playTime + 300);
      if (t.kind === 'poi') this.banned.set(t.id, g.state.playTime + 600);
      if (t.kind === 'goto' && t.why === 'discover') {
        const region = g.sys.world.regionAt(t.x, t.z);
        this.banned.set(`r:${region}`, g.state.playTime + 90);
      }
      this.task = null;
      return;
    }
    if (t.kind === 'gather') {
      if (g.sys.world.isDepleted(t.node) || g.sys.economy.isFull(t.res)) {
        this.task = null;
        return;
      }
      if (r === 'arrived') {
        // stand still; auto-gather hits the nearest node in range
        this.mover.release();
        this.mover.dest = null;
      }
      return;
    }
    if (r !== 'arrived') return;
    const P = g.sys.player;
    const it = P.interaction();
    switch (t.kind) {
      case 'poi': {
        if (it && (it.kind === 'loot' || it.kind === 'rescue' || it.kind === 'beacon') && it.target === t.id) {
          g.input.interact = true;
          // tap Open and watch the haul fly home
          this.acted(`poi ${t.id}`, PacingBot.MENU.claim);
          // a guarded nest needs its guards beaten first: linger, the gun does the work
          const def = g.data.poi(g.sys.world.poi(t.id)?.def ?? '');
          if (def?.kind === 'nest' && g.sys.world.nestGuarded(t.id)) return;
        }
        this.banned.set(t.id, g.state.playTime + 60);
        this.task = null;
        return;
      }
      case 'event':
        if (it?.kind === 'event') {
          g.input.interact = true;
          this.acted(`event ${t.id}`);
        }
        this.task = null;
        return;
      case 'chat':
        if (it?.kind === 'chat') {
          g.input.interact = true;
          this.stats.wishes++;
          this.acted('wish chat');
        }
        this.task = null;
        return;
      case 'goto':
        if (t.why === 'defend') return; // hold position
        this.task = null;
        return;
    }
  }
}

