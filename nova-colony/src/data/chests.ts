import type { ChestDef } from './schema';

/**
 * Nova chests: five tiers of frontier caches, each with its own painted cache (art/chests/<id>-closed.webp / -open.webp), its own
 * opening-screen background (art/chests/bg/<id>.webp) and its own opening animation. Loot is purely acceleration
 * (resources, boosts, crates, colonists) plus cosmetics up to the chest's rarity; odds are always shown in-game.
 * Also earned from the season pass, daily login and events. Each chest is an inventory item with `use.chest`.
 */
export const CHESTS: ChestDef[] = [
  { id: 'chest_supply', name: 'Supply Cache', rarity: 'common', nova: 60, cards: 3, icon: '📦', color: '#b8894f', accent: '#e8c47a', description: 'A sturdy field crate from the drop ship. Useful odds and ends.' },
  { id: 'chest_explorer', name: "Explorer's Case", rarity: 'rare', nova: 180, cards: 4, icon: '🧳', color: '#5a8ab8', accent: '#c8dcec', description: 'A weathered expedition case. At least one rare find inside.' },
  { id: 'chest_prospector', name: "Prospector's Vault", rarity: 'epic', nova: 450, cards: 5, icon: '🔒', color: '#d8a83a', accent: '#e8843a', description: 'A brass strongbox from a lucky claim. At least one epic find.' },
  { id: 'chest_relic', name: 'Ancient Relic', rarity: 'legendary', nova: 1000, cards: 6, icon: '🗿', color: '#8a62c8', accent: '#7ad8d8', description: 'A carved reliquary from the alien ruins. At least one legendary find.' },
  { id: 'chest_nova', name: 'Nova Core', rarity: 'mythic', nova: 2200, cards: 7, icon: '🌟', color: '#6a5ad8', accent: '#f0d8a8', description: 'A titanium capsule around a captured star. Holds a mythic treasure.' },
];
