// The Grimoire picker (GRIMOIRE in data.js, meta/grimoire.js; GDD §4.9): eight painted pages, one inscribed before a
// run. Locked pages show their goal and progress; a page unlocked since the last visit wears a "New" tag once.
import './grimoire.css';
import { toast, fmt } from '../dom.js';
import { icon } from '../icons.js';
import { GRIMOIRE } from '../../game/data.js';
import { commit } from '../../meta/economy.js';
import { pageProgress, pageUnlocked, unlockedPages, activePage, inscribe, newPages, markPagesSeen } from '../../meta/grimoire.js';
import { pageArt } from '../art.js';
import { liveModal } from './panels.js';
import { tap } from './util.js';

/** The chip above the Battle button: the inscribed page, or what to do next. '' in the tutorial. */
export function grimoireChip(p, dot) {
  const id = activePage(p), G = GRIMOIRE.pages, open = unlockedPages(p).length;
  const first = GRIMOIRE.order.find((k) => !pageUnlocked(p, k));
  const line = id ? G[id].name : open ? 'No page inscribed' : `${icon('lock')} ${G[first].unlock.text}`;
  return `<button class="grim-chip ${id ? 'on' : ''} ${open ? '' : 'lk'}" data-act="grimoire" ${id ? `style="--pc:${G[id].color}"` : ''}>
    <span class="grim-ic">${id ? pageArt(id) : icon('book')}</span><span class="grim-t"><small>Grimoire</small><b>${line}</b></span>${dot ? '<i class="badge-dot"></i>' : ''}</button>`;
}

export function openGrimoire(ctx) {
  const { app } = ctx; const p = app.profile;
  const fresh = newPages(p); // tagged "New" for this visit
  if (markPagesSeen(p)) commit(p);
  const lm = liveModal({ title: 'The Grimoire', cls: 'mm-grim' }, (body) => {
    const sel = activePage(p), G = GRIMOIRE.pages;
    const page = (id) => {
      const d = G[id], open = pageUnlocked(p, id), on = sel === id, pr = pageProgress(p, id);
      const tag = on ? '<span class="gr-tag">Inscribed</span>' : fresh.includes(id) ? '<span class="gr-tag new">New</span>' : '';
      const info = open ? `<small class="gr-boon">${d.boon}</small><small class="gr-cost">${d.cost}</small>`
        : `<small class="gr-goal">${icon('lock')} ${d.unlock.text}</small>${pr.need > 1 ? `<span class="gr-bar"><i style="width:${(100 * pr.have / pr.need).toFixed(1)}%"></i></span><small class="gr-n t-dim tnum">${fmt(pr.have)} / ${fmt(pr.need)}</small>` : ''}`;
      return `<button class="gr-page ${on ? 'on' : ''} ${open ? '' : 'is-locked'}" data-id="${id}" style="--pc:${d.color}" aria-pressed="${on}">
        <span class="gr-ic">${pageArt(id)}</span><b>${d.name}</b>${info}${tag}</button>`;
    };
    body.innerHTML = `<div class="gr">
      <p class="gr-intro">Inscribe one page before you march. Each bends the run in your favour, for a price. <span class="t-dim">Campaign and Endless runs only.</span></p>
      <div class="gr-grid">${GRIMOIRE.order.map(page).join('')}</div>
      <button class="btn btn-ghost btn-block gr-blank ${sel ? '' : 'on'}" data-id="">${icon('book')} ${sel ? 'Leave the page blank' : 'No page inscribed'}</button>
    </div>`;
    body.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.id;
      if (id && !pageUnlocked(p, id)) { tap(app, 'warning', null); toast(`${G[id].name}: ${G[id].unlock.text} to unlock`); return; }
      if ((p.grimoire.selected || '') === id) return;
      tap(app, 'medium', 'select');
      inscribe(p, id); commit(p); // the live modal re-renders
      if (id) toast(`Inscribed: ${G[id].name}`);
    }));
  });
  return lm;
}
