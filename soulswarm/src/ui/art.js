// Painted key art (generated with Higgsfield; full-resolution masters live in store/art).
// Imported through Vite so native builds ship hashed files and the single-file preview inlines them.
import vael from '../assets/art/hero-vael.webp';
import nyx from '../assets/art/hero-nyx.webp';
import seraphine from '../assets/art/hero-seraphine.webp';
import mordrake from '../assets/art/hero-mordrake.webp';
import liora from '../assets/art/hero-liora.webp';
import grimsby from '../assets/art/hero-grimsby.webp';
import osric from '../assets/art/hero-osric.webp';
import isolde from '../assets/art/hero-isolde.webp';

export { default as LOGO_ART } from '../assets/art/logo.webp';
import eclipseVael from '../assets/art/skin-eclipse-vael.webp';
import rLantern from '../assets/art/relic-lantern.webp';
import rCrown from '../assets/art/relic-crown.webp';
import rIdol from '../assets/art/relic-idol.webp';
import rHeart from '../assets/art/relic-heart.webp';
import rBoots from '../assets/art/relic-boots.webp';
import rCoin from '../assets/art/relic-coin.webp';
import rHourglass from '../assets/art/relic-hourglass.webp';
import rEye from '../assets/art/relic-eye.webp';
import { icon, RELIC_ICON } from './icons.js';

/** Painted skin splashes by skin id (shown instead of the hero's splash while the skin is equipped). */
export const SKIN_ART = { eclipse_vael: eclipseVael };

/** Painted hero splashes by hero id. */
export const HERO_ART = { vael, nyx, seraphine, mordrake, liora, grimsby, osric, isolde };

/** Painted relic icons by relic type. */
export const RELIC_ART = { lantern: rLantern, crown: rCrown, idol: rIdol, heart: rHeart, boots: rBoots, coin: rCoin, hourglass: rHourglass, eye: rEye };
/** A relic's painted icon (its dark backdrop fades into whatever frame holds it), or the line icon for an unknown type. */
export const relicArt = (type) => (RELIC_ART[type] ? `<img class="relic-art" src="${RELIC_ART[type]}" alt="" draggable="false">` : icon(RELIC_ICON[type] || 'chest'));

/** Painted ability icons by skill or evolution id (src/assets/art/skill-<id>.webp). */
export const SKILL_ART = {};
for (const [path, url] of Object.entries(import.meta.glob('../assets/art/skill-*.webp', { eager: true, import: 'default' }))) {
  SKILL_ART[path.slice(path.lastIndexOf('/skill-') + 7, -5)] = url;
}
/** Painted Grimoire pages by page id (src/assets/art/page-<id>.webp; GRIMOIRE in data.js). */
export const PAGE_ART = {};
for (const [path, url] of Object.entries(import.meta.glob('../assets/art/page-*.webp', { eager: true, import: 'default' }))) {
  PAGE_ART[path.slice(path.lastIndexOf('/page-') + 6, -5)] = url;
}
export const pageArt = (id) => (PAGE_ART[id] ? `<img class="page-art" src="${PAGE_ART[id]}" alt="" draggable="false">` : icon('book'));

/** A skill's painted icon, or the line icon `fallback` (heal / gold bonuses, blessings). */
export const skillArt = (id, fallback) => (SKILL_ART[id] ? `<img class="skill-art" src="${SKILL_ART[id]}" alt="" draggable="false">` : icon(fallback));

/** Painted gem packs, smallest to largest (the six GEM_SKUS tiers). */
export const GEM_ART = Object.values(import.meta.glob('../assets/art/gems-*.webp', { eager: true, import: 'default' }));

/** Talents share the painted icon of the passive (or relic) with the same stat. */
const TALENT_ART = { might: 'might', vitality: 'vitality', raise: 'raiseDead', cap: 'legionCap', swift: 'haste' };
export const talentArt = (id, fallback) => (id === 'greed' ? relicArt('coin') : skillArt(TALENT_ART[id], fallback));

/** Painted chapter key art (16:9) by art key (CHAPTERS[].art: the chapter's number, or 'endless' for the Endless Abyss),
 *  from src/assets/art/chapter-<key>.webp. */
export const CHAPTER_ART = {};
for (const [path, url] of Object.entries(import.meta.glob('../assets/art/chapter-*.webp', { eager: true, import: 'default' }))) {
  CHAPTER_ART[path.slice(path.lastIndexOf('/chapter-') + 9, -5)] = url;
}
/** A chapter's painting (a chapter object, or an art key). */
export const chapterArt = (ch) => CHAPTER_ART[ch && typeof ch === 'object' ? ch.art : ch] || CHAPTER_ART[1];

/** Painted Bestiary portraits (3:4) by entry id (BESTIARY.order), from src/assets/art/foe-<id>.webp. */
export const FOE_ART = {};
for (const [path, url] of Object.entries(import.meta.glob('../assets/art/foe-*.webp', { eager: true, import: 'default' }))) {
  FOE_ART[path.slice(path.lastIndexOf('/foe-') + 5, -5)] = url;
}

/** Each chapter boss's painted band (the boss-warning banner) by boss id (BOSSES in data.js). */
export const BOSS_ART = {};
for (const [path, url] of Object.entries(import.meta.glob('../assets/art/boss-band-*.webp', { eager: true, import: 'default' }))) {
  BOSS_ART[path.slice(path.lastIndexOf('/boss-band-') + 11, -5)] = url;
}
