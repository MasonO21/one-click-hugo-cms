// Modal panels opened from several places: quests, login calendar, settings, energy, starter pack,
// Soul Pact, gem-shop confirmations and "not enough" prompts.
import { h, $, $$, fmt, toast, modal, purchaseFlow, watchAd } from '../dom.js';
import { icon } from '../icons.js';
import { SKUS, GEM_SHOP, ENERGY_MAX, ENERGY_REGEN_SEC, HEROES, CHAPTERS, MUTATORS, TRIAL } from '../../game/data.js';
import { todayKey } from '../../meta/save.js';
import { now as clockNow } from '../../meta/clock.js';
import {
  onChange, commit, grant, questList, claimQuest, loginState, claimLogin, energyNextIn, buyGemShop,
  starterAvailable, pactActive, pactDailyAvailable, claimPactDaily, trialState, grantTrialRetry, weeklyState, claimWeekly, nextWeek,
} from '../../meta/economy.js';
import { cd, nextMidnight, bundleItems, rewardChip, popRewards, bar, tap, portrait, delegate, energyFullIn } from './util.js';
import { LOGO_ART } from '../art.js';

const ENERGY_ADS_PER_DAY = 3;
const QUEST_ICON = { kill: 'skull', raise: 'raise', surv: 'hourglass', nova: 'nova', gate: 'banner', runs: 'swords', chest: 'chest', elite: 'crown', legion: 'helm', evolve: 'star', boss: 'trophy', trial: 'star' };

/** Open a modal whose body re-renders whenever the profile changes. */
function liveModal(opts, render) {
  const body = h('<div class="lm"></div>');
  const draw = () => render(body);
  draw();
  const off = onChange(draw);
  const m = modal({ ...opts, body, onClose: () => { off(); opts.onClose && opts.onClose(); } });
  return { ...m, body, draw };
}

// ---------------------------------------------------------------- not enough currency
export function notEnough(ctx, cur, need) {
  const { app } = ctx; const p = app.profile;
  const name = { gems: 'Gems', gold: 'Gold', sigils: 'Sigils' }[cur] || cur;
  modal({
    title: `Not enough ${name}`,
    cls: 'mm-short',
    body: `<div class="ne"><div class="ne-ic">${icon(cur)}</div>
      <p>You need <b class="tnum">${fmt(need)}</b> ${name.toLowerCase()} and have <b class="tnum">${fmt(p[cur] || 0)}</b>.</p></div>`,
    actions: [
      { label: `${icon('bag')} Visit Shop`, cls: 'btn-primary btn-block', onClick: () => ctx.go('shop', cur === 'gems' ? 'gems' : 'daily') },
      { label: 'Not now', cls: 'btn-ghost btn-block' },
    ],
  });
}

// ---------------------------------------------------------------- gem shop confirm
export function confirmGemShop(ctx, key) {
  const { app } = ctx; const p = app.profile; const item = GEM_SHOP[key];
  if (p.gems < item.cost) { notEnough(ctx, 'gems', item.cost); return; }
  const chips = bundleItems(item.rewards).map((it) => rewardChip(it, 'rchip-lg')).join('');
  modal({
    title: 'Confirm purchase',
    cls: 'mm-short',
    body: `<div class="cf"><div class="cf-items">${chips}</div><div class="cf-name">${item.label}</div>
      <div class="cf-cost">Spend <span class="tnum">${icon('gems')} ${fmt(item.cost)}</span> gems?</div>
      <div class="cf-bal t-dim">Balance after: <span class="tnum">${fmt(p.gems - item.cost)}</span></div></div>`,
    actions: [
      {
        label: `Buy ${icon('gems')} <span class="price">${fmt(item.cost)}</span>`, cls: 'btn-gem btn-lg btn-block',
        onClick: () => {
          const items = buyGemShop(p, key);
          if (!items) { toast('Not enough gems'); return; }
          commit(p);
          app.audio.sfx('purchase');
          popRewards(app, items, { title: 'Purchased!' });
        },
      },
      { label: 'Cancel', cls: 'btn-ghost btn-block' },
    ],
  });
}

