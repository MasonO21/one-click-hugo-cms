// In-run HUD + run modals (level up, pause, revive, results).
import './runui.css';
import { h, $, fmt, fmtTime, modal, rewardTile, watchAd, toast } from './dom.js';
import { icon } from './icons.js';
import { SKILLS, EVOLUTIONS, UNIONS, RARITY_COLOR, MUTATORS, DIFFICULTY, BOSSES, CHAPTERS, bossFor, BOSS_RUSH, BOSS_ORDER, REROLL, HEROES, MASTERY, RITES, ENDLESS, ACTS, CAMPAIGN_LENGTH } from '../game/data.js';
import { doubleRunRewards, commit, spend } from '../meta/economy.js';
import { BOSS_ART, chapterArt, skillArt } from './art.js';
import { RiteButton } from './riteui.js';
import { StreakHUD, streakRow } from './streakui.js';
import { showRunIntro } from './runintro.js';
import { CoachUI } from './coachui.js';
import { openShare } from './sharecard.js';

/** Nightmare / Torment pill with its gold multiplier (empty on Normal). */
const diffPill = (id) => { const D = DIFFICULTY[id]; return D && id !== 'normal' ? `<span class="pill pill-diff" style="--dc:${D.css}">${D.name} · ×${D.gold} gold</span>` : ''; };

/** Hero Mastery on the results screen (meta/mastery.js): the hero's rank, the XP this run gave, and any rank-ups with
 *  their perks and rewards (granted apart from the run's own rewards, so the ad double never doubles them). */
function masteryRow(m) {
  if (!m || !HEROES[m.hero]) return '';
  const hero = HEROES[m.hero], pct = m.max ? 100 : Math.round((m.into / m.need) * 100), R = RITES[m.hero];
  const ups = m.ranks.map((r) => `<div class="rm-up"><b>Rank ${r}</b><span>${MASTERY.ranks[r].text}${r === 5 && R && R.ascDesc ? `: ${R.ascDesc}` : ''}</span></div>`).join('');
  return `<div class="res-mast ${m.ranks.length ? 'is-up' : ''}" style="--hc:${hero.css}">
    <span class="rm-badge tnum">${m.to}</span>
    <div class="rm-main">
      <div class="rm-top"><b>${hero.name} · Mastery ${m.to}${m.max ? ' (max)' : ''}</b><span class="tnum">+${fmt(m.gained)} XP</span></div>
      <div class="mbar rm-bar"><i style="width:${pct}%"></i></div>
      <small class="t-dim">${m.max ? 'Mastered: the Soulbound aura is yours' : `${fmt(m.into)} / ${fmt(m.need)} XP to rank ${m.to + 1}: ${MASTERY.ranks[m.to + 1].text}`}</small>
      ${ups}
      ${m.items && m.items.length ? `<div class="rw-grid rm-rw">${m.items.map((it, i) => rewardTile(it, i)).join('')}</div>` : ''}
    </div>
  </div>`;
}

/** A first Normal clear that ends an act opens the next one (and Chapter 5 the Endless Abyss): say so on the results. */
function actTip(result, outcome) {
  const ch = +result.chapter;
  if (!outcome.firstClear || outcome.difficulty !== 'normal' || result.trial || ch % 5) return '';
  if (ch >= CAMPAIGN_LENGTH) return `<div class="res-tip res-act">The Hollow Moon is broken and the campaign is won, Shepherd. Nightmare and Torment wait on every chapter, and the Endless Abyss has no floor.</div>`;
  const A = ACTS[ch / 5];
  return `<div class="res-tip res-act" style="--ac:${A.css}">Act ${['', 'I', 'II', 'III', 'IV', 'V', 'VI'][A.n]} is open: <b>${A.name}</b>.${ch === 5 ? ' The Endless Abyss is open too.' : ''}</div>`;
}

