/**
 * Illustrated art generated with Higgsfield (see docs/ART.md). Files live in `public/art/` and are served
 * relative to the app root (vite `base: './'`), so they work on the web build and inside Capacitor.
 * Every helper returns null when no illustration exists, so callers fall back to the emoji in the data.
 */
const ROOT = 'art/';

const RESOURCES = new Set([
  'wood', 'stone', 'fiber', 'food', 'water', 'iron', 'copper', 'coal', 'steel', 'electronics',
  'biomass', 'crystal', 'alloy', 'energy_cell', 'nano', 'titanium', 'nova',
]);
const PROFESSIONS = new Set([
  'gatherer', 'farmer', 'engineer', 'electrician', 'scientist', 'doctor', 'cook', 'miner', 'guard',
  'mechanic', 'water_tech', 'drone_tech', 'logistics',
]);
/** Keyed by AlienDef.model (variants such as "Razor Crawler" share their base model's portrait). */
const ALIENS = new Set(['crawler', 'spitter', 'brute', 'burrower', 'flyer', 'queen', 'titan']);
const BIOMES = new Set([
  'crash_valley', 'pinewood_forest', 'crystal_canyon', 'red_desert', 'toxic_marsh', 'frozen_ridge',
  'alien_ruins', 'titanium_highlands',
]);
const TIERS = ['tier-0-wood', 'tier-1-reinforced', 'tier-2-stone', 'tier-3-steel', 'tier-4-alloy', 'tier-5-nano', 'tier-6-titanium'];

/** Resource (or 'nova') icon, 128 px with transparency. */
export function resourceArt(id: string): string | null {
  return RESOURCES.has(id) ? `${ROOT}resources/${id}.webp` : null;
}
/** Colonist profession portrait (bust), 256 px with transparency. */
export function professionArt(id: string): string | null {
  return PROFESSIONS.has(id) ? `${ROOT}professions/${id}.webp` : null;
}
/** Alien portrait by AlienDef.model, 384 px with transparency. */
export function alienArt(model: string): string | null {
  return ALIENS.has(model) ? `${ROOT}aliens/${model}.webp` : null;
}
/** Biome postcard, 960×540. */
export function biomeArt(id: string): string | null {
  return BIOMES.has(id) ? `${ROOT}biomes/${id}.webp` : null;
}
/** Colony tier illustration (0 = Wood … 6 = Titanium), 800×600. */
export function tierArt(index: number): string | null {
  return TIERS[index] ? `${ROOT}tiers/${TIERS[index]}.webp` : null;
}
/** Loading / key art (landscape or portrait). */
export function keyArt(portrait: boolean): string {
  return `${ROOT}key/${portrait ? 'loading-portrait' : 'loading'}.webp`;
}

/** An <img> for an art URL, or a span with the emoji fallback when there is no illustration. */
export function artOrEmoji(src: string | null, emoji: string, cls = 'art', alt = ''): HTMLElement {
  if (!src) {
    const s = document.createElement('span');
    s.className = cls + ' emoji';
    s.textContent = emoji;
    return s;
  }
  const img = document.createElement('img');
  img.className = cls;
  img.src = src;
  img.alt = alt;
  img.decoding = 'async';
  img.draggable = false;
  return img;
}
