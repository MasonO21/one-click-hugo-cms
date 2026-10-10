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
  // cosmetic decor (decoration cosmetics)
  | 'zen_garden' | 'bonsai_stand' | 'harvest_display' | 'hay_bales' | 'lantern_arch' | 'lantern_string' | 'holo_tree' | 'campfire_lounge' | 'meteor_fountain'
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
  /**
   * Exclusive decor: buildable only while the colony owns this `decoration` cosmetic (CosmeticDef.id).
   * The Build menu still lists it, locked, with a Wardrobe hint (data/decorCosmetic.ts).
   */
  cosmetic?: string;
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
  /** Expedition headquarters: squads set out from here (its inspector opens the Expeditions panel). */
  expeditions?: boolean;
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
  | 'invasionReward'
  /** Colonist work speed at their workplace (Crew mastery): multiplies their productivity. */
  | 'workSpeed'
  /** Expedition haul (Expeditions mastery). */
  | 'expeditionHaul';

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
  /** heal: HP; reward: a fixed reward (crates); chest: a Nova chest id (rolls its loot, see data/chests.ts). */
  use?: { heal?: number; reward?: Reward; chest?: string };
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
  /** Several cosmetics at once (bundles). */
  cosmetics?: string[];
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
  | 'rescue' // rescue survivors from camps
  | 'expedition' // target = 'launch' | 'collect' | 'frontier' | region id | expedition id (see sim/expeditions.ts)
  | 'wish' // grant colonists' wishes; target = WishKind or '*' (see sim/wishes.ts)
  | 'photo' // take photos in Photo Mode (target '*')
  | 'festival' // hold Colony Spirit festivals (target '*')
  | 'mastery'; // research Mastery levels (target = line id or '*')

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
// Expeditions (src/data/expeditions.ts, sim/expeditions.ts)
// ---------------------------------------------------------------------------------------------

/** What a haul is made of: a resource id or 'rp' (research points). */
export type YieldKey = ResourceId | 'rp';

/** A rare find rolled once per trip (chance before the squad's profession bonus). */
export interface ExpeditionFind {
  chance: number;
  reward: Reward;
}

export interface ExpeditionDef {
  id: string;
  /** BiomeDef id: the region must be discovered. */
  region: string;
  name: string;
  description: string;
  /** PoiDef id whose painted icon stands for the destination. */
  poi: string;
  icon: string;
  /** Seconds on foot: one rung of ExpeditionRules.durations. */
  duration: number;
  /** Colony tier required; also the tier the haul is valued at. */
  tier: number;
  /** Professions that know the terrain: each one in the squad raises the haul and the find chances. */
  match: ProfessionId[];
  /** Value shares of the haul (sum 1). */
  yields: Partial<Record<YieldKey, number>>;
  finds?: ExpeditionFind[];
}

/** Post-Titanium Frontier: one flavour per biome lends uncharted sites their look, crew and haul. */
export interface FrontierFlavour {
  biome: string;
  /** Place words for generated site names ("Amber Dunes"). */
  nouns: string[];
  match: ProfessionId[];
  yields: Partial<Record<YieldKey, number>>;
}

/** A Frontier find that appears from site `from` on and grows `perSite` per charted site (up to `max`). */
export interface FrontierFind extends ExpeditionFind {
  from: number;
  perSite?: number;
  max?: number;
  /** Shown on the Star Chart's "next discovery" line. */
  label: string;
}

export interface FrontierMilestone {
  /** Charted sites needed. */
  count: number;
  title: string;
  reward: Reward;
}

export interface FrontierRules {
  unlockTier: number;
  /** Signal board: one site per duration rung. */
  durations: number[];
  adjectives: string[];
  flavours: FrontierFlavour[];
  finds: FrontierFind[];
  milestones: FrontierMilestone[];
  /** After the last milestone: another one every `every` sites. */
  repeat: { every: number; title: string; reward: Reward };
  /** Haul bonus per charted site and its cap (the journey gets richer, gently). */
  depthBonus: number;
  depthBonusMax: number;
}

