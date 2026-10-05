// DOM menus, HUD and overlays.
import { WORLDS } from './objects.js';
import { totalStars } from './storage.js';
import { SKINS, drawSausage, makeFaceState } from './art/sausage.js';
import { renderLevelThumb } from './thumbs.js';
import { ACHIEVEMENTS } from './achievements.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(app) {
    this.app = app;
    this.stack = [];
    this.current = null;
    document.querySelectorAll('[data-act]').forEach(el => {
      el.addEventListener('click', (e) => { e.stopPropagation(); this.app.audio.play('click'); this.action(el.dataset.act, el); });
    });
    document.querySelectorAll('input[data-set]').forEach(el => {
      el.addEventListener('change', () => this.app.setSetting(el.dataset.set, el.checked));
    });
    // stop menu taps from reaching the canvas
    $('ui').addEventListener('pointerdown', (e) => { if (e.target !== $('ui')) e.stopPropagation(); });
    window.addEventListener('popstate', () => this.onBack());
    $('world-list').addEventListener('scroll', () => this.updateDots(), { passive: true });
  }

  syncToggles() {
    document.querySelectorAll('input[data-set]').forEach(el => { el.checked = !!this.app.save[el.dataset.set]; });
  }

  // ------------------------------------------------------------ navigation
  show(id, push = true) {
    for (const s of document.querySelectorAll('#ui > .screen')) s.hidden = s.id !== id;
    if (push && this.current && this.current !== id) { this.stack.push(this.current); try { history.pushState({ s: id }, ''); } catch (e) { /* noop */ } }
    this.current = id;
    if (id === 'scr-title') this.renderTitle();
    if (id === 'scr-worlds') this.renderWorlds();
    if (id === 'scr-levels') this.renderLevels();
    if (id === 'scr-skins') this.renderSkins();
    if (id === 'scr-settings') this.syncToggles();
  }

  hideScreens() {
    for (const s of document.querySelectorAll('#ui > .screen')) s.hidden = true;
    this.current = null;
  }

  onBack() {
    // Android back button / browser back
    if (!$('scr-confirm').hidden) { $('scr-confirm').hidden = true; return; }
    if (!$('scr-pause').hidden) { this.action('resume'); return; }
    if (this.app.game && !this.app.game.attract && $('scr-pause').hidden && $('scr-win').hidden) { this.action('pause'); try { history.pushState({ s: 'game' }, ''); } catch (e) { /* noop */ } return; }
    const prev = this.stack.pop();
    if (prev) this.show(prev, false);
  }

  action(act, el) {
    const app = this.app;
    switch (act) {
      case 'play':
        // brand-new players go straight into the first level
        if (app.save.unlocked <= 1 && !app.save.stars[0]) { this.stack = ['scr-title', 'scr-worlds']; this.worldIndex = 0; app.startLevel(0); }
        else this.show('scr-worlds');
        break;
      case 'skins': this.show('scr-skins'); break;
      case 'settings': this.show('scr-settings'); break;
      case 'back': { const prev = this.stack.pop() || 'scr-title'; this.show(prev, false); break; }
      case 'pause': app.pause(true); this.syncToggles(); $('scr-pause').hidden = false; break;
      case 'resume': $('scr-pause').hidden = true; app.pause(false); break;
      case 'restart': $('scr-pause').hidden = true; $('scr-win').hidden = true; app.restartLevel(); break;
      case 'overview': app.game && app.game.toggleOverview(); break;
      case 'hint':
        if (app.game) {
          app.game.useHint();
          const timed = app.game.sim.bodies.some(b => b.kinematic || b.timer);
          this.toast(timed ? 'Follow the route — and time it with the moving parts!' : 'Follow the dotted route!', 2600);
        }
        break;
      case 'levels': $('scr-pause').hidden = true; $('scr-win').hidden = true; app.toMenu('scr-levels'); break;
      case 'home': $('scr-pause').hidden = true; app.toMenu('scr-title'); break;
      case 'replay': $('scr-win').hidden = true; app.restartLevel(); break;
      case 'next': $('scr-win').hidden = true; app.nextLevel(); break;
      case 'wd-continue': $('scr-worlddone').hidden = true; app.afterWorldDone(); break;
      case 'reset': this.confirm('Erase all stars and progress?', () => { app.resetProgress(); this.toast('Progress reset'); }); break;
      case 'confirm-yes': $('scr-confirm').hidden = true; this._confirmCb && this._confirmCb(); break;
      case 'confirm-no': $('scr-confirm').hidden = true; break;
    }
  }

  confirm(text, cb) { $('confirm-text').textContent = text; this._confirmCb = cb; $('scr-confirm').hidden = false; }

  trophyToast(a) {
    const t = document.getElementById('trophy');
    t.innerHTML = `<span class="ti">${a.icon}</span><span><small>TROPHY UNLOCKED</small><b>${a.name}</b></span>`;
    t.hidden = false;
    t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    clearTimeout(this._trT);
    this._trT = setTimeout(() => { t.hidden = true; }, 3200);
  }

  toast(text, ms = 1800) {
    const t = $('toast');
    t.textContent = text; t.hidden = false;
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { t.hidden = true; }, ms);
  }

  // ------------------------------------------------------------ title
  renderTitle() {
    $('title-stars').textContent = totalStars(this.app.save);
    const newSkin = SKINS.some(s => s.stars <= totalStars(this.app.save) && s.stars > 0 && !this.app.save.seenSkins[s.id]);
    $('skin-badge').hidden = !newSkin;
  }

  // ------------------------------------------------------------ worlds
  renderWorlds() {
    const app = this.app;
    const list = $('world-list');
    $('worlds-stars').textContent = totalStars(app.save);
    if (!this._worldsBuilt) {
      list.innerHTML = '';
      WORLDS.forEach((w, i) => {
        const card = document.createElement('div');
        card.className = 'world-card';
        card.dataset.w = i;
        card.innerHTML = `<canvas width="480" height="408"></canvas><div class="wc-body"><div class="wc-num">WORLD ${i + 1}</div><div class="wc-name">${w.name}</div><div class="wc-stars"></div><div class="wc-bar"><i></i></div><div class="lock-label"></div></div>`;
        card.addEventListener('click', () => {
          if (Math.abs(list.scrollLeft - this._lastScroll) > 8) return;
          if (!app.worldUnlocked(i)) { app.audio.play('tap'); this.toast(`Finish ${WORLDS[i - 1].name} to unlock`); return; }
          app.audio.play('click');
          this.worldIndex = i; this.show('scr-levels');
        });
        card.addEventListener('pointerdown', () => { this._lastScroll = list.scrollLeft; });
        list.appendChild(card);
        const dot = document.createElement('i'); $('world-dots').appendChild(dot);
      });
      this._worldsBuilt = true;
      // draw thumbnails progressively
      let k = 0;
      const next = () => {
        const card = list.children[k];
        if (!card) return;
        renderLevelThumb(card.querySelector('canvas'), app.levels[k * 20], WORLDS[k]);
        k++; setTimeout(next, 16);
      };
      next();
    }
    [...list.children].forEach((card, i) => {
      const unlocked = app.worldUnlocked(i);
      const st = app.worldStars(i);
      card.classList.toggle('locked', !unlocked);
      card.querySelector('.wc-stars').innerHTML = `<span class="star">★</span> ${st} / 60`;
      card.querySelector('.wc-bar i').style.width = (st / 60 * 100) + '%';
      card.querySelector('.lock-label').textContent = unlocked ? (app.worldCompleted(i) ? 'Completed!' : `${app.worldLevelsDone(i)} / 20 levels`) : '🔒 Locked';
    });
    const target = this.worldIndex ?? app.currentWorld();
    requestAnimationFrame(() => {
      const card = list.children[target];
      if (card) list.scrollLeft = card.offsetLeft - (list.clientWidth - card.clientWidth) / 2;
      this.updateDots();
    });
  }

  updateDots() {
    const list = $('world-list');
    const cards = [...list.children];
    if (!cards.length) return;
    const mid = list.scrollLeft + list.clientWidth / 2;
    let best = 0, bd = 1e9;
    cards.forEach((c, i) => { const d = Math.abs(c.offsetLeft + c.clientWidth / 2 - mid); if (d < bd) { bd = d; best = i; } });
    [...$('world-dots').children].forEach((d, i) => d.classList.toggle('on', i === best));
  }

  // ------------------------------------------------------------ levels
  renderLevels() {
    const app = this.app;
    const w = this.worldIndex ?? app.currentWorld();
    this.worldIndex = w;
    $('levels-title').textContent = WORLDS[w].name;
    $('levels-stars').textContent = app.worldStars(w);
    const grid = $('level-grid');
    grid.innerHTML = '';
    for (let k = 0; k < 20; k++) {
      const i = w * 20 + k;
      const b = document.createElement('button');
      const unlocked = i < app.save.unlocked;
      const stars = app.save.stars[i] || 0;
      b.className = 'lvl' + (unlocked ? '' : ' locked') + (unlocked && !stars ? ' current' : '') + (k === 19 ? ' boss' : '');
      b.innerHTML = `<span>${k + 1}</span><span class="s">${[0, 1, 2].map(j => j < stars ? '<b>★</b>' : '★').join('')}</span>`;
      b.setAttribute('aria-label', `Level ${k + 1}${unlocked ? '' : ' locked'}`);
      b.addEventListener('click', () => {
        if (!unlocked) { app.audio.play('tap'); this.toast('Beat the previous level first'); return; }
        app.audio.play('click');
        app.startLevel(i);
      });
      grid.appendChild(b);
    }
  }

  // ------------------------------------------------------------ skins
  renderSkins() {
    const app = this.app;
    const stars = totalStars(app.save);
    $('skins-stars').textContent = stars;
    const grid = $('skin-grid');
    grid.innerHTML = '';
    SKINS.forEach(s => {
      const unlocked = stars >= s.stars;
      if (unlocked) app.save.seenSkins[s.id] = true;
      const d = document.createElement('div');
      d.className = 'skin' + (app.save.skin === s.id ? ' on' : '') + (unlocked ? '' : ' locked');
      d.innerHTML = `<canvas width="240" height="120"></canvas><div class="nm">${unlocked ? s.name : '???'}</div><div class="req">${unlocked ? (app.save.skin === s.id ? '' : 'Tap to equip') : `<span class="star">★</span> ${s.stars} stars`}</div>`;
      drawSkinPreview(d.querySelector('canvas'), s);
      d.addEventListener('click', () => {
        if (!unlocked) { app.audio.play('tap'); this.toast(`Collect ${s.stars - stars} more ★`); return; }
        app.save.skin = s.id; app.persist(); app.audio.play('unlock'); this.renderSkins();
      });
      grid.appendChild(d);
    });
    // trophies
    const tl = document.getElementById('trophy-list');
    const got = app.save.ach || {};
    document.getElementById('trophy-count').textContent = `${Object.keys(got).length} / ${ACHIEVEMENTS.length}`;
    tl.innerHTML = ACHIEVEMENTS.map(a => `<div class="trophy-row${got[a.id] ? ' got' : ''}"><span class="ti">${got[a.id] ? a.icon : '🔒'}</span><span><b>${a.name}</b><small>${a.desc}</small></span></div>`).join('');
    app.persist();
  }

  // ------------------------------------------------------------ HUD
  showHud(game) {
    $('hud').hidden = false;
    $('hud-level').textContent = `${game.info.worldIndex + 1}-${game.info.num}`;
    $('hud-name').textContent = game.info.name;
    $('hud-par').textContent = game.info.par;
    this.updateHud(game);
    const tip = game.level.tip;
    const tipEl = $('hud-tip');
    clearTimeout(this._tipT);
    if (tip) {
      tipEl.innerHTML = tip;
      tipEl.hidden = false;
      this._tipT = setTimeout(() => { tipEl.hidden = true; }, 6500);
    } else tipEl.hidden = true;
  }

  hideHud() { $('hud').hidden = true; }

  updateHud(game) {
    const el = $('hud-flips');
    if (el.textContent !== String(game.flips)) {
      el.textContent = game.flips;
      el.parentElement.classList.remove('bump'); void el.parentElement.offsetWidth; el.parentElement.classList.add('bump');
    }
    const stars = this.app.starsFor(Math.max(game.flips, 1), game.info.par);
    const projected = game.flips < game.info.par ? 3 : this.app.starsFor(game.flips + 1, game.info.par);
    $('hud-stars').innerHTML = [0, 1, 2].map(j => j < projected ? '★' : '<span class="off">★</span>').join('');
    const hint = $('hud-hint');
    const ready = game.hintReady();
    if (ready && hint.hidden) { hint.hidden = false; this.toast('Stuck? Tap 💡 for a hint'); }
    else if (!ready) hint.hidden = true;
  }

  // ------------------------------------------------------------ win
  showWin(game, res) {
    const card = $('scr-win');
    card.hidden = false;
    $('win-flips').textContent = game.flips;
    $('win-par').textContent = game.info.par;
    $('win-best').textContent = res.best;
    $('win-title').textContent = res.isLast ? 'YOU WIN!' : res.newBest ? 'NEW BEST!' : 'LEVEL COMPLETE!';
    $('win-msg').textContent = res.stars === 3 ? pick(['Flawless flipping. Chef\'s kiss!', 'Par or better — top dog!', 'That\'s a gourmet landing.']) :
      res.stars === 2 ? `Land it in ${game.info.par} flip${game.info.par > 1 ? 's' : ''} for 3 stars.` : `Try for ${game.info.par} flip${game.info.par > 1 ? 's' : ''} to earn 3 stars.`;
    const stars = [...card.querySelectorAll('.bigstar')];
    stars.forEach(s => s.classList.remove('show', 'lit'));
    stars.forEach((s, i) => {
      setTimeout(() => {
        s.classList.add('show');
        if (i < res.stars) { s.classList.add('lit'); this.app.audio.play('star', { n: i }); this.app.haptic(10); }
      }, 250 + i * 260);
    });
    const un = $('win-unlock');
    if (res.newSkin) {
      un.hidden = false;
      $('win-unlock-name').textContent = res.newSkin.name;
      drawSkinPreview($('win-unlock-canvas'), res.newSkin);
      setTimeout(() => this.app.audio.play('unlock'), 1100);
    } else un.hidden = true;
    card.querySelector('[data-act="next"] span').textContent = res.isLast ? 'FINISH ▶' : 'NEXT ▶';
  }

  showWorldDone(worldIndex, isFinal) {
    $('scr-worlddone').hidden = false;
    $('wd-title').textContent = isFinal ? 'TOP DOG!' : 'WORLD COMPLETE!';
    const next = WORLDS[worldIndex + 1];
    $('wd-text').innerHTML = isFinal
      ? 'You flipped your way through all <b>200 levels</b> and reached Hot Dog Heaven. Go back and grab every ★ to unlock The Legend!'
      : `<b>${WORLDS[worldIndex].name}</b> conquered!<br>Next stop: <b>${next.name}</b>`;
    const c = $('wd-canvas');
    const lvl = isFinal ? this.app.levels[199] : this.app.levels[(worldIndex + 1) * 20];
    renderLevelThumb(c, lvl, isFinal ? WORLDS[9] : next);
    this.app.audio.play('unlock');
  }
}

export function drawSkinPreview(c, skin) {
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  const s = c.width / 240;
  ctx.save();
  ctx.scale(s * 1.25, s * 1.25);
  const N = 10, px = new Float64Array(N), py = new Float64Array(N);
  for (let i = 0; i < N; i++) { px[i] = 46 + i * 11; py[i] = 52 - Math.sin(i / (N - 1) * Math.PI) * 8; }
  const face = makeFaceState(); face.expr = 'idle'; face.lookX = 1; face.lookY = 0.2;
  drawSausage(ctx, px, py, { R: 15, skin, face, t: 0.4 });
  ctx.restore();
}

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
