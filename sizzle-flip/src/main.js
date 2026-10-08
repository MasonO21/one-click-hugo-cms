// Sizzle Flip — app shell: boot, loop, input routing, progression.
import { NATIVE, nativePlugin } from './native.js';
import { Game } from './game.js';
import { AudioEngine } from './audio.js';
import { loadSave, writeSave, resetSave, totalStars } from './storage.js';
import { LEVELS } from './levels/data.js';
import { WORLDS } from './objects.js';
import { UI } from './ui.js';
import { drawLogo } from './art/logo.js';
import { SKINS, SKIN_BY_ID } from './art/sausage.js';
import { PHYS } from './physics.js';
import { Trophies } from './achievements.js';
import { AdManager } from './ads.js';
import { Shop } from './shop.js';

const params = new URLSearchParams(location.search);
// Native shell (Capacitor) bridges — absent on the web.
const NativeHaptics = nativePlugin('Haptics');
const NativeApp = nativePlugin('App');
if (NATIVE) { try { Promise.resolve(nativePlugin('StatusBar').hide()).catch(() => {}); } catch (e) { /* noop */ } }

class App {
  constructor() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.levels = LEVELS;
    this.save = loadSave();
    this.audio = new AudioEngine();
    this.audio.sfxOn = this.save.sfx;
    this.audio.musicOn = this.save.music;
    this.debug = params.has('debug');
    this.ui = new UI(this);
    this.trophies = new Trophies(this);
    this.ads = new AdManager(this);
    this.shop = new Shop(this);
    this.game = null;
    this.levelIndex = 0;
    this.last = performance.now();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    this.bindInput();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // auto-pause a level in progress (not while an ad covers it, or a card/dialog is already up)
        const $ = (id) => document.getElementById(id);
        if (!this.ads.showing && this.game && !this.game.attract && this.ui && $('scr-win').hidden && $('scr-worlddone').hidden && $('scr-confirm').hidden) this.ui.action('pause');
        if (this.audio.ctx) this.audio.ctx.suspend();
      } else if (this.audio.ctx) this.audio.ctx.resume();
    });
    const unlock = () => {
      this.audio.unlock();
      if (!this.audio.song) this.audio.playMusic(this.game && !this.game.attract ? WORLDS[this.game.info.worldIndex].id : 'menu');
    };
    // iOS only treats some events as user activation for audio — listen to all of them.
    for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) window.addEventListener(ev, unlock, { capture: true, passive: true });
    requestAnimationFrame((t) => this.loop(t));
  }

  // ---------------------------------------------------------------- layout
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    let cw = window.innerWidth, ch = window.innerHeight;
    // A hidden or collapsing panel (e.g. the artifact viewer opening) can briefly report 0×0.
    // Keep the last real size: a zero-size view breaks the camera maths and the background canvas.
    if (cw < 2 || ch < 2) { if (this.cw) return; cw = 390; ch = 844; }
    this.dpr = dpr; this.cw = cw; this.ch = ch;
    this.canvas.width = Math.round(cw * dpr);
    this.canvas.height = Math.round(ch * dpr);
    if (this.game) this.game.bgDirty = true;
    const landscapePhone = cw > ch && ch < 500 && ('ontouchstart' in window);
    document.getElementById('rotate').hidden = !landscapePhone;
    if (this.ui) this.ui.fitTitle();
  }

  // the playfield plus a sliver beyond each side wall, so a sausage lying against a wall shows its whole tip
  baseScale() { return Math.min(this.cw / (PHYS.W + 20), this.ch / 1100); }
  maxDrag() { return Math.max(120, Math.min(260, 0.42 * Math.min(this.cw, this.ch))); }

  // ---------------------------------------------------------------- input
  bindInput() {
    const c = this.canvas;
    let active = null;
    c.addEventListener('pointerdown', (e) => {
      if (active !== null) return;
      active = e.pointerId;
      try { c.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
      if (this.game && !this.game.attract) this.game.pointerDown(e.clientX, e.clientY);
      e.preventDefault();
    });
    c.addEventListener('pointermove', (e) => {
      if (e.pointerId !== active) return;
      if (this.game && !this.game.attract) this.game.pointerMove(e.clientX, e.clientY);
    });
    const up = (e) => {
      if (e.pointerId !== active) return;
      active = null;
      if (this.game && !this.game.attract) this.game.pointerUp(e.clientX, e.clientY);
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', (e) => { if (e.pointerId === active) { active = null; if (this.game) { this.game.aim = null; this.audio.stopCharge(); } } });
    window.addEventListener('keydown', (e) => {
      if (!this.game || this.game.attract || this.ads.showing) return;
      if (e.key === 'r' || e.key === 'R') this.restartLevel();
      if (e.key === 'Escape' || e.key === 'p') this.ui.action(document.getElementById('scr-pause').hidden ? 'pause' : 'resume');
    });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  haptic(p) {
    if (!this.save.haptics) return;
    try {
      if (NativeHaptics) {
        const strength = Array.isArray(p) ? 30 : p;
        NativeHaptics.impact({ style: strength >= 20 ? 'HEAVY' : strength >= 12 ? 'MEDIUM' : 'LIGHT' });
      } else if (navigator.vibrate) navigator.vibrate(p);
    } catch (e) { /* noop */ }
  }

  // ---------------------------------------------------------------- loop
  loop(t) {
    // schedule the next frame first, so an error in one frame can never stop the game
    requestAnimationFrame((tt) => this.loop(tt));
    let dt = (t - this.last) / 1000;
    this.last = t;
    // frame timestamps and performance.now() can disagree after a pause or an ad: never step backwards
    if (!(dt > 0)) dt = 0; else if (dt > 0.1) dt = 0.1;
    if (!this.game) return;
    try {
      this.game.update(dt);
      if (this.game.attract) this.attractTick(dt);
      else if (!this.game.paused && !this.game.winShown && !document.hidden) this.ads.tickPlay(dt);
      this.game.render(this.ctx);
    } catch (e) {
      console.error(e);
      this.game.recover();
    }
  }

  // ---------------------------------------------------------------- flow
  boot() {
    const done = () => {
      drawLogo(document.getElementById('logo'), SKIN_BY_ID[this.save.skin] || SKINS[0]);
      this.startAttract();
      this.ui.show('scr-title', false);
      this.ui.initHistory();
      document.getElementById('loading').classList.add('done');
      setTimeout(() => { document.getElementById('loading').hidden = true; }, 500);
      if (params.has('level')) this.startLevel(Math.max(0, Math.min(199, parseInt(params.get('level'), 10) - 1)), true);
      const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
      document.getElementById('install-hint').hidden = NATIVE || standalone || !('ontouchstart' in window);
    };
    const fonts = document.fonts ? Promise.race([document.fonts.load('40px "Lilita One"'), new Promise(r => setTimeout(r, 1500))]).then(() => document.fonts.load('16px Fredoka')).catch(() => {}) : Promise.resolve();
    fonts.then(done, done);
  }

  startAttract() {
    const i = Math.min(this.save.unlocked - 1, 199);
    const idx = Math.max(0, Math.floor(i / 20) * 20);
    this.game = new Game(this, this.levels[idx], this.levelInfo(idx), { silent: true, attract: true });
    this.game.skipIntro();
    this.attractT = 1.5;
    this.ui.hideHud();
  }

  attractTick(dt) {
    const g = this.game;
    this.attractT -= dt;
    if (g.phase === 'win' && g.winT > 2.5) { this.startAttract(); return; }
    if (this.attractT <= 0 && g.phase === 'play' && g.sim.canLaunch()) {
      this.attractT = 1.6 + Math.random() * 1.6;
      const shots = g.level.solution || [];
      let a, p;
      const s = shots[g.flips] && g.flips < shots.length && Math.random() < 0.85 ? shots[g.flips] : null;
      if (s) { a = s[0]; p = s[1]; }
      else { a = -Math.PI / 2 + (Math.random() - 0.5) * 1.4; p = 0.3 + Math.random() * 0.5; }
      const [vx, vy] = [Math.cos(a), Math.sin(a)];
      const v = PHYS.MIN_V + (PHYS.MAX_V - PHYS.MIN_V) * p;
      g.launch(vx * v, vy * v, p);
    }
  }

  levelInfo(i) {
    const L = this.levels[i];
    return { index: i, worldIndex: Math.floor(i / 20), num: (i % 20) + 1, name: L.name || `Level ${i + 1}`, par: L.par || 3 };
  }

  startLevel(i, fromDeepLink = false) {
    this.levelIndex = i;
    this.ui.hideScreens();
    document.getElementById('scr-win').hidden = true;
    document.getElementById('scr-pause').hidden = true;
    this.game = new Game(this, this.levels[i], this.levelInfo(i));
    this.ui.showHud(this.game);
    this.audio.playMusic(WORLDS[Math.floor(i / 20)].id);
    this.audio.play('whoosh');
  }

  restartLevel() {
    if (!this.game || this.game.attract) return;
    this.pause(false);
    this.game.reset();
    this.game.phase = 'play';
    this.ui.updateHud(this.game);
    this.audio.play('respawn');
  }

  // Leaving a level-complete card. `then` is where the player asked to go: 'next' or 'levels'.
  // A first-time world clear (incl. the finale) shows its celebration card first.
  nextLevel(then = 'next') {
    if (this.pendingWorldDone !== undefined) {
      const w = this.pendingWorldDone;
      this.pendingWorldDone = undefined;
      this.afterWorldDoneGo = then;
      this.ui.showWorldDone(w, w === WORLDS.length - 1);
      return;
    }
    this.continueTo(then);
  }

  afterWorldDone() { this.continueTo(this.afterWorldDoneGo || 'next'); }

  continueTo(then) {
    const i = this.levelIndex + 1;
    if (then === 'levels') { this.toMenu('scr-levels', i < this.levels.length && i % 20 === 0 ? Math.floor(i / 20) : undefined); return; }
    if (i >= this.levels.length) { this.toMenu('scr-title'); return; }
    if (i % 20 === 0) this.ui.worldIndex = Math.floor(i / 20);
    this.startLevel(i);
  }

  toMenu(screen, world) {
    this.pause(false);
    this.pendingWorldDone = undefined;
    this.ui.hideHud();
    this.startAttract();
    this.ui.stack = screen === 'scr-title' ? [] : ['scr-title', 'scr-worlds'];
    if (screen === 'scr-levels') this.ui.worldIndex = world ?? Math.floor(this.levelIndex / 20);
    this.ui.show(screen, false);
    this.audio.playMusic('menu');
  }

  pause(on) {
    if (this.game) this.game.paused = on;
    if (on && this.game && this.game.aim) { this.game.aim = null; this.audio.stopCharge(); }
    if (!on) this.last = performance.now();
  }

  onWin(game) {
    const i = game.info.index;
    const stars = this.starsFor(game.flips, game.info.par);
    const before = totalStars(this.save);
    const prevBest = this.save.best[i];
    const newBest = prevBest !== undefined && game.flips < prevBest;
    this.save.stars[i] = Math.max(this.save.stars[i] || 0, stars);
    this.save.best[i] = Math.min(prevBest ?? 999, game.flips);
    const wasLocked = this.save.unlocked <= i + 1;
    this.save.unlocked = Math.max(this.save.unlocked, Math.min(this.levels.length, i + 2));
    this.save.totalFlips += game.flips;
    const after = totalStars(this.save);
    const newSkin = SKINS.find(s => s.stars > before && s.stars <= after);
    delete this.save.skipped[i];
    this.persist();
    // first clear of a world (kept if they replayed the boss level from its own win card)
    this.pendingWorldDone = i % 20 === 19 && (wasLocked || this.pendingWorldDone === Math.floor(i / 20)) ? Math.floor(i / 20) : undefined;
    this.ads.onLevelComplete();
    // context for the forced-ad check when the player leaves the win screen
    this.lastWin = { index: i, fails: game.fails || 0, worldEnd: this.pendingWorldDone !== undefined || i === this.levels.length - 1 };
    this.ui.showWin(game, { stars, best: this.save.best[i], newBest, newSkin, isLast: i === this.levels.length - 1 });
    setTimeout(() => this.trophies.onWin(game), 1400);
  }

  // Reward for watching an ad when stuck: open the next level without stars for this one.
  skipLevel() {
    const g = this.game;
    if (!g || g.attract) return;
    const i = g.info.index;
    this.save.skipped[i] = true;
    this.save.unlocked = Math.max(this.save.unlocked, Math.min(this.levels.length, i + 2));
    this.persist();
    const next = i + 1;
    if (next % 20 === 0) this.ui.worldIndex = Math.floor(next / 20);
    this.startLevel(next);
    this.ui.toast(next % 20 === 0 ? `Skipped! ${WORLDS[next / 20].name} unlocked` : 'Level skipped — come back anytime for the ★', 2600);
  }

  starsFor(flips, par) {
    if (flips <= par) return 3;
    if (flips <= par + Math.max(1, Math.ceil(par * 0.5))) return 2;
    return 1;
  }

  worldUnlocked(w) { return this.save.unlocked > w * 20 || this.debug; }
  worldCompleted(w) { return !!this.save.stars[w * 20 + 19]; }
  worldStars(w) { let n = 0; for (let k = 0; k < 20; k++) n += this.save.stars[w * 20 + k] || 0; return n; }
  worldLevelsDone(w) { let n = 0; for (let k = 0; k < 20; k++) if (this.save.stars[w * 20 + k]) n++; return n; }
  currentWorld() { return Math.min(WORLDS.length - 1, Math.floor((this.save.unlocked - 1) / 20)); }

  setSetting(key, val) {
    this.save[key] = val;
    if (key === 'sfx') this.audio.setSfx(val);
    if (key === 'music') { this.audio.setMusic(val); }
    this.persist();
    this.ui.syncToggles();
  }

  resetProgress() {
    const keep = this.save;
    // the wallet (Hot Dogs, characters, credited purchases), "remove ads", ad pacing and the long aim timer survive a progress reset
    this.save = { ...resetSave(), sfx: keep.sfx, music: keep.music, haptics: keep.haptics, adsRemoved: keep.adsRemoved, adFast: keep.adFast, longAimUntil: keep.longAimUntil, owned: keep.owned, character: keep.character, hotdogs: keep.hotdogs, txSeen: keep.txSeen, walletRev: keep.walletRev, walletId: keep.walletId, ads: keep.ads ? { ...keep.ads, freeHints: {} } : null };
    this.persist();
    this.ui._worldsBuilt = false;
    document.getElementById('world-list').innerHTML = '';
    document.getElementById('world-dots').innerHTML = '';
    this.ui.renderTitle();
  }

  persist() { writeSave(this.save); }
}

const app = new App();
window.__app = app;
// Android hardware/gesture back: same handling as the browser back button; on the title screen it
// sends the app to the background (like the home button) instead of closing it.
if (NativeApp) {
  try { NativeApp.addListener('backButton', () => { if (!app.ui.onBack()) NativeApp.minimizeApp(); }); } catch (e) { /* noop */ }
}
// Live-update hook when hosted as a Claude artifact: keep the level being played across republishes.
const hot = window.claude && window.claude.hot;
if (hot && hot.snapshot) { try { hot.snapshot(() => ({ level: app.game && !app.game.attract ? app.game.info.index : null })); } catch (e) { /* noop */ } }
const resume = (data) => { app.boot(); if (data && Number.isInteger(data.level)) setTimeout(() => app.startLevel(data.level), 600); };
if (hot && hot.ready) hot.ready(resume); else resume((hot && hot.data) || {});

if (!NATIVE && !window.__ARTIFACT && 'serviceWorker' in navigator && location.protocol === 'https:' && !params.has('nosw')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
