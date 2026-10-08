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
  { id: 'recruit_refresh', name: 'New Recruits', description: 'Refresh the recruitment board now.', dailyLimit: 5, cooldown: 60 },
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
  { id: 'season_xp_boost', section: 'season', type: 'consumable', name: 'Season Boost', description: 'Skip ahead ten levels on the season track (4,000 season XP).', fallbackPrice: '$4.99', limit: 0, grants: { xp: 4000 } },

  // ---------------------------------------------------------------- cosmetic bundles (also buyable with Nova)
  { id: 'cosmetic_sakura_theme', section: 'cosmetics', type: 'non_consumable', name: 'Sakura Colony Theme', description: 'Pink blossoms and soft lantern light across your whole colony.', fallbackPrice: '$2.99', limit: 1, grants: { cosmetic: 'theme_sakura' } },
  { id: 'cosmetic_neon_theme', section: 'cosmetics', type: 'non_consumable', name: 'Neon Night Theme', description: 'A synth-wave glow for your colony after dark.', fallbackPrice: '$2.99', limit: 1, tag: 'new', grants: { cosmetic: 'theme_neon_night' } },
  { id: 'cosmetic_turret_neon', section: 'cosmetics', type: 'non_consumable', name: 'Neon Turret Skin', description: 'Make every turret glow electric blue.', fallbackPrice: '$1.99', limit: 1, grants: { cosmetic: 'turret_neon' } },

  // ---------------------------------------------------------------- bundles (cosmetics / chests + Nova; top of the Packs tab)
  // Each is worth clearly more than its price in Nova: the wardrobe bundle's three cosmetics cost 900 Nova on their own.
  { id: 'bundle_cozy_wardrobe', section: 'bundles', type: 'non_consumable', name: 'Cozy Wardrobe Bundle', description: 'The Cozy Knit Sweater, a Pom-Pom Beanie and knitted scarves for the whole crew, plus 200 Nova.', fallbackPrice: '$4.99', limit: 1, tag: 'new', grants: { nova: 200, cosmetics: ['outfit_cozy_knit', 'hat_beanie', 'colonist_cozy_scarves'], bundleTag: 'cozy_wardrobe' } },
  { id: 'bundle_chest_lover', section: 'bundles', type: 'consumable', name: 'Chest Lover Bundle', description: 'Three Acorn chests, two Moonlit chests and a Sunflower chest to open, plus 300 Nova.', fallbackPrice: '$9.99', limit: 0, tag: 'popular', grants: { nova: 300, items: { chest_acorn: 3, chest_moonlit: 2, chest_sunny: 1 }, bundleTag: 'chest_lover' } },
  { id: 'bundle_photo_frames', section: 'bundles', type: 'non_consumable', name: 'Photo Frame Bundle', description: 'Three Photo Mode frames: cozy knit, sakura petals and a starry night, plus 50 Nova.', fallbackPrice: '$1.99', limit: 1, grants: { nova: 50, cosmetics: ['frame_cozy_knit', 'frame_sakura', 'frame_starry'], bundleTag: 'photo_frames' } },
];

/**
 * Every cosmetic is purely visual. Sources: a Nova price (Shop › Wardrobe), Nova chests (`chest: true`, rolled by
 * rarity — see data/chests.ts), the season pass, packs or VIP. Painted icons live at art/cosmetics/<id>.webp.
 * Rarity prices (Nova): common 120–250 · rare 300–450 · epic 500–900 · legendary 1000+ or chest-only · mythic chest-only.
 */
