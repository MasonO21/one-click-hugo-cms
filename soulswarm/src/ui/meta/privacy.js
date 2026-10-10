// Privacy UI (Update 14, GDD §19): the neutral age gate, the consent sheet, and Settings → Privacy (the player ID, the
// two choices, the policy, export and delete). Rules live in meta/privacy.js, the event queue in meta/analytics.js.
import { h, $, $$, modal, toast } from '../dom.js';
import { icon } from '../icons.js';
import { PRIVACY } from '../../game/data.js';
import { gateYears, answerGate, needsConsent, setConsent, canAskAnalytics, canAskAds, guessEU } from '../../meta/privacy.js';
import { analytics } from '../../meta/analytics.js';
import { commit } from '../../meta/economy.js';
import { tap } from './util.js';
import { exportCode, importCode } from '../../meta/transfer.js';

const BAND_TEXT = {
  child: 'Purchases are switched off, and nothing is measured. Rewarded videos are never personalised.',
  teen: 'Rewarded videos are never personalised for players under 18.',
};

/** The neutral age gate: a year of birth, nothing suggested, nothing explained about why an answer would matter. Then
 *  the consent sheet when there is something to ask. `done` runs when both are answered. */
export function openAgeGate(app, done) {
  const p = app.profile, years = gateYears();
  const body = h(`<div class="pv">
    <p class="pv-lead">Before you begin, please tell us the year you were born.</p>
    <label class="pv-sel"><span class="t-label">Year of birth</span>
      <select class="pv-year" aria-label="Year of birth"><option value="" selected disabled>Year</option>${years.map((y) => `<option value="${y}">${y}</option>`).join('')}</select></label>
    <p class="pv-fine t-dim">${icon('info')} This stays on your device. It sets which features and privacy choices apply to you.</p>
  </div>`);
  const sel = $(body, '.pv-year');
  const m = modal({ title: 'Welcome, Shepherd', body, cls: 'mm-gate mm-short', dismissable: false, actions: [{ label: 'Continue', cls: 'btn-primary btn-lg pv-go', onClick: () => {
    const y = +sel.value; if (!y) return false;
    const band = answerGate(p, y, guessEU());
    commit(p);
    tap(app, 'medium');
    if (needsConsent(p)) openConsent(app, 'first', done);
    else { if (BAND_TEXT[band]) toast(BAND_TEXT[band]); done && done(); }
  } }] });
  const go = $(m.el, '.pv-go'); go.disabled = true;
  sel.addEventListener('change', () => { go.disabled = !sel.value; });
  return m;
}

/** The consent sheet: analytics and personalised ads, both off until chosen; "Necessary only" and "Allow all" carry the
 *  same weight. `where`: 'first' (after the gate), 'policy' (a new policy version) or 'settings'. */
export function openConsent(app, where = 'first', done) {
  const p = app.profile, A = canAskAnalytics(p), Ad = canAskAds(p);
  const pick = { analytics: A && p.privacy.consent.analytics, ads: Ad && p.privacy.consent.ads };
  const row = (k, ok, title, text) => ok ? `<div class="pv-opt"><div><b>${title}</b><small>${text}</small></div><button class="tgl" role="switch" data-k="${k}"><i></i></button></div>` : '';
  const body = h(`<div class="pv">
    <p class="pv-lead">SOULSWARM keeps your progress on this device. With your permission it can also:</p>
    ${row('analytics', A, 'Measure gameplay', 'Anonymous events (runs, chapters, what you pick) that help us balance the game. No name, no contacts, no location.')}
    ${row('ads', Ad, 'Personalise ads', 'Tailor the optional rewarded videos to you. Off, they still play, just not personalised.')}
    ${Ad ? '' : `<p class="pv-fine t-dim">${icon('info')} ${BAND_TEXT.teen}</p>`}
    <p class="pv-fine t-dim">You can change this any time in Settings → Privacy. <a href="${PRIVACY.policyUrl}" target="_blank" rel="noopener">Privacy policy</a></p>
  </div>`);
  const sync = () => $$(body, '.tgl').forEach((t) => { const on = !!pick[t.dataset.k]; t.classList.toggle('on', on); t.setAttribute('aria-checked', on); });
  sync();
  $$(body, '.tgl').forEach((t) => t.addEventListener('click', () => { pick[t.dataset.k] = !pick[t.dataset.k]; sync(); tap(app); }));
  const finish = (c) => {
    const before = !!p.privacy.consent.analytics;
    setConsent(p, c); commit(p);
    if (before && !p.privacy.consent.analytics) analytics.clear(); // withdrawn: what was queued goes too
    if (where === 'first') analytics.track('age_gate', { band: p.privacy.band, eu: p.privacy.eu }); // the band only (never the year), and only with consent
    analytics.track('consent', { analytics: p.privacy.consent.analytics, ads: p.privacy.consent.ads, where });
    done && done();
  };
  const actions = [
    { label: 'Necessary only', cls: 'btn-ghost btn-lg', onClick: () => finish({ analytics: false, ads: false }) },
    { label: 'Allow all', cls: 'btn-ghost btn-lg', onClick: () => finish({ analytics: true, ads: true }) },
    { label: 'Save my choices', cls: 'btn-primary btn-lg', onClick: () => finish(pick) },
  ];
  return modal({ title: 'Your privacy', body, cls: 'mm-consent mm-short', dismissable: where === 'settings', actions });
}