export interface ExpeditionRules {
  /** Colony tier that opens expeditions (an `expeditions` building is needed too). */
  unlockTier: number;
  /** The fixed duration ladder (seconds on foot) and the per-hour efficiency of each rung. */
  durations: number[];
  durationEfficiency: number[];
  /** Concurrent trips by colony tier (highest entry whose tier is reached). */
  slots: { tier: number; slots: number }[];
  squadMax: number;
  /** Haul factor by squad size (index = colonists sent). */
  squadSize: number[];
  /** Share of the reference colony's hourly value a no-match, one-star full squad brings home per hour (15 min rung). */
  baseFraction: number;
  /** Per member, averaged over the squad: profession match and each skill star above the first. */
  matchBonus: number;
  skillBonus: number;
  /** Find chances × (1 + this × matched members / squadMax). */
  findMatchBonus: number;
  /** Vehicles: speed shortens the trip, cargo space raises the haul. */
  vehicle: { speedPer: number; speedMax: number; haulPer: number; haulMax: number };
  /** ± spread of each rolled resource amount. */
  variance: number;
  /** Mood after the trip (cozy: a boost; only a long trip on foot leaves them a little tired). */
  mood: { adventure: number; adventureHours: number; weary: number; wearyHours: number; wearyFrom: number };
  /** Work experience (seconds of work) per trip hour and its cap. */
  xpPerHour: number;
  xpMax: number;
  /** Worth of one unit in wood-equivalents (balance yardstick; 'rp' = a research point). */
  value: Record<string, number>;
  /**
   * Tier a good becomes part of everyday colony life. It keeps its full worth for `relevance.keep` tiers after that,
   * then halves each tier (down to `relevance.floor`): a Titanium colony does not care about another pile of wood.
   * Research points never fade.
   */
  intro: Record<string, number>;
  relevance: { keep: number; decay: number; floor: number };
  /** Reference colony output per MINUTE by tier (resources + 'rp'); the balance band is measured against it. */
  reference: Record<string, number>[];
  /** Storage of the reference colony at the end of each tier (hauls are sized to fit it). */
  referenceStorage: Record<string, number>[];
  frontier: FrontierRules;
}

// ---------------------------------------------------------------------------------------------
// Achievements & the Colony Journal (src/data/achievements.ts, sim/achievements.ts)
// ---------------------------------------------------------------------------------------------

export type AchievementCategory = 'builder' | 'explorer' | 'defender' | 'scientist' | 'community' | 'crafter' | 'expeditions' | 'collector' | 'veteran';

/** Tiered lines earn bronze, silver and gold; a one-off earns the single 'special' medal. */
export type AchievementMedal = 'bronze' | 'silver' | 'gold' | 'special';

/** Progress read from live state (see sim/meta/achievementRules.ts for how each one is computed). */
export type AchievementMetric =
  | 'playHours' // state.playTime in hours
  | 'colonyTier' // state.colony.tier
  | 'colonists' // colonists living in the colony
  | 'legendary' // legendary colonists in the colony
  | 'regions' // regions discovered
  | 'research' // research projects completed
  | 'loginDays' // days the daily gift was collected (the streak never resets)
  | 'charted' // Frontier sites on the Star Chart
  | 'buildingTypes' // different building types ever built
  | 'alienTypes' // different alien types ever defeated
  | 'bestFriends'; // colonists at full friendship (wishes)

/** Where an achievement's progress comes from: a mission lifetime counter ("type:target") or a state metric. */
export type AchievementSource = { kind: 'counter'; type: MissionType; target: string } | { kind: 'metric'; metric: AchievementMetric };

export interface AchievementDef {
  /** Stable platform-facing id: `ach_<line>_<bronze|silver|gold>` or `ach_<name>` for a one-off. Never rename. */
  id: string;
  /** Tiered line id ("lumberjack"); a one-off is its own line. */
  line: string;
  category: AchievementCategory;
  /** The line's name (shared by its three medals). */
  name: string;
  /** One line, e.g. "Gather 5,000 wood". */
  description: string;
  medal: AchievementMedal;
  /** Emoji fallback. */
  icon: string;
  /** Painted icon as "<kind>:<id>" (resource, building, hud, alien, tier, poi, reward) — see ui/logic/achievements.ts. */
  art?: string;
  source: AchievementSource;
  /** Progress needed. */
  target: number;
  reward: Reward;
  /** How the UI writes the numbers: plain count (default), hours played, or colony tier. */
  unit?: 'hours' | 'tier';
}

// ---------------------------------------------------------------------------------------------
// Colonist wishes & friendship (src/data/wishes.ts, sim/wishes.ts)
// ---------------------------------------------------------------------------------------------

/**
 * give: hand over resources from storage · build: place one more of a (small) building · craft: craft a recipe by
 * hand · chat: walk up and tap Chat · explore: loot any point of interest.
 */
export type WishKind = 'give' | 'build' | 'craft' | 'chat' | 'explore';

export interface WishDef {
  id: string;
  kind: WishKind;
  /** give: ResourceDef id · build: BuildingDef id · craft: RecipeDef id · chat / explore: ''. */
  target: string;
  icon: string;
  /** Short label for lists ("Berry pie day"). */
  title: string;
  /** What the colonist says, in their own voice. `{n}` = how many (give). */
  text: string;
  /** Colony tier the wish can first be voiced at (its target must be reachable there). */
  minTier: number;
  /** Not voiced past this tier (the colony has outgrown it). */
  maxTier?: number;
  /** Relative weight in the pool (> 0). */
  weight: number;
  /** give: minutes of a reference colony's output of `target` asked for (default WishRules.giveMinutes). */
  minutes?: number;
  /** build: only voiced while the colony has fewer than this many (default WishRules.buildUpTo). */
  upTo?: number;
  /** Who wishes for it more often: specialty / current job, and traits. */
  likes?: { professions?: ProfessionId[]; traits?: string[] };
}

