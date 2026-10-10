import type { AdPlacementDef, CosmeticDef, ProductDef, Reward, SeasonDef, SpinSegment, VipDef } from './schema';

/**
 * Monetization & live-ops. Design promise: every gameplay system and Titanium itself are reachable for free —
 * packs, passes and ads only ACCELERATE (a pack's resources are a small fraction of any tier-up cost) and
 * cosmetics are purely visual. Prices shown are fallbacks only; real prices come from the stores.
 */

/** Rewarded ads are always optional and always worth it. */
export const AD_PLACEMENTS: AdPlacementDef[] = [
  { id: 'offline_double', name: 'Double Offline Earnings', description: 'Watch a short video to DOUBLE everything your colony produced while you were away.', dailyLimit: 0, cooldown: 0 },
  { id: 'production_boost', name: '2× Production', description: 'Double all production for 10 minutes.', dailyLimit: 6, cooldown: 60 },
  { id: 'instant_craft', name: 'Instant Craft', description: 'Finish a crafting job instantly.', dailyLimit: 10, cooldown: 30 },
  { id: 'free_crate', name: 'Free Resource Crate', description: 'Open a free crate of resources.', dailyLimit: 4, cooldown: 600 },
  { id: 'recruit_refresh', name: 'New Recruits', description: 'Fresh faces: swap the survivors waiting at the recruitment board.', dailyLimit: 5, cooldown: 60 },
  { id: 'invasion_bonus', name: 'Bonus Spoils', description: 'Double the alien invasion reward chest.', dailyLimit: 0, cooldown: 0 },
  { id: 'research_bonus', name: 'Research Grant', description: 'Get bonus research points.', dailyLimit: 5, cooldown: 120 },
  { id: 'extra_spin', name: 'Extra Spin', description: 'Spin the Lucky Wheel again.', dailyLimit: 3, cooldown: 0 },
  { id: 'drone_assistant', name: 'Drone Helper', description: 'A helper drone auto-gathers around you for 5 minutes.', dailyLimit: 4, cooldown: 300 },
];

