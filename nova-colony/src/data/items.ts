import type { ItemDef } from './schema';

/**
 * Items: tools (toolTier 1 -> 2 -> 3 unlocks harvesting of ever rarer nodes), weapons, armor, backpacks,
 * utility gear, consumables (medical, drones, research chips), components (factory output) and crates.
 */
export const ITEMS: ItemDef[] = [
  // ------------------------------------------------------------------ tools (toolTier 1 = basic, 2 = crystal/biomass/scrap, 3 = titanium)
  { id: 'survival_tool', name: 'Survival Multitool', icon: '🔧', category: 'tool', slot: 'tool', tier: 0, description: 'Chops, mines and pries. Better than nothing!', stats: { gatherYield: 0, gatherSpeed: 0, toolTier: 1 } },
  { id: 'stone_axe', name: 'Stone Axe', icon: '🪓', category: 'tool', slot: 'tool', tier: 0, description: 'A sharp stone lashed to a stick. Gathers 50% more.', stats: { gatherYield: 0.5, gatherSpeed: 0.1, toolTier: 1 } },
  { id: 'reinforced_axe', name: 'Reinforced Axe', icon: '🪓', category: 'tool', slot: 'tool', tier: 1, description: 'Lashed and balanced. Gathers 80% more and swings faster.', stats: { gatherYield: 0.8, gatherSpeed: 0.15, toolTier: 1 } },
  { id: 'iron_pickaxe', name: 'Iron Pickaxe', icon: '⛏️', category: 'tool', slot: 'tool', tier: 2, description: 'Bites through crystal, bio-pods and scrap. Gathers 110% more.', stats: { gatherYield: 1.1, gatherSpeed: 0.2, toolTier: 2 } },
  { id: 'steel_harvester', name: 'Steel Harvester', icon: '🛠️', category: 'tool', slot: 'tool', tier: 3, description: 'A power-assisted steel tool that does half the swinging for you.', stats: { gatherYield: 1.5, gatherSpeed: 0.3, toolTier: 2 } },
  { id: 'alloy_drillpick', name: 'Alloy Drill-Pick', icon: '🔩', category: 'tool', slot: 'tool', tier: 4, description: 'A spinning alloy bit that chews through titanium ore.', stats: { gatherYield: 2.0, gatherSpeed: 0.4, toolTier: 3 } },
  { id: 'nano_cutter', name: 'Nano Cutter', icon: '✂️', category: 'tool', slot: 'tool', tier: 5, description: 'A blade one atom wide. Nodes practically fall apart.', stats: { gatherYield: 2.8, gatherSpeed: 0.55, toolTier: 3 } },
  { id: 'titan_beamtool', name: 'Titanium Beam Tool', icon: '🔆', category: 'tool', slot: 'tool', tier: 6, description: 'A glowing titanium beam that harvests anything in a blink.', stats: { gatherYield: 4.0, gatherSpeed: 0.8, toolTier: 3 } },

  // ------------------------------------------------------------------ weapons (range in world units)
  { id: 'flare_pistol', name: 'Flare Pistol', icon: '🔫', category: 'weapon', slot: 'weapon', tier: 0, description: 'Emergency pistol from the pod.', stats: { damage: 6, fireRate: 1.5, range: 12, projectile: 'bullet' } },
  { id: 'makeshift_rifle', name: 'Makeshift Rifle', icon: '🔫', category: 'weapon', slot: 'weapon', tier: 0, description: 'Scrap-built rifle. Reliable and loud.', stats: { damage: 12, fireRate: 2, range: 16, projectile: 'bullet' } },
  { id: 'colony_shotgun', name: 'Colony Shotgun', icon: '🔫', category: 'weapon', slot: 'weapon', tier: 1, description: 'Close-range boom stick. Aliens learn respect quickly.', stats: { damage: 30, fireRate: 1.1, range: 10, projectile: 'bullet' } },
  { id: 'assault_rifle', name: 'Assault Rifle', icon: '🔫', category: 'weapon', slot: 'weapon', tier: 3, description: 'Steel-barreled and fully automatic. Satisfyingly rattly.', stats: { damage: 22, fireRate: 5, range: 20, projectile: 'bullet' } },
  { id: 'energy_rifle', name: 'Energy Rifle', icon: '🔫', category: 'weapon', slot: 'weapon', tier: 4, description: 'Fires crackling bolts of focused crystal energy.', stats: { damage: 38, fireRate: 5, range: 22, projectile: 'laser' } },
  { id: 'plasma_rifle', name: 'Plasma Rifle', icon: '🔫', category: 'weapon', slot: 'weapon', tier: 5, description: 'Hurls glowing plasma that sizzles through armor.', stats: { damage: 80, fireRate: 3, range: 24, projectile: 'plasma' } },
  { id: 'titanium_rifle', name: 'Titanium Rifle', icon: '🔫', category: 'weapon', slot: 'weapon', tier: 6, description: 'A gleaming rail rifle. One shot, one very surprised alien.', stats: { damage: 170, fireRate: 2.5, range: 28, projectile: 'rail' } },

  // ------------------------------------------------------------------ armor (max health)
  { id: 'fiber_vest', name: 'Fiber Vest', icon: '🦺', category: 'armor', slot: 'armor', tier: 0, description: 'Woven fiber that is surprisingly sturdy. +30 max health.', stats: { hp: 30 } },
  { id: 'braided_vest', name: 'Braided Vest', icon: '🦺', category: 'armor', slot: 'armor', tier: 1, description: 'Tightly braided plant fiber. +60 max health.', stats: { hp: 60 } },
  { id: 'plated_vest', name: 'Plated Vest', icon: '🥋', category: 'armor', slot: 'armor', tier: 2, description: 'Stitched with iron plates. +100 max health.', stats: { hp: 100 } },
  { id: 'steel_armor', name: 'Steel Armor', icon: '🛡️', category: 'armor', slot: 'armor', tier: 3, description: 'Riveted steel plates with a surprisingly comfy lining. +160 max health.', stats: { hp: 160 } },
  { id: 'alloy_suit', name: 'Alloy Suit', icon: '🥽', category: 'armor', slot: 'armor', tier: 4, description: 'Light, shiny and tough as nails. +240 max health.', stats: { hp: 240 } },
  { id: 'nano_suit', name: 'Nano Suit', icon: '🧥', category: 'armor', slot: 'armor', tier: 5, description: 'Self-mending nano weave that hugs you like a second skin. +350 max health.', stats: { hp: 350, moveSpeed: 0.05 } },
  { id: 'titanium_exosuit', name: 'Titanium Exosuit', icon: '🦾', category: 'armor', slot: 'armor', tier: 6, description: 'A powered titanium exosuit. You feel unstoppable. +500 max health.', stats: { hp: 500, moveSpeed: 0.1 } },

  // ------------------------------------------------------------------ backpacks (total capacity)
  { id: 'small_backpack', name: 'Small Backpack', icon: '🎒', category: 'backpack', slot: 'backpack', tier: 0, description: 'Small but trusty. Carry up to 80 resources.', stats: { capacity: 80 } },
  { id: 'canvas_pack', name: 'Canvas Pack', icon: '🎒', category: 'backpack', slot: 'backpack', tier: 1, description: 'Roomy canvas rucksack. Carry up to 160 resources.', stats: { capacity: 160 } },
  { id: 'hiker_pack', name: 'Hiker Pack', icon: '🎒', category: 'backpack', slot: 'backpack', tier: 2, description: 'A frame pack with a dozen pockets. Carry up to 280 resources.', stats: { capacity: 280 } },
  { id: 'frame_pack', name: 'Steel Frame Pack', icon: '🎒', category: 'backpack', slot: 'backpack', tier: 3, description: 'Lightweight steel frame, enormous capacity. Carry up to 450 resources.', stats: { capacity: 450 } },
  { id: 'alloy_pack', name: 'Alloy Pack', icon: '🎒', category: 'backpack', slot: 'backpack', tier: 4, description: 'Feather-light alloy haulpack. Carry up to 700 resources.', stats: { capacity: 700 } },
  { id: 'nano_pack', name: 'Nano Pack', icon: '🎒', category: 'backpack', slot: 'backpack', tier: 5, description: 'Folded-space storage on your back. Carry up to 1,100 resources.', stats: { capacity: 1100 } },
  { id: 'titan_haulpack', name: 'Titanium Haulpack', icon: '🎒', category: 'backpack', slot: 'backpack', tier: 6, description: 'Impossibly large, impossibly light. Carry up to 1,800 resources.', stats: { capacity: 1800 } },

  // ------------------------------------------------------------------ utility gear
  { id: 'trail_boots', name: 'Trail Boots', icon: '🥾', category: 'utility', slot: 'utility', tier: 1, description: 'Sturdy boots with great grip. +10% move speed.', stats: { moveSpeed: 0.1 } },
  { id: 'work_gloves', name: 'Work Gloves', icon: '🧤', category: 'utility', slot: 'utility', tier: 2, description: 'Padded gloves for faster gathering. +20% gather speed.', stats: { gatherSpeed: 0.2 } },
  { id: 'jet_boots', name: 'Jet Boots', icon: '🚀', category: 'utility', slot: 'utility', tier: 3, description: 'Little steam jets under your heels. +20% move speed.', stats: { moveSpeed: 0.2 } },
  { id: 'precision_gloves', name: 'Precision Gloves', icon: '🧤', category: 'utility', slot: 'utility', tier: 4, description: 'Servo-assisted grip that never wastes a swing. +30% gather yield.', stats: { gatherYield: 0.3 } },
  { id: 'nano_jetpack', name: 'Nano Jetpack', icon: '🎽', category: 'utility', slot: 'utility', tier: 5, description: 'A whisper-quiet jetpack. +35% move speed, +50 health.', stats: { moveSpeed: 0.35, hp: 50 } },
  { id: 'grav_boots', name: 'Gravity Boots', icon: '👟', category: 'utility', slot: 'utility', tier: 6, description: 'Barely touch the ground. +50% move speed, +40% gather speed.', stats: { moveSpeed: 0.5, gatherSpeed: 0.4 } },

  // ------------------------------------------------------------------ consumables: medical
  { id: 'bandage', name: 'Bandage', icon: '🩹', category: 'consumable', tier: 0, description: 'A clean wrap for scrapes and bumps. Restores 40 health.', use: { heal: 40 } },
  { id: 'herbal_salve', name: 'Herbal Salve', icon: '🧴', category: 'consumable', tier: 1, description: 'Soothing alien herbs. Restores 80 health.', use: { heal: 80 } },
  { id: 'medkit', name: 'Medkit', icon: '🧰', category: 'consumable', tier: 2, description: 'A proper first-aid kit. Restores 150 health.', use: { heal: 150 } },
  { id: 'stim_pack', name: 'Stim Pack', icon: '💉', category: 'consumable', tier: 3, description: 'A jolt of get-up-and-go. Restores 250 health.', use: { heal: 250 } },
  { id: 'nano_injector', name: 'Nano Injector', icon: '💉', category: 'consumable', tier: 5, description: 'Nanobots patch you up from the inside. Restores 500 health.', use: { heal: 500 } },
  { id: 'regen_gel', name: 'Regeneration Gel', icon: '🧪', category: 'consumable', tier: 6, description: 'Glowing gel that heals practically anything. Restores 1,000 health.', use: { heal: 1000 } },

  // ------------------------------------------------------------------ consumables: drones & chips
  { id: 'helper_drone', name: 'Helper Drone', icon: '🛸', category: 'consumable', tier: 4, description: 'A cheerful little drone that doubles your gathering for 10 minutes.', use: { reward: { boost: { kind: 'gather', mult: 2, minutes: 10 } } } },
  { id: 'worker_drone', name: 'Worker Drone Kit', icon: '🤖', category: 'consumable', tier: 4, description: 'Deploys tiny assistants into your machines: +50% production for 15 minutes.', use: { reward: { boost: { kind: 'production', mult: 1.5, minutes: 15 } } } },
  { id: 'science_drone', name: 'Science Drone', icon: '🔭', category: 'consumable', tier: 4, description: 'Scans, samples and scribbles notes: 2x research for 15 minutes.', use: { reward: { boost: { kind: 'research', mult: 2, minutes: 15 } } } },
  { id: 'swarm_drone', name: 'Swarm Drone Pack', icon: '🐝', category: 'consumable', tier: 6, description: 'A glittering swarm that doubles all production for 30 minutes.', use: { reward: { boost: { kind: 'production', mult: 2, minutes: 30 } } } },
  { id: 'research_chip', name: 'Research Chip', icon: '💾', category: 'consumable', tier: 3, description: 'Packed with scan data. Plug it in for 30 research points.', use: { reward: { rp: 30 } } },
  { id: 'data_core', name: 'Data Core', icon: '💽', category: 'consumable', tier: 5, description: 'A dense crystal of alien data. Worth 250 research points.', use: { reward: { rp: 250 } } },
  { id: 'quantum_chip', name: 'Quantum Chip', icon: '🔮', category: 'consumable', tier: 6, description: 'Contains answers to questions nobody has asked yet. 1,500 research points.', use: { reward: { rp: 1500 } } },

  // ------------------------------------------------------------------ components (factory output, used by advanced recipes)
  { id: 'machine_parts', name: 'Machine Parts', icon: '⚙️', category: 'utility', tier: 3, description: 'Gears, bearings and pistons. The building blocks of every machine.' },
  { id: 'robotic_core', name: 'Robotic Core', icon: '🧠', category: 'utility', tier: 4, description: 'A tiny brain in a tough shell. Drones and vehicles need these.' },
  { id: 'nano_core', name: 'Nano Core', icon: '💠', category: 'utility', tier: 5, description: 'A swirling capsule of self-assembling nano-material.' },
  { id: 'titan_plating', name: 'Titanium Plating', icon: '🔷', category: 'utility', tier: 6, description: 'Gleaming titanium armor plates, perfectly smooth.' },

  // ------------------------------------------------------------------ crates (rewards + bundles; open for resources)
  { id: 'supply_crate', name: 'Supply Crate', icon: '🎁', category: 'crate', tier: 0, description: 'A crate of useful odds and ends. Open it for resources.', use: { reward: { resources: { wood: 60, stone: 40, fiber: 30, food: 30 } } } },
  { id: 'rations_crate', name: 'Rations Crate', icon: '🥫', category: 'crate', tier: 0, description: 'Tinned goodies and clean water for a hungry colony.', use: { reward: { resources: { food: 120, water: 100 } } } },
  { id: 'timber_bundle', name: 'Timber Bundle', icon: '🪵', category: 'crate', tier: 0, description: 'A tidy bundle of wood (90 when you tie it yourself). Handy when storage is full.', use: { reward: { resources: { wood: 90 } } } },
  { id: 'stone_bundle', name: 'Stone Bundle', icon: '🪨', category: 'crate', tier: 0, description: 'A neat stack of stone (90 when you tie it yourself), ready to unpack.', use: { reward: { resources: { stone: 90 } } } },
  { id: 'ore_bundle', name: 'Ore Bundle', icon: '⛓️', category: 'crate', tier: 2, description: 'Iron, copper and coal, strapped together.', use: { reward: { resources: { iron: 55, copper: 40, coal: 40 } } } },
  { id: 'steel_bundle', name: 'Steel Bundle', icon: '🔩', category: 'crate', tier: 3, description: 'A bundle of steel beams (90 when you tie it yourself).', use: { reward: { resources: { steel: 90 } } } },
  { id: 'colonist_crate', name: 'Colonist Crate', icon: '🧑‍🚀', category: 'crate', tier: 0, description: 'A cryo-pod holding a sleepy, grateful survivor. Open to wake a rare colonist.', use: { reward: { colonist: 'rare' } } },
  { id: 'defense_crate', name: 'Defense Crate', icon: '🛡️', category: 'crate', tier: 1, description: 'Stone, iron and coal for turrets and walls, plus a few med supplies.', use: { reward: { resources: { stone: 180, iron: 80, coal: 50, wood: 80 }, items: { medkit: 2 } } } },
  { id: 'tech_crate', name: 'Tech Crate', icon: '📦', category: 'crate', tier: 3, description: 'Circuits, copper and a few energy cells.', use: { reward: { resources: { electronics: 50, copper: 80, energy_cell: 6 } } } },
  { id: 'alloy_crate', name: 'Alloy Crate', icon: '📦', category: 'crate', tier: 4, description: 'Shiny alloy plates and a handful of crystals.', use: { reward: { resources: { alloy: 45, crystal: 25, steel: 80 } } } },
  { id: 'nano_crate', name: 'Nano Crate', icon: '📦', category: 'crate', tier: 5, description: 'A vial of swirling nano-material and spare energy cells.', use: { reward: { resources: { nano: 25, energy_cell: 40, alloy: 60 } } } },
  { id: 'titan_crate', name: 'Titanium Crate', icon: '📦', category: 'crate', tier: 6, description: 'Gleaming titanium ingots and nano-material.', use: { reward: { resources: { titanium: 40, nano: 20, energy_cell: 30 } } } },
  { id: 'mystery_crate', name: 'Mystery Crate', icon: '❓', category: 'crate', tier: 0, description: 'Rattle it. Shake it. Open it. You never know!', use: { reward: { resources: { wood: 100, stone: 80, fiber: 60, iron: 30 }, nova: 5, xp: 25 } } },
  // ------------------------------------------------------------------ Nova caches (data/chests.ts: tiers, art, odds)
  { id: 'chest_supply', name: 'Supply Cache', icon: '📦', category: 'crate', tier: 0, description: 'A sturdy field crate from the drop ship. 3 finds inside.', use: { chest: 'chest_supply' } },
  { id: 'chest_explorer', name: 'Explorer\'s Case', icon: '🧳', category: 'crate', tier: 0, description: 'A weathered expedition case. 4 finds, at least one rare.', use: { chest: 'chest_explorer' } },
  { id: 'chest_prospector', name: 'Prospector\'s Vault', icon: '🔒', category: 'crate', tier: 0, description: 'A brass strongbox from a lucky claim. 5 finds, at least one epic.', use: { chest: 'chest_prospector' } },
  { id: 'chest_relic', name: 'Ancient Relic', icon: '🗿', category: 'crate', tier: 0, description: 'A carved reliquary from the alien ruins. 6 finds, at least one legendary.', use: { chest: 'chest_relic' } },
  { id: 'chest_nova', name: 'Nova Core', icon: '🌟', category: 'crate', tier: 0, description: 'A titanium capsule around a captured star. 7 finds, including a mythic treasure.', use: { chest: 'chest_nova' } },
];
