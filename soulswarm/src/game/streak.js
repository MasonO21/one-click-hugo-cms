// Kill streaks: kills from any source (the Shepherd, minions, Soul Bombs, Nova, gate bursts) chain while each lands inside
// a window that tightens as the streak grows. Every tier crossed starts a Soul Frenzy: faster XP, faster-striking minions
// and, at the top tiers, Soul Nova charge. onKill() is O(1) and allocation-free (a Nova can kill hundreds a second); the HUD
// (ui/streakui.js) reads this state at its 20 Hz cadence, so no kill ever touches the DOM.
import { STREAK } from './data.js';

const T = STREAK.tiers;

export class Streak {
  constructor(run) {
    this.run = run;
    this.n = 0; this.tier = 0; this.last = -1e9; this.win = STREAK.window; // live streak (tier = tiers crossed so far)
    this.best = 0; this.bestTier = 0;
    this.lastN = 0; this.breaks = 0;         // length of the streak that broke last, and how many have broken
    this.frenzy = 0; this.frenzyT = 0;       // running Soul Frenzy tier (0 = none) and its seconds left
    this.xpMul = 1; this.haste = 1;          // read by run.addXp and the legion's attack timers
    this.novaBank = 0;                       // tier Nova charge earned mid-detonation, paid when the chain ends
    this.calls = 0; this.callTier = 0;       // tier announcements so far; the HUD shows a new one when `calls` moves
    this.sting = 0; this.stingAt = -1e9;     // highest tier awaiting its stinger (collapses tiers crossed in one burst)
  }

  /** Seconds left before the streak breaks, as a share of its current window (the HUD decay bar). */
  get decay() { return this.n ? Math.max(0, 1 - (this.run.time - this.last) / this.win) : 0; }

  onKill() {
    const run = this.run, t = run.time;
    if (t - this.last > this.win) this.reset();
    this.last = t;
    const n = ++this.n;
    this.win = Math.max(STREAK.floor, STREAK.window / (1 + n / STREAK.tighten));
    if (n > this.best) { this.best = run.counters.bestStreak = n; }
    if (this.tier < T.length && n >= T[this.tier].at) this.tierUp();
  }

  reset() {
    if (this.n) { this.lastN = this.n; this.breaks++; }
    this.n = 0; this.tier = 0; this.win = STREAK.window;
  }

  tierUp() {
    const D = T[this.tier++];
    if (this.tier > this.bestTier) this.bestTier = this.tier;
    // a new tier restarts the Frenzy at that tier; a lower one (a fresh streak) leaves a stronger running Frenzy alone
    if (this.frenzyT <= 0 || this.tier >= this.frenzy) { this.frenzy = this.tier; this.frenzyT = STREAK.frenzy; this.xpMul = 1 + D.xp; this.haste = 1 + D.haste; }
    this.novaBank += D.nova; // paid in update(): nothing charges Nova mid-detonation
    this.calls++; this.callTier = this.tier;
    if (this.tier > this.sting) this.sting = this.tier;
  }

  update(dt) {
    const run = this.run;
    if (this.n && run.time - this.last > this.win) this.reset();
    if (this.frenzyT > 0 && (this.frenzyT -= dt) <= 0) { this.frenzy = 0; this.xpMul = this.haste = 1; }
    if (this.novaBank && !run.novaQueue.length) { run.addNovaCharge(this.novaBank); this.novaBank = 0; }
    // one stinger per burst, pitched by the highest tier reached; a later, higher tier waits out the gap (real time)
    if (this.sting && run.t - this.stingAt >= STREAK.stingGap) {
      run.audio.sfx('streak', { pitch: 2 ** (T[this.sting - 1].semis / 12) });
      run.app.haptic(this.sting >= 3 ? 'heavy' : 'medium');
      this.stingAt = run.t; this.sting = 0;
    }
  }
}
