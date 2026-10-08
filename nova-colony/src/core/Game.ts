/**
 * Game — owns state, data, event bus, systems and platform services. Headless: no DOM / three.js.
 * Render, UI and Audio are separate layers that read `game.state/derived/view` and listen to `game.bus`.
 */
import { EventBus } from './events';
import { createInitialState, type GameState } from './state';
import { createDerived, createInput, createView, type DerivedState, type InputState, type ViewState } from './view';
import { Rng } from './rng';
import { createDataRegistry, type DataRegistry } from '../data';
import type { Reward } from '../data/schema';
import type { PlatformServices } from '../platform/types';
import type { System } from '../sim/System';
import { EconomySystem, type OfflineSummary } from '../sim/economy';
import { BuildingSystem } from '../sim/buildings';
import { ResearchSystem } from '../sim/research';
import { CraftingSystem } from '../sim/crafting';
import { ProgressionSystem } from '../sim/progression';
import { ColonistSystem } from '../sim/colonists';
import { CombatSystem } from '../sim/combat';
import { PlayerSystem } from '../sim/player';
import { WorldSystem } from '../sim/world';
import { WorldEventSystem } from '../sim/worldEvents';
import { MissionSystem } from '../sim/missions';
import { TutorialSystem } from '../sim/tutorial';
import { LiveOpsSystem } from '../sim/liveops';
import { ExpeditionSystem } from '../sim/expeditions';
import { AchievementSystem } from '../sim/achievements';
import { createMockServices } from '../platform/mock';
import { reportLoopError } from './guard';

export interface Systems {
  world: WorldSystem;
  economy: EconomySystem;
  buildings: BuildingSystem;
  research: ResearchSystem;
  crafting: CraftingSystem;
  progression: ProgressionSystem;
  colonists: ColonistSystem;
  player: PlayerSystem;
  worldEvents: WorldEventSystem;
  combat: CombatSystem;
  missions: MissionSystem;
  tutorial: TutorialSystem;
  liveops: LiveOpsSystem;
  expeditions: ExpeditionSystem;
  achievements: AchievementSystem;
}

export interface GameOptions {
  seed?: number;
  /** Loaded save; omitted = new game. */
  state?: GameState;
  services?: PlatformServices;
  data?: DataRegistry;
  /** Injectable wall clock (epoch ms) for tests. */
  clock?: () => number;
}

/** Shorter absences are credited silently; longer ones get the Welcome Back screen (with the 2x ad offer). */
export const WELCOME_BACK_MIN_AWAY = 300;

/**
 * Day 1 runs this much slower while the tutorial is in progress, so the first ~14 minutes (crash landing to
 * the first tier-up) play in daylight and end in a golden-hour sunset instead of pitch-dark night. Tuned on the
 * QA bot's human-paced first session (first attack ~12.7 min, tier-up ~13.9 min → dayTime ≈ 0.67 / 0.70): the
 * sun/moon light swap (0.7575) only comes at ~16 min, so slower players still get their sunset.
 */
export const FIRST_DAY_STRETCH = 3.1;

/** Order in which systems update each frame. */
const UPDATE_ORDER: (keyof Systems)[] = [
  'world',
  'player',
  'buildings',
  'colonists',
  'expeditions',
  'economy',
  'crafting',
  'research',
  'progression',
  'worldEvents',
  'combat',
  'missions',
  'tutorial',
  'liveops',
  'achievements',
];

export class Game {
  readonly bus = new EventBus();
  readonly data: DataRegistry;
  readonly services: PlatformServices;
  readonly input: InputState = createInput();
  readonly view: ViewState = createView();
  derived: DerivedState = createDerived();
  state: GameState;
  rng: Rng;
  readonly sys: Systems;
  /** Offline summary computed at load, waiting for the player to claim it (Welcome Back). */
  pendingOffline: OfflineSummary | null = null;
  /** True for a brand-new colony. */
  fresh: boolean;

  private readonly clock: () => number;
  private secondAcc = 0;
  private paused = false;

  constructor(opts: GameOptions = {}) {
    this.clock = opts.clock ?? (() => Date.now());
    this.data = opts.data ?? createDataRegistry();
    this.services = opts.services ?? createMockServices();
    this.fresh = !opts.state;
    const seed = opts.seed ?? opts.state?.seed ?? Math.floor(Math.random() * 2 ** 31);
    this.state = opts.state ?? createInitialState(seed, this.clock());
    this.rng = new Rng(seed ^ 0x5bd1e995 ^ Math.floor(this.state.playTime));
    this.sys = {
      world: new WorldSystem(this),
      economy: new EconomySystem(this),
      buildings: new BuildingSystem(this),
      research: new ResearchSystem(this),
      crafting: new CraftingSystem(this),
      progression: new ProgressionSystem(this),
      colonists: new ColonistSystem(this),
      player: new PlayerSystem(this),
      worldEvents: new WorldEventSystem(this),
      combat: new CombatSystem(this),
      missions: new MissionSystem(this),
      tutorial: new TutorialSystem(this),
      liveops: new LiveOpsSystem(this),
      expeditions: new ExpeditionSystem(this),
      achievements: new AchievementSystem(this),
    };
  }

  /** Wall clock in epoch ms. */
  now(): number {
    return this.clock();
  }