// ---------------------------------------------------------------- energy
export function openEnergy(ctx) {
  const { app } = ctx; const p = app.profile;
  let lm = null;
  lm = liveModal({ title: 'Energy', cls: 'mm-energy' }, (body) => {
    const today = todayKey();
    const ads = p.flags.energyAds && p.flags.energyAds.date === today ? p.flags.energyAds.n : 0;
    const left = Math.max(0, ENERGY_ADS_PER_DAY - ads);
    const full = p.energy >= ENERGY_MAX;
    body.innerHTML = `
      <div class="en-top">
        <div class="en-bolt">${icon('energy')}</div>
        <div class="en-num tnum"><b>${p.energy}</b><span>/${ENERGY_MAX}</span></div>
        ${bar(p.energy / ENERGY_MAX, 'mbar-energy')}
        <div class="en-sub t-dim">${full ? 'Energy is full. Go raise your legion!' : `Next +1 in ${cd('energy', energyNextIn(p))} · Full in ${cd('energy-full', energyFullIn(p))}`}</div>
        <div class="en-note t-dim">Each battle costs 5. Energy regenerates 1 every ${ENERGY_REGEN_SEC / 60} minutes.</div>
      </div>
      <div class="en-opts">
        <div class="en-opt">
          <div class="en-opt-ic">${icon('energy')}<b>+30</b></div>
          <div class="en-opt-tx"><b>Full refill</b><small>Restore 30 energy</small></div>
          <button class="btn btn-gem btn-sm" data-act="refill" ${full ? 'disabled' : ''}>${icon('gems')}<span class="price">${GEM_SHOP.energy.cost}</span></button>
        </div>
        <div class="en-opt">
          <div class="en-opt-ic en-ad">${icon('ad')}<b>+10</b></div>
          <div class="en-opt-tx"><b>Watch a video</b><small>${left} of ${ENERGY_ADS_PER_DAY} left today</small></div>
          <button class="btn btn-ad btn-sm" data-act="ad" ${left <= 0 ? 'disabled' : ''}>${left <= 0 ? 'Tomorrow' : 'Free'}</button>
        </div>
      </div>`;
    $(body, '[data-act="refill"]')?.addEventListener('click', () => {
      if (p.energy >= ENERGY_MAX) return; // already full (a second tap must not buy again)
      if (p.gems < GEM_SHOP.energy.cost) { notEnough(ctx, 'gems', GEM_SHOP.energy.cost); return; }
      const items = buyGemShop(p, 'energy');
      if (!items) return;
      commit(p); app.audio.sfx('purchase');
      popRewards(app, items, { title: 'Energy restored' });
    });
    $(body, '[data-act="ad"]')?.addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      const ok = await watchAd(app, 'energy');
      if (!ok) { lm && lm.draw(); return; }
      const d = todayKey();
      const n = p.flags.energyAds && p.flags.energyAds.date === d ? p.flags.energyAds.n : 0;
      if (n >= ENERGY_ADS_PER_DAY) return;
      const items = grant(p, { energy: 10 });
      p.flags.energyAds = { date: d, n: n + 1 };
      commit(p);
      popRewards(app, items, { title: 'Energy +10' });
    });
  });
}

