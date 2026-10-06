// In-run HUD + run modals (level up, pause, revive, results).
import './runui.css';
import { h, $, fmt, fmtTime, modal, rewardTile, watchAd, toast } from './dom.js';
import { icon } from './icons.js';
import { SKILLS, EVOLUTIONS, RARITY_COLOR, MUTATORS } from '../game/data.js';
import { doubleRunRewards, commit, spend } from '../meta/economy.js';
import { BOSS_ART } from './art.js';
import { RiteButton } from './riteui.js';
import { StreakHUD, streakRow } from './streakui.js';

export class RunUI {
  constructor(app, run) {
    this.app = app;
    this.run = run;
    run.ui = this;
    this.wantsNova = false;
    this.rerolled = false;
    const color = '#' + run.heroColorObj.getHexString();
    this.el = h(`<div class="hud pass-through ${app.profile.settings.lefty ? 'lefty' : ''}" style="--lc:${color}">
      <div class="hud-top pass-through">
        <div class="hud-row">
          <button class="hud-pause" aria-label="Pause">${icon('pause')}</button>
          <div class="xp"><i></i><b>LV 1</b></div>
        </div>
        <div class="hud-stats">
          <div class="hud-stat k">${icon('skull')}<span>0</span></div>
          <div class="hud-timer"><b>00:00</b><small>${run.chapter.name}</small></div>
          <div class="hud-stat r g">${icon('gold')}<span>0</span></div>
        </div>
        <div class="legion"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${'<path d="M12 3c-3.5 0-6 2.7-6 6v11l2-1.5 2 1.5 2-1.5 2 1.5 2-1.5 2 1.5V9c0-3.3-2.5-6-6-6z"/><path d="M9.6 9.8h.01M14.4 9.8h.01" stroke-width="3"/>'}</svg>
          <div><div class="lbl">LEGION</div><div><span class="num">0</span> <span class="cap">/ 30</span></div></div></div>
        <div class="bossbar" hidden><div class="nm"></div><div class="bar"><i></i><span class="ticks"></span><em class="ward"></em></div></div>
      </div>
      <div class="hud-skills"></div>
      <button class="nova" aria-label="Soul Nova">
        <svg class="ring" viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="46"/><circle class="fg" cx="50" cy="50" r="46"/></svg>
        <div class="core">${icon('nova')}<b>NOVA</b></div>
      </button>
    </div>`);
    document.getElementById('ui').appendChild(this.el);
    this.streak = new StreakHUD(this.el);
    this.q = {
      xp: $(this.el, '.xp i'), lv: $(this.el, '.xp b'), kills: $(this.el, '.k span'), gold: $(this.el, '.g span'),
      timer: $(this.el, '.hud-timer b'), timerSub: $(this.el, '.hud-timer small'), legion: $(this.el, '.legion'), num: $(this.el, '.legion .num'), cap: $(this.el, '.legion .cap'),
      boss: $(this.el, '.bossbar'), bossName: $(this.el, '.bossbar .nm'), bossHp: $(this.el, '.bossbar .bar i'), bossTicks: $(this.el, '.bossbar .ticks'), bossWard: $(this.el, '.bossbar .ward'), skills: $(this.el, '.hud-skills'),
      nova: $(this.el, '.nova'), novaFg: $(this.el, '.nova .fg'),
    };
    $(this.el, '.hud-pause').addEventListener('click', () => { app.audio.sfx('click'); run.pause(true); });
    this.q.nova.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.wantsNova = true; });
    this.wantsRite = false;
    this.rite = new RiteButton(this, run); // the hero's Rite, above-left of NOVA
    this.last = {};
    this.acc = 0;
    this.skillKey = '';
  }

  set(key, val, fn) { if (this.last[key] !== val) { this.last[key] = val; fn(val); } }

  update(run, dt) {
    this.acc += dt;
    if (this.acc < 1 / 20) return;
    this.acc = 0;
    const q = this.q;
    this.set('xp', Math.round((run.xp / run.xpNeed) * 200), (v) => { q.xp.style.transform = `scaleX(${v / 200})`; });
    this.set('lv', run.level, (v) => { q.lv.textContent = 'LV ' + v; });
    this.set('kills', run.counters.kills, (v) => { q.kills.textContent = fmt(v); });
    const gold = Math.round(run.counters.kills * 0.9 * run.loadout.goldMul + run.bonusGold);
    this.set('gold', gold, (v) => { q.gold.textContent = fmt(v); });
    const tsec = Math.floor(run.time);
    this.set('time', tsec, () => {
      if (run.bossSpawned) { q.timer.textContent = fmtTime(run.time); q.timerSub.textContent = run.endless ? `Abyss depth ${run.bossKills + 1} · Boss` : 'Boss fight'; }
      else {
        const left = Math.max(0, run.nextBossAt - run.time);
        q.timer.textContent = fmtTime(run.time);
        q.timerSub.textContent = left < 60 ? `Boss in ${Math.ceil(left)}s` : run.chapter.name;
      }
    });
    const n = run.legion.count;
    this.set('legion', n, (v) => {
      q.num.textContent = v;
      q.legion.classList.remove('pop'); void q.legion.offsetWidth; q.legion.classList.add('pop');
    });
    this.set('cap', run.stats.cap, (v) => { q.cap.textContent = '/ ' + v; });
    this.set('over', n > run.stats.cap, (v) => q.legion.classList.toggle('over', v)); // overflow souls are fading
    this.streak.update(run, run.t);
    this.set('nova', Math.round(run.nova * 100), (v) => {
      q.novaFg.style.strokeDashoffset = String(289 * (1 - v / 100));
      q.nova.classList.toggle('ready', v >= 100);
    });
    this.rite.update(run);
    if (run.events) this.buffs(run.events);
    const key = JSON.stringify(run.skillLv) + JSON.stringify(run.evolved);
    if (key !== this.skillKey) {
      this.skillKey = key;
      q.skills.innerHTML = Object.entries(run.skillLv).filter(([id]) => SKILLS[id].type === 'weapon').map(([id, lv]) => {
        const evo = Object.entries(EVOLUTIONS).find(([eid, e]) => e.from === id && run.evolved[eid]);
        return `<div class="hud-skill ${evo ? 'evo' : ''}" style="--rc:${evo ? '' : '#4ef2ff'}">${icon(SKILLS[id].icon)}<small>${evo ? '★' : lv}</small></div>`;
      }).join('');
    }
  }

  /** Shrine blessing chips under the legion counter: icon, name and a draining timer (events.js owns the list). */
  buffs(ev) {
    if (ev.buffKey !== (this.buffKey || '')) {
      this.buffKey = ev.buffKey;
      if (!this.buffEl) { this.buffEl = h('<div class="hud-buffs"></div>'); $(this.el, '.hud-top').appendChild(this.buffEl); }
      this.buffEl.innerHTML = ev.buffs.map((b) => `<div class="buff">${icon(b.icon)}<b>${b.name}</b><small></small><i></i></div>`).join('');
    }
    if (!this.buffEl) return;
    const chips = this.buffEl.children;
    for (let i = 0; i < ev.buffs.length && i < chips.length; i++) {
      const b = ev.buffs[i], c = chips[i], s = String(Math.ceil(b.left));
      if (c.dataset.s !== s) { c.dataset.s = s; c.children[2].textContent = s + 's'; }
      c.lastElementChild.style.transform = `scaleX(${(b.left / b.dur).toFixed(3)})`;
    }
  }

  // ---------------------------------------------------------------- transient messages
  banner(title, sub = '', kind = 'soul') {
    if (this.bannerEl) this.bannerEl.remove();
    const art = kind === 'boss' ? `<i class="banner-art" style="background-image:url(${BOSS_ART})"></i>` : '';
    const el = h(`<div class="banner ${kind}">${art}<b>${title}</b>${sub ? `<span>${sub}</span>` : ''}</div>`);
    this.el.appendChild(el);
    this.bannerEl = el;
    setTimeout(() => el.classList.add('out'), 2200);
    setTimeout(() => el.remove(), 2800);
  }

  bigNumber(text, sub, good) {
    if (this.bigEl) this.bigEl.remove();
    const el = h(`<div class="bignum ${good ? 'good' : 'bad'}"><b>${text}</b><span>${sub}</span></div>`);
    this.el.appendChild(el);
    this.bigEl = el;
    setTimeout(() => el.classList.add('out'), 1300);
    setTimeout(() => el.remove(), 1800);
  }

  hint(text) {
    if (this.hintEl) this.hintEl.remove();
    const el = h(`<div class="hint">${text}</div>`);
    this.el.appendChild(el);
    this.hintEl = el;
    setTimeout(() => el.classList.add('out'), 4600);
    setTimeout(() => el.remove(), 5100);
  }

  /** ticks: HP fractions where the boss changes phase. */
  bossBar(show, name, ticks) {
    this.q.boss.hidden = !show;
    if (name) this.q.bossName.textContent = name.toUpperCase();
    this.q.bossHp.style.transform = 'scaleX(1)';
    if (ticks) this.q.bossTicks.innerHTML = ticks.map((f) => `<b style="left:${f * 100}%"></b>`).join('');
  }
  bossHp(f) { this.q.bossHp.style.transform = `scaleX(${f})`; }
  bossImmune(on) { this.q.boss.classList.toggle('immune', !!on); }
  /** Seconds left on the King's phase ward (0 hides it). */
  bossWard(sec) {
    const s = sec > 0 ? Math.ceil(sec) : 0;
    if (s === this.wardS) return;
    this.wardS = s;
    this.q.bossWard.textContent = s ? `WARD ${s}` : '';
  }

  // ---------------------------------------------------------------- level up
  /** shrine: a Shrine of Souls blessing pick (events.js): its own title, no reroll. */
  showLevelUp(choices, level, onPick, { chest = false, shrine = false } = {}) {
    const back = h(`<div class="lvl-back ${chest ? 'chest' : ''} ${shrine ? 'shrine' : ''}">
      <div class="lvl-title">${shrine ? '<b>SHRINE OF SOULS</b><span>Accept one blessing</span>' : chest ? '<b>RELIC CHEST</b><span>Claim one treasure</span>' : `<b>LEVEL ${level}</b><span>Choose a power</span>`}</div>
      <div class="cards"></div>
      <div class="lvl-actions"></div>
    </div>`);
    const cards = $(back, '.cards');
    let picked = false, shownT = 0;
    const render = (list) => {
      shownT = this.run.t; // run time keeps ticking while paused: ignore taps in the first 0.3 s (stray swipes)
      cards.innerHTML = '';
      list.forEach((c, i) => {
        const evo = c.kind === 'evolution';
        const rc = evo ? RARITY_COLOR.legendary : RARITY_COLOR[c.rarity] || RARITY_COLOR.common;
        const pips = c.max ? Array.from({ length: c.max }, (_, k) => `<i class="${k < c.level - 1 ? 'on' : k === c.level - 1 ? 'next' : ''}"></i>`).join('') : '';
        const tag = evo ? '<span class="pill pill-gold">Evolution</span>' : c.isNew ? '<span class="pill pill-soul">New</span>' : c.kind === 'weapon' || c.kind === 'passive' ? `<span class="pill">Lv ${c.level}</span>` : c.tag ? `<span class="pill pill-soul">${c.tag}</span>` : '';
        const card = h(`<button class="card ${evo ? 'evo' : ''}" style="--rc:${rc}; animation-delay:${i * 70}ms">
          <div class="ic">${icon(c.icon)}</div>
          <div><h3>${c.name} ${tag}</h3><p>${c.desc}</p>${pips ? `<div class="pips">${pips}</div>` : ''}</div></button>`);
        card.addEventListener('click', () => {
          if (picked || this.run.t - shownT < 0.3) return;
          picked = true;
          this.app.haptic('light');
          back.remove();
          onPick(c);
        });
        cards.appendChild(card);
      });
    };
    render(choices);
    const actions = $(back, '.lvl-actions');
    if (!this.rerolled && !shrine) {
      const rr = h(`<button class="btn btn-ad btn-sm">${icon('ad')} Reroll</button>`);
      rr.addEventListener('click', async () => {
        const ok = await watchAd(this.app, 'reroll');
        if (!ok || picked) return;
        this.rerolled = true;
        rr.remove();
        const { rollChoices } = await import('../game/skills.js');
        render(rollChoices(this.run, 3));
      });
      actions.appendChild(rr);
    }
    this.el.appendChild(back);
  }

  /** The run's weapons as tiles; evolved ones show their evolution in gold. */
  buildTiles() {
    const run = this.run;
    return Object.entries(run.skillLv).filter(([id]) => SKILLS[id].type === 'weapon').map(([id, lv]) => {
      const evo = Object.entries(EVOLUTIONS).find(([eid, e]) => e.from === id && run.evolved[eid]);
      return `<span class="res-w ${evo ? 'evo' : ''}">${icon(SKILLS[id].icon)}<b>${evo ? evo[1].name : SKILLS[id].name}</b><small>${evo ? '★ Evolved' : 'Lv ' + lv}</small></span>`;
    }).join('');
  }

  // ---------------------------------------------------------------- pause
  showPause() {
    const app = this.app, run = this.run, s = app.profile.settings;
    const build = Object.entries(run.skillLv).map(([id, lv]) => {
      const evo = Object.entries(EVOLUTIONS).find(([eid, e]) => e.from === id && run.evolved[eid]);
      return evo ? `<span class="pill pill-gold">★ ${evo[1].name}</span>` : `<span class="pill">${SKILLS[id].name} ${lv}</span>`;
    }).join(' ');
    modal({
      title: 'Paused',
      dismissable: false,
      body: `<div style="display:flex;flex-direction:column;gap:10px">
        <div class="res-stats"><div><b>${fmtTime(run.time)}</b><small>Time</small></div><div><b>${fmt(run.counters.kills)}</b><small>Kills</small></div><div><b>${run.legion.count}</b><small>Legion</small></div></div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;justify-content:center">${build}</div>
        ${run.trial ? `<div style="display:flex;flex-wrap:wrap;gap:4px;justify-content:center">${run.mut.ids.map((id) => `<span class="pill ${MUTATORS[id].kind === 'boon' ? 'pill-soul' : 'pill-hot'}">${MUTATORS[id].name}</span>`).join(' ')}</div>` : ''}
      </div>`,
      actions: [
        { label: 'Resume', cls: 'btn-primary btn-lg', onClick: () => { app.audio.sfx('click'); run.pause(false); } },
        { label: s.muted ? 'Sound: Off' : 'Sound: On', cls: 'btn-ghost', onClick: (close) => {
          s.muted = !s.muted; app.applySettings();
          const b = document.querySelectorAll('.modal .modal-actions .btn')[1];
          if (b) b.textContent = s.muted ? 'Sound: Off' : 'Sound: On';
          return false;
        } },
        { label: 'Abandon run', cls: 'btn-danger', onClick: () => { run.paused = false; run.end(false); } },
      ],
    });
  }

  // ---------------------------------------------------------------- revive
  showRevive({ canRevive, gemCost }, cb) {
    const app = this.app, p = app.profile;
    let left = 10, done = false;
    const body = h(`<div class="rev">
      <div class="ring"><svg viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="46"/><circle class="fg" cx="50" cy="50" r="46"/></svg><b>${left}</b></div>
      <p>${canRevive ? 'Rise again with full health and a soul blast.' : 'Your Shepherd has fallen.'}</p></div>`);
    const fg = $(body, '.fg'), num = $(body, 'b');
    let iv = 0, adOpen = false;
    const finish = (choice, close) => { if (done) return; done = true; clearInterval(iv); close && close(); cb(choice); };
    const actions = [];
    if (canRevive) {
      actions.push({ label: `${icon('ad')} Revive free`, cls: 'btn-ad btn-lg', onClick: (close) => {
        if (adOpen) return false;
        adOpen = true; // the countdown waits while the ad plays
        watchAd(app, 'revive').then((ok) => { adOpen = false; if (ok) finish('revive', close); });
        return false;
      } });
      actions.push({ label: `Revive · ${icon('gems')} ${gemCost}`, cls: 'btn-gem', onClick: (close) => {
        if (!spend(p, 'gems', gemCost)) { toast('Not enough gems'); return false; }
        commit(p); app.audio.sfx('purchase');
        finish('revive', close);
        return false;
      } });
    }
    actions.push({ label: 'Give up', cls: 'btn-ghost', onClick: (close) => { finish('end', close); return false; } });
    const m = modal({ title: 'You have fallen', body, actions, dismissable: false });
    iv = setInterval(() => {
      if (adOpen || document.hidden) return;
      left -= 1;
      num.textContent = Math.max(0, left);
      fg.style.strokeDashoffset = String(289 * (1 - left / 10));
      if (left <= 0) finish('end', m.close);
    }, 1000);
    if (!canRevive) { clearInterval(iv); num.textContent = '✕'; }
  }

  // ---------------------------------------------------------------- results
  showResults(result, outcome) {
    const app = this.app, p = app.profile;
    const win = result.victory;
    let doubled = false;
    const items = outcome.items.slice();
    const body = h(`<div style="display:flex;flex-direction:column;gap:10px">
      <div class="res-head ${win || result.endless ? 'win' : 'lose'}"><b>${result.endless ? 'ABYSS DEPTH ' + (result.bossKills + 1) : win ? 'VICTORY' : 'DEFEAT'}</b><span>${result.endless ? `Endless Abyss · ${result.bossKills} Gravemaw slain` : `Chapter ${result.chapter} · ${this.run.chapter.name}`}</span></div>
      <div class="res-badges">${result.bloodMoon ? '<span class="pill pill-hot">Blood Moon ×2</span>' : ''}${outcome.firstClear ? '<span class="pill pill-gold">First clear</span>' : ''}${outcome.newBest ? '<span class="pill pill-soul">New best</span>' : ''}${outcome.levelUps ? `<span class="pill pill-hot">Account level ${p.level}</span>` : ''}</div>
      <div class="res-stats">
        <div><b>${fmtTime(result.time)}</b><small>Survived</small></div>
        <div><b>${fmt(result.kills)}</b><small>Kills</small></div>
        <div><b>${result.bestLegion}</b><small>Peak legion</small></div>
        <div><b>${fmt(result.raised)}</b><small>Raised</small></div>
        <div><b>${result.level}</b><small>Level</small></div>
        <div><b>${result.gates}</b><small>Gates</small></div>
      </div>
      ${streakRow(result, outcome, p)}
      <div class="res-build">${this.buildTiles()}</div>
      <div class="res-sub">Rewards</div>
      <div class="rw-grid res-rw">${items.map((it, i) => rewardTile(it, i)).join('')}</div>
      ${result.endless ? '<div class="res-tip">Gravemaw returns every 5:00, stronger each time. How deep can your legion go?</div>' : !win ? '<div class="res-tip">Tip: Talents and Relics make every run stronger. Gravemaw waits at 6:00.</div>' : ''}
    </div>`);
    const actions = [];
    if (outcome.rewards.gold > 0) {
      actions.push({ label: `${icon('ad')} Double rewards`, cls: 'btn-ad btn-lg', onClick: () => {
        if (doubled) return false;
        watchAd(app, 'double').then((ok) => {
          if (!ok) return;
          doubled = true;
          const extra = doubleRunRewards(p, outcome.rewards);
          commit(p);
          app.audio.sfx('coin');
          const grid = body.querySelector('.res-rw');
          grid.innerHTML = extra.concat(items).map((it, i) => rewardTile(it, i)).join('');
          const btn = document.querySelector('.modal .btn-ad');
          if (btn) btn.remove();
        });
        return false;
      } });
    }
    actions.push({ label: 'Continue', cls: 'btn-primary btn-lg', onClick: () => { app.audio.sfx('click'); app.exitRun(); } });
    setTimeout(() => {
      app.audio.sfx(win ? 'chest' : 'click');
      modal({ body, actions, dismissable: false, cls: 'modal-results' });
    }, win ? 200 : 600);
  }

  dispose() {
    this.el.remove();
    document.querySelectorAll('.lvl-back, .modal-back').forEach((n) => n.remove());
  }
}
