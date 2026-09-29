// Tiny Tides — DOM UI (HUD, nav, build dock, inspector, Tidedex, shop, quests, settings, tutorial coach).
import * as D from './data.js';
import * as S from './sim.js';
import * as A from './audio.js';
import { drawSprite, getSilhouette } from './art_creatures.js';
import { PIECE_ART } from './art_world.js';
import { drawProp, drawItemArt } from './art_gacha.js';
import { store, haptic, openUrl, notify } from './platform.js';
import { LINKS, VERSION, POLICY, SITE, LICENSES } from './config.js';
import { createGachaUI } from './gacha_ui.js';

const { FORMS, FAMILIES, PIECES, DECOR, TRAIT_INFO, PRODUCTS } = D;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = (n, c = '') => `<svg class="ic ${c}" aria-hidden="true"><use href="#${n}"/></svg>`;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = S.fmtNum;
const cost = (n, icon = 'i-pearl', cls = 's') => `<span class="cost">${ic(icon, cls)}${fmt(n)}</span>`;
const traitName = (t) => TRAIT_INFO[t].name;
const stageName = (s) => (s === 1 ? 'Baby' : s === 2 ? 'Evolved' : 'Mythic');

export function createUI(G) {
  const scene = G.scene;
  const ui = { G };
  const st = () => G.state;
  const pool = () => G.state.pools[G.biome];
  const now = () => G.now();
  let modals = [];           // stack of {id, el, render, sticky}
  const queue = [];          // modal builders waiting for a quiet moment
  let shopTab = 'glass', shopSub = 'bundles', dexTab = 'tide', tick = 0;

  // ------------------------------------------------------------------ small helpers
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  ui.toast = (msg, kind = '') => {
    const root = $('#toasts');
    while (root.children.length > 2) root.firstChild.remove();
    const t = el(`<div class="toast ${kind}">${esc(msg)}</div>`);
    root.appendChild(t); setTimeout(() => t.remove(), 2700);
  };
  let busyTimer = 0;
  ui.setBusy = (v) => {
    const b = $('#busy'); if (v && !b) $('#app').appendChild(el(`<div class="busy" id="busy"><div class="center">${ic('i-blip')}<div>One moment…</div></div></div>`));
    else if (!v && b) b.remove();
    clearTimeout(busyTimer);
    if (v) busyTimer = setTimeout(() => { G.busy = false; ui.setBusy(false); }, 60000);     // a store call that never answers must not lock the game
  };
  const paintMini = (root = document) => {
    $$('canvas[data-form]', root).forEach((cv) => {
      const c = cv.getContext('2d'), px = Math.round(cv.clientWidth * (window.devicePixelRatio || 1)) || 128;
      if (cv.width !== px) { cv.width = px; cv.height = px; }
      c.clearRect(0, 0, cv.width, cv.height);
      const f = cv.dataset.form, size = cv.width;
      if (cv.dataset.sil) { const s = getSilhouette(f); c.drawImage(s.canvas, 0, 0, size, size); c.fillStyle = 'rgba(255,255,255,.55)'; c.font = `700 ${size * 0.34}px Fredoka, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', size / 2, size * 0.5); }
      else { c.save(); c.translate(size / 2, size * 0.72); drawSprite(c, f, 0, 0, size * 0.98, { hat: cv.dataset.hat || null }); c.restore(); }
    });
    $$('canvas[data-piece]', root).forEach((cv) => {
      const c = cv.getContext('2d'), px = Math.round((cv.clientWidth || 38) * (window.devicePixelRatio || 1)); cv.width = px; cv.height = px; c.clearRect(0, 0, px, px);
      const id = cv.dataset.piece; const s = px * 1.0;
      PIECE_ART[id](c, px / 2, px * 0.78, s * 0.98, 1.2, 3);
    });
    $$('canvas[data-prop]', root).forEach((cv) => {
      const c = cv.getContext('2d'), px = Math.round((cv.clientWidth || 60) * (window.devicePixelRatio || 1)); cv.width = px; cv.height = px; c.clearRect(0, 0, px, px);
      const id = cv.dataset.prop; drawProp(c, id, px / 2, px * 0.8, px * 0.98, 1.2, false);
    });
    $$('canvas[data-hat]', root).forEach((cv) => {
      if (cv.dataset.form) return;
      const c = cv.getContext('2d'), px = Math.round((cv.clientWidth || 44) * (window.devicePixelRatio || 1)); cv.width = px; cv.height = px; c.clearRect(0, 0, px, px);
      c.save(); c.translate(px / 2, px * 0.7); drawSprite(c, 'crab.0', 0, 0, px * 1.05, { hat: cv.dataset.hat }); c.restore();
    });
    let scratch = null;
    $$('canvas[data-toy]', root).forEach((cv) => {
      const px = Math.round((cv.clientWidth || 72) * (window.devicePixelRatio || 1)) || 96;
      if (cv.width !== px) { cv.width = px; cv.height = px; }
      const c = cv.getContext('2d'); c.clearRect(0, 0, px, px);
      if (cv.dataset.sil) {
        const tmp = scratch ||= document.createElement('canvas'); tmp.width = tmp.height = px; const t = tmp.getContext('2d');
        drawItemArt(t, cv.dataset.toy, px / 2, px * 0.46, px * 0.8, 1.2);
        t.globalCompositeOperation = 'source-in'; t.fillStyle = '#5a4a8c'; t.fillRect(0, 0, px, px);
        c.drawImage(tmp, 0, 0); c.fillStyle = 'rgba(255,255,255,.55)'; c.font = `700 ${px * 0.32}px Fredoka, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', px / 2, px * 0.5);
      } else drawItemArt(c, cv.dataset.toy, px / 2, px * 0.46, px * 0.8, 1.2);
    });
    if (scratch) scratch.width = scratch.height = 1;           // give the memory back
    $$('canvas[data-skin]', root).forEach((cv) => {
      const c = cv.getContext('2d'), k = D.SKINS[cv.dataset.skin]; cv.width = 120; cv.height = 120;
      c.fillStyle = k.slab; c.beginPath(); c.roundRect ? c.roundRect(6, 10, 108, 100, 24) : c.rect(6, 10, 108, 100); c.fill();
      c.fillStyle = k.sand; c.beginPath(); c.roundRect ? c.roundRect(10, 10, 100, 88, 22) : c.rect(10, 10, 100, 88); c.fill();
      c.fillStyle = k.wet; c.beginPath(); c.arc(60, 54, 32, 0, 7); c.fill(); c.fillStyle = k.shallow; c.beginPath(); c.arc(60, 54, 27, 0, 7); c.fill(); c.fillStyle = k.deep; c.beginPath(); c.arc(60, 54, 15, 0, 7); c.fill();
      c.strokeStyle = '#3b1d5e'; c.lineWidth = 5; c.beginPath(); c.roundRect ? c.roundRect(10, 10, 100, 88, 22) : c.rect(10, 10, 100, 88); c.stroke();
    });
  };

  // ------------------------------------------------------------------ static chrome
  function buildChrome() {
    $('#hud').innerHTML = `
      <div class="hud-row">
        <button class="pill level" data-act="levelinfo" aria-label="Pool level"><b>Lv <span id="h-lv">1</span><span id="h-xp"></span></b><div class="xp"><i id="h-xpbar"></i></div></button>
        <div class="spacer"></div>
        <div class="pill" id="h-pearls" aria-label="Pearls">${ic('i-pearl')}<span>0</span></div>
        <button class="pill plus" id="h-glass" data-act="shop:glass" aria-label="Sea Glass — open shop">${ic('i-glass')}<span>0</span><span class="plusbtn">${ic('i-plus')}</span></button>
        <button class="round" data-act="settings" aria-label="Settings">${ic('i-gear')}</button>
      </div>
      <div class="hud-row sub">
        <div class="chip" id="h-tide">${ic('i-sun')}<span>Morning Tide</span></div>
        <div class="biomes">
          <button class="bio on" data-act="biome:tide" id="b-tide">${ic('i-drop')}Tidepool</button>
          <button class="bio" data-act="biome:deep" id="b-deep">${ic('i-deep')}Deep<span id="b-lock">${ic('i-lock', 's')}</span></button>
        </div>
      </div>`;
    $('#nav').innerHTML = [
      ['pool', 'i-drop', 'Pool'], ['build', 'i-build', 'Build'], ['dex', 'i-book', 'Tidedex'], ['quests', 'i-scroll', 'Quests'], ['shop', 'i-bag', 'Shop'],
    ].map(([id, icon, label]) => `<button class="tab" data-tab="${id}" data-act="tab:${id}" aria-label="${label}">${ic(icon)}<span>${label}</span><i class="dot" hidden></i></button>`).join('');
    $('#fabs').innerHTML = `
      <div class="fab ready" id="fab-collect" hidden><button class="round fab big" data-act="collectall" aria-label="Collect all pearls">${ic('i-pearl')}<span class="badge" id="fab-collect-n">0</span></button></div>
      <div class="fab ready" id="fab-capsule" hidden><button class="round" data-act="gacha" aria-label="Capsule Machine">${ic('i-capsule')}<span class="badge" id="fab-capsule-n">!</span></button></div>
      <div class="fab ready" id="fab-gift" hidden><button class="round" data-act="gift" aria-label="Open Tide Gift">${ic('i-gift')}<span class="badge">!</span></button></div>
      <div class="fab opt"><button class="round" data-act="snap" aria-label="Take a picture">${ic('i-camera')}</button></div>`;
  }

  // ------------------------------------------------------------------ HUD & chrome updates (cheap, run ~4x/sec)
  let last = {};
  const setText = (sel, v) => { const k = sel; if (last[k] !== v) { last[k] = v; const e = $(sel); if (e) e.textContent = v; } };
  function updateHud() {
    const s = st(), n = now();
    setText('#h-pearls span', fmt(s.cur.pearls));
    setText('#h-glass span', fmt(s.cur.glass));
    setText('#h-lv', String(s.lvl));
    const need = D.xpForLevel(s.lvl);
    setText('#h-xp', s.lvl >= D.MAX_POOL_LVL ? 'MAX' : `${s.xp}/${need}`);
    const xb = $('#h-xpbar'); if (xb) xb.style.width = `${s.lvl >= D.MAX_POOL_LVL ? 100 : Math.min(100, s.xp / need * 100)}%`;
    const spring = S.springTide(n), hour = new Date(n).getHours();
    const w = S.giftWindow(n);
    const night = hour >= 20 || hour < 6;
    const label = G.biome === 'deep' ? 'Deep Ocean' : spring.on ? `Spring Tide · ${spring.kind}` : (night ? 'Night Tide' : w.name);
    const icon = G.biome === 'deep' ? 'i-deep' : night ? 'i-moon' : 'i-sun';
    const chip = $('#h-tide');
    if (chip && (last.chip !== label + icon)) { last.chip = label + icon; chip.innerHTML = `${ic(icon)}<span>${esc(label)}</span>`; chip.classList.toggle('spring', spring.on); chip.title = spring.on ? '+25% pearls and faster eggs' : ''; }
    $('#b-deep').classList.toggle('locked', !s.iap.deep);
    $('#b-lock').hidden = !!s.iap.deep;
    $('#b-tide').classList.toggle('on', G.biome === 'tide');
    $('#b-deep').classList.toggle('on', G.biome === 'deep');
    // fabs
    const ready = G.readyPearls(), nReady = pool().creatures.filter((c) => c.stored >= 1 && !c.evo).length;
    const fc = $('#fab-collect'); fc.hidden = !(nReady >= 2 && ready >= 20) || !!document.body.dataset.tut;
    setText('#fab-collect-n', `+${fmt(ready)}`);
    $('#fab-gift').hidden = !(s.tut.done && S.giftAvailable(s, n));
    const capFab = $('#fab-capsule'), capReady = s.tut.done && (S.gachaFreeAvailable(s, n) || s.cur.coins > 0);
    capFab.hidden = !s.tut.done; capFab.classList.toggle('ready', !!capReady);
    setText('#fab-capsule-n', S.gachaFreeAvailable(s, n) ? '!' : String(s.cur.coins));
    $('#fab-capsule .badge').hidden = !capReady;
    // nav
    $$('#nav .tab').forEach((t) => {
      const id = t.dataset.tab, open = modals.some((m) => m.id === id);
      t.classList.toggle('on', open || (!modals.length && G.tab === id) || (!modals.length && id === 'pool' && G.tab === 'pool'));
      const dot = $('.dot', t);
      let show = false;
      if (id === 'quests') show = S.dailyAvailable(s, n) || S.giftAvailable(s, n) || S.gachaFreeAvailable(s, n) || s.quests.list.some((q) => q.done && !q.claimed);
      if (id === 'dex') show = D.DEX_MILESTONES.some((m, i) => !s.dexClaimed.includes(i) && S.dexCount(s) >= m.n);
      if (id === 'shop') show = !s.iap.starter && s.tut.done && false;
      if (dot) dot.hidden = !show;
    });
    updateStats(s, n);
    if (G.selected && sheetOpen && tick % 2 === 0) updateSheetLive();
  }

  let statsSig = '';
  function updateStats(s, n) {
    const el0 = $('#stats'), show = G.tab === 'pool' && !sheetOpen && s.tut.done && !modals.length;
    if (el0.classList.contains('show') !== show) { el0.classList.toggle('show', show); setTimeout(() => ui.layoutChanged(), 0); }
    if (!show) return;
    const p = pool(), rate = S.totalRate(s, n), pop = S.population(p), cap = S.popCap(s, p);
    const egg = pop >= cap ? 'Pool full' : `Egg in ${S.fmtDur(Math.max(0, p.nextEgg - n))}`;
    const spring = S.springTide(n).on;
    const sig = `${Math.round(rate)}|${pop}|${cap}|${egg}|${spring}`;
    if (sig === statsSig) return;
    statsSig = sig;
    el0.innerHTML = `<div class="chip">${ic('i-pearl')}<span>${fmt(rate)}/h${spring ? ' ✦' : ''}</span></div><div class="chip">${ic('i-heart')}<span>${pop}/${cap} friends</span></div><div class="chip">${ic('i-sparkle')}<span>${egg}</span></div>`;
  }

  // ------------------------------------------------------------------ Build dock
  ui.refreshDock = () => { renderDock(); };
  function toolBtn(tool, inner, label, price, extra = '') {
    return `<button class="tool ${G.tool === tool ? 'on' : ''} ${extra}" data-act="tool:${tool}" aria-label="${esc(label)}">${inner}<span>${esc(label)}</span>${price ? `<span class="price">${price}</span>` : ''}</button>`;
  }
  function renderDock() {
    const dock = $('#dock'), s = st(), biome = G.biome, B = D.BIOMES[biome];
    const open = G.tab === 'build';
    if (!open) { dock.classList.remove('open'); return; }
    const ex = S.expandInfo(s, biome);
    let h = '<div class="dock-in">';
    h += toolBtn('dig', ic('k-dig'), 'Dig', cost(B.digCost[1], 'i-pearl', 's'));
    h += toolBtn('fill', ic('k-fill'), 'Fill', '');
    h += '<i class="dock-div"></i>';
    for (const id of D.PIECES_BY_BIOME[biome]) {
      const pc = PIECES[id], locked = !S.pieceUnlocked(s, id);
      h += `<button class="tool ${G.tool === 'piece:' + id ? 'on' : ''} ${locked ? 'lock' : ''}" data-act="tool:piece:${id}" aria-label="${esc(pc.name)}"><canvas data-piece="${id}" style="width:38px;height:38px"></canvas><span>${esc(pc.short || pc.name)}</span><span class="price">${cost(pc.cost, 'i-pearl', 's')}</span>${locked ? `<i class="lk">${ic('i-lock', 's')}${pc.unlock}</i>` : ''}</button>`;
    }
    h += '<i class="dock-div"></i>';
    const decorId = G.tool?.startsWith('decor:') ? G.tool.slice(6) : null;
    h += `<button class="tool ${decorId ? 'on' : ''}" data-act="decorpicker" aria-label="Decor">${decorId ? `<canvas data-prop="${decorId}" style="width:38px;height:38px"></canvas>` : ic('k-decor')}<span>Decor</span></button>`;
    h += toolBtn('erase', ic('k-erase'), 'Erase', '');
    if (ex) h += `<button class="tool sep ${ex.lvlOk ? '' : 'lock'}" data-act="expand" aria-label="Expand pool">${ic('k-expand')}<span>${ex.w}×${ex.h}</span><span class="price">${cost(ex.cost, 'i-pearl', 's')}</span>${ex.lvlOk ? '' : `<i class="lk">${ic('i-lock', 's')}${ex.lvl}</i>`}</button>`;
    h += '</div>';
    if (dock.dataset.sig !== h) { dock.dataset.sig = h; dock.innerHTML = h; paintMini(dock); }
    dock.classList.add('open');
  }

  // ------------------------------------------------------------------ layout → scene insets
  let sheetOpen = false;
  ui.layoutChanged = () => {
    const W = window.innerWidth, H = window.innerHeight, dpr = window.devicePixelRatio || 1;
    const hud = $('#hud').getBoundingClientRect(), nav = $('#nav').getBoundingClientRect();
    let top = hud.bottom + 6, bottom = H - nav.top + 6;
    const cs = (e) => parseFloat(getComputedStyle(e).bottom) || 84;
    if (sheetOpen) { const sh = $('#sheet'); bottom = cs(sh) + sh.offsetHeight + 6; }
    else if (G.tab === 'build') { renderDock(); const d = $('#dock'); bottom = cs(d) + d.offsetHeight + 4; }
    else { const stt = $('#stats'); if (stt.classList.contains('show')) bottom = cs(stt) + 34 + 6; }
    const coach = $('#coach .coach');   // measure the layout box, not the animated rect (it slides in with a transform)
    if (coach) top = Math.max(top, $('#coach').getBoundingClientRect().top + coach.offsetHeight + 6);
    const ins = { top, bottom: Math.max(bottom, 80) };
    if (scene.W !== W || scene.H !== H || scene.dpr !== Math.min(dpr || 1, scene.battery ? 1.5 : 2.5)) scene.resize(W, H, dpr, ins);
    else scene.setInsets(ins);
    if (!sheetOpen) renderDock();
  };

  // ------------------------------------------------------------------ Inspector sheet
  ui.closeSheet = () => { sheetOpen = false; $('#sheet').classList.remove('open'); G.selected = null; scene.selected = null; ui.layoutChanged(); };
  ui.openSheet = (id) => { G.select(id); sheetOpen = true; renderSheet(); $('#sheet').classList.add('open'); ui.layoutChanged(); };
  ui.refreshSheet = () => { if (sheetOpen) renderSheet(); };
  function habitatRelevant(c, info) {
    if (info.stage === 1) return new Set(info.branches.map((b) => b.trait));
    if (info.mythic) return new Set([info.mythic.trait, info.mythic.second]);
    return new Set();
  }
  const traitUnlockLvl = (trait, biome) => {
    if (biome === 'deep') return 1;
    let m = 99;
    for (const id of D.PIECES_BY_BIOME.tide) if (PIECES[id].tr[trait]) m = Math.min(m, PIECES[id].unlock);
    if (trait === 'depth') m = Math.min(m, D.BIOMES.tide.deepUnlock);
    if (trait === 'calm') m = 1;
    return m;
  };
  let sheetTab = 'evo';
  function renderSheet() {
    const sh = $('#sheet'), c = pool().creatures.find((k) => k.id === G.selected);
    if (!c) { ui.closeSheet(); return; }
    const s = st(), p = pool(), f = FORMS[c.form], fam = FAMILIES[f.fam], n = now();
    const info = S.evoInfo(s, p, c), rate = S.creatureRate(s, p, c, n), hap = S.happiness(p, c);
    const rel = habitatRelevant(c, info);
    const lvlMax = S.maxLevel(f.stage), lc = c.lvl < lvlMax ? S.levelCost(f.stage, c.lvl) : 0;
    if (sh.dataset.for !== String(c.id)) sheetTab = window.innerHeight < 720 ? '' : (info.maxed ? 'habitat' : 'evo');   // short screens start collapsed
    if (info.maxed && sheetTab === 'evo') sheetTab = 'habitat';
    const hearts = [0.34, 0.67, 0.95].map((t) => ic(hap >= t ? 'i-heart' : 'i-heart-o')).join('');
    let h = `<button class="round x" data-act="closesheet" aria-label="Close">${ic('i-close')}</button>
      <div class="sh-head"><canvas class="portrait" data-form="${c.form}" ${c.hat ? `data-hat="${c.hat}"` : ''}></canvas>
        <div class="sh-title"><h3>${esc(f.name)}</h3>
          <div class="meta"><span class="pips">${[1, 2, 3].map((i) => `<i class="${i <= f.stage ? 'on' : ''}"></i>`).join('')}</span><span>${stageName(f.stage)}</span><span>Lv ${c.lvl}${c.lvl >= lvlMax ? ' MAX' : ''}</span></div>
          <div class="meta"><span class="hearts" title="Happiness">${hearts}</span><span class="cost">${ic('i-pearl', 's')}${fmt(c.evo ? 0 : rate)}/h</span></div>
        </div></div>`;
    if (c.evo) {
      const total = c.evo.end - c.evo.start, left = Math.max(0, c.evo.end - n), gcost = S.speedUpCost(s, c, n);
      h += `<div class="evo-box mt2"><div class="row between"><span class="muted">Evolving…</span><span class="evo-timer" id="sh-timer">${S.fmtDur(left)}</span></div>
        <div class="prog"><i id="sh-prog" style="width:${Math.min(100, (1 - left / total) * 100)}%"></i></div>
        <div class="rowb">
          <button class="btn lemon small" data-act="speed:glass">${ic('i-clock', 's')} Skip · ${cost(gcost, 'i-glass')}</button>
          ${s.cur.tokens > 0 ? `<button class="btn lav small" data-act="speed:token">${ic('i-token', 's')} −1h (${s.cur.tokens})</button>` : ''}
          ${S.freeFinishAvailable(s, n) ? `<button class="btn green small" data-act="speed:free">Free finish</button>` : ''}
        </div></div>`;
    } else {
      let evoBtn = '';
      if (!info.maxed) {
        const ready = info.reason !== 'level' && info.reason !== 'habitat';
        const label = info.reason === 'level' ? `Reach Lv ${info.needLvl}` : info.reason === 'habitat' ? 'Improve habitat' : 'Evolve';
        evoBtn = `<button class="btn pink btn-evolve col ${info.canStart ? 'pulse' : 'off'}" data-act="evolve">${label}${ready ? `<span class="sub">${cost(info.cost)} · ${S.fmtDur(info.dur)}</span>` : ''}</button>`;
      }
      const lvlBtn = c.lvl >= lvlMax ? `<button class="btn green btn-level off col" data-act="levelup">Max level</button>`
        : `<button class="btn green btn-level col ${s.cur.pearls >= lc ? '' : 'off'}" data-act="levelup">${ic('i-up', 's')} Level up<span class="sub">${cost(lc)}</span></button>`;
      h += `<div class="actions">${lvlBtn}${evoBtn || '<span></span>'}</div>`;
    }
    h += `<div class="sh-tabs">${[['evo', info.maxed ? '' : 'Evolution'], ['habitat', 'Habitat'], ['style', 'Style']].filter((t) => t[1]).map(([id, l]) => `<button class="${sheetTab === id ? 'on' : ''}" data-act="shtab:${id}">${l}</button>`).join('')}</div>${sheetTab ? '<div class="sh-body">' : ''}`;
    if (!sheetTab) { /* collapsed */ }
    else if (sheetTab === 'evo' && !info.maxed) {
      if (info.stage === 1) {
        h += info.branches.map((b) => {
          const known = b.known, lead = info.best && info.best.form === b.form, need = traitUnlockLvl(b.trait, G.biome), locked = need > s.lvl;
          return `<div class="branch ${lead ? 'lead' : ''}"><canvas data-form="${b.form}" ${known ? '' : 'data-sil="1"'}></canvas>
            <div class="bn">${known ? esc(FORMS[b.form].name) : '???'}<small>${ic('t-' + b.trait, 's')} ${traitName(b.trait)} ${D.BRANCH_NEED}+ nearby${locked ? ` · Pool Lv ${need}` : ''}</small></div>
            <div class="st ${b.met ? 'ok' : ''}">${b.met ? (lead ? 'Leading!' : 'Ready') : `${Math.round(b.value)}/${b.need}`}</div></div>`;
        }).join('') + `<p class="muted">Needs Lv ${info.needLvl}. The strongest trait nearby decides the form.</p>`;
      } else {
        const m = info.mythic;
        h += `<div class="branch ${m.met ? 'lead' : ''}"><canvas data-form="${m.form}" ${m.known ? '' : 'data-sil="1"'}></canvas>
          <div class="bn">${m.known ? esc(FORMS[m.form].name) : '???'}<small>${ic('t-' + m.trait, 's')} ${traitName(m.trait)} ${m.need}+ &amp; ${ic('t-' + m.second, 's')} ${traitName(m.second)} ${m.needSecond}+</small></div>
          <div class="st ${m.met ? 'ok' : ''}">${m.met ? 'Ready!' : `${Math.round(m.value)} · ${Math.round(m.secondValue)}`}</div></div>
          <p class="muted">Needs Lv ${info.needLvl} and a legendary habitat nearby.</p>`;
      }
    } else if (sheetTab === 'habitat' || (sheetTab === 'evo' && info.maxed)) {
      h += `<div class="traits">`;
      for (const t of D.TRAITS) {
        const v = info.traits[t], key = rel.has(t);
        const need = info.stage === 1 ? (key ? D.BRANCH_NEED : 0) : (info.mythic && t === info.mythic.trait ? D.MYTHIC_NEED : info.mythic && t === info.mythic.second ? D.MYTHIC_SECOND : 0);
        h += `<div class="trait ${key ? 'key' : ''}">${ic('t-' + t)}<div class="bar"><i style="width:${v}%;background:${TRAIT_INFO[t].color}"></i>${need ? `<u style="left:${need}%"></u>` : ''}</div><em>${Math.round(v)}</em></div>`;
      }
      h += `</div><p class="muted">${info.maxed ? `${esc(f.name)} is fully evolved. ` : ''}${esc(fam.hint)}. Glowing bars matter for its evolution.</p>`;
    } else {
      const hats = D.DECOR_IDS.filter((d) => DECOR[d].kind === 'hat' && s.own[d]);
      h += `<div class="hatrow"><button class="hat ${c.hat ? '' : 'on'}" data-act="hat:" aria-label="No accessory">${ic('i-close', 's')}</button>${hats.map((d) => `<button class="hat ${c.hat === d ? 'on' : ''}" data-act="hat:${d}" aria-label="${esc(DECOR[d].name)}"><canvas data-hat="${d}" style="width:44px;height:44px"></canvas></button>`).join('')}${hats.length ? '' : '<button class="btn small lemon" data-act="shopdecor2">Find hats in the Shop</button>'}</div>
        ${s.tut.done ? '<div class="rowb mt"><button class="btn ghost small danger" data-act="release">Send home</button></div>' : ''}`;
    }
    if (sheetTab) h += '</div>';
    const scroll = $('.sh-body', sh)?.scrollTop || 0;
    sh.innerHTML = h; paintMini(sh); sh.dataset.evo = c.evo ? '1' : '0';
    const nb = $('.sh-body', sh); if (nb && sh.dataset.for === String(c.id)) nb.scrollTop = scroll;
    sh.dataset.for = c.id;
  }
  function updateSheetLive() {
    const c = pool().creatures.find((k) => k.id === G.selected); if (!c) return;
    const sh = $('#sheet');
    if (sh && sh.dataset.evo !== (c.evo ? '1' : '0')) { renderSheet(); return; }        // cocoon finished (or started): rebuild the buttons
    if (c.evo) {
      const n = now(), total = c.evo.end - c.evo.start, left = Math.max(0, c.evo.end - n);
      const t = $('#sh-timer'), p = $('#sh-prog');
      if (t) t.textContent = S.fmtDur(left); if (p) p.style.width = `${Math.min(100, (1 - left / total) * 100)}%`;
    }
  }

  // ------------------------------------------------------------------ Modals
  function mountModal(id, { title, cls = '', render, sticky = false, top = false, noClose = false }) {
    const existing = modals.find((m) => m.id === id);
    if (existing) existing.el.remove(), (modals = modals.filter((m) => m !== existing));
    const root = el(`<div class="overlay ${top ? 'top' : ''}" data-overlay="${id}"><div class="modal ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title || id)}" tabindex="-1"></div></div>`);
    $('#modal-root').appendChild(root);
    const m = { id, el: root, render, sticky, title, noClose, opener: document.activeElement };
    modals.push(m);
    let pressedOnBackdrop = false;
    root.addEventListener('pointerdown', (e) => { pressedOnBackdrop = e.target === root; });
    root.addEventListener('click', (e) => { if (e.target === root && pressedOnBackdrop && !sticky && !noClose) ui.closeModal(id); });
    drawModal(m);
    try { $('.modal', root).focus({ preventScroll: true }); } catch { /* not focusable */ }      // screen readers start inside the dialog
    A.play('whoosh');
    return m;
  }
  function drawModal(m) {
    const box = $('.modal', m.el), prev = $('.mb', box)?.scrollTop || 0, prevTabs = $('.tabs', box)?.scrollLeft || 0;
    const r = m.render();
    box.innerHTML = `${m.title ? `<div class="mh"><span>${r.title || m.title}</span>${m.noClose ? '' : `<button class="round" data-act="close:${m.id}" aria-label="Close">${ic('i-close')}</button>`}</div>` : ''}${r.tabs ? `<div class="tabs">${r.tabs}</div>` : ''}<div class="mb">${r.body}</div>${r.footer ? `<div class="mf">${r.footer}</div>` : ''}`;
    const mb = $('.mb', box); if (mb) mb.scrollTop = prev; const tb = $('.tabs', box); if (tb) tb.scrollLeft = prevTabs;
    paintMini(box);
    r.after?.(box);
  }
  ui.closeModal = (id) => {
    const m = id ? modals.find((k) => k.id === id) : modals[modals.length - 1];
    if (!m) return;
    m.el.remove(); modals = modals.filter((k) => k !== m);
    if (!modals.length && m.opener && document.contains(m.opener)) { try { m.opener.focus({ preventScroll: true }); } catch { /* ignore */ } }
    m.onClose?.();
    setTimeout(pumpQueue, 60);
  };
  ui.closeAllModals = () => { modals.forEach((m) => m.el.remove()); modals = []; };
  const hasSticky = () => modals.some((m) => m.sticky);
  function enqueue(fn) { queue.push(fn); pumpQueue(); }
  function pumpQueue() { if (!queue.length || hasSticky() || modals.some((m) => m.id === 'welcome')) return; const fn = queue.shift(); fn(); }
  ui.refresh = () => {
    if (!G.state) return;
    updateHud(); renderDock();
    for (const m of modals) if (m.render && !m.frozen) drawModal(m);
    if (sheetOpen) renderSheet();
  };
  ui.confirm = ({ title, body, ok = 'OK', cancel = 'Cancel', danger = false }) => new Promise((res) => {
    const m = mountModal('confirm', { title, top: true, sticky: true, render: () => ({ body: `<p class="center" style="font-weight:600;font-size:16px">${body}</p>`, footer: `<button class="btn ghost" data-act="confirm:no">${cancel}</button><button class="btn ${danger ? 'pink' : 'green'}" data-act="confirm:yes">${ok}</button>` }) });
    m.answer = (v) => { ui.closeModal('confirm'); res(v); };
  });

  // ---- Welcome back
  ui.showWelcome = (sum) => {
    const mins = Math.round(sum.away / 60e3);
    if (mins < 10 && !sum.evolved.length) return;
    const lines = [];
    if (sum.pearls > 0) lines.push(`<div class="chipx">${ic('i-pearl')}+${fmt(sum.pearls)} waiting in bubbles</div>`);
    if (sum.eggs > 0) lines.push(`<div class="chipx">${ic('i-sparkle')}${sum.eggs} new egg${sum.eggs > 1 ? 's' : ''} washed ashore</div>`);
    if (sum.evolved.length) lines.push(`<div class="chipx">${ic('i-up')}${sum.evolved.length} evolution${sum.evolved.length > 1 ? 's' : ''} finished</div>`);
    if (!lines.length) lines.push(`<div class="chipx">${ic('i-drop')}Your pool is peaceful</div>`);
    const m = mountModal('welcome', { title: 'Welcome back!', sticky: true, render: () => ({ body: `<div class="center"><div class="muted">You were away for ${S.fmtDur(sum.away)}</div><div class="chips">${lines.join('')}</div><p class="muted">Pop your bubbles before they stop growing!</p></div>`, footer: `<button class="btn green" data-act="close:welcome">Let's go!</button>` }) });
    m.onClose = () => { G.ui.pumpReveals(); showTutDone(); enqueueDaily(); };
  };

  // ---- Daily reward
  function enqueueDaily() { if (st().tut.done && S.dailyAvailable(st(), now())) enqueue(openDaily); }
  function openDaily() {
    if (modals.some((m) => m.id === 'daily')) return;
    mountModal('daily', { title: 'Daily Reward', sticky: true, render: () => {
      const s = st(), avail = S.dailyAvailable(s, now());
      const n = s.daily.n, gap = S.dayNum(now()) - s.daily.last;
      const nextN = avail ? (gap === 1 || (gap === 2 && s.daily.shield) ? n + 1 : 1) : n;
      const cur = (nextN - 1) % 7;
      const days = D.DAILY_REWARDS.map((r, i) => {
        const done = avail ? i < cur : i <= cur;
        const icon = r.glass && r.tokens ? 'i-gift' : r.glass ? 'i-glass' : r.tokens ? 'i-token' : 'i-pearl';
        return `<div class="day ${done ? 'done' : ''} ${i === cur && avail ? 'now' : ''} ${i === 6 ? 'big' : ''}">Day ${i + 1}${ic(icon)}<span>${done ? '✓' : (r.glass && !r.tokens ? r.glass : r.tokens && !r.glass ? '1' : r.glass ? '25+' : '')}</span></div>`;
      }).join('');
      return { body: `<div class="center"><div class="muted">${avail ? (nextN === 1 && n > 0 ? 'Your streak restarted — welcome back!' : `Day ${nextN} of your streak`) : `Streak: ${n} day${n > 1 ? 's' : ''}`}</div></div><div class="days mt">${days}</div><p class="muted center mt">${s.daily.shield ? `${ic('i-star', 's')} A streak shield protects you if you miss one day.` : 'Missed a day? Keep your streak by returning the next day.'}</p>`,
        footer: avail ? `<button class="btn lemon pulse" data-act="claimdaily">Claim!</button>` : `<button class="btn ghost" data-act="close:daily">See you tomorrow</button>` };
    } });
  }
  ui.openDaily = openDaily;

  // ---- Rewards
  ui.showReward = (title, r, sub) => {
    const chips = [];
    if (r.pearls) chips.push(`<div class="chipx">${ic('i-pearl')}+${fmt(r.pearls)}</div>`);
    if (r.glass) chips.push(`<div class="chipx">${ic('i-glass')}+${r.glass}</div>`);
    if (r.tokens) chips.push(`<div class="chipx">${ic('i-token')}+${r.tokens} Speed Token</div>`);
    if (r.egg) chips.push(`<div class="chipx">${ic('i-sparkle')}A lucky egg!</div>`);
    mountModal('reward', { title, top: true, sticky: true, render: () => ({ body: `<div class="reveal center"><div style="font-size:64px">${ic('i-gift', 'xl')}</div><div class="chips">${chips.join('')}</div><div class="muted">${esc(sub || '')}</div></div>`, footer: `<button class="btn green" data-act="close:reward">Yay!</button>` }) });
  };

  // ---- Evolution / discovery reveal
  ui.pumpReveals = () => {
    if (!G.reveals.length || modals.some((m) => m.id === 'reveal' || m.id === 'welcome')) return;
    const ev = G.reveals.shift();
    const f = FORMS[ev.form];
    A.play('reveal'); haptic.success(); scene.confetti(80);
    const m = mountModal('reveal', { title: '', sticky: true, top: true, cls: '', render: () => ({
      body: `<div class="reveal"><div class="rays"></div>${ev.first ? '<span class="new">NEW DISCOVERY!</span>' : '<span class="muted">Evolution complete</span>'}
        <canvas data-form="${ev.form}"></canvas><h2 class="big">${esc(f.name)}</h2>
        <div class="chips"><span class="tag">${stageName(f.stage)}</span><span class="tag">${ic('t-' + f.trait, 's')}${traitName(f.trait)}</span></div>
        <p class="muted" style="font-size:14px">${esc(f.blurb)}</p>
        ${ev.first ? `<div class="chips"><div class="chipx">${ic('i-glass')}+${D.DISCOVER_GLASS[f.stage]}</div><div class="chipx">${ic('i-book')}${S.dexCount(st())}/${D.FORM_IDS.length}</div></div>` : ''}</div>`,
      footer: `<button class="btn ghost" data-act="sharereveal:${ev.form}">${ic('i-camera', 's')} Share</button><button class="btn green" data-act="close:reveal">Awesome!</button>` }) });
    m.onClose = () => { pumpQueue(); ui.pumpReveals(); showTutDone(); };
  };
  ui.showLevelUp = (ev) => {
    enqueue(() => mountModal('levelup', { title: `Pool Level ${ev.lvl}!`, sticky: true, top: true, render: () => ({
      body: `<div class="reveal center"><div style="font-size:60px">${ic('i-star', 'xl')}</div>${ev.unlocks.length ? `<h4 class="muted">Unlocked</h4><div class="chips">${ev.unlocks.map((u) => `<div class="chipx">${ic(u.kind === 'piece' ? 'i-build' : u.kind === 'family' ? 'i-sparkle' : 'k-expand')}${esc(u.name)}</div>`).join('')}</div>` : '<p class="muted">Your tidepool grows more beautiful!</p>'}<p class="muted">Bubbles now hold up to ${D.bubbleCapHours(ev.lvl)} hours of pearls.</p></div>`,
      footer: `<button class="btn green" data-act="close:levelup">Nice!</button>` }) }));
  };

  // ---- Dex
  function dexHtml() {
    const s = st(), n = S.dexCount(s), total = D.FORM_IDS.length;
    const fams = D.FAMILIES_BY_BIOME[dexTab];
    let h = `<div class="card hi row between"><div><b>${n} / ${total} discovered</b><div class="muted">Bonus: +${Math.round(n * D.DEX_RATE_BONUS * 100)}% pearls</div></div>${ic('i-book', 'l')}</div>`;
    h += `<div class="mile">${D.DEX_MILESTONES.map((m, i) => { const got = s.dexClaimed.includes(i), can = !got && n >= m.n; return `<button class="${got ? 'got' : can ? 'can' : ''}" data-act="dexclaim:${i}">${m.n}<br>${got ? '✓' : `${ic('i-glass', 's')}${m.glass}${m.coins ? ` ${ic('i-coin', 's')}${m.coins}` : ''}`}</button>`; }).join('')}</div>`;
    for (const fid of fams) {
      const fam = FAMILIES[fid], locked = dexTab === 'tide' && s.lvl < fam.unlock, forms = D.formsOfFamily(fid);
      const base = forms[0], b2 = Object.keys(fam.br).map((t) => D.branchForm(fid, t)), b3 = Object.keys(fam.br).map((t) => D.mythicForm(fid, t));
      const have = forms.filter((f) => s.dex[f]).length;
      const slot = (f) => { const known = !!s.dex[f]; return `<button class="slot ${known ? '' : 'unk'} ${FORMS[f].stage === 3 ? 'stage3' : ''}" data-act="slot:${f}"><canvas data-form="${f}" ${known ? '' : 'data-sil="1"'}></canvas>${known ? esc(FORMS[f].name) : '???'}</button>`; };
      h += `<div class="dexfam ${locked ? 'fam-locked' : ''}"><div class="fh"><span>${s.dex[base] ? esc(fam.name) : '???'} ${locked ? `${ic('i-lock', 's')}` : ''}</span><small>${locked ? `Unlocks at Lv ${fam.unlock}` : `${have}/7 · likes ${Object.keys(fam.likes).map(traitName).join(' + ')}`}</small></div>
        <div class="dexrow">${[base, ...b2].map(slot).join('')}</div><div class="dexrow r3">${b3.map(slot).join('')}</div></div>`;
    }
    return h;
  }
  ui.openDex = () => mountModal('dex', { title: 'Tidedex', cls: 'tall', render: () => ({
    tabs: `<button class="${dexTab === 'tide' ? 'on' : ''}" data-act="dextab:tide">Tidepool</button><button class="${dexTab === 'deep' ? 'on' : ''}" data-act="dextab:deep">Deep Ocean ${st().iap.deep ? '' : ic('i-lock', 's')}</button>`,
    body: dexHtml() }) });
  function slotDetail(f) {
    const s = st(), form = FORMS[f], fam = FAMILIES[form.fam], known = !!s.dex[f];
    let how = '';
    if (form.stage === 1) how = `Sometimes washes in as an egg where it's ${Object.keys(fam.likes).map((t) => traitName(t)).join(' and ')}-rich. ${fam.hint}.`;
    else if (form.stage === 2) how = `Evolve ${s.dex[form.fam + '.0'] ? fam.name : 'the baby'} at Lv ${D.STAGE[1].evoLvl} with ${traitName(form.trait)} ${D.BRANCH_NEED}+ nearby (and it must be the strongest).`;
    else how = `Ascend ${s.dex[D.branchForm(form.fam, form.trait)] ? FORMS[D.branchForm(form.fam, form.trait)].name : 'the evolved form'} at Lv ${D.STAGE[2].evoLvl} with ${traitName(form.trait)} ${D.MYTHIC_NEED}+ and ${traitName(fam.second)} ${D.MYTHIC_SECOND}+ nearby.`;
    mountModal('slot', { title: known ? form.name : 'Undiscovered', top: true, render: () => ({ body: `<div class="reveal center"><canvas data-form="${f}" ${known ? '' : 'data-sil="1"'} style="width:180px;height:180px"></canvas><div class="chips"><span class="tag">${stageName(form.stage)}</span>${form.trait ? `<span class="tag">${ic('t-' + form.trait, 's')}${traitName(form.trait)}</span>` : ''}</div><p style="font-weight:600">${known ? esc(form.blurb) : 'A mystery creature. Try different rocks and water!'}</p><p class="muted">${esc(how)}</p></div>` }) });
  }

  // ---- Quests
  ui.openQuests = () => mountModal('quests', { title: 'Quests & Gifts', cls: 'tall', render: () => {
    const s = st(), n = now(), w = S.giftWindow(n), gAvail = S.giftAvailable(s, n), nextG = S.nextGiftAt(n);
    let h = '';
    h += `<div class="card ${gAvail ? 'hi' : ''} row between"><div class="row">${ic('i-gift', 'l')}<div><b>${esc(w.name)} Gift</b><div class="muted">${gAvail ? 'Something washed ashore!' : `Next gift in ${S.fmtDur(nextG - n)}`}</div></div></div><button class="btn ${gAvail ? 'lemon pulse' : 'off'} small" data-act="gift">${gAvail ? 'Open' : 'Later'}</button></div>`;
    const dAvail = S.dailyAvailable(s, n);
    h += `<div class="card mt row between"><div class="row">${ic('i-star', 'l')}<div><b>Daily reward</b><div class="muted">${dAvail ? 'Ready to claim!' : `Streak ${s.daily.n} day${s.daily.n === 1 ? '' : 's'}`}</div></div></div><button class="btn ${dAvail ? 'lemon' : 'ghost'} small" data-act="opendaily">${dAvail ? 'Claim' : 'View'}</button></div>`;
    const cAvail = S.gachaFreeAvailable(s, n);
    h += `<div class="card mt row between ${cAvail ? 'pinkc' : ''}"><div class="row">${ic('i-capsule', 'l')}<div><b>Free daily capsule</b><div class="muted">${cAvail ? 'Give the crank a turn!' : `${s.cur.coins} Capsule Coin${s.cur.coins === 1 ? '' : 's'} saved`}</div></div></div><button class="btn ${cAvail ? 'pink pulse' : 'ghost'} small" data-act="gacha">${cAvail ? 'Pull' : 'Open'}</button></div>`;
    h += '<h4 class="muted mt" style="margin-bottom:6px">TODAY\'S QUESTS</h4><div class="list">';
    for (const [i, q] of s.quests.list.entries()) {
      h += `<div class="card quest"><div class="q-t">${esc(S.questText(q))}<div class="bar"><i style="width:${q.prog / q.goal * 100}%;background:linear-gradient(#9af5bd,#2fc47e)"></i></div><div class="muted">${Math.min(q.prog, q.goal)}/${q.goal}</div></div>
        <div class="col center" style="display:flex;flex-direction:column;gap:4px;align-items:center"><span class="rew">${ic('i-glass')}${q.glass}${q.coins ? ` ${ic('i-coin')}${q.coins}` : ''}</span>${q.claimed ? `<span class="tag">Done</span>` : `<button class="btn small ${q.done ? 'green pulse' : 'off'}" data-act="claimquest:${i}">Claim</button>`}</div></div>`;
    }
    const all = s.quests.list.every((q) => q.claimed);
    h += `</div><div class="card pinkc mt row between"><div class="row">${ic('i-gift', 'l')}<div><b>Bonus chest</b><div class="muted">Finish all quests · ${ic('i-glass', 's')}${D.QUEST_ALL_BONUS.glass} + ${ic('i-token', 's')}1 + ${ic('i-coin', 's')}${D.QUEST_ALL_BONUS.coins}</div></div></div>${s.quests.chest ? '<span class="tag">Opened</span>' : `<button class="btn small ${all ? 'lemon pulse' : 'off'}" data-act="claimchest">Open</button>`}</div>`;
    h += `<p class="muted center mt">New quests arrive every morning.</p>`;
    return { body: h };
  } });

  // ---- Shop
  const priceBtn = (pid, cls = 'green') => `<button class="btn ${cls} wide" data-act="buy:${pid}">${esc(store.price(pid))}</button>`;
  const decorCard = (id) => {
    const d = DECOR[id], s = st(), owned = !!s.own[id];
    const prev = d.kind === 'prop' ? `<canvas data-prop="${id}" style="width:64px;height:64px"></canvas>` : d.kind === 'hat' ? `<canvas data-hat="${id}" style="width:64px;height:64px"></canvas>` : d.kind === 'skin' ? `<canvas data-skin="${id}" style="width:64px;height:64px"></canvas>` : ic('i-sparkle', 'xl');
    const equipped = (d.kind === 'skin' && s.equip.skin === id) || (d.kind === 'fx' && s.equip.fx === id);
    let btn;
    if (owned) btn = (d.kind === 'skin' || d.kind === 'fx') ? `<button class="btn small wide ${equipped ? 'off' : 'green'}" data-act="equip:${id}">${equipped ? 'Equipped' : 'Equip'}</button>` : d.kind === 'prop' ? `<button class="btn small wide green" data-act="useprop:${id}">Place</button>` : `<span class="tag">Owned</span>`;
    else if (d.gacha) btn = `<button class="btn small wide pink" data-act="gacha">${ic('i-capsule', 's')} Capsule</button>`;
    else if (d.pack) btn = `<button class="btn small wide pink" data-act="shopsub:bundles">In pack</button>`;
    else btn = `<button class="btn small wide lemon" data-act="buydecor:${id}">${d.price.pearls ? cost(d.price.pearls) : cost(d.price.glass, 'i-glass')}</button>`;
    return `<div class="card prod">${prev}<b style="font-size:13px">${esc(d.name)}</b>${btn}</div>`;
  };
  function shopBody() {
    const s = st();
    let h = '';
    if (store.mode !== 'native') h += `<div class="card pinkc center" style="margin-bottom:10px"><b>${store.mode === 'demo' ? 'Demo mode' : 'Preview'}</b><p>${store.mode === 'demo' ? 'Purchases here are free and simulated so you can try everything!' : 'Real purchases are available in the App Store version.'}</p></div>`;
    if (shopTab === 'glass') {
      if (!s.iap.starter) h += `<div class="card pinkc" style="margin-bottom:12px"><span class="ribbon">ONE-TIME OFFER</span><div class="row"><div style="flex:1"><h5>Starter Bundle</h5><p>${ic('i-glass', 's')} 200 Sea Glass + Party Hat + Bubblegum pool skin</p></div><div style="width:96px">${priceBtn(D.IAP.starter, 'pink')}</div></div></div>`;
      h += `<div class="grid2">${D.IAP.glass.map((id, i) => { const P = PRODUCTS[id]; return `<div class="card prod ${i === 2 ? 'hi' : ''}">${P.tag ? `<span class="ribbon">${esc(P.tag)}</span>` : ''}${ic('i-glass', 'xl')}<div class="amt">${P.glass}</div><div class="muted">Sea Glass</div>${priceBtn(id)}</div>`; }).join('')}</div>`;
      if (!s.iap.hourglass) h += `<div class="card hi mt row"><div>${ic('i-token', 'xl')}</div><div style="flex:1"><h5>Golden Hourglass</h5><p>Evolution timers 25% shorter — forever. Plus one free instant finish every day.</p></div><div style="width:92px">${priceBtn(D.IAP.hourglass, 'lemon')}</div></div>`;
      h += `<p class="muted center mt">Sea Glass skips evolution timers, buys premium decor and can be spent in the Capsule Machine. You also earn it free from quests, gifts and discoveries.</p><div class="center"><button class="link" data-act="gacharates">Capsule Machine drop rates</button></div>`;
    } else if (shopTab === 'boost') {
      h += `<div class="list">${Object.entries(D.BOOSTS).map(([id, b]) => `<div class="card row between"><div class="row"><div style="width:44px">${ic(b.ff ? 'i-pearl' : b.mult ? 'i-sun' : 'i-sparkle', 'l')}</div><div><b>${esc(b.name)}</b><p>${esc(b.desc)}</p></div></div><button class="btn small lemon" data-act="boost:${id}">${cost(b.glass, 'i-glass')}</button></div>`).join('')}</div>
        <div class="card mt row between"><div class="row">${ic('i-token', 'l')}<div><b>Speed Tokens: ${s.cur.tokens}</b><p>Each token shaves 1 hour off an evolution. Earned from gifts and quests.</p></div></div></div>`;
    } else if (shopTab === 'decor') {
      const subs = [['bundles', 'Bundles'], ['prop', 'Props'], ['hat', 'Hats'], ['skin', 'Pool skins'], ['fx', 'Effects']];
      h += `<div class="tabs" style="padding:0 0 8px">${subs.map(([id, l]) => `<button class="${shopSub === id ? 'on' : ''}" data-act="shopsub:${id}">${l}</button>`).join('')}</div>`;
      if (shopSub === 'bundles') {
        h += `<div class="list">${Object.entries(D.PACKS).map(([id, pk]) => { const owned = s.iap.packs[id], pid = pk.iap; return `<div class="card ${owned ? '' : 'pinkc'}"><h5>${esc(pk.name)}</h5><p>${esc(pk.blurb)}</p><div class="grid3 mt2" style="grid-template-columns:repeat(5,1fr)">${pk.items.map((it) => { const d = DECOR[it]; return `<div class="center">${d.kind === 'prop' ? `<canvas data-prop="${it}" style="width:100%;aspect-ratio:1"></canvas>` : d.kind === 'hat' ? `<canvas data-hat="${it}" style="width:100%;aspect-ratio:1"></canvas>` : d.kind === 'skin' ? `<canvas data-skin="${it}" style="width:100%;aspect-ratio:1"></canvas>` : ic('i-sparkle', 'l')}</div>`; }).join('')}</div><div class="mt2">${owned ? '<span class="tag">Owned ✓</span>' : priceBtn(pid, 'pink')}</div></div>`; }).join('')}</div>`;
      } else {
        const ids = D.DECOR_IDS.filter((d) => DECOR[d].kind === shopSub && !DECOR[d].fig);      // figurines live in the Toybox
        h += `<div class="grid3">${ids.map(decorCard).join('')}</div>`;
      }
    } else if (shopTab === 'deep') {
      h += deepHero() + (s.iap.deep ? `<div class="mt"><button class="btn green wide" data-act="godeep">Dive in!</button></div>` : `<ul class="bul">${DEEP_POINTS.map((p) => `<li>${ic('i-check', 's')}<span>${p}</span></li>`).join('')}</ul>${priceBtn(D.IAP.deep, 'pink')}`);
    }
    h += `<div class="center mt"><button class="link" data-act="restore">Restore purchases</button></div>`;
    return h;
  }
  const DEEP_POINTS = ['A second, glowing ocean-floor diorama with its own sky', '28 new creatures across 4 families — anglers, nautili, mantas & dragons', 'Trench digging, vents, glowstones & bioluminescent kelp', 'Earns 70% more pearls than the tidepool', 'Includes 50 Sea Glass. One purchase, yours forever.'];
  function deepHero() { return `<div class="hero"><div class="row">${['angler.b.glow', 'naut.b.stone', 'manta.b.glow', 'drake.b.glow'].map((f) => `<canvas data-form="${f}"></canvas>`).join('')}</div><h2 class="big" style="font-size:24px">Deep Ocean</h2><div style="font-size:13px;opacity:.9">A glowing biome for keepers who want more</div></div>`; }
  ui.openShop = (tab) => {
    if (tab) shopTab = tab;
    mountModal('shop', { title: 'Shop', cls: 'tall', render: () => ({
      tabs: [['glass', 'Sea Glass'], ['boost', 'Boosts'], ['decor', 'Decor'], ['deep', 'Deep']].map(([id, l]) => `<button class="${shopTab === id ? 'on' : ''}" data-act="shoptab:${id}">${l}</button>`).join(''),
      body: shopBody() }) });
  };
  ui.showDeepUpsell = () => mountModal('deepup', { title: 'Deep Ocean', top: true, render: () => ({ body: deepHero() + `<ul class="bul">${DEEP_POINTS.map((p) => `<li>${ic('i-check', 's')}<span>${p}</span></li>`).join('')}</ul>`, footer: `<button class="btn ghost" data-act="close:deepup">Not now</button><button class="btn pink" data-act="buy:${D.IAP.deep}">${esc(store.price(D.IAP.deep))}</button>` }) });
  ui.showPurchased = (pid) => {
    const P = PRODUCTS[pid];
    ui.closeModal('deepup');
    enqueue(() => mountModal('purchased', { title: 'Thank you!', sticky: true, top: true, render: () => ({ body: `<div class="reveal center">${ic(P.deep ? 'i-deep' : P.type === 'consumable' ? 'i-glass' : 'i-star', 'xl')}<h2 class="big" style="font-size:24px">${esc(P.name)}</h2><p class="muted">${P.deep ? 'Tap the Deep tab at the top to dive in — your first egg arrives soon!' : P.type === 'consumable' ? `+${P.glass} Sea Glass added.` : 'It is ready to use.'}</p></div>`, footer: `${P.deep ? `<button class="btn pink" data-act="godeep">Dive in!</button>` : `<button class="btn green" data-act="close:purchased">Great!</button>`}` }) }));
  };

  // ---- Decor picker
  ui.showDecorPicker = () => mountModal('decorpick', { title: 'Place decor', top: true, render: () => {
    const s = st(), ids = D.DECOR_IDS.filter((d) => DECOR[d].kind === 'prop' && s.own[d]);
    return { body: ids.length ? `<p class="muted center">Shore items go on sand; floaty ones on water.</p><div class="grid3">${ids.map((id) => `<button class="card prod" data-act="useprop:${id}" style="font-family:inherit;color:inherit"><canvas data-prop="${id}" style="width:64px;height:64px"></canvas><b style="font-size:13px">${esc(DECOR[id].name)}</b></button>`).join('')}</div>` : `<div class="center"><p class="muted">You don't own any decor yet.</p><button class="btn lemon" data-act="shopdecor">Visit the Shop</button></div>` };
  } });

  // ---- Settings
  const SETTING_LABEL = { music: 'Music', sfx: 'Sound effects', haptics: 'Haptics', notif: 'Reminders', paidPulls: 'Sea Glass capsule pulls', reduceMotion: 'Reduce motion', battery: 'Battery saver' };
  const sw = (k) => `<button class="switch ${st().settings[k] ? 'on' : ''}" role="switch" aria-checked="${!!st().settings[k]}" data-act="set:${k}" aria-label="${SETTING_LABEL[k] || k}"></button>`;
  ui.openSettings = () => mountModal('settings', { title: 'Settings', cls: 'tall', render: () => {
    let h = `<div class="setrow"><span>Music<small>Calm ocean ambience</small></span>${sw('music')}</div>
      <div class="setrow"><span>Sound effects</span>${sw('sfx')}</div>
      <div class="setrow"><span>Haptics<small>Gentle vibrations</small></span>${sw('haptics')}</div>
      <div class="setrow"><span>Reminders<small>A few a day at most, never at night</small></span>${sw('notif')}</div>
      <div class="setrow"><span>Sea Glass capsule pulls<small>Off = only free Coins &amp; daily capsule (max ${D.GACHA.paidDailyCap} pulls/day when on)</small></span>${sw('paidPulls')}</div>
      <div class="setrow"><span>Reduce motion<small>Calmer effects</small></span>${sw('reduceMotion')}</div>
      <div class="setrow"><span>Battery saver<small>Lower frame rate &amp; effects</small></span>${sw('battery')}</div>
      <div class="rowb mt"><button class="btn lav small" data-act="restore">Restore purchases</button></div>
      <div class="rowb mt"><button class="link" data-act="link:privacy">Privacy Policy</button><button class="link" data-act="link:terms">Terms of Use</button><button class="link" data-act="link:support">Support</button></div>
      <div class="rowb"><button class="link" data-act="link:rates">Drop rates</button><button class="link" data-act="link:parents">Parents' guide</button><button class="link" data-act="legal">Legal &amp; credits</button></div>
      <div class="rowb"><button class="link" data-act="privacysummary">What data do we collect?</button></div>
      <p class="muted center mt">Tiny Tides v${VERSION}${store.mode === 'demo' ? ' · demo build' : ''}<br>Made with ${ic('i-heart', 's')} for tidepool lovers</p>
      <div class="rowb mt"><button class="btn ghost small danger" data-act="reset">Reset progress</button></div>`;
    if (__DEBUG__) h += `<div class="card mt"><b>Debug</b><div class="rowb mt2"><button class="btn small" data-act="dbg:pearls">+10k pearls</button><button class="btn small" data-act="dbg:glass">+500 glass</button><button class="btn small" data-act="dbg:lvl">Lv +3</button><button class="btn small" data-act="dbg:hours">+6 hours</button></div></div>`;
    return { body: h };
  } });
  ui.showLegal = () => mountModal('legal', { title: 'Legal & credits', cls: 'tall', top: true, render: () => {
    let h = `<p class="center" style="font-weight:600">Tiny Tides v${VERSION}<br><span class="muted">© ${esc(SITE.year)} ${esc(SITE.developer)}</span></p>
      <div class="rowb"><button class="link" data-act="link:privacy">Privacy Policy</button><button class="link" data-act="link:terms">Terms of Use</button></div>
      <div class="rowb"><button class="link" data-act="link:rates">Drop rates</button><button class="link" data-act="link:parents">Parents' guide</button><button class="link" data-act="link:support">Support</button></div>
      <h4 class="muted mt">OPEN-SOURCE SOFTWARE</h4><p class="muted">All art is drawn by the game and all sound is generated in the app. Tiny Tides is built with these open-source components:</p>`;
    h += LICENSES.map((g) => `<details class="lic"><summary>${esc(g.license)} — ${g.items.map((i) => esc(i.name)).join(', ')}</summary><pre>${esc(g.text)}</pre></details>`).join('');
    h += `<p class="muted">In-app purchases use a modified copy of @capgo/native-purchases (MPL-2.0). The modification and where to get the source are published at the Licenses page on our website.</p><div class="rowb"><button class="link" data-act="link:licenses">Open licenses page</button></div>
      <p class="muted center">Apple, iPhone, iPad and App Store are trademarks of Apple Inc.</p>`;
    return { body: h };
  } });
  ui.showPrivacySummary = () => mountModal('privacy', { title: 'Your privacy', top: true, render: () => ({ body: `<div class="list">${POLICY.map((p) => `<div class="card"><h5>${esc(p[0])}</h5><p>${esc(p[1])}</p></div>`).join('')}</div>` }) });

  // ---- Photo
  ui.showPhoto = (cv) => {
    A.play('gift');
    mountModal('photo', { title: 'Snapshot', top: true, render: () => ({ body: `<div class="photo" id="photo-slot"></div>`, footer: `<button class="btn ghost" data-act="close:photo">Close</button><button class="btn green" data-act="sharephoto">${ic('i-camera', 's')} Share</button>`, after: (box) => { const slot = $('#photo-slot', box); if (slot && !slot.firstChild) { const img = new Image(); img.alt = 'Your tidepool'; img.src = cv.toDataURL('image/png'); slot.appendChild(img); } } }) });
    ui._photo = cv;
  };

  // ---- Intro / notification ask
  ui.showIntro = () => mountModal('intro', { title: '', sticky: true, render: () => ({ body: `<div class="reveal center"><div class="rays"></div><div style="width:110px;margin:0 auto">${ic('i-blip', 'xl')}</div><h2 class="big" style="font-size:34px">Tiny Tides</h2><p style="font-weight:600;font-size:16px">Hi, I'm <b>Blip</b>! Build a little tidepool, welcome tiny creatures, and watch them evolve based on the rocks and water you arrange.</p><p class="muted">Check in a few times a day — your pool keeps working while you're away.</p></div>`, footer: `<button class="btn green" data-act="tutstart">Let's build!</button>` }) });
  ui.showNotifAsk = () => {
    if (!notify.supported || st().settings.notif || st().flags.notifAsked) return;
    st().flags.notifAsked = true;
    mountModal('notifask', { title: 'Want reminders?', sticky: true, top: true, render: () => ({ body: `<div class="center"><div>${ic('i-gift', 'xl')}</div><p style="font-weight:600">I can nudge you when a Tide Gift arrives, evolutions finish, or bubbles are full. No more than a few a day, and never at night.</p></div>`, footer: `<button class="btn ghost" data-act="close:notifask">Maybe later</button><button class="btn green" data-act="notifyes">Yes please</button>` }) });
  };

  // ------------------------------------------------------------------ Tutorial coach
  let coachSig = '';
  ui.tutorialChanged = () => { renderCoach(); };
  function renderCoach() {
    const root = $('#coach'), t = G.tutorial();
    document.body.dataset.tut = t && st().tut.step >= 1 && st().tut.step <= 7 ? String(st().tut.step) : '';
    if (!document.body.dataset.tut) delete document.body.dataset.tut;
    $$('.tut-pulse').forEach((e) => e.classList.remove('tut-pulse'));
    if (!t || !t.text) { if (coachSig) { root.innerHTML = ''; coachSig = ''; setTimeout(() => ui.layoutChanged(), 30); } scene.hintTiles = []; return; }
    scene.hintTiles = t.tiles || [];
    if (t.tool && G.tool !== t.tool && (G.tab === 'build')) G.setTool(t.tool);
    if (t.tab && G.tab !== t.tab && !(t.tab === 'pool' && sheetOpen && G.tab === 'pool')) G.setTab(t.tab);
    const sig = t.text + (t.progress || '') + (sheetOpen ? '|c' : '');
    if (sig !== coachSig) { coachSig = sig; setTimeout(() => ui.layoutChanged(), 30); root.innerHTML = `<div class="coach ${sheetOpen ? 'compact' : ''}"><div class="blip">${ic('i-blip')}</div><div><p>${esc(t.text)} ${t.progress ? `<span class="prg">${t.progress}</span>` : ''}</p><button class="skip" data-act="tutskip">Skip tips</button></div></div>`; }
    if (t.target) { const e = $(t.target); if (e) e.classList.add('tut-pulse'); }
    if (t.tool) { const e = $(`.tool[data-act="tool:${t.tool}"]`); if (e) e.classList.add('tut-pulse'); }
  }
  /** The one-time "You did it!" card after the first evolution. Driven by a saved flag so a restart mid-reveal can't lose it. */
  function showTutDone() {
    const f = st().flags;
    if (!f.tutModal || !st().tut.done || G.reveals.length || modals.some((m) => m.id === 'reveal')) return;
    f.tutModal = false; G.dirty = true;
    enqueue(() => {
      const m = mountModal('tutdone', { title: 'You did it!', sticky: true, render: () => ({ body: `<div class="reveal center"><div class="rays"></div>${ic('i-gift', 'xl')}<p style="font-weight:600;font-size:16px">Your first evolution! Your pool keeps earning pearls while you're away. A <b>Tide Gift</b> arrives morning, afternoon and evening.</p><div class="chips"><div class="chipx">${ic('i-glass')}+10 Sea Glass</div><div class="chipx">${ic('i-coin')}+2 Capsule Coins</div></div><p class="muted">Tap the capsule button for a free toy every day!</p><p class="muted">Try different rocks & water to discover all ${D.FORM_IDS.length} creatures.</p></div>`, footer: `<button class="btn green" data-act="close:tutdone">Onward!</button>` }) });
      m.onClose = () => { ui.showNotifAsk(); enqueueDaily(); };
    });
  }
  ui.showTutDone = showTutDone;

  // ------------------------------------------------------------------ action dispatch
  const acts = {
    tab(v) { if (v === 'pool' || v === 'build') { ui.closeAllModals(); G.setTab(v); if (v === 'build') A.play('whoosh'); } else if (v === 'dex') ui.openDex(); else if (v === 'quests') ui.openQuests(); else if (v === 'shop') ui.openShop(); ui.layoutChanged(); },
    close(v) { ui.closeModal(v); },
    biome(v) { G.switchBiome(v); ui.layoutChanged(); },
    settings() { ui.openSettings(); },
    levelinfo() { const s = st(); ui.toast(`Pool Lv ${s.lvl} · ${s.xp}/${D.xpForLevel(s.lvl)} XP — evolve & discover to level up`); },
    shop(v) { ui.openShop(v); },
    collectall() { G.collectAll(); },
    gift() { if (S.giftAvailable(st(), now())) G.claimGift(); else ui.toast('Next gift is on its way'); },
    snap() { G.snap(); },
    closesheet() { ui.closeSheet(); },
    shtab(v) { sheetTab = sheetTab === v ? '' : v; renderSheet(); ui.layoutChanged(); },
    shopdecor2() { ui.openShop('decor'); shopSub = 'hat'; ui.refresh(); },
    levelup() { G.levelUp(G.selected); },
    evolve() { const c = pool().creatures.find((k) => k.id === G.selected); const info = S.evoInfo(st(), pool(), c); if (info.canStart) G.evolve(G.selected); else ui.toast(info.reason === 'level' ? `Reach Lv ${info.needLvl} first` : info.reason === 'habitat' ? 'Build a better habitat — see the traits above' : info.reason === 'pearls' ? `Need ${info.cost} pearls` : 'Not ready yet', 'warn'); },
    speed(v) { if (v === 'glass') { const c = pool().creatures.find((k) => k.id === G.selected); const g = S.speedUpCost(st(), c, now()); if (st().cur.glass < g) { ui.toast('Not enough Sea Glass', 'warn'); ui.openShop('glass'); return; } } G.speedUp(G.selected, v); },
    hat(v) { G.setHat(G.selected, v || null); },
    async release() { const c = pool().creatures.find((k) => k.id === G.selected); if (!c || !st().tut.done) return; if (await ui.confirm({ title: 'Send home?', body: `${esc(FORMS[c.form].name)} will swim off and you'll get some pearls back. You keep the Tidedex entry.`, ok: 'Send home', danger: true })) G.release(G.selected); },
    tool(v) { G.setTool(v === G.tool ? null : v); if (!G.tool) G.setTool(v); },
    expand() { G.expand(); },
    decorpicker() { ui.showDecorPicker(); },
    useprop(v) { ui.closeModal('decorpick'); ui.closeModal('shop'); G.setTab('build'); G.setTool('decor:' + v); ui.layoutChanged(); },
    shopdecor() { ui.closeModal('decorpick'); shopTab = 'decor'; ui.openShop('decor'); },
    dextab(v) { dexTab = v; ui.refresh(); },
    dexclaim(v) { const r = G.claimDex(+v); if (r.ok) ui.toast(`+${r.glass} Sea Glass${r.coins ? `  +${r.coins} Capsule Coin${r.coins > 1 ? 's' : ''}` : ''}`, 'good'); },
    slot(v) { slotDetail(v); },
    shoptab(v) { shopTab = v; ui.refresh(); },
    shopsub(v) { shopTab = 'decor'; shopSub = v; ui.refresh(); },
    buy(v) { G.purchase(v); },
    buydecor(v) { G.buyDecor(v); },
    equip(v) { G.equip(v); },
    boost(v) { G.buyBoost(v); },
    restore() { G.restore(); },
    gacha() { ui.closeModal('quests'); ui.closeModal('shop'); ui.openGacha(); },
    gacharates() { ui.closeModal('shop'); ui.openGacha('rates'); },
    godeep() { ui.closeAllModals(); G.switchBiome('deep'); ui.layoutChanged(); },
    claimquest(v) { const r = G.claimQuest(+v); if (r.ok) ui.toast(`+${r.glass} Sea Glass  +${r.pearls} pearls`, 'good'); },
    claimchest() { G.claimChest(); },
    claimdaily() { ui.closeModal('daily'); G.claimDaily(); },
    opendaily() { openDaily(); },
    set(v) { G.setSetting(v, !st().settings[v]); },
    link(v) { openUrl(LINKS[v]); },
    privacysummary() { ui.showPrivacySummary(); },
    legal() { ui.showLegal(); },
    async reset() { if (await ui.confirm({ title: 'Reset everything?', body: 'This permanently deletes your tidepool, creatures and progress. Purchases can be restored.', ok: 'Reset', danger: true })) { if (await ui.confirm({ title: 'Are you sure?', body: 'There is no undo.', ok: 'Yes, reset', danger: true })) G.reset(); } },
    tutstart() { ui.closeModal('intro'); G.tutorialStart(); },
    async tutskip() { if (await ui.confirm({ title: 'Skip the tips?', body: "You can always figure things out as you go. I'll be here!", ok: 'Skip', cancel: 'Keep going' })) { G.tutorialSkip(); } },
    notifyes() { ui.closeModal('notifask'); G.setSetting('notif', true); },
    sharephoto() { if (ui._photo) G.sharePhoto(ui._photo); },
    sharereveal(v) { shareReveal(v); },
    confirm(v) { modals.find((m) => m.id === 'confirm')?.answer(v === 'yes'); },
    ...(__DEBUG__ ? { dbg(v) { const s = st(); if (v === 'pearls') s.cur.pearls += 10000; if (v === 'glass') s.cur.glass += 500; if (v === 'lvl') { s.lvl += 3; } if (v === 'hours') window.__tt.advance(6 * D.HOUR); ui.refresh(); } } : {}),
  };
  function shareReveal(formId) {
    const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1350; const c = cv.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, 1350); g.addColorStop(0, '#59c6ff'); g.addColorStop(1, '#ffd2ef'); c.fillStyle = g; c.fillRect(0, 0, 1080, 1350);
    c.save(); c.translate(540, 700); c.fillStyle = 'rgba(255,255,255,.4)'; for (let i = 0; i < 16; i++) { c.rotate(Math.PI / 8); c.fillRect(-26, 0, 52, 900); } c.restore();
    c.save(); c.translate(540, 820); drawSprite(c, formId, 0, 0, 900, {}); c.restore();
    c.textAlign = 'center'; c.font = '700 96px Fredoka, ui-rounded, sans-serif'; c.lineWidth = 16; c.strokeStyle = '#3b1d5e'; c.lineJoin = 'round';
    c.strokeText(FORMS[formId].name, 540, 210); c.fillStyle = '#fff'; c.fillText(FORMS[formId].name, 540, 210);
    c.font = '600 46px Fredoka, ui-rounded, sans-serif'; c.lineWidth = 10; c.strokeText('I discovered it in Tiny Tides!', 540, 1270); c.fillText('I discovered it in Tiny Tides!', 540, 1270);
    G.sharePhoto(cv);
  }
  ui.actions = acts;

  // ------------------------------------------------------------------ boot
  ui.mount = () => {
    buildChrome();
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const [name, ...rest] = b.dataset.act.split(':'); const fn = acts[name];
      if (!fn) return;
      A.unlock(); if (name !== 'tool') A.play('tap'); haptic.tap();
      fn(rest.join(':'), b, e);
    });
    let resizeT = 0;
    window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => ui.layoutChanged(), 80); });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const top = modals[modals.length - 1];
      if (top) { if (!top.sticky && !top.noClose) ui.closeModal(); }         // sticky dialogs (intro, confirm, reveals) need a real answer
      else if (sheetOpen) ui.closeSheet();
    });
    ui.layoutChanged();
    setInterval(() => { tick++; if (G.state) { updateHud(); if (!st().tut.done) renderCoach(); if (tick % 8 === 0) { const m = modals.find((k) => k.id === 'quests'); if (m && !document.querySelector('.modal:active')) drawModal(m); } } }, 250);
  };
  ui.start = (summary) => {
    G.ui = ui;
    ui.refresh(); ui.layoutChanged();
    $('#boot').classList.add('gone'); setTimeout(() => $('#boot')?.remove(), 600);
    if (G.fresh || !st().tut.done && st().tut.step === 0) { ui.showIntro(); return; }
    if (!st().tut.done) { renderCoach(); return; }
    if (summary) ui.showWelcome(summary);
    if (!modals.some((m) => m.id === 'welcome')) { ui.pumpReveals(); showTutDone(); enqueueDaily(); }
  };
  ui.onResume = (summary) => { if (summary && st().tut.done) ui.showWelcome(summary); ui.pumpReveals(); showTutDone(); enqueueDaily(); ui.refresh(); };
  ui.sheetIsOpen = () => sheetOpen;
  Object.assign(ui, { mountModal, drawModal, paintMini, ic, esc });
  ui.gacha = createGachaUI(G, ui);
  ui.openGacha = (tab) => ui.gacha.open(tab);
  return ui;
}
