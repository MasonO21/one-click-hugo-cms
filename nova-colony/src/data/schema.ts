/**
 * DATA SCHEMA — the contract between game content (src/data/*.ts) and the systems (src/sim, src/render, src/ui).
 *
 * Rules:
 *  - Systems must NOT hard-code content ids except the few "anchor" ids listed in ANCHOR_IDS below.
 *    Behaviour is driven by the optional effect fields on each def (storage, produces, turret, ...).
 *  - All times are in seconds, all rates are per MINUTE, all distances in CELLS unless noted.
 *  - Costs/rewards are ResourceBags keyed by ResourceDef.id.
 */

export type ResourceId = string;
export type ResourceBag = Partial<Record<ResourceId, number>>;

/** Ids that systems are allowed to reference directly. Content must define these. */
export const ANCHOR_IDS = {
  /** Resources */
  wood: 'wood',
  stone: 'stone',
  fiber: 'fiber',
  food: 'food',
  water: 'water',
  /** The colony core building (escape pod at tier 0, command center later). Exactly one exists. */
  coreBuilding: 'command_center',
  /** Starting region where the crash site is. */
  startRegion: 'crash_valley',
} as const;

// ---------------------------------------------------------------------------------------------
// Resources & tiers
// ---------------------------------------------------------------------------------------------

export interface ResourceDef {
  id: ResourceId;
  name: string;
  /** Emoji used in UI (works without image assets). */
  icon: string;
  /** Hex color used for UI chips, floating numbers and flying-resource particles. */
  color: string;
  category: 'basic' | 'intermediate' | 'advanced';
  /** Storage capacity provided by the colony core before any storage buildings. */
  baseCapacity: number;
  /** Sort order in the HUD. */
  sort: number;
  description: string;
}

export interface TierDef {
  /** 0..6 */
  index: number;
  id: 'wood' | 'reinforced' | 'stone' | 'steel' | 'alloy' | 'nano' | 'titanium';
  name: string;
  description: string;
  /** Primary material color (walls etc.) and accent/emissive color. Used by render + UI. */
  color: string;
  accent: string;
  /** Glow/emissive intensity at night for this tier's structures (0 = none, 1 = strong neon). */
  glow: number;
  /** Buildable colony radius (in cells, from the core) once this tier is reached. */
  colonyRadius: number;
  /** HP multiplier for structure pieces built in this material. */
  hpMult: number;
  /** Cost to build ONE structure piece (wall/floor/...) of this material, before the piece's own costMult. */
  pieceCost: ResourceBag;
  /** Cost to upgrade the colony core INTO this tier (tier 0 = free/start). */
  upgradeCost: ResourceBag;
  /** Research that must be completed before the colony can upgrade into this tier. */
  research: string | null;
  /** Seconds between alien invasions while at this tier (online only). */
  invasionInterval: number;
}

// ---------------------------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------------------------

export type BuildingCategory =
  | 'structure'
  | 'storage'
  | 'housing'
  | 'food'
  | 'water'
  | 'power'
  | 'production'
  | 'crafting'
  | 'research'
  | 'defense'
  | 'utility'
  | 'decor';

export type PieceKind = 'floor' | 'wall' | 'door' | 'window' | 'stairs' | 'platform' | 'roof' | 'gate' | 'fence' | 'pillar';

/**
 * Render archetypes. The renderer implements a procedural low-poly model for each key, styled by
 * the instance's material tier (TierDef.color/accent/glow). Unknown keys fall back to a generic
 * tier-styled block, so content may introduce new keys safely.
 */
