// Run intro card: for about 2.4 s at the start of a run, the chapter's painting as a wide strip in the top third (clear of
// the Shepherd at screen centre) with its name, its twist and the difficulty / Blood Moon / Daily Trial tags. It takes the
// place of the old chapter banner (run.modBannerAt). Non-interactive; Reduce flashes drops the light flare and the glint.
import './runintro.css';
import { h } from './dom.js';
import { CHAPTERS, BOSSES, bossFor } from '../game/data.js';
import { CHAPTER_ART } from './art.js';

const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
export const INTRO_MS = 6000; // fallback removal; the CSS animation itself is 0.15 s delay + 2.5 s

/** Shows the card over the HUD and returns its element (removed after INTRO_MS). */
export function showRunIntro(hud, run, reduceFlash) {
  const ch = run.chapter, D = run.diff;
  const src = ch.endless ? CHAPTERS[ch.mods.rotate[0] - 1] : null; // Endless opens on the first rotation's twist
  const tag = run.guide ? 'Raise the dead. Lead the legion.' // the beginner tutorial (game/tutorial.js)
    : run.mods.tag ? (src ? `${src.name}: ${run.mods.tag}` : run.mods.tag) : `Survive 6:00, then slay ${BOSSES[bossFor(ch)].title}`;
  const kick = run.guide ? 'Tutorial' : ch.endless ? 'Endless' : `${run.trial ? 'Daily Trial · ' : ''}Chapter ${ROMAN[ch.id] || ch.id}`;
  const pills = (D.id !== 'normal' ? `<em class="ri-pill" style="--dc:${D.css}">${D.name}</em>` : '') + (run.bloodMoon ? '<em class="ri-pill ri-bm">Blood Moon</em>' : '');
  const el = h(`<div class="run-intro${reduceFlash ? ' rf' : ''}" aria-hidden="true" data-ch="${ch.id}" style="--rc:${hex(ch.rune)}">
    <i class="ri-art" style="background-image:url(${CHAPTER_ART[ch.id]})"></i>
    <div class="ri-text"><span class="ri-kick">${kick}${pills}</span><b class="ri-name">${run.guide ? 'The Waking' : ch.name}</b><i class="ri-line"></i><span class="ri-tag">${tag}</span></div>
  </div>`);
  hud.appendChild(el);
  hud.classList.add('intro-on'); // the legion counter (still 0) steps aside under the card
  // gone when its own fade ends (the first frames of a run can hitch while shaders compile, delaying the start);
  // the timer covers a hidden page, where animations do not run, and reduced motion, where the card simply shows and goes
  const done = () => { el.remove(); hud.classList.remove('intro-on'); };
  el.addEventListener('animationend', (e) => { if (e.target === el) done(); });
  requestAnimationFrame(() => setTimeout(done, matchMedia('(prefers-reduced-motion: reduce)').matches ? 2650 : INTRO_MS)); // from the first frame
  return el;
}