export interface WishRules {
  /** Seconds of online play from wishes opening (tutorial over) to the first wish [min, max]. */
  firstDelay: [number, number];
  /** Seconds of online play between wishes [min, max]. */
  interval: [number, number];
  /** Seconds before trying again when nobody can wish right now (raid, everyone asleep, all slots full). */
  retry: number;
  /** Open wishes at once. */
  maxOpen: number;
  /** Seconds of online play an open wish waits before it quietly lapses (no penalty). */
  expire: number;
  /** give: default minutes of reference output asked; never more than `giveCapShare` of storage, never below `giveMin`. */
  giveMinutes: number;
  giveMin: number;
  giveCapShare: number;
  /** build: default `upTo`. */
  buildUpTo: number;
  /** Weight multiplier when the colonist's specialty / job, or trait, likes the wish. */
  likeBonus: { profession: number; trait: number };
  /** "Wish granted!" happiness and how long it lasts (real hours). */
  mood: { value: number; hours: number };
  /** Friendship hearts per colonist (0..max) and their perks. */
  hearts: number;
  perks: {
    /** From this many hearts: +productivity at their job. */
    productivityHearts: number;
    productivity: number;
    /** From this many hearts: "Best friends", a permanent happiness bonus. */
    bestFriendsHearts: number;
    bestFriendsHappiness: number;
  };
  /**
   * Thank-you gift: two resources from the tier's pool, together worth `minutes` of the reference colony's output,
   * season XP, and a small chance of a little Nova.
   */
  reward: { minutes: number; pool: string[][]; xp: number; novaChance: number; nova: [number, number] };
  /** World units: how close the player must be to Chat. */
  chatRange: number;
  /** explore: a lootable point of interest must lie within this many world units of the colony. */
  exploreRange: number;
  /** Wish ids remembered so the same wish is not voiced again right away. */
  recent: number;
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
  /** 'bundles': cosmetic / chest bundles (shown at the top of the Shop's Packs tab, with art drawn from their contents). */
  section: 'crystals' | 'packs' | 'bundles' | 'cosmetics' | 'vip' | 'season';
}

/** What a cosmetic changes (one of each kind can be equipped; see LiveOps.equipCosmetic). */
export type CosmeticKind =
  | 'base_theme' // colony palette accents + ambient particles (render: Buildings / Atmosphere)
  | 'outfit' // the player's clothes
  | 'hat' // worn by the player
  | 'pet' // a little companion that follows the player
  | 'colonist_outfit' // every colonist's clothes
  | 'vehicle_skin' // the player's vehicle
  | 'turret_skin' // every defense turret
  | 'decoration' // unlocks exclusive decor buildings (Build › Decor)
  | 'photo_frame'; // the frame around Photo Mode pictures

/** Cosmetic rarity, also the Nova-chest drop tier (mythic only drops from the top chests). */
export type CosmeticRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

/** Ambient particles a colony theme adds (render: Atmosphere). */
export type ThemeFx = 'petals' | 'snow' | 'leaves' | 'fireflies' | 'stars' | 'aurora' | 'embers';

export interface CosmeticDef {
  id: string;
  name: string;
  kind: CosmeticKind;
  /** Main colour used by render (outfit body, vehicle/turret paint, theme accent wash). */
  color: string;
  /** Secondary colour (trim, glow, pattern). */
  accent?: string;
  /** Nova price if buyable with premium currency (0 = only from chests, packs or rewards). */
  nova: number;
  rarity: CosmeticRarity;
  /** Emoji fallback for the painted icon at art/cosmetics/<id>.webp. */
  icon: string;
  /** One cozy line for the wardrobe / reward card. */
  description: string;
  /** Can drop from Nova chests (data/chests.ts); with nova 0 and no other grant it is chest-exclusive. */
  chest?: boolean;
  /** base_theme only: the ambient particles it adds. */
  fx?: ThemeFx;
}

/** A tiered Nova chest (data/chests.ts). Opened from the inventory or the Shop's Chests tab. */
export interface ChestDef {
  id: string;
  name: string;
  /** Drop tier: the best cosmetic rarity it can roll, and its look. */
  rarity: CosmeticRarity;
  /** Nova price in the Shop (0 = not sold, only earned). */
  nova: number;
  /** Reward cards revealed when it opens. */
  cards: number;
  icon: string;
  description: string;
  /** Opening-screen palette: glow / particles / rarity ring. */
  color: string;
  accent: string;
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
  /**
   * Bonus levels past the end of the track (premium only): every further `xp` season XP earns `reward` again
   * (repeatable). See sim/seasonBonus.ts.
   */
  bonus?: { xp: number; reward: Reward };
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
