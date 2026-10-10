// The Boss Rush panel (this week's court, BOSS_RUSH.courts in data.js: the Hollow Court, or every other week once Chapter
// 10 is cleared the Fallen Court): the five bosses (ticked when beaten in one attempt this
// event), the event clock, today's free tries (one more by rewarded ad), the milestone track paid once per event, the
// best clear, and the way in. Opened from the home screen's Rush button.
import { $, fmtTime, toast, watchAd } from '../dom.js';
import { icon } from '../icons.js';
import { BOSS_RUSH, BOSSES } from '../../game/data.js';
import { commit, rushState, grantRushTry } from '../../meta/economy.js';
import { cd, hex, rewardChip, tap } from './util.js';
import { liveModal } from './panels.js';
import { FOE_ART } from '../art.js';

const chips = (m) => Object.entries(m).map(([kind, amount]) => rewardChip({ kind, amount })).join('');

export function openRush(ctx) {
  const { app } = ctx; const p = app.profile;
  let busy = false;
  const lm = liveModal({ title: 'Boss Rush', cls: 'mm-rush scroll' }, (body) => {
    const s = rushState(p), n = s.bosses.length;
    const action = !s.open ? `<div class="tr-done br-closed">${icon('hourglass')} Closed · opens again in ${cd(s.starts, 0, 'cd-strong')}</div>`
      : s.available ? `<button class="btn btn-primary btn-lg btn-block br-go" data-act="go"><span>Enter the Court</span><small>${s.triesLeft} free ${s.triesLeft === 1 ? 'try' : 'tries'} left today</small></button>`
      : s.retry ? `<button class="btn btn-ad btn-lg btn-block" data-act="retry">${icon('ad')} One more try</button><small class="t-dim tr-again">One video per try, as many as you like</small>`
      : `<div class="tr-done">${icon('check')} No tries left today · more at midnight</div>`;
    body.innerHTML = `<div class="br">
      <div class="br-head"><span class="t-label">${s.open ? '<i class="br-live"></i>Live now' : 'Limited event'}</span><b class="t-display">${s.name}</b>
        <small class="t-dim">${s.open ? `Ends in ${cd(s.ends, 0, 'cd-strong')}` : `Every week, Tuesday to Thursday (UTC)`}</small></div>
      <div class="br-bosses">${s.bosses.map((id, i) => `<div class="br-boss ${i < s.bestKills ? 'won' : ''}" style="--bc:${hex(BOSSES[id].color)}">
        <img src="${FOE_ART[id]}" alt="" draggable="false"><b>${BOSSES[id].name}</b>${i < s.bestKills ? `<i class="br-tick">${icon('check')}</i>` : ''}</div>`).join('')}</div>
      <p class="br-how">${s.court === 'fallen' ? 'The five act finales, back to back, at the scaling of their chapters (10 to 30).' : 'All five chapter bosses of Act I, back to back.'} You start at level ${BOSS_RUSH.level} with ${BOSS_RUSH.legion} souls and ${BOSS_RUSH.draft} powers of your choice; each boss drops a Relic Chest. Free: no energy.</p>
      <div class="br-track"><div class="t-label">Event rewards · bosses beaten in one attempt</div>${BOSS_RUSH.milestones.map((m, i) => `<div class="br-ms ${i < s.claimed ? 'got' : ''}">
        <span class="br-n tnum">${i + 1}</span><span class="br-ml">${i + 1 === n ? 'Clear the Court' : `Beat ${i + 1} ${i ? 'bosses' : 'boss'}`}</span><span class="br-rw">${chips(m)}</span>
        <span class="br-st">${i < s.claimed ? icon('check') : ''}</span></div>`).join('')}</div>
      <div class="br-best"><span>Best clear this event <b class="tnum">${s.best ? fmtTime(s.best) : '–'}</b></span><span>All time <b class="tnum">${s.allBest ? fmtTime(s.allBest) : '–'}</b></span></div>
      ${action}
    </div>`;
    $(body, '[data-act="go"]')?.addEventListener('click', () => {
      tap(app, 'medium', 'select');
      lm.close();
      if (!app.startRun(1, { rush: true })) toast('The Court is closed');
    });
    $(body, '[data-act="retry"]')?.addEventListener('click', async () => {
      if (busy) return; busy = true;
      try { if (await watchAd(app, 'rush_retry') && grantRushTry(p)) commit(p); } finally { busy = false; }
    });
  });
}
