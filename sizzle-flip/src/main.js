// Sizzle Flip — app shell: boot, loop, input routing, progression.
import { Game } from './game.js';
import { AudioEngine } from './audio.js';
import { loadSave, writeSave, resetSave, totalStars } from './storage.js';
import { LEVELS } from './levels/data.js';
import { WORLDS } from './objects.js';
import { UI } from './ui.js';
import { drawLogo } from './art/logo.js';
import { SKINS, SKIN_BY_ID } from './art/sausage.js';
import { PHYS } from './physics.js';

const params = new URLSearchParams(location.search);
// Native shell (Capacitor) bridges — absent on the web.
const Cap = window.Capacitor;
const NATIVE = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
const NativeHaptics = NATIVE && Cap.registerPlugin ? Cap.registerPlugin('Haptics') : null;
if (NATIVE && Cap.registerPlugin) { try { Cap.registerPlugin('StatusBar').hide(); } catch (e) { /* noop */ } }

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
    this.game = null;
    this.levelIndex = 0;
    this.last = performance.now();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    this.bindInput();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.game && !this.game.attract && this.ui && document.getElementById('scr-win').hidden) this.ui.action('pause');
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
    const cw = window.innerWidth, ch = window.innerHeight;
    this.dpr = dpr; this.cw = cw; this.ch = ch;
    this.canvas.width = Math.round(cw * dpr);
    this.canvas.height = Math.round(ch * dpr);
    if (this.game) this.game.bgDirty = true;
    const landscapePhone = cw > ch && ch < 500 && ('ontouchstart' in window);
    document.getElementById('rotate').hidden = !landscapePhone;
  }

  baseScale() { return Math.min(this.cw / PHYS.W, this.ch / 1100); }
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
      if (!this.game || this.game.attract) return;
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
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    if (this.game) {
      this.game.update(dt);
      if (this.game.attract) this.attractTick(dt);
      this.game.render(this.ctx);
    }
    requestAnimationFrame((tt) => this.loop(tt));
  }

  // ---------------------------------------------------------------- flow
  boot() {
    const done = () => {
      drawLogo(document.getElementById('logo'), SKIN_BY_ID[this.save.skin] || SKINS[0]);
      this.startAttract();
      this.ui.show('scr-title', false);
      try { history.replaceState({ s: 'title' }, ''); } catch (e) { /* noop */ }
      document.getElementById('loading').classList.add('done');
      setTimeout(() => { document.getElementById('loading').hidden = true; }, 500);
      if (params.has('level')) this.startLevel(Math.max(0, Math.min(199, parseInt(params.get('level'), 10) - 1)), true);
      const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
      document.getElementById('install-hint').hidden = standalone || !('ontouchstart' in window);
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
    try { history.pushState({ s: 'game' }, ''); } catch (e) { /* noop */ }
  }

  restartLevel() {
    if (!this.game || this.game.attract) return;
    this.pause(false);
    this.game.reset();
    this.game.phase = 'play';
    this.ui.updateHud(this.game);
    this.audio.play('respawn');
  }

  nextLevel() {
    const i = this.levelIndex + 1;
    if (i >= this.levels.length) { this.toMenu('scr-title'); return; }
    if (this.pendingWorldDone !== undefined) {
      const w = this.pendingWorldDone;
      this.pendingWorldDone = undefined;
      this.ui.showWorldDone(w, w === WORLDS.length - 1);
      return;
    }
    this.startLevel(i);
  }

  afterWorldDone() {
    const i = this.levelIndex + 1;
    if (i >= this.levels.length) { this.toMenu('scr-title'); return; }
    this.ui.worldIndex = Math.floor(i / 20);
    this.startLevel(i);
  }

  toMenu(screen) {
    this.pause(false);
    this.ui.hideHud();
    this.startAttract();
    this.ui.stack = screen === 'scr-title' ? [] : ['scr-title', 'scr-worlds'];
    if (screen === 'scr-levels') this.ui.worldIndex = Math.floor(this.levelIndex / 20);
    this.ui.show(screen, false);
    this.audio.playMusic('menu');
  }

  pause(on) {
    if (this.game) this.game.paused = on;
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
    this.persist();
    if (i % 20 === 19 && wasLocked) this.pendingWorldDone = Math.floor(i / 20);
    this.ui.showWin(game, { stars, best: this.save.best[i], newBest, newSkin, isLast: i === this.levels.length - 1 });
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
    this.save = { ...resetSave(), sfx: this.save.sfx, music: this.save.music, haptics: this.save.haptics };
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
app.boot();

if (!NATIVE && 'serviceWorker' in navigator && location.protocol === 'https:' && !params.has('nosw')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