  private systemList(): System[] {
    return UPDATE_ORDER.map((k) => this.sys[k]);
  }

  /** Initialise systems, seed a new colony or restore a save, and compute offline progress. */
  start(): void {
    const list = this.systemList();
    for (const s of list) s.init();
    for (const s of list) s.onLoad(this.fresh);
    this.state.stats.sessions++;

    if (!this.fresh) this.creditAbsence((this.now() - this.state.lastTickAt) / 1000);
    this.state.lastTickAt = this.now();
    this.bus.emit('game:ready', { fresh: this.fresh });
  }

  /**
   * Offline progress for real time the simulation did not run: at launch (since the save) and when the app comes back
   * from the background without having been closed (platform/hooks.ts `installResumeCredit`). Under a minute counts
   * for nothing; a short break is credited quietly; a longer one waits on the Welcome Back card (`offline:ready`).
   */
  creditAbsence(awaySeconds: number): void {
    const away = Math.max(0, awaySeconds);
    if (!(away >= 60)) return;
    const summary = this.sys.economy.computeOffline(away);
    const hasGains = Object.values(summary.gains).some((v) => (v ?? 0) > 0) || summary.rp > 0;
    if (hasGains && away < WELCOME_BACK_MIN_AWAY) {
      // a short break (app switch, quick reload): credit it quietly instead of a Welcome Back modal for "+1"
      this.sys.economy.applyOffline(summary);
    } else if (hasGains) {
      this.pendingOffline = summary;
      this.bus.emit('offline:ready', { seconds: summary.seconds, gains: summary.gains, rp: summary.rp });
    }
  }

  /** Advance the simulation. dt in seconds. */
  update(dt: number): void {
    if (this.paused) return;
    dt = Math.min(Math.max(dt, 0), 0.25);
    const st = this.state;
    st.playTime += dt;
    st.stats.online += dt;
    st.lastTickAt = this.now();

    // day/night — the guided first session stays in daylight: day 1 runs slower until the tutorial arc ends
    const prev = st.time.dayTime;
    const firstDay = st.time.day <= 1 && !st.tutorial.done;
    st.time.dayTime += dt / (this.data.balance.dayLength * (firstDay ? FIRST_DAY_STRETCH : 1));
    if (st.time.dayTime >= 1) {
      st.time.dayTime -= 1;
      st.time.day++;
      this.bus.emit('time:dayChanged', { day: st.time.day });
    }
    if (prev < 0.78 && st.time.dayTime >= 0.78) this.bus.emit('time:nightfall', {});
    if (prev < 0.22 && st.time.dayTime >= 0.22) this.bus.emit('time:sunrise', {});

    // each system is isolated: one that throws is skipped for this frame, the others (and the loop) keep going
    for (const k of UPDATE_ORDER) {
      try {
        this.sys[k].update(dt);
      } catch (e) {
        reportLoopError(`sim ${k}`, e);
      }
    }

    this.secondAcc += dt;
    if (this.secondAcc >= 1) {
      this.secondAcc -= 1;
      this.bus.emit('tick:second', { playTime: st.playTime });
    }
    // one-frame input flags
    this.input.interact = false;
  }

  setPaused(p: boolean): void {
    this.paused = p;
  }

  isPaused(): boolean {
    return this.paused;
  }

  /** Is it night (for lights, colonist sleep)? */
  isNight(): boolean {
    const t = this.state.time.dayTime;
    return t < 0.22 || t > 0.78;
  }

  /**
   * Central reward granting used by missions, chests, POIs, events, daily rewards, spin, IAP...
   * x/z (world units) animates resources flying from a world position; `item` names the inventory item it came out of.
   */
  grant(reward: Reward | null | undefined, source: string, x?: number, z?: number, item?: string): void {
    if (!reward) return;
    const s = this.sys;
    if (reward.resources) s.economy.addBag(reward.resources, source === 'offline' ? 'offline' : 'reward', x, z);
    if (reward.nova) s.liveops.addNova(reward.nova, source);
    if (reward.rp) s.research.addPoints(reward.rp);
    if (reward.xp) s.liveops.addXp(reward.xp);
    if (reward.items) for (const [id, n] of Object.entries(reward.items)) s.player.addItem(id, n);
    if (reward.colonist) s.colonists.grant(reward.colonist);
    if (reward.boost) s.liveops.activateBoost(reward.boost.kind, reward.boost.mult, reward.boost.minutes);
    if (reward.cosmetic && !this.state.liveops.cosmetics.owned.includes(reward.cosmetic)) {
      this.state.liveops.cosmetics.owned.push(reward.cosmetic);
    }
    if (reward.vehicle && !this.state.player.vehicles.includes(reward.vehicle)) {
      this.state.player.vehicles.push(reward.vehicle);
      this.bus.emit('vehicle:unlocked', { vehicle: reward.vehicle });
    }
    this.bus.emit('reward:granted', { reward, source, item });
  }

  toast(text: string, kind: 'info' | 'success' | 'warning' | 'reward' | 'danger' = 'info', icon?: string): void {
    this.bus.emit('ui:toast', { text, kind, icon });
  }

  /** Release listeners (tests / hot reload). */
  dispose(): void {
    this.bus.clear();
  }
}
