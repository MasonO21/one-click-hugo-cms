import type { MissionDef, Reward } from './schema';

/**
 * Main chain = the guided first 15 minutes, then a gentle story through every tier up to the Titanium
 * Super-Colony (69 missions, a single linear path via `next`). Side missions are short themed chains (a few heads
 * always available alongside the main chain); dailies are drawn from DAILY_MISSION_POOL.
 *
 * Timeline target for the opening (see docs/DESIGN.md "First 15 minutes"):
 *   0-2 gather wood · 2-4 shelter · 4-6 campfire + storage · 6-8 rescue survivor ·
 *   8-10 colonist works logging camp · 10-12 first turret · 12 warning · 13 attack ·
 *   14 reward chest · 15 Reinforced Wood research available.
 * Approximate main-chain schedule (engaged player): Reinforced ~15 min, Stone ~1 h, Steel ~3 h, Alloy ~6 h,
 * Nano ~12 h, Titanium ~24-30 h; each mission is 2-10 minutes early on and stretches to an hour or more by the end.
 */
export const FIRST_MISSION = 'm01_wood';

const R = (r: Reward): Reward => r;

export const MISSIONS: MissionDef[] = [
  // ====================================================================== TIER 0 — the first 15 minutes
  {
    id: 'm01_wood', chain: 'main', name: 'Timber!', description: 'Gather 80 Wood from the bubble trees near your pod.',
    type: 'gather', target: 'wood', count: 80, reward: R({ resources: { wood: 10 }, xp: 10 }), next: ['m02_shelter'],
    hint: 'Walk up to a tree — you will chop it automatically.', guide: { kind: 'node', ref: 'tree_round' },
  },
  {
    id: 'm02_shelter', chain: 'main', name: 'A Roof Overhead', description: 'Build a Lean-to Shelter.',
    type: 'build', target: 'shelter', count: 1, reward: R({ resources: { wood: 10, fiber: 10 }, xp: 15 }), next: ['m03_campfire'],
    hint: 'Open the Build menu and place a Lean-to Shelter.', guide: { kind: 'build_menu', ref: 'shelter' },
  },
  {
    id: 'm03_campfire', chain: 'main', name: 'Warm Glow', description: 'Gather some stone and build a Campfire.',
    type: 'build', target: 'campfire', count: 1, reward: R({ resources: { food: 15, fiber: 10, stone: 10 }, xp: 15 }), next: ['m04_storage'],
    hint: 'Mine a boulder for stone, then build a Campfire.', guide: { kind: 'build_menu', ref: 'campfire' },
  },
  {
    id: 'm04_storage', chain: 'main', name: 'Stash It', description: 'Build a Storage Crate.',
    type: 'build', target: 'storage_crate', count: 1, reward: R({ resources: { wood: 15, fiber: 15 }, xp: 15 }), next: ['m05_rescue'],
    hint: 'Storage increases how much you can hold.', guide: { kind: 'build_menu', ref: 'storage_crate' },
    onComplete: { spawnSurvivor: true },
  },
  {
    id: 'm05_rescue', chain: 'main', name: 'Not Alone', description: 'A survivor signal! Rescue them from their camp.',
    type: 'rescue', target: '*', count: 1, reward: R({ resources: { food: 20, water: 20 }, items: { bandage: 2 }, xp: 25 }), next: ['m06_logging'],
    hint: 'Follow the marker to the survivor camp and tap Rescue.', guide: { kind: 'poi', ref: 'survivor_camp' },
    onComplete: { celebrate: 'Your first colonist joined!' },
  },
  {
    id: 'm06_logging', chain: 'main', name: 'Many Hands', description: 'Build a Logging Camp — your colonist will work it automatically.',
    type: 'build', target: 'logging_camp', count: 1, reward: R({ resources: { stone: 10, fiber: 10, wood: 10 }, xp: 20 }), next: ['m07_assign'],
    hint: 'Build a Logging Camp near some trees.', guide: { kind: 'build_menu', ref: 'logging_camp' },
  },
  {
    id: 'm07_assign', chain: 'main', name: 'Put to Work', description: 'Have a colonist working a job.',
    type: 'assign', target: '*', count: 1, reward: R({ resources: { wood: 10 }, xp: 15 }), next: ['m08_turret'],
    hint: 'Colonists take free jobs automatically. Tap a building to manage workers.', guide: { kind: 'building', ref: 'logging_camp' },
  },
  {
    id: 'm08_turret', chain: 'main', name: 'Something Stirs', description: 'Strange noises at night... Build a Scrap Turret.',
    type: 'build', target: 'scrap_turret', count: 1, reward: R({ resources: { wood: 30, stone: 25 }, xp: 20 }), next: ['m09_defend'],
    hint: 'Place the turret between your camp and the wilds.', guide: { kind: 'build_menu', ref: 'scrap_turret' },
    onComplete: { attack: { delay: 20, warning: 120 } },
  },
  {
    id: 'm09_defend', chain: 'main', name: 'First Contact', description: 'Defend the colony from the alien attack.',
    type: 'defend', target: '*', count: 1, reward: R({ rp: 25, resources: { wood: 60, stone: 40 }, items: { supply_crate: 1 }, nova: 10, xp: 50 }), next: ['m10_research'],
    hint: 'Stand near your turret — it fires twice as fast with you beside it!', guide: { kind: 'building', ref: 'scrap_turret' },
    onComplete: { celebrate: 'Colony defended!' },
  },
  {
    id: 'm10_research', chain: 'main', name: 'Stronger Timber', description: 'Research Reinforced Wood.',
    type: 'research', target: 'tier_reinforced', count: 1, reward: R({ resources: { fiber: 40, stone: 20 }, xp: 25 }), next: ['m11_tier1'],
    hint: 'Open Research and unlock Reinforced Wood.', guide: { kind: 'ui', ref: 'research' },
  },
  {
    id: 'm11_tier1', chain: 'main', name: 'A Real Settlement', description: 'Upgrade your colony to Reinforced Wood.',
    type: 'tier', target: '*', count: 1, reward: R({ nova: 15, xp: 60, resources: { wood: 100, stone: 60, fiber: 40 } }), next: ['m12_desk'],
    hint: 'Tap your Command Center and upgrade the colony tier.', guide: { kind: 'building', ref: 'command_center' },
    onComplete: { celebrate: 'Reinforced Wood tier reached! The colony expands.' },
  },

  // ====================================================================== TIER 1 — Reinforced Wood (15 min → ~1 h)
  {
    id: 'm12_desk', chain: 'main', name: 'Thinking Cap', description: 'Build a Research Desk. Scientists turn curiosity into research points.',
    type: 'build', target: 'research_desk', count: 1, reward: R({ rp: 35, resources: { wood: 40, fiber: 20 }, xp: 25 }), next: ['m13_radio_research'],
    hint: 'A Research Desk makes research points even while you explore. A colonist scientist makes it faster.', guide: { kind: 'build_menu', ref: 'research_desk' },
  },
  {
    id: 'm13_radio_research', chain: 'main', name: 'Tune In', description: 'Research Radio Comms.',
    type: 'research', target: 'radio_comms', count: 1, reward: R({ resources: { wood: 50, fiber: 30 }, xp: 20 }), next: ['m14_radio_tower'],
    hint: 'Open Research, pick the Colonists tab, and unlock Radio Comms.', guide: { kind: 'ui', ref: 'research' },
  },
  {
    id: 'm14_radio_tower', chain: 'main', name: 'Calling All Survivors', description: 'Build a Radio Tower to open the recruitment board.',
    type: 'build', target: 'radio_tower', count: 1, reward: R({ resources: { food: 60, water: 40 }, xp: 30 }), next: ['m15_recruit'],
    hint: 'The Radio Tower lets survivors find you. Place it anywhere in the colony.', guide: { kind: 'build_menu', ref: 'radio_tower' },
  },
  {
    id: 'm15_recruit', chain: 'main', name: 'Fresh Faces', description: 'Recruit a colonist from the recruitment board.',
    type: 'recruit', target: '*', count: 1, reward: R({ resources: { food: 50, water: 30, wood: 40 }, xp: 30 }), next: ['m16_farm'],
    hint: 'Open the Recruit board, pick a candidate and tap Recruit. Make sure you have a free bed!', guide: { kind: 'ui', ref: 'recruit' },
  },
  {
    id: 'm16_farm', chain: 'main', name: 'Farm Fresh', description: 'Build a Veggie Farm to feed a growing colony.',
    type: 'build', target: 'veggie_farm', count: 1, reward: R({ resources: { food: 80, fiber: 40, wood: 40 }, xp: 30 }), next: ['m17_cabin'],
    hint: 'Research Crop Rotation, then place a Veggie Farm. Farmers will tend it automatically.', guide: { kind: 'build_menu', ref: 'veggie_farm' },
  },
  {
    id: 'm17_cabin', chain: 'main', name: 'Room for More', description: 'Build a Timber Cabin with four bunks.',
    type: 'build', target: 'cabin', count: 1, reward: R({ resources: { wood: 100, fiber: 40 }, xp: 35 }), next: ['m18_garage'],
    hint: 'Research Carpentry & Scaffolding, then build a Timber Cabin. More beds, more colonists.', guide: { kind: 'build_menu', ref: 'cabin' },
  },
  {
    id: 'm18_garage', chain: 'main', name: 'Gearhead', description: 'Build a Garage.',
    type: 'build', target: 'garage', count: 1, reward: R({ resources: { wood: 80, stone: 60, fiber: 40 }, xp: 35 }), next: ['m19_atv'],
    hint: 'Research Engine Basics, then build a Garage for vehicles.', guide: { kind: 'build_menu', ref: 'garage' },
  },
  {
    id: 'm19_atv', chain: 'main', name: 'Ride Time', description: 'Craft an ATV at the garage.',
    type: 'craft', target: 'r_vehicle_atv', count: 1, reward: R({ nova: 5, resources: { wood: 60, stone: 40 }, xp: 40 }), next: ['m19b_pinewood'],
    hint: 'Tap the garage, choose ATV, and craft it. Then hop on from the Vehicles panel!', guide: { kind: 'building', ref: 'garage' },
    onComplete: { celebrate: 'Your first vehicle! The planet just got smaller.' },
  },
  {
    id: 'm19b_pinewood', chain: 'main', name: 'Whispering Pines', description: 'Explore the Pinewood Forest. Survivors, cabins and berries wait among the trees.',
    type: 'discover', target: 'pinewood_forest', count: 1, reward: R({ resources: { wood: 120, fiber: 60, food: 60 }, items: { herbal_salve: 2 }, xp: 40 }), next: ['m20_desert'],
    hint: 'Open the map and head to the Pinewood Forest. Look for survivor camps and abandoned cabins!', guide: { kind: 'region', ref: 'pinewood_forest' },
  },
  {
    id: 'm20_desert', chain: 'main', name: 'Red Sands', description: 'Discover the Red Desert, rich in iron, copper and coal.',
    type: 'discover', target: 'red_desert', count: 1, reward: R({ resources: { iron: 60, copper: 40, coal: 40 }, xp: 50 }), next: ['m21_guard'],
    hint: 'Open the map and head to the Red Desert. The ATV makes it quick.', guide: { kind: 'region', ref: 'red_desert' },
  },
  {
    id: 'm21_guard', chain: 'main', name: 'Eyes on the Wall', description: 'Build a Guard Tower and put a colonist on guard duty.',
    type: 'build', target: 'guard_tower', count: 1, reward: R({ resources: { wood: 100, stone: 60 }, xp: 40 }), next: ['m22_research_stone'],
    hint: 'Research Watchtowers, build a tower, then tap it to assign a guard (+50% damage).', guide: { kind: 'build_menu', ref: 'guard_tower' },
  },
  {
    id: 'm22_research_stone', chain: 'main', name: 'Cut Stone', description: 'Research Masonry.',
    type: 'research', target: 'tier_stone', count: 1, reward: R({ resources: { wood: 150, stone: 120 }, rp: 30, xp: 45 }), next: ['m23_tier2'],
    hint: 'Research Masonry in the Construction tab. Your scientists are on it!', guide: { kind: 'ui', ref: 'research' },
  },
  {
    id: 'm23_tier2', chain: 'main', name: 'Solid Ground', description: 'Upgrade your colony to the Stone tier.',
    type: 'tier', target: '*', count: 2, reward: R({ nova: 25, xp: 100, resources: { stone: 250, wood: 200, iron: 60 }, items: { supply_crate: 2 } }), next: ['m23b_expedition'],
    hint: 'Gather the materials and upgrade your Command Center. Your storage has to hold the whole bill, so build a few Storage Sheds!', guide: { kind: 'building', ref: 'command_center' },
    onComplete: { celebrate: 'Stone tier reached! The colony looks permanent now.' },
  },

  // ====================================================================== TIER 2 — Stone (~1 h → ~3 h)
  {
    id: 'm23b_expedition', chain: 'main', name: 'Away Team', description: 'Send a squad of colonists on an expedition from the Radio Tower.',
    type: 'expedition', target: 'launch', count: 1, reward: R({ items: { supply_crate: 1 }, xp: 40 }), next: ['m24_forge'],
    hint: 'Tap the Radio Tower (or Menu › Expeditions). Pick a destination, up to three colonists, and wave them off!', guide: { kind: 'building', ref: 'radio_tower' },
  },
  {
    id: 'm24_forge', chain: 'main', name: 'Fire & Anvil', description: 'Build a Forge.',
    type: 'build', target: 'forge', count: 1, reward: R({ resources: { stone: 120, iron: 40, wood: 60 }, xp: 50 }), next: ['m25_mine'],
    hint: 'Research Workshop Tools, then place the Forge. It crafts metal gear.', guide: { kind: 'build_menu', ref: 'forge' },
  },
  {
    id: 'm25_mine', chain: 'main', name: 'Into the Hill', description: 'Build an Iron Mine and put miners to work.',
    type: 'build', target: 'iron_mine', count: 1, reward: R({ resources: { stone: 150, wood: 80, coal: 40 }, xp: 55 }), next: ['m26_smelter'],
    hint: 'Research Mining & Smelting, then build the mine. Colonists with the Miner job work it.', guide: { kind: 'build_menu', ref: 'iron_mine' },
  },
  {
    id: 'm26_smelter', chain: 'main', name: 'Steel Dreams', description: 'Build a Smelter. It melts iron and coal into steel.',
    type: 'build', target: 'smelter', count: 1, reward: R({ resources: { iron: 100, coal: 60, stone: 100 }, xp: 55 }), next: ['m27_pickaxe'],
    hint: 'Keep iron and coal flowing into the Smelter and steel comes out the other end.', guide: { kind: 'build_menu', ref: 'smelter' },
  },
  {
    id: 'm27_pickaxe', chain: 'main', name: 'Crack the Crystals', description: 'Craft an Iron Pickaxe at the Forge so you can mine crystals.',
    type: 'craft', target: 'r_iron_pickaxe', count: 1, reward: R({ resources: { iron: 60, coal: 30 }, items: { medkit: 1 }, xp: 50 }), next: ['m28_canyon'],
    hint: 'Research Iron Tools, then craft the pickaxe at the Forge and equip it from the Inventory.', guide: { kind: 'building', ref: 'forge' },
  },
  {
    id: 'm28_canyon', chain: 'main', name: 'Singing Stones', description: 'Discover Crystal Canyon.',
    type: 'discover', target: 'crystal_canyon', count: 1, reward: R({ resources: { crystal: 12, copper: 60 }, xp: 70 }), next: ['m29_crystal'],
    hint: 'Crystal Canyon lies to the east. Take your ATV and enjoy the view.', guide: { kind: 'region', ref: 'crystal_canyon' },
  },
  {
    id: 'm29_crystal', chain: 'main', name: 'Crystal Harvest', description: 'Gather 40 alien crystals.',
    type: 'gather', target: 'crystal', count: 40, reward: R({ resources: { crystal: 20, stone: 100 }, nova: 5, xp: 60 }), next: ['m30_kitchen'],
    hint: 'Equip your Iron Pickaxe and chop the glowing crystal clusters.', guide: { kind: 'node', ref: 'crystal_cluster' },
  },
  {
    id: 'm30_kitchen', chain: 'main', name: "What's Cooking?", description: 'Build a Colony Kitchen and assign a cook.',
    type: 'build', target: 'kitchen', count: 1, reward: R({ resources: { food: 150, water: 80, stone: 80 }, xp: 50 }), next: ['m30b_pump'],
    hint: 'Research Culinary Arts. Cooks turn food into bigger, tastier meals.', guide: { kind: 'build_menu', ref: 'kitchen' },
  },
  {
    id: 'm30b_pump', chain: 'main', name: 'Down the Well', description: 'Build a Water Pump. A bigger colony needs a bigger water supply.',
    type: 'build', target: 'water_pump', count: 1, reward: R({ resources: { water: 200, stone: 80, iron: 30 }, xp: 50 }), next: ['m31_lab'],
    hint: 'Research Water Works, then build a Water Pump. Water Technicians make it even faster. Colonists drink 0.5 water a minute.', guide: { kind: 'build_menu', ref: 'water_pump' },
  },
  {
    id: 'm31_lab', chain: 'main', name: 'Eureka!', description: 'Build a Research Lab.',
    type: 'build', target: 'research_lab', count: 1, reward: R({ rp: 120, resources: { stone: 120, iron: 60 }, xp: 60 }), next: ['m32_crossfire'],
    hint: 'Research Laboratory Science. Labs generate far more research points than desks.', guide: { kind: 'build_menu', ref: 'research_lab' },
  },
  {
    id: 'm32_crossfire', chain: 'main', name: 'Crossfire', description: 'Build a Crossfire Tower.',
    type: 'build', target: 'crossfire_tower', count: 1, reward: R({ resources: { stone: 150, iron: 80, coal: 40 }, xp: 60 }), next: ['m33_colonists10'],
    hint: 'Research Crossfire Doctrine. It unlocks crossfire towers, sentry guns and stone barricades.', guide: { kind: 'build_menu', ref: 'crossfire_tower' },
  },
  {
    id: 'm33_colonists10', chain: 'main', name: 'A Small Town', description: 'Have 10 colonists living in your colony.',
    type: 'colonists', target: '*', count: 10, reward: R({ nova: 10, resources: { food: 200, water: 120 }, items: { colonist_crate: 1 }, xp: 80 }), next: ['m34_research_steel'],
    hint: 'Build more beds and recruit colonists from the board. Survivor camps in the wilds count too.', guide: { kind: 'ui', ref: 'recruit' },
  },
  {
    id: 'm34_research_steel', chain: 'main', name: 'The Age of Steel', description: 'Research Steelworking.',
    type: 'research', target: 'tier_steel', count: 1, reward: R({ resources: { stone: 300, iron: 150, steel: 40 }, rp: 100, xp: 80 }), next: ['m35_tier3'],
    hint: 'Steelworking needs some iron and steel on hand. Research the prerequisites first.', guide: { kind: 'ui', ref: 'research' },
  },
  {
    id: 'm35_tier3', chain: 'main', name: 'Steel Colony', description: 'Upgrade your colony to the Steel tier.',
    type: 'tier', target: '*', count: 3, reward: R({ nova: 40, xp: 160, resources: { steel: 120, iron: 200, copper: 100, stone: 300 }, items: { supply_crate: 3 } }), next: ['m36_power'],
    hint: 'This one needs steel, iron, copper and a lot of stone. Warehouses and ore silos raise your storage cap; the tier-up panel shows what is missing.', guide: { kind: 'building', ref: 'command_center' },
    onComplete: { celebrate: 'Steel tier reached! Power, factories and machine guns await.' },
  },

  // ====================================================================== TIER 3 — Steel (~3 h → ~6 h)
  {
    id: 'm36_power', chain: 'main', name: 'Let There Be Light', description: 'Generate 100 power.',
    type: 'power', target: '*', count: 100, reward: R({ resources: { steel: 100, copper: 100, coal: 80 }, xp: 90 }), next: ['m37_electronics'],
    hint: 'Research Basic Circuits, then build fuel generators, wind turbines and solar panels. Production minus consumption shows at the top of the Build menu.', guide: { kind: 'build_menu', ref: 'fuel_generator' },
  },
  {
    id: 'm37_electronics', chain: 'main', name: 'Circuit Board Blues', description: 'Build an Electronics Lab.',
    type: 'build', target: 'electronics_lab', count: 1, reward: R({ resources: { copper: 150, steel: 80, stone: 150 }, rp: 150, xp: 90 }), next: ['m38_drill'],
    hint: 'Research Circuitry. The lab turns copper and fiber into electronics. Connect it to power!', guide: { kind: 'build_menu', ref: 'electronics_lab' },
  },
  {
    id: 'm38_drill', chain: 'main', name: 'Drill, Baby, Drill', description: 'Build an Electric Drill Rig.',
    type: 'build', target: 'electric_drill', count: 1, reward: R({ resources: { iron: 250, copper: 120, coal: 120 }, xp: 90 }), next: ['m39_factory'],
    hint: 'Research Powered Harvesting. Drills run on their own; a miner adds a +25% bonus.', guide: { kind: 'build_menu', ref: 'electric_drill' },
  },
  {
    id: 'm39_factory', chain: 'main', name: 'Hello, Factory', description: 'Build an Assembly Factory and craft something automatically.',
    type: 'build', target: 'factory', count: 1, reward: R({ resources: { steel: 200, electronics: 40, iron: 200 }, rp: 200, xp: 110 }), next: ['m40_marsh'],
    hint: 'Research Assembly Lines. Tap the factory, pick a recipe, and resources go in while products come out.', guide: { kind: 'build_menu', ref: 'factory' },
  },
  {
    id: 'm40_marsh', chain: 'main', name: 'Glow in the Bog', description: 'Discover the Toxic Marsh.',
    type: 'discover', target: 'toxic_marsh', count: 1, reward: R({ resources: { biomass: 40, electronics: 20 }, xp: 100 }), next: ['m41_mg'],
    hint: 'The Toxic Marsh lies to the south-west. Watch out for sleepy alien nests.', guide: { kind: 'region', ref: 'toxic_marsh' },
  },
  {
    id: 'm41_mg', chain: 'main', name: 'Rat-a-Tat', description: 'Have four Machine-Gun Turrets defending your colony.',
    type: 'have_building', target: 'mg_turret', count: 4, reward: R({ resources: { steel: 200, iron: 200, coal: 100 }, items: { stim_pack: 2 }, xp: 120 }), next: ['m42_foundry'],
    hint: 'Research Machine Guns. Guards in the turret make them fire 50% harder.', guide: { kind: 'build_menu', ref: 'mg_turret' },
  },
  {
    id: 'm42_foundry', chain: 'main', name: 'Molten Dreams', description: 'Build an Alloy Foundry.',
    type: 'build', target: 'alloy_foundry', count: 1, reward: R({ resources: { steel: 300, crystal: 60, electronics: 60 }, rp: 250, xp: 130 }), next: ['m43_research_alloy'],
    hint: 'Research Alloy Smelting. The foundry mixes steel and crystal into advanced alloy.', guide: { kind: 'build_menu', ref: 'alloy_foundry' },
  },
  {
    id: 'm43_research_alloy', chain: 'main', name: 'Crystal-Infused', description: 'Research Advanced Alloys.',
    type: 'research', target: 'tier_alloy', count: 1, reward: R({ resources: { steel: 400, electronics: 100, crystal: 50 }, rp: 300, xp: 140 }), next: ['m44_tier4'],
    hint: 'Advanced Alloys needs alloy, crystal and steel on hand. Keep that foundry running.', guide: { kind: 'ui', ref: 'research' },
  },
  {
    id: 'm44_tier4', chain: 'main', name: 'Alloy Colony', description: 'Upgrade your colony to the Advanced Alloy tier.',
    type: 'tier', target: '*', count: 4, reward: R({ nova: 60, xp: 240, resources: { alloy: 80, steel: 400, electronics: 120, crystal: 80 }, items: { tech_crate: 2 } }), next: ['m45_aa'],
    hint: 'A big one: steel, electronics, crystal and alloy. Steel Vaults raise your storage cap; the tier-up panel shows what is missing.', guide: { kind: 'building', ref: 'command_center' },
    onComplete: { celebrate: 'Advanced Alloy tier reached! Automation takes over.' },
  },

  // ====================================================================== TIER 4 — Advanced Alloy (~6 h → ~12 h)
  {
    id: 'm45_aa', chain: 'main', name: 'Eyes on the Skies', description: 'Build two Anti-Air Guns. Flyers have been spotted!',
    type: 'have_building', target: 'aa_gun', count: 2, reward: R({ resources: { alloy: 60, steel: 200, electronics: 60 }, xp: 150 }), next: ['m46_shield'],
    hint: 'Flyers fly over walls. Anti-Air Guns, MG turrets and missile turrets can hit them. Place a few near the center.', guide: { kind: 'build_menu', ref: 'aa_gun' },
  },
  {
    id: 'm46_shield', chain: 'main', name: 'Bubble Up', description: 'Build a Shield Generator.',
    type: 'build', target: 'shield_generator', count: 1, reward: R({ resources: { alloy: 80, electronics: 80, crystal: 60 }, xp: 160 }), next: ['m47_rig'],
    hint: 'Research Shield Technology. A shield soaks damage then recharges between waves. It needs power.', guide: { kind: 'build_menu', ref: 'shield_generator' },
  },
  {
    id: 'm47_rig', chain: 'main', name: 'Mountain Muncher', description: 'Build an Automated Mining Rig.',
    type: 'build', target: 'mining_rig', count: 1, reward: R({ resources: { alloy: 80, steel: 300, electronics: 80 }, rp: 400, xp: 170 }), next: ['m48_nanoforge'],
    hint: 'Research Automated Mining. The rig mines iron, copper, coal and a trickle of crystal nonstop.', guide: { kind: 'build_menu', ref: 'mining_rig' },
  },
  {
    id: 'm48_nanoforge', chain: 'main', name: 'Tiny Builders', description: 'Build a Nanoforge. It turns alloy and biomass into nano-material.',
    type: 'build', target: 'nanoforge', count: 1, reward: R({ resources: { alloy: 150, biomass: 100, electronics: 100 }, rp: 600, xp: 180 }), next: ['m49_ridge'],
    hint: 'Research Nano Assembly. Feed the Nanoforge alloy plus biomass from the Toxic Marsh or a Bio Digester.', guide: { kind: 'build_menu', ref: 'nanoforge' },
  },
  {
    id: 'm49_ridge', chain: 'main', name: 'Cold Front', description: 'Discover the Frozen Ridge.',
    type: 'discover', target: 'frozen_ridge', count: 1, reward: R({ resources: { electronics: 60, energy_cell: 10 }, rp: 300, xp: 190 }), next: ['m50_ruins'],
    hint: 'The Frozen Ridge lies to the north. Abandoned research outposts are waiting.', guide: { kind: 'region', ref: 'frozen_ridge' },
  },
  {
    id: 'm50_ruins', chain: 'main', name: 'Something Old', description: 'Discover the Alien Ruins.',
    type: 'discover', target: 'alien_ruins', count: 1, reward: R({ resources: { crystal: 80, alloy: 40 }, rp: 500, xp: 200 }), next: ['m51_hangar'],
    hint: 'The ruins lie north-east. Loot the vaults for research points and crystals.', guide: { kind: 'region', ref: 'alien_ruins' },
  },
  {
    id: 'm51_hangar', chain: 'main', name: 'Hover Time', description: 'Craft a Hover Bike at the hangar.',
    type: 'craft', target: 'r_vehicle_hover_bike', count: 1, reward: R({ nova: 15, resources: { alloy: 80, steel: 200 }, xp: 210 }), next: ['m52_research_nano'],
    hint: 'Build a Hangar (Hover Technology). The bike needs a Robotic Core: craft it at the Fabricator Bench (Field Robotics) from Workshop Machine Parts.', guide: { kind: 'build_menu', ref: 'hangar' },
    onComplete: { celebrate: 'Hover Bike ready! Nothing can slow you down now.' },
  },
  {
    id: 'm52_research_nano', chain: 'main', name: 'Smaller Is Better', description: 'Research Nano-Tech.',
    type: 'research', target: 'tier_nano', count: 1, reward: R({ resources: { alloy: 200, energy_cell: 60 }, rp: 800, xp: 220 }), next: ['m53_tier5'],
    hint: 'Nano-Tech needs nano-material and energy cells. Keep the nanoforge and the cell plant humming.', guide: { kind: 'ui', ref: 'research' },
  },
  {
    id: 'm53_tier5', chain: 'main', name: 'Nano Colony', description: 'Upgrade your colony to the Nano-Tech tier.',
    type: 'tier', target: '*', count: 5, reward: R({ nova: 90, xp: 360, resources: { alloy: 300, nano: 40, energy_cell: 100, electronics: 200 }, items: { nano_crate: 2 } }), next: ['m54_fusion'],
    hint: 'Alloy, energy cells, nano-material and electronics. Crystal Vaults and Mega Warehouses hold the bill. A real milestone.', guide: { kind: 'building', ref: 'command_center' },
    onComplete: { celebrate: 'Nano-Tech tier reached! The future is here.' },
  },

  // ====================================================================== TIER 5 — Nano-Tech (~12 h → ~27 h)
  {
    id: 'm54_fusion', chain: 'main', name: 'A Star in a Bottle', description: 'Build a Fusion Reactor.',
    type: 'build', target: 'fusion_reactor', count: 1, reward: R({ resources: { alloy: 200, electronics: 150, nano: 30 }, xp: 380 }), next: ['m55_drones'],
    hint: 'Research Fusion Theory. A reactor sips crystals and produces a huge amount of power.', guide: { kind: 'build_menu', ref: 'fusion_reactor' },
  },
  {
    id: 'm55_drones', chain: 'main', name: 'Swarm Intelligence', description: 'Build a Drone Hub.',
    type: 'build', target: 'drone_hub', count: 1, reward: R({ resources: { alloy: 250, nano: 30, electronics: 150 }, rp: 1500, xp: 400 }), next: ['m56_laser'],
    hint: 'Research Drone Workers. Drone hubs gather automatically and need no colonists.', guide: { kind: 'build_menu', ref: 'drone_hub' },
  },
  {
    id: 'm56_laser', chain: 'main', name: 'Pew Pew', description: 'Have four Laser Turrets defending your colony.',
    type: 'have_building', target: 'laser_turret', count: 4, reward: R({ resources: { alloy: 250, energy_cell: 100, nano: 30 }, xp: 420 }), next: ['m57_teleporter'],
    hint: 'Research Energy Weapons. Lasers draw power, so keep that reactor happy.', guide: { kind: 'build_menu', ref: 'laser_turret' },
  },
  {
    id: 'm57_teleporter', chain: 'main', name: 'Beam Me Home', description: 'Build a Teleporter Pad.',
    type: 'build', target: 'teleporter', count: 1, reward: R({ nova: 30, resources: { energy_cell: 120, alloy: 200 }, xp: 440 }), next: ['m58_highlands'],
    hint: 'Research Teleportation. Pads link together so you can hop around the planet.', guide: { kind: 'build_menu', ref: 'teleporter' },
  },
  {
    id: 'm58_highlands', chain: 'main', name: 'Silver Plateau', description: 'Discover the Titanium Highlands.',
    type: 'discover', target: 'titanium_highlands', count: 1, reward: R({ resources: { titanium: 40, nano: 20 }, rp: 2000, xp: 460 }), next: ['m59_titanium_drill'],
    hint: 'The Titanium Highlands lie to the far north-west. You will need an Alloy Drill-Pick or better to harvest titanium.', guide: { kind: 'region', ref: 'titanium_highlands' },
  },
  {
    id: 'm59_titanium_drill', chain: 'main', name: 'Brilliant Metal', description: 'Build a Titanium Drill.',
    type: 'build', target: 'titanium_drill', count: 1, reward: R({ resources: { titanium: 80, alloy: 200, electronics: 150 }, rp: 2500, xp: 480 }), next: ['m60_research_titanium'],
    hint: 'Research Titanium Extraction. Drills and the refinery keep the titanium flowing.', guide: { kind: 'build_menu', ref: 'titanium_drill' },
  },
  {
    id: 'm60_research_titanium', chain: 'main', name: 'The Titanium Age', description: 'Research the Titanium Age.',
    type: 'research', target: 'tier_titanium', count: 1, reward: R({ resources: { titanium: 120, nano: 80, energy_cell: 150 }, rp: 3000, xp: 500 }), next: ['m61_tier6'],
    hint: 'This is the last big research. It needs titanium and nano-material on hand.', guide: { kind: 'ui', ref: 'research' },
  },
  {
    id: 'm61_tier6', chain: 'main', name: 'Titanium Colony', description: 'Upgrade your colony to the Titanium tier.',
    type: 'tier', target: '*', count: 6, reward: R({ nova: 200, xp: 800, resources: { titanium: 200, nano: 150, energy_cell: 250, alloy: 400 }, items: { titan_crate: 3 }, cosmetic: 'theme_titanium_dawn' }), next: ['m62_skyscraper'],
    hint: 'The final tier: titanium, nano-material, energy cells and a mountain of alloy. Nano Vaults hold plenty, and upgrading a vault multiplies its space.', guide: { kind: 'building', ref: 'command_center' },
    onComplete: { celebrate: 'TITANIUM TIER REACHED! Your colony is now a gleaming titanium fortress.' },
  },

  // ====================================================================== TIER 6 — Titanium (~27 h →)
  {
    id: 'm62_skyscraper', chain: 'main', name: 'Reach for the Sky', description: 'Build a Titanium Skyscraper.',
    type: 'build', target: 'titan_skyscraper', count: 1, reward: R({ resources: { titanium: 150, nano: 80, alloy: 300 }, rp: 4000, xp: 350 }), next: ['m63_railgun'],
    hint: 'Research Titanium Living. Sixty beds in one glittering tower.', guide: { kind: 'build_menu', ref: 'titan_skyscraper' },
  },
  {
    id: 'm63_railgun', chain: 'main', name: 'Rail Gun Party', description: 'Have two Railgun Towers defending your colony.',
    type: 'have_building', target: 'railgun', count: 2, reward: R({ resources: { titanium: 150, nano: 100, energy_cell: 200 }, xp: 380 }), next: ['m64_quantum'],
    hint: 'Research Plasma Turrets then Railgun Towers. Rails punch through whole lines of aliens.', guide: { kind: 'build_menu', ref: 'railgun' },
  },
  {
    id: 'm64_quantum', chain: 'main', name: 'Beyond Storage', description: 'Build Quantum Storage.',
    type: 'build', target: 'quantum_storage', count: 1, reward: R({ nova: 50, resources: { titanium: 200, nano: 120, energy_cell: 250 }, rp: 5000, xp: 400 }), next: ['m65_colonists30'],
    hint: 'Research Quantum Storage. It holds enormous amounts of every resource.', guide: { kind: 'build_menu', ref: 'quantum_storage' },
  },
  {
    id: 'm65_colonists30', chain: 'main', name: 'Booming Town', description: 'Have 30 colonists living in your colony.',
    type: 'colonists', target: '*', count: 30, reward: R({ nova: 50, items: { colonist_crate: 2 }, resources: { food: 1000, water: 800 }, xp: 420 }), next: ['m66_hovercraft'],
    hint: 'Skyscrapers and nano residences hold plenty of beds. Recruit from the board or rescue survivors.', guide: { kind: 'ui', ref: 'recruit' },
  },
  {
    id: 'm66_hovercraft', chain: 'main', name: 'The Pinnacle of Travel', description: 'Craft a Titanium Hovercraft.',
    type: 'craft', target: 'r_vehicle_titanium_hovercraft', count: 1, reward: R({ nova: 80, resources: { titanium: 250, nano: 150 }, xp: 450 }), next: ['m67_super_colony'],
    hint: 'Research Titanium Hover Drive. The Hovercraft needs 2 Titanium Plating from the Titan Forge (Titanium Manufacturing).', guide: { kind: 'building', ref: 'hangar' },
    onComplete: { celebrate: 'The Titanium Hovercraft takes flight!' },
  },
  {
    id: 'm67_super_colony', chain: 'main', name: 'Titanium Super-Colony', description: 'Have 50 colonists thriving in your gleaming titanium colony.',
    type: 'colonists', target: '*', count: 50, reward: R({ nova: 500, xp: 1000, resources: { titanium: 500, nano: 300, energy_cell: 500, alloy: 800 }, colonist: 'legendary', cosmetic: 'theme_titanium_dawn', items: { titan_crate: 5 } }), next: [],
    hint: 'Keep recruiting and housing colonists. This is the moment you have been building toward.', guide: { kind: 'ui', ref: 'colonists' },
    onComplete: { celebrate: 'TITANIUM SUPER-COLONY! From a crashed pod to a city among the stars — you built all of this.' },
  },

  // ====================================================================== SIDE MISSIONS (short themed chains; these heads are available from day one)
  // ---- farming chain
  { id: 's_farm', chain: 'side', name: 'Green Thumb', description: 'Build a Berry Patch.', type: 'build', target: 'berry_patch', count: 1, reward: R({ resources: { food: 30 }, xp: 10 }), next: ['s_veggie'], hint: 'A Berry Patch is your first farm.', guide: { kind: 'build_menu', ref: 'berry_patch' } },
  { id: 's_veggie', chain: 'side', name: 'Veggie Valley', description: 'Build two Veggie Farms.', type: 'have_building', target: 'veggie_farm', count: 2, reward: R({ resources: { food: 100, fiber: 40 }, xp: 25 }), next: ['s_greenhouse'] },
  { id: 's_greenhouse', chain: 'side', name: 'Glass House', description: 'Build a Greenhouse.', type: 'build', target: 'greenhouse', count: 1, reward: R({ resources: { food: 200, water: 100 }, xp: 40 }), next: ['s_hydroponics'], hint: 'Greenhouses need a little water.', guide: { kind: 'build_menu', ref: 'greenhouse' } },
  { id: 's_hydroponics', chain: 'side', name: 'Soil-Free Farming', description: 'Build two Hydroponics Bays.', type: 'have_building', target: 'hydroponics', count: 2, reward: R({ resources: { food: 500, water: 200, steel: 60 }, nova: 5, xp: 70 }), next: ['s_autofarm'] },
  { id: 's_autofarm', chain: 'side', name: 'Harvest Machine', description: 'Build an Automated Farm.', type: 'build', target: 'auto_farm', count: 1, reward: R({ resources: { food: 1500, water: 500, alloy: 40 }, nova: 10, xp: 120 }), hint: 'Automated farms need a good water supply.', guide: { kind: 'build_menu', ref: 'auto_farm' } },
  // ---- water chain
  { id: 's_water', chain: 'side', name: 'Rainy Day', description: 'Build a Rain Collector.', type: 'build', target: 'rain_collector', count: 1, reward: R({ resources: { water: 30 }, xp: 10 }), next: ['s_tank'], hint: 'Rain Collectors need no workers.', guide: { kind: 'build_menu', ref: 'rain_collector' } },
  { id: 's_tank', chain: 'side', name: 'Deep Tank', description: 'Build a Water Tank.', type: 'build', target: 'water_tank', count: 1, reward: R({ resources: { water: 150, fiber: 40 }, xp: 25 }), next: ['s_pump'] },
  { id: 's_pump', chain: 'side', name: 'Down the Well', description: 'Build a Water Pump.', type: 'build', target: 'water_pump', count: 1, reward: R({ resources: { water: 300, stone: 100 }, xp: 40 }), next: ['s_purifier'] },
  { id: 's_purifier', chain: 'side', name: 'Crystal Clear', description: 'Build a Water Purifier.', type: 'build', target: 'purifier', count: 1, reward: R({ resources: { water: 600, steel: 60 }, xp: 70 }), next: ['s_atmo'] },
  { id: 's_atmo', chain: 'side', name: 'Water from Air', description: 'Build an Atmospheric Water Generator.', type: 'build', target: 'atmo_generator', count: 1, reward: R({ resources: { water: 3000, nano: 10 }, nova: 10, xp: 150 }) },
  // ---- cozy chain
  { id: 's_cozy', chain: 'side', name: 'Home Sweet Home', description: 'Place five decorations.', type: 'build', target: 'category:decor', count: 5, reward: R({ resources: { wood: 60, fiber: 40 }, xp: 25 }), next: ['s_fountain'], hint: 'Lanterns, flowers and benches make colonists happy.', guide: { kind: 'build_menu', ref: 'flower_bed' } },
  { id: 's_fountain', chain: 'side', name: 'Plaza Time', description: 'Build a Stone Fountain.', type: 'build', target: 'fountain', count: 1, reward: R({ resources: { stone: 150 }, nova: 3, xp: 45 }), next: ['s_arcade'] },
  { id: 's_arcade', chain: 'side', name: 'High Score', description: 'Build an Arcade Cabinet Hall.', type: 'build', target: 'arcade', count: 1, reward: R({ resources: { steel: 80, electronics: 20 }, nova: 5, xp: 80 }) },
  // ---- exploration chain
  { id: 's_explorer', chain: 'side', name: 'Treasure Hunter', description: 'Loot three points of interest.', type: 'loot', target: '*', count: 3, reward: R({ resources: { wood: 100, stone: 80 }, xp: 30 }), next: ['s_scavenger'], hint: 'Caches, cabins and wrecks are marked on the map.', guide: { kind: 'ui', ref: 'map' } },
  { id: 's_scavenger', chain: 'side', name: 'Scavenger Supreme', description: 'Loot ten points of interest.', type: 'loot', target: '*', count: 10, reward: R({ resources: { iron: 100, copper: 80 }, nova: 5, xp: 70 }) },
  // ---- combat chain
  { id: 's_pest', chain: 'side', name: 'Pest Patrol', description: 'Defeat 50 aliens.', type: 'kill', target: '*', count: 50, reward: R({ resources: { wood: 100, stone: 100 }, xp: 40 }), next: ['s_exterminator'] },
  { id: 's_exterminator', chain: 'side', name: 'Exterminator', description: 'Defeat 300 aliens.', type: 'kill', target: '*', count: 300, reward: R({ resources: { iron: 200, coal: 100 }, nova: 8, xp: 100 }), next: ['s_alien_hunter'] },
  { id: 's_alien_hunter', chain: 'side', name: 'Alien Hunter', description: 'Defeat 1,500 aliens.', type: 'kill', target: '*', count: 1500, reward: R({ resources: { steel: 400, alloy: 100 }, nova: 20, xp: 250 }) },
  // ---- misc
  { id: 's_spin', chain: 'side', name: 'Feeling Lucky', description: 'Spin the Lucky Wheel.', type: 'spin', target: '*', count: 1, reward: R({ nova: 3, xp: 15 }), hint: 'Build the Lucky Wheel and spin it once a day for free.', guide: { kind: 'build_menu', ref: 'spin_wheel' } },
  { id: 's_toolup', chain: 'side', name: 'Better Tools', description: 'Equip an Iron Pickaxe.', type: 'equip', target: 'iron_pickaxe', count: 1, reward: R({ resources: { iron: 60 }, xp: 30 }), next: ['s_armed'], hint: 'Craft it at the Forge and equip it from the Inventory.', guide: { kind: 'ui', ref: 'inventory' } },
  { id: 's_armed', chain: 'side', name: 'Locked & Loaded', description: 'Equip an Assault Rifle.', type: 'equip', target: 'assault_rifle', count: 1, reward: R({ resources: { steel: 100 }, nova: 5, xp: 80 }), hint: 'Research Assault Rifles, craft Machine Parts at the Workshop (Assembly Lines), then the rifle, and equip it.' },
  // ====================================================================== LATE SIDE CHAINS (Steel and up; each step waits for its minTier)
  // ---- power grid
  { id: 's_grid_solar', chain: 'side', minTier: 3, name: 'Sun Catcher', description: 'Have six Solar Panels.', type: 'have_building', target: 'solar_panel', count: 6, reward: R({ resources: { steel: 120, electronics: 30 }, xp: 70 }), next: ['s_grid_battery'], hint: 'Solar Panels need no fuel or workers. Tuck them along the colony edge.', guide: { kind: 'build_menu', ref: 'solar_panel' } },
  { id: 's_grid_battery', chain: 'side', minTier: 3, name: 'Saving It for Later', description: 'Have two Battery Banks.', type: 'have_building', target: 'battery_bank', count: 2, reward: R({ resources: { steel: 150, copper: 100 }, items: { tech_crate: 1 }, xp: 90 }), next: ['s_grid_geo'], hint: 'Batteries smooth out the night when the panels go quiet.', guide: { kind: 'build_menu', ref: 'battery_bank' } },
  { id: 's_grid_geo', chain: 'side', minTier: 4, name: 'Hot Springs', description: 'Build a Geothermal Plant.', type: 'build', target: 'geothermal_plant', count: 1, reward: R({ resources: { alloy: 40, electronics: 60 }, nova: 8, xp: 130 }), next: ['s_grid_mega'], hint: 'Research Geothermal Tech, then tap the heat under your feet.', guide: { kind: 'build_menu', ref: 'geothermal_plant' } },
  { id: 's_grid_mega', chain: 'side', minTier: 5, name: 'Megawatt Colony', description: 'Produce 1,500 power.', type: 'power', target: '*', count: 1500, reward: R({ resources: { alloy: 150, energy_cell: 60, nano: 20 }, nova: 12, xp: 260 }), next: ['s_grid_core'], hint: 'Fusion Reactors are the big step up. Upgrading power buildings helps too.', guide: { kind: 'build_menu', ref: 'fusion_reactor' } },
  { id: 's_grid_core', chain: 'side', minTier: 6, name: 'A Star in a Jar', description: 'Build a Fusion Core.', type: 'build', target: 'fusion_core', count: 1, reward: R({ resources: { titanium: 100, energy_cell: 200 }, items: { titan_crate: 2 }, nova: 20, xp: 380 }), hint: 'Research Titanium Fusion first.', guide: { kind: 'build_menu', ref: 'fusion_core' } },
  // ---- fortress (boss hunts)
  { id: 's_fort_mg', chain: 'side', minTier: 3, name: 'Bullet Storm', description: 'Have eight Machine-Gun Turrets.', type: 'have_building', target: 'mg_turret', count: 8, reward: R({ resources: { steel: 150, iron: 150 }, items: { stim_pack: 2 }, xp: 80 }), next: ['s_fort_brute'], hint: 'Cover every approach, not just the front gate.', guide: { kind: 'build_menu', ref: 'mg_turret' } },
  { id: 's_fort_brute', chain: 'side', minTier: 3, name: 'The Bigger They Come', description: 'Defeat an Elder Brute.', type: 'kill', target: 'elder_brute', count: 1, reward: R({ resources: { steel: 200 }, items: { steel_bundle: 2 }, nova: 8, xp: 120 }), next: ['s_fort_missile'], hint: 'An Elder Brute leads every fourth attack at Steel tier, and any bigger boss counts too. Stack turrets along its path.' },
  { id: 's_fort_missile', chain: 'side', minTier: 4, name: 'Lock and Launch', description: 'Have three Missile Turrets.', type: 'have_building', target: 'missile_turret', count: 3, reward: R({ resources: { alloy: 60, electronics: 60 }, xp: 150 }), next: ['s_fort_queen'], hint: 'Missiles hit hard and far. Perfect for big targets.', guide: { kind: 'build_menu', ref: 'missile_turret' } },
  { id: 's_fort_queen', chain: 'side', minTier: 4, name: 'Royal Pain', description: 'Defeat a Hive Mother.', type: 'kill', target: 'hive_mother', count: 1, reward: R({ resources: { alloy: 120, crystal: 80 }, items: { alloy_crate: 2 }, nova: 12, xp: 220 }), next: ['s_fort_veteran'], hint: 'A Hive Mother leads every fifth attack at Alloy tier (every fourth at Nano). Titan Prime counts too.' },
  { id: 's_fort_veteran', chain: 'side', minTier: 5, name: 'Seasoned Defenders', description: 'Survive eight alien attacks.', type: 'defend', target: '*', count: 8, reward: R({ resources: { alloy: 150, energy_cell: 80 }, items: { nano_crate: 2 }, nova: 10, xp: 280 }), next: ['s_fort_titan'], hint: 'Keep the walls patched and the turrets upgraded between attacks.' },
  { id: 's_fort_titan', chain: 'side', minTier: 6, name: 'Titan Slayer', description: 'Defeat Titan Prime.', type: 'kill', target: 'titan_prime', count: 1, reward: R({ resources: { titanium: 200, nano: 100 }, items: { titan_crate: 3 }, nova: 30, xp: 500 }), hint: 'Titan Prime leads every third attack at Titanium tier. Railguns and Titan Cannons hit hardest.', guide: { kind: 'build_menu', ref: 'railgun' } },
  // ---- industry
  { id: 's_ind_factory', chain: 'side', minTier: 3, name: 'Assembly Required', description: 'Have two Factories.', type: 'have_building', target: 'factory', count: 2, reward: R({ resources: { steel: 150, electronics: 40 }, xp: 80 }), next: ['s_ind_large'], hint: 'Factories turn steel and copper into parts while you explore.', guide: { kind: 'build_menu', ref: 'factory' } },
  { id: 's_ind_large', chain: 'side', minTier: 4, name: 'Mass Production', description: 'Build a Large Factory.', type: 'build', target: 'large_factory', count: 1, reward: R({ resources: { steel: 200, alloy: 60 }, items: { tech_crate: 2 }, xp: 150 }), next: ['s_ind_rig'], hint: 'Research Mass Production first.', guide: { kind: 'build_menu', ref: 'large_factory' } },
  { id: 's_ind_rig', chain: 'side', minTier: 4, name: 'Deep Core', description: 'Have three Mining Rigs.', type: 'have_building', target: 'mining_rig', count: 3, reward: R({ resources: { alloy: 80, crystal: 60 }, nova: 8, xp: 170 }), next: ['s_ind_matter'], guide: { kind: 'build_menu', ref: 'mining_rig' } },
  { id: 's_ind_matter', chain: 'side', minTier: 5, name: 'Something from Nothing', description: 'Build a Matter Processor.', type: 'build', target: 'matter_processor', count: 1, reward: R({ resources: { nano: 30, energy_cell: 60 }, items: { nano_crate: 1 }, xp: 260 }), next: ['s_ind_nanofab'], hint: 'Research Matter Conversion first.', guide: { kind: 'build_menu', ref: 'matter_processor' } },
  { id: 's_ind_nanofab', chain: 'side', minTier: 5, name: 'Tiny Workers', description: 'Build a Nano Factory.', type: 'build', target: 'nano_factory', count: 1, reward: R({ resources: { nano: 40, alloy: 150 }, nova: 10, xp: 280 }), next: ['s_ind_titan'], guide: { kind: 'build_menu', ref: 'nano_factory' } },
  { id: 's_ind_titan', chain: 'side', minTier: 6, name: 'Titan Works', description: 'Build a Titan Factory.', type: 'build', target: 'titan_factory', count: 1, reward: R({ resources: { titanium: 120, nano: 60 }, items: { titan_crate: 2 }, nova: 15, xp: 380 }), next: ['s_ind_drills'], hint: 'Research Titan Manufacturing first.', guide: { kind: 'build_menu', ref: 'titan_factory' } },
  { id: 's_ind_drills', chain: 'side', minTier: 6, name: 'Strip the Highlands', description: 'Have three Titanium Drills.', type: 'have_building', target: 'titanium_drill', count: 3, reward: R({ resources: { titanium: 250, energy_cell: 150 }, nova: 20, xp: 450 }), guide: { kind: 'build_menu', ref: 'titanium_drill' } },
  // ---- science
  { id: 's_sci_observatory', chain: 'side', minTier: 3, name: 'Stargazer', description: 'Build an Observatory.', type: 'build', target: 'observatory', count: 1, reward: R({ resources: { electronics: 30 }, rp: 150, xp: 70 }), next: ['s_sci_eight'], hint: 'Colonists love a night under the stars.', guide: { kind: 'build_menu', ref: 'observatory' } },
  { id: 's_sci_eight', chain: 'side', minTier: 3, name: 'Lab Rats', description: 'Complete 8 research projects.', type: 'research', target: '*', count: 8, reward: R({ items: { tech_crate: 1 }, rp: 300, nova: 6, xp: 110 }), next: ['s_sci_adv'], hint: 'Counts research finished after this mission appears.', guide: { kind: 'ui', ref: 'research' } },
  { id: 's_sci_adv', chain: 'side', minTier: 4, name: 'Peer Review', description: 'Have two Advanced Labs.', type: 'have_building', target: 'advanced_lab', count: 2, reward: R({ resources: { electronics: 100 }, rp: 600, xp: 180 }), next: ['s_sci_ten'], guide: { kind: 'build_menu', ref: 'advanced_lab' } },
  { id: 's_sci_ten', chain: 'side', minTier: 5, name: 'Polymath', description: 'Complete 10 research projects.', type: 'research', target: '*', count: 10, reward: R({ resources: { nano: 30 }, rp: 2000, nova: 12, xp: 300 }), next: ['s_sci_quantum'], guide: { kind: 'ui', ref: 'research' } },
  { id: 's_sci_quantum', chain: 'side', minTier: 6, name: 'Spooky Action', description: 'Build a Quantum Lab.', type: 'build', target: 'quantum_lab', count: 1, reward: R({ resources: { titanium: 100 }, items: { titan_crate: 1 }, rp: 5000, nova: 20, xp: 400 }), hint: 'Research Quantum Computing first.', guide: { kind: 'build_menu', ref: 'quantum_lab' } },
  // ---- housing
  { id: 's_home_dorms', chain: 'side', minTier: 3, name: 'Bunk Buddies', description: 'Have three Steel Dormitories.', type: 'have_building', target: 'steel_dorm', count: 3, reward: R({ resources: { steel: 150, food: 400 }, xp: 80 }), next: ['s_home_pop'], hint: 'More beds means more colonists can join.', guide: { kind: 'build_menu', ref: 'steel_dorm' } },
  { id: 's_home_pop', chain: 'side', minTier: 4, name: 'Growing Town', description: 'Have 18 colonists.', type: 'colonists', target: '*', count: 18, reward: R({ resources: { alloy: 50, food: 800, water: 600 }, colonist: 'rare', nova: 8, xp: 160 }), next: ['s_home_habitat'], hint: 'Recruit at the Command Center when you have free beds.', guide: { kind: 'ui', ref: 'recruit' } },
  { id: 's_home_habitat', chain: 'side', minTier: 4, name: 'Alloy Living', description: 'Have two Alloy Habitats.', type: 'have_building', target: 'alloy_habitat', count: 2, reward: R({ resources: { alloy: 80, crystal: 50 }, xp: 170 }), next: ['s_home_nano'], guide: { kind: 'build_menu', ref: 'alloy_habitat' } },
  { id: 's_home_nano', chain: 'side', minTier: 5, name: 'Smart Homes', description: 'Have three Nano Residences.', type: 'have_building', target: 'nano_residence', count: 3, reward: R({ resources: { nano: 30, alloy: 120 }, items: { nano_crate: 1 }, nova: 10, xp: 270 }), next: ['s_home_skyline'], guide: { kind: 'build_menu', ref: 'nano_residence' } },
  { id: 's_home_skyline', chain: 'side', minTier: 6, name: 'Skyline', description: 'Have three Titan Skyscrapers.', type: 'have_building', target: 'titan_skyscraper', count: 3, reward: R({ resources: { titanium: 200, nano: 80 }, colonist: 'epic', nova: 25, xp: 450 }), guide: { kind: 'build_menu', ref: 'titan_skyscraper' } },
  // ---- garage & road trips
  { id: 's_veh_truck', chain: 'side', minTier: 3, name: 'Heavy Hauler', description: 'Craft a Mining Truck.', type: 'craft', target: 'r_vehicle_mining_truck', count: 1, reward: R({ resources: { steel: 120, iron: 200 }, items: { machine_parts: 2 }, xp: 90 }), next: ['s_veh_loot'], hint: 'Research Heavy Haulers and craft 3 Machine Parts at the Workshop, then build the truck at the Garage.', guide: { kind: 'building', ref: 'garage' } },
  { id: 's_veh_loot', chain: 'side', minTier: 4, name: 'Road Trip', description: 'Loot 15 points of interest.', type: 'loot', target: '*', count: 15, reward: R({ resources: { alloy: 60, crystal: 60 }, items: { alloy_crate: 1 }, xp: 160 }), next: ['s_veh_rover'], hint: 'Far regions hide richer caches, and they refill over time.', guide: { kind: 'ui', ref: 'map' } },
  { id: 's_veh_rover', chain: 'side', minTier: 5, name: 'Tank Mode', description: 'Craft an Armored Rover.', type: 'craft', target: 'r_vehicle_armored_rover', count: 1, reward: R({ resources: { alloy: 150, nano: 25 }, nova: 10, xp: 280 }), next: ['s_veh_explorer'], hint: 'It needs 2 Robotic Cores from the Fabricator Bench. Then craft it at the Hangar.', guide: { kind: 'building', ref: 'hangar' } },
  { id: 's_veh_explorer', chain: 'side', minTier: 6, name: 'Seen It All', description: 'Loot 30 points of interest.', type: 'loot', target: '*', count: 30, reward: R({ resources: { titanium: 120 }, items: { titan_crate: 2 }, nova: 15, xp: 380 }), guide: { kind: 'ui', ref: 'map' } },
  // ---- expedition chain (offered once expeditions open: Stone tier + a Radio Tower)
  { id: 's_exp_home', chain: 'side', name: 'Welcome Home', description: 'Collect the haul of an expedition.', type: 'expedition', target: 'collect', count: 1, reward: R({ resources: { food: 120, water: 80 }, xp: 40 }), next: ['s_exp_veteran'], hint: 'When a squad is back, open Expeditions and tap Collect.' },
  { id: 's_exp_veteran', chain: 'side', name: 'Seasoned Explorers', description: 'Collect the hauls of 10 expeditions.', type: 'expedition', target: 'collect', count: 10, reward: R({ items: { mystery_crate: 1 }, nova: 5, xp: 120 }), next: ['s_exp_frontier'] },
  { id: 's_exp_frontier', chain: 'side', name: 'Beyond the Map', description: 'Chart 3 Frontier sites on your Star Chart.', type: 'expedition', target: 'frontier', count: 3, reward: R({ items: { titan_crate: 1 }, nova: 10, xp: 300 }), hint: 'After Titanium, the Radio Tower hears signals from uncharted sites. Send squads to chart them!' },
  // ---- wishes chain (offered with the first colonist wish, once the opening tutorial is over)
  { id: 's_wish_one', chain: 'side', name: 'Good Neighbour', description: "Grant a colonist's wish.", type: 'wish', target: '*', count: 1, reward: R({ items: { supply_crate: 1 }, xp: 25 }), next: ['s_wish_ten'], hint: 'A colonist with a wish wears a little bubble. Tap them to see what they would love.', guide: { kind: 'ui', ref: 'colonists' } },
  { id: 's_wish_ten', chain: 'side', name: 'Friend to All', description: 'Grant 10 wishes.', type: 'wish', target: '*', count: 10, reward: R({ items: { mystery_crate: 1 }, nova: 3, xp: 80 }), next: ['s_wish_thirty'], hint: 'Every granted wish adds a friendship heart. Three hearts and they work a little harder.' },
  { id: 's_wish_thirty', chain: 'side', name: 'Heart of the Colony', description: 'Grant 30 wishes.', type: 'wish', target: '*', count: 30, reward: R({ items: { mystery_crate: 2 }, nova: 8, xp: 200 }), hint: 'Five hearts make a colonist your best friend, happier for good.' },

  // ====================================================================== DAILY POOL
  { id: 'd_gather_wood', chain: 'daily', name: 'Daily: Lumberjack', description: 'Gather 200 Wood.', type: 'gather', target: 'wood', count: 200, reward: R({ nova: 3, xp: 40 }) },
  { id: 'd_gather_stone', chain: 'daily', name: 'Daily: Rock Collector', description: 'Gather 200 Stone.', type: 'gather', target: 'stone', count: 200, reward: R({ nova: 3, xp: 40 }) },
  { id: 'd_gather_fiber', chain: 'daily', name: 'Daily: Plant Whisperer', description: 'Gather 150 Fiber.', type: 'gather', target: 'fiber', count: 150, reward: R({ nova: 3, xp: 40 }) },
  { id: 'd_gather_any', chain: 'daily', name: 'Daily: Busy Bee', description: 'Gather 600 resources of any kind.', type: 'gather', target: '*', count: 600, reward: R({ nova: 4, xp: 55 }) },
  { id: 'd_kill', chain: 'daily', name: 'Daily: Pest Control', description: 'Defeat 15 aliens.', type: 'kill', target: '*', count: 15, reward: R({ nova: 3, xp: 40 }) },
  { id: 'd_kill_big', chain: 'daily', name: 'Daily: Alien Bash', description: 'Defeat 40 aliens.', type: 'kill', target: '*', count: 40, reward: R({ nova: 5, xp: 60 }) },
  { id: 'd_build', chain: 'daily', name: 'Daily: Builder', description: 'Build 10 structures.', type: 'build', target: '*', count: 10, reward: R({ nova: 3, xp: 40 }) },
  { id: 'd_build_big', chain: 'daily', name: 'Daily: Architect', description: 'Build 25 structures.', type: 'build', target: '*', count: 25, reward: R({ nova: 5, xp: 60 }) },
  { id: 'd_craft', chain: 'daily', name: 'Daily: Crafty', description: 'Craft 5 items.', type: 'craft', target: '*', count: 5, reward: R({ nova: 3, xp: 40 }) },
  { id: 'd_craft_big', chain: 'daily', name: 'Daily: Workshop Hero', description: 'Craft 12 items.', type: 'craft', target: '*', count: 12, reward: R({ nova: 5, xp: 60 }) },
  { id: 'd_research', chain: 'daily', name: 'Daily: Curious Mind', description: 'Complete one research.', type: 'research', target: '*', count: 1, reward: R({ nova: 4, xp: 50 }) },
  { id: 'd_defend', chain: 'daily', name: 'Daily: Hold the Line', description: 'Survive one alien attack.', type: 'defend', target: '*', count: 1, reward: R({ nova: 5, xp: 60 }) },
  { id: 'd_loot', chain: 'daily', name: 'Daily: Explorer', description: 'Loot three points of interest.', type: 'loot', target: '*', count: 3, reward: R({ nova: 4, xp: 50 }) },
  { id: 'd_upgrade', chain: 'daily', name: 'Daily: Upgrade Day', description: 'Upgrade three buildings.', type: 'upgrade', target: '*', count: 3, reward: R({ nova: 4, xp: 50 }) },
  { id: 'd_spin', chain: 'daily', name: 'Daily: Wheel of Fortune', description: 'Spin the Lucky Wheel.', type: 'spin', target: '*', count: 1, reward: R({ nova: 2, xp: 30 }) },
];

export const DAILY_MISSION_POOL = [
  'd_gather_wood', 'd_gather_stone', 'd_gather_fiber', 'd_gather_any', 'd_kill', 'd_kill_big', 'd_build', 'd_build_big',
  'd_craft', 'd_craft_big', 'd_research', 'd_defend', 'd_loot', 'd_upgrade', 'd_spin',
];
