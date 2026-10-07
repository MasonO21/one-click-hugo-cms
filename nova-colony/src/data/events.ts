import type { WorldEventDef } from './schema';

/**
 * World events: all eight kinds (meteor crash, abandoned spacecraft, survivor rescue, alien nest, supply drop,
 * rare merchant, crystal storm, ancient structure activation), each with a few tier-scaled variants.
 * `minTier` gates when a variant can show up; the reward scales with it. Everything here is optional bonus
 * loot — the colony never needs it, but it is always fun and always generous.
 */
export const WORLD_EVENTS: WorldEventDef[] = [
  // ---------------------------------------------------------------- supply drops
  { id: 'supply_drop', name: 'Supply Drop', icon: '🪂', kind: 'drop', minTier: 0, weight: 3, duration: 600, description: 'A supply pod is falling nearby!', poi: 'supply_pod', reward: { resources: { wood: 80, stone: 60, food: 40, water: 40 }, nova: 2, xp: 20 } },
  { id: 'supply_drop_industrial', name: 'Industrial Supply Drop', icon: '🪂', kind: 'drop', minTier: 3, weight: 2.5, duration: 600, description: 'A heavy-lift pod is dropping steel, copper and circuits. Run!', poi: 'supply_pod', reward: { resources: { steel: 100, iron: 150, copper: 80, electronics: 20 }, nova: 3, xp: 40 } },
  { id: 'supply_drop_nano', name: 'Nano Supply Drop', icon: '🪂', kind: 'drop', minTier: 5, weight: 2, duration: 600, description: 'A shimmering supply pod from orbit, brimming with advanced goodies.', poi: 'supply_pod', reward: { resources: { alloy: 90, nano: 20, energy_cell: 40, electronics: 50 }, nova: 5, xp: 70 } },

  // ---------------------------------------------------------------- meteors
  { id: 'meteor_crash', name: 'Meteor Crash', icon: '☄️', kind: 'meteor', minTier: 1, weight: 2, duration: 900, description: 'A meteor full of crystals crashed in the wilds.', poi: 'meteor_crater', reward: { resources: { crystal: 15, iron: 30 }, xp: 30 } },
  { id: 'great_meteor_fall', name: 'Great Meteor Fall', icon: '🌠', kind: 'meteor', minTier: 4, weight: 1.5, duration: 900, description: 'The sky is raining crystal-studded rocks. The craters are still glowing!', poi: 'meteor_crater', reward: { resources: { crystal: 70, alloy: 20, iron: 180, energy_cell: 10 }, nova: 4, xp: 70 } },

  // ---------------------------------------------------------------- abandoned spacecraft
  { id: 'abandoned_spacecraft', name: 'Abandoned Spacecraft', icon: '🚀', kind: 'wreck', minTier: 1, weight: 2, duration: 1200, description: 'A silent spacecraft has landed in the hills. Nobody is home, but the lights are on.', poi: 'wreck_signal', reward: { resources: { iron: 60, copper: 40, electronics: 8 }, rp: 25, xp: 30 } },
  { id: 'derelict_freighter_event', name: 'Derelict Freighter', icon: '🚢', kind: 'wreck', minTier: 4, weight: 1.5, duration: 1200, description: 'A huge cargo ship is drifting in low orbit, shedding crates. Catch them!', poi: 'wreck_signal', reward: { resources: { steel: 150, electronics: 70, copper: 120, alloy: 30 }, rp: 100, nova: 3, xp: 70 } },

  // ---------------------------------------------------------------- survivor rescues
  { id: 'survivor_rescue', name: 'Survivor Signal', icon: '🆘', kind: 'rescue', minTier: 0, weight: 2, duration: 900, description: 'A survivor is signalling for help. Go say hello!', poi: 'distress_beacon', reward: { colonist: 'common', resources: { food: 30, water: 30 }, xp: 25 } },
  { id: 'survivor_rescue_expert', name: 'Expert Survivors', icon: '🆘', kind: 'rescue', minTier: 3, weight: 1.2, duration: 900, description: 'A skilled specialist is stranded nearby. They look very, very grateful.', poi: 'distress_beacon', reward: { colonist: 'rare', items: { stim_pack: 1 }, xp: 50 } },

  // ---------------------------------------------------------------- alien nests
  { id: 'alien_nest_event', name: 'Rogue Alien Nest', icon: '🪺', kind: 'nest', minTier: 2, weight: 2, duration: 900, description: 'A fresh alien nest has popped up. Clear it out for tasty loot.', poi: 'rogue_nest', reward: { resources: { biomass: 40, crystal: 8 }, nova: 3, xp: 50 } },
  { id: 'hive_outbreak', name: 'Hive Outbreak', icon: '🕸️', kind: 'nest', minTier: 5, weight: 1.2, duration: 900, description: 'A massive hive is buzzing to life. Terrifying, but oh so rewarding.', poi: 'rogue_nest', reward: { resources: { biomass: 140, crystal: 45, nano: 8 }, nova: 8, xp: 100 } },

  // ---------------------------------------------------------------- rare merchants
  {
    id: 'rare_merchant', name: 'Wandering Merchant', icon: '🛒', kind: 'merchant', minTier: 2, weight: 2, duration: 700, description: 'A cheerful merchant with a very heavy cart. Fair trades, no haggling.', poi: 'merchant_caravan',
    reward: { xp: 15 },
    trades: [
      { give: { wood: 150 }, get: { iron: 70 } },
      { give: { stone: 150 }, get: { copper: 60 } },
      { give: { food: 100, water: 100 }, get: { coal: 90 } },
      { give: { fiber: 120 }, get: { steel: 24 } },
    ],
  },
  {
    id: 'rare_merchant_advanced', name: 'Galactic Trader', icon: '🛒', kind: 'merchant', minTier: 4, weight: 1.5, duration: 700, description: 'A shiny trader fresh from three solar systems. Their crates hum.', poi: 'merchant_caravan',
    reward: { xp: 25 },
    trades: [
      { give: { steel: 100 }, get: { alloy: 36 } },
      { give: { electronics: 60 }, get: { energy_cell: 30 } },
      { give: { iron: 300 }, get: { crystal: 50 } },
      { give: { biomass: 80 }, get: { nano: 12 } },
    ],
  },
  {
    id: 'rare_merchant_titan', name: 'Starlight Emporium', icon: '🛒', kind: 'merchant', minTier: 6, weight: 1.2, duration: 700, description: 'A towering caravan of glowing wares. Everything is suspiciously delightful.', poi: 'merchant_caravan',
    reward: { xp: 40 },
    trades: [
      { give: { alloy: 200 }, get: { nano: 60 } },
      { give: { energy_cell: 150 }, get: { titanium: 50 } },
      { give: { crystal: 200 }, get: { titanium: 36 } },
      { give: { nano: 100 }, get: { titanium: 80 } },
    ],
  },

  // ---------------------------------------------------------------- crystal storms (gather yield multiplier while active)
  { id: 'crystal_storm', name: 'Crystal Storm', icon: '🌩️', kind: 'storm', minTier: 2, weight: 2, duration: 480, yieldBonus: 2, description: 'Crystals are raining from the sky! Gather twice as much from every node.', reward: { resources: { crystal: 10 }, xp: 30 } },
  { id: 'ion_storm', name: 'Ion Storm', icon: '⚡', kind: 'storm', minTier: 4, weight: 1.5, duration: 480, yieldBonus: 2.5, description: 'Crackling ion clouds supercharge every resource node. Gather 2.5x as much!', reward: { resources: { crystal: 30, energy_cell: 8 }, xp: 50 } },
  { id: 'titan_aurora', name: 'Titan Aurora', icon: '🌌', kind: 'storm', minTier: 6, weight: 1.2, duration: 480, yieldBonus: 3, description: 'A dazzling aurora floods the sky. Every node yields triple!', reward: { resources: { crystal: 60, nano: 6 }, nova: 3, xp: 80 } },

  // ---------------------------------------------------------------- ancient structures
  { id: 'ancient_activation', name: 'Ancient Structure Awakens', icon: '🔺', kind: 'ancient', minTier: 3, weight: 1.5, duration: 900, description: 'An ancient obelisk is glowing and humming. Touch it before it falls asleep again.', poi: 'ancient_obelisk', reward: { rp: 300, resources: { crystal: 25, alloy: 10 }, nova: 6, xp: 80 } },
  { id: 'ancient_awakening', name: 'Ancient Awakening', icon: '🔺', kind: 'ancient', minTier: 5, weight: 1.2, duration: 900, description: 'The whole obelisk field is blazing with light. Ancient secrets are yours for the taking.', poi: 'ancient_obelisk', reward: { rp: 1500, resources: { crystal: 60, nano: 15 }, nova: 10, xp: 150 } },
];