export type ModelKey =
  // structure pieces (styled per material tier)
  | 'floor' | 'wall' | 'door' | 'window' | 'stairs' | 'platform' | 'roof' | 'gate' | 'fence' | 'pillar'
  // core
  | 'command_center'
  // storage / housing
  | 'crate' | 'warehouse' | 'silo' | 'tank' | 'quantum_storage' | 'bed' | 'bunkhouse' | 'habitat' | 'skyscraper'
  // food / water
  | 'campfire' | 'farm_plot' | 'greenhouse' | 'hydroponics' | 'kitchen' | 'food_storage'
  | 'rain_collector' | 'water_pump' | 'purifier' | 'industrial_purifier' | 'atmo_generator'
  // power
  | 'fuel_generator' | 'solar_panel' | 'wind_turbine' | 'geothermal' | 'fusion_reactor' | 'battery' | 'power_pylon'
  // production / crafting / research
  | 'logging_camp' | 'quarry' | 'mine' | 'drill' | 'harvester' | 'drone_hub' | 'robot_bay'
  | 'workbench' | 'forge' | 'smelter' | 'electronics_lab' | 'factory' | 'nanoforge' | 'matter_processor' | 'conveyor'
  | 'research_desk' | 'research_lab' | 'advanced_lab' | 'med_bay' | 'medical_center'
  // utility
  | 'radio_tower' | 'garage' | 'hangar' | 'teleporter' | 'spin_wheel' | 'beacon' | 'repair_bay' | 'shield_generator'
  // decor
  | 'lamp' | 'plant' | 'bench' | 'fountain' | 'banner' | 'statue' | 'arcade' | 'garden'
  // defense
  | 'barricade' | 'spikes' | 'guard_tower' | 'turret_basic' | 'turret_mg' | 'turret_flame' | 'turret_missile'
  | 'turret_heavy' | 'turret_laser' | 'turret_plasma' | 'turret_rail' | 'turret_cannon' | 'turret_aa'
  | 'electric_fence' | 'drone_pad'
  | (string & {});

export type ProjectileKind = 'arrow' | 'bullet' | 'flame' | 'missile' | 'laser' | 'plasma' | 'rail' | 'cannon' | 'drone';

export interface TurretSpec {
  /** Range in cells. */
  range: number;
  /** Damage per shot. */
  damage: number;
  /** Shots per second. */
  fireRate: number;
  projectile: ProjectileKind;
  /** Splash radius in cells (0/undefined = single target). */
  splash?: number;
  /** Can hit flying aliens. */
  antiAir?: boolean;
  /** Cannot hit ground aliens (pure AA). */
  airOnly?: boolean;
  /** Number of extra targets a shot passes through (railgun). */
  pierce?: number;
  /** Slow factor applied on hit (0.3 = 30% slower for 2s). */
  slow?: number;
  /** If set, a colonist with this job assigned to the building multiplies damage by 1.5. */
  mannedBy?: ProfessionId;
  /** "Manually operated": fires 2x faster while the player stands within 3 cells (still fires on its own). */
  manual?: boolean;
}

export interface TrapSpec {
  /** Damage per second to aliens standing on/touching the footprint. */
  dps: number;
  /** Slow factor while touching (0..0.9). */
  slow?: number;
  /** Also damages flying aliens. */
  antiAir?: boolean;
}

export interface ShieldSpec {
  /** Radius in cells around the building center. */
  radius: number;
  /** Damage absorbed before the shield drops. */
  capacity: number;
  /** Capacity regenerated per second (also between waves). */
  regen: number;
}

export interface WorkerSpec {
  slots: number;
  job: ProfessionId;
  /**
   * If true the building does nothing without workers (efficiency = staffed/slots).
   * If false it runs automated at 100% and each worker adds +25% (automation tiers).
   */
  required: boolean;
}