// ---------------------------------------------------------------- daily quests
export function openQuests(ctx) {
  const { app } = ctx; const p = app.profile;
  let lm = null;
  lm = liveModal({ title: 'Daily Quests', cls: 'mm-quests scroll' }, (body) => {
    const list = questList(p);
    const ready = list.filter((q) => q.done && !q.claimed).length;
    const W = weeklyState(p);
    body.innerHTML = `
      <div class="mm-sub"><span class="t-label">Resets in</span> ${cd(nextMidnight(), 0, 'cd-strong')}</div>
      <div class="wk ${W.ready ? 'is-ready' : W.claimed ? 'is-claimed' : ''}">
        <div class="wk-ic">${icon('chest')}</div>
        <div class="wk-main"><div class="wk-tx">Weekly chest <small class="t-dim">· resets in ${cd(nextWeek(), 0)}</small></div>
          <div class="q-prog">${bar(W.done / W.goal)}<span class="tnum">${W.done}/${W.goal}</span></div>
          <div class="q-rw">${bundleItems(W.rewards).map((it) => rewardChip(it)).join('')}</div></div>
        <div class="q-act">${W.claimed ? `<span class="q-done">${icon('check')}</span>` : W.ready ? '<button class="btn btn-sm btn-primary" data-wk="1">Open</button>' : ''}</div>
      </div>
      <div class="qs">${list.map((q) => `
        <div class="q ${q.claimed ? 'is-claimed' : q.done ? 'is-ready' : ''}">
          <div class="q-ic">${icon(QUEST_ICON[q.id] || 'quest')}</div>
          <div class="q-main">
            <div class="q-tx">${q.text}</div>
            <div class="q-prog">${bar(q.progress / q.goal)}<span class="tnum">${q.id === 'surv' ? `${Math.floor(q.progress / 60)}:${String(q.progress % 60).padStart(2, '0')}/${q.goal / 60}:00` : `${fmt(q.progress)}/${fmt(q.goal)}`}</span></div>
            <div class="q-rw">${bundleItems(q.rewards).map((it) => rewardChip(it)).join('')}</div>
          </div>
          <div class="q-act">${q.claimed ? `<span class="q-done">${icon('check')}</span>` : `${q.done ? `<button class="btn btn-sm btn-ad" data-q="${q.id}">Claim</button>` : '<button class="btn btn-sm btn-ghost" data-go="1">Go</button>'}`}</div>
        </div>`).join('')}
      </div>
      ${ready > 1 ? `<button class="btn btn-ad btn-block" data-q="*">Claim all (${ready})</button>` : ''}
      <div class="mm-foot t-dim">Quests track your runs. Pass XP also advances the Soul Pass.</div>`;
    $$(body, '[data-go]').forEach((b) => b.addEventListener('click', () => { tap(app); lm && lm.close(); ctx.go('battle'); }));
    $(body, '[data-wk]')?.addEventListener('click', () => { const items = claimWeekly(p); if (!items) return; commit(p); popRewards(app, items, { title: 'Weekly chest!' }); });
    $$(body, '[data-q]').forEach((b) => b.addEventListener('click', () => {
      const ids = b.dataset.q === '*' ? list.filter((q) => q.done && !q.claimed).map((q) => q.id) : [b.dataset.q];
      let items = [];
      for (const id of ids) items = items.concat(claimQuest(p, id) || []);
      if (!items.length) return;
      commit(p);
      popRewards(app, items, { title: 'Quest complete!' });
    }));
  });
}

// ---------------------------------------------------------------- 7-day login
export function openLogin(ctx) {
  const { app } = ctx; const p = app.profile;
  liveModal({ title: '7-Day Login', cls: 'mm-login' }, (body) => {
    const s = loginState(p);
    const claimedN = s.canClaim ? s.day : (s.day === 0 && s.streak > 0 ? 7 : s.day);
    const todayIdx = s.canClaim ? s.day : -1;
    const tile = (r, i) => {
      const state = i < claimedN ? 'is-claimed' : i === todayIdx ? 'is-today' : 'is-future';
      const items = bundleItems(r);
      return `<div class="lg-day ${state} ${i === 6 ? 'lg-big' : ''}">
        <div class="lg-d t-label">Day ${i + 1}</div>
        <div class="lg-rw">${items.map((it) => rewardChip(it, i === 6 ? 'rchip-lg' : '')).join('')}</div>
        ${i === 6 ? '<div class="lg-note">Legendary chance relic chest</div>' : ''}
        ${state === 'is-claimed' ? `<div class="lg-check">${icon('check')}</div>` : ''}
        ${state === 'is-today' ? '<div class="lg-today">Today</div>' : ''}
      </div>`;
    };
    body.innerHTML = `
      <div class="mm-sub">Log in every day for escalating rewards.</div>
      <div class="lg-grid">${s.rewards.map(tile).join('')}</div>
      ${s.canClaim
        ? `<button class="btn btn-primary btn-lg btn-block" data-act="claim">Claim Day ${s.day + 1}</button>`
        : `<div class="lg-next"><span class="t-label">Next reward in</span> ${cd(nextMidnight(), 0, 'cd-strong')}</div>`}`;
    $(body, '[data-act="claim"]')?.addEventListener('click', () => {
      const items = claimLogin(p);
      if (!items) return;
      commit(p);
      popRewards(app, items, { title: `Day ${s.day + 1} reward` });
    });
  });
}

