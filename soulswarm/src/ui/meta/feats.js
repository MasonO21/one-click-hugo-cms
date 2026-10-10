// The Feats panel (meta/feats.js, Update 14): every family with its tier pips, the next goal and its progress, and a
// claim for each tier reached. Opened from the home screen's Feats button.
import { $$, fmt } from '../dom.js';
import { icon } from '../icons.js';
import { FEATS } from '../../game/data.js';
import { featEntry, featsProgress } from '../../meta/feats.js';
import { commit, claimFeat } from '../../meta/economy.js';
import { rewardChip, popRewards, bar, tap } from './util.js';
import { liveModal } from './panels.js';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];

export function openFeats(ctx) {
  const { app } = ctx; const p = app.profile;
  return liveModal({ title: 'Feats', cls: 'mm-feats scroll' }, (body) => {
    const list = FEATS.order.map((id) => featEntry(p, id));
    const ready = list.filter((f) => f.ready), P = featsProgress(p);
    // ready first, then the ones under way, the finished ones last
    const rank = (f) => (f.ready ? 0 : f.done ? 2 : 1);
    list.sort((a, b) => rank(a) - rank(b));
    body.innerHTML = `
      <div class="mm-sub ft-head"><span class="t-label">Earned</span> <b class="tnum">${P.got}</b><span class="t-dim tnum"> / ${P.all}</span>${bar(P.got / P.all, 'ft-total')}</div>
      <div class="qs ft-list">${list.map((f) => `
        <div class="q ft ${f.ready ? 'is-ready' : f.done ? 'is-claimed' : ''}" data-feat="${f.id}">
          <div class="q-ic">${icon(f.icon)}</div>
          <div class="q-main">
            <div class="q-tx"><b>${f.name}${f.goals.length > 1 ? ` ${ROMAN[f.done ? f.goals.length : f.tier]}` : ''}</b> <span class="ft-pips">${f.goals.map((_, i) => `<i class="${i < f.claimed ? 'on' : i < f.reached ? 'got' : ''}"></i>`).join('')}</span></div>
            <div class="ft-desc t-dim">${f.done ? 'Every tier earned' : f.desc}</div>
            ${f.done ? '' : `<div class="q-prog">${bar(f.value / f.goal)}<span class="tnum">${fmt(Math.min(f.value, f.goal))}/${fmt(f.goal)}</span></div>`}
          </div>
          <div class="q-act">${f.done ? `<span class="q-done">${icon('check')}</span>` : f.ready ? `<button class="btn btn-sm btn-ad" data-claim="${f.id}">${icon('gems')}${f.reward}</button>` : rewardChip({ kind: 'gems', amount: f.reward }, 'ft-rw')}</div>
        </div>`).join('')}
      </div>
      ${ready.length > 1 ? `<button class="btn btn-ad btn-block" data-claim="*">Claim all (${ready.length})</button>` : ''}
      <div class="mm-foot t-dim">Feats count everything you have done, before this update too. Each tier pays gems once.</div>`;
    $$(body, '[data-claim]').forEach((b) => b.addEventListener('click', () => {
      tap(app, 'medium');
      // "Claim all" takes every tier reached, not just the next one of each family
      const ids = b.dataset.claim === '*' ? ready.map((f) => f.id) : [b.dataset.claim];
      let items = [];
      for (const id of ids) { let got; while ((got = claimFeat(p, id))) { items = items.concat(got); if (b.dataset.claim !== '*') break; } }
      if (!items.length) return;
      commit(p);
      const gems = items.reduce((a, it) => a + (it.kind === 'gems' ? it.amount : 0), 0);
      popRewards(app, [{ kind: 'gems', amount: gems }], { title: 'Feat earned!' });
    }));
  });
}
