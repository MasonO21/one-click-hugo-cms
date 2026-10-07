// Painted key art (generated with Higgsfield; full-resolution masters live in store/art).
// Imported through Vite so native builds ship hashed files and the single-file preview inlines them.
import vael from '../assets/art/hero-vael.webp';
import nyx from '../assets/art/hero-nyx.webp';
import seraphine from '../assets/art/hero-seraphine.webp';
import mordrake from '../assets/art/hero-mordrake.webp';
import liora from '../assets/art/hero-liora.webp';
import ch1 from '../assets/art/chapter-1.webp';
import ch2 from '../assets/art/chapter-2.webp';
import ch3 from '../assets/art/chapter-3.webp';
import ch4 from '../assets/art/chapter-4.webp';
import ch5 from '../assets/art/chapter-5.webp';
import ch6 from '../assets/art/chapter-6.webp';
import husk from '../assets/art/foe-husk.webp';
import ghoul from '../assets/art/foe-ghoul.webp';
import brute from '../assets/art/foe-brute.webp';
import witch from '../assets/art/foe-witch.webp';
import bloater from '../assets/art/foe-bloater.webp';
import thief from '../assets/art/foe-thief.webp';
import gravemaw from '../assets/art/foe-gravemaw.webp';

export { default as LOGO_ART } from '../assets/art/logo.webp';
export { default as BOSS_ART } from '../assets/art/boss-band.webp';

/** Painted hero splashes by hero id. */
export const HERO_ART = { vael, nyx, seraphine, mordrake, liora };

/** Painted chapter key art (16:9) by chapter id; Endless Abyss is chapter 6. */
export const CHAPTER_ART = { 1: ch1, 2: ch2, 3: ch3, 4: ch4, 5: ch5, 6: ch6 };

/** Painted Bestiary portraits (3:4) by entry id (BESTIARY.order). */
export const FOE_ART = { husk, ghoul, brute, witch, bloater, thief, gravemaw };
