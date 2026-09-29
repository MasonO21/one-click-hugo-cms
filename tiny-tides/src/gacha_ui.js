// Tiny Tides — Capsule Machine UI: animated machine, reveals, Toybox, Prize Counter and the Drop Rates disclosure.
import * as D from './data.js';
import * as S from './sim.js';
import * as A from './audio.js';
import { haptic } from './platform.js';
import { drawMachine, drawDropped, newMachine, stepMachine, drawItemArt, MW, MH, CHUTE, TRAY_Y, TIER_COLOR } from './art_gacha.js';

const TAU = Math.PI * 2;
const TIERS = D.GACHA.tiers;
const stars = (n) => '★'.repeat(n);
const pct = (p) => `${(p * 100).toFixed(p < 0.001 ? 3 : 2)}%`;
const easeOutBack = (k) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };

export function createGachaUI(G, ui) {
  const { ic, esc } = ui;
  const st = () => G.state;
  const now = () => G.now();
  const fmt = S.fmtNum;
  let modal = null, box = null, tab = 'machine', prizeTier = 'common', toyTab = 'figs';
  let run = null;                                   // live animation state while the Machine tab is showing

  // ------------------------------------------------------------------ helpers
  const itemName = (id) => D.POOL_BY_ID[id]?.name || id;
  const tierOf = (id) => D.TIER[D.POOL_BY_ID[id].tier];
  const thumb = (id, owned = true, cls = '') => `<canvas class="${cls}" data-toy="${id}" ${owned ? '' : 'data-sil="1"'}></canvas>`;
  const tierTag = (t) => `<span class="tag tier-${t}" style="border-color:var(--ink);background:${TIER_COLOR[t]}33">${stars(D.TIER[t].stars)} ${D.TIER[t].name}</span>`;
  const rewardChips = (r) => [r.coins && `<span class="rew">${ic('i-coin')}${r.coins}</span>`, r.glass && `<span class="rew">${ic('i-glass')}${r.glass}</span>`, r.tokens && `<span class="rew">${ic('i-token')}${r.tokens}</span>`].filter(Boolean).join(' ');
  const wallet = () => `<span class="gz-pill" id="gz-coins" title="Capsule Coins">${ic('i-coin')}<b>${st().cur.coins}</b></span><span class="gz-pill" id="gz-glass" title="Sea Glass">${ic('i-glass')}<b>${fmt(st().cur.glass)}</b></span>`;
  function updateWallet() {
    if (!box) return;
    const set = (id, v) => { const e = box.querySelector(`#${id} b`); if (e && e.textContent !== String(v)) e.textContent = v; };
    set('gz-coins', st().cur.coins); set('gz-glass', fmt(st().cur.glass));
  }

  // ------------------------------------------------------------------ open / render
  function open(startTab = 'machine') {
    if (modal && document.body.contains(modal.el)) { setTab(startTab); return; }
    tab = startTab;
    modal = ui.mountModal('gacha', { title: 'Capsules', cls: 'tall gz', sticky: true, render: () => renderTab() });
    modal.frozen = true;                              // ui.refresh() must not rebuild the canvas; we redraw ourselves
    window.addEventListener('resize', onResize);
    modal.onClose = () => { window.removeEventListener('resize', onResize); stopRun(); if (run?.unclaimed) G.ui.toast('Your capsules were added to the Toybox', 'good'); run = null; modal = null; box = null; };
    A.play('whoosh');
  }
  function setTab(t) { tab = t; stopRun(); ui.drawModal(modal); }
  function renderTab() {
    const tabs = [['machine', 'Machine'], ['toys', 'Toybox'], ['prizes', 'Prizes'], ['rates', 'Rates']].map(([id, l]) => `<button class="${tab === id ? 'on' : ''}" data-gz="tab:${id}">${l}</button>`).join('');
    const body = tab === 'machine' ? machineBody() : tab === 'toys' ? toysBody() : tab === 'prizes' ? prizesBody() : ratesBody();
    return { title: `Capsules <span class="gz-pills">${wallet()}</span>`, tabs, body, footer: tab === 'machine' ? '<div id="gz-ctl" class="gz-ctl"></div>' : '', after: afterRender };
  }
  function afterRender(b) {
    if (box !== b) { box = b; box.addEventListener('click', onClick); }      // first render fires inside mountModal, before open() returns
    ui.paintMini(b);
    if (tab === 'machine') startRun(b);
  }

  // ------------------------------------------------------------------ MACHINE tab
  function spotlightHtml() {
    const sp = S.gachaSpotlight(now()), left = Math.max(0, sp.endsAt - now());
    const one = (id) => `<span class="gz-spot-item">${thumb(id, true)}<span><b>${esc(itemName(id))}</b><small>${stars(tierOf(id).stars)} · ${D.GACHA.spotMult}× rate</small></span></span>`;
    return `<div class="gz-spot"><div class="gz-spot-h">${ic('i-sparkle', 's')} This week's spotlight <small>${S.fmtDur(left)} left</small></div><div class="gz-spot-row">${one(sp.rare)}${one(sp.legendary)}</div></div>`;
  }
  function machineBody() {
    return `${spotlightHtml()}
      <div class="gz-stage" id="gz-stage"><canvas id="gz-cv" class="gz-cv" aria-label="Capsule machine"></canvas><div id="gz-cap" class="gz-cap" hidden></div><div id="gz-sum" class="gz-sum" hidden></div></div>
      <div id="gz-pity" class="gz-pity"></div>`;
  }
  function pityHtml() {
    const p = S.gachaPity(st()), left = S.gachaPaidLeft(st(), now());
    return `<span>${ic('i-star', 's')} Rare or better within <b>${p.rare}</b> ${p.rare === 1 ? 'pull' : 'pulls'}</span><span>${ic('i-sparkle', 's')} Legendary within <b>${p.legendary}</b> ${p.legendary === 1 ? 'pull' : 'pulls'}</span><button class="link" data-gz="tab:rates">Drop rates</button>${G.paidRandomBlocked() ? '<span class="muted">Sea Glass pulls: not available in your region</span>' : st().settings.paidPulls ? `<span class="muted">Sea Glass pulls left today: ${left}</span>` : '<span class="muted">Sea Glass pulls are off (Settings)</span>'}`;
  }
  function payFor(n) {
    const coins = st().cur.coins;
    return coins >= n ? { mode: 'coin', cost: n, icon: 'i-coin' } : { mode: 'glass', cost: n === 10 ? D.GACHA.costGlass10 : D.GACHA.costGlass * n, icon: 'i-glass' };
  }
  function renderControls() {
    const el = box?.querySelector('#gz-ctl'); if (!el) return;
    const ph = run?.phase || 'idle';
    let h = '';
    if (ph === 'idle') {
      const free = S.gachaFreeAvailable(st(), now()), p1 = payFor(1), p10 = payFor(10);
      if (free) h += `<button class="btn lemon wide pulse gz-free" data-gz="pull:1:free">${ic('i-gift', 's')} Free daily capsule</button>`;
      h += `<div class="gz-row"><button class="btn pink col" data-gz="pull:1:${p1.mode}">Pull ×1<span class="sub">${cost(p1)}</span></button><button class="btn lav col" data-gz="pull:10:${p10.mode}">Pull ×10<span class="sub">${cost(p10)}</span></button></div>`;
    } else if (ph === 'ready') {
      h = run.n === 1 ? `<button class="btn green wide pulse" data-gz="open:0">Open capsule!</button>` : `<div class="gz-row"><button class="btn green col pulse" data-gz="openall">Open all</button><button class="btn ghost col" data-gz="summary">Skip to results</button></div>`;
    } else if (ph === 'reveal') {
      const unopened = run.m.out.filter((o) => !o.opened).length;
      const label = run.n === 1 ? 'Nice!' : !unopened ? 'See results' : run.queue.length ? 'Next' : 'Back to capsules';
      h = `<div class="gz-row ${run.n > 1 ? '' : 'one'}"><button class="btn green col" data-gz="next">${label}</button>${run.n > 1 ? `<button class="btn ghost col" data-gz="summary">Skip</button>` : ''}</div>`;
    } else if (ph === 'summary') {
      const p10 = payFor(10);
      h = `<div class="gz-row"><button class="btn ghost col" data-gz="done">Done</button><button class="btn lav col" data-gz="pull:10:${p10.mode}">Pull ×10 again<span class="sub">${cost(p10)}</span></button></div>`;
    } else h = `<div class="muted center gz-wait">…</div>`;
    el.innerHTML = h; run.ctlSig = ctlSig();
    const pit = box.querySelector('#gz-pity'); if (pit) pit.innerHTML = pityHtml();
    paintBox(el);
  }
  const cost = (p) => `<span class="cost">${ic(p.icon, 's')}${p.cost}</span>`;
  function paintBox(root) { ui.paintMini(root); }

  // ---- animation engine
  function startRun(b) {
    stopRun();
    const cv = b.querySelector('#gz-cv'); if (!cv) return;
    sizeCanvas(b, cv);
    const keep = run && run.phase !== 'idle' ? run : null;
    run = keep || { m: newMachine(), phase: 'idle', phaseT: 0, t: 0, results: [], n: 1, queue: [], parts: [], view: 'machine', cur: -1, unclaimed: false };
    run.cv = cv; run.c = cv.getContext('2d'); run.scale = cv.width / MW; run.last = performance.now();
    for (let i = 0; i < 30; i++) stepMachine(run.m, 1 / 30);
    cv.onpointerup = onCanvas;                         // on lift, so a scroll that starts on the crank doesn't spend a coin
    const loop = (tm) => { run.raf = requestAnimationFrame(loop); const dt = Math.min(0.05, (tm - run.last) / 1000); run.last = tm; frame(dt); };
    run.raf = requestAnimationFrame(loop);
    renderControls();
    if (run.phase === 'summary') showSummary();
    else if (run.phase === 'reveal' && run.results[run.cur]) showCard(run.results[run.cur]);
  }
  let resizeRaf = 0;
  function onResize() {
    if (!modal || !box || tab !== 'machine' || !run?.cv || resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => { resizeRaf = 0; if (!run?.cv || !box) return; sizeCanvas(box, run.cv); run.scale = run.cv.width / MW; });
  }
  function sizeCanvas(b, cv) {
    const stage = b.querySelector('#gz-stage');
    const wCss = Math.max(200, Math.min((stage?.clientWidth || 340) - 4, (window.innerHeight - 500) * (MW / MH), 420));
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.style.width = `${wCss}px`; cv.style.height = `${wCss * MH / MW}px`;
    cv.width = Math.round(wCss * dpr); cv.height = Math.round(wCss * MH / MW * dpr);
  }
  function stopRun() { if (run?.raf) { cancelAnimationFrame(run.raf); run.raf = 0; } }

  function setPhase(p) { run.phase = p; run.phaseT = 0; renderControls(); }
  function begin(n, mode) {
    if (run.phase !== 'idle' && run.phase !== 'summary') return;
    const r = G.gachaPull(n, mode);
    if (!r.ok) return;
    hideSummary();
    run.m.out = []; run.results = r.results; run.n = n; run.queue = []; run.cur = -1; run.unclaimed = true; run.view = 'machine';
    run.m.crankV = 15; run.m.shake = 1;
    A.play('crank'); setTimeout(() => A.play('rattle'), 250); haptic.tap();
    setPhase('crank'); updateWallet();
  }
  async function requestPull(n, mode) {
    if (!run || (run.phase !== 'idle' && run.phase !== 'summary')) return;
    if (mode === 'glass') {
      if (G.paidRandomBlocked()) { G.gachaPull(n, 'glass'); return; }      // shows the region message
      const c = payFor(n).cost;
      if (st().cur.glass < c) { G.ui.toast('Not enough Sea Glass', 'warn'); A.play('error'); ui.openShop('glass'); return; }
      if (!st().settings.paidPulls) { G.ui.toast('Sea Glass pulls are turned off in Settings', 'warn'); A.play('error'); return; }
      const left = S.gachaPaidLeft(st(), now());
      if (n > left) { G.ui.toast(left ? `Only ${left} Sea Glass pull${left === 1 ? '' : 's'} left today` : 'Daily Sea Glass pull limit reached. Free pulls still work!', 'warn'); A.play('error'); return; }
      const ok = await ui.confirm({ title: 'Spend Sea Glass?', body: `Use <b>${c} Sea Glass</b> for ${n === 1 ? '1 capsule' : '10 capsules'}? What comes out is random. Drop rates are in the Rates tab.`, ok: 'Pull', cancel: 'Not now' });
      if (!ok) return;
    }
    begin(n, mode);
  }
  function spawnOut(results, n) {
    const m = run.m; m.out = [];
    results.forEach((r, i) => {
      const o = { x: CHUTE.x, y: 382, tx: CHUTE.x, ty: TRAY_Y - 12, r: 26, tier: r.tier, hue: [330, 190, 48, 120, 260][i % 5], rot: 0.3, vr: 3, vy: 0, t0: m.time, i, ready: false, landed: false, res: r };
      if (n > 1) { const col = i % 5, row = Math.floor(i / 5); Object.assign(o, { x: 60 + col * 60 + (Math.random() - 0.5) * 14, y: -30 - i * 34, tx: 44 + col * 68, ty: 232 + row * 96, r: 27, t0: m.time + i * 0.11, vr: (Math.random() - 0.5) * 8 }); }
      let bumped = false;
      o.onLand = () => { if (!bumped) { bumped = true; if (n === 1 || i % 3 === 0) { A.play('clunk'); haptic.pop(); } } };
      o.onSettle = () => { o.ready = true; };
      m.out.push(o);
    });
    run.view = n > 1 ? 'pile' : 'machine';
  }
  function openCapsule(i) {
    const o = run.m.out[i]; if (!o || o.opened || run.phase === 'reveal' || run.phase === 'opening') return;
    run.cur = i; run.queue = run.queue.filter((q) => q !== i);
    o.opened = true; o.from = { x: o.x, y: o.y, r: o.r };
    A.play('twist'); haptic.tap();
    setPhase('opening');
  }
  function reveal() {
    const res = run.results[run.cur], o = run.m.out[run.cur];
    A.play('burst'); A.play(`tier${TIERS.findIndex((t) => t.id === res.tier) + 1}`);
    const tierIdx = TIERS.findIndex((t) => t.id === res.tier);
    if (tierIdx >= 3) { haptic.success(); setTimeout(() => haptic.heavy(), 180); run.m.flash = 1; } else if (tierIdx === 2) haptic.success(); else haptic.pop();
    const col = TIER_COLOR[res.tier], n = 18 + tierIdx * 14;
    for (let k = 0; k < n; k++) { const a = Math.random() * TAU, sp = 90 + Math.random() * 220; run.parts.push({ x: MW / 2, y: 210, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0, max: 0.9 + Math.random() * 0.8, s: 3 + Math.random() * 5 + tierIdx, col: k % 3 ? col : '#fff', rot: Math.random() * TAU }); }
    if (tierIdx >= 2) G.scene.confetti(tierIdx === 3 ? 70 : 30);
    setPhase('reveal'); showCard(res); if (o) o.hidden = true;
    run.opened = (run.opened || 0) + 1;
  }
  function showCard(res) {
    const el = box.querySelector('#gz-cap'); if (!el) return;
    const it = D.POOL_BY_ID[res.id], t = D.TIER[res.tier];
    let sub;
    if (res.reward) sub = `<div class="chips">${Object.entries(res.reward).map(([k, v]) => `<span class="chipx">${ic(k === 'coins' ? 'i-coin' : k === 'glass' ? 'i-glass' : k === 'tokens' ? 'i-token' : 'i-pearl')}+${fmt(v)}</span>`).join('')}</div>`;
    else if (res.isNew) sub = `<span class="new">NEW!</span>`;
    else sub = `<span class="tag">Duplicate · ×${st().gacha.owned[res.id]}</span> <span class="chipx">${ic('i-shard')}+${res.shards}</span>`;
    el.innerHTML = `<div class="gz-tier" style="color:${t.color}">${stars(t.stars)}</div><h3>${esc(it.name)}</h3><div class="gz-kind">${t.name} ${kindLabel(it)}</div>${sub}`;
    el.hidden = false; el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
  }
  const kindLabel = (it) => it.filler ? 'prize' : it.kind === 'fig' ? (it.gold ? 'golden figure' : 'figure') : it.kind === 'prop' ? 'decor' : it.kind === 'hat' ? 'hat' : it.kind === 'skin' ? 'pool skin' : it.kind === 'fx' ? 'effect' : '';
  function hideCard() { const el = box?.querySelector('#gz-cap'); if (el) el.hidden = true; }
  function afterReveal() {
    hideCard();
    if (run.n === 1) { run.m.out = []; run.unclaimed = false; setPhase('idle'); return; }
    const left = run.m.out.filter((o) => !o.opened);
    if (!left.length) return showSummary();
    setPhase('ready');
    if (run.auto) { run.queue = left.map((o) => o.i); openCapsule(run.queue[0]); }
  }
  function showSummary() {
    hideCard(); run.unclaimed = false; run.auto = false;
    const el = box.querySelector('#gz-sum'); if (!el) return;
    const res = run.results; let news = 0, sh = 0; const rank = (r) => TIERS.findIndex((t) => t.id === r.tier);
    res.forEach((r) => { if (r.isNew) news++; sh += r.shards || 0; });
    const best = res.reduce((a, r) => (rank(r) > rank(a) ? r : a), res[0]);
    el.innerHTML = `<h3>Results</h3><div class="gz-grid">${res.map((r) => `<div class="gz-cell tier-${r.tier}" style="--tc:${TIER_COLOR[r.tier]}">${thumb(r.id, true)}${r.isNew ? '<i class="nw">NEW</i>' : r.shards ? `<i class="dp">+${r.shards}</i>` : ''}<span>${esc(itemName(r.id))}</span></div>`).join('')}</div>
      <div class="chips"><span class="chipx">${ic('i-sparkle')}${news} new</span><span class="chipx">${ic('i-shard')}+${sh} shards</span><span class="chipx">${stars(D.TIER[best.tier].stars)} best: ${D.TIER[best.tier].name}</span></div>`;
    el.hidden = false; paintBox(el);
    setPhase('summary');
  }
  function hideSummary() { const el = box?.querySelector('#gz-sum'); if (el) el.hidden = true; }

  function frame(dt) {
    const r = run, m = r.m, c = r.c; r.t += dt; r.phaseT += dt;
    stepMachine(m, dt);
    if (r.phase === 'crank' && r.phaseT > 1.15) { spawnOut(r.results, r.n); setPhase('drop'); }
    else if (r.phase === 'drop') {
      if (m.out.length && m.out.every((o) => o.ready)) { setPhase('ready'); if (r.auto) { r.queue = m.out.map((o) => o.i); openCapsule(0); } }
    } else if (r.phase === 'opening') {
      const o = m.out[r.cur], k = Math.min(1, r.phaseT / 0.55);
      o.x = o.from.x + (MW / 2 - o.from.x) * easeOutBack(Math.min(1, k * 1.6)); o.y = o.from.y + (200 - o.from.y) * Math.min(1, k * 1.6); o.r = o.from.r + (62 - o.from.r) * Math.min(1, k * 1.6);
      o.rot = Math.sin(r.phaseT * 30) * 0.18 * (1 - k) * 1.5; o.open = 0;
      if (r.phaseT > 0.55) { o.open = Math.min(1, (r.phaseT - 0.55) / 0.22); if (o.open > 0.95) reveal(); }
    }
    for (const p of r.parts) { p.life += dt; p.vy += 260 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += 4 * dt; }
    r.parts = r.parts.filter((p) => p.life < p.max);
    // ---------------- draw
    c.setTransform(r.scale, 0, 0, r.scale, 0, 0); c.clearRect(0, 0, MW, MH);
    if (r.view === 'pile') { c.save(); c.globalAlpha = 0.3; drawMachine(c, m, r.t, {}); c.restore(); } else drawMachine(c, m, r.t, { hover: r.phase === 'idle' ? 1 : 0 });
    drawDropped(c, m, r.t, { skip: r.phase === 'opening' ? m.out[r.cur] : null });
    if (r.phase === 'opening' || r.phase === 'reveal') {
      const o = m.out[r.cur], res = r.results[r.cur], col = TIER_COLOR[res.tier];
      if (r.phase === 'reveal') {
        const k = Math.min(1, r.phaseT / 0.5);
        c.fillStyle = `rgba(28,10,66,${0.78 * Math.min(1, r.phaseT * 4)})`; c.fillRect(0, 0, MW, MH);
        c.save(); c.translate(MW / 2, 205); c.rotate(r.t * 0.35); c.globalAlpha = 0.5 * k;
        for (let i = 0; i < 12; i++) { c.rotate(TAU / 12); c.beginPath(); c.moveTo(0, 0); c.lineTo(-16, -260); c.lineTo(16, -260); c.closePath(); const g = c.createLinearGradient(0, 0, 0, -260); g.addColorStop(0, col); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fill(); }
        c.restore();
        const gl = c.createRadialGradient(MW / 2, 205, 10, MW / 2, 205, 150); gl.addColorStop(0, col); gl.addColorStop(1, 'rgba(255,255,255,0)'); c.save(); c.globalAlpha = 0.55 * k; c.fillStyle = gl; c.beginPath(); c.arc(MW / 2, 205, 150, 0, TAU); c.fill(); c.restore();
        c.save(); c.translate(MW / 2, 196); const sc = 0.55 + 0.45 * easeOutBack(k); c.scale(sc, sc); c.translate(-MW / 2, -196);
        drawItemArt(c, res.id, MW / 2, 190 + Math.sin(r.t * 2.2) * 4, 190, r.t); c.restore();
      } else if (o) drawDropped(c, { out: [o], time: 1e9 }, r.t, {});
    }
    for (const p of r.parts) { c.save(); c.globalAlpha = Math.max(0, 1 - p.life / p.max); c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = p.col; c.beginPath(); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; c.lineTo(Math.cos(a) * p.s, Math.sin(a) * p.s); c.lineTo(Math.cos(a + 0.78) * p.s * 0.3, Math.sin(a + 0.78) * p.s * 0.3); } c.fill(); c.restore(); }
    if (m.flash > 0.01) { c.fillStyle = `rgba(255,255,255,${m.flash * 0.75})`; c.fillRect(0, 0, MW, MH); }
  }
  function onCanvas(e) {
    if (!run) return; A.unlock();
    const r = run.cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * MW, y = (e.clientY - r.top) / r.height * MH;
    if (run.phase === 'idle') { if (Math.hypot(x - 262, y - 372) < 56) requestPull(1, S.gachaFreeAvailable(st(), now()) ? 'free' : payFor(1).mode); return; }
    if (run.phase === 'ready') {
      let best = -1, bd = 1e9;
      run.m.out.forEach((o, i) => { if (o.opened) return; const d = Math.hypot(x - o.x, y - o.y); if (d < o.r + 14 && d < bd) { bd = d; best = i; } });
      if (best >= 0) openCapsule(best);
      return;
    }
    if (run.phase === 'reveal') afterReveal();
  }

  // ------------------------------------------------------------------ TOYBOX tab
  function slot(id) {
    const g = st().gacha, n = g.owned[id] || 0, it = D.POOL_BY_ID[id];
    return `<button class="slot toy ${n ? '' : 'unk'} tier-${it.tier}" style="--tc:${TIER_COLOR[it.tier]}" data-gz="toy:${id}" aria-label="${esc(n ? it.name : 'Unknown toy')}">${thumb(id, !!n)}<span>${n ? esc(it.name.replace(' Figure', '')) : '???'}</span>${n > 1 ? `<b class="cnt">×${n}</b>` : ''}</button>`;
  }
  function toysBody() {
    const s = st(), owned = S.toysOwned(s), total = D.COLLECTIBLE_IDS.length;
    let h = `<div class="card hi row between"><div><b>${owned} / ${total} toys collected</b><div class="muted">Duplicates become shards for the Prize Counter</div></div>${ic('i-capsule', 'l')}</div>`;
    h += `<div class="mile">${D.TOY_MILESTONES.map((m, i) => { const got = s.gacha.milesClaimed.includes(i), can = !got && owned >= m.n; return `<button class="${got ? 'got' : can ? 'can' : ''}" data-gz="mile:${i}">${m.n}<br>${got ? '✓' : `${ic('i-coin', 's')}${m.reward.coins}`}</button>`; }).join('')}</div>`;
    h += `<div class="tabs" style="padding:0 0 8px"><button class="${toyTab === 'figs' ? 'on' : ''}" data-gz="toytab:figs">Figures</button><button class="${toyTab === 'goods' ? 'on' : ''}" data-gz="toytab:goods">Goodies</button></div>`;
    if (toyTab === 'figs') {
      for (const set of S.toySetInfo(s)) {
        const gold = set.id === 'set_gold';
        h += `<div class="dexfam"><div class="fh"><span>${esc(set.name)} <small>${set.have}/${set.total}</small></span>${set.claimed ? '<span class="tag">Complete ✓</span>' : set.have >= set.total ? `<button class="btn small lemon pulse" data-gz="set:${set.id}">Claim ${rewardChips(set.reward)}</button>` : `<small>Set bonus ${rewardChips(set.reward)}</small>`}</div>
          <div class="dexrow ${gold ? '' : ''}">${set.items.slice(0, 4).map(slot).join('')}</div>${set.items.length > 4 ? `<div class="dexrow r3" style="grid-template-columns:repeat(${Math.min(4, set.items.length - 4)},1fr)">${set.items.slice(4, 8).map(slot).join('')}</div>` : ''}${set.items.length > 8 ? `<div class="dexrow r3" style="grid-template-columns:repeat(${set.items.length - 8},1fr)">${set.items.slice(8).map(slot).join('')}</div>` : ''}</div>`;
      }
    } else {
      for (const [kind, label] of [['hat', 'Hats'], ['prop', 'Beach decor'], ['skin', 'Pool skins'], ['fx', 'Effects']]) {
        const ids = D.GACHA_POOL.filter((i) => i.kind === kind).map((i) => i.id);
        h += `<div class="dexfam"><div class="fh"><span>${label}</span><small>${ids.filter((i) => s.gacha.owned[i]).length}/${ids.length}</small></div><div class="dexrow">${ids.map(slot).join('')}</div></div>`;
      }
    }
    return h;
  }
  function toyDetail(id) {
    const s = st(), it = D.POOL_BY_ID[id], n = s.gacha.owned[id] || 0, t = D.TIER[it.tier], row = S.gachaTable(now()).rows.find((r) => r.id === id);
    ui.mountModal('toydetail', { title: n ? it.name : 'Not collected yet', top: true, render: () => {
      let act = '';
      if (n && (it.kind === 'fig' || it.kind === 'prop')) act = `<button class="btn green wide" data-gz="place:${id}">Place on my beach</button>`;
      else if (n && (it.kind === 'skin' || it.kind === 'fx')) act = `<button class="btn green wide" data-gz="equip:${id}">Equip</button>`;
      else if (n && it.kind === 'hat') act = `<p class="muted">Tap a creature, open <b>Style</b> and pick this hat.</p>`;
      else act = `<button class="btn lemon wide" data-gz="prizefor:${id}">Prize Counter · ${ic('i-shard', 's')}${t.prize}</button>`;
      return { body: `<div class="reveal center"><div class="gz-detail-art" style="--tc:${TIER_COLOR[it.tier]}">${thumb(id, !!n)}</div><div class="chips">${tierTag(it.tier)}${n ? `<span class="tag">Owned ×${n}</span>` : ''}</div><p class="muted">${n ? esc(D.DECOR[id]?.blurb || `A ${kindLabel(it)} from the Capsule Machine.`) : `Chance per pull: ${pct(row.prob)}${row.spotlight ? ' (this week\'s spotlight!)' : ''}`}</p>${act}</div>` };
    } });
  }

  // ------------------------------------------------------------------ PRIZES tab
  function prizesBody() {
    const s = st(), g = s.gacha;
    let h = `<div class="card hi"><div class="row between"><div><b>${ic('i-shard', 's')} ${fmt(g.shards)} shards</b><div class="muted">Every duplicate capsule turns into shards. Trade them for the exact toy you want.</div></div></div></div>`;
    h += `<div class="tabs compact" style="padding:8px 0">${TIERS.map((t) => `<button class="${prizeTier === t.id ? 'on' : ''}" data-gz="ptier:${t.id}">${t.name}</button>`).join('')}</div>`;
    const list = D.POOL_BY_TIER[prizeTier].filter((i) => !i.filler && !g.owned[i.id]);
    if (!list.length) h += `<div class="card center"><b>You own every ${D.TIER[prizeTier].name} toy!</b></div>`;
    else h += `<div class="list">${list.map((i) => { const c = S.prizeCost(i.id), can = g.shards >= c; return `<div class="card prize-row">${thumb(i.id, true, 'pt')}<div class="pn"><b>${esc(i.name)}</b><small>${kindLabel(i)}</small></div><button class="btn small ${can ? 'green' : 'off'}" data-gz="prize:${i.id}">${ic('i-shard', 's')}${c}</button></div>`; }).join('')}</div>`;
    return h;
  }

  // ------------------------------------------------------------------ RATES tab
  function ratesBody() {
    const s = st(), tb = S.gachaTable(now()), cap = D.GACHA.paidDailyCap;
    let h = `<div class="card"><h5>How the Capsule Machine works</h5><ul class="bul">
      <li>${ic('i-check', 's')}<span>Every capsule comes from the tables below. Free, Coin and Sea Glass pulls all use <b>the same rates</b>.</span></li>
      <li>${ic('i-check', 's')}<span>Tier rates: ${TIERS.map((t) => `<b>${t.name} ${t.p}%</b>`).join(' · ')}. Inside a tier, each item's share is listed below.</span></li>
      <li>${ic('i-check', 's')}<span><b>Guarantees:</b> at least one Rare or better in every ${D.GACHA.pityRare} pulls and a Legendary at least every ${D.GACHA.pityLegend} pulls. Your counters: <b>${s.gacha.pityR}</b> of ${D.GACHA.pityRare} and <b>${s.gacha.pityL}</b> of ${D.GACHA.pityLegend}.</span></li>
      <li>${ic('i-check', 's')}<span><b>Spotlight:</b> each week one Rare and one Legendary item are ${D.GACHA.spotMult}× as likely as the others in their tier.</span></li>
      <li>${ic('i-check', 's')}<span><b>Duplicates</b> become shards (${TIERS.map((t) => `${t.name} ${t.shards}`).join(', ')}) for the Prize Counter, where any toy can be bought outright.</span></li>
      <li>${ic('i-check', 's')}<span>Toys, hats and looks are cosmetic. They never change how fast creatures earn or evolve. Small prizes (coins, Sea Glass, pearls, Speed Tokens) are one-time.</span></li>
      <li>${ic('i-check', 's')}<span><b>Free ways to pull:</b> a free capsule every day, plus Capsule Coins from quests, Tide Gifts, daily rewards and the Tidedex.</span></li>
      <li>${ic('i-check', 's')}<span><b>Spending limit:</b> ${cap} Sea Glass pulls per day. Turn Sea Glass pulls off any time in Settings.</span></li></ul></div>`;
    for (const t of TIERS) {
      const rows = tb.rows.filter((r) => r.tier === t.id).sort((a, b) => b.prob - a.prob);
      h += `<details class="rate-tier" ${t.id === 'legendary' ? 'open' : ''}><summary style="--tc:${t.color}"><span>${stars(t.stars)} ${t.name}</span><b>${t.p}%</b></summary><div class="list">${rows.map((r) => `<div class="rate-row"><span class="rt">${thumb(r.id, true)}</span><span class="rn">${esc(itemName(r.id))}${r.spotlight ? ` <i class="spot">${ic('i-sparkle', 's')}spotlight</i>` : ''}<small>${s.gacha.owned[r.id] ? `owned ×${s.gacha.owned[r.id]}` : ''}</small></span><b>${pct(r.prob)}</b></div>`).join('')}</div></details>`;
    }
    return h;
  }

  // ------------------------------------------------------------------ clicks
  async function onClick(e) {
    const b = e.target.closest('[data-gz]'); if (!b || !modal) return;
    const [act, ...rest] = b.dataset.gz.split(':'), a1 = rest[0], a2 = rest[1];
    A.unlock(); if (act !== 'pull') A.play('tap'); haptic.tap();
    switch (act) {
      case 'tab': setTab(a1); break;
      case 'pull': requestPull(+a1, a2); break;
      case 'open': openCapsule(+a1); break;
      case 'openall': run.auto = true; run.queue = run.m.out.filter((o) => !o.opened).map((o) => o.i); openCapsule(run.queue[0]); break;
      case 'next': afterReveal(); break;
      case 'summary': { for (const o of run.m.out) o.opened = true; hideCard(); showSummary(); break; }
      case 'done': hideSummary(); run.m.out = []; run.view = 'machine'; setPhase('idle'); break;
      case 'toytab': toyTab = a1; ui.drawModal(modal); break;
      case 'toy': toyDetail(a1); break;
      case 'mile': { const r = G.claimToyMile(+a1); if (r.ok) ui.drawModal(modal); break; }
      case 'set': { const r = G.claimToySet(a1); if (r.ok) ui.drawModal(modal); break; }
      case 'ptier': prizeTier = a1; ui.drawModal(modal); break;
      case 'prize': { const r = G.prizeBuy(a1); if (r.ok) ui.drawModal(modal); break; }
      case 'place': ui.closeModal('toydetail'); ui.closeModal('gacha'); ui.closeAllModals(); G.setTab('build'); G.setTool(`decor:${a1}`); ui.layoutChanged(); break;
      case 'equip': G.equip(a1); ui.closeModal('toydetail'); break;
      case 'prizefor': ui.closeModal('toydetail'); prizeTier = D.POOL_BY_ID[a1].tier; setTab('prizes'); break;
      default: break;
    }
    if (act !== 'pull' && act !== 'tab') updateWallet();
  }
  // keep the wallet, pity text and the pull buttons fresh while the machine is open (coins can change underneath us)
  const ctlSig = () => `${S.gachaFreeAvailable(st(), now())}|${payFor(1).mode}|${payFor(10).mode}|${st().settings.paidPulls}|${G.paidRandomBlocked()}`;
  setInterval(() => {
    if (!modal || !box) return;
    updateWallet();
    if (run && tab === 'machine' && run.phase === 'idle') {
      const pit = box.querySelector('#gz-pity'); if (pit) pit.innerHTML = pityHtml();
      const sig = ctlSig(); if (sig !== run.ctlSig) renderControls();
    }
  }, 500);

  return { open, isOpen: () => !!modal, refreshWallet: updateWallet };
}