export const COSMETICS: CosmeticDef[] = [
  // ---- colony themes (palette accents across the colony + ambient particles)
  { id: 'theme_sakura', name: 'Sakura Colony Theme', kind: 'base_theme', color: '#ffb7c5', accent: '#ff6f91', nova: 600, rarity: 'rare', icon: '🌸', fx: 'petals', chest: true, description: 'Pink blossoms drift over soft rosy roofs.' },
  { id: 'theme_aurora', name: 'Aurora Colony Theme', kind: 'base_theme', color: '#7be0c8', accent: '#9a7bff', nova: 900, rarity: 'epic', icon: '🌌', fx: 'aurora', chest: true, description: 'Ribbons of green and violet light dance overhead.' },
  { id: 'theme_desert_dusk', name: 'Desert Dusk Theme', kind: 'base_theme', color: '#e0956a', accent: '#ffcf6a', nova: 700, rarity: 'rare', icon: '🏜️', fx: 'embers', chest: true, description: 'Warm terracotta trims and glowing dust motes.' },
  { id: 'theme_frostbite', name: 'Frostbite Theme', kind: 'base_theme', color: '#cfe8ff', accent: '#6ac8ff', nova: 700, rarity: 'rare', icon: '❄️', fx: 'snow', chest: true, description: 'Frosty blue roofs and gentle, never-ending snowfall.' },
  { id: 'theme_neon_night', name: 'Neon Night Theme', kind: 'base_theme', color: '#3a2a6a', accent: '#ff4fd8', nova: 1000, rarity: 'epic', icon: '🌃', fx: 'fireflies', chest: true, description: 'Synth-wave pinks glowing in the dark.' },
  { id: 'theme_golden_hour', name: 'Golden Hour Theme', kind: 'base_theme', color: '#ffd89a', accent: '#ff9a4a', nova: 800, rarity: 'epic', icon: '🌅', fx: 'fireflies', chest: true, description: 'Honey-gold trims and lazy summer fireflies.' },
  { id: 'theme_autumn', name: 'Autumn Harvest Theme', kind: 'base_theme', color: '#e08a4a', accent: '#c4503a', nova: 800, rarity: 'epic', icon: '🍂', fx: 'leaves', chest: true, description: 'Pumpkin-orange roofs and tumbling maple leaves.' },
  { id: 'theme_candy', name: 'Candy Pastel Theme', kind: 'base_theme', color: '#ffc6e8', accent: '#9ae6ff', nova: 0, rarity: 'legendary', icon: '🍬', fx: 'petals', chest: true, description: 'Bubblegum pinks and minty blues, sweet as can be.' },
  { id: 'theme_starlight', name: 'Starlight Theme', kind: 'base_theme', color: '#b8a8ff', accent: '#fff2a8', nova: 0, rarity: 'mythic', icon: '🌠', fx: 'stars', chest: true, description: 'Twinkling stardust settles on every rooftop.' },
  { id: 'theme_titanium_dawn', name: 'Titanium Dawn Theme', kind: 'base_theme', color: '#dfe6ee', accent: '#45f0ff', nova: 0, rarity: 'legendary', icon: '🏙️', fx: 'stars', description: 'Earned by reaching Titanium: gleaming silver and cyan.' },
  // ---- player outfits
  { id: 'outfit_pioneer', name: 'Pioneer Outfit', kind: 'outfit', color: '#d98c3f', accent: '#ffe08a', nova: 0, rarity: 'rare', icon: '🤠', description: 'A trusty jacket for the very first settlers.' },
  { id: 'outfit_engineer', name: 'Engineer Overalls', kind: 'outfit', color: '#f0a64b', accent: '#5a4a3a', nova: 300, rarity: 'common', icon: '🔧', chest: true, description: 'Pockets for every spanner you own.' },
  { id: 'outfit_cozy_knit', name: 'Cozy Knit Sweater', kind: 'outfit', color: '#c46a5a', accent: '#f6e2c0', nova: 350, rarity: 'rare', icon: '🧶', chest: true, description: 'Hand-knitted, extra snuggly.' },
  { id: 'outfit_strawberry', name: 'Strawberry Overalls', kind: 'outfit', color: '#ff6b7a', accent: '#fff4f0', nova: 400, rarity: 'rare', icon: '🍓', chest: true, description: 'Berry-red with little cream seeds.' },
  { id: 'outfit_frog_raincoat', name: 'Froggy Raincoat', kind: 'outfit', color: '#7cc36b', accent: '#ffe08a', nova: 400, rarity: 'rare', icon: '🐸', chest: true, description: 'For splashing through alien puddles.' },
  { id: 'outfit_astro', name: 'Astronaut Suit', kind: 'outfit', color: '#f4f6fa', accent: '#ff7a3a', nova: 500, rarity: 'epic', icon: '🧑‍🚀', description: 'Classic white-and-orange space suit.' },
  { id: 'outfit_neon_runner', name: 'Neon Runner', kind: 'outfit', color: '#2a2a4a', accent: '#5ef2ff', nova: 600, rarity: 'epic', icon: '⚡', description: 'Glowing stripes for night-time explorers.' },
  { id: 'outfit_honeybee', name: 'Honeybee Hoodie', kind: 'outfit', color: '#ffcf3a', accent: '#4a3a2a', nova: 0, rarity: 'epic', icon: '🐝', chest: true, description: 'Fuzzy stripes and tiny wings on the back.' },
  { id: 'outfit_starry_pj', name: 'Starry Pajamas', kind: 'outfit', color: '#3a3f8a', accent: '#ffe08a', nova: 0, rarity: 'legendary', icon: '🌙', chest: true, description: 'Sleepy-time blues sprinkled with gold stars.' },
  { id: 'outfit_founder', name: 'Titanium Founder Suit', kind: 'outfit', color: '#dfe6ee', accent: '#ffd84a', nova: 0, rarity: 'legendary', icon: '🏅', description: 'Only for founders of the Titanium age.' },
  { id: 'outfit_cosmic', name: 'Stardust Suit', kind: 'outfit', color: '#8a7aff', accent: '#ffd8f8', nova: 0, rarity: 'mythic', icon: '🌌', chest: true, description: 'Woven from a pastel nebula. It shimmers.' },
  // ---- hats
  { id: 'hat_straw', name: 'Straw Sun Hat', kind: 'hat', color: '#e8c87a', accent: '#e05a5a', nova: 150, rarity: 'common', icon: '👒', chest: true, description: 'Shady, breezy and very farmy.' },
  { id: 'hat_beanie', name: 'Pom-Pom Beanie', kind: 'hat', color: '#e86f8a', accent: '#fff4f0', nova: 150, rarity: 'common', icon: '🧶', chest: true, description: 'Warm ears, bouncy pom-pom.' },
  { id: 'hat_flower_crown', name: 'Flower Crown', kind: 'hat', color: '#7cc36b', accent: '#ffb7c5', nova: 300, rarity: 'rare', icon: '🌸', chest: true, description: 'Picked fresh from the meadow this morning.' },
  { id: 'hat_cat_ears', name: 'Kitty Ears', kind: 'hat', color: '#f4a46a', accent: '#ffd8e0', nova: 300, rarity: 'rare', icon: '🐱', chest: true, description: 'Mrow. They even twitch a little.' },
  { id: 'hat_mushroom', name: 'Mushroom Cap', kind: 'hat', color: '#e0503a', accent: '#fff4e8', nova: 550, rarity: 'epic', icon: '🍄', chest: true, description: 'A spotty toadstool, just your size.' },
  { id: 'hat_frog', name: 'Froggy Hat', kind: 'hat', color: '#7cc36b', accent: '#ffffff', nova: 0, rarity: 'epic', icon: '🐸', chest: true, description: 'Big googly eyes on top. Ribbit!' },
  { id: 'hat_space_bubble', name: 'Bubble Helmet', kind: 'hat', color: '#cfeeff', accent: '#ff7a3a', nova: 0, rarity: 'epic', icon: '🫧', description: 'A retro glass dome. Season reward.' },
  { id: 'hat_star_crown', name: 'Little Star Crown', kind: 'hat', color: '#ffd84a', accent: '#ff9ad8', nova: 0, rarity: 'legendary', icon: '👑', chest: true, description: 'For the true ruler of the colony.' },
  { id: 'hat_antennae', name: 'Alien Antennae', kind: 'hat', color: '#9ae66b', accent: '#ff9ad8', nova: 0, rarity: 'legendary', icon: '👽', chest: true, description: 'Boop boop. Picks up cosmic radio.' },
  { id: 'hat_comet_halo', name: 'Comet Halo', kind: 'hat', color: '#fff2a8', accent: '#9ae6ff', nova: 0, rarity: 'mythic', icon: '💫', chest: true, description: 'A tiny comet circles your head forever.' },
  // ---- pets (follow the player around)
  { id: 'pet_robo_pup', name: 'Robo Pup', kind: 'pet', color: '#cfd8e8', accent: '#45c8ff', nova: 600, rarity: 'rare', icon: '🐶', chest: true, description: 'Wags its little antenna when you come home.' },
  { id: 'pet_buddy_drone', name: 'Buddy Drone', kind: 'pet', color: '#ffb347', accent: '#5ef2ff', nova: 600, rarity: 'rare', icon: '🛸', chest: true, description: 'Hovers at your shoulder and beeps happily.' },
  { id: 'pet_space_kitty', name: 'Space Kitty', kind: 'pet', color: '#9a8aff', accent: '#ffd8f8', nova: 900, rarity: 'epic', icon: '🐱', chest: true, description: 'Naps in sunbeams. Purrs in zero-g.' },
  { id: 'pet_moon_bunny', name: 'Moon Bunny', kind: 'pet', color: '#f4f0ff', accent: '#ffb7c5', nova: 0, rarity: 'epic', icon: '🐰', description: 'Hops in slow motion. Season reward.' },
  { id: 'pet_ember_fox', name: 'Ember Fox', kind: 'pet', color: '#ff8a3a', accent: '#fff2a8', nova: 0, rarity: 'legendary', icon: '🦊', chest: true, description: 'Its tail glows like a cozy campfire.' },
  { id: 'pet_baby_blob', name: 'Baby Blob', kind: 'pet', color: '#9ae66b', accent: '#ff9ad8', nova: 0, rarity: 'legendary', icon: '🫧', chest: true, description: 'A friendly little alien who decided you are family.' },
  { id: 'pet_star_whale', name: 'Star Whale', kind: 'pet', color: '#7ab8ff', accent: '#fff2a8', nova: 0, rarity: 'mythic', icon: '🐋', chest: true, description: 'A pocket-sized whale that swims through the air.' },
  // ---- colonist outfits
  { id: 'colonist_overalls', name: 'Colonist Overalls', kind: 'colonist_outfit', color: '#5a8ac4', accent: '#ffe08a', nova: 250, rarity: 'common', icon: '👖', chest: true, description: 'Matching denim for the whole crew.' },
  { id: 'colonist_farmhand', name: 'Farmhand Straw Hats', kind: 'colonist_outfit', color: '#d8b46a', accent: '#7cc36b', nova: 250, rarity: 'common', icon: '🌾', chest: true, description: 'Sunny straw hats for everyone.' },
  { id: 'colonist_labcoat', name: 'Lab Coat Deluxe', kind: 'colonist_outfit', color: '#f4f6fa', accent: '#6ac8ff', nova: 300, rarity: 'rare', icon: '🥼', chest: true, description: 'Crisp white coats with blue piping.' },
  { id: 'colonist_guard_plate', name: 'Guard Plate Armor', kind: 'colonist_outfit', color: '#8a96a8', accent: '#e05a5a', nova: 350, rarity: 'rare', icon: '🛡️', chest: true, description: 'Shiny plates and red plumes.' },
  { id: 'colonist_cozy_scarves', name: 'Cozy Scarves', kind: 'colonist_outfit', color: '#c4503a', accent: '#ffe08a', nova: 400, rarity: 'rare', icon: '🧣', chest: true, description: 'Everyone gets a long knitted scarf.' },
  { id: 'colonist_pastel', name: 'Pastel Uniforms', kind: 'colonist_outfit', color: '#b8e6d8', accent: '#ffc6e8', nova: 0, rarity: 'epic', icon: '🎀', chest: true, description: 'Mint and pink, soft as a marshmallow.' },
  // ---- vehicle skins (the player's ride)
  { id: 'atv_flame', name: 'Flame Paint', kind: 'vehicle_skin', color: '#e8503a', accent: '#ffcf4a', nova: 300, rarity: 'rare', icon: '🔥', chest: true, description: 'Hot-rod flames on any ride.' },
  { id: 'buggy_candy', name: 'Candy Paint', kind: 'vehicle_skin', color: '#ff8ac8', accent: '#ffffff', nova: 300, rarity: 'rare', icon: '🍭', chest: true, description: 'Sticky-sweet pink and white.' },
  { id: 'rover_camo', name: 'Jungle Camo', kind: 'vehicle_skin', color: '#4a6a3a', accent: '#a8c46a', nova: 450, rarity: 'rare', icon: '🌿', chest: true, description: 'Blend right into the bubble trees.' },
  { id: 'hover_aurora', name: 'Aurora Paint', kind: 'vehicle_skin', color: '#7be0c8', accent: '#9a7bff', nova: 500, rarity: 'epic', icon: '🌈', description: 'Shimmering northern-lights colours.' },
  { id: 'hovercraft_chrome', name: 'Chrome Paint', kind: 'vehicle_skin', color: '#e8eef6', accent: '#45f0ff', nova: 700, rarity: 'epic', icon: '✨', chest: true, description: 'So shiny you can see your face.' },
  { id: 'vehicle_ladybug', name: 'Ladybug Paint', kind: 'vehicle_skin', color: '#e8403a', accent: '#2a2a2a', nova: 0, rarity: 'legendary', icon: '🐞', chest: true, description: 'Red with black spots. Lucky!' },
  // ---- turret skins
  { id: 'turret_bronze', name: 'Bronze Turrets', kind: 'turret_skin', color: '#c48a4a', accent: '#ffe08a', nova: 350, rarity: 'rare', icon: '🥉', chest: true, description: 'Polished bronze with brass rivets.' },
  { id: 'turret_sakura', name: 'Sakura Turrets', kind: 'turret_skin', color: '#ffb7c5', accent: '#ff6f91', nova: 400, rarity: 'rare', icon: '🌸', chest: true, description: 'Pretty in pink, still very pointy.' },
  { id: 'turret_ice', name: 'Ice Crystal Turrets', kind: 'turret_skin', color: '#cfe8ff', accent: '#6ac8ff', nova: 400, rarity: 'rare', icon: '🧊', chest: true, description: 'Frosty blue with icicle trims.' },
  { id: 'turret_neon', name: 'Neon Turrets', kind: 'turret_skin', color: '#2a3a6a', accent: '#4fd8ff', nova: 500, rarity: 'epic', icon: '💡', description: 'Every turret glows electric blue.' },
  { id: 'turret_gold', name: 'Golden Turrets', kind: 'turret_skin', color: '#ffd84a', accent: '#fff8d8', nova: 0, rarity: 'legendary', icon: '🏆', chest: true, description: 'Solid gold defenses. Aliens are impressed.' },
  // ---- decorations (unlock exclusive decor in Build › Decor)
  { id: 'deco_gnome_garden', name: 'Gnome Garden', kind: 'decoration', color: '#e05a5a', accent: '#7cc36b', nova: 300, rarity: 'common', icon: '🧙', chest: true, description: 'Unlocks garden gnomes and toadstool rings.' },
  { id: 'deco_pumpkin_patch', name: 'Pumpkin Patch', kind: 'decoration', color: '#f08a3a', accent: '#6a8a3a', nova: 300, rarity: 'common', icon: '🎃', chest: true, description: 'Unlocks plump pumpkins and a cozy hay bale.' },
  { id: 'deco_lantern_festival', name: 'Lantern Festival', kind: 'decoration', color: '#ff9a4a', accent: '#ffe08a', nova: 400, rarity: 'rare', icon: '🏮', description: 'Unlocks a glowing lantern arch and lantern strings.' },
  { id: 'deco_holo_trees', name: 'Holo Trees', kind: 'decoration', color: '#5ef2ff', accent: '#9a7bff', nova: 600, rarity: 'epic', icon: '🌳', chest: true, description: 'Unlocks shimmering hologram trees.' },
  { id: 'deco_teddy_picnic', name: 'Teddy Picnic', kind: 'decoration', color: '#c48a5a', accent: '#ff6b7a', nova: 0, rarity: 'epic', icon: '🧸', chest: true, description: 'Unlocks a picnic blanket with a giant teddy bear.' },
  { id: 'deco_star_fountain', name: 'Wishing Star Fountain', kind: 'decoration', color: '#9ae6ff', accent: '#ffd84a', nova: 0, rarity: 'legendary', icon: '⛲', chest: true, description: 'Unlocks a sparkling fountain topped with a star.' },
  // ---- photo frames (Photo Mode)
  { id: 'frame_cozy_knit', name: 'Cozy Knit Frame', kind: 'photo_frame', color: '#c46a5a', accent: '#f6e2c0', nova: 120, rarity: 'common', icon: '🧶', chest: true, description: 'A woolly frame for snug snapshots.' },
  { id: 'frame_sakura', name: 'Sakura Frame', kind: 'photo_frame', color: '#ffb7c5', accent: '#ff6f91', nova: 200, rarity: 'rare', icon: '🌸', chest: true, description: 'Cherry blossoms in every corner.' },
  { id: 'frame_starry', name: 'Starry Night Frame', kind: 'photo_frame', color: '#3a3f8a', accent: '#ffe08a', nova: 200, rarity: 'rare', icon: '✨', chest: true, description: 'Deep blue with twinkling stars.' },
  { id: 'frame_honey_gold', name: 'Honey Gold Frame', kind: 'photo_frame', color: '#ffcf3a', accent: '#c48a3a', nova: 0, rarity: 'epic', icon: '🍯', description: 'Dripping with golden honey. Season reward.' },
  { id: 'frame_crystal', name: 'Crystal Bloom Frame', kind: 'photo_frame', color: '#c8a8ff', accent: '#9ae6ff', nova: 0, rarity: 'legendary', icon: '💎', chest: true, description: 'Crystal flowers bloom around your photo.' },
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
 * Premium cosmetics, one every 5 levels (10 in all). The season exclusives (space bubble, moon bunny, honey frame…)
 * live here; the bookends (Kitty Ears early, the legendary Ember Fox near the end) are chest drops a pass holder gets
 * for sure.
 */
const SEASON_PREMIUM_COSMETICS: Record<number, string> = {
  5: 'hat_cat_ears', 10: 'outfit_astro', 15: 'hat_space_bubble', 20: 'theme_aurora', 25: 'pet_moon_bunny',
  30: 'hover_aurora', 35: 'frame_honey_gold', 40: 'turret_neon', 45: 'pet_ember_fox', 50: 'outfit_neon_runner',
};
/** Premium Nova chests: Acorn early, Moonlit and Sunflower mid-season, Crystal Bloom near the end, Cosmic Wish at 50. */
const SEASON_PREMIUM_CHESTS: Record<number, string> = {
  3: 'chest_acorn', 8: 'chest_acorn', 13: 'chest_moonlit', 22: 'chest_moonlit', 27: 'chest_sunny', 38: 'chest_sunny',
  47: 'chest_crystal', 50: 'chest_cosmic',
};
/** A few Acorn chests on the free track too. */
const SEASON_FREE_CHESTS: Record<number, string> = { 4: 'chest_acorn', 18: 'chest_acorn', 33: 'chest_acorn' };
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
        nova: 160 + i * 5,
        colonist: i >= 50 ? 'legendary' : i >= 20 ? 'epic' : 'rare',
        items: i >= 40 ? { titan_crate: 1 } : i >= 30 ? { nano_crate: 1 } : { supply_crate: 3 },
      };
    } else if (i % 5 === 0) {
      free = { nova: 10 + i / 5 * 2 };
      premium = { nova: 60 + i * 2, items: { mystery_crate: 1 } };
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
    // a handful of Nova on the even premium levels in between (level 1 stays a pure welcome gift of supplies)
    if (i % 5 !== 0 && i % 2 === 0) premium = { ...premium, nova: 20 + i };
    if (SEASON_PREMIUM_COSMETICS[i]) premium = { ...premium, cosmetic: SEASON_PREMIUM_COSMETICS[i] };
    premium = withItem(premium, SEASON_PREMIUM_CHESTS[i]);
    free = withItem(free, SEASON_FREE_CHESTS[i]);
    levels.push({ free, premium });
  }
  return levels;
}

