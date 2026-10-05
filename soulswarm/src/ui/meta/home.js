// Battle tab (home): hero header, floating side buttons, chapter selector and the big BATTLE button.
// The middle of the screen stays empty so the 3D hero showcase reads through.
import { h, $, fmt, fmtTime, toast, watchAd } from '../dom.js';
import { icon } from '../icons.js';
import { CHAPTERS, ENERGY_COST, SKUS, HEROES } from '../../game/data.js';
import {
  commit, computeLoadout, notifications, starterAvailable, pactActive, pactDailyAvailable,
  freeChestAvailable, claimFreeChest, canPlay,
} from '../../meta/economy.js';
import { hex, cd, nextMidnight, popRewards, tap, delegate } from './util.js';
import { openQuests, openLogin, openSettings, openStarter, openPact, openEnergy, claimPact } from './panels.js';

export function createHome(ctx) {
  const { app } = ctx;
  const el = h('<section class="pane pane-home" data-tab="battle"><div class="hm"></div></section>');
  const root = $(el, '.hm');
  let busy = false; // guards async ad flows against double taps

  const fab = (act, ic, label, extra = '', cls = '') =>
    `<button class="fab ${cls}" data-act="${act}"><span class="fab-ic">${ic}</span><span class="fab-lb">${label}</span>${extra}</button>`;

  function render() {
    const p = app.profile;
    const hero = HEROES[p.selectedHero];
    const L = computeLoadout(p);
    const n = notifications(p);
    const sel = Math.min(Math.max(1, p.chapter.selected || 1), CHAPTERS.length);
    const ch = CHAPTERS[sel - 1];
    const locked = sel > p.chapter.unlocked;
    const best = p.chapter.best[sel];
    const cc = hex(ch.rune);

    // Right column offers
    const right = [];
    if (starterAvailable(p)) {
      right.push(fab('starter', icon('chest'), 'Starter',
        `<span class="fab-rib">${SKUS.starter_pack.value}</span><span class="fab-cd">${cd(p.purchases.starterExpires)}</span>`, 'fab-gold fab-offer'));
    }
    if (pactDailyAvailable(p)) right.push(fab('pactClaim', icon('gems'), 'Claim 100', '<i class="badge-dot"></i>', 'fab-gem fab-offer'));
    else right.push(fab('pact', icon('gems'), pactActive(p) ? 'Pact' : 'Soul Pact', '', 'fab-gem'));
    if (freeChestAvailable(p)) right.push(fab('chest', icon('chest'), 'Free', `<span class="fab-tag">${icon('ad')}</span><i class="badge-dot"></i>`, 'fab-ad fab-offer'));
    else right.push(fab('chestDone', icon('chest'), 'Free', `<span class="fab-cd">${cd(nextMidnight())}</span>`, 'fab-ad fab-spent'));

    // Chapter status line
    let status;
    if (locked) status = `<span class="chap-lock">${icon('lock')} Clear Chapter ${sel - 1}</span>`;
    else if (ch.endless) status = best ? `<span class="chap-best">${icon('trophy')} Deepest run ${fmtTime(best.time)}</span>` : '<span class="chap-best t-dim">No time limit. Gravemaw returns every 5:00.</span>';
    else if (best?.cleared) status = `<span class="pill pill-soul">${icon('check')} Cleared</span><span class="chap-best t-dim">Best ${fmtTime(best.time)}</span>`;
    else if (best) status = `<span class="chap-best">${icon('hourglass')} Best ${fmtTime(best.time)} <span class="t-dim">/ 06:00</span></span>`;
    else status = '<span class="chap-best t-dim">Survive 6:00 and slay Gravemaw</span>';

    const ftue = !p.flags.tutorialDone && !locked;
    const lowEnergy = !canPlay(p);

    root.innerHTML = `
      <div class="hm-head">
        <div class="hm-name t-display" style="--hc:${hero.css}">${hero.name}</div>
        <div class="hm-title">${hero.title}</div>
        <div class="hm-meta">
          <span class="hm-power">${icon('swords')}<b class="tnum">${fmt(L.power)}</b></span>
          <button class="hm-chip" data-act="hero">${icon('helm')} Change hero${n.heroes ? '<i class="badge-dot"></i>' : ''}</button>
        </div>
      </div>
      <div class="hm-side hm-left">
        ${fab('quests', icon('quest'), 'Quests', n.quests ? `<i class="badge-dot"></i>` : '')}
        ${fab('login', icon('calendar'), 'Login', n.login ? '<i class="badge-dot"></i>' : '')}
        ${fab('settings', icon('gear'), 'Settings')}
      </div>
      <div class="hm-side hm-right">${right.join('')}</div>
      <div class="hm-bottom">
        <div class="chap ${locked ? 'is-locked' : ''}" style="--cc:${cc}">
          <button class="chap-arrow" data-act="prev" ${sel <= 1 ? 'disabled' : ''} aria-label="Previous chapter">${icon('left')}</button>
          <div class="chap-body">
            <div class="chap-no t-label">${ch.endless ? 'Endless' : `Chapter ${sel}`}<span class="chap-dots">${CHAPTERS.map((c) => `<i class="${c.id === sel ? 'on' : ''} ${c.id > p.chapter.unlocked ? 'lk' : ''}"></i>`).join('')}</span></div>
            <div class="chap-name t-display">${ch.name}</div>
            <div class="chap-status">${status}</div>
          </div>
          <button class="chap-arrow" data-act="next" ${sel >= CHAPTERS.length ? 'disabled' : ''} aria-label="Next chapter">${icon('right')}</button>
        </div>
        ${ftue ? `<div class="ftue"><span>Your legion awaits, Shepherd.</span><i class="ftue-arrow">${icon('right')}</i></div>` : ''}
        <div class="battle-wrap ${ftue ? 'is-ftue' : ''}">
          <button class="btn btn-primary btn-battle ${locked ? 'is-locked' : ''}" data-act="battle">
            <span class="bb-shine"></span>
            <span class="bb-label t-display">${locked ? `${icon('lock')} Locked` : 'Battle'}</span>
            ${locked ? '' : `<span class="bb-cost ${lowEnergy ? 'is-low' : ''}">${icon('energy')}<b class="tnum">${ENERGY_COST}</b></span>`}
          </button>
          ${ftue ? '<span class="ftue-ring"></span><span class="ftue-ring r2"></span>' : ''}
        </div>
      </div>`;
  }

  function setChapter(d) {
    const p = app.profile;
    const next = Math.min(CHAPTERS.length, Math.max(1, (p.chapter.selected || 1) + d));
    if (next === p.chapter.selected) return;
    p.chapter.selected = next;
    tap(app);
    commit(p); // onChange re-renders
    $(el, '.chap')?.classList.add(d > 0 ? 'slide-l' : 'slide-r');
  }

  delegate(root, {
    hero: () => { tap(app); ctx.go('heroes'); },
    quests: () => { tap(app); openQuests(ctx); },
    login: () => { tap(app); openLogin(ctx); },
    settings: () => { tap(app); openSettings(ctx); },
    starter: () => { tap(app, 'medium'); openStarter(ctx); },
    pact: () => { tap(app); openPact(ctx); },
    pactClaim: () => { tap(app, 'medium', null); claimPact(ctx); },
    chest: async () => {
      if (busy) return; busy = true; tap(app);
      try {
        const ok = await watchAd(app, 'free_chest');
        if (ok) {
          const items = claimFreeChest(app.profile);
          if (items) { commit(app.profile); popRewards(app, items, { title: 'Free Chest' }); }
        }
      } finally { busy = false; }
    },
    chestDone: () => { tap(app); toast(`Next free chest in ${fmtTime((nextMidnight() - Date.now()) / 1000)}`); },
    prev: () => setChapter(-1),
    next: () => setChapter(1),
    battle: () => {
      const p = app.profile; const sel = p.chapter.selected || 1;
      if (sel > p.chapter.unlocked) { tap(app, 'warning', null); toast(`Clear Chapter ${sel - 1} to unlock`); return; }
      tap(app, 'medium', 'select');
      if (!canPlay(p)) { openEnergy(ctx); return; }
      const ok = app.startRun(sel);
      if (ok === false) { if (!canPlay(p)) openEnergy(ctx); else toast('Unable to start this chapter'); }
    },
  });

  // Swipe left/right on the chapter card to change chapter.
  let sx = null;
  root.addEventListener('pointerdown', (e) => { if (e.target.closest('.chap')) sx = e.clientX; });
  root.addEventListener('pointerup', (e) => {
    if (sx == null) return;
    const dx = e.clientX - sx; sx = null;
    if (Math.abs(dx) > 40) setChapter(dx < 0 ? 1 : -1);
  });

  return { el, render };
}
