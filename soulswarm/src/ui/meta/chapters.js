// The chapter map (Update 13): the campaign's six acts of five chapters as a scrolling sheet, each chapter a painted tile
// with its boss and the difficulties it has been cleared on; the Endless Abyss below them. Tapping an open chapter selects
// it on the home card. Opened from the map button on the chapter card (home.js).
import { h, $, modal } from '../dom.js';
import { icon } from '../icons.js';
import { ACTS, CHAPTERS, BOSSES, BESTIARY, DIFFICULTY, DIFFICULTY_ORDER, ENDLESS, ENDLESS_ID, ENDLESS_UNLOCK } from '../../game/data.js';
import { clearedOn } from '../../meta/difficulty.js';
import { commit } from '../../meta/economy.js';
import { tap } from './util.js';
import { chapterArt } from '../art.js';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];
export const actRoman = (n) => ROMAN[n] || String(n);

/** The chapters the home card's arrows step through: every open chapter, the next locked one as a preview, then the
 *  Endless Abyss once it is open. */
export function chapterStops(p) {
  const top = Math.min(CHAPTERS.length, p.chapter.unlocked + 1), out = [];
  for (let c = 1; c <= top; c++) out.push(c);
  if (p.chapter.unlocked >= ENDLESS_UNLOCK) out.push(ENDLESS_ID);
  return out;
}

/** The chapter the home card shows and BATTLE starts: the saved selection when it is a stop, else the nearest open one. */
export function selectedStop(p) {
  const stops = chapterStops(p), sel = +p.chapter.selected || 1;
  if (stops.includes(sel)) return sel;
  return sel === ENDLESS_ID ? stops[stops.length - 1] : stops[Math.min(stops.length - 1, Math.max(0, sel - 1))];
}

/** The difficulty pips of a chapter: Normal, Nightmare and Torment, lit where it has been cleared. */
const pips = (p, id) => `<span class="cm-pips">${DIFFICULTY_ORDER.map((d) => `<i class="${clearedOn(p, id, d) ? 'on' : ''}" style="--dc:${DIFFICULTY[d].css}" title="${DIFFICULTY[d].name}"></i>`).join('')}</span>`;

export function openChapterMap(ctx) {
  const { app } = ctx, p = app.profile;
  const sel = p.chapter.selected || 1, open = (id) => (id === ENDLESS_ID ? p.chapter.unlocked >= ENDLESS_UNLOCK : id <= p.chapter.unlocked);
  const tile = (c) => {
    const ok = open(c.id), boss = BOSSES[c.bossId];
    return `<button class="cm-ch${ok ? '' : ' lk'}${c.id === sel ? ' on' : ''}" data-id="${c.id}" style="--cc:#${c.rune.toString(16).padStart(6, '0')}">
      <i class="cm-art" style="background-image:url(${chapterArt(c)})"></i>
      <span class="cm-no tnum">${c.id}</span>
      <span class="cm-txt"><b>${c.name}</b><small>${ok ? `${boss.name}${c.tier > 1 ? ' returns' : ''}` : `${icon('lock')} Clear Chapter ${c.id - 1}`}</small></span>
      ${ok ? pips(p, c.id) : ''}
    </button>`;
  };
  const acts = ACTS.map((A) => {
    const chs = CHAPTERS.slice(A.from - 1, A.to), cleared = chs.filter((c) => clearedOn(p, c.id, 'normal')).length;
    const reached = A.from <= p.chapter.unlocked;
    return `<section class="cm-act${reached ? '' : ' lk'}" style="--ac:${A.css}">
      <header><span class="t-label">Act ${actRoman(A.n)}</span><b class="t-display">${A.name}</b><small class="tnum">${cleared}/5</small></header>
      <p class="cm-realm">${reached || A.n === 1 ? `${A.hazard}${A.foe ? ` · ${BESTIARY.foes[A.foe].name}` : ''}` : `${icon('lock')} Reach Chapter ${A.from}`}</p>
      <div class="cm-grid">${chs.map(tile).join('')}</div>
    </section>`;
  }).join('');
  const eOpen = open(ENDLESS_ID), eBest = p.chapter.best[ENDLESS_ID];
  const endless = `<section class="cm-act cm-endless" style="--ac:#8f9cff">
    <button class="cm-ch cm-wide${eOpen ? '' : ' lk'}${sel === ENDLESS_ID ? ' on' : ''}" data-id="${ENDLESS_ID}" style="--cc:#6b7bff">
      <i class="cm-art" style="background-image:url(${chapterArt(ENDLESS)})"></i>
      <span class="cm-txt"><b>${ENDLESS.name}</b><small>${eOpen ? (eBest ? `Deepest: depth ${eBest.depth || 1}` : 'No time limit. A boss every 5:00.') : `${icon('lock')} Clear Chapter 5`}</small></span>
    </button>
  </section>`;
  const body = h(`<div class="cm">${acts}${endless}</div>`);
  const m = modal({ title: 'The Campaign', body, cls: 'mm-chapters scroll' });
  body.addEventListener('click', (e) => {
    const b = e.target.closest('.cm-ch');
    if (!b) return;
    const id = +b.dataset.id;
    if (!open(id)) { tap(app, 'warning', null); return; }
    tap(app);
    p.chapter.selected = id;
    commit(p); // the home card re-renders on the change
    m.close();
  });
  requestAnimationFrame(() => $(body, '.cm-ch.on')?.scrollIntoView({ block: 'center' }));
  return m;
}