export const SEASON: SeasonDef = {
  id: 'season_1',
  name: 'Season 1: First Light',
  xpPerLevel: 400,
  levels: seasonLevels(),
  // after level 50 the premium track keeps paying: a Moonlit chest for every further 400 XP (repeatable)
  bonus: { xp: 400, reward: { items: { chest_moonlit: 1 } } },
  // Note: 'gather' is XP per gather hit (fractions accumulate); tuned so an engaged player finishes ~20 days.
  xp: { gather: 0.25, build: 6, craft: 5, kill: 1, defend: 50, mission: 30, discover: 60, research: 20 },
};

// ---------------------------------------------------------------------------------------------
// Daily login (7 days, matches the brief: resources → crafting mats → Nova → colonist → defense crate → Nova → legendary)
// ---------------------------------------------------------------------------------------------

export const DAILY_REWARDS: Reward[] = [
  { resources: { wood: 200, stone: 150, food: 100, water: 100 } },
  { resources: { iron: 100, copper: 80, coal: 60, fiber: 150 }, items: { bandage: 3 } },
  { nova: 20 },
  { colonist: 'rare', resources: { food: 100 } },
  { items: { defense_crate: 2 }, resources: { stone: 200 } },
  { nova: 40 },
  { nova: 60, colonist: 'legendary', boost: { kind: 'production', mult: 2, minutes: 30 }, items: { mystery_crate: 2 } },
];