/** Prices shown here are fallbacks only — real localized prices come from App Store / Google Play. */
export const PRODUCTS: ProductDef[] = [
  // ---------------------------------------------------------------- the $0.99 starter + Nova Crystal packs ($4.99 → $99.99)
  { id: 'nova_starter_pack', section: 'packs', type: 'non_consumable', name: 'Starter Pack', description: '300 Nova Crystals, a pile of building resources, two supply crates and the exclusive Pioneer outfit. A great start!', fallbackPrice: '$0.99', limit: 1, tag: 'best_value', grants: { nova: 300, resources: { wood: 500, stone: 400, fiber: 200, food: 200 }, items: { supply_crate: 2 }, cosmetic: 'outfit_pioneer', bundleTag: 'starter' } },
  { id: 'nova_crystals_small', section: 'crystals', type: 'consumable', name: 'Crystal Pouch', description: '500 Nova Crystals.', fallbackPrice: '$4.99', limit: 0, grants: { nova: 500 } },
  { id: 'nova_builder_pack', section: 'packs', type: 'consumable', name: 'Builder Pack', description: '1,100 Nova + a 2-hour build & production boost.', fallbackPrice: '$9.99', limit: 0, tag: 'popular', grants: { nova: 1100, boost: { kind: 'production', mult: 2, minutes: 120 }, bundleTag: 'builder' } },
  { id: 'nova_colony_pack', section: 'crystals', type: 'consumable', name: 'Colony Pack', description: '2,400 Nova Crystals.', fallbackPrice: '$19.99', limit: 0, grants: { nova: 2400 } },
  { id: 'nova_commander_pack', section: 'crystals', type: 'consumable', name: 'Commander Pack', description: '6,500 Nova Crystals.', fallbackPrice: '$49.99', limit: 0, grants: { nova: 6500 } },
  { id: 'nova_ultimate_pack', section: 'crystals', type: 'consumable', name: 'Ultimate Colony Pack', description: '14,000 Nova Crystals.', fallbackPrice: '$99.99', limit: 0, tag: 'best_value', grants: { nova: 14000 } },

  // ---------------------------------------------------------------- themed packs (all only accelerate)
  { id: 'nova_colonist_pack', section: 'packs', type: 'consumable', name: 'Colonist Pack', description: 'An epic colonist, three colonist crates (rare survivors) and a feast of food and water to welcome them.', fallbackPrice: '$6.99', limit: 0, grants: { colonist: 'epic', items: { colonist_crate: 3 }, resources: { food: 600, water: 400 }, nova: 100, bundleTag: 'colonist' } },
  { id: 'nova_defense_pack', section: 'packs', type: 'consumable', name: 'Defense Pack', description: 'Four defense crates, medkits and a wagonload of stone, iron and steel for turrets and walls.', fallbackPrice: '$7.99', limit: 0, grants: { items: { defense_crate: 4, medkit: 4 }, resources: { stone: 800, iron: 400, coal: 200, steel: 150 }, nova: 150, bundleTag: 'defense' } },
  { id: 'nova_automation_pack', section: 'packs', type: 'consumable', name: 'Automation Pack', description: 'Tech crates, worker drones, a 2-hour production boost and a load of metals for your machines.', fallbackPrice: '$14.99', limit: 0, tag: 'popular', grants: { items: { tech_crate: 3, worker_drone: 3 }, resources: { iron: 600, copper: 500, steel: 400, electronics: 100 }, boost: { kind: 'production', mult: 2, minutes: 120 }, nova: 250, bundleTag: 'automation' } },
  { id: 'nova_titanium_founder', section: 'packs', type: 'non_consumable', name: 'Titanium Founder Pack', description: 'A late-game boost: titanium, nano-material, alloy, energy cells, titanium crates and the exclusive Founder outfit. Titanium itself is always free to earn.', fallbackPrice: '$29.99', limit: 1, tag: 'limited', grants: { nova: 1500, resources: { titanium: 300, nano: 200, energy_cell: 400, alloy: 600 }, items: { titan_crate: 3 }, cosmetic: 'outfit_founder', bundleTag: 'titanium_founder' } },

  // ---------------------------------------------------------------- subscription & season
  { id: 'colony_pass_monthly', section: 'vip', type: 'subscription', name: 'Colony Pass', description: 'Daily Nova, +10% production, longer offline storage, double daily rewards and monthly cosmetics.', fallbackPrice: '$7.99/mo', limit: 0, tag: 'popular', grants: { vipDays: 30 } },
  { id: 'season_pass_premium', section: 'season', type: 'non_consumable', name: 'Premium Season Track', description: 'Unlock premium rewards on the current season pass — including outfits, skins and epic colonists.', fallbackPrice: '$9.99', limit: 1, grants: { seasonPremium: true } },
  { id: 'season_xp_boost', section: 'season', type: 'consumable', name: 'Season Boost', description: 'Skip ahead ten levels on the season track (50,000 season XP).', fallbackPrice: '$4.99', limit: 0, grants: { xp: 50000 } },

  // ---------------------------------------------------------------- cosmetic bundles (also buyable with Nova)
  { id: 'cosmetic_sakura_theme', section: 'cosmetics', type: 'non_consumable', name: 'Sakura Colony Theme', description: 'Pink blossoms and soft lantern light across your whole colony.', fallbackPrice: '$2.99', limit: 1, grants: { cosmetic: 'theme_blossom' } },
  { id: 'cosmetic_neon_theme', section: 'cosmetics', type: 'non_consumable', name: 'Neon Night Theme', description: 'A synth-wave glow for your colony after dark.', fallbackPrice: '$2.99', limit: 1, tag: 'new', grants: { cosmetic: 'theme_neon_night' } },
  { id: 'cosmetic_turret_neon', section: 'cosmetics', type: 'non_consumable', name: 'Neon Turret Skin', description: 'Make every turret glow electric blue.', fallbackPrice: '$1.99', limit: 1, grants: { cosmetic: 'turret_neon' } },

  // ---------------------------------------------------------------- bundles (cosmetics / chests + Nova; top of the Packs tab)
  // Each is worth clearly more than its price in Nova: the wardrobe bundle's three cosmetics cost 900 Nova on their own.
  { id: 'bundle_frontier_wardrobe', section: 'bundles', type: 'non_consumable', name: 'Frontier Wardrobe Bundle', description: 'The Frontier Knit Sweater, a Knit Watch Cap and Expedition Parkas for the whole crew, plus 200 Nova.', fallbackPrice: '$4.99', limit: 1, tag: 'new', grants: { nova: 200, cosmetics: ['outfit_frontier_knit', 'hat_watch_cap', 'colonist_parkas'], bundleTag: 'frontier_wardrobe' } },
  { id: 'bundle_cache_hunter', section: 'bundles', type: 'consumable', name: 'Cache Hunter Bundle', description: 'Three Supply Caches, two Explorer’s Cases and a Prospector’s Vault to open, plus 300 Nova.', fallbackPrice: '$9.99', limit: 0, tag: 'popular', grants: { nova: 300, items: { chest_supply: 3, chest_explorer: 2, chest_prospector: 1 }, bundleTag: 'cache_hunter' } },
  { id: 'bundle_photo_frames', section: 'bundles', type: 'non_consumable', name: 'Photo Frame Bundle', description: 'Three Photo Mode frames: Field Journal, Blossom Branch and Star Chart, plus 50 Nova.', fallbackPrice: '$1.99', limit: 1, grants: { nova: 50, cosmetics: ['frame_journal', 'frame_blossom', 'frame_star_chart'], bundleTag: 'photo_frames' } },
];

