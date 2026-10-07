// The Bestiary sub-tab (Heroes screen): a painted card per foe, locked to a dark silhouette until the first kill, and a
// detail sheet with its lore, how it fights, its kill count and three milestones to claim. Rules: meta/bestiary.js.
import './bestiary.css';
import { h, fmt, modal } from '../dom.js';
import { icon } from '../icons.js';
import { BESTIARY } from '../../game/data.js';
import { bestiaryEntry } from '../../meta/bestiary.js';
import { onChange, commit, claimBestiary } from '../../meta/economy.js';
import { FOE_ART } from '../art.js';
import { bar, bundleItems, rewardChip, popRewards, tap } from './util.js';

const ROMAN = ['I', 'II', 'III'];
const pips = (e) => `<span class="b-pips">${e.tiers.map((t) => `<i class="${t.claimed ? 'on' : t.ready ? 'rdy' : ''}"></i>`).join('')}</span>`;
const next = (e) => e.tiers[Math.min(e.claimed, e.tiers.length - 1)];

/** The sub-tab body: a summary panel and the card grid. */
export function renderBestiary(p) {
  const list = BESTIARY.order.map((id) => bestiaryEntry(p, id));
  const found = list.filter((e) => e.unlocked).length, claimed = list.reduce((a, e) => a + e.claimed, 0), tiers = list.reduce((a, e) => a + e.tiers.length, 0);
  return `<div class="bst-head panel">
      <div><div class="t-label">Discovered</div><b class="tnum">${found}/${list.length}</b></div>
      <div><div class="t-label">Milestones</div><b class="tnum">${claimed}/${tiers}</b></div>
      <div><div class="t-label">Slain</div><b class="tnum">${fmt(list.reduce((a, e) => a + e.kills, 0))}</b></div>
    </div>
    <div class="bst-grid">${list.map((e) => {
      const t = next(e), done = e.claimed >= e.tiers.length;
      return `<button class="bcard ${e.unlocked ? '' : 'is-locked'} ${e.ready ? 'is-ready' : ''} ${e.id === 'gravemaw' ? 'is-boss' : ''}" data-act="foe" data-id="${e.id}" style="--fc:${e.color}" aria-label="${e.unlocked ? e.name : 'Undiscovered foe'}">
        <span class="bcard-frame">
          <span class="bcard-art"><img src="${FOE_ART[e.id]}" alt="" draggable="false" loading="lazy"></span>
          ${e.unlocked ? '' : '<span class="bcard-q">?</span>'}
          <span class="bcard-info">
            <span class="bcard-name t-display">${e.unlocked ? e.name : '???'}</span>
            <span class="bcard-kills">${e.unlocked ? `<b class="tnum">${fmt(e.kills)}</b> slain` : 'Undiscovered'}</span>
          </span>
          ${e.ready ? '<i class="badge-dot"></i>' : ''}
        </span>
        <span class="bcard-prog">${pips(e)}${done ? '<b class="bcard-max">COMPLETE</b>' : `${bar(e.kills / t.goal, t.ready ? 'mbar-ok' : '')}<b class="tnum">${fmt(Math.min(e.kills, t.goal))}/${fmt(t.goal)}</b>`}</span>
      </button>`;
    }).join('')}</div>
    <div class="mhint t-dim">${icon('info')} Every foe your legion slays is recorded here, gilded elites with their kind. Reach a milestone to claim its reward.</div>`;
}

/** The detail sheet for one entry, live while open (claims re-render it). */
export function openFoe(ctx, id) {
  const { app } = ctx, p = app.profile;
  const body = h('<div class="bd"></div>');
  let flash = -1;
  const draw = () => {
    const e = bestiaryEntry(p, id), u = e.unlocked;
    body.innerHTML = `
      <div class="bd-art ${u ? '' : 'is-locked'}" style="--fc:${e.color}"><img src="${FOE_ART[id]}" alt="" draggable="false">${u ? '' : '<span class="bcard-q">?</span>'}</div>
      <div class="hd-id">
        <div class="bd-name t-display" style="--fc:${u ? e.color : '#4a5878'}">${u ? e.name : '???'}</div>
        <div class="hd-title">${u ? e.role : 'Undiscovered'}</div>
      </div>
      <p class="hd-lore">${u ? e.lore : 'Nothing is known of this horror yet. Slay one to fill this page.'}</p>
      ${u ? `<div class="hd-rows"><div class="hd-row"><span class="hd-ri" style="color:${e.color}">${icon('swords')}</span><div><small class="t-label">How it fights</small><span class="bd-fights">${e.fights}</span></div></div></div>` : ''}
      <div class="bd-kills"><span class="t-label">Slain</span><b class="tnum">${e.kills.toLocaleString('en-US')}</b></div>
      <div class="qs bd-tiers">${e.tiers.map((t, i) => `
        <div class="q ${t.claimed ? 'is-claimed' : t.ready ? 'is-ready' : ''} ${flash === i ? 'flash' : ''}">
          <div class="q-ic bd-tier">${ROMAN[i]}</div>
          <div class="q-main">
            <div class="q-tx">Slay ${t.goal.toLocaleString('en-US')}</div>
            <div class="q-prog">${bar(e.kills / t.goal)}<span class="tnum">${fmt(Math.min(e.kills, t.goal))}/${fmt(t.goal)}</span></div>
            <div class="q-rw">${bundleItems(t.rewards).map((it) => rewardChip(it)).join('')}</div>
          </div>
          <div class="q-act">${t.claimed ? `<span class="q-done">${icon('check')}</span>` : t.ready ? `<button class="btn btn-sm btn-ad" data-tier="${i}">Claim</button>` : `<span class="bd-lock">${icon('lock')}</span>`}</div>
        </div>`).join('')}
      </div>`;
    flash = -1;
  };
  draw();
  const off = onChange(draw);
  modal({ body, cls: 'mm-foe scroll', onClose: off });
  body.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-tier]'); if (!b) return;
    const tier = +b.dataset.tier;
    if (tier !== p.bestiary.claimed[id]) return; // a stale button (tiers go in order)
    const items = claimBestiary(p, id);
    if (!items) return;
    flash = tier;
    tap(app, 'success', 'coin');
    commit(p);
    popRewards(app, items, { title: `${BESTIARY.foes[id].name} · Milestone ${ROMAN[tier]}` });
  });
}
