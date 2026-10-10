import type { Modifier, ResearchCategory, ResearchDef, ResourceBag } from './schema';
import { BUILDINGS } from './buildings';
import { RECIPES } from './recipes';
import { VEHICLES } from './vehicles';
import { BIOMES } from './world';
import { PACING, pace, roundCost, scaleBag } from './pacing';

/**
 * Technology tree: 90 nodes across all 11 categories. "Spend RP, unlock instantly."
 *  - Tier gates: tier_reinforced, tier_stone, tier_steel, tier_alloy, tier_nano, tier_titanium (TierDef.research).
 *  - Building / recipe / vehicle / region unlocks are authored on the defs themselves (`research` field) and
 *    mirrored into `unlocks` below, so the two can never drift apart.
 *  - A refinery chain always precedes the tier that needs its product (e.g. nano_assembly + energy_cells gate tier_nano).
 *  - `pos` = [column, row] inside the category; column = dependency depth within the category (computed).
 * RP budget guide (per-minute research at the end of each tier): ~15, ~60, ~140, ~450, ~800, ~1500+; costs are tuned so
 * an engaged player has researched nearly everything by the time the Titanium tier is done (the gate chains never stall).
 */
type Node = Omit<ResearchDef, 'pos' | 'unlocks'> & { pos?: [number, number] };

const T = (id: string, name: string, icon: string, category: ResearchCategory, tier: number, cost: number, requires: string[], description: string, extra: { effects?: Modifier[]; resources?: ResourceBag } = {}): Node => ({
  id, name, icon, category, tier, cost, requires, description, ...extra,
});