/**
 * Every cosmetic is purely visual. Sources: a Nova price (Shop › Wardrobe), Nova chests (`chest: true`, rolled by
 * rarity — see data/chests.ts), the season pass, packs or VIP. Painted icons live at art/cosmetics/<id>.webp.
 * Rarity prices (Nova): common 120–250 · rare 300–450 · epic 500–900 · legendary 1000+ or chest-only · mythic chest-only.
 */
export const COSMETICS: CosmeticDef[] = [
  // ---- colony themes (palette accents across the colony + ambient particles)
  { id: 'theme_blossom', name: 'Blossom Season', kind: 'base_theme', color: '#e8a8b4', accent: '#b8576a', nova: 600, rarity: 'rare', icon: '🌸', fx: 'petals', chest: true, description: 'Dusky blossom-pink roofs and a slow drift of petals.' },
  { id: 'theme_aurora', name: 'Aurora Skies', kind: 'base_theme', color: '#6ec8b4', accent: '#8a72d8', nova: 900, rarity: 'epic', icon: '🌌', fx: 'aurora', chest: true, description: 'Green and violet light ripples over the colony at night.' },
  { id: 'theme_desert_dusk', name: 'Desert Dusk', kind: 'base_theme', color: '#c98a62', accent: '#e8b45a', nova: 700, rarity: 'rare', icon: '🏜️', fx: 'embers', chest: true, description: 'Terracotta trims and warm dust hanging in the evening air.' },
  { id: 'theme_winter', name: 'Winter Outpost', kind: 'base_theme', color: '#c4d6e6', accent: '#5a8fb8', nova: 700, rarity: 'rare', icon: '❄️', fx: 'snow', chest: true, description: 'Frosted roofs, steel-blue trims and quiet snowfall.' },
  { id: 'theme_neon_night', name: 'Neon Night', kind: 'base_theme', color: '#3a2f5c', accent: '#d84fb8', nova: 1000, rarity: 'epic', icon: '🌃', fx: 'fireflies', chest: true, description: 'Magenta signage glow and drifting neon motes after dark.' },
  { id: 'theme_golden_hour', name: 'Golden Hour', kind: 'base_theme', color: '#e8c98a', accent: '#d8843f', nova: 800, rarity: 'epic', icon: '🌅', fx: 'fireflies', chest: true, description: 'Honey-gold trims and fireflies in the long evening light.' },
  { id: 'theme_autumn', name: 'Autumn Harvest', kind: 'base_theme', color: '#c97a45', accent: '#9c3f2e', nova: 800, rarity: 'epic', icon: '🍂', fx: 'leaves', chest: true, description: 'Rust and amber roofs, maple leaves tumbling past.' },
  { id: 'theme_biolume', name: 'Bioluminescent Night', kind: 'base_theme', color: '#2f6f6a', accent: '#8a6ad8', nova: 0, rarity: 'legendary', icon: '🪼', fx: 'fireflies', chest: true, description: 'Teal and violet glow, like the planet’s own night life.' },
  { id: 'theme_starfall', name: 'Starfall', kind: 'base_theme', color: '#7a6fb8', accent: '#f0dc96', nova: 0, rarity: 'mythic', icon: '🌠', fx: 'stars', chest: true, description: 'Pale starlight settles over every rooftop.' },
  { id: 'theme_titanium_dawn', name: 'Titanium Dawn', kind: 'base_theme', color: '#d6dde6', accent: '#3fc8d8', nova: 0, rarity: 'legendary', icon: '🏙️', fx: 'stars', description: 'Earned by reaching Titanium: brushed silver and cyan.' },
  // ---- explorer outfits
  { id: 'outfit_pioneer', name: 'Pioneer Outfit', kind: 'outfit', color: '#b9783a', accent: '#e8c47a', nova: 0, rarity: 'rare', icon: '🧥', description: 'A trusty field jacket for the very first settlers.' },
  { id: 'outfit_engineer', name: 'Engineer Overalls', kind: 'outfit', color: '#d68a3f', accent: '#4a3f35', nova: 300, rarity: 'common', icon: '🔧', chest: true, description: 'Heavy canvas with a pocket for every spanner.' },
  { id: 'outfit_frontier_knit', name: 'Frontier Knit Sweater', kind: 'outfit', color: '#a8553f', accent: '#e8d8b8', nova: 350, rarity: 'rare', icon: '🧶', chest: true, description: 'A chunky cable-knit for cold mornings at camp.' },
  { id: 'outfit_botanist', name: "Botanist's Coveralls", kind: 'outfit', color: '#7f9a72', accent: '#c4a072', nova: 400, rarity: 'rare', icon: '🌿', chest: true, description: 'Sage coveralls with a canvas apron for seed packets.' },
  { id: 'outfit_storm_slicker', name: 'Storm Slicker', kind: 'outfit', color: '#d8a83a', accent: '#3a3a3f', nova: 400, rarity: 'rare', icon: '🧥', chest: true, description: 'A mustard rain slicker for monsoon season.' },
  { id: 'outfit_astro', name: 'Astronaut Suit', kind: 'outfit', color: '#eef0f4', accent: '#e06a35', nova: 500, rarity: 'epic', icon: '🧑‍🚀', description: 'Classic white-and-orange EVA suit.' },
  { id: 'outfit_neon_runner', name: 'Neon Runner', kind: 'outfit', color: '#26283f', accent: '#4fd8e8', nova: 600, rarity: 'epic', icon: '⚡', description: 'A dark runner’s jacket with lit seams for night patrols.' },
  { id: 'outfit_nomad', name: 'Desert Nomad Wraps', kind: 'outfit', color: '#c8a87a', accent: '#a8553a', nova: 0, rarity: 'epic', icon: '🏜️', chest: true, description: 'Layered sand-coloured wraps and a terracotta scarf.' },
  { id: 'outfit_observatory', name: 'Observatory Longcoat', kind: 'outfit', color: '#2f3866', accent: '#d8b45a', nova: 0, rarity: 'legendary', icon: '🔭', chest: true, description: 'Midnight blue, brass buttons, constellations stitched in gold.' },
  { id: 'outfit_founder', name: 'Titanium Founder Suit', kind: 'outfit', color: '#d6dde6', accent: '#e8c43a', nova: 0, rarity: 'legendary', icon: '🏅', description: 'Only for founders of the Titanium age.' },
  { id: 'outfit_nebula', name: 'Nebula Flight Suit', kind: 'outfit', color: '#4f3f8a', accent: '#c8a8f0', nova: 0, rarity: 'mythic', icon: '🌌', chest: true, description: 'Deep violet flight suit with softly glowing seams.' },
  // ---- headwear
  { id: 'hat_ranger', name: 'Ranger Hat', kind: 'hat', color: '#8a6a45', accent: '#4a3527', nova: 150, rarity: 'common', icon: '🤠', chest: true, description: 'Wide-brim felt with a worn leather band.' },
  { id: 'hat_watch_cap', name: 'Knit Watch Cap', kind: 'hat', color: '#5a6a7a', accent: '#c8c0b0', nova: 150, rarity: 'common', icon: '🧶', chest: true, description: 'A rolled-cuff wool cap for the night watch.' },
  { id: 'hat_bandana', name: 'Field Bandana', kind: 'hat', color: '#a8453a', accent: '#e8d8c0', nova: 300, rarity: 'rare', icon: '🧣', chest: true, description: 'A cotton bandana, knotted at the back.' },
  { id: 'hat_headset', name: 'Comms Headset', kind: 'hat', color: '#3a3f47', accent: '#e8843a', nova: 300, rarity: 'rare', icon: '🎧', chest: true, description: 'Over-ear comms with a mic boom. Base, do you copy?' },
  { id: 'hat_aviator', name: 'Aviator Cap', kind: 'hat', color: '#7a4a2f', accent: '#b8c8d0', nova: 550, rarity: 'epic', icon: '🥽', chest: true, description: 'Leather flight cap with brass-rimmed goggles.' },
  { id: 'hat_pith_helmet', name: 'Expedition Pith Helmet', kind: 'hat', color: '#c8b48a', accent: '#6a5a45', nova: 0, rarity: 'epic', icon: '⛑️', chest: true, description: 'The classic khaki helmet of the old explorers.' },
  { id: 'hat_space_bubble', name: 'Bubble Helmet', kind: 'hat', color: '#c8e0ea', accent: '#e06a35', nova: 0, rarity: 'epic', icon: '🫧', description: 'A retro-futurist glass dome. Season reward.' },
  { id: 'hat_commander', name: "Commander's Beret", kind: 'hat', color: '#2a3557', accent: '#e8c43a', nova: 0, rarity: 'legendary', icon: '🎖️', chest: true, description: 'Navy wool with the colony’s gold insignia.' },
  { id: 'hat_sensor_visor', name: 'Sensor Visor', kind: 'hat', color: '#2f343c', accent: '#4fd8c8', nova: 0, rarity: 'legendary', icon: '🕶️', chest: true, description: 'A sleek visor with a glowing heads-up strip.' },
  { id: 'hat_drone_halo', name: 'Drone Halo', kind: 'hat', color: '#d6dde6', accent: '#7ac8f0', nova: 0, rarity: 'mythic', icon: '🛰️', chest: true, description: 'Three tiny drones orbit your head on light trails.' },
  // ---- companions (follow the explorer around)
  { id: 'pet_robo_hound', name: 'Robo Hound', kind: 'pet', color: '#b8c0cc', accent: '#3fa8d8', nova: 600, rarity: 'rare', icon: '🐕', chest: true, description: 'A sleek four-legged scout bot that never leaves your side.' },
  { id: 'pet_survey_drone', name: 'Survey Drone', kind: 'pet', color: '#d8843f', accent: '#4fd8e8', nova: 600, rarity: 'rare', icon: '🛸', chest: true, description: 'Hovers at your shoulder, quietly mapping the terrain.' },
  { id: 'pet_ships_cat', name: "Ship's Cat", kind: 'pet', color: '#c8843f', accent: '#5a4a3a', nova: 900, rarity: 'epic', icon: '🐈', chest: true, description: 'A tabby in a little harness. Every good crew has one.' },
  { id: 'pet_lunar_hare', name: 'Lunar Hare', kind: 'pet', color: '#d8dce6', accent: '#8a92b8', nova: 0, rarity: 'epic', icon: '🐇', description: 'A silvery long-eared native that took a liking to you. Season reward.' },
  { id: 'pet_ember_fox', name: 'Ember Fox', kind: 'pet', color: '#d8703a', accent: '#f0c86a', nova: 0, rarity: 'legendary', icon: '🦊', chest: true, description: 'An alien fox whose tail glows like banked embers.' },
  { id: 'pet_lumen_moth', name: 'Lumen Moth', kind: 'pet', color: '#8ab8a8', accent: '#e8e0a8', nova: 0, rarity: 'legendary', icon: '🦋', chest: true, description: 'A large, gentle moth with softly glowing wings.' },
  { id: 'pet_sky_whale', name: 'Sky Whale', kind: 'pet', color: '#5a7ab8', accent: '#d8e8f0', nova: 0, rarity: 'mythic', icon: '🐋', chest: true, description: 'A small, majestic whale that swims through the air.' },
  // ---- crew outfits (every colonist)
  { id: 'colonist_overalls', name: 'Colonist Overalls', kind: 'colonist_outfit', color: '#4f78a8', accent: '#e8c47a', nova: 250, rarity: 'common', icon: '👖', chest: true, description: 'Matching denim work wear for the whole crew.' },
  { id: 'colonist_harvest', name: 'Harvest Crew Gear', kind: 'colonist_outfit', color: '#b89a62', accent: '#6a8a4a', nova: 250, rarity: 'common', icon: '🌾', chest: true, description: 'Canvas work shirts and wide hats for the fields.' },
  { id: 'colonist_labcoat', name: 'Lab Coat Deluxe', kind: 'colonist_outfit', color: '#eef0f4', accent: '#4f8ac8', nova: 300, rarity: 'rare', icon: '🥼', chest: true, description: 'Crisp white coats with steel-blue piping.' },
  { id: 'colonist_security', name: 'Security Armor', kind: 'colonist_outfit', color: '#7a8494', accent: '#b8453a', nova: 350, rarity: 'rare', icon: '🛡️', chest: true, description: 'Grey plate with red trim for the watch.' },
  { id: 'colonist_parkas', name: 'Expedition Parkas', kind: 'colonist_outfit', color: '#a8553a', accent: '#d8ccb8', nova: 400, rarity: 'rare', icon: '🧥', chest: true, description: 'Rust parkas with fur-lined hoods for everyone.' },
  { id: 'colonist_dress_uniform', name: "Founders' Dress Uniform", kind: 'colonist_outfit', color: '#2a3557', accent: '#e8d8b0', nova: 0, rarity: 'epic', icon: '🎖️', chest: true, description: 'Navy and cream with gold piping, for the big days.' },
  // ---- ride paint (the player's vehicle)
  { id: 'ride_rally', name: 'Rally Stripes', kind: 'vehicle_skin', color: '#b8352f', accent: '#f0ece4', nova: 300, rarity: 'rare', icon: '🏁', chest: true, description: 'Red paint with white racing stripes.' },
  { id: 'ride_sunset', name: 'Sunset Livery', kind: 'vehicle_skin', color: '#d8703a', accent: '#a83f6a', nova: 300, rarity: 'rare', icon: '🌇', chest: true, description: 'An orange-to-magenta fade, like dusk on the dunes.' },
  { id: 'ride_camo', name: 'Jungle Camo', kind: 'vehicle_skin', color: '#4a6a3a', accent: '#a8b46a', nova: 450, rarity: 'rare', icon: '🌿', chest: true, description: 'Blend right into the bubble trees.' },
  { id: 'ride_aurora', name: 'Aurora Livery', kind: 'vehicle_skin', color: '#6ec8b4', accent: '#8a72d8', nova: 500, rarity: 'epic', icon: '🌈', description: 'A shifting green-to-violet pearl finish.' },
  { id: 'ride_chrome', name: 'Chrome Finish', kind: 'vehicle_skin', color: '#dde4ec', accent: '#3fc8d8', nova: 700, rarity: 'epic', icon: '✨', chest: true, description: 'Polished to a mirror shine.' },
  { id: 'ride_carbon_gold', name: 'Carbon & Gold', kind: 'vehicle_skin', color: '#26282c', accent: '#d8b45a', nova: 0, rarity: 'legendary', icon: '🏎️', chest: true, description: 'Carbon black with fine gold pinstripes.' },
  // ---- turret finishes
  { id: 'turret_bronze', name: 'Bronze Turrets', kind: 'turret_skin', color: '#a8743f', accent: '#e8c47a', nova: 350, rarity: 'rare', icon: '🥉', chest: true, description: 'Polished bronze with brass rivets.' },
  { id: 'turret_patina', name: 'Copper Patina', kind: 'turret_skin', color: '#4f9a8a', accent: '#b8743f', nova: 400, rarity: 'rare', icon: '🗿', chest: true, description: 'Weathered copper gone green with verdigris.' },
  { id: 'turret_ice', name: 'Ice Crystal Turrets', kind: 'turret_skin', color: '#c4dcec', accent: '#4f9ad8', nova: 400, rarity: 'rare', icon: '🧊', chest: true, description: 'Frosted blue with crystalline trims.' },
  { id: 'turret_neon', name: 'Neon Turrets', kind: 'turret_skin', color: '#26304f', accent: '#3fc8e8', nova: 500, rarity: 'epic', icon: '💡', description: 'Every turret glows electric blue.' },
  { id: 'turret_gold', name: 'Golden Turrets', kind: 'turret_skin', color: '#d8b43a', accent: '#f0e8c8', nova: 0, rarity: 'legendary', icon: '🏆', chest: true, description: 'Gilded defenses. The aliens take notice.' },
  // ---- decor sets (unlock exclusive decor in Build › Decor)
  { id: 'deco_zen_garden', name: 'Zen Rock Garden', kind: 'decoration', color: '#c8c0b0', accent: '#5a7a4a', nova: 300, rarity: 'common', icon: '🪨', chest: true, description: 'Unlocks raked gravel beds, standing stones and a bonsai.' },
  { id: 'deco_harvest', name: 'Harvest Festival', kind: 'decoration', color: '#d8843a', accent: '#6a7a3a', nova: 300, rarity: 'common', icon: '🎃', chest: true, description: 'Unlocks pumpkins, hay bales and crates of produce.' },
  { id: 'deco_lantern_festival', name: 'Lantern Festival', kind: 'decoration', color: '#d8843a', accent: '#f0d08a', nova: 400, rarity: 'rare', icon: '🏮', description: 'Unlocks a glowing lantern arch and lantern strings.' },
  { id: 'deco_holo_trees', name: 'Holo Trees', kind: 'decoration', color: '#4fc8d8', accent: '#8a72d8', nova: 600, rarity: 'epic', icon: '🌳', chest: true, description: 'Unlocks shimmering hologram trees.' },
  { id: 'deco_campfire_lounge', name: 'Campfire Lounge', kind: 'decoration', color: '#8a5a3a', accent: '#f0b45a', nova: 0, rarity: 'epic', icon: '🔥', chest: true, description: 'Unlocks a stone fire pit, log benches and string lights.' },
  { id: 'deco_meteor_fountain', name: 'Meteorite Fountain', kind: 'decoration', color: '#5a8ab8', accent: '#f0c86a', nova: 0, rarity: 'legendary', icon: '☄️', chest: true, description: 'Unlocks a fountain built around a softly glowing meteorite.' },
  // ---- photo frames (Photo Mode)
  { id: 'frame_journal', name: 'Field Journal', kind: 'photo_frame', color: '#8a5f3f', accent: '#e8dcc0', nova: 120, rarity: 'common', icon: '📔', chest: true, description: 'Stitched leather and paper, taped in like a field note.' },
  { id: 'frame_blossom', name: 'Blossom Branch', kind: 'photo_frame', color: '#e8d8d0', accent: '#b8576a', nova: 200, rarity: 'rare', icon: '🌸', chest: true, description: 'Blossom branches reaching across two corners.' },
  { id: 'frame_star_chart', name: 'Star Chart', kind: 'photo_frame', color: '#26305a', accent: '#d8b45a', nova: 200, rarity: 'rare', icon: '🧭', chest: true, description: 'Navy chart paper with constellation lines and a compass rose.' },
  { id: 'frame_brass', name: 'Brass & Glass', kind: 'photo_frame', color: '#b8893f', accent: '#5a4a35', nova: 0, rarity: 'epic', icon: '⚙️', description: 'A riveted brass frame with little gauges. Season reward.' },
  { id: 'frame_geode', name: 'Crystal Geode', kind: 'photo_frame', color: '#7a5ab8', accent: '#c8b8f0', nova: 0, rarity: 'legendary', icon: '💎', chest: true, description: 'Your photo set inside a split amethyst geode.' },
];