export const SPIN_SEGMENTS: SpinSegment[] = [
  { label: 'Wood', color: '#b5793f', weight: 18, reward: { resources: { wood: 150 } } },
  { label: 'Stone', color: '#9aa3ad', weight: 18, reward: { resources: { stone: 120 } } },
  { label: 'Food & Water', color: '#4fb3f6', weight: 16, reward: { resources: { food: 100, water: 100 } } },
  { label: 'Iron Haul', color: '#c9a48b', weight: 10, reward: { resources: { iron: 60, copper: 40, coal: 40 } } },
  { label: '10 Nova', color: '#b48cff', weight: 8, reward: { nova: 10 } },
  { label: '2× Boost', color: '#ffd84a', weight: 8, reward: { boost: { kind: 'production', mult: 2, minutes: 15 } } },
  { label: 'Research', color: '#8fa8ff', weight: 12, reward: { rp: 30 } },
  { label: 'Mystery Crate', color: '#ff9e5e', weight: 6, reward: { items: { mystery_crate: 1 } } },
  { label: 'Rare Colonist', color: '#5ef2ff', weight: 3, reward: { colonist: 'rare' } },
  { label: '50 Nova', color: '#ff6f91', weight: 2, reward: { nova: 50 } },
];

export const STARTER_KIT = {
  resources: { wood: 10, food: 20, water: 20 } as Record<string, number>,
  items: { survival_tool: 1, flare_pistol: 1, small_backpack: 1, bandage: 2 } as Record<string, number>,
  equip: { tool: 'survival_tool', weapon: 'flare_pistol', backpack: 'small_backpack' } as Record<string, string>,
};