export interface BuildingDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: BuildingCategory;
  /** Structure pieces: material tier comes from the instance and can be upgraded wood->titanium. */
  piece?: PieceKind;
  /** Footprint in cells [width(x), depth(z)] at rot 0. */
  size: [number, number];
  /** Minimum colony tier to build. */
  unlockTier: number;
  /** Research required to build (in addition to unlockTier). */
  research?: string;
  /** Build cost. Pieces: multiplier applied to TierDef.pieceCost of the chosen material instead (costMult). */
  cost: ResourceBag;
  /** Pieces only: multiplier on TierDef.pieceCost (floor 0.5, wall 1, door 1.2, ...). */
  costMult?: number;
  /** Seconds to construct (piece-by-piece animation plays over this time). Keep short — cozy. */
  buildTime: number;
  /** Base HP (pieces: multiplied by TierDef.hpMult). */
  hp: number;
  /** Facility level cap (1 = no level upgrades). */
  maxLevel: number;
  /** Each level costs cost * levelCostMult^(level-1). */
  levelCostMult?: number;
  /** Each level adds this fraction to all numeric effects (0.5 => L2 = 150%, L3 = 200%). */
  levelEffect?: number;
  /** Optional cap on how many may exist. */
  maxCount?: number;
  /** True = player/colonists cannot walk through (doors/gates are passable for friendlies, never for aliens). */
  solid: boolean;
  model: ModelKey;

  // ---- effects (all optional; systems key off presence) ----
  /** Adds storage capacity. */
  storage?: ResourceBag;
  /** Production per minute at level 1, full efficiency. */
  produces?: ResourceBag;
  /** Consumption per minute (converters). If inputs are missing the building idles. */
  consumes?: ResourceBag;
  /** + generates power, - consumes power (units). */
  power?: number;
  workers?: WorkerSpec;
  /** Beds provided. */
  housing?: number;
  /** Research points per minute. */
  research_rate?: number;
  /** Happiness contributors (colony-wide, divided among colonists). */
  comfort?: number;
  entertainment?: number;
  /** Medical: colonist happiness bonus + faster recovery after attacks. */
  medical?: number;
  /** Manual crafting station type offered to the player. */
  station?: string;
  /** Automated factory: continuously crafts the selected recipe of this station type. */
  factory?: string;
  turret?: TurretSpec;
  trap?: TrapSpec;
  shield?: ShieldSpec;
  /** HP/sec repaired on buildings within 6 cells (repair drones / engineers bay). */
  repair?: number;
  /** Enables the recruitment board. */
  recruit?: boolean;
  /** Vehicle crafting/storage. */
  garage?: boolean;
  /** Fast-travel endpoint usable from anywhere once built. */
  teleporter?: boolean;
  /** The daily spin wheel object in the colony. */
  spinWheel?: boolean;
  /** Is the colony core (exactly one; cannot be removed; upgrading it = colony tier up). */
  core?: boolean;
  /** Food/water reserve that feeds colonists (otherwise drawn from global storage). Informational. */
  feeds?: boolean;
}

// ---------------------------------------------------------------------------------------------
// Colonists
// ---------------------------------------------------------------------------------------------

export type ProfessionId =
  | 'farmer'
  | 'engineer'
  | 'electrician'
  | 'scientist'
  | 'doctor'
  | 'cook'
  | 'miner'
  | 'guard'
  | 'mechanic'
  | 'water_tech'
  | 'drone_tech'
  | 'logistics'
  | 'gatherer';

export interface ProfessionDef {
  id: ProfessionId;
  name: string;
  icon: string;
  color: string;
  description: string;
}

export interface TraitDef {
  id: string;
  name: string;
  description: string;
  /** Productivity add (0.1 = +10%). */
  productivity?: number;
  /** Flat happiness add. */
  happiness?: number;
  /** Movement speed add. */
  speed?: number;
}

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface NamePools {
  first: string[];
  last: string[];
  /** Short bios with {name} placeholder. */
  bios: string[];
}

// ---------------------------------------------------------------------------------------------
// Research, recipes, items
// ---------------------------------------------------------------------------------------------

export type ResearchCategory =
  | 'construction'
  | 'power'
  | 'food'
  | 'water'
  | 'defense'
  | 'weapons'
  | 'automation'
  | 'robotics'
  | 'exploration'
  | 'colonists'
  | 'titanium';

/**
 * Modifier stats. Systems read them via EconomySystem.modifier(stat) which returns
 * (1 + sum(add)) * product(mult). Per-resource production uses 'production:<resourceId>'.
 */
export type ModifierStat =
  | 'production'
  | `production:${string}`
  | 'gatherYield'
  | 'gatherSpeed'
  | 'buildSpeed'
  | 'craftSpeed'
  | 'research'
  | 'storage'
  | 'power'
  | 'turretDamage'
  | 'turretRange'
  | 'structureHp'
  | 'repairSpeed'
  | 'happiness'
  | 'colonistSpeed'
  | 'moveSpeed'
  | 'playerDamage'
  | 'playerHp'
  | 'offlineHours'
  | 'recruitSlots'
  | 'invasionReward';

export interface Modifier {
  stat: ModifierStat;
  add?: number;
  mult?: number;
}

export interface ResearchDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: ResearchCategory;
  /** Minimum colony tier before this can be researched. */
  tier: number;
  /** Research point cost. */
  cost: number;
  /** Optional extra resource cost. */
  resources?: ResourceBag;
  requires: string[];
  /** Informational unlock lists for the UI (gating is done by BuildingDef.research etc.). */
  unlocks?: { buildings?: string[]; recipes?: string[]; vehicles?: string[]; regions?: string[] };
  effects?: Modifier[];
  /** Grid position in the tree view [column, row] within its category. */
  pos: [number, number];
}