export const VIP: VipDef = {
  productId: 'colony_pass_monthly',
  dailyNova: 30,
  productionBonus: 0.1,
  offlineHoursBonus: 4,
  dailyRewardMult: 2,
  description: ['30 Nova Crystals every day', '+10% resource production', '+4h offline production storage', 'Double daily login rewards', 'Exclusive decorations & a monthly outfit'],
};

// ---------------------------------------------------------------------------------------------
// Season pass — 50 levels, free + premium tracks. XP comes from normal play.
// ---------------------------------------------------------------------------------------------

/**
 * Premium cosmetics, one every 5 levels (10 in all). The season exclusives (bubble helmet, lunar hare, brass frame…)
 * live here; the bookends (the Comms Headset early, the legendary Ember Fox near the end) are chest drops a pass holder gets
 * for sure.
 */
const SEASON_PREMIUM_COSMETICS: Record<number, string> = {
  5: 'hat_headset', 10: 'outfit_astro', 15: 'hat_space_bubble', 20: 'theme_aurora', 25: 'pet_lunar_hare',
  30: 'ride_aurora', 35: 'frame_brass', 40: 'turret_neon', 45: 'pet_ember_fox', 50: 'outfit_neon_runner',
};
/** Premium Nova caches: Supply early, Explorer and Prospector mid-season, an Ancient Relic near the end, a Nova Core at 50. */
const SEASON_PREMIUM_CHESTS: Record<number, string> = {
  3: 'chest_supply', 8: 'chest_supply', 13: 'chest_explorer', 22: 'chest_explorer', 27: 'chest_prospector', 38: 'chest_prospector',
  47: 'chest_relic', 50: 'chest_nova',
};
/** A few Supply Caches on the free track too. */
const SEASON_FREE_CHESTS: Record<number, string> = { 4: 'chest_supply', 18: 'chest_supply', 33: 'chest_supply' };
/** Milestone rewards on the free track (every 10 levels). */
const SEASON_FREE_MILESTONES: Record<number, Reward> = {
  10: { nova: 25, items: { supply_crate: 2 } },
  20: { nova: 35, items: { mystery_crate: 1 }, colonist: 'common' },
  30: { nova: 45, items: { defense_crate: 1 }, colonist: 'rare' },
  40: { nova: 60, items: { tech_crate: 1 }, boost: { kind: 'production', mult: 2, minutes: 30 } },
  50: { nova: 120, cosmetic: 'deco_lantern_festival', items: { mystery_crate: 2 } },
};