export class RunUI {
  constructor(app, run) {
    this.app = app;
    this.run = run;
    run.ui = this;
    this.wantsNova = false;
    this.rerolls = 0; // level-up rerolls bought this run (gems or ads)
    const color = '#' + run.heroColorObj.getHexString();
    this.el = h(`<div class="hud pass-through ${app.profile.settings.lefty ? 'lefty' : ''}" style="--lc:${color}">
      <div class="hud-top pass-through">
        <div class="hud-row">
          <button class="hud-pause" aria-label="Pause">${icon('pause')}</button>
          <div class="xp"><i></i><b>LV 1</b></div>
        </div>
        <div class="hud-stats">
          <div class="hud-stat k">${icon('skull')}<span>0</span></div>
          <div class="hud-timer"><b>00:00</b><small>${run.rush ? run.court.name : run.chapter.name}</small>${run.diff.id !== 'normal' ? `<em class="hud-diff" style="--dc:${run.diff.css}">${run.diff.name}</em>` : ''}</div>
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
    this.intro = showRunIntro(this.el, run, !!app.profile.settings.reduceFlash); // the chapter title card (replaces the chapter banner)
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
    this.coach = run.guide ? new CoachUI(this, run) : null; // the beginner tutorial's coach
    this.last = {};
    this.acc = 0;
    this.skillKey = '';
  }

  set(key, val, fn) { if (this.last[key] !== val) { this.last[key] = val; fn(val); } }

  update(run, dt) {
    this.acc += dt;
    if (this.coach) this.coach.frame(run);
    if (this.acc < 1 / 20) return;
    const step = this.acc;
    this.acc = 0;
    if (this.coach) this.coach.update(run, step);
    const q = this.q;
    this.set('xp', Math.round((run.xp / run.xpNeed) * 200), (v) => { q.xp.style.transform = `scaleX(${v / 200})`; });
    this.set('lv', run.level, (v) => { q.lv.textContent = 'LV ' + v; });
    this.set('kills', run.counters.kills, (v) => { q.kills.textContent = fmt(v); });
    const gold = Math.round(run.counters.kills * 0.9 * run.loadout.goldMul + run.bonusGold);
    this.set('gold', gold, (v) => { q.gold.textContent = fmt(v); });
    const tsec = Math.floor(run.time);
    this.set('time', tsec, () => {
      if (run.rush) { q.timer.textContent = fmtTime(run.time); q.timerSub.textContent = `Boss ${Math.min(run.court.bosses.length, run.bossKills + 1)} of ${run.court.bosses.length}`; } // Boss Rush: the clock is the score
      else if (run.bossSpawned) { q.timer.textContent = fmtTime(run.time); q.timerSub.textContent = run.endless ? `Abyss depth ${run.bossKills + 1} · Boss` : 'Boss fight'; }
      else {
        const left = Math.max(0, run.nextBossAt - run.time);
        q.timer.textContent = fmtTime(run.time);
        q.timerSub.textContent = run.guide ? 'Training' : left < 60 ? `Boss in ${Math.ceil(left)}s` : run.chapter.name;
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
    this.set('nova', Math.floor(run.nova * 100), (v) => { // floor: never "ready" a kill short of a charge that can fire
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
    const art = kind === 'boss' ? `<i class="banner-art" style="background-image:url(${BOSS_ART[this.run.bossId] || BOSS_ART.gravemaw})"></i>` : '';
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
    if (this.coach) { this.coach.note(text); return; } // the tutorial: one place to read
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
  /** The boss bar and boss banners take the boss's colour (BOSSES[id].color). */
  bossColor(hex) {
    const c = (k, w) => { const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255, m = (v) => Math.round(Math.min(255, v * k + 255 * w)); return `rgb(${m(r)},${m(g)},${m(b)})`; };
    const st = this.el.style;
    st.setProperty('--bc', c(1, 0)); st.setProperty('--bc-lt', c(0.35, 0.65)); st.setProperty('--bc-dk', c(0.55, 0)); st.setProperty('--bc-xdk', c(0.22, 0));
  }
  bossImmune(on) { this.q.boss.classList.toggle('immune', !!on); }
  /** Seconds left on the boss's phase ward (0 hides it). */
  bossWard(sec) {
    const s = sec > 0 ? Math.ceil(sec) : 0;
    if (s === this.wardS) return;
    this.wardS = s;
    this.q.bossWard.textContent = s ? `WARD ${s}` : '';
  }

  // ---------------------------------------------------------------- level up
  /** shrine: a Shrine of Souls blessing pick (events.js): its own title, no reroll. */
  showLevelUp(choices, level, onPick, { chest = false, shrine = false, draft = null } = {}) {
    const back = h(`<div class="lvl-back ${chest ? 'chest' : ''} ${shrine ? 'shrine' : ''}">
      <div class="lvl-title">${shrine ? '<b>SHRINE OF SOULS</b><span>Accept one blessing</span>' : draft ? `<b>WAR COUNCIL</b><span>Arm yourself for the Court · ${draft[0]} of ${draft[1]}</span>` : chest ? '<b>RELIC CHEST</b><span>Claim one treasure</span>' : `<b>LEVEL ${level}</b><span>Choose a power</span>`}</div>
      ${this.coach && !shrine ? ((t) => (t ? `<div class="co-card">${t}</div>` : ''))(this.coach.cardLine(chest)) : ''}
      <div class="cards"></div>
      <div class="lvl-ban"></div>
      <div class="lvl-actions"></div>
    </div>`);
    const cards = $(back, '.cards');
    let picked = false, shownT = 0, current = choices;
    const render = (list) => {
      current = list;
      shownT = this.run.t; // run time keeps ticking while paused: ignore taps in the first 0.3 s (stray swipes)
      cards.innerHTML = '';
      const banOk = !shrine && this.run.banishLeft > 0; // Banish: the ✕ strikes a skill from this run's draws
      list.forEach((c, i) => {
        const evo = c.kind === 'evolution' || c.kind === 'union', union = c.kind === 'union';
        const rc = evo ? RARITY_COLOR.legendary : RARITY_COLOR[c.rarity] || RARITY_COLOR.common;
        const pips = c.max ? Array.from({ length: c.max }, (_, k) => `<i class="${k < c.level - 1 ? 'on' : k === c.level - 1 ? 'next' : ''}"></i>`).join('') : '';
        const tag = union ? '<span class="pill pill-union">Soul Union</span>' : evo ? '<span class="pill pill-gold">Evolution</span>' : c.isNew ? '<span class="pill pill-soul">New</span>' : c.kind === 'weapon' || c.kind === 'passive' ? `<span class="pill">Lv ${c.level}</span>` : c.tag ? `<span class="pill pill-soul">${c.tag}</span>` : '';
        const canBan = banOk && (c.kind === 'weapon' || c.kind === 'passive');
        const card = h(`<button class="card ${evo ? 'evo' : ''} ${union ? 'union' : ''} ${canBan ? 'bannable' : ''}" style="--rc:${rc}; animation-delay:${i * 70}ms">
          <div class="ic">${skillArt(c.id, c.icon)}</div>
          <div><h3>${c.name} ${tag}</h3><p>${c.desc}</p>${pips ? `<div class="pips">${pips}</div>` : ''}</div>
          ${canBan ? `<span class="ban" role="button" tabindex="0" aria-label="Banish ${c.name}">${icon('close')}</span>` : ''}</button>`);
        const ban = card.querySelector('.ban');
        if (ban) ban.addEventListener('click', async (ev) => {
          ev.stopPropagation(); // (not a pick)
          if (picked || this.run.t - shownT < 0.3) return;
          const { banish } = await import('../game/skills.js');
          if (picked || !current.includes(c)) return;
          const next = banish(this.run, c, current.filter((o) => o !== c));
          if (!next) return;
          this.app.audio.sfx('click', { pitch: 0.7 });
          this.app.haptic('light');
          render(current.map((o) => (o === c ? next : o)));
        });
        card.addEventListener('click', () => {
          if (picked || this.run.t - shownT < 0.3) return;
          picked = true;
          this.app.haptic('light');
          back.remove();
          onPick(c);
        });
        cards.appendChild(card);
      });
      const note = $(back, '.lvl-ban');
      if (note) note.textContent = banOk && list.some((c) => c.kind === 'weapon' || c.kind === 'passive') ? `✕ Banish a skill from this run · ${this.run.banishLeft} left` : '';
    };
    render(choices);
    const actions = $(back, '.lvl-actions');
    if (!shrine) {
      // Reroll as often as wanted: each one costs REROLL.gems Soul Gems or one rewarded ad
      const p = this.app.profile;
      const gem = h(`<button class="btn btn-gem btn-sm btn-reroll">${icon('refresh')} Reroll · ${icon('gems')} <b class="tnum">${REROLL.gems}</b></button>`);
      const ad = h(`<button class="btn btn-ad btn-sm btn-reroll">${icon('ad')} Reroll</button>`);
      let rolling = false;
      const redraw = async () => {
        this.rerolls++;
        const { rollChoices } = await import('../game/skills.js');
        if (!picked) render(rollChoices(this.run, 3));
      };
      const mark = () => gem.classList.toggle('is-short', (p.gems || 0) < REROLL.gems);
      gem.addEventListener('click', async () => {
        if (rolling || picked) return;
        if (!spend(p, 'gems', REROLL.gems)) { toast(`Not enough gems: a reroll costs ${REROLL.gems}`); return; }
        rolling = true; // one payment, one reroll, however fast the taps
        commit(p); this.app.audio.sfx('purchase'); this.app.haptic('light');
        try { await redraw(); } finally { rolling = false; mark(); }
      });
      ad.addEventListener('click', async () => {
        if (rolling || picked) return;
        rolling = true; // one ad, one reroll, however fast the taps
        try { if (await watchAd(this.app, 'reroll') && !picked) await redraw(); } finally { rolling = false; }
      });
      mark();
      actions.append(gem, ad);
    }
    this.el.appendChild(back);
  }

  /** The run's weapons as tiles; evolved ones show their evolution in gold. */
  buildTiles() {
    const run = this.run;
    return Object.entries(run.skillLv).filter(([id]) => SKILLS[id].type === 'weapon').map(([id, lv]) => {
      const evo = Object.entries(EVOLUTIONS).find(([eid, e]) => e.from === id && run.evolved[eid]);
      return `<span class="res-w ${evo ? 'evo' : ''}">${skillArt(evo ? evo[0] : id, SKILLS[id].icon)}<b>${evo ? evo[1].name : SKILLS[id].name}</b><small>${evo ? '★ Evolved' : 'Lv ' + lv}</small></span>`;
    }).join('') + Object.keys(run.unions || {}).map((id) => `<span class="res-w evo union">${skillArt(id, UNIONS[id].icon)}<b>${UNIONS[id].name}</b><small>✦ Soul Union</small></span>`).join('');
  }

  // ---------------------------------------------------------------- pause
  showPause() {
    const app = this.app, run = this.run, s = app.profile.settings;
    const build = Object.entries(run.skillLv).map(([id, lv]) => {
      const evo = Object.entries(EVOLUTIONS).find(([eid, e]) => e.from === id && run.evolved[eid]);
      return evo ? `<span class="pill pill-gold">★ ${evo[1].name}</span>` : `<span class="pill">${SKILLS[id].name} ${lv}</span>`;
    }).join(' ') + Object.keys(run.unions || {}).map((id) => ` <span class="pill pill-union">✦ ${UNIONS[id].name}</span>`).join('');
    modal({
      title: 'Paused',
      dismissable: false, cls: 'modal-pause',
      body: `<div style="display:flex;flex-direction:column;gap:10px">
        <div class="res-stats"><div><b>${fmtTime(run.time)}</b><small>Time</small></div><div><b>${fmt(run.counters.kills)}</b><small>Kills</small></div><div><b>${run.legion.count}</b><small>Legion</small></div></div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;justify-content:center">${build}</div>
        ${run.diff.id !== 'normal' ? `<div style="display:flex;justify-content:center">${diffPill(run.diff.id)}</div>` : ''}
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
        { label: 'Abandon run', cls: 'btn-danger', onClick: () => { run.paused = false; run.end(run.bossDead && !run.endless); } }, // the boss already fell: leaving during the victory beat still wins the chapter
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
    this.cancelRevive = () => { done = true; clearInterval(iv); }; // exitRun: no countdown or late ad may end or revive the run
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
    const m = modal({ title: 'You have fallen', body, actions, dismissable: false, cls: 'modal-revive' });
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
    const win = result.victory, tut = !!result.tutorial, rush = !!result.rush, nB = this.run.court.bosses.length;
    let doubled = false, adOpen = false;
    const items = outcome.items.slice();
    const body = h(`<div style="display:flex;flex-direction:column;gap:10px">
      <div class="res-head has-art ${win || result.endless ? 'win' : 'lose'}" style="--art:url(${chapterArt(rush ? ENDLESS : this.run.chapter)})"><b>${rush ? (win ? 'COURT CLEARED' : 'FALLEN') : tut ? (win ? 'TRAINING COMPLETE' : 'TRAINING ENDED') : result.endless ? 'ABYSS DEPTH ' + (result.bossKills + 1) : win ? 'VICTORY' : 'DEFEAT'}</b><span>${rush ? `Boss Rush · ${result.bossKills} of ${nB} bosses` : tut ? 'The Waking · Tutorial' : result.endless ? `Endless Abyss · ${result.bossKills} ${result.bossKills === 1 ? 'boss' : 'bosses'} slain` : `Chapter ${result.chapter} · ${this.run.chapter.name}`}</span></div>
      <div class="res-badges">${diffPill(result.difficulty)}${result.bloodMoon ? '<span class="pill pill-hot">Blood Moon ×2</span>' : ''}${outcome.firstClear ? '<span class="pill pill-gold">First clear</span>' : ''}${outcome.newBest ? '<span class="pill pill-soul">New best</span>' : ''}${outcome.levelUps ? `<span class="pill pill-hot">Account level ${p.level}</span>` : ''}</div>
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
      ${outcome.practice ? '<div class="res-tip">Practice run: training pays its rewards only the first time.</div>'
        : outcome.ended ? '<div class="res-tip">Training ended. Replay it any time from Settings; finishing it pays 500 gold and 30 gems.</div>' : `<div class="res-sub">Rewards</div>
      <div class="rw-grid res-rw">${items.map((it, i) => rewardTile(it, i)).join('')}</div>`}
      ${masteryRow(outcome.mastery)}
      ${rush ? (outcome.milestones && outcome.milestones.length ? `<div class="res-tip">Event reward${outcome.milestones.length > 1 ? 's' : ''} unlocked: ${outcome.milestones.map((i) => (i + 1 === nB ? 'the Court cleared' : `${i + 1} ${i ? 'bosses' : 'boss'} beaten`)).join(', ')}.</div>` : win ? '' : '<div class="res-tip">Each boss beaten in one attempt unlocks an event reward. Talents, relics and a stronger hero carry you further.</div>')
        : tut ? `<div class="res-tip">You are ready, Shepherd. Spend your gold on <b>Talents</b>, then take on Chapter 1: survive 6:00 and slay ${BOSSES[bossFor(CHAPTERS[0])].name}.</div>`
        : result.endless ? '<div class="res-tip">A chapter boss rises every 5:00, all ten in turn, stronger each time. How deep can your legion go?</div>'
        : !win ? `<div class="res-tip">Tip: Talents and Relics make every run stronger. ${BOSSES[bossFor(this.run.chapter)].name} waits at 6:00.</div>`
        : actTip(result, outcome)}
    </div>`);
    if (outcome.mastery && outcome.mastery.ranks.length) setTimeout(() => app.audio.sfx('levelup'), 650); // a Hero Mastery rank-up
    const actions = [];
    if (outcome.rewards.gold > 0 && !tut && !rush) { // rewarded ads start after the tutorial (GDD §16); event rewards are not doubled
      actions.push({ label: `${icon('ad')} Double rewards`, cls: 'btn-ad btn-lg', onClick: () => {
        if (doubled || adOpen) return false;
        adOpen = true; // a second tap while the ad loads must not pay twice
        watchAd(app, 'double').then((ok) => {
          adOpen = false;
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
    if (!tut) actions.push({ label: `${icon('share')} Share`, cls: 'btn-ghost btn-share', onClick: () => { app.audio.sfx('click'); openShare(app, this.run, result); return false; } }); // the share card (sharecard.js)
    actions.push({ label: 'Continue', cls: 'btn-primary btn-lg', onClick: () => { app.audio.sfx('click'); app.exitRun(); } });
    setTimeout(() => {
      if (!this.el.isConnected) return; // exited before it showed: no results over the menu
      app.audio.sfx(win ? 'chest' : 'click');
      modal({ body, actions, dismissable: false, cls: 'modal-results' });
    }, win ? 200 : 600);
  }

  dispose() {
    if (this.cancelRevive) this.cancelRevive();
    this.el.remove();
    document.querySelectorAll('.lvl-back, .modal-back').forEach((n) => n.remove());
  }
}