/** Settings → Privacy: the section's markup and its handlers (panels.js openSettings). */
export function privacySection(app) {
  const p = app.profile, P = p.privacy;
  const n = analytics.events().length;
  return `<div class="st-h t-label">Privacy</div>
    <div class="st-row"><span class="st-l">${icon('helm')} Player ID</span><code class="pv-id" data-act="copyId">${P.id}</code></div>
    <div class="st-row st-col pv-state"><small class="t-dim">${P.band === 'child' ? BAND_TEXT.child : `Gameplay analytics: <b>${P.consent.analytics ? 'on' : 'off'}</b> · Personalised ads: <b>${P.consent.ads ? 'on' : 'off'}</b>${P.consent.analytics ? ` · ${n} event${n === 1 ? '' : 's'} on this device (this build sends none)` : ''}`}</small></div>
    ${P.band === 'child' ? '' : '<button class="btn btn-ghost btn-block" data-act="consent">Privacy choices</button>'}
    <div class="row pv-row"><a class="btn btn-ghost" href="${PRIVACY.policyUrl}" target="_blank" rel="noopener">Privacy policy</a><button class="btn btn-ghost" data-act="export">Export my data</button></div>
    <button class="btn btn-ghost btn-block" data-act="transfer">${icon('share')} Transfer or back up your save</button>`;
}

/** Handlers for the section (delegate(body, …) in openSettings). `close` closes the Settings sheet. */
export function privacyActions(app, close) {
  return {
    copyId: async (b) => { tap(app); try { await navigator.clipboard.writeText(app.profile.privacy.id); toast('Player ID copied'); } catch (e) { const r = document.createRange(); r.selectNodeContents(b); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } },
    consent: () => { tap(app); close(); openConsent(app, 'settings'); },
    export: () => { tap(app); exportData(app); },
    transfer: () => { tap(app); close(); openTransfer(app); },
  };
}

/** Data portability: everything this device holds about the player, as JSON to copy. */
export function exportData(app) {
  const data = JSON.stringify({ profile: app.profile, events: analytics.events() }, null, 1);
  const body = h(`<div class="pv"><p class="pv-fine t-dim">Everything SOULSWARM keeps about you on this device: your save and any queued gameplay events.</p><textarea class="pv-json" readonly spellcheck="false"></textarea></div>`);
  $(body, '.pv-json').value = data;
  return modal({ title: 'Your data', body, cls: 'mm-export', actions: [
    { label: 'Copy', cls: 'btn-primary', onClick: () => { const t = $(body, '.pv-json'); navigator.clipboard.writeText(data).then(() => toast('Copied'), () => { t.focus(); t.select(); }); return false; } },
    { label: 'Close', cls: 'btn-ghost' },
  ] });
}

/** Save transfer (meta/transfer.js): this device's code to copy, and a box to restore one (after a confirm). */
export function openTransfer(app) {
  const body = h(`<div class="pv">
    <p class="pv-fine t-dim">${icon('info')} Copy this code to move your progress to another device, or keep it as a backup. Anyone with the code can restore your progress, so keep it private.</p>
    <textarea class="pv-json pv-code" readonly spellcheck="false" placeholder="Preparing…"></textarea>
    <button class="btn btn-ghost btn-block" data-act="copyCode">Copy my code</button>
    <div class="st-sep"></div>
    <span class="t-label">Restore from a code</span>
    <textarea class="pv-json pv-in" spellcheck="false" placeholder="Paste a code here (it starts with SS1.)"></textarea>
    <button class="btn btn-ghost btn-block" data-act="check">Restore</button>
    <div class="pv-confirm" hidden><p>${icon('info')} <span class="pv-what"></span> This replaces all progress on this device.</p>
      <div class="row"><button class="btn btn-ghost" data-act="cancelRestore">Cancel</button><button class="btn btn-danger" data-act="restore">Replace my progress</button></div></div>
  </div>`);
  const code = $(body, '.pv-code'), input = $(body, '.pv-in'), confirm = $(body, '.pv-confirm');
  let pending = null;
  exportCode(app.profile).then((c) => { code.value = c; }).catch(() => { code.value = ''; code.placeholder = 'This device cannot make a code.'; });
  body.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'copyCode') { tap(app); navigator.clipboard.writeText(code.value).then(() => toast('Code copied'), () => { code.focus(); code.select(); }); analytics.track('save_transfer', { direction: 'export' }); }
    else if (act === 'check') {
      tap(app);
      const r = await importCode(input.value);
      if (r.error) { pending = null; confirm.hidden = true; toast(r.error === 'checksum' ? 'That code is incomplete or mistyped.' : 'That is not a SOULSWARM save code.'); return; }
      pending = r.profile;
      $(body, '.pv-what').textContent = `Account level ${pending.level}, Chapter ${pending.chapter.unlocked}, ${Object.values(pending.heroes).filter((x) => x.owned).length} heroes.`;
      confirm.hidden = false;
    } else if (act === 'cancelRestore') { pending = null; confirm.hidden = true; }
    else if (act === 'restore' && pending) { analytics.track('save_transfer', { direction: 'import' }); app.replaceProfile(pending); }
  });
  return modal({ title: 'Transfer your save', body, cls: 'mm-export mm-transfer', actions: [{ label: 'Close', cls: 'btn-ghost' }] });
}
