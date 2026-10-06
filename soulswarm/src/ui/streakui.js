// Kill-streak HUD (game/streak.js): the counter at the left edge (from STREAK.showAt kills) with its decay bar, the Soul
// Frenzy chip and the tier call beside the counter (clear of the Shepherd at screen centre and of the Nova's big number).
// Driven from RunUI.update at 20 Hz only; style writes happen only when a quantised value changes.
import './streak.css';
import { h, $, fmt } from './dom.js';
import { STREAK, BASE } from '../game/data.js';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
const pct = (x) => Math.round(x * 100);
const tierOf = (n) => { let t = 0; while (t < STREAK.tiers.length && n >= STREAK.tiers[t].at) t++; return t; };

export class StreakHUD {
  constructor(parent) {
    this.el = h(`<div class="stk" aria-hidden="true">
      <div class="stk-c stk-t" data-t="0"><b>0</b><small>KILL STREAK</small><div class="stk-bar"><i></i></div></div>
      <div class="stk-fz stk-t" data-t="1"><span>SOUL FRENZY <em></em></span><div class="stk-bar"><i></i></div></div>
    </div>`);
    parent.appendChild(this.el);
    this.q = { c: $(this.el, '.stk-c'), n: $(this.el, '.stk-c b'), bar: $(this.el, '.stk-c i'), fz: $(this.el, '.stk-fz'), fzTier: $(this.el, '.stk-fz em'), fzBar: $(this.el, '.stk-fz i') };
    this.mode = 0; this.n = -1; this.tier = 0; this.flip = 0; this.pulseAt = -1; this.fadeAt = 0;
    this.breaks = 0; this.calls = 0; this.fz = 0; this.bar = -1; this.fzBar = -1; this.callEl = null;
  }

  /** now: real seconds (run.t), so the break fade-out runs through slow-mo and hit-stop. */
  update(run, now) {
    const S = run.streak, q = this.q, live = S.n >= STREAK.showAt;
    if (S.breaks !== this.breaks) { // the streak broke: hold the final count and let it fade
      this.breaks = S.breaks;
      if (this.mode === 1 && !live) { this.fadeAt = now + 0.75; q.n.textContent = fmt(S.lastN); this.n = -1; }
    }
    const mode = live ? 1 : now < this.fadeAt ? 2 : 0;
    if (mode !== this.mode) {
      this.mode = mode;
      q.c.classList.toggle('on', mode === 1);
      q.c.classList.toggle('broken', mode === 2);
      if (mode !== 1) { q.bar.style.transform = 'scaleX(0)'; this.bar = 0; }
    }
    if (mode === 1) {
      const up = S.tier > this.tier;
      if (S.tier !== this.tier) { this.tier = S.tier; q.c.dataset.t = S.tier; }
      if (S.n !== this.n) {
        this.n = S.n; q.n.textContent = fmt(S.n);
        // restart the pulse by swapping between twin animations (no forced reflow); a tier-up gets the big one
        if (up || now - this.pulseAt > 0.15) { this.flip ^= 1; q.n.className = (up ? 't' : 'p') + (this.flip ? 'a' : 'b'); this.pulseAt = now; }
      }
      const b = Math.round(S.decay * 60);
      if (b !== this.bar) { this.bar = b; q.bar.style.transform = `scaleX(${b / 60})`; }
    } else if (mode === 0 && this.tier) { this.tier = 0; q.c.dataset.t = 0; } // a breaking streak fades in its own tier's style
    if (S.calls !== this.calls) { this.calls = S.calls; this.call(S.callTier); }
    // Soul Frenzy chip: outlives the streak that earned it
    const fz = S.frenzyT > 0 ? S.frenzy : 0;
    if (fz !== this.fz) {
      this.fz = fz; q.fz.classList.toggle('on', fz > 0);
      if (fz) { q.fz.dataset.t = fz; q.fzTier.textContent = ROMAN[fz]; }
    }
    if (fz) { const b = Math.round(S.frenzyT / STREAK.frenzy * 60); if (b !== this.fzBar) { this.fzBar = b; q.fzBar.style.transform = `scaleX(${b / 60})`; } }
  }

  /** The tier call: big gothic name beside the counter, with what the Frenzy grants. */
  call(tier) {
    const D = STREAK.tiers[tier - 1];
    if (!D) return;
    if (this.callEl) this.callEl.remove();
    const nova = D.nova ? ` · Nova +${pct(D.nova / BASE.novaKills)}%` : '';
    const el = h(`<div class="stk-call stk-t" data-t="${tier}"><b>${D.name}</b><span>Soul Frenzy ${ROMAN[tier]} · XP +${pct(D.xp)}% · minion attacks +${pct(D.haste)}%${nova}</span></div>`);
    el.style.left = Math.max(96, this.q.c.offsetLeft + this.q.c.offsetWidth + 12) + 'px'; // clear of the counter (one layout read per tier)
    this.el.appendChild(el);
    this.callEl = el;
    setTimeout(() => { el.remove(); if (this.callEl === el) this.callEl = null; }, 1800);
  }
}

/** Results-screen row: the run's best streak, its tier, and the profile record. */
export function streakRow(result, outcome, profile) {
  const n = result.bestStreak || 0, t = tierOf(n);
  const rec = outcome.streakRecord && n > 0 ? '<em class="pill pill-gold">New record</em>' : `<em>Record ${fmt(profile.stats.bestStreak || 0)}</em>`;
  return `<div class="res-streak stk-t" data-t="${t}"><small>Best streak</small><b>${fmt(n)}</b><span>${t ? STREAK.tiers[t - 1].name : '—'}</span>${rec}</div>`;
}
