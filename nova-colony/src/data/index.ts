/**
 * DataRegistry — indexes all content definitions by id. Systems access content only through this.
 */
import type {
  AdPlacementDef,
  AlienDef,
  BalanceDef,
  BiomeDef,
  BuildingDef,
  CosmeticDef,
  ExpeditionDef,
  ExpeditionRules,
  InvasionDef,
  ItemDef,
  MissionDef,
  NamePools,
  NodeDef,
  PoiDef,
  ProductDef,
  ProfessionDef,
  RecipeDef,
  ResearchDef,
  ResourceDef,
  SeasonDef,
  SpinSegment,
  TierDef,
  TraitDef,
  VehicleDef,
  VipDef,
  WorldEventDef,
  Reward,
} from './schema';

import { RESOURCES } from './resources';
import { TIERS } from './tiers';
import { BUILDINGS } from './buildings';
import { PROFESSIONS, TRAITS } from './colonists';
import { NAMES } from './names';
import { RESEARCH } from './research';
import { RECIPES } from './recipes';
import { ITEMS } from './items';
import { ALIENS, INVASIONS } from './aliens';
import { BIOMES, NODES, POIS } from './world';
import { VEHICLES } from './vehicles';
import { WORLD_EVENTS } from './events';
import { MISSIONS, FIRST_MISSION, DAILY_MISSION_POOL } from './missions';
import { AD_PLACEMENTS, PRODUCTS, COSMETICS, VIP, SEASON, DAILY_REWARDS, SPIN_SEGMENTS, STARTER_KIT } from './monetization';
import { BALANCE } from './balance';
import { EXPEDITIONS, EXPEDITION_RULES } from './expeditions';

export interface GameData {
  resources: ResourceDef[];
  tiers: TierDef[];
  buildings: BuildingDef[];
  professions: ProfessionDef[];
  traits: TraitDef[];
  names: NamePools;
  research: ResearchDef[];
  recipes: RecipeDef[];
  items: ItemDef[];
  aliens: AlienDef[];
  invasions: InvasionDef[];
  biomes: BiomeDef[];
  nodes: NodeDef[];
  pois: PoiDef[];
  vehicles: VehicleDef[];
  worldEvents: WorldEventDef[];
  missions: MissionDef[];
  firstMission: string;
  dailyMissionPool: string[];
  adPlacements: AdPlacementDef[];
  products: ProductDef[];
  cosmetics: CosmeticDef[];
  vip: VipDef;
  season: SeasonDef;
  dailyRewards: Reward[];
  spinSegments: SpinSegment[];
  /** What a brand-new colony starts with. */
  starterKit: { resources: Record<string, number>; items: Record<string, number>; equip: Record<string, string> };
  balance: BalanceDef;
  expeditions: ExpeditionDef[];
  expeditionRules: ExpeditionRules;
}

function index<T extends { id: string }>(list: T[], kind: string): Map<string, T> {
  const m = new Map<string, T>();
  for (const d of list) {
    if (m.has(d.id)) console.warn(`[data] duplicate ${kind} id: ${d.id}`);
    m.set(d.id, d);
  }
  return m;
}

export class DataRegistry implements GameData {
  resources!: ResourceDef[];
  tiers!: TierDef[];
  buildings!: BuildingDef[];
  professions!: ProfessionDef[];
  traits!: TraitDef[];
  names!: NamePools;
  research!: ResearchDef[];
  recipes!: RecipeDef[];
  items!: ItemDef[];
  aliens!: AlienDef[];
  invasions!: InvasionDef[];
  biomes!: BiomeDef[];
  nodes!: NodeDef[];
  pois!: PoiDef[];
  vehicles!: VehicleDef[];
  worldEvents!: WorldEventDef[];
  missions!: MissionDef[];
  firstMission!: string;
  dailyMissionPool!: string[];
  adPlacements!: AdPlacementDef[];
  products!: ProductDef[];
  cosmetics!: CosmeticDef[];
  vip!: VipDef;
  season!: SeasonDef;
  dailyRewards!: Reward[];
  spinSegments!: SpinSegment[];
  starterKit!: GameData['starterKit'];
  balance!: BalanceDef;
  expeditions!: ExpeditionDef[];
  expeditionRules!: ExpeditionRules;

  private maps: Record<string, Map<string, any>> = {};