/** Add one of an item to a reward (merging with items already there). */
function withItem(r: Reward, id: string | undefined): Reward {
  return id ? { ...r, items: { ...(r.items ?? {}), [id]: (r.items?.[id] ?? 0) + 1 } } : r;
}

function seasonLevels(): SeasonDef['levels'] {
  const levels: SeasonDef['levels'] = [];
  for (let i = 1; i <= 50; i++) {
    let free: Reward;
    let premium: Reward;
    if (i % 10 === 0) {
      free = SEASON_FREE_MILESTONES[i];
      premium = {
        nova: 50 + i * 2,
        colonist: i >= 50 ? 'legendary' : i >= 20 ? 'epic' : 'rare',
        items: i >= 40 ? { titan_crate: 1 } : i >= 30 ? { nano_crate: 1 } : { supply_crate: 3 },
      };
    } else if (i % 5 === 0) {
      free = { nova: 10 + i / 5 * 2 };
      premium = { nova: 25 + i, items: { mystery_crate: 1 } };
    } else if (i <= 15) {
      // early levels: basic resources
      free = { resources: { wood: 40 + 20 * i, stone: 30 + 15 * i, fiber: 20 + 10 * i } };
      premium = { resources: { food: 60 + 25 * i, water: 60 + 25 * i, wood: 60 + 20 * i }, rp: 5 * i };
    } else if (i <= 30) {
      // mid levels: metals
      free = { resources: { iron: 30 + 6 * i, copper: 20 + 5 * i, coal: 20 + 5 * i } };
      premium = { resources: { steel: 20 + 5 * i, electronics: 5 + i, stone: 100 + 10 * i }, rp: 12 * i, items: { stim_pack: 1 } };
    } else {
      // late levels: advanced
      free = { resources: { steel: 40 + 4 * i, electronics: 10 + 2 * i, crystal: 4 + i } };
      premium = { resources: { alloy: 5 + 2 * i, energy_cell: 3 + i, nano: Math.floor(i / 5) }, rp: 30 * i, items: { research_chip: 2 } };
    }
    // a handful of Nova on the even premium levels in between (level 1 stays a pure welcome gift of supplies).
    // The whole premium track pays back about the pass's price in Nova (~1,100, like the $9.99 Builder Pack):
    // its cosmetics, chests and colonists are the reason to buy it, so it never undercuts the Nova packs.
    if (i % 5 !== 0 && i % 2 === 0) premium = { ...premium, nova: 10 + Math.floor(i / 4) };
    if (SEASON_PREMIUM_COSMETICS[i]) premium = { ...premium, cosmetic: SEASON_PREMIUM_COSMETICS[i] };
    premium = withItem(premium, SEASON_PREMIUM_CHESTS[i]);
    free = withItem(free, SEASON_FREE_CHESTS[i]);
    levels.push({ free, premium });
  }
  return levels;
}

