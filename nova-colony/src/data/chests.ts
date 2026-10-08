import type { ChestDef } from './schema';

/**
 * Nova chests: five tiers, each with its own painted chest (art/chests/<id>-closed.webp / -open.webp), its own
 * opening-screen background (art/chests/bg/<id>.webp) and its own opening animation. Loot is purely acceleration
 * (resources, boosts, crates, colonists) plus cosmetics up to the chest's rarity; odds are always shown in-game.
 * Also earned from the season pass, daily login and events. Each chest is an inventory item with `use.chest`.
 */
export const CHESTS: ChestDef[] = [
  { id: 'chest_acorn', name: 'Acorn Chest', rarity: 'common', nova: 60, cards: 3, icon: '🌰', color: '#c48a4a', accent: '#9ad86b', description: 'A little wooden chest carved with acorns and leaves.' },
  { id: 'chest_moonlit', name: 'Moonlit Chest', rarity: 'rare', nova: 180, cards: 4, icon: '🌙', color: '#7a9cff', accent: '#e8f0ff', description: 'Silver and midnight blue, it hums a lullaby.' },
  { id: 'chest_sunny', name: 'Sunflower Chest', rarity: 'epic', nova: 450, cards: 5, icon: '🌻', color: '#ffc83a', accent: '#ff8a3a', description: 'Warm gold with a sunflower lock. Smells like summer.' },
  { id: 'chest_crystal', name: 'Crystal Bloom Chest', rarity: 'legendary', nova: 1000, cards: 6, icon: '💎', color: '#c88aff', accent: '#9ae6ff', description: 'Pastel crystals bloom across its lid.' },
  { id: 'chest_cosmic', name: 'Cosmic Wish Chest', rarity: 'mythic', nova: 2200, cards: 7, icon: '🌠', color: '#8a7aff', accent: '#ffd8f8', description: 'A tiny galaxy swirls inside. Make a wish!' },
];
