/**
 * The Nova Shop (Shop › Nova Shop): small conveniences bought with Nova Crystals. Acceleration only — every one of
 * them saves time on something the colony gets for free anyway (boosts and spins from ads and the wheel, recruits
 * from the board, merchants on their own, season levels from play). Logic: sim/novaShop.ts.
 *
 * PRICING. The yardsticks are the Crystal Pouch ($4.99 = 500 Nova, so 1 Nova ≈ 1 cent) and the Supply Cache
 * (60 Nova). A rewarded ad gives 10 minutes of 2× production for free, six times a day, so an hour of a boost is
 * a snack-sized 60–80 Nova and the 4-hour one is cheaper per hour. A single season level costs a little more than
 * a tenth of the Season Boost ($4.99 for ten levels). Supply caches are priced per free crate (about 20 Nova each)
 * and stay under half of the next tier-up bill, like the packs. Daily caps keep any one shortcut from replacing play.
 */

export type NovaShopKind = 'boost' | 'expedition' | 'cache' | 'recruit' | 'recruit_refresh' | 'merchant' | 'spin' | 'season_level';

export interface NovaShopItemDef {
  id: string;
  name: string;
  /** Emoji fallback. */
  icon: string;
  /** Painted icon to borrow: `hud:<id>`, `item:<id>`, `res:<id>`, `poi:<id>` or `chest:<id>` (ui/art.ts). */
  art?: string;
  description: string;
  kind: NovaShopKind;
  /** Price in Nova (the expedition rush scales its own; this is its minimum). */
  nova: number;
  /** Purchases per local day (0 = no cap). */
  dailyCap: number;
  boost?: { kind: 'production' | 'research' | 'gather'; mult: number; minutes: number };
  /** cache: how many free crates' worth of the colony's current tier (`crateReward`). */
  crates?: number;
  /** recruit: the colonist's rarity. */
  rarity?: 'rare' | 'epic' | 'legendary';
}

/** Price of finishing an expedition now: a base plus a little per minute left (8 h ≈ 100 Nova). */
export const EXPEDITION_RUSH = { base: 5, perMinute: 0.2 };

/** Confirm before spending this much Nova in one tap. */
export const NOVA_CONFIRM_AT = 300;

export const NOVA_SHOP: NovaShopItemDef[] = [
  // ---- boosts (same kind and strength extend the running one)
  { id: 'nova_production_1h', name: '2× Production · 1 h', icon: '⚡', art: 'hud:power', kind: 'boost', nova: 80, dailyCap: 3, boost: { kind: 'production', mult: 2, minutes: 60 }, description: 'Every building makes twice as much for an hour.' },
  { id: 'nova_production_4h', name: '2× Production · 4 h', icon: '⚡', art: 'hud:power', kind: 'boost', nova: 250, dailyCap: 2, boost: { kind: 'production', mult: 2, minutes: 240 }, description: 'Twice the production for four hours (and while you are away).' },
  { id: 'nova_research_1h', name: '2× Research · 1 h', icon: '🔬', art: 'hud:tech', kind: 'boost', nova: 80, dailyCap: 3, boost: { kind: 'research', mult: 2, minutes: 60 }, description: 'Research runs at double speed for an hour.' },
  { id: 'nova_gather_1h', name: '2× Gathering · 1 h', icon: '🪓', art: 'res:wood', kind: 'boost', nova: 60, dailyCap: 3, boost: { kind: 'gather', mult: 2, minutes: 60 }, description: 'Hand gathering yields double for an hour.' },
  // ---- time savers
  { id: 'nova_expedition_rush', name: 'Recall an expedition', icon: '🧭', art: 'hud:expeditions', kind: 'expedition', nova: EXPEDITION_RUSH.base, dailyCap: 5, description: 'The squad due home next is back right now with its haul. The price follows the time left.' },
  { id: 'nova_recruit_refresh', name: 'New recruits', icon: '📋', art: 'hud:population', kind: 'recruit_refresh', nova: 20, dailyCap: 10, description: 'A fresh set of survivors at the recruitment board.' },
  { id: 'nova_merchant', name: 'Call a merchant', icon: '🛒', art: 'poi:merchant_caravan', kind: 'merchant', nova: 80, dailyCap: 2, description: 'A wandering merchant parks their cart near your colony for a while.' },
  { id: 'nova_spin', name: 'Extra wheel spin', icon: '🎡', art: 'hud:spin', kind: 'spin', nova: 40, dailyCap: 5, description: 'One more turn of the Lucky Wheel today.' },
  { id: 'nova_season_level', name: 'Skip a season level', icon: '🏅', art: 'hud:season', kind: 'season_level', nova: 60, dailyCap: 5, description: 'Jump straight to the next level of the season pass.' },
  // ---- supplies and crew
  { id: 'nova_cache_small', name: 'Small resource drop', icon: '📦', art: 'item:supply_crate', kind: 'cache', nova: 20, dailyCap: 3, crates: 1, description: 'One free crate’s worth of resources for your colony’s tier, delivered now.' },
  { id: 'nova_cache_large', name: 'Large resource drop', icon: '📦', art: 'item:mystery_crate', kind: 'cache', nova: 55, dailyCap: 2, crates: 3, description: 'Three crates’ worth of resources for your colony’s tier.' },
  { id: 'nova_recruit_epic', name: 'Epic recruit', icon: '🧑‍🚀', art: 'item:colonist_crate', kind: 'recruit', nova: 300, dailyCap: 1, rarity: 'epic', description: 'A skilled epic colonist joins the colony.' },
];