/**
 * Season XP per level. A season runs about a month (SEASON.days): an engaged free player (five 20-minute sessions a day)
 * earns ~9,000 season XP a day from play, missions, medals and exploration, so the 50 levels of the free track fill
 * up in the last days of the season (the pacing bot: level 50 around day 27), not in the first week.
 */
const SEASON_XP_PER_LEVEL = 5000;

export const SEASON: SeasonDef = {
  id: 'season_1',
  name: 'Season 1: First Light',
  days: 30,
  xpPerLevel: SEASON_XP_PER_LEVEL,
  levels: seasonLevels(),
  // after level 50 the premium track keeps paying: an Explorer’s Case for every further level's worth of XP (repeatable)
  bonus: { xp: SEASON_XP_PER_LEVEL, reward: { items: { chest_explorer: 1 } } },
  // Note: 'gather' is XP per gather hit (fractions accumulate).
  xp: { gather: 0.25, build: 6, craft: 5, kill: 1, defend: 50, mission: 30, discover: 60, research: 20 },
};

// ---------------------------------------------------------------------------------------------
// Daily login (7 days, matches the brief: resources → crafting mats → Nova → colonist → defense crate → Nova → legendary,
// with an Explorer's Case on day 7 so free players open caches too)
// ---------------------------------------------------------------------------------------------