// ---------------------------------------------------------------- settings
export function openSettings(ctx) {
  const { app } = ctx; const p = app.profile; const st = p.settings;
  const body = h(`<div class="st">
    <div class="st-row"><span class="st-l">${icon('sound')} Music</span><input class="rng" type="range" min="0" max="1" step="0.05" data-k="music"><b class="st-v tnum"></b></div>
    <div class="st-row"><span class="st-l">${icon('sound')} Sound FX</span><input class="rng" type="range" min="0" max="1" step="0.05" data-k="sfx"><b class="st-v tnum"></b></div>
    <div class="st-row"><span class="st-l">${icon('skull')} Voice</span><input class="rng" type="range" min="0" max="1" step="0.05" data-k="voice"><b class="st-v tnum"></b></div>
    <div class="st-row"><span class="st-l">${icon('mute')} Mute all</span><button class="tgl" role="switch" data-t="muted"><i></i></button></div>
    <div class="st-row"><span class="st-l">${icon('pulse')} Haptics</span><button class="tgl" role="switch" data-t="haptics"><i></i></button></div>
    <div class="st-row st-col"><span class="st-l">${icon('eye')} Graphics</span>
      <div class="seg">${['auto', 'low', 'medium', 'high'].map((q) => `<button data-q="${q}">${q}</button>`).join('')}</div></div>
    <div class="st-row"><span class="st-l">${icon('energy')} Battery saver</span><button class="tgl" role="switch" data-t="fps30"><i></i></button><small class="t-dim">30 FPS</small></div>
    <div class="st-sep"></div>
    <div class="st-h t-label">Accessibility</div>
    <div class="st-row"><span class="st-l">${icon('wing')} Screen shake</span><input class="rng" type="range" min="0" max="1" step="0.05" data-k="shake"><b class="st-v tnum"></b></div>
    <div class="st-row"><span class="st-l">${icon('star')} Reduce flashes</span><button class="tgl" role="switch" data-t="reduceFlash"><i></i></button></div>
    <div class="st-row"><span class="st-l">${icon('nova')} Auto-Nova</span><button class="tgl" role="switch" data-t="autoNova"><i></i></button><small class="t-dim">at 100%, legion 50+</small></div>
    <div class="st-row"><span class="st-l">${icon('left')} Left-handed</span><button class="tgl" role="switch" data-t="lefty"><i></i></button><small class="t-dim">NOVA on the left</small></div>
    <div class="st-sep"></div>
    <button class="btn btn-ghost btn-block" data-act="restore">Restore purchases</button>
    <div class="st-danger">
      <button class="btn btn-ghost btn-block st-reset" data-act="reset">Reset progress</button>
      <div class="st-confirm" hidden>
        <p>${icon('info')} This permanently erases your heroes, relics and currencies on this device.</p>
        <div class="row"><button class="btn btn-ghost" data-act="cancel">Cancel</button><button class="btn btn-danger" data-act="wipe">Erase</button></div>
      </div>
    </div>
    <div class="st-cred">
      <img class="st-logo" src="${LOGO_ART}" alt="SOULSWARM: Raise the Legion" draggable="false">
      <div>v0.1.0</div>
      <div class="t-dim">Built with Three.js and Capacitor. Fonts: Cinzel, Oxanium.</div>
    </div>
  </div>`);

  const sync = () => {
    $$(body, '.rng').forEach((r) => {
      const v = Number(st[r.dataset.k] ?? 0);
      r.value = v; r.style.setProperty('--v', (v * 100) + '%');
      r.nextElementSibling.textContent = Math.round(v * 100) + '%';
    });
    $$(body, '.tgl').forEach((t) => { const on = !!st[t.dataset.t]; t.classList.toggle('on', on); t.setAttribute('aria-checked', on); });
    $$(body, '.seg button').forEach((b) => b.classList.toggle('on', st.quality === b.dataset.q));
  };
  sync();

  $$(body, '.rng').forEach((r) => {
    r.addEventListener('input', () => { st[r.dataset.k] = Number(r.value); sync(); app.applySettings(); });
    r.addEventListener('change', () => { if (r.dataset.k === 'sfx') app.audio.sfx('click'); else if (r.dataset.k === 'voice') app.audio.voice(`${p.selectedHero}_greet`); commit(p); });
  });
  $$(body, '.tgl').forEach((t) => t.addEventListener('click', () => {
    st[t.dataset.t] = !st[t.dataset.t]; sync(); app.applySettings(); commit(p); tap(app);
  }));
  $$(body, '.seg button').forEach((b) => b.addEventListener('click', () => {
    st.quality = b.dataset.q; sync(); app.applySettings(); commit(p); tap(app);
  }));
  delegate(body, {
    restore: async (b) => {
      b.disabled = true; b.textContent = 'Restoring…';
      try { await app.store.restore(); toast('Purchases restored'); } catch (e) { toast('Restore failed. Try again later.'); }
      b.disabled = false; b.textContent = 'Restore purchases';
    },
    reset: () => { $(body, '.st-reset').hidden = true; $(body, '.st-confirm').hidden = false; app.audio.sfx('warning'); },
    cancel: () => { $(body, '.st-reset').hidden = false; $(body, '.st-confirm').hidden = true; },
    wipe: () => {
      try { app.resetProgress(); } catch (e) { toast('Please restart the game.'); }
    },
  });
  modal({ title: 'Settings', body, cls: 'mm-settings scroll' });
}

