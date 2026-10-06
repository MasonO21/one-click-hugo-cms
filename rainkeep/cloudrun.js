/*
 * Rainkeep: Cloud Run. The Rainwyrm flies out over the dunes to herd rain clouds back to the keep.
 * Drag (or use the arrow keys) to steer: fly through clouds, storm clouds count triple, golden drops
 * are Starglass, and dust devils cost a heart. A flight lasts 45 seconds or three hearts, whichever
 * runs out first, and brings home water, Starglass and bond. Three flights a day, from Rainwyrm Lv 5.
 * Drawn on a full-screen canvas; the rest of the game waits while you fly.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { $, clamp, fmt, icon, esc, today } = KH.u;
  const { UI, ACT } = KH;
  const CR = DATA.cloudRun;
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => { s.cloud = { day: -1, used: 0 }; s.stats.cloudRuns = 0; s.stats.cloudBest = 0; s.stats.clouds = 0; });

  const unlocked = () => !!S && S.lv.wyrm >= CR.unlock;
  const left = () => (S.cloud.day === today() ? Math.max(0, CR.perDay - S.cloud.used) : CR.perDay);
  function spend() { if (S.cloud.day !== today()) S.cloud = { day: today(), used: 0 }; S.cloud.used++; }
  function rewardsFor(clouds, drops) {
    const g = clouds ? KH.scaleReward({ water: clouds * CR.water }) : {};
    if (drops) g.starglass = drops * CR.drop;
    return g;
  }
  function bankFlight(clouds, drops) {
    const g = rewardsFor(clouds, drops);
    KH.grant(g);
    S.stats.cloudRuns++;
    S.stats.clouds += clouds;
    S.stats.cloudBest = Math.max(S.stats.cloudBest, clouds);
    if (KH.bondAdd) KH.bondAdd(Math.floor(clouds / CR.bondPer));
    KH.emit('cloudrun', { clouds, drops });
    KH.save();
    return g;
  }

  // ======================================================================
  // The flight
  // ======================================================================
  let G = null; // the running flight
  function host() {
    let el = $('#cloudrun');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cloudrun';
      el.hidden = true;
      el.innerHTML = '<canvas></canvas><div class="cr-hud"></div><div class="cr-card"></div>';
      $('#battle').parentNode.appendChild(el);
      const cv = el.querySelector('canvas');
      const steer = (e) => { if (G && G.on) { const r = cv.getBoundingClientRect(); G.tx = clamp(e.clientX - r.left, 24, r.width - 24); } };
      cv.addEventListener('pointerdown', (e) => { steer(e); if (cv.setPointerCapture) try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } });
      cv.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') steer(e); });
      window.addEventListener('keydown', (e) => { if (G && G.on && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { G.keys[e.key] = true; e.preventDefault(); } });
      window.addEventListener('keyup', (e) => { if (G) G.keys[e.key] = false; });
    }
    return el;
  }
  ACT.cloudrun = () => {
    if (!unlocked()) return KH.toast(`${S.wyrm.name} can fly from Lv ${CR.unlock}.`, 'warn');
    if (S.dormant) return KH.toast(`${S.wyrm.name} is dormant. Get the water flowing first.`, 'warn');
    UI.sheet = null;
    const el = host();
    el.hidden = false;
    G = null;
    card(`<h2>Cloud Run</h2><p>${esc(S.wyrm.name)} is ready to fly out and herd the rain clouds home.</p>
      <p class="muted small">Drag to steer. Fly through clouds (storm clouds count three), catch golden drops, and dodge the dust devils: three hits and ${esc(S.wyrm.name)} turns for home. ${CR.seconds} seconds a flight.</p>
      <div class="row" style="justify-content:center;gap:8px">${left() ? `<button class="btn gold" data-act="crgo">Fly! (${left()} left today)</button>` : '<span class="chip">No flights left today</span>'}<button class="btn alt" data-act="crclose">Not now</button></div>`);
    drawIdle();
  };
  function card(html) { const c = host().querySelector('.cr-card'); c.innerHTML = html; c.hidden = !html; }
  ACT.crclose = () => { if (G) G.on = false; G = null; host().hidden = true; };
  ACT.crgo = () => {
    if (!left()) return;
    spend();
    card('');
    const cv = host().querySelector('canvas'), r = cv.getBoundingClientRect();
    G = { on: true, t: 0, w: r.width, h: r.height, x: r.width / 2, tx: r.width / 2, hearts: CR.hearts, inv: 0, clouds: 0, drops: 0, objs: [], trail: [], dist: 0, spawn: 0, keys: {}, last: performance.now(), shake: 0, pops: [] };
    G.segs = Array.from({ length: 16 }, () => G.x);
    requestAnimationFrame(loop);
  };
  function finish() {
    G.on = false;
    const g = bankFlight(G.clouds, G.drops);
    const best = S.stats.cloudBest === G.clouds && G.clouds > 0;
    card(`<h2>${G.hearts > 0 ? 'Home with the clouds!' : 'Back early'}</h2>
      <div class="cr-score"><b>${G.clouds}</b><span>clouds${best ? ' · new best' : ''}</span></div>
      ${Object.keys(g).length ? `<div class="costs" style="justify-content:center">${KH.rewardHTML(g)}</div>` : '<p class="muted">No clouds this time.</p>'}
      <p class="muted small">${left() ? `${left()} flight${left() > 1 ? 's' : ''} left today.` : 'That was the last flight today.'}</p>
      <div class="row" style="justify-content:center;gap:8px">${left() ? '<button class="btn gold" data-act="crgo">Fly again</button>' : ''}<button class="btn alt" data-act="crclose">Back to the keep</button></div>`);
    KH.sfx('victory');
  }

  function spawn() {
    const k = clamp(G.t / CR.seconds, 0, 1), roll = Math.random(), x = 30 + Math.random() * (G.w - 60);
    if (roll < 0.05) G.objs.push({ kind: 'drop', x, y: -30, r: 13 });
    else if (roll < 0.11) G.objs.push({ kind: 'storm', x, y: -40, r: 30 });
    else if (roll < 0.11 + 0.14 + 0.26 * k) G.objs.push({ kind: 'devil', x, y: -40, r: 20, ph: Math.random() * 6, dx: (Math.random() - 0.5) * 60 });
    else G.objs.push({ kind: 'cloud', x, y: -30, r: 22 + Math.random() * 6 });
  }
  function loop(now) {
    if (!G || !G.on) return;
    const dt = Math.min(0.05, (now - G.last) / 1000);
    G.last = now;
    G.t += dt;
    const k = clamp(G.t / CR.seconds, 0, 1), v = CR.speed[0] + (CR.speed[1] - CR.speed[0]) * k;
    if (G.keys.ArrowLeft) G.tx = clamp(G.tx - 420 * dt, 24, G.w - 24);
    if (G.keys.ArrowRight) G.tx = clamp(G.tx + 420 * dt, 24, G.w - 24);
    G.x += (G.tx - G.x) * Math.min(1, dt * 9);
    // each body segment follows the one ahead of it, so the body stays whole at any frame rate
    for (let i = 0; i < G.segs.length; i++) { const ahead = i ? G.segs[i - 1] : G.x; G.segs[i] += (ahead - G.segs[i]) * Math.min(1, dt * 14); }
    G.dist += v * dt;
    G.spawn -= v * dt;
    if (G.spawn <= 0) { spawn(); G.spawn = 70 + Math.random() * 60; }
    const hy = G.h * 0.72;
    for (const o of G.objs) {
      o.y += v * dt;
      if (o.kind === 'devil') { o.ph += dt * 6; o.x = clamp(o.x + o.dx * dt, 20, G.w - 20); }
      if (o.gone) continue;
      if (Math.hypot(o.x - G.x, o.y - hy) < o.r + 16) {
        if (o.kind === 'devil') {
          if (G.inv <= 0) { G.hearts--; G.inv = 1.3; G.shake = 0.35; KH.sfx('hurt'); if (navigator.vibrate) try { navigator.vibrate(60); } catch (e) { /* ignore */ } }
        } else {
          o.gone = true;
          const n = o.kind === 'storm' ? 3 : o.kind === 'cloud' ? 1 : 0;
          G.clouds += n;
          if (o.kind === 'drop') G.drops++;
          G.pops.push({ x: o.x, y: o.y, t: 0, txt: o.kind === 'drop' ? `+${CR.drop}◆` : `+${n}` });
          KH.sfx(o.kind === 'drop' ? 'coin' : 'tap');
        }
      }
    }
    G.objs = G.objs.filter((o) => o.y < G.h + 60 && !(o.gone && o.kind !== 'devil'));
    G.inv -= dt; G.shake = Math.max(0, G.shake - dt);
    for (const p of G.pops) p.t += dt;
    G.pops = G.pops.filter((p) => p.t < 0.8);
    draw(now / 1000);
    if (G.hearts <= 0 || G.t >= CR.seconds) return finish();
    requestAnimationFrame(loop);
  }

  // ======================================================================
  // Drawing
  // ======================================================================
  function canvasCtx() {
    const cv = host().querySelector('canvas'), r = cv.getBoundingClientRect(), DPR = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(r.width * DPR) || cv.height !== Math.round(r.height * DPR)) { cv.width = Math.round(r.width * DPR); cv.height = Math.round(r.height * DPR); }
    const g = cv.getContext('2d');
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    return { g, w: r.width, h: r.height };
  }
  function ground(g, w, h, off) {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#e8b878'); gr.addColorStop(1, '#d49a5c');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // dune ridges and their shadows, scrolling past
    for (let i = -1; i < 9; i++) {
      const y = ((i * 140 + off * 0.9) % (h + 280)) - 140;
      g.fillStyle = 'rgba(160,96,48,.22)';
      g.beginPath(); g.moveTo(-20, y + 40);
      for (let x = -20; x <= w + 20; x += 20) g.lineTo(x, y + 30 * Math.sin(x * 0.015 + i * 1.7) + 10 * Math.sin(x * 0.05 + i));
      g.lineTo(w + 20, y + 70); g.lineTo(-20, y + 70); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,236,200,.35)'; g.lineWidth = 2;
      g.beginPath();
      for (let x = -20; x <= w + 20; x += 20) { const yy = y + 30 * Math.sin(x * 0.015 + i * 1.7) + 10 * Math.sin(x * 0.05 + i); if (x === -20) g.moveTo(x, yy); else g.lineTo(x, yy); }
      g.stroke();
    }
    // the odd palm-ringed oasis
    const oy = ((off * 0.9 + 300) % (h + 900)) - 200;
    g.fillStyle = 'rgba(63,192,216,.75)'; g.beginPath(); g.ellipse(w * 0.22, oy, 34, 16, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#4f8f36'; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(w * 0.22 + Math.cos(k * 1.7) * 38, oy + Math.sin(k * 1.7) * 18, 8, 0, Math.PI * 2); g.fill(); }
  }
  function puff(g, x, y, r, col, shade) {
    g.fillStyle = shade; for (const [dx, dy, s] of [[-0.6, 0.25, 0.6], [0.55, 0.2, 0.65], [0, 0.32, 0.7]]) { g.beginPath(); g.arc(x + dx * r, y + dy * r + 4, r * s, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = col; for (const [dx, dy, s] of [[-0.6, 0.1, 0.55], [0.55, 0.05, 0.6], [0, -0.2, 0.75], [0, 0.2, 0.6]]) { g.beginPath(); g.arc(x + dx * r, y + dy * r, r * s, 0, Math.PI * 2); g.fill(); }
  }
  function wyrm(g, x, y, t, blink) {
    const sk = DATA.skins[S.skins.on] || DATA.skins.river, n = 16, sp = 9;
    if (blink && Math.floor(t * 12) % 2) g.globalAlpha = 0.45;
    // the body trails the head's path
    for (let i = n; i >= 1; i--) {
      const bx = G && G.segs ? G.segs[i - 1] : x, by = y + i * sp, rr = 13 - i * 0.55;
      g.fillStyle = i % 2 ? sk.body[0] : sk.body[1];
      g.beginPath(); g.arc(bx + Math.sin(t * 6 - i * 0.6) * 2, by, Math.max(3, rr), 0, Math.PI * 2); g.fill();
      if (i === 5 || i === 9) { g.fillStyle = sk.fin; g.beginPath(); g.ellipse(bx - rr - 4, by, 9, 4, -0.5 + Math.sin(t * 8) * 0.3, 0, Math.PI * 2); g.ellipse(bx + rr + 4, by, 9, 4, 0.5 - Math.sin(t * 8) * 0.3, 0, Math.PI * 2); g.fill(); }
    }
    g.fillStyle = sk.body[1]; g.beginPath(); g.ellipse(x, y, 16, 18, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = sk.belly; g.beginPath(); g.ellipse(x, y - 6, 9, 8, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = sk.horn; g.beginPath(); g.moveTo(x - 9, y - 10); g.lineTo(x - 13, y - 26); g.lineTo(x - 4, y - 14); g.fill(); g.beginPath(); g.moveTo(x + 9, y - 10); g.lineTo(x + 13, y - 26); g.lineTo(x + 4, y - 14); g.fill();
    g.fillStyle = '#1a0e07'; g.beginPath(); g.arc(x - 6, y - 4, 3, 0, Math.PI * 2); g.arc(x + 6, y - 4, 3, 0, Math.PI * 2); g.fill();
    g.fillStyle = sk.eye; g.beginPath(); g.arc(x - 5, y - 5, 1.2, 0, Math.PI * 2); g.arc(x + 7, y - 5, 1.2, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
  }
  function draw(t) {
    const { g, w, h } = canvasCtx();
    g.save();
    if (G.shake > 0) g.translate((Math.random() - 0.5) * 10 * G.shake, (Math.random() - 0.5) * 10 * G.shake);
    ground(g, w, h, G.dist);
    for (const o of G.objs) {
      if (o.kind === 'cloud' && !o.gone) puff(g, o.x, o.y, o.r, '#ffffff', 'rgba(120,150,180,.35)');
      else if (o.kind === 'storm' && !o.gone) {
        puff(g, o.x, o.y, o.r, '#b8c4d4', 'rgba(60,70,90,.4)');
        if (Math.sin(t * 9 + o.x) > 0.7) { g.strokeStyle = '#fff4b8'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(o.x, o.y + 8); g.lineTo(o.x - 6, o.y + 22); g.lineTo(o.x + 3, o.y + 22); g.lineTo(o.x - 4, o.y + 38); g.stroke(); }
      } else if (o.kind === 'drop' && !o.gone) {
        g.fillStyle = '#ffd36e'; g.beginPath(); g.moveTo(o.x, o.y - o.r); g.quadraticCurveTo(o.x + o.r, o.y + 2, o.x, o.y + o.r); g.quadraticCurveTo(o.x - o.r, o.y + 2, o.x, o.y - o.r); g.fill();
        g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(o.x - 3, o.y - 1, 3, 0, Math.PI * 2); g.fill();
      } else if (o.kind === 'devil') {
        for (let k = 0; k < 6; k++) {
          const yy = o.y - 26 + k * 10, rw = 6 + k * 3.5;
          g.strokeStyle = `rgba(150,96,50,${0.35 + k * 0.08})`; g.lineWidth = 3;
          g.beginPath(); g.ellipse(o.x + Math.sin(o.ph + k) * 4, yy, rw, 4, 0, o.ph + k, o.ph + k + Math.PI * 1.6); g.stroke();
        }
        g.fillStyle = 'rgba(150,96,50,.25)'; g.beginPath(); g.ellipse(o.x, o.y + 30, 18, 6, 0, 0, Math.PI * 2); g.fill();
      }
    }
    wyrm(g, G.x, h * 0.72, t, G.inv > 0);
    g.font = "800 20px 'Barlow Semi Condensed', sans-serif"; g.textAlign = 'center';
    for (const p of G.pops) { g.globalAlpha = 1 - p.t / 0.8; g.fillStyle = p.txt.includes('◆') ? '#ffd36e' : '#ffffff'; g.strokeStyle = 'rgba(40,20,6,.7)'; g.lineWidth = 3; g.strokeText(p.txt, p.x, p.y - p.t * 40); g.fillText(p.txt, p.x, p.y - p.t * 40); }
    g.globalAlpha = 1;
    g.restore();
    const hud = host().querySelector('.cr-hud');
    const txt = `<span class="cr-clouds">☁ ${G.clouds}</span><span class="cr-hearts">${'♥'.repeat(Math.max(0, G.hearts))}<i>${'♥'.repeat(CR.hearts - Math.max(0, G.hearts))}</i></span><div class="cr-time"><i style="width:${(1 - G.t / CR.seconds) * 100}%"></i></div>`;
    if (hud._h !== txt) { hud.innerHTML = txt; hud._h = txt; }
  }
  function drawIdle() {
    const { g, w, h } = canvasCtx();
    ground(g, w, h, 0);
    const saved = G;
    G = { segs: Array.from({ length: 16 }, () => w / 2) };
    wyrm(g, w / 2, h * 0.72, performance.now() / 1000, false);
    G = saved;
    const hud = host().querySelector('.cr-hud'); hud.innerHTML = ''; hud._h = '';
  }

  // entry points: a side button and the Rainwyrm's sheet
  KH.side.push({ id: 'cloudrun', icon: 'i-storm', label: 'Cloud Run', act: 'cloudrun', show: () => unlocked(), dot: () => left() === CR.perDay, badge: () => `${left()}/${CR.perDay}` });
  const prevExtras = KH.wyrmExtras;
  KH.wyrmExtras = () => `${prevExtras ? prevExtras() : ''}${unlocked() ? `<button class="btn wide gold" data-act="cloudrun">${icon('i-storm')}Cloud Run · ${left()}/${CR.perDay} flights today</button>` : ''}`;

  // for tests and the balance bot: a flight flown well
  KH.cloudRun = { unlocked, left, auto: (clouds = 32, drops = 1) => { if (!unlocked() || !left()) return null; spend(); return bankFlight(clouds, drops); }, state: () => G };
})();
