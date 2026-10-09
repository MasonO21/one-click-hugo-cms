/**
 * "What's new": a one-time card for players who update (fresh colonies skip it). Bump `id` with each update worth
 * telling players about; `liveops.newsSeen` remembers the last one shown.
 */
export const NEWS = {
  id: '2026-10-frontier-outfitters',
  title: 'New on the frontier',
  text: 'A few things arrived with the last supply drop:',
  items: [
    { icon: '🧥', text: 'Wardrobe: outfits, headwear, companions, colony themes, decor and more (Menu › Wardrobe)' },
    { icon: '📦', text: 'Loot caches in five tiers, from the Supply Cache to the Nova Core (Shop › Chests)' },
    { icon: '📸', text: 'Photo Mode: frame your colony and share it (Menu › Photo)' },
    { icon: '🌳', text: 'A cozier frontier: new trees, rocks, warmer light and rounder settlers' },
    { icon: '🔎', text: 'Accessibility: larger text and reduce motion (Settings)' },
  ],
} as const;