export type CraftCategory =
  | 'weapons'
  | 'tools'
  | 'materials'
  | 'technology'
  | 'defense'
  | 'food'
  | 'medical'
  | 'machines'
  | 'drones'
  | 'vehicles'
  | 'armor'
  | 'utility';

export interface RecipeDef {
  id: string;
  name: string;
  category: CraftCategory;
  /** Station type needed (BuildingDef.station or .factory). 'hand' = craft anywhere. */
  station: string;
  inputs: ResourceBag;
  /** Item inputs (e.g. upgrading a tool). */
  itemInputs?: Record<string, number>;
  outputs: { resources?: ResourceBag; items?: Record<string, number>; vehicle?: string };
  /** Seconds. */
  time: number;
  unlockTier: number;
  research?: string;
}

export type EquipSlot = 'tool' | 'weapon' | 'armor' | 'backpack' | 'utility';

export interface ItemDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'tool' | 'weapon' | 'armor' | 'backpack' | 'utility' | 'consumable' | 'crate';
  slot?: EquipSlot;
  tier: number;
  stats?: {
    /** Gather yield multiplier add (tool). */
    gatherYield?: number;
    /** Gather speed multiplier add (tool). */
    gatherSpeed?: number;
    /** Max node toolTier this tool can harvest. */
    toolTier?: number;
    damage?: number;
    fireRate?: number;
    /** Range in world units. */
    range?: number;
    projectile?: ProjectileKind;
    hp?: number;
    /** Backpack capacity (total resource units). */
    capacity?: number;
    moveSpeed?: number;
  };
  /** Consumables. */
  use?: { heal?: number; reward?: Reward };
}

// ---------------------------------------------------------------------------------------------
// Aliens & invasions
// ---------------------------------------------------------------------------------------------

export interface AlienDef {
  id: string;
  name: string;
  description: string;
  model: 'crawler' | 'spitter' | 'brute' | 'burrower' | 'flyer' | 'queen' | 'titan' | (string & {});
  color: string;
  /** Visual scale multiplier. */
  scale: number;
  hp: number;
  /** Cells per second. */
  speed: number;
  /** Damage per hit. */
  damage: number;
  /** Hits per second. */
  attackRate: number;
  /** Attack range in cells (melee ~0.7). */
  range: number;
  flying?: boolean;
  /** Emerges from underground inside the colony radius instead of the edge. */
  burrow?: boolean;
  /** Ranged attacker: fires a projectile at buildings. */
  ranged?: boolean;
  /** Periodically spawns other aliens. */
  spawns?: { alien: string; every: number; count: number };
  /** Prefers attacking: 'any' nearest structure, 'defense' turrets first, 'wall' walls first, 'core'. */
  prefers: 'any' | 'defense' | 'wall' | 'core';
  boss?: boolean;
  /** Resources dropped on death (flies to storage). */
  drop: ResourceBag;
}

export interface InvasionGroup {
  alien: string;
  count: number;
  /** Seconds after attack start before this group spawns. */
  delay: number;
}

export interface InvasionDef {
  /** Colony tier this invasion table applies to. */
  tier: number;
  groups: InvasionGroup[];
  /** Optional boss that joins every Nth wave at this tier. */
  boss?: { alien: string; every: number };
  /** Base victory chest. */
  reward: Reward;
}

// ---------------------------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------------------------

export interface BiomeDef {
  id: string;
  name: string;
  description: string;
  /** Ground colors (low/high) for terrain shading. */
  ground: [string, string];
  /** Fog/sky tint while the player is inside. */
  tint: string;
  /** Unlock requirements (all must hold). */
  unlock: { tier?: number; research?: string; mission?: string };
  /** Placement of the region's center: angle in degrees (0 = +X, 90 = +Z) and normalized distance 0..1 from origin to world edge. */
  center: { angle: number; dist: number };
  /** Relative size weight for the region partition. */
  size: number;
  /** Max terrain height variation (world units) for decorative hills. */
  relief: number;
  nodes: { node: string; density: number }[];
  /** Decorative prop model keys scattered (render-only). */
  props: string[];
  pois: { poi: string; count: number }[];
  /** Ambient music mood. */
  mood: 'calm' | 'mystic' | 'warm' | 'eerie' | 'cold' | 'epic';
}

