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

/** True for a URL returned by one of the lookups below (toasts accept those as their icon). */
export function isArtSrc(s: string | null | undefined): s is string {
  return !!s && s.startsWith(ROOT);
}

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
const EVENTS = new Set(['meteor', 'wreck', 'rescue', 'nest', 'drop', 'merchant', 'storm', 'ancient']);
const SHOP = new Set([
  'nova_starter_pack', 'nova_crystals_small', 'nova_colony_pack', 'nova_commander_pack', 'nova_ultimate_pack',
  'nova_builder_pack', 'nova_colonist_pack', 'nova_defense_pack', 'nova_automation_pack', 'nova_titanium_founder',
  'colony_pass_monthly', 'season_pass_premium',
]);
const REWARDS = new Set(['victory_chest', 'supply_crate', 'daily_gift']);
/** Every ItemDef.id (tests keep this equal to the data and to the files in public/art/items). */
const ITEMS = new Set([
  // tools
  'survival_tool', 'stone_axe', 'reinforced_axe', 'iron_pickaxe', 'steel_harvester', 'alloy_drillpick', 'nano_cutter', 'titan_beamtool',
  // weapons
  'flare_pistol', 'makeshift_rifle', 'colony_shotgun', 'assault_rifle', 'energy_rifle', 'plasma_rifle', 'titanium_rifle',
  // armor
  'fiber_vest', 'braided_vest', 'plated_vest', 'steel_armor', 'alloy_suit', 'nano_suit', 'titanium_exosuit',
  // backpacks
  'small_backpack', 'canvas_pack', 'hiker_pack', 'frame_pack', 'alloy_pack', 'nano_pack', 'titan_haulpack',
  // utility gear
  'trail_boots', 'work_gloves', 'jet_boots', 'precision_gloves', 'nano_jetpack', 'grav_boots',
  // consumables: medical, drones, chips
  'bandage', 'herbal_salve', 'medkit', 'stim_pack', 'nano_injector', 'regen_gel',
  'helper_drone', 'worker_drone', 'science_drone', 'swarm_drone', 'research_chip', 'data_core', 'quantum_chip',
  // components
  'machine_parts', 'robotic_core', 'nano_core', 'titan_plating',
  // crates
  'supply_crate', 'rations_crate', 'timber_bundle', 'stone_bundle', 'ore_bundle', 'steel_bundle', 'colonist_crate',
  'defense_crate', 'tech_crate', 'alloy_crate', 'nano_crate', 'titan_crate', 'mystery_crate',
]);

/** World event illustration by WorldEventDef.kind, 960×540. */
export function eventArt(kind: string): string | null {
  return EVENTS.has(kind) ? `${ROOT}events/${kind}.webp` : null;
}
/** Products without a card of their own borrow another product's illustration. */
const SHOP_ALIAS: Record<string, string> = { season_xp_boost: 'season_pass_premium' };
/** Shop product card art by ProductDef.id, 512×384 with transparency. */
export function shopArt(productId: string): string | null {
  const id = SHOP_ALIAS[productId] ?? productId;
  return SHOP.has(id) ? `${ROOT}shop/${id}.webp` : null;
}
/** Reward art ('victory_chest' | 'supply_crate' | 'daily_gift'), 256 px with transparency. */
export function rewardArt(id: string): string | null {
  return REWARDS.has(id) ? `${ROOT}rewards/${id}.webp` : null;
}

/** Item icon by ItemDef.id (tools, weapons, armor, gear, consumables, components, crates), 192 px with transparency. */
export function itemArt(id: string): string | null {
  return ITEMS.has(id) ? `${ROOT}items/${id}.webp` : null;
}
/** Every id `itemArt` knows (for tests). */
export function itemArtIds(): string[] {
  return [...ITEMS];
}

/** Loading / key art (landscape or portrait). */
export function keyArt(portrait: boolean): string {
  return `${ROOT}key/${portrait ? 'loading-portrait' : 'loading'}.webp`;
}

/**
 * An <img> for an art URL, or a span with the emoji fallback when there is no illustration (or the file fails
 * to load). `lazy` adds loading="lazy" for big panel art that is not on screen straight away.
 */
export function artOrEmoji(src: string | null, emoji: string, cls = 'art', alt = '', lazy = false): HTMLElement {
  const fallback = (): HTMLElement => {
    const s = document.createElement('span');
    s.className = cls + ' emoji';
    s.textContent = emoji;
    return s;
  };
  if (!src) return fallback();
  const img = document.createElement('img');
  img.className = cls;
  img.alt = alt;
  img.decoding = 'async';
  img.draggable = false;
  if (lazy) img.loading = 'lazy';
  img.onerror = () => img.replaceWith(fallback());
  img.src = src;
  return img;
}

// ---------------------------------------------------------------------------------------------
// DOM helpers shared by the UI (styles live in styles/art.css)
// ---------------------------------------------------------------------------------------------

/** Swap a broken image for its emoji (a missing/blocked file must never leave a hole in the UI). */
function emojiFallback(host: HTMLElement, emoji: string): void {
  host.classList.add('emoji');
  host.textContent = emoji;
}

/**
 * A fixed-box icon: `<i class="aico"><img></i>` for an illustration, `<i class="aico emoji">🪵</i>` when
 * there is none (or it fails to load). The box is always 1.25em square so text never jumps.
 */
export function iconEl(src: string | null, emoji: string, cls = '', tag = 'i'): HTMLElement {
  const host = document.createElement(tag);
  host.className = 'aico' + (cls ? ' ' + cls : '');
  if (!src) {
    emojiFallback(host, emoji);
    return host;
  }
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.decoding = 'async';
  img.draggable = false;
  img.onerror = () => emojiFallback(host, emoji);
  host.appendChild(img);
  return host;
}

/** Icon for a resource id (or 'nova'), with the data's emoji as the fallback. */
export function resIcon(id: string, emoji: string, cls = '', tag = 'i'): HTMLElement {
  return iconEl(resourceArt(id), emoji, cls, tag);
}

/** Icon for an item id, with the data's emoji as the fallback. */
export function itemIcon(id: string, emoji: string, cls = '', tag = 'i'): HTMLElement {
  return iconEl(itemArt(id), emoji, cls, tag);
}

/** Portrait <img> (or an emoji span) for a colonist profession. */
export function professionIcon(id: string, emoji: string, cls = 'prof-art'): HTMLElement {
  return artOrEmoji(professionArt(id), emoji, cls, '');
}

const keep: HTMLImageElement[] = [];
/**
 * Warm the cache (fetch + decode) so these icons are on screen the first time a chip shows them. Safe to call
 * repeatedly and outside a browser (tests): it only creates detached <img> elements.
 */
export function preloadArt(srcs: (string | null)[]): void {
  if (typeof Image === 'undefined') return;
  for (const src of srcs) {
    if (!src || keep.some((i) => i.getAttribute('src') === src)) continue;
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
    keep.push(img);
    void img.decode?.().catch(() => undefined);
  }
}

/** The HUD's icons: every resource + Nova, preloaded at startup (item icons load on demand: they are 65 files). */
export function preloadResourceArt(): void {
  preloadArt([...RESOURCES].map((id) => resourceArt(id)));
}
