/**
 * GameState — the single persistent, JSON-serializable save model.
 *
 * Ownership: each slice has ONE owning system (see docs/ARCHITECTURE.md). Other systems may READ
 * any slice but should only WRITE through the owner's public methods.
 *
 * Need an extra persistent field for your system? Add it via declaration merging from your own
 * file and initialise it lazily, e.g.
 *   declare module '../core/state' { interface CombatState { myField?: number } }
 *
 * Clocks:
 *  - `playTime` (seconds of simulated, online play) drives gameplay timers (construction, invasions,
 *    crafting, respawns, world events).
 *  - Epoch milliseconds (game.now()) drive real-world timers (daily rewards, boosts, VIP, ad cooldowns,
 *    offline progress).
 */
import { SAVE_VERSION } from './constants';
import type { EquipSlot, ProfessionId, Rarity, ResourceBag } from '../data/schema';

export type Id = number;

export interface GameState {
  version: number;
  seed: number;
  /** Epoch ms when the save was created. */
  createdAt: number;
  /** Epoch ms of the last simulation tick (used for offline progress). */
  lastTickAt: number;
  /** Seconds of online play simulated so far. */
  playTime: number;
  time: TimeState;
  colony: ColonyState;
  resources: ResourceState;
  buildings: BuildingState;
  colonists: ColonistState;
  research: ResearchState;
  crafting: CraftingState;
  player: PlayerState;
  world: WorldState;
  combat: CombatState;
  missions: MissionState;
  tutorial: TutorialState;
  liveops: LiveOpsState;
  expeditions: ExpeditionState;
  achievements: AchievementState;
  stats: StatsState;
  settings: SettingsState;
}

export interface TimeState {
  /** In-game day counter (starts at 1). */
  day: number;
  /** 0..1 where 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset. Starts mid-morning. */
  dayTime: number;
}

// owner: progression (economy agent)
export interface ColonyState {
  name: string;
  /** Colony tech tier 0..6 (wood..titanium). */
  tier: number;
  /** Buildable radius in cells around the core. */
  radius: number;
  /** Id of the core building (command center). */
  coreId: Id | null;
}

// owner: economy
export interface ResourceState {
  amounts: Record<string, number>;
  /** Lifetime totals gained, for stats/missions. */
  lifetime: Record<string, number>;
}

export type BuildingStatus = 'building' | 'active' | 'damaged' | 'off';

export interface BuildingInstance {
  id: Id;
  def: string;
  /** Min-corner cell. */
  x: number;
  z: number;
  rot: 0 | 1 | 2 | 3;
  /** Facility level (1..def.maxLevel). */
  level: number;
  /** Material/visual tier 0..6. Pieces: chosen material. Facilities: colony tier when built/upgraded. */
  tier: number;
  hp: number;
  maxHp: number;
  status: BuildingStatus;
  /** Construction progress 0..1 while status === 'building'. */
  progress: number;
  /** Assigned colonist ids. */
  workers: Id[];
  /** Factory: selected recipe id. */
  recipe: string | null;
  /** Factory: seconds of progress on the current craft. */
  craft: number;
  /** Last computed efficiency 0..1+ (power * staffing * happiness) — informational for UI/render. */
  eff: number;
}

export interface Blueprint {
  id: string;
  name: string;
  /** Placements relative to the blueprint origin. */
  parts: { def: string; dx: number; dz: number; rot: 0 | 1 | 2 | 3; tier: number }[];
}

// owner: buildings (construction agent)
export interface BuildingState {
  list: BuildingInstance[];
  nextId: Id;
  blueprints: Blueprint[];
}

export type ColonistActivity = 'idle' | 'walking' | 'working' | 'sleeping' | 'eating' | 'relaxing' | 'sheltering';

export interface ColonistAppearance {
  /** Indices into palettes defined by the renderer. */
  skin: number;
  hair: number;
  hairColor: number;
  outfit: number;
  /** Height scale 0.9..1.1 */
  height: number;
}

export interface Colonist {
  id: Id;
  name: string;
  bio: string;
  rarity: Rarity;
  appearance: ColonistAppearance;
  trait: string;
  specialty: ProfessionId;
  /** 1..5 stars. */
  skill: number;
  /** Progress toward the next skill level. */
  xp: number;
  /** 0..100 */
  happiness: number;
  /** Building the colonist works at (job = that building's WorkerSpec.job). */
  workplace: Id | null;
  bed: Id | null;
  /** World position & facing. */
  x: number;
  z: number;
  rot: number;
  activity: ColonistActivity;
  /** Current walk target (world units) if walking. */
  tx: number;
  tz: number;
  joinedAt: number;
}