export interface NodeDef {
  id: string;
  name: string;
  /** Render model key: 'tree_pine' | 'tree_round' | 'bush' | 'rock' | 'ore_iron' | 'ore_copper' | 'coal' | 'crystal' | 'bio_pod' | 'ice_ore' | 'titanium' | 'scrap' ... */
  model: string;
  /** Yield per gather hit. */
  drop: ResourceBag;
  /** Hits until depleted. */
  hits: number;
  /** Respawn time in seconds. */
  respawn: number;
  /** Required tool tier. */
  toolTier: number;
  scale: number;
  /** Blocks movement (trees, big rocks). */
  solid: boolean;
}

export interface PoiDef {
  id: string;
  name: string;
  description: string;
  kind: 'camp' | 'wreck' | 'cache' | 'ruin' | 'nest' | 'beacon' | 'structure' | 'facility';
  model: string;
  icon: string;
  reward: Reward;
  /** Nest: requires defeating this many aliens nearby (spawned when approached). */
  guards?: { alien: string; count: number };
  /** Respawns loot after N seconds (0 = one-time). */
  respawn: number;
}

export interface VehicleDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  model: string;
  /** Movement speed multiplier vs. walking. */
  speed: number;
  /** Extra backpack capacity while riding. */
  storage: number;
  hover?: boolean;
  unlockTier: number;
  research?: string;
  cost: ResourceBag;
}

export interface WorldEventDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  kind: 'meteor' | 'wreck' | 'rescue' | 'nest' | 'drop' | 'merchant' | 'storm' | 'ancient';
  minTier: number;
  weight: number;
  /** Seconds the event stays available. */
  duration: number;
  reward: Reward;
  /** Spawns a temporary POI marker the player can visit. */
  poi?: string;
  /** Storm: bonus node yield multiplier while active. */
  yieldBonus?: number;
  /** Merchant: trade offers (pay resources, get resources). */
  trades?: { give: ResourceBag; get: ResourceBag }[];
}

// ---------------------------------------------------------------------------------------------
// Rewards, missions, tutorial
// ---------------------------------------------------------------------------------------------

export interface Reward {
  resources?: ResourceBag;
  nova?: number;
  /** Research points. */
  rp?: number;
  /** Season pass XP. */
  xp?: number;
  items?: Record<string, number>;
  colonist?: Rarity;
  boost?: { kind: 'production' | 'research' | 'gather'; mult: number; minutes: number };
  cosmetic?: string;
  /** Unlock a vehicle for free. */
  vehicle?: string;
}

export type MissionType =
  | 'gather' // target = resource id or '*'
  | 'build' // target = building id or category:<cat> or '*'
  | 'have_building' // count of existing buildings of target
  | 'recruit'
  | 'colonists' // have N colonists
  | 'assign' // assign N colonists to jobs
  | 'tier' // reach colony tier N (count = tier)
  | 'discover' // target = region id
  | 'kill' // target = alien id or '*'
  | 'defend' // survive N invasions
  | 'craft' // target = recipe id or '*'
  | 'research' // target = research id or '*'
  | 'power' // have power production >= count
  | 'upgrade' // upgrade buildings (target = building id or '*')
  | 'loot' // loot POIs
  | 'equip' // equip item target
  | 'spin' // use the spin wheel
  | 'rescue'; // rescue survivors from camps

export interface MissionDef {
  id: string;
  name: string;
  description: string;
  type: MissionType;
  target: string;
  count: number;
  reward: Reward;
  chain: 'main' | 'side' | 'daily';
  /** Side missions only: not offered before the colony reaches this tier (late-game chains). */
  minTier?: number;
  /** Missions that become active when this one is claimed. */
  next?: string[];
  /** Tutorial guidance shown while active. */
  hint?: string;
  /** What the guidance arrow points at. */
  guide?: { kind: 'node' | 'building' | 'build_menu' | 'poi' | 'ui' | 'region'; ref?: string };
  /** Scripted triggers fired when the mission is completed (first-15-minutes flow). */
  onComplete?: {
    /** Schedule an alien attack: warning starts after `delay`s and lasts `warning`s. */
    attack?: { delay: number; warning: number };
    /** Make a survivor camp appear near the colony. */
    spawnSurvivor?: boolean;
    /** Show a celebratory popup with this text. */
    celebrate?: string;
  };
}

