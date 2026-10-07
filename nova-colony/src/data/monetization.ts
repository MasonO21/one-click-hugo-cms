import type { AdPlacementDef, CosmeticDef, ProductDef, Reward, SeasonDef, SpinSegment, VipDef } from './schema';

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
  { id: 'nova_starter_pack', section: 'packs', type: 'non_consumable', name: 'Starter Pack', description: 'Resources, 300 Nova Crystals and the exclusive Pioneer outfit.', fallbackPrice: '$0.99', limit: 1, tag: 'best_value', grants: { nova: 300, resources: { wood: 500, stone: 400, fiber: 200, food: 200 }, cosmetic: 'outfit_pioneer' } },
  { id: 'nova_crystals_small', section: 'crystals', type: 'consumable', name: 'Crystal Pouch', description: '500 Nova Crystals.', fallbackPrice: '$4.99', limit: 0, grants: { nova: 500 } },
  { id: 'nova_builder_pack', section: 'packs', type: 'consumable', name: 'Builder Pack', description: '1,100 Nova + a 2-hour build & production boost.', fallbackPrice: '$9.99', limit: 0, tag: 'popular', grants: { nova: 1100, boost: { kind: 'production', mult: 2, minutes: 120 } } },
  { id: 'nova_colony_pack', section: 'crystals', type: 'consumable', name: 'Colony Pack', description: '2,400 Nova Crystals.', fallbackPrice: '$19.99', limit: 0, grants: { nova: 2400 } },
  { id: 'nova_commander_pack', section: 'crystals', type: 'consumable', name: 'Commander Pack', description: '6,500 Nova Crystals.', fallbackPrice: '$49.99', limit: 0, grants: { nova: 6500 } },
  { id: 'nova_ultimate_pack', section: 'crystals', type: 'consumable', name: 'Ultimate Colony Pack', description: '14,000 Nova Crystals.', fallbackPrice: '$99.99', limit: 0, tag: 'best_value', grants: { nova: 14000 } },
  { id: 'colony_pass_monthly', section: 'vip', type: 'subscription', name: 'Colony Pass', description: 'Daily Nova, +10% production, longer offline storage and monthly cosmetics.', fallbackPrice: '$7.99/mo', limit: 0, grants: { vipDays: 30 } },
  { id: 'season_pass_premium', section: 'season', type: 'non_consumable', name: 'Premium Season Track', description: 'Unlock premium rewards on the current season pass.', fallbackPrice: '$9.99', limit: 1, grants: { seasonPremium: true } },
];

export const COSMETICS: CosmeticDef[] = [
  { id: 'outfit_pioneer', name: 'Pioneer Outfit', kind: 'outfit', color: '#d98c3f', accent: '#ffe08a', nova: 0 },
  { id: 'theme_sakura', name: 'Sakura Colony Theme', kind: 'base_theme', color: '#ffb7c5', accent: '#ff6f91', nova: 600 },
];

export const VIP: VipDef = {
  productId: 'colony_pass_monthly',
  dailyNova: 30,
  productionBonus: 0.1,
  offlineHoursBonus: 4,
  dailyRewardMult: 2,
  description: ['30 Nova Crystals every day', '+10% resource production', '+4h offline production storage', 'Double daily login rewards', 'Exclusive decorations & a monthly outfit'],
};

function seasonLevels(): SeasonDef['levels'] {
  const levels: SeasonDef['levels'] = [];
  for (let i = 1; i <= 30; i++) {
    const free: Reward = i % 5 === 0 ? { nova: 10 } : { resources: { wood: 50 * i, stone: 40 * i } };
    const premium: Reward = i % 10 === 0 ? { nova: 100, colonist: 'epic' } : i % 5 === 0 ? { nova: 40 } : { resources: { food: 60 * i, water: 60 * i }, rp: 5 * i };
    levels.push({ free, premium });
  }
  return levels;
}

export const SEASON: SeasonDef = {
  id: 'season_1',
  name: 'Season 1: First Light',
  xpPerLevel: 250,
  levels: seasonLevels(),
  xp: { gather: 1, build: 5, craft: 4, kill: 2, defend: 40, mission: 25, discover: 50, research: 15 },
};

export const DAILY_REWARDS: Reward[] = [
  { resources: { wood: 100, stone: 80, food: 50 } },
  { resources: { fiber: 80, iron: 30 }, items: { bandage: 3 } },
  { nova: 15 },
  { colonist: 'rare' },
  { items: { supply_crate: 2 }, resources: { stone: 200 } },
  { nova: 30 },
  { nova: 60, colonist: 'epic', boost: { kind: 'production', mult: 2, minutes: 30 } },
];

export const SPIN_SEGMENTS: SpinSegment[] = [
  { label: 'Wood', color: '#b5793f', weight: 20, reward: { resources: { wood: 150 } } },
  { label: 'Stone', color: '#9aa3ad', weight: 20, reward: { resources: { stone: 120 } } },
  { label: '10 Nova', color: '#b48cff', weight: 8, reward: { nova: 10 } },
  { label: 'Food & Water', color: '#4fb3f6', weight: 18, reward: { resources: { food: 100, water: 100 } } },
  { label: '2× Boost', color: '#ffd84a', weight: 10, reward: { boost: { kind: 'production', mult: 2, minutes: 15 } } },
  { label: 'Rare Colonist', color: '#5ef2ff', weight: 4, reward: { colonist: 'rare' } },
  { label: 'Research', color: '#8fa8ff', weight: 14, reward: { rp: 30 } },
  { label: '50 Nova', color: '#ff6f91', weight: 2, reward: { nova: 50 } },
];

export const STARTER_KIT = {
  resources: { wood: 10, food: 20, water: 20 } as Record<string, number>,
  items: { survival_tool: 1, flare_pistol: 1, small_backpack: 1, bandage: 2 } as Record<string, number>,
  equip: { tool: 'survival_tool', weapon: 'flare_pistol', backpack: 'small_backpack' } as Record<string, string>,
};