export interface RecruitCandidate {
  colonist: Colonist;
  cost: ResourceBag;
}

// owner: colonists
export interface ColonistState {
  list: Colonist[];
  nextId: Id;
  candidates: RecruitCandidate[];
  /** Epoch ms when the candidate pool refreshes. */
  refreshAt: number;
}

// owner: research (economy agent)
export interface ResearchState {
  /** Unspent research points. */
  points: number;
  completed: string[];
}

export interface CraftJob {
  id: Id;
  recipe: string;
  /** Seconds remaining. */
  remaining: number;
  total: number;
}

// owner: crafting (economy agent)
export interface CraftingState {
  /** Manual crafting queue (processed in order, one at a time per station type). */
  queue: CraftJob[];
  nextJobId: Id;
  /** Recipes crafted lifetime (for missions/stats). */
  crafted: Record<string, number>;
}

// owner: player (world agent)
export interface PlayerState {
  x: number;
  z: number;
  rot: number;
  hp: number;
  /** Equipped item id per slot. */
  equip: Partial<Record<EquipSlot, string>>;
  /** Item inventory (tools, weapons, consumables...). */
  items: Record<string, number>;
  /** Carried resources not yet deposited. */
  backpack: Record<string, number>;
  /** Mounted vehicle def id. */
  vehicle: string | null;
  /** Owned vehicle def ids. */
  vehicles: string[];
  /** playTime until which the player is knocked out (respawns at the core). */
  downUntil: number;
}

export interface ActiveWorldEvent {
  id: Id;
  /** WorldEventDef id. */
  def: string;
  /** World position of the event marker. */
  x: number;
  z: number;
  /** playTime when it expires. */
  endsAt: number;
  claimed: boolean;
}

// owner: world (world agent)
export interface WorldState {
  regionsUnlocked: string[];
  regionsDiscovered: string[];
  /** Depleted resource nodes: node index -> playTime when it respawns. */
  depleted: Record<number, number>;
  /** POI state by POI instance id (from world generation). */
  pois: Record<string, { discovered: boolean; looted: boolean; lootedAt: number }>;
  /** Discovered fast-travel beacon POI ids. */
  beacons: string[];
  events: ActiveWorldEvent[];
  nextEventId: Id;
  /** playTime of the next random world event roll. */
  nextEventAt: number;
  /** Fog of war: base64 bitset over a 64x64 grid (each bit = 4x4 cells). */
  fog: string;
}

export type AlienState = 'spawning' | 'moving' | 'attacking' | 'dying';

export interface Alien {
  id: Id;
  def: string;
  x: number;
  z: number;
  /** Height above ground (flyers / burrowers emerging). */
  y: number;
  rot: number;
  hp: number;
  maxHp: number;
  state: AlienState;
  /** Building id or -1 for player. */
  target: Id | null;
  /** Attack cooldown seconds. */
  cd: number;
  /** Remaining slow seconds / factor. */
  slowT: number;
  slow: number;
  /** Spawner timer (queens). */
  spawnT: number;
  /** Seconds in current state (animations). */
  t: number;
}

export interface Projectile {
  id: Id;
  kind: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Seconds to live. */
  ttl: number;
  damage: number;
  splash: number;
  pierce: number;
  slow: number;
  /** 'friendly' hits aliens, 'hostile' hits buildings/player. */
  team: 'friendly' | 'hostile';
  /** Homing target alien id (missiles). */
  target: Id | null;
  antiAir: boolean;
}

export type CombatPhase = 'peace' | 'warning' | 'attack' | 'victory';

// owner: combat
export interface CombatState {
  phase: CombatPhase;
  /** playTime when the next warning starts (peace) / attack starts (warning). */
  nextAt: number;
  /** Waves survived in total. */
  wave: number;
  /** Waves survived at the current colony tier (for scaling). */
  waveAtTier: number;
  /** Transient (cleared on load). */
  aliens: Alien[];
  projectiles: Projectile[];
  nextEntityId: Id;
  /** Pending spawns for the current attack. */
  spawnQueue: { alien: string; at: number; x: number; z: number }[];
  killsThisWave: number;
  kills: number;
  /** Victory chest waiting to be claimed. */
  pendingReward: import('../data/schema').Reward | null;
  /** True once the tutorial has scheduled the first attack (regular schedule starts after). */
  tutorialAttackDone: boolean;
}

// owner: missions (meta agent)
export interface MissionState {
  /** Active mission ids (in-progress or claimable). */
  active: string[];
  completed: string[];
  /** Progress per active mission id. */
  progress: Record<string, number>;
  /** Lifetime counters "<type>:<target>" -> value (also "<type>:*"). */
  counters: Record<string, number>;
  /** Daily missions for `dailyDate`. */
  dailyDate: string;
  daily: string[];
}