const NODES: Node[] = [
  // ================================================================== CONSTRUCTION — the tier ladder
  T('tier_reinforced', 'Reinforced Wood', '🪵', 'construction', 0, 25, [], 'Lash and brace timber. Unlocks the Reinforced Wood colony tier.'),
  T('tier_stone', 'Masonry', '🪨', 'construction', 1, 120, ['tier_reinforced'], 'Cut and stack stone. Unlocks the Stone colony tier.'),
  T('scaffolding', 'Carpentry & Scaffolding', '🪜', 'construction', 1, 30, ['tier_reinforced'], 'Cabins, platforms, stairs and pillars. Build up, not just out.', { effects: [{ stat: 'buildSpeed', add: 0.1 }] }),
  T('mason_trade', "Stonemason's Trade", '🧱', 'construction', 2, 90, ['tier_stone'], 'Stone lodges and big stone warehouses. Solid in every sense.', { effects: [{ stat: 'structureHp', add: 0.1 }] }),
  T('tier_steel', 'Steelworking', '🔩', 'construction', 2, 600, ['tier_stone', 'basic_mining', 'workshop_tools'], 'Riveted steel and humming power lines. Unlocks the Steel colony tier.', { resources: { iron: 100, steel: 30 } }),
  T('steel_frames', 'Steel Framing', '🏗️', 'construction', 3, 250, ['tier_steel'], 'Steel dorms, vaults and silos, plus sliding doors and reinforced gates.', { effects: [{ stat: 'structureHp', add: 0.1 }, { stat: 'buildSpeed', add: 0.1 }, { stat: 'storage', add: 0.05 }] }),
  T('tier_alloy', 'Advanced Alloys', '🛡️', 'construction', 3, 1800, ['tier_steel', 'alloy_smelting', 'circuitry'], 'Crystal-infused alloy panels. Unlocks the Advanced Alloy colony tier.', { resources: { steel: 100, crystal: 40, alloy: 20 } }),
  T('alloy_architecture', 'Alloy Architecture', '🏙️', 'construction', 4, 1000, ['tier_alloy'], 'Habitat towers, crystal vaults, mega warehouses and automated gates.', { effects: [{ stat: 'structureHp', add: 0.15 }, { stat: 'storage', add: 0.1 }] }),
  T('tier_nano', 'Nano-Tech', '✨', 'construction', 4, 8400, ['tier_alloy', 'nano_assembly', 'energy_cells'], 'Self-repairing nano surfaces. Unlocks the Nano-Tech tier, nano residences and nano vaults.', { resources: { alloy: 100, nano: 20, energy_cell: 40 }, effects: [{ stat: 'structureHp', add: 0.1 }] }),

  // ================================================================== POWER
  T('basic_circuits', 'Basic Circuits', '⚡', 'power', 3, 260, ['tier_steel'], 'Fuel generators, wind turbines, solar panels, batteries and pylons. Let there be light.', { effects: [{ stat: 'power', add: 0.05 }] }),
  T('geothermal_tech', 'Geothermal Tapping', '🌋', 'power', 4, 1100, ['basic_circuits', 'tier_alloy'], 'Tap the planet’s heat for huge, steady power. Also unlocks solar arrays.', { effects: [{ stat: 'power', add: 0.1 }] }),
  T('fusion_theory', 'Fusion Theory', '☢️', 'power', 5, 5200, ['geothermal_tech', 'tier_nano'], 'Hold a star in a bottle. Unlocks the fusion reactor.', { effects: [{ stat: 'power', add: 0.15 }] }),
  T('grid_optimization', 'Grid Optimization', '🔌', 'power', 5, 6800, ['fusion_theory'], 'Smart grid routing wastes less power everywhere.', { effects: [{ stat: 'power', add: 0.25 }] }),
  T('titanium_fusion', 'Titanium Fusion', '🌟', 'power', 6, 14400, ['grid_optimization', 'tier_titanium'], 'Titanium containment unlocks the colossal Fusion Core.', { effects: [{ stat: 'power', add: 0.3 }] }),

  // ================================================================== FOOD
  T('crop_rotation', 'Crop Rotation', '🥕', 'food', 1, 40, ['tier_reinforced'], 'Veggie farms and a proper larder. Bigger harvests all round.', { effects: [{ stat: 'production:food', add: 0.1 }] }),
  T('greenhouse_design', 'Greenhouse Design', '🌱', 'food', 2, 100, ['crop_rotation', 'tier_stone'], 'Glasshouses grow food all year round.', { effects: [{ stat: 'production:food', add: 0.1 }] }),
  T('culinary_arts', 'Culinary Arts', '🍳', 'food', 2, 90, ['greenhouse_design'], 'Kitchens and cooks turn plain food into hearty feasts.', { effects: [{ stat: 'happiness', add: 0.03 }] }),
  T('hydroponics_tech', 'Hydroponics', '🥬', 'food', 3, 320, ['culinary_arts', 'basic_circuits'], 'Soil-free farming and bio digesters.', { effects: [{ stat: 'production:food', add: 0.1 }] }),
  T('farm_automation', 'Farm Automation', '🌾', 'food', 4, 1300, ['hydroponics_tech', 'tier_alloy'], 'Seeders, sprinklers and harvesters that run themselves.', { effects: [{ stat: 'production:food', add: 0.15 }] }),
  T('vertical_agri', 'Vertical Agriculture', '🏗️', 'food', 5, 5200, ['farm_automation', 'tier_nano'], 'Farm skyscrapers that feed a whole city.', { effects: [{ stat: 'production:food', add: 0.2 }] }),
  T('bio_dome_tech', 'Bio Dome', '🌍', 'food', 6, 12800, ['vertical_agri', 'tier_titanium'], 'Self-running domed ecosystems: fully automated abundance.', { effects: [{ stat: 'production:food', add: 0.25 }] }),

  // ================================================================== WATER
  T('water_storage', 'Water Works', '🛢️', 'water', 1, 35, ['tier_reinforced'], 'Cisterns for storage and pumps that draw from deep underground.', { effects: [{ stat: 'production:water', add: 0.1 }] }),
  T('filtration', 'Water Filtration', '🚰', 'water', 3, 280, ['water_storage', 'basic_circuits'], 'Purifiers turn any water into crisp, clean water.', { effects: [{ stat: 'production:water', add: 0.1 }] }),
  T('industrial_filtration', 'Industrial Filtration', '💦', 'water', 4, 1200, ['filtration', 'tier_alloy'], 'Massive filtration towers for a river of clean water.', { effects: [{ stat: 'production:water', add: 0.15 }] }),
  T('atmospheric_harvest', 'Atmospheric Harvest', '☁️', 'water', 5, 4800, ['industrial_filtration', 'tier_nano'], 'Pull water straight out of thin air.', { effects: [{ stat: 'production:water', add: 0.2 }] }),

  // ================================================================== DEFENSE
  T('watchtowers', 'Watchtowers', '🗼', 'defense', 1, 40, ['tier_reinforced'], 'Guard towers and swinging log traps. A guard in the tower fires 50% harder.', { effects: [{ stat: 'turretRange', add: 0.05 }] }),
  T('crossfire_doctrine', 'Crossfire Doctrine', '🏹', 'defense', 2, 160, ['watchtowers', 'tier_stone'], 'Crossfire towers, auto sentry guns and stone barricades.', { effects: [{ stat: 'turretDamage', add: 0.05 }] }),
  T('machine_guns', 'Machine Guns', '🔫', 'defense', 3, 400, ['crossfire_doctrine', 'tier_steel'], 'Belt-fed machine-gun turrets that also shoot flyers.', { effects: [{ stat: 'turretDamage', add: 0.08 }] }),
  T('electric_fencing', 'Shock & Flame', '⚡', 'defense', 3, 420, ['machine_guns', 'basic_circuits'], 'Electric fences and flamethrower turrets for the up-close crowd.', { effects: [{ stat: 'structureHp', add: 0.05 }] }),
  T('anti_air', 'Anti-Air Defense', '🎯', 'defense', 3, 480, ['machine_guns'], 'Flak guns for the skies. Research it before the first flyers come calling.', { effects: [{ stat: 'turretRange', add: 0.05 }] }),
  T('heavy_ordnance', 'Heavy Ordnance', '🚀', 'defense', 4, 2100, ['electric_fencing', 'tier_alloy'], 'Missile turrets, heavy sentries and big cannons.', { effects: [{ stat: 'turretDamage', add: 0.1 }, { stat: 'invasionReward', add: 0.1 }] }),
  T('shield_tech', 'Shield Technology', '🔰', 'defense', 4, 2400, ['heavy_ordnance', 'geothermal_tech'], 'Dome shields that soak damage and recharge between waves.', { effects: [{ stat: 'structureHp', add: 0.1 }] }),
  T('energy_weapons', 'Energy Weapons', '🔆', 'defense', 5, 6800, ['heavy_ordnance', 'tier_nano'], 'Laser turrets and arc barriers. Pew pew.', { effects: [{ stat: 'turretDamage', add: 0.1 }, { stat: 'invasionReward', add: 0.1 }] }),
  T('barrier_tech', 'Barrier Technology', '🛡️', 'defense', 5, 7500, ['shield_tech', 'energy_weapons'], 'Energy barriers and flak batteries.', { effects: [{ stat: 'turretRange', add: 0.1 }] }),
  T('plasma_tech', 'Plasma Turrets', '🟣', 'defense', 6, 16000, ['energy_weapons', 'tier_titanium'], 'Super-heated plasma that melts armor.', { effects: [{ stat: 'turretDamage', add: 0.15 }] }),
  T('railgun_tech', 'Railgun Towers', '🔱', 'defense', 6, 19200, ['plasma_tech'], 'Railguns and titanium sentry cannons.', { effects: [{ stat: 'turretDamage', add: 0.15 }, { stat: 'turretRange', add: 0.1 }] }),
  T('titan_shielding', 'Titanium Aegis', '🔷', 'defense', 6, 17600, ['barrier_tech', 'tier_titanium'], 'The colony-wide aegis shield and the Sky Lance.', { effects: [{ stat: 'structureHp', add: 0.2 }] }),

  // ================================================================== WEAPONS (personal gear)
  T('shotgun_design', 'Shotgun Design', '🔫', 'weapons', 1, 45, ['tier_reinforced'], 'Craft the Colony Shotgun. Short range, big boom.', { effects: [{ stat: 'playerDamage', add: 0.1 }] }),
  T('armor_plating', 'Armor Plating', '🥋', 'weapons', 2, 100, ['tier_stone', 'shotgun_design'], 'Plated vests and steel armor for the colony hero.', { effects: [{ stat: 'playerHp', add: 0.1 }] }),
  T('assault_rifle_tech', 'Assault Rifles', '🔫', 'weapons', 3, 350, ['armor_plating', 'tier_steel'], 'Fully automatic rifles for the colony hero.', { effects: [{ stat: 'playerDamage', add: 0.1 }] }),
  T('energy_rifle_tech', 'Energy Rifles', '🔫', 'weapons', 4, 1400, ['assault_rifle_tech', 'tier_alloy'], 'Crystal-powered rifles that never need reloading.', { effects: [{ stat: 'playerDamage', add: 0.15 }] }),
  T('plasma_rifle_tech', 'Plasma Rifles', '🔫', 'weapons', 5, 6800, ['energy_rifle_tech', 'tier_nano'], 'Hand-held plasma. Sizzle.', { effects: [{ stat: 'playerDamage', add: 0.2 }] }),
  T('titanium_rifle_tech', 'Titanium Rifles', '🔫', 'weapons', 6, 14400, ['plasma_rifle_tech', 'tier_titanium'], 'The ultimate personal weapon.', { effects: [{ stat: 'playerDamage', add: 0.25 }, { stat: 'playerHp', add: 0.15 }] }),

  // ================================================================== AUTOMATION
  T('logging_efficiency', 'Logging Efficiency', '🪓', 'automation', 1, 40, ['tier_reinforced'], 'Sawmills turn logs into planks fast.', { effects: [{ stat: 'production:wood', add: 0.1 }] }),
  T('basic_mining', 'Mining & Smelting', '⛏️', 'automation', 2, 110, ['tier_stone'], 'Iron, copper and coal mines, ore silos and the smelter.', { effects: [{ stat: 'production:iron', add: 0.1 }, { stat: 'production:steel', add: 0.05 }] }),
  T('workshop_tools', 'Workshop Tools', '🔨', 'automation', 2, 100, ['tier_stone'], 'The forge and the workshop. Real crafting begins.', { effects: [{ stat: 'craftSpeed', add: 0.1 }] }),
  T('electric_drilling', 'Powered Harvesting', '🔩', 'automation', 3, 380, ['basic_mining', 'basic_circuits'], 'Electric drill rigs and automated tree harvesters.', { effects: [{ stat: 'production:wood', add: 0.1 }, { stat: 'production:stone', add: 0.1 }] }),
  T('circuitry', 'Circuitry', '🔌', 'automation', 3, 420, ['basic_mining', 'basic_circuits'], 'Electronics labs and repair bays. Components for everything.', { effects: [{ stat: 'production:electronics', add: 0.1 }] }),
  T('alloy_smelting', 'Alloy Smelting', '🛡️', 'automation', 3, 650, ['electric_drilling', 'circuitry'], 'Crystal extractors and the alloy foundry.', { effects: [{ stat: 'production:crystal', add: 0.1 }, { stat: 'production:alloy', add: 0.1 }] }),
  T('assembly_lines', 'Assembly Lines', '🏭', 'automation', 3, 600, ['workshop_tools', 'circuitry'], 'Automated factories: pick a recipe, watch it go.', { effects: [{ stat: 'craftSpeed', add: 0.15 }] }),
  T('automated_mining', 'Automated Mining', '🛠️', 'automation', 4, 1500, ['electric_drilling', 'tier_alloy'], 'Mining rigs that work around the clock.', { effects: [{ stat: 'production:copper', add: 0.1 }, { stat: 'production:coal', add: 0.1 }] }),
  T('energy_cells', 'Energy Cells', '🔋', 'automation', 4, 1500, ['circuitry', 'tier_alloy'], 'Crystal-charged cells and the cell plant.', { effects: [{ stat: 'production:energy_cell', add: 0.1 }] }),
  T('mass_production', 'Mass Production', '🏭', 'automation', 4, 2000, ['assembly_lines', 'tier_alloy'], 'Fabricator benches and large factories.', { effects: [{ stat: 'craftSpeed', add: 0.2 }] }),
  T('nano_assembly', 'Nano Assembly', '✨', 'automation', 4, 2800, ['alloy_smelting', 'energy_cells'], 'Build with machines too small to see. Unlocks the nanoforge.', { effects: [{ stat: 'production:nano', add: 0.1 }] }),
  T('matter_conversion', 'Matter Conversion', '⚗️', 'automation', 5, 6000, ['nano_assembly', 'tier_nano'], 'Turn rubble and weeds into ore.', { effects: [{ stat: 'production', add: 0.05 }] }),

  // ================================================================== ROBOTICS
  T('field_robotics', 'Field Robotics', '🤖', 'robotics', 4, 1800, ['circuitry', 'tier_alloy'], 'Robot bays and drone crafting. Beep boop.', { effects: [{ stat: 'colonistSpeed', add: 0.1 }] }),
  T('automated_logistics', 'Automated Logistics', '📦', 'robotics', 4, 2100, ['field_robotics'], 'Sorting robots and logistics depots. Offline storage grows.', { effects: [{ stat: 'storage', add: 0.1 }, { stat: 'offlineHours', add: 2 }] }),
  T('drone_workers', 'Drone Workers', '🛸', 'robotics', 5, 6300, ['field_robotics', 'tier_nano'], 'Drone hubs, nano factories and repair drones.', { effects: [{ stat: 'production', add: 0.05 }, { stat: 'repairSpeed', add: 0.3 }] }),
  T('combat_drones', 'Combat Drones', '🛩️', 'robotics', 5, 7500, ['drone_workers', 'energy_weapons'], 'Armed drones that buzz after aliens.', { effects: [{ stat: 'turretDamage', add: 0.05 }] }),
  T('ai_core', 'AI Core', '🧠', 'robotics', 6, 16000, ['automated_logistics', 'tier_titanium'], 'A thinking logistics hub that keeps everything flowing.', { effects: [{ stat: 'production', add: 0.1 }] }),
  T('drone_swarm_tech', 'Drone Swarms', '🐝', 'robotics', 6, 17600, ['combat_drones', 'tier_titanium'], 'Glittering swarms of combat drones.', { effects: [{ stat: 'turretDamage', add: 0.1 }] }),

  // ================================================================== EXPLORATION
  T('sharper_tools', 'Sharper Tools', '🪓', 'exploration', 0, 15, [], 'Gather 25% more from every node.', { effects: [{ stat: 'gatherYield', add: 0.25 }] }),
  T('engine_basics', 'Engine Basics', '🏍️', 'exploration', 1, 45, ['sharper_tools'], 'Garages and the rugged ATV.', { effects: [{ stat: 'moveSpeed', add: 0.05 }] }),
  T('iron_tools', 'Iron Tools', '⛏️', 'exploration', 2, 90, ['sharper_tools', 'tier_stone'], 'The iron pickaxe cracks crystal clusters, bio-pods and alien scrap.', { effects: [{ stat: 'gatherYield', add: 0.15 }] }),
  T('off_road', 'Off-Road Suspension', '🚙', 'exploration', 2, 110, ['engine_basics', 'iron_tools'], 'The Dune Buggy: fast, bouncy and fun.', { effects: [{ stat: 'moveSpeed', add: 0.05 }] }),
  T('steel_tools', 'Steel Tools', '🛠️', 'exploration', 3, 300, ['iron_tools', 'tier_steel'], 'The Steel Harvester gathers faster and further.', { effects: [{ stat: 'gatherYield', add: 0.1 }, { stat: 'gatherSpeed', add: 0.1 }] }),
  T('heavy_haulers', 'Heavy Haulers', '🚚', 'exploration', 3, 360, ['off_road', 'tier_steel'], 'The Mining Truck hauls a mountain of ore.', { effects: [{ stat: 'moveSpeed', add: 0.05 }] }),
  T('alloy_tools', 'Alloy Tools', '🔩', 'exploration', 4, 1300, ['steel_tools', 'tier_alloy'], 'The Alloy Drill-Pick can harvest titanium.', { effects: [{ stat: 'gatherYield', add: 0.15 }] }),
  T('hover_tech', 'Hover Technology', '🛵', 'exploration', 4, 1700, ['heavy_haulers', 'tier_alloy'], 'Hangars, hover bikes and armored rovers.', { effects: [{ stat: 'moveSpeed', add: 0.05 }] }),
  T('nano_tools', 'Nano Tools', '✂️', 'exploration', 5, 5200, ['alloy_tools', 'tier_nano'], 'The Nano Cutter makes every node a breeze.', { effects: [{ stat: 'gatherYield', add: 0.2 }, { stat: 'gatherSpeed', add: 0.15 }] }),
  T('teleportation', 'Teleportation', '🌀', 'exploration', 5, 7200, ['hover_tech', 'tier_nano'], 'Teleporter pads: no more long walks.', { effects: [{ stat: 'moveSpeed', add: 0.05 }] }),
  T('titan_hover', 'Titanium Hover Drive', '🛸', 'exploration', 6, 14400, ['teleportation', 'tier_titanium'], 'The Titanium Hovercraft and the Titanium Gateway.', { effects: [{ stat: 'moveSpeed', add: 0.1 }] }),

  // ================================================================== COLONISTS
  T('radio_comms', 'Radio Comms', '📻', 'colonists', 1, 30, ['tier_reinforced'], 'A radio tower and the recruitment board. Survivors answer the call.'),
  T('community_spirit', 'Community Spirit', '🌿', 'colonists', 1, 35, ['radio_comms'], 'Herb gardens and banners. Colonists feel at home.', { effects: [{ stat: 'happiness', add: 0.03 }] }),
  T('laboratory_science', 'Laboratory Science', '🧪', 'colonists', 2, 120, ['tier_stone'], 'Proper labs for your scientists.', { effects: [{ stat: 'research', add: 0.1 }] }),
  T('recruitment_drive', 'Recruitment Drive', '📣', 'colonists', 2, 120, ['radio_comms', 'tier_stone'], 'More candidates on the board and zippier colonists.', { effects: [{ stat: 'recruitSlots', add: 1 }, { stat: 'colonistSpeed', add: 0.1 }] }),
  T('medicine', 'Medicine', '🩺', 'colonists', 2, 110, ['tier_stone'], 'Medical bays, the colony clinic and medkits.', { effects: [{ stat: 'happiness', add: 0.03 }] }),
  T('team_building', 'Team Building', '⛲', 'colonists', 2, 100, ['community_spirit', 'tier_stone'], 'Fountains and statues bring everyone together.', { effects: [{ stat: 'happiness', add: 0.04 }] }),
  T('recreation', 'Recreation', '🕹️', 'colonists', 3, 330, ['team_building', 'tier_steel'], 'Arcades, observatories, cinemas and sculpture gardens.', { effects: [{ stat: 'happiness', add: 0.04 }] }),
  T('advanced_science', 'Advanced Science', '🔬', 'colonists', 4, 1800, ['laboratory_science', 'tier_alloy'], 'Advanced labs with holographic instruments.', { effects: [{ stat: 'research', add: 0.15 }] }),
  T('trauma_medicine', 'Trauma Medicine', '💉', 'colonists', 5, 5700, ['medicine', 'tier_nano'], 'Nano-healing beds. A wider recruiting net, too.', { effects: [{ stat: 'recruitSlots', add: 1 }, { stat: 'happiness', add: 0.04 }] }),
  T('nano_wellness', 'Nano Wellness', '🎭', 'colonists', 5, 6300, ['recreation', 'tier_nano'], 'Holo theaters and neon skyparks.', { effects: [{ stat: 'happiness', add: 0.08 }] }),
  T('titan_living', 'Titanium Living', '🏙️', 'colonists', 6, 19200, ['nano_wellness', 'tier_titanium'], 'Skyscrapers, sky gardens, monuments, phase doors and regeneration pods.', { effects: [{ stat: 'happiness', add: 0.1 }] }),

  // ================================================================== TITANIUM
  T('titanium_extraction', 'Titanium Extraction', '🌟', 'titanium', 5, 8200, ['automated_mining', 'tier_nano'], 'Titanium drills and the titanium refinery. Brilliant metal from the Highlands.', { effects: [{ stat: 'production:titanium', add: 0.1 }] }),
  T('tier_titanium', 'Titanium Age', '💠', 'titanium', 5, 21000, ['tier_nano', 'titanium_extraction', 'fusion_theory'], 'The pinnacle: a gleaming titanium fortress. Unlocks the Titanium colony tier.', { resources: { titanium: 100, nano: 60 } }),
  T('titan_alloys', 'Titanium Alloys', '🛡️', 'titanium', 6, 12800, ['tier_titanium'], 'Every wall, gate and tower gets even tougher.', { effects: [{ stat: 'structureHp', add: 0.25 }] }),
  T('quantum_computing', 'Quantum Computing', '⚛️', 'titanium', 6, 19200, ['tier_titanium', 'advanced_science'], 'The Quantum Lab: research at ludicrous speed.', { effects: [{ stat: 'research', add: 0.25 }] }),
  T('quantum_storage_tech', 'Quantum Storage', '🌌', 'titanium', 6, 16000, ['tier_titanium', 'alloy_architecture'], 'Matter as information: storage without limits.', { effects: [{ stat: 'storage', add: 0.25 }, { stat: 'offlineHours', add: 2 }] }),
  T('titan_manufacturing', 'Titanium Manufacturing', '🏭', 'titanium', 6, 19200, ['tier_titanium', 'mass_production'], 'The Titan Factory, Titan Forge and repair array.', { effects: [{ stat: 'craftSpeed', add: 0.25 }, { stat: 'repairSpeed', add: 0.3 }] }),
  T('colony_mastery', 'Colony Mastery', '👑', 'titanium', 6, 24000, ['titan_alloys', 'quantum_storage_tech', 'titan_manufacturing'], 'You built all of this. Longer offline production, richer invasion chests, a wider recruiting net.', { effects: [{ stat: 'offlineHours', add: 4 }, { stat: 'invasionReward', add: 0.25 }, { stat: 'recruitSlots', add: 1 }] }),
];