// ---------------------------------------------------------------------------------------------
// Monetization & live-ops
// ---------------------------------------------------------------------------------------------

export interface AdPlacementDef {
  id:
    | 'offline_double'
    | 'production_boost'
    | 'instant_craft'
    | 'free_crate'
    | 'recruit_refresh'
    | 'invasion_bonus'
    | 'research_bonus'
    | 'extra_spin'
    | 'drone_assistant'
    | (string & {});
  name: string;
  description: string;
  /** Max per local day (0 = unlimited). */
  dailyLimit: number;
  /** Cooldown seconds between views. */
  cooldown: number;
}

export interface ProductDef {
  /** Store product id (same on App Store + Google Play). Prices come from the store at runtime. */
  id: string;
  type: 'consumable' | 'non_consumable' | 'subscription';
  name: string;
  description: string;
  /** Shown only if the store hasn't returned a localized price (e.g. web build). */
  fallbackPrice: string;
  grants: Reward & { vipDays?: number; seasonPremium?: boolean; bundleTag?: string };
  tag?: 'best_value' | 'popular' | 'limited' | 'new';
  /** Max purchases per account (0 = unlimited). */
  limit: number;
  section: 'crystals' | 'packs' | 'cosmetics' | 'vip' | 'season';
}

export interface CosmeticDef {
  id: string;
  name: string;
  kind: 'base_theme' | 'outfit' | 'vehicle_skin' | 'turret_skin' | 'decoration' | 'colonist_outfit';
  /** Color/params used by render. */
  color: string;
  accent?: string;
  /** Nova price if buyable with premium currency (0 = only from packs/rewards). */
  nova: number;
}

export interface SpinSegment {
  label: string;
  color: string;
  weight: number;
  reward: Reward;
}

export interface SeasonDef {
  id: string;
  name: string;
  /** XP needed per level (flat). */
  xpPerLevel: number;
  levels: { free: Reward; premium: Reward }[];
  /** XP granted per tracked action. */
  xp: {
    gather: number; // per gather hit
    build: number; // per building completed
    craft: number;
    kill: number;
    defend: number; // per invasion survived
    mission: number;
    discover: number;
    research: number;
  };
}

export interface VipDef {
  productId: string;
  dailyNova: number;
  productionBonus: number;
  offlineHoursBonus: number;
  dailyRewardMult: number;
  description: string[];
}

// ---------------------------------------------------------------------------------------------
// Balance constants
// ---------------------------------------------------------------------------------------------

export interface BalanceDef {
  /** Real seconds per in-game day. */
  dayLength: number;
  /** Base offline cap in hours. */
  offlineHours: number;
  /** Offline production efficiency (1 = same as online). */
  offlineEfficiency: number;
  autosaveSeconds: number;
  /** Player. */
  playerSpeed: number; // world units / sec
  playerHp: number;
  gatherInterval: number; // seconds between auto-gather hits
  interactRange: number; // world units
  backpackCapacity: number;
  /** Colonists. */
  colonistSpeed: number; // world units / sec
  foodPerColonistPerMin: number;
  waterPerColonistPerMin: number;
  /** Happiness contributions (0..100 total). */
  happiness: {
    base: number;
    bed: number;
    food: number;
    water: number;
    power: number;
    comfortPerPoint: number;
    comfortMax: number;
    entertainmentPerPoint: number;
    entertainmentMax: number;
    safety: number;
    medical: number;
  };
  /** Productivity multiplier = 1 + max(0, happiness - 50) / 100 (cozy: never below 1). */
  specialtyBonus: number; // productivity add when job matches specialty
  skillBonusPerLevel: number; // productivity add per skill level above 1
  /** Recruitment. */
  recruitCandidates: number;
  recruitRefreshMinutes: number;
  recruitCost: Record<Rarity, ResourceBag>;
  /** Invasions. */
  firstInvasionDelay: number; // seconds of play before regular invasions begin (tutorial triggers the first)
  warningSeconds: number;
  repairDelay: number; // seconds after an attack before free auto-repair begins
  repairRate: number; // fraction of max hp per second during auto-repair
  /** Waves scale count by 1 + waveScaling * wavesAtThisTier. */
  waveScaling: number;
  /** World events. */
  eventIntervalMin: number;
  eventIntervalMax: number;
  /** Refund fraction when removing a building (1 = full refund — cozy). */
  removeRefund: number;
  freeCrateHours: number;
}
