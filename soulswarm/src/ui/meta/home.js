// Battle tab (home): hero header, floating side buttons, chapter selector and the big BATTLE button.
// The middle of the screen stays empty so the 3D hero showcase reads through.
import { h, $, fmt, fmtTime, toast, watchAd } from '../dom.js';
import { icon } from '../icons.js';
import { CHAPTERS, ENERGY_COST, SKUS, HEROES, DIFFICULTY, DIFFICULTY_ORDER, BOSSES, bossFor } from '../../game/data.js';
import { difficultyUnlocked, selectedDifficulty, selectDifficulty, difficultyRecord, clearedOn } from '../../meta/difficulty.js';
import {
  commit, computeLoadout, notifications, starterAvailable, pactActive, pactDailyAvailable,
  freeChestAvailable, claimFreeChest, canPlay, trialState, bloodMoon, bloodMoonTimes, rushState,
} from '../../meta/economy.js';
import { hex, cd, nextMidnight, popRewards, tap, delegate } from './util.js';
import { now as clockNow } from '../../meta/clock.js';
import { openQuests, openLogin, openSettings, openStarter, openPact, openEnergy, claimPact, openTrial } from './panels.js';
import { openRush } from './rush.js';
import { CHAPTER_ART } from '../art.js';

const warmed = new Set();
/** Decode the neighbouring chapters' paintings ahead of a swipe, so the cross-fade never shows a blank card. */
const warm = (id) => { const u = CHAPTER_ART[id]; if (!u || warmed.has(u)) return; warmed.add(u); const im = new Image(); im.decoding = 'async'; im.src = u; };

