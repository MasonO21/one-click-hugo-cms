// DOM menus, HUD and overlays.
import { WORLDS } from './objects.js';
import { totalStars } from './storage.js';
import { SKINS, drawSausage, makeFaceState } from './art/sausage.js';
import { renderLevelThumb } from './thumbs.js';
import { ACHIEVEMENTS } from './achievements.js';
import { privacyHtml } from './privacy.js';
import { PLATFORM } from './native.js';
import { ITEMS, ITEM_BY_ID, CATEGORIES, drawItem } from './art/items.js';
import { ALL, fmt } from './shop.js';
import { SKIN_PRICE, HOTDOGS_PER_DOLLAR, PACKS } from './shop-config.js';

const PACK_ICONS = ['🌭', '🌭🌭', '🌭🌭🌭', '📦', '🛒', '🚚'];
const hd = (n) => `🌭\u2060${fmt(n)}`; // an amount of Hot Dogs; the word joiner keeps the icon and the number on one line

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
      el.addEventListener('change', () => { this.app.setSetting(el.dataset.set, el.checked); if (!$('scr-settings').hidden) this.renderAdTest(); });
    });
    // stop menu taps from reaching the canvas
    $('ui').addEventListener('pointerdown', (e) => { if (e.target !== $('ui')) e.stopPropagation(); });
    // Browser / PWA back: one guard history entry. Each handled back re-arms it; on the title screen
    // back is not handled, so the next back leaves the page as expected.
    window.addEventListener('popstate', () => { if (this.onBack()) this.armHistory(); });
    $('world-list').addEventListener('scroll', () => this.updateDots(), { passive: true });
    setInterval(() => this.tickAim(), 1000);
  }

  syncToggles() {
    document.querySelectorAll('input[data-set]').forEach(el => { el.checked = !!this.app.save[el.dataset.set]; });
  }

  // ------------------------------------------------------------ navigation
  show(id, push = true) {
    for (const s of document.querySelectorAll('#ui > .screen')) s.hidden = s.id !== id;
    if (push && this.current && this.current !== id) { this.stack.push(this.current); this.armHistory(); }
    this.current = id;
    if (id === 'scr-title') this.renderTitle();
    if (id === 'scr-worlds') this.renderWorlds();
    if (id === 'scr-levels') this.renderLevels();
    if (id === 'scr-skins') this.renderSkins();
    if (id === 'scr-shop') { this.renderShop(); this.app.shop.refresh(); }
    if (id === 'scr-settings') { this.syncToggles(); this.renderAim(); this.renderAdTest(); $('privacy-choices').hidden = !this.app.ads.privacyOptionsAvailable; }
    this.fitTitle(id);
  }

  // A long title on a narrow phone ("Backyard BBQ" next to the stars): shrink it until it fits, down to 17 px.
  fitTitle(id = this.current) {
    const h = id && document.querySelector(`#${id} header.bar h2`);
    if (!h) return;
    h.style.fontSize = '';
    let fs = parseFloat(getComputedStyle(h).fontSize);
    while (h.scrollWidth > h.clientWidth && fs > 17) { fs -= 1; h.style.fontSize = `${fs}px`; }
  }

  hideScreens() {
    for (const s of document.querySelectorAll('#ui > .screen')) s.hidden = true;
    this.current = null;
  }

  initHistory() {
    try { history.replaceState({ s: 'root' }, ''); } catch (e) { /* noop */ }
    this.armed = false;
    this.armHistory();
  }

  armHistory() {
    if (this.armed && history.state && history.state.s === 'guard') return;
    try { history.pushState({ s: 'guard' }, ''); this.armed = true; } catch (e) { /* noop */ }
  }

  // Android back / browser back. Returns false when there is nothing left to go back from (title screen).
  onBack() {
    this.armed = false;
    const app = this.app;
    if (app.ads.showing || this._leaving) return true;
    if (!$('scr-confirm').hidden) { this.action('confirm-no'); return true; }
    if (!$('scr-privacy').hidden) { this.action('privacy-close'); return true; }
    if (!$('scr-hotdogs').hidden) { this.action('hotdogs-close'); return true; }
    if (!$('scr-worlddone').hidden) { this.action('wd-continue'); return true; }
    if (!$('scr-win').hidden) { this.action('levels'); return true; }
    if (!$('scr-pause').hidden) { this.action('resume'); return true; }
    if (app.game && !app.game.attract) { this.action('pause'); return true; }
    const prev = this.stack.pop();
    if (prev) { this.show(prev, false); return true; }
    if (this.current && this.current !== 'scr-title') { this.show('scr-title', false); return true; }
    return false;
  }

  action(act, el) {
    const app = this.app;
    // while a forced ad is starting after NEXT, the win card's other buttons must not act
    if (this._leaving && (act === 'replay' || act === 'levels' || act === 'next')) return;
    switch (act) {
      case 'play':
        // brand-new players go straight into the first level
        if (app.save.unlocked <= 1 && !app.save.stars[0]) { this.stack = ['scr-title', 'scr-worlds']; this.worldIndex = 0; app.startLevel(0); }
        else this.show('scr-worlds');
        break;
      case 'skins': this.show('scr-skins'); break;
      case 'shop': this.show('scr-shop'); break;
      case 'hotdogs': this.openPacks(); break;
      case 'hotdogs-close': this.closePacks(); break;
      case 'shop-reset-test': app.shop.resetTestPurchases(); this.toast('Test purchases cleared'); break;
      case 'settings': this.show('scr-settings'); break;
      case 'back': { const prev = this.stack.pop() || 'scr-title'; this.show(prev, false); break; }
      case 'pause': app.pause(true); this.syncToggles(); this.renderAim(); $('scr-pause').hidden = false; break;
      case 'resume': $('scr-pause').hidden = true; app.pause(false); break;
      case 'restart': $('scr-pause').hidden = true; $('scr-win').hidden = true; app.restartLevel(); break;
      case 'overview': app.game && app.game.toggleOverview(); if (app.game && app.game.overview) $('hud-tip').hidden = true; break;
      case 'hint': this.hint(); break;
      case 'skip': this.offerSkip(); break;
      case 'long-aim': this.longAim(); break;
      case 'levels':
        if (!$('scr-win').hidden) { this.leaveWin(() => app.nextLevel('levels')); break; }
        $('scr-pause').hidden = true; app.toMenu('scr-levels'); break;
      case 'home': $('scr-pause').hidden = true; app.toMenu('scr-title'); break;
      case 'replay': $('scr-win').hidden = true; app.restartLevel(); break;
      case 'next': this.leaveWin(() => app.nextLevel()); break;
      case 'wd-continue': $('scr-worlddone').hidden = true; app.afterWorldDone(); break;
      case 'reset': this.confirm('Erase all stars and progress?', () => { app.resetProgress(); this.toast('Progress reset'); }); break;
      case 'confirm-yes': $('scr-confirm').hidden = true; this._confirmCb && this._confirmCb(); break;
      case 'confirm-no': $('scr-confirm').hidden = true; this._confirmNo && this._confirmNo(); break;
      case 'privacy': $('privacy-text').innerHTML = privacyHtml(PLATFORM); $('scr-privacy').hidden = false; $('privacy-text').scrollTop = 0; break;
      case 'privacy-close': $('scr-privacy').hidden = true; break;
      case 'privacy-choices': app.ads.showPrivacyOptions(); break;
      case 'ad-preview': app.ads.preview(el.dataset.kind).then(() => this.renderAdTest()); break;
    }
  }

  confirm(text, cb, { yes = 'Yes', no = null } = {}) {
    $('confirm-text').textContent = text;
    $('confirm-yes').textContent = yes;
    this._confirmCb = cb; this._confirmNo = no;
    $('scr-confirm').hidden = false;
  }

  // ------------------------------------------------------------ ads
  // Leaving the level-complete card (Next / Levels) is the only place a forced ad may appear;
  // the card stays up underneath so nothing jumps while the ad loads.
  async leaveWin(go) {
    if (this._leaving) return;
    this._leaving = true;
    try { await this.app.ads.maybeInterstitial(this.app.lastWin || {}); } finally { this._leaving = false; }
    $('scr-win').hidden = true;
    go();
  }

  // The first hint in each world is free; later ones are unlocked with an opt-in reward ad.
  async hint() {
    const app = this.app, g = app.game;
    if (!g || g.attract || this._adBusy || g.phase === 'win') return;
    const w = g.info.worldIndex;
    let msg = null;
    if (app.ads.enabled && !app.ads.hintIsFree(w)) {
      this._adBusy = true;
      const r = await app.ads.rewarded('hint').finally(() => { this._adBusy = false; });
      if (app.game !== g) return;
      if (r === 'closed') { this.toast('Watch the whole ad to unlock the hint', 2400); return; }
      if (r === 'nofill') msg = 'No ad right now — this hint is on the house!';
    } else if (app.ads.enabled) {
      app.ads.useFreeHint(w);
      msg = 'Free hint! Follow the dotted route.';
    }
    g.useHint();
    const timed = g.sim.bodies.some(b => b.kinematic || b.timer);
    this.toast(msg || (timed ? 'Follow the route — and time it with the moving parts!' : 'Follow the dotted route!'), 2600);
  }

  // After 10 flips that didn't win an unbeaten level: watch a reward ad to move on (no stars, come back anytime).
  offerSkip() {
    const app = this.app, g = app.game;
    if (!g || g.attract || this._adBusy || !app.ads.canOfferSkip(g)) return;
    app.pause(true);
    const viaAd = app.ads.enabled;
    this.confirm(viaAd ? 'Stuck? Watch a short ad to skip to the next level. You can come back for the stars anytime.'
      : 'Skip to the next level? You can come back for the stars anytime.', async () => {
      this._adBusy = true;
      const r = viaAd ? await app.ads.rewarded('skip').finally(() => { this._adBusy = false; }) : 'nofill';
      this._adBusy = false;
      if (app.game !== g) return;
      if (r === 'closed') { if ($('scr-pause').hidden) app.pause(false); this.toast('Watch the whole ad to skip', 2400); return; }
      app.skipLevel();
    }, { yes: viaAd ? '▶ Watch ad' : 'Skip', no: () => { if ($('scr-pause').hidden) app.pause(false); } });
  }

  // Long aim guide: one reward ad turns it on for 10 minutes (real time).
  async longAim() {
    const app = this.app;
    if (this._adBusy) return;
    if (app.ads.longAimActive()) { this.toast(`🎯 Long aim guide is on — ${fmtTime(app.ads.longAimLeft())} left`); return; }
    this._adBusy = true;
    const r = await app.ads.unlockLongAim().finally(() => { this._adBusy = false; });
    if (r === 'closed') { this.toast('Watch the whole ad to unlock the long aim guide', 2400); return; }
    this._aimWasOn = true;
    this.renderAim();
    this.toast(`🎯 Long aim guide on for ${app.ads.rules.longAimMinutes} minutes!`, 2400);
  }

  tickAim() {
    const ads = this.app.ads;
    if (!ads) return;
    const on = ads.longAimActive();
    const g = this.app.game;
    if (this._aimWasOn && !on && g && !g.attract) this.toast('🎯 Long aim guide ended — watch an ad to turn it back on', 2800);
    this._aimWasOn = on;
    this.renderAim();
  }

  renderAim() {
    const ads = this.app.ads;
    if (!ads) return;
    const left = ads.longAimLeft(), on = left > 0, t = fmtTime(left);
    document.querySelectorAll('.aim-booster').forEach(b => {
      b.classList.toggle('on', on);
      b.querySelector('.aim-state').textContent = on ? `On · ${t} left` : `Longer aim line · ${ads.rules.longAimMinutes} min`;
      b.querySelector('.aim-cta').textContent = on ? '✓ ON' : ads.enabled ? '▶ AD' : 'TURN ON';
    });
    $('hud-aim').hidden = !on;
    $('hud-aim-time').textContent = t;
  }

  renderAdTest() {
    const box = $('ad-test');
    box.hidden = !this.app.ads.testing;
    $('shop-reset-test').hidden = this.app.shop.kind !== 'test';
    if (!box.hidden) $('ad-status').textContent = this.app.ads.status();
  }

  trophyToast(a) {
    const t = document.getElementById('trophy');
    t.innerHTML = `<span class="ti">${a.icon}</span><span><small>TROPHY UNLOCKED</small><b>${a.name}</b></span>`;
    t.style.top = ''; t.style.scale = '';
    t.hidden = false;
    // Over an open card (the level-complete card on a short phone): above the card's title ribbon if there is
    // room, else under the card, else a little smaller at the very top — never on top of the title.
    const card = [...document.querySelectorAll('.modal:not([hidden]) > .card')].pop();
    const msg = $('toast');
    if (!msg.hidden) t.style.top = `${msg.getBoundingClientRect().bottom + 8}px`; // under a message that is showing
    else if (card) {
      const r = card.getBoundingClientRect(), h = t.offsetHeight, base = parseFloat(getComputedStyle(t).top), sat = base - 86;
      const ceil = r.top - 30; // the ribbon sticks out above the card
      if (base + h > ceil - 6) {
        if (ceil - 6 - h >= sat + 4) t.style.top = `${ceil - 6 - h}px`;
        else if (r.bottom + 10 + h <= innerHeight - 8) t.style.top = `${r.bottom + 10}px`;
        else { t.style.top = `${sat + 2}px`; t.style.scale = '0.8'; }
      }
    }
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
      const skipped = unlocked && !stars && !!app.save.skipped[i];
      b.className = 'lvl' + (unlocked ? '' : ' locked') + (unlocked && !stars && !skipped ? ' current' : '') + (skipped ? ' skipped' : '') + (k === 19 ? ' boss' : '');
      b.innerHTML = `<span>${k + 1}</span><span class="s">${[0, 1, 2].map(j => j < stars ? '<b>★</b>' : '★').join('')}</span>`;
      b.setAttribute('aria-label', `Level ${k + 1}${unlocked ? (skipped ? ' skipped' : '') : ' locked'}`);
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
      const on = app.save.skin === s.id && !app.shop.characterItem();
      d.className = 'skin' + (on ? ' on' : '') + (unlocked ? '' : ' locked');
      d.innerHTML = `<canvas width="240" height="120"></canvas><div class="nm">${unlocked ? s.name : '???'}</div><div class="req">${unlocked ? (on ? '' : 'Tap to equip') : `<span class="star">★</span> ${s.stars} stars`}</div>`;
      drawSkinPreview(d.querySelector('canvas'), s);
      d.addEventListener('click', () => {
        if (!unlocked) { app.audio.play('tap'); this.toast(`Collect ${s.stars - stars} more ★`); return; }
        app.save.skin = s.id; app.shop.equip('sausage'); app.audio.play('unlock'); this.renderSkins();
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

  // ------------------------------------------------------------ shop
  renderShop() {
    const app = this.app, shop = app.shop;
    const grid = $('shop-grid');
    grid.innerHTML = '';
    $('shop-wallet').hidden = !shop.available;
    $('shop-balance').textContent = fmt(shop.balance);
    $('shop-note').textContent = shop.available
      ? `Every character is ${hd(SKIN_PRICE)}. Same size and bounce as the sausage, so every level plays exactly the same.`
      : 'Characters can be unlocked in the Sizzle Flip app. Same size and bounce as the sausage, so every level plays the same.';
    // tabs: the seven categories, all bundles, and what the player owns
    const offers = [ALL, ...CATEGORIES.map(c => c.id)].map(b => shop.bundleOffer(b));
    const tabs = [...CATEGORIES.map(c => ({ ...c, n: ITEMS.filter(i => i.cat === c.id).length })),
      { id: 'bundles', name: 'Bundles', icon: '🎁', n: offers.filter(o => o.open).length },
      { id: 'owned', name: 'Owned', icon: '✓', n: shop.ownedCount() + 1 }];
    if (!this.shopTab || !tabs.some(t => t.id === this.shopTab)) this.shopTab = 'food';
    const bar = $('shop-tabs');
    bar.innerHTML = '';
    for (const t of tabs) {
      const b = document.createElement('button');
      b.className = 'shop-tab' + (t.id === this.shopTab ? ' on' : '');
      b.dataset.tab = t.id;
      b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', t.id === this.shopTab);
      b.innerHTML = `<span class="ti">${t.icon}</span>${t.name}<small>${t.n}</small>`;
      b.addEventListener('click', (e) => { e.stopPropagation(); app.audio.play('tap'); this.shopTab = t.id; $('shop-scroll').scrollTop = 0; this.renderShop(); });
      bar.appendChild(b);
    }
    requestAnimationFrame(() => { const on = bar.querySelector('.on'); if (on) bar.scrollLeft = on.offsetLeft - (bar.clientWidth - on.clientWidth) / 2; });
    // this tab's bundle, while it still unlocks at least two characters
    const slot = $('shop-bundle-slot');
    slot.innerHTML = '';
    const tabOffer = shop.available && offers.find(o => o.id === this.shopTab);
    if (tabOffer && tabOffer.open) slot.appendChild(this.bundleEl(tabOffer));
    grid.classList.toggle('bundle-list', this.shopTab === 'bundles');
    if (this.shopTab === 'bundles') { for (const o of offers) grid.appendChild(this.bundleEl(o)); return; }
    // cards
    const current = shop.characterItem();
    const card = (id, name, desc, draw, state) => {
      const d = document.createElement('div');
      d.className = 'skin shop-card' + (state === 'equipped' ? ' on' : '') + (state === 'equip' ? ' owned' : '');
      d.dataset.item = id;
      const label = state === 'equipped' ? '' : state === 'equip' ? 'EQUIP' : state === 'buy' ? hd(SKIN_PRICE) : 'IN THE APP';
      d.innerHTML = `<canvas width="240" height="120"></canvas><div class="nm">${name}</div><div class="ds">${desc}</div>` +
        (label ? `<button class="btn ${state === 'buy' ? 'btn-relish' : state === 'equip' ? 'btn-sky' : 'btn-ghost'} shop-btn"${state === 'app' ? ' disabled' : ''}><span>${label}</span></button>` : '');
      draw(d.querySelector('canvas'));
      const btn = d.querySelector('.shop-btn');
      if (btn && state !== 'app') btn.addEventListener('click', (e) => { e.stopPropagation(); app.audio.play('click'); this.shopAction(id, state); });
      grid.appendChild(d);
    };
    const list = this.shopTab === 'owned' ? ITEMS.filter(i => shop.isOwned(i.id)) : ITEMS.filter(i => i.cat === this.shopTab);
    if (this.shopTab === 'owned') {
      const skin = SKINS.find(s => s.id === app.save.skin) || SKINS[0];
      card('sausage', 'Sausage', 'The original. Change its skin in the Locker.', (c) => drawSkinPreview(c, skin), current ? 'equip' : 'equipped');
    }
    for (const it of list) {
      const owned = shop.isOwned(it.id);
      const state = owned ? (current && current.id === it.id ? 'equipped' : 'equip') : shop.available ? 'buy' : 'app';
      card(it.id, it.name, it.desc, (c) => drawSkinPreview(c, null, it), state);
    }
  }

  // a bundle banner / row. o = shop.bundleOffer(id)
  bundleEl(o) {
    const shop = this.app.shop;
    const cat = CATEGORIES.find(c => c.id === o.id);
    const d = document.createElement('div');
    d.className = 'shop-bundle' + (o.id === ALL ? ' all' : '') + (o.n ? '' : ' done');
    d.dataset.bundle = o.id;
    const sub = !o.n ? `All ${o.total} owned`
      : !o.open ? `1 left: get it in the ${cat ? cat.name : 'shop'} tab`
      : `${o.n === o.total ? `All ${o.total}` : `The ${o.n} missing`} characters · <span class="nw">save ${hd(o.full - o.cost)}</span>`;
    const btn = !o.n ? '<span class="sb-done">✓</span>' : !o.open ? ''
      : shop.available ? `<button class="btn btn-relish shop-btn"><span>${hd(o.cost)}</span></button>`
      : '<button class="btn btn-ghost shop-btn" disabled><span>IN THE APP</span></button>';
    d.innerHTML = `<span class="sb-ico">${cat ? cat.icon : '🎁'}</span><span class="sb-txt"><b>${o.name}</b><small>${sub}</small></span>${btn}`;
    const b = d.querySelector('.shop-btn:not([disabled])');
    if (b) b.addEventListener('click', (e) => { e.stopPropagation(); this.app.audio.play('click'); this.spendOn({ bundle: o.id }); });
    return d;
  }

  shopAction(id, state) {
    const app = this.app;
    if (state === 'equip') { app.shop.equip(id); app.audio.play('unlock'); this.renderShop(); return; }
    if (state === 'buy') this.spendOn({ item: id });
  }

  // what a purchase target costs: { item: id } or { bundle: tab id | ALL }
  describeTarget(t) {
    const shop = this.app.shop;
    if (t.item) { const it = ITEM_BY_ID[t.item]; return it && !shop.isOwned(t.item) ? { name: it.name, cost: SKIN_PRICE, ask: `Buy ${it.name} for ${hd(SKIN_PRICE)}?` } : null; }
    const o = shop.bundleOffer(t.bundle);
    if (!o.open) return null;
    const cat = CATEGORIES.find(c => c.id === t.bundle);
    return { name: `the ${o.name}`, cost: o.cost, n: o.n,
      ask: `Buy the ${o.name} for ${hd(o.cost)}?\nIt unlocks ${o.n === o.total ? `all ${o.n}` : `the ${o.n} missing`} ${cat ? cat.name + ' ' : ''}characters and saves you ${hd(o.full - o.cost)}.` };
  }

  // spend Hot Dogs after a confirmation, or offer Hot Dog packs when there aren't enough
  async spendOn(target) {
    const shop = this.app.shop;
    await shop.walletReady;
    const t = shop.available && this.describeTarget(target);
    if (!t) return;
    if (shop.balance < t.cost) { this.openPacks(target); return; }
    this.confirm(`${t.ask}\nYou have ${hd(shop.balance)}.`, () => this.doSpend(target, t), { yes: 'Buy' });
  }

  async doSpend(target, t) {
    const app = this.app;
    const r = target.bundle ? await app.shop.unlockBundle(target.bundle, t.cost) : await app.shop.unlock(target.item);
    if (r === 'bought') {
      app.audio.play('unlock'); app.haptic([10, 30, 10]);
      this.toast(target.bundle ? `🎁 ${t.n} characters unlocked! Pick one in the Owned tab` : `🎉 ${t.name} unlocked and equipped!`, 2800);
      if (target.bundle === ALL) this.shopTab = 'owned';
    } else if (r === 'short') this.openPacks(target);
    else if (r === 'changed') this.toast('That bundle changed. Take another look', 2400);
    if (!$('scr-shop').hidden) this.renderShop();
  }

  // ------------------------------------------------------------ Hot Dog packs
  openPacks(want = null) {
    this._want = want;
    this.renderPacks();
    $('scr-hotdogs').hidden = false;
    this.app.shop.refresh();
  }

  closePacks() { $('scr-hotdogs').hidden = true; this._want = null; }

  renderPacks() {
    const shop = this.app.shop;
    const want = this._want && this.describeTarget(this._want);
    $('hd-balance').textContent = fmt(shop.balance);
    const short = want ? Math.max(0, want.cost - shop.balance) : 0;
    const need = $('hd-need');
    need.hidden = !short;
    if (short) need.textContent = `You need ${hd(short)} more for ${want.name}.`;
    const fit = short ? PACKS.find(p => p.hotdogs >= short) || PACKS[PACKS.length - 1] : null;
    const grid = $('hd-grid');
    grid.innerHTML = '';
    PACKS.forEach((p, i) => {
      const b = document.createElement('button');
      b.className = 'hd-pack' + (fit === p ? ' fit' : '');
      b.dataset.pack = p.id;
      b.disabled = !shop.available;
      const chars = p.hotdogs / SKIN_PRICE;
      b.innerHTML = `<span class="hp-ico">${PACK_ICONS[i] || '🌭'}</span><b>${fmt(p.hotdogs)}</b><small>${chars} character${chars === 1 ? '' : 's'}</small><span class="hp-price">${shop.available ? shop.packPrice(p.id) : 'In the app'}</span>`;
      b.addEventListener('click', (e) => { e.stopPropagation(); this.app.audio.play('click'); this.buyPack(p.id); });
      grid.appendChild(b);
    });
    $('hd-note').textContent = shop.available
      ? `${HOTDOGS_PER_DOLLAR} Hot Dogs = ${shop.packPrice(PACKS[0].id)} · every character is ${hd(SKIN_PRICE)}. Hot Dogs and characters are kept on this device.`
      : 'Hot Dogs can be bought in the Sizzle Flip app.';
  }

  async buyPack(pid) {
    const app = this.app, shop = app.shop;
    if (this._buying) return;
    this._buying = true;
    const btn = document.querySelector(`.hd-pack[data-pack="${pid}"] .hp-price`);
    if (btn) btn.textContent = '…';
    const { r, n } = await shop.buyPack(pid).finally(() => { this._buying = false; });
    if (r === 'bought') {
      app.audio.play('unlock'); app.haptic([10, 30, 10]);
      this.toast(n ? `🌭 +${fmt(n)} Hot Dogs!` : '🌭 Your Hot Dogs are in', 2400);
      const want = this._want && this.describeTarget(this._want);
      // the player opened this to afford something: offer it right away
      if (want && shop.balance >= want.cost) { const t = this._want; this.closePacks(); this.spendOn(t); }
    } else if (r === 'pending') this.toast('Payment pending: your Hot Dogs arrive as soon as it completes', 3400);
    else if (r === 'stuck') this.toast('Your last purchase of this pack is still being delivered. Try again in a moment', 3400);
    else if (r === 'error') this.toast('Purchase didn\'t go through. Please try again', 2600);
    else if (r === 'unavailable') this.toast('The store isn\'t available right now', 2400);
    if (!$('scr-hotdogs').hidden) this.renderPacks();
    if (!$('scr-shop').hidden) this.renderShop();
  }

  // Hot Dogs arrived outside a tap (a pending payment cleared, a purchase interrupted earlier)
  onCredited(n) { this.toast(`🌭 +${fmt(n)} Hot Dogs added`, 2600); }

  // the wallet changed (purchase, bundle, restored backup)
  onShopChanged() {
    if (!$('scr-shop').hidden) this.renderShop();
    if (!$('scr-skins').hidden) this.renderSkins();
    if (!$('scr-hotdogs').hidden) this.renderPacks();
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
    if (tip && !this.tipCrowded()) {
      tipEl.innerHTML = tip;
      tipEl.hidden = false;
      this._tipT = setTimeout(() => { tipEl.hidden = true; }, 6500);
    } else tipEl.hidden = true;
  }

  hideHud() { $('hud').hidden = true; }

  tipCrowded() { return innerWidth < 400 && (!$('hud-hint').hidden || !$('hud-skip').hidden); }

  updateHud(game) {
    const el = $('hud-flips');
    if (el.textContent !== String(game.flips)) {
      el.textContent = game.flips;
      el.parentElement.classList.remove('bump'); void el.parentElement.offsetWidth; el.parentElement.classList.add('bump');
    }
    const stars = this.app.starsFor(Math.max(game.flips, 1), game.info.par);
    // while playing: the stars still possible (another flip is needed); once won: the stars earned
    const projected = game.phase === 'win' ? this.app.starsFor(game.flips, game.info.par) : game.flips < game.info.par ? 3 : this.app.starsFor(game.flips + 1, game.info.par);
    $('hud-stars').innerHTML = [0, 1, 2].map(j => j < projected ? '★' : '<span class="off">★</span>').join('');
    const ads = this.app.ads;
    const hint = $('hud-hint');
    const ready = game.hintReady();
    const paidHint = ads.enabled && !ads.hintIsFree(game.info.worldIndex);
    $('hint-ad').hidden = !paidHint;
    if (ready && hint.hidden) { hint.hidden = false; this.toast(paidHint ? 'Stuck? Tap 💡 to watch an ad for a hint' : 'Stuck? Tap 💡 for a free hint'); }
    else if (!ready) hint.hidden = true;
    if ((game.fails || 0) >= 5 && !this._aimTipShown && !ads.longAimActive()) {
      this._aimTipShown = true;
      this.toast('Tip: Pause ❚❚ → 🎯 Long aim guide shows more of your flip', 3200);
    }
    const skip = $('hud-skip');
    const canSkip = ads.canOfferSkip(game);
    $('skip-ad').hidden = !ads.enabled;
    if (canSkip && skip.hidden) { skip.hidden = false; this.toast('Still stuck? Tap ⏭ to skip this level', 2600); }
    else if (!canSkip) skip.hidden = true;
    // on a narrow phone the level tip and the hint / skip buttons don't fit side by side: the buttons win
    if (this.tipCrowded()) $('hud-tip').hidden = true;
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

export function drawSkinPreview(c, skin, item = null) {
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  const s = c.width / 240;
  ctx.save();
  ctx.scale(s * 1.25, s * 1.25);
  const N = 10, px = new Float64Array(N), py = new Float64Array(N);
  for (let i = 0; i < N; i++) { px[i] = 42 + i * 11; py[i] = 52 - Math.sin(i / (N - 1) * Math.PI) * 8; }
  const face = makeFaceState(); face.expr = 'idle'; face.lookX = 1; face.lookY = 0.2;
  if (item) drawItem(ctx, px, py, { R: 15, item, face, t: 0.4 });
  else drawSausage(ctx, px, py, { R: 15, skin, face, t: 0.4 });
  ctx.restore();
}

function fmtTime(ms) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