// owner: tutorial (meta agent)
export interface TutorialState {
  done: boolean;
  /** Free-form flags (e.g. 'seenBuildMenu'). */
  flags: Record<string, boolean>;
}

export interface Boost {
  id: string;
  kind: 'production' | 'research' | 'gather' | 'drone';
  mult: number;
  /** Epoch ms. */
  until: number;
}

// owner: liveops (meta agent)
export interface LiveOpsState {
  /** Premium currency: Nova Crystals. */
  nova: number;
  daily: { streak: number; lastClaim: string | null };
  spin: { lastFree: string | null; adDate: string; adSpins: number };
  season: { id: string; xp: number; premium: boolean; claimedFree: number[]; claimedPremium: number[] };
  vip: { until: number; lastDailyNova: string | null };
  boosts: Boost[];
  ads: { date: string; counts: Record<string, number>; lastAt: Record<string, number>; total: number };
  purchases: { id: string; at: number }[];
  cosmetics: { owned: string[]; equipped: Partial<Record<string, string>> };
  /** Epoch ms when the next free crate is available. */
  freeCrateAt: number;
  /** Rare merchant / limited offers seen. */
  offersSeen: string[];
}

/** A generated Frontier site (post-Titanium): where a frontier squad is heading or has been. */
export interface FrontierSite {
  /** Stable id "f<signal>-<rung>". */
  id: string;
  name: string;
  /** BiomeDef id lending the site its look, crew and haul (a FrontierFlavour). */
  biome: string;
  /** Seconds on foot. */
  duration: number;
  /** Charted sites + 1 when it was spotted (how deep into the Frontier it lies). */
  depth: number;
}

/** A charted Frontier site on the Star Chart. */
export interface ChartedSite {
  id: string;
  name: string;
  biome: string;
  depth: number;
  /** Epoch ms when it was charted. */
  at: number;
  /** Short note of the best find ("Quantum Chip"), if any. */
  find?: string;
}

/** One trip: out (timer running) or back (haul waiting at the headquarters). */
export interface Expedition {
  id: Id;
  /** ExpeditionDef id, or 'frontier' (then `site` is set). */
  dest: string;
  site?: FrontierSite;
  /** Colonist ids (1..squadMax). */
  squad: Id[];
  /** Workplace and manual flag of each squad member before leaving (they go back to it). */
  prevWork: (Id | null)[];
  prevManual: boolean[];
  vehicle: string | null;
  /** Epoch ms. */
  startedAt: number;
  endsAt: number;
  /** Colony tier at launch. */
  tier: number;
  /** Seed of the haul roll (deterministic). */
  seed: number;
  status: 'out' | 'back';
  /** Rolled when the squad gets back. */
  haul: import('../data/schema').Reward | null;
  /** Mood the squad came home with (+ adventure / − travel-weary). */
  mood?: number;
}

// owner: expeditions
export interface ExpeditionState {
  list: Expedition[];
  nextId: Id;
  /** Lifetime counters. */
  launched: number;
  collected: number;
  frontier: {
    /** The Star Chart, oldest first. */
    charted: ChartedSite[];
    /** Signal board generation: bumps whenever a frontier trip leaves (fresh sites appear). */
    signal: number;
    /** Milestone counts already claimed. */
    claimed: number[];
    /** The "Frontier is open" card was shown. */
    announced: boolean;
  };
}

// owner: achievements (meta agent)
export interface AchievementState {
  /** AchievementDef id -> epoch ms when it was earned (claimable from then on; never taken back). */
  unlocked: Record<string, number>;
  /** AchievementDef id -> epoch ms when its reward was claimed. */
  claimed: Record<string, number>;
}

export interface StatsState {
  sessions: number;
  /** Total online seconds (mirrors playTime but never reset). */
  online: number;
  gathered: number;
  built: number;
  crafted: number;
  kills: number;
  wavesWon: number;
  explored: number;
  adsWatched: number;
  purchases: number;
}

/** Graphics level the renderer draws at (pixel ratio, shadows, LOD radii, particles, light pool). */
export type QualityLevel = 'low' | 'medium' | 'high';
export const QUALITY_LEVELS: readonly QualityLevel[] = ['low', 'medium', 'high'];
/** Who picks the graphics level: the game ('auto') or the player in Settings ('manual'). */
export type QualityMode = 'auto' | 'manual';