export function createHome(ctx) {
  const { app } = ctx;
  const el = h('<section class="pane pane-home" data-tab="battle"><div class="hm"></div></section>');
  const root = $(el, '.hm');
  let busy = false; // guards async ad flows against double taps
  let artShown = ''; // the painting on the chapter card: a change cross-fades from the last one

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
    const art = CHAPTER_ART[sel], prevArt = artShown && artShown !== art ? artShown : '';
    artShown = art; warm(sel - 1); warm(sel + 1);

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
    else if (ch.endless) status = best ? `<span class="chap-best">${icon('trophy')} Deepest run ${fmtTime(best.time)}${best.depth ? ` · depth ${best.depth}` : ''}</span>` : '<span class="chap-best t-dim">No time limit. A boss rises every 5:00, the five in turn.</span>';
    else if (best?.cleared) status = `<span class="pill pill-soul">${icon('check')} Cleared</span><span class="chap-best t-dim">Best ${fmtTime(best.time)}</span>`;
    else if (best) status = `<span class="chap-best">${icon('hourglass')} Best ${fmtTime(best.time)} <span class="t-dim">/ 06:00</span></span>`;
    else status = `<span class="chap-best t-dim">Survive 6:00 and slay ${BOSSES[bossFor(ch)].name}</span>`;

    // Nightmare / Torment selector (campaign chapters only): records, first-clear bonus and locks for the chosen tier
    const dsel = locked || ch.endless ? 'normal' : selectedDifficulty(p, sel), D = DIFFICULTY[dsel];
    if (dsel !== 'normal') {
      const rec = difficultyRecord(p, sel, dsel);
      status = rec?.cleared
        ? `<span class="pill pill-diff" style="--dc:${D.css}">${icon('check')} Cleared</span><span class="chap-best t-dim">Best ${fmtTime(rec.time)} · Legion ${rec.legion}</span>`
        : `<span class="chap-best">${rec ? `${icon('hourglass')} Best ${fmtTime(rec.time)} <span class="t-dim">·</span> ` : ''}<span class="d-first">${icon('gems')} +${D.firstClearGems} first clear</span></span>`;
    }
    const dselHtml = locked || ch.endless ? '' : `<div class="dsel" role="group" aria-label="Difficulty">${DIFFICULTY_ORDER.map((id, i) => {
      const d = DIFFICULTY[id], open = difficultyUnlocked(p, sel, id), won = id !== 'normal' && clearedOn(p, sel, id);
      const sub = open ? `×${d.gold} gold` : `${icon('lock')} Beat ${DIFFICULTY[DIFFICULTY_ORDER[i - 1]].name}`;
      return `<button class="dsel-b${id === dsel ? ' on' : ''}${open ? '' : ' lk'}" data-act="diff" data-d="${id}" style="--dc:${d.css}" aria-pressed="${id === dsel}"${open ? '' : ' aria-disabled="true"'}><b>${d.name}${won ? icon('check') : ''}</b><small>${sub}</small></button>`;
    }).join('')}</div>`;

    // first steps: a new Shepherd's Battle opens the free tutorial (game/tutorial.js); after it, the strip points the way
    // to Talents, then back to Chapter 1 (profile.flags.coach, cleared by the first real run)
    const train = !p.flags.tutorialDone, coach = train ? '' : p.flags.coach;
    const ftue = (train || coach === 'battle') && !locked;
    const lowEnergy = !canPlay(p);
    const trial = trialState(p), rush = rushState(p); // Boss Rush: the weekly Hollow Court (ui/meta/rush.js)

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
        ${trial.unlocked ? fab('trial', icon('star'), 'Trial', trial.available ? '<i class="badge-dot"></i>' : '', trial.available ? 'fab-gold fab-offer' : '') : ''}
        ${rush.unlocked ? fab('rush', icon('crown'), 'Rush', rush.available ? '<i class="badge-dot"></i>' : '', rush.open ? 'fab-rush fab-offer' : '') : ''}
        ${fab('settings', icon('gear'), 'Settings')}
      </div>
      <div class="hm-side hm-right">${right.join('')}</div>
      <div class="hm-bottom">
        <div class="chap ${locked ? 'is-locked' : ''} ${dselHtml ? 'has-dsel' : ''}" style="--cc:${cc}" data-art="${sel}">
          ${prevArt ? `<i class="chap-art" style="background-image:url(${prevArt})"></i>` : ''}<i class="chap-art${prevArt ? ' chap-art-in' : ''}" style="background-image:url(${art})"></i>
          <button class="chap-arrow" data-act="prev" ${sel <= 1 ? 'disabled' : ''} aria-label="Previous chapter">${icon('left')}</button>
          <div class="chap-body">
            <div class="chap-no t-label">${ch.endless ? 'Endless' : `Chapter ${sel}`}<span class="chap-dots">${CHAPTERS.map((c) => `<i class="${c.id === sel ? 'on' : ''} ${c.id > p.chapter.unlocked ? 'lk' : ''}"></i>`).join('')}</span></div>
            <div class="chap-name t-display">${ch.name}</div>
            <div class="chap-status">${status}</div>
          </div>
          <button class="chap-arrow" data-act="next" ${sel >= CHAPTERS.length ? 'disabled' : ''} aria-label="Next chapter">${icon('right')}</button>
          ${dselHtml}
        </div>
        ${bloodMoon(p) ? `<div class="bm"><i class="bm-moon"></i><div><b>BLOOD MOON</b><span>2× elites · 2× gold and gems</span></div>${cd(bloodMoonTimes().ends, 0, 'bm-cd')}</div>` : ''}
        ${coach === 'talent' ? `<button class="ftue ftue-go" data-act="coachTalent"><span>Spend your gold on <b>Talents</b></span><i class="ftue-arrow ftue-side">${icon('right')}</i></button>`
          : ftue ? `<div class="ftue"><span>${train ? 'Begin your training, Shepherd.' : 'Chapter 1 awaits. Your legion is ready.'}</span><i class="ftue-arrow">${icon('right')}</i></div>` : ''}
        <div class="battle-wrap ${ftue ? 'is-ftue' : ''} d-${dsel}">
          <button class="btn btn-primary btn-battle ${locked ? 'is-locked' : ''} d-${dsel}" data-act="battle">
            <span class="bb-shine"></span>
            <span class="bb-label t-display">${locked ? `${icon('lock')} Locked` : 'Battle'}</span>
            ${locked ? '' : train ? '<span class="bb-cost bb-free">Free</span>' : `<span class="bb-cost ${lowEnergy ? 'is-low' : ''}">${icon('energy')}<b class="tnum">${ENERGY_COST}</b></span>`}
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
    trial: () => { tap(app); openTrial(ctx); },
    rush: () => { tap(app); openRush(ctx); },
    settings: () => { tap(app); openSettings(ctx); },
    coachTalent: () => { tap(app); ctx.go('heroes', 'talents'); },
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
    chestDone: () => { tap(app); toast(`Next free chest in ${fmtTime((nextMidnight() - clockNow()) / 1000)}`); },
    diff: (b) => {
      const p = app.profile, sel = p.chapter.selected || 1, id = b.dataset.d, i = DIFFICULTY_ORDER.indexOf(id);
      if (!difficultyUnlocked(p, sel, id)) { tap(app, 'warning', null); toast(`Clear ${CHAPTERS[sel - 1].name} on ${DIFFICULTY[DIFFICULTY_ORDER[i - 1]].name} to unlock ${DIFFICULTY[id].name}`); return; }
      if (selectedDifficulty(p, sel) === id) return;
      tap(app);
      selectDifficulty(p, sel, id);
      commit(p); // onChange re-renders
    },
    prev: () => setChapter(-1),
    next: () => setChapter(1),
    battle: () => {
      if (downAt > (app.exitedAt || 0) && downAt - app.exitedAt < 400) return; // the second tap of a double tap on the results' Continue lands here
      const p = app.profile; const sel = p.chapter.selected || 1;
      if (!p.flags.tutorialDone) { tap(app, 'medium', 'select'); app.startRun(1, { tutorial: true }); return; } // the free tutorial comes first
      if (sel > p.chapter.unlocked) { tap(app, 'warning', null); toast(`Clear Chapter ${sel - 1} to unlock`); return; }
      tap(app, 'medium', 'select');
      if (!canPlay(p)) { openEnergy(ctx); return; }
      const ok = app.startRun(sel, { difficulty: selectedDifficulty(p, sel) });
      if (ok === false) { if (!canPlay(p)) openEnergy(ctx); else toast('Unable to start this chapter'); }
    },
  });

  // Swipe left/right on the chapter card to change chapter.
  let sx = null, downAt = -1e9;
  root.addEventListener('pointerdown', (e) => { downAt = performance.now(); if (e.target.closest('.chap')) sx = e.clientX; });
  root.addEventListener('pointerup', (e) => {
    if (sx == null) return;
    const dx = e.clientX - sx; sx = null;
    if (Math.abs(dx) > 40) setChapter(dx < 0 ? 1 : -1);
  });

  return { el, render };
}