export const DAILY_REWARDS: Reward[] = [
  { resources: { wood: 200, stone: 150, food: 100, water: 100 } },
  { resources: { iron: 100, copper: 80, coal: 60, fiber: 150 }, items: { bandage: 3 } },
  { nova: 20 },
  { colonist: 'rare', resources: { food: 100 } },
  { items: { defense_crate: 2 }, resources: { stone: 200 } },
  { nova: 40 },
  { nova: 60, colonist: 'legendary', boost: { kind: 'production', mult: 2, minutes: 30 }, items: { mystery_crate: 2, chest_explorer: 1 } },
];

// earthy frontier tones like the painted prize wheel in the Lucky Spin banner (not candy brights)
export const SPIN_SEGMENTS: SpinSegment[] = [
  { label: 'Wood', color: '#b5793f', weight: 18, reward: { resources: { wood: 150 } } },
  { label: 'Stone', color: '#7d8b96', weight: 18, reward: { resources: { stone: 120 } } },
  { label: 'Food & Water', color: '#3f7f7a', weight: 16, reward: { resources: { food: 100, water: 100 } } },
  { label: 'Iron Haul', color: '#b5603a', weight: 10, reward: { resources: { iron: 60, copper: 40, coal: 40 } } },
  { label: '10 Nova', color: '#7d5a8c', weight: 8, reward: { nova: 10 } },
  { label: '2× Boost', color: '#c99a45', weight: 8, reward: { boost: { kind: 'production', mult: 2, minutes: 15 } } },
  { label: 'Research', color: '#5f7486', weight: 12, reward: { rp: 30 } },
  { label: 'Mystery Crate', color: '#a8875a', weight: 6, reward: { items: { mystery_crate: 1 } } },
  { label: 'Rare Colonist', color: '#7f8f4a', weight: 3, reward: { colonist: 'rare' } },
  { label: '50 Nova', color: '#5e3f6e', weight: 2, reward: { nova: 50 } },
];

export const STARTER_KIT = {
  resources: { wood: 10, food: 20, water: 20 } as Record<string, number>,
  items: { survival_tool: 1, flare_pistol: 1, small_backpack: 1, bandage: 2 } as Record<string, number>,
  equip: { tool: 'survival_tool', weapon: 'flare_pistol', backpack: 'small_backpack' } as Record<string, string>,
};