// ---------------------------------------------------------------------------------------------
// Derived: tree layout + mirrored unlock lists
// ---------------------------------------------------------------------------------------------

function layout(nodes: Node[]): Map<string, [number, number]> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const depth = new Map<string, number>();
  const depthOf = (n: Node): number => {
    const cached = depth.get(n.id);
    if (cached !== undefined) return cached;
    let d = 0;
    for (const r of n.requires) {
      const p = byId.get(r);
      if (p && p.category === n.category) d = Math.max(d, depthOf(p) + 1);
    }
    depth.set(n.id, d);
    return d;
  };
  const rows = new Map<string, number>();
  const out = new Map<string, [number, number]>();
  for (const n of nodes) {
    const col = depthOf(n);
    const key = `${n.category}:${col}`;
    const row = rows.get(key) ?? 0;
    rows.set(key, row + 1);
    out.set(n.id, [col, row]);
  }
  return out;
}

function unlocksFor(id: string): ResearchDef['unlocks'] | undefined {
  const buildings = BUILDINGS.filter((b) => b.research === id).map((b) => b.id);
  const recipes = RECIPES.filter((r) => r.research === id).map((r) => r.id);
  const vehicles = VEHICLES.filter((v) => v.research === id).map((v) => v.id);
  const regions = BIOMES.filter((b) => b.unlock.research === id).map((b) => b.id);
  if (!buildings.length && !recipes.length && !vehicles.length && !regions.length) return undefined;
  const u: NonNullable<ResearchDef['unlocks']> = {};
  if (buildings.length) u.buildings = buildings;
  if (recipes.length) u.recipes = recipes;
  if (vehicles.length) u.vehicles = vehicles;
  if (regions.length) u.regions = regions;
  return u;
}

const POS = layout(NODES);

/** RP and resource costs are paced by the tech's tier (data/pacing.ts). */
export const RESEARCH: ResearchDef[] = NODES.map((n) => {
  const m = pace(PACING.research, n.tier);
  const def: ResearchDef = { ...n, cost: m === 1 ? n.cost : roundCost(n.cost * m), pos: POS.get(n.id)! };
  if (n.resources) def.resources = scaleBag(n.resources, m);
  const unlocks = unlocksFor(n.id);
  if (unlocks) def.unlocks = unlocks;
  return def;
});
