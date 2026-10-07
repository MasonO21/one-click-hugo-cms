import type { RecipeDef } from './schema';

/**
 * Crafting recipes. Stations: hand · campfire · workbench · kitchen · forge · workshop · med_bay · fabricator · nano ·
 * titan · garage · hangar. Automated factories (BuildingDef.factory = station type) can run any recipe of their type:
 *  - workshop (Assembly Factory)  fabricator (Large Factory)  nano (Nano Factory)  titan (Titan Factory).
 * Resource-output recipes mirror the refineries' input ratios so factories are a faster (input-limited) path,
 * never a cheaper one. Components (machine_parts -> robotic_core -> nano_core -> titan_plating) feed vehicles and
 * advanced gear so factories always have a purpose.
 */
export const RECIPES: RecipeDef[] = [
  // ------------------------------------------------------------------ hand / campfire (tier 0-1)
  { id: 'r_bandage', name: 'Bandage', category: 'medical', station: 'hand', inputs: { fiber: 5 }, outputs: { items: { bandage: 1 } }, time: 2, unlockTier: 0 },
  { id: 'r_herbal_salve', name: 'Herbal Salve', category: 'medical', station: 'hand', inputs: { fiber: 12, food: 3 }, outputs: { items: { herbal_salve: 1 } }, time: 4, unlockTier: 1 },
  { id: 'r_roast_berries', name: 'Roast Berries', category: 'food', station: 'campfire', inputs: { wood: 2 }, outputs: { resources: { food: 6 } }, time: 4, unlockTier: 0 },
  { id: 'r_trail_jerky', name: 'Trail Jerky', category: 'food', station: 'campfire', inputs: { food: 8, wood: 2 }, outputs: { resources: { food: 16 } }, time: 6, unlockTier: 1 },

  // ------------------------------------------------------------------ workbench (tier 0-1)
  { id: 'r_stone_axe', name: 'Stone Axe', category: 'tools', station: 'workbench', inputs: { wood: 15, stone: 10, fiber: 5 }, outputs: { items: { stone_axe: 1 } }, time: 5, unlockTier: 0 },
  { id: 'r_makeshift_rifle', name: 'Makeshift Rifle', category: 'weapons', station: 'workbench', inputs: { wood: 25, stone: 20, fiber: 10 }, outputs: { items: { makeshift_rifle: 1 } }, time: 8, unlockTier: 0 },
  { id: 'r_fiber_vest', name: 'Fiber Vest', category: 'armor', station: 'workbench', inputs: { fiber: 25, wood: 5 }, outputs: { items: { fiber_vest: 1 } }, time: 6, unlockTier: 0 },
  { id: 'r_timber_bundle', name: 'Timber Bundle', category: 'materials', station: 'workbench', inputs: { wood: 100 }, outputs: { items: { timber_bundle: 1 } }, time: 4, unlockTier: 0 },
  { id: 'r_stone_bundle', name: 'Stone Bundle', category: 'materials', station: 'workbench', inputs: { stone: 100 }, outputs: { items: { stone_bundle: 1 } }, time: 4, unlockTier: 0 },
  { id: 'r_reinforced_axe', name: 'Reinforced Axe', category: 'tools', station: 'workbench', inputs: { wood: 30, stone: 20, fiber: 25 }, outputs: { items: { reinforced_axe: 1 } }, time: 8, unlockTier: 1 },
  { id: 'r_colony_shotgun', name: 'Colony Shotgun', category: 'weapons', station: 'workbench', inputs: { wood: 50, stone: 40, fiber: 30 }, outputs: { items: { colony_shotgun: 1 } }, time: 12, unlockTier: 1, research: 'shotgun_design' },
  { id: 'r_braided_vest', name: 'Braided Vest', category: 'armor', station: 'workbench', inputs: { fiber: 60, wood: 20 }, outputs: { items: { braided_vest: 1 } }, time: 10, unlockTier: 1 },
  { id: 'r_canvas_pack', name: 'Canvas Pack', category: 'utility', station: 'workbench', inputs: { fiber: 50, wood: 20 }, outputs: { items: { canvas_pack: 1 } }, time: 8, unlockTier: 1 },
  { id: 'r_trail_boots', name: 'Trail Boots', category: 'utility', station: 'workbench', inputs: { fiber: 30, wood: 15 }, outputs: { items: { trail_boots: 1 } }, time: 8, unlockTier: 1 },

  // ------------------------------------------------------------------ kitchen & medical (tier 2)
  { id: 'r_veggie_stew', name: 'Veggie Stew', category: 'food', station: 'kitchen', inputs: { food: 12, water: 6 }, outputs: { resources: { food: 28 } }, time: 8, unlockTier: 2, research: 'culinary_arts' },
  { id: 'r_hearty_feast', name: 'Hearty Feast', category: 'food', station: 'kitchen', inputs: { food: 40, water: 15, fiber: 10 }, outputs: { resources: { food: 110 } }, time: 18, unlockTier: 2, research: 'culinary_arts' },
  { id: 'r_rations_crate', name: 'Rations Crate', category: 'food', station: 'kitchen', inputs: { food: 130, water: 110 }, outputs: { items: { rations_crate: 1 } }, time: 10, unlockTier: 2, research: 'culinary_arts' },
  { id: 'r_medkit', name: 'Medkit', category: 'medical', station: 'med_bay', inputs: { fiber: 30, iron: 6, food: 5 }, outputs: { items: { medkit: 1 } }, time: 8, unlockTier: 2, research: 'medicine' },
  { id: 'r_stim_pack', name: 'Stim Pack', category: 'medical', station: 'med_bay', inputs: { fiber: 20, electronics: 4, water: 10 }, outputs: { items: { stim_pack: 1 } }, time: 10, unlockTier: 3, research: 'medicine' },
  { id: 'r_nano_injector', name: 'Nano Injector', category: 'medical', station: 'med_bay', inputs: { nano: 2, electronics: 10, water: 20 }, outputs: { items: { nano_injector: 1 } }, time: 14, unlockTier: 5, research: 'trauma_medicine' },
  { id: 'r_regen_gel', name: 'Regeneration Gel', category: 'medical', station: 'med_bay', inputs: { nano: 4, biomass: 20, water: 30 }, outputs: { items: { regen_gel: 1 } }, time: 18, unlockTier: 6, research: 'titan_living' },

  // ------------------------------------------------------------------ forge (tier 2)
  { id: 'r_steel_bar', name: 'Steel Bar', category: 'materials', station: 'forge', inputs: { iron: 12, coal: 5 }, outputs: { resources: { steel: 7 } }, time: 8, unlockTier: 2, research: 'basic_mining' },
  { id: 'r_iron_pickaxe', name: 'Iron Pickaxe', category: 'tools', station: 'forge', inputs: { iron: 25, wood: 15, coal: 5 }, outputs: { items: { iron_pickaxe: 1 } }, time: 12, unlockTier: 2, research: 'iron_tools' },
  { id: 'r_plated_vest', name: 'Plated Vest', category: 'armor', station: 'forge', inputs: { iron: 40, fiber: 30, coal: 8 }, outputs: { items: { plated_vest: 1 } }, time: 14, unlockTier: 2, research: 'armor_plating' },
  { id: 'r_hiker_pack', name: 'Hiker Pack', category: 'utility', station: 'forge', inputs: { fiber: 70, iron: 15, wood: 25 }, outputs: { items: { hiker_pack: 1 } }, time: 12, unlockTier: 2 },
  { id: 'r_work_gloves', name: 'Work Gloves', category: 'utility', station: 'forge', inputs: { fiber: 40, iron: 10 }, outputs: { items: { work_gloves: 1 } }, time: 10, unlockTier: 2 },
  { id: 'r_ore_bundle', name: 'Ore Bundle', category: 'materials', station: 'forge', inputs: { iron: 60, copper: 45, coal: 45 }, outputs: { items: { ore_bundle: 1 } }, time: 6, unlockTier: 2 },

  // ------------------------------------------------------------------ workshop (tier 2-3) — feeds the Assembly Factory
  { id: 'r_defense_crate', name: 'Defense Crate', category: 'defense', station: 'workshop', inputs: { stone: 200, iron: 90, coal: 55, wood: 90 }, itemInputs: { medkit: 2 }, outputs: { items: { defense_crate: 1 } }, time: 14, unlockTier: 2 },
  { id: 'r_circuit_board', name: 'Circuit Board', category: 'materials', station: 'workshop', inputs: { copper: 8, fiber: 4 }, outputs: { resources: { electronics: 4 } }, time: 8, unlockTier: 3, research: 'circuitry' },
  { id: 'r_machine_parts', name: 'Machine Parts', category: 'machines', station: 'workshop', inputs: { iron: 12, steel: 6 }, outputs: { items: { machine_parts: 2 } }, time: 10, unlockTier: 3, research: 'assembly_lines' },
  { id: 'r_research_chip', name: 'Research Chip', category: 'technology', station: 'workshop', inputs: { electronics: 10, copper: 6 }, outputs: { items: { research_chip: 1 } }, time: 10, unlockTier: 3, research: 'circuitry' },
  { id: 'r_steel_harvester', name: 'Steel Harvester', category: 'tools', station: 'workshop', inputs: { steel: 40, iron: 30, copper: 15 }, itemInputs: { machine_parts: 2 }, outputs: { items: { steel_harvester: 1 } }, time: 16, unlockTier: 3, research: 'steel_tools' },
  { id: 'r_assault_rifle', name: 'Assault Rifle', category: 'weapons', station: 'workshop', inputs: { steel: 50, iron: 40, copper: 20 }, itemInputs: { machine_parts: 2 }, outputs: { items: { assault_rifle: 1 } }, time: 18, unlockTier: 3, research: 'assault_rifle_tech' },
  { id: 'r_steel_armor', name: 'Steel Armor', category: 'armor', station: 'workshop', inputs: { steel: 70, fiber: 40, copper: 15 }, outputs: { items: { steel_armor: 1 } }, time: 18, unlockTier: 3, research: 'armor_plating' },
  { id: 'r_frame_pack', name: 'Steel Frame Pack', category: 'utility', station: 'workshop', inputs: { steel: 40, fiber: 80 }, outputs: { items: { frame_pack: 1 } }, time: 14, unlockTier: 3 },
  { id: 'r_jet_boots', name: 'Jet Boots', category: 'utility', station: 'workshop', inputs: { steel: 30, copper: 20, coal: 20 }, itemInputs: { machine_parts: 1 }, outputs: { items: { jet_boots: 1 } }, time: 14, unlockTier: 3 },
  { id: 'r_steel_bundle', name: 'Steel Bundle', category: 'materials', station: 'workshop', inputs: { steel: 100 }, outputs: { items: { steel_bundle: 1 } }, time: 6, unlockTier: 3 },

  // ------------------------------------------------------------------ fabricator (tier 4) — feeds the Large Factory
  { id: 'r_alloy_ingot', name: 'Alloy Ingot', category: 'materials', station: 'fabricator', inputs: { steel: 9, crystal: 5 }, outputs: { resources: { alloy: 5 } }, time: 10, unlockTier: 4, research: 'alloy_smelting' },
  { id: 'r_energy_cell', name: 'Energy Cell', category: 'materials', station: 'fabricator', inputs: { crystal: 8, copper: 10 }, outputs: { resources: { energy_cell: 4 } }, time: 10, unlockTier: 4, research: 'energy_cells' },
  { id: 'r_robotic_core', name: 'Robotic Core', category: 'machines', station: 'fabricator', inputs: { electronics: 12, alloy: 4, steel: 10 }, itemInputs: { machine_parts: 2 }, outputs: { items: { robotic_core: 1 } }, time: 16, unlockTier: 4, research: 'field_robotics' },
  { id: 'r_helper_drone', name: 'Helper Drone', category: 'drones', station: 'fabricator', inputs: { electronics: 15, alloy: 5 }, itemInputs: { robotic_core: 1 }, outputs: { items: { helper_drone: 1 } }, time: 20, unlockTier: 4, research: 'field_robotics' },
  { id: 'r_worker_drone', name: 'Worker Drone Kit', category: 'drones', station: 'fabricator', inputs: { electronics: 20, alloy: 8, steel: 20 }, itemInputs: { robotic_core: 1 }, outputs: { items: { worker_drone: 1 } }, time: 24, unlockTier: 4, research: 'field_robotics' },
  { id: 'r_science_drone', name: 'Science Drone', category: 'drones', station: 'fabricator', inputs: { electronics: 20, alloy: 6, crystal: 6 }, itemInputs: { robotic_core: 1 }, outputs: { items: { science_drone: 1 } }, time: 24, unlockTier: 4, research: 'field_robotics' },
  { id: 'r_alloy_drillpick', name: 'Alloy Drill-Pick', category: 'tools', station: 'fabricator', inputs: { alloy: 30, steel: 40, electronics: 12 }, itemInputs: { robotic_core: 1 }, outputs: { items: { alloy_drillpick: 1 } }, time: 24, unlockTier: 4, research: 'alloy_tools' },
  { id: 'r_energy_rifle', name: 'Energy Rifle', category: 'weapons', station: 'fabricator', inputs: { alloy: 30, crystal: 20, electronics: 20 }, itemInputs: { robotic_core: 1 }, outputs: { items: { energy_rifle: 1 } }, time: 24, unlockTier: 4, research: 'energy_rifle_tech' },
  { id: 'r_alloy_suit', name: 'Alloy Suit', category: 'armor', station: 'fabricator', inputs: { alloy: 50, steel: 40, fiber: 40 }, outputs: { items: { alloy_suit: 1 } }, time: 24, unlockTier: 4 },
  { id: 'r_alloy_pack', name: 'Alloy Pack', category: 'utility', station: 'fabricator', inputs: { alloy: 30, fiber: 100, steel: 30 }, outputs: { items: { alloy_pack: 1 } }, time: 18, unlockTier: 4 },
  { id: 'r_precision_gloves', name: 'Precision Gloves', category: 'utility', station: 'fabricator', inputs: { alloy: 15, electronics: 20, fiber: 40 }, outputs: { items: { precision_gloves: 1 } }, time: 18, unlockTier: 4 },

  // ------------------------------------------------------------------ nanoforge (tier 4-5) — feeds the Nano Factory
  { id: 'r_nano_paste', name: 'Nano Paste', category: 'materials', station: 'nano', inputs: { alloy: 10, biomass: 8 }, outputs: { resources: { nano: 2.5 } }, time: 12, unlockTier: 4, research: 'nano_assembly' },
  { id: 'r_titanium_ingot', name: 'Titanium Ingot', category: 'materials', station: 'nano', inputs: { steel: 30, crystal: 9, energy_cell: 3 }, outputs: { resources: { titanium: 8 } }, time: 14, unlockTier: 5, research: 'titanium_extraction' },
  { id: 'r_nano_core', name: 'Nano Core', category: 'machines', station: 'nano', inputs: { nano: 4, alloy: 10, electronics: 20 }, itemInputs: { robotic_core: 1 }, outputs: { items: { nano_core: 1 } }, time: 20, unlockTier: 5, research: 'drone_workers' },
  { id: 'r_data_core', name: 'Data Core', category: 'technology', station: 'nano', inputs: { electronics: 40, crystal: 15, nano: 2 }, outputs: { items: { data_core: 1 } }, time: 18, unlockTier: 5, research: 'drone_workers' },
  { id: 'r_nano_cutter', name: 'Nano Cutter', category: 'tools', station: 'nano', inputs: { nano: 8, alloy: 40, electronics: 30 }, itemInputs: { nano_core: 1 }, outputs: { items: { nano_cutter: 1 } }, time: 28, unlockTier: 5, research: 'nano_tools' },
  { id: 'r_plasma_rifle', name: 'Plasma Rifle', category: 'weapons', station: 'nano', inputs: { nano: 10, alloy: 40, energy_cell: 30 }, itemInputs: { nano_core: 1 }, outputs: { items: { plasma_rifle: 1 } }, time: 30, unlockTier: 5, research: 'plasma_rifle_tech' },
  { id: 'r_nano_suit', name: 'Nano Suit', category: 'armor', station: 'nano', inputs: { nano: 12, alloy: 50, fiber: 60 }, outputs: { items: { nano_suit: 1 } }, time: 30, unlockTier: 5 },
  { id: 'r_nano_pack', name: 'Nano Pack', category: 'utility', station: 'nano', inputs: { nano: 8, alloy: 30, fiber: 120 }, outputs: { items: { nano_pack: 1 } }, time: 24, unlockTier: 5 },
  { id: 'r_nano_jetpack', name: 'Nano Jetpack', category: 'utility', station: 'nano', inputs: { nano: 10, alloy: 30, energy_cell: 25 }, itemInputs: { nano_core: 1 }, outputs: { items: { nano_jetpack: 1 } }, time: 28, unlockTier: 5 },

  // ------------------------------------------------------------------ titan forge (tier 6) — feeds the Titan Factory
  { id: 'r_titanium_bulk', name: 'Titanium Bulk Ingot', category: 'materials', station: 'titan', inputs: { steel: 120, crystal: 36, energy_cell: 12 }, outputs: { resources: { titanium: 36 } }, time: 18, unlockTier: 6, research: 'titan_manufacturing' },
  { id: 'r_titan_plating', name: 'Titanium Plating', category: 'machines', station: 'titan', inputs: { titanium: 8, nano: 4, alloy: 12 }, outputs: { items: { titan_plating: 2 } }, time: 18, unlockTier: 6, research: 'titan_manufacturing' },
  { id: 'r_quantum_chip', name: 'Quantum Chip', category: 'technology', station: 'titan', inputs: { electronics: 80, nano: 10, energy_cell: 20 }, outputs: { items: { quantum_chip: 1 } }, time: 24, unlockTier: 6, research: 'quantum_computing' },
  { id: 'r_swarm_drone', name: 'Swarm Drone Pack', category: 'drones', station: 'titan', inputs: { nano: 12, alloy: 40, electronics: 50 }, itemInputs: { nano_core: 1 }, outputs: { items: { swarm_drone: 1 } }, time: 30, unlockTier: 6, research: 'drone_swarm_tech' },
  { id: 'r_titan_beamtool', name: 'Titanium Beam Tool', category: 'tools', station: 'titan', inputs: { titanium: 25, nano: 12, energy_cell: 20 }, itemInputs: { titan_plating: 1 }, outputs: { items: { titan_beamtool: 1 } }, time: 36, unlockTier: 6 },
  { id: 'r_titanium_rifle', name: 'Titanium Rifle', category: 'weapons', station: 'titan', inputs: { titanium: 30, nano: 15, energy_cell: 25 }, itemInputs: { titan_plating: 1 }, outputs: { items: { titanium_rifle: 1 } }, time: 36, unlockTier: 6, research: 'titanium_rifle_tech' },
  { id: 'r_titanium_exosuit', name: 'Titanium Exosuit', category: 'armor', station: 'titan', inputs: { titanium: 40, nano: 20, alloy: 50 }, itemInputs: { titan_plating: 2 }, outputs: { items: { titanium_exosuit: 1 } }, time: 40, unlockTier: 6 },
  { id: 'r_titan_haulpack', name: 'Titanium Haulpack', category: 'utility', station: 'titan', inputs: { titanium: 20, nano: 10, fiber: 150 }, outputs: { items: { titan_haulpack: 1 } }, time: 30, unlockTier: 6 },
  { id: 'r_grav_boots', name: 'Gravity Boots', category: 'utility', station: 'titan', inputs: { titanium: 25, nano: 12, energy_cell: 25 }, itemInputs: { titan_plating: 1 }, outputs: { items: { grav_boots: 1 } }, time: 30, unlockTier: 6 },

  // ------------------------------------------------------------------ vehicles (garage T1 · hangar T4) — inputs mirror VehicleDef.cost
  { id: 'r_vehicle_atv', name: 'ATV', category: 'vehicles', station: 'garage', inputs: { wood: 80, stone: 60, fiber: 40 }, outputs: { vehicle: 'atv' }, time: 45, unlockTier: 1, research: 'engine_basics' },
  { id: 'r_vehicle_buggy', name: 'Dune Buggy', category: 'vehicles', station: 'garage', inputs: { wood: 120, iron: 80, copper: 20 }, outputs: { vehicle: 'buggy' }, time: 70, unlockTier: 2, research: 'off_road' },
  { id: 'r_vehicle_mining_truck', name: 'Mining Truck', category: 'vehicles', station: 'garage', inputs: { steel: 100, iron: 120, copper: 40 }, itemInputs: { machine_parts: 3 }, outputs: { vehicle: 'mining_truck' }, time: 110, unlockTier: 3, research: 'heavy_haulers' },
  { id: 'r_vehicle_hover_bike', name: 'Hover Bike', category: 'vehicles', station: 'hangar', inputs: { alloy: 40, steel: 60, electronics: 30 }, itemInputs: { robotic_core: 1 }, outputs: { vehicle: 'hover_bike' }, time: 140, unlockTier: 4, research: 'hover_tech' },
  { id: 'r_vehicle_armored_rover', name: 'Armored Rover', category: 'vehicles', station: 'hangar', inputs: { alloy: 80, steel: 160, electronics: 40, nano: 6 }, itemInputs: { robotic_core: 2 }, outputs: { vehicle: 'armored_rover' }, time: 200, unlockTier: 5, research: 'hover_tech' },
  { id: 'r_vehicle_titanium_hovercraft', name: 'Titanium Hovercraft', category: 'vehicles', station: 'hangar', inputs: { titanium: 60, nano: 30, energy_cell: 30, alloy: 60 }, itemInputs: { titan_plating: 2 }, outputs: { vehicle: 'titanium_hovercraft' }, time: 300, unlockTier: 6, research: 'titan_hover' },
];