  constructor(data: GameData) {
    Object.assign(this, data);
    this.maps.resource = index(data.resources, 'resource');
    this.maps.building = index(data.buildings, 'building');
    this.maps.profession = index(data.professions, 'profession');
    this.maps.trait = index(data.traits, 'trait');
    this.maps.research = index(data.research, 'research');
    this.maps.recipe = index(data.recipes, 'recipe');
    this.maps.item = index(data.items, 'item');
    this.maps.alien = index(data.aliens, 'alien');
    this.maps.biome = index(data.biomes, 'biome');
    this.maps.node = index(data.nodes, 'node');
    this.maps.poi = index(data.pois, 'poi');
    this.maps.vehicle = index(data.vehicles, 'vehicle');
    this.maps.worldEvent = index(data.worldEvents, 'worldEvent');
    this.maps.mission = index(data.missions, 'mission');
    this.maps.ad = index(data.adPlacements, 'ad');
    this.maps.product = index(data.products, 'product');
    this.maps.cosmetic = index(data.cosmetics, 'cosmetic');
    this.maps.expedition = index(data.expeditions ?? [], 'expedition');
  }

  resource(id: string): ResourceDef | undefined { return this.maps.resource.get(id); }
  building(id: string): BuildingDef | undefined { return this.maps.building.get(id); }
  profession(id: string): ProfessionDef | undefined { return this.maps.profession.get(id); }
  trait(id: string): TraitDef | undefined { return this.maps.trait.get(id); }
  researchDef(id: string): ResearchDef | undefined { return this.maps.research.get(id); }
  recipe(id: string): RecipeDef | undefined { return this.maps.recipe.get(id); }
  item(id: string): ItemDef | undefined { return this.maps.item.get(id); }
  alien(id: string): AlienDef | undefined { return this.maps.alien.get(id); }
  biome(id: string): BiomeDef | undefined { return this.maps.biome.get(id); }
  node(id: string): NodeDef | undefined { return this.maps.node.get(id); }
  poi(id: string): PoiDef | undefined { return this.maps.poi.get(id); }
  vehicle(id: string): VehicleDef | undefined { return this.maps.vehicle.get(id); }
  worldEvent(id: string): WorldEventDef | undefined { return this.maps.worldEvent.get(id); }
  mission(id: string): MissionDef | undefined { return this.maps.mission.get(id); }
  ad(id: string): AdPlacementDef | undefined { return this.maps.ad.get(id); }
  product(id: string): ProductDef | undefined { return this.maps.product.get(id); }
  cosmetic(id: string): CosmeticDef | undefined { return this.maps.cosmetic.get(id); }
  expedition(id: string): ExpeditionDef | undefined { return this.maps.expedition.get(id); }
  tier(index: number): TierDef { return this.tiers[Math.max(0, Math.min(this.tiers.length - 1, index))]; }
  invasion(tier: number): InvasionDef {
    let best = this.invasions[0];
    for (const inv of this.invasions) if (inv.tier <= tier && inv.tier >= best.tier) best = inv;
    return best;
  }
}

export function defaultData(): GameData {
  return {
    resources: RESOURCES,
    tiers: TIERS,
    buildings: BUILDINGS,
    professions: PROFESSIONS,
    traits: TRAITS,
    names: NAMES,
    research: RESEARCH,
    recipes: RECIPES,
    items: ITEMS,
    aliens: ALIENS,
    invasions: INVASIONS,
    biomes: BIOMES,
    nodes: NODES,
    pois: POIS,
    vehicles: VEHICLES,
    worldEvents: WORLD_EVENTS,
    missions: MISSIONS,
    firstMission: FIRST_MISSION,
    dailyMissionPool: DAILY_MISSION_POOL,
    adPlacements: AD_PLACEMENTS,
    products: PRODUCTS,
    cosmetics: COSMETICS,
    vip: VIP,
    season: SEASON,
    dailyRewards: DAILY_REWARDS,
    spinSegments: SPIN_SEGMENTS,
    starterKit: STARTER_KIT,
    balance: BALANCE,
    expeditions: EXPEDITIONS,
    expeditionRules: EXPEDITION_RULES,
  };
}

export function createDataRegistry(data: GameData = defaultData()): DataRegistry {
  return new DataRegistry(data);
}