export interface SettingsState {
  music: number;
  sfx: number;
  /** The level in use — the only quality field the renderer reads. In 'auto' mode the game writes it. */
  quality: QualityLevel;
  /**
   * 'auto' (new installs): the game picks `quality` from the device on first launch and steps it down by itself
   * when the frame rate can't keep up — never up. 'manual': the player picked a level in Settings; nothing else
   * touches it. See platform/autoQuality.ts.
   */
  qualityMode: QualityMode;
  /**
   * Auto mode: the device (GPU + memory) the current level was picked for. '' = not picked yet, so the next boot
   * runs the device check once; a save restored on another device (cloud / recovery code) gets a fresh pick too.
   */
  qualityDevice: string;
  haptics: boolean;
  autoGather: boolean;
  /** Share anonymous gameplay analytics. Off until the player opts in. */
  analytics: boolean;
  /** The player has answered the analytics consent prompt (or changed the setting). Nothing is collected before. */
  analyticsAsked: boolean;
  showFps: boolean;
  /** Left-handed layout swaps joystick/buttons. */
  leftHanded: boolean;
  /** Battery saver: cap the frame rate at 30 instead of 60 (longer sessions, cooler phone). */
  batterySaver: boolean;
  /**
   * Gentle local notifications (storehouses full, offline shift over, daily gift ready). Off until the player says
   * yes, either on the in-game card or with the Settings toggle; the OS permission is checked live on top of this.
   * See platform/notifications.ts.
   */
  notifications: boolean;
  /** The player has answered the in-game notifications card (yes or "not now"): it never shows again. */
  notifyAsked: boolean;
}

export function createInitialState(seed: number, now: number): GameState {
  return {
    version: SAVE_VERSION,
    seed,
    createdAt: now,
    lastTickAt: now,
    playTime: 0,
    time: { day: 1, dayTime: 0.33 },
    colony: { name: 'New Hope', tier: 0, radius: 12, coreId: null },
    resources: { amounts: {}, lifetime: {} },
    buildings: { list: [], nextId: 1, blueprints: [] },
    colonists: { list: [], nextId: 1, candidates: [], refreshAt: 0 },
    research: { points: 0, completed: [] },
    crafting: { queue: [], nextJobId: 1, crafted: {} },
    player: { x: 3, z: 4, rot: 0, hp: 100, equip: {}, items: {}, backpack: {}, vehicle: null, vehicles: [], downUntil: 0 },
    world: {
      regionsUnlocked: [],
      regionsDiscovered: [],
      depleted: {},
      pois: {},
      beacons: [],
      events: [],
      nextEventId: 1,
      nextEventAt: 600,
      fog: '',
    },
    combat: {
      phase: 'peace',
      nextAt: Number.POSITIVE_INFINITY,
      wave: 0,
      waveAtTier: 0,
      aliens: [],
      projectiles: [],
      nextEntityId: 1,
      spawnQueue: [],
      killsThisWave: 0,
      kills: 0,
      pendingReward: null,
      tutorialAttackDone: false,
    },
    missions: { active: [], completed: [], progress: {}, counters: {}, dailyDate: '', daily: [] },
    tutorial: { done: false, flags: {} },
    liveops: {
      nova: 0,
      daily: { streak: 0, lastClaim: null },
      spin: { lastFree: null, adDate: '', adSpins: 0 },
      season: { id: '', xp: 0, premium: false, claimedFree: [], claimedPremium: [] },
      vip: { until: 0, lastDailyNova: null },
      boosts: [],
      ads: { date: '', counts: {}, lastAt: {}, total: 0 },
      purchases: [],
      cosmetics: { owned: [], equipped: {} },
      freeCrateAt: 0,
      offersSeen: [],
    },
    expeditions: { list: [], nextId: 1, launched: 0, collected: 0, frontier: { charted: [], signal: 0, claimed: [], announced: false } },
    achievements: { unlocked: {}, claimed: {} },
    stats: { sessions: 0, online: 0, gathered: 0, built: 0, crafted: 0, kills: 0, wavesWon: 0, explored: 0, adsWatched: 0, purchases: 0 },
    settings: { music: 0.6, sfx: 0.8, quality: 'medium', qualityMode: 'auto', qualityDevice: '', haptics: true, autoGather: true, analytics: false, analyticsAsked: false, showFps: false, leftHanded: false, batterySaver: false, notifications: false, notifyAsked: false },
  };
}

/** JSON Infinity-safe clone for saves (Infinity -> 1e300). */
export function serializeState(s: GameState): string {
  return JSON.stringify(s, (_k, v) => (v === Number.POSITIVE_INFINITY ? 1e300 : v));
}
export function deserializeState(json: string): GameState {
  return JSON.parse(json, (_k, v) => (v === 1e300 ? Number.POSITIVE_INFINITY : v)) as GameState;
}