// ---------------------------------------------------------------- starter pack
export function openStarter(ctx) {
  const { app } = ctx; const p = app.profile; const sku = SKUS.starter_pack;
  if (!starterAvailable(p)) { toast('This offer has ended'); return; }
  const nyx = HEROES.nyx;
  app.audio.voice('nyx_greet');
  const m = modal({
    cls: 'mm-starter',
    body: `<div class="sp">
      <div class="sp-burst"></div>
      <div class="sp-head"><div class="t-label glow-gold">One-time offer</div><div class="sp-title t-display">Starter Pack</div></div>
      <div class="sp-art">${portrait(app, 'nyx', 'sp-portrait')}<div class="sp-ribbon"><b>${sku.value}</b><small>value</small></div>
        <div class="sp-hero"><span class="pill" style="background:${'#3fb0ff'};color:#001a2e">Rare hero</span><div class="t-display">${nyx.name} ${nyx.title}</div><small>${nyx.passiveText}</small></div></div>
      <div class="sp-items">${bundleItems({ gems: 300, gold: 10000, sigils: 3 }).map((it) => rewardChip(it, 'rchip-lg')).join('')}</div>
      <div class="sp-timer">${icon('hourglass')} Ends in ${cd(p.purchases.starterExpires, 0, 'cd-strong')}</div>
      <button class="btn btn-primary btn-lg btn-block sp-buy" data-act="buy"><span class="price">${app.store.price('starter_pack')}</span></button>
      <div class="sp-fine t-dim">Purchases are confirmed on the next step.</div>
    </div>`,
  });
  $(m.el, '[data-act="buy"]').addEventListener('click', () => { m.close(); purchaseFlow(app, 'starter_pack', { onDone: () => app.audio.sfx('levelup') }); });
}

// ---------------------------------------------------------------- soul pact
export function pactBenefits() {
  return `<ul class="pact-list">
    <li>${icon('gems')}<span><b>300</b> gems right away</span></li>
    <li>${icon('gems')}<span><b>+100</b> gems every day (3,000 total)</span></li>
    <li><span class="ic-tint" style="color:#6dffb0">${icon('ad')}</span><span>Ad rewards without watching ads</span></li>
    <li>${icon('gold')}<span><b>+20%</b> gold from every run</span></li>
  </ul>`;
}
export const pactDaysLeft = (p) => Math.max(0, Math.ceil(((p.purchases.pactUntil || 0) - clockNow()) / 864e5));

export function claimPact(ctx) {
  const { app } = ctx; const p = app.profile;
  const items = claimPactDaily(p);
  if (!items) return;
  commit(p);
  popRewards(app, items, { title: 'Soul Pact tribute' });
}

export function openPact(ctx) {
  const { app } = ctx; const p = app.profile;
  liveModal({ title: 'Soul Pact', cls: 'mm-pact' }, (body) => {
    const active = pactActive(p);
    body.innerHTML = `<div class="pact">
      <div class="pact-emblem">${icon('gems')}</div>
      ${active ? `<div class="pact-state"><span class="pill pill-soul">Active · ${pactDaysLeft(p)} days left</span></div>` : '<div class="pact-state t-dim">A 30-day covenant with the Altar.</div>'}
      ${pactBenefits()}
      ${active
        ? (pactDailyAvailable(p)
          ? '<button class="btn btn-gem btn-lg btn-block" data-act="claim">Claim 100 gems</button>'
          : `<div class="pact-next t-dim">Next tribute in ${cd(nextMidnight(), 0, 'cd-strong')}</div>`)
        : `<button class="btn btn-primary btn-lg btn-block" data-act="buy"><span class="price">${app.store.price('soul_pact')}</span>&nbsp;/ 30 days</button>`}
      <div class="sp-fine t-dim">Not auto-renewing in this demo. Purchases are confirmed on the next step.</div>
    </div>`;
    $(body, '[data-act="claim"]')?.addEventListener('click', () => claimPact(ctx));
    $(body, '[data-act="buy"]')?.addEventListener('click', () => purchaseFlow(app, 'soul_pact'));
  });
}

// ---------------------------------------------------------------- Daily Trial
export function openTrial(ctx) {
  const { app } = ctx; const p = app.profile;
  let busy = false;
  const lm = liveModal({ title: 'Daily Trial', cls: 'mm-trial' }, (body) => {
    const t = trialState(p), ch = CHAPTERS[t.chapter - 1], B = MUTATORS[t.boon], N = MUTATORS[t.bane];
    const mod = (m, kind) => `<div class="tr-mod ${kind}"><span class="tr-ic">${icon(m.icon)}</span><div><small>${kind === 'boon' ? 'Boon' : 'Bane'}</small><b>${m.name}</b><span>${m.desc}</span></div></div>`;
    const rw = [{ kind: 'gems', amount: TRIAL.clear.gems }, { kind: 'passXp', amount: TRIAL.clear.passXp }];
    const toSigil = TRIAL.sigilEvery - (t.clears % TRIAL.sigilEvery);
    body.innerHTML = `<div class="tr">
      <div class="tr-head"><span class="t-label">Chapter ${t.chapter}</span><b class="t-display">${ch.name}</b><small class="t-dim">New trial in ${cd(nextMidnight(), 0, 'cd-strong')}</small></div>
      <div class="tr-mods">${mod(B, 'boon')}${mod(N, 'bane')}</div>
      <div class="tr-rw"><span class="t-label">Clear reward</span><div class="tr-chips">${rw.map((it) => rewardChip(it)).join('')}</div>
        <div class="tr-sig">${rewardChip({ kind: 'sigils', amount: 1 })}<span>${toSigil === 1 ? 'Your next clear also earns a Sigil!' : `A Sigil every ${TRIAL.sigilEvery} clears · ${toSigil} to go`}</span></div>
        <small class="t-dim">Free: no energy. Falling early still pays ${TRIAL.failGemsPerMin} gems a minute (up to ${TRIAL.failGemsMax}). Records and chapter progress are unaffected.</small></div>
      ${t.available ? '<button class="btn btn-primary btn-lg btn-block" data-act="go">Begin trial</button>'
        : t.retry ? `<button class="btn btn-ad btn-lg btn-block" data-act="retry">${icon('ad')} One more attempt</button>`
        : `<div class="tr-done">${icon('check')} Done for today</div>`}
      ${t.clears ? `<div class="tr-count t-dim">Trials cleared: <b>${t.clears}</b></div>` : ''}
    </div>`;
    $(body, '[data-act="go"]')?.addEventListener('click', () => {
      tap(app, 'medium', 'select');
      lm.close();
      if (!app.startRun(0, { trial: true })) toast('The trial could not start');
    });
    $(body, '[data-act="retry"]')?.addEventListener('click', async () => {
      if (busy) return; busy = true;
      try { if (await watchAd(app, 'trial_retry') && grantTrialRetry(p)) commit(p); } finally { busy = false; }
    });
  });
}
