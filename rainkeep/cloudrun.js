/*
 * Rainkeep: Cloud Run. The Rainwyrm flies out over the dunes to herd rain clouds back to the keep.
 * Drag (or use the arrow keys) to steer: fly through clouds (storm clouds count triple), thread the rain
 * rings to build a combo that makes every cloud worth more, catch golden drops (Starglass) and the odd
 * Rain Pearl, and dodge the dust devils. A flight lasts 45 seconds or three hearts, whichever runs out
 * first, and brings home water, Starglass and bond. Rain Pearls buy Wyrm Gifts: more hearts, longer
 * flights, a cloud magnet and more. Three flights a day, from Rainwyrm Lv 5.
 * The desert, clouds and pickups are drawn on a 2D canvas; the wyrm itself is the 3D model in flight on
 * a transparent canvas above it (art3d.js), or a 2D drawing where WebGL is missing.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { $, clamp, fmt, icon, esc, today } = KH.u;
  const { UI, ACT } = KH;
  const CR = DATA.cloudRun;
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => {
    s.cloud = { day: -1, used: 0 };
    s.cloudGifts = { pearls: 0, lv: {} };
    s.stats.cloudRuns = 0; s.stats.cloudBest = 0; s.stats.clouds = 0; s.stats.pearls = 0; s.stats.rings = 0;
  });

  const unlocked = () => !!S && S.lv.wyrm >= CR.unlock;
  const left = () => (S.cloud.day === today() ? Math.max(0, CR.perDay - S.cloud.used) : CR.perDay);
  function spend() { if (S.cloud.day !== today()) S.cloud = { day: today(), used: 0 }; S.cloud.used++; }
  const gift = (id) => (S && S.cloudGifts.lv[id]) || 0;
  const heartsMax = () => CR.hearts + gift('scales');
  const flightSeconds = () => CR.seconds + 5 * gift('wind');
  function rewardsFor(clouds, drops) {
    const g = clouds ? KH.scaleReward({ water: clouds * CR.water * (1 + 0.1 * gift('song')) }) : {};
    if (drops) g.starglass = drops * CR.drop;
    return g;
  }
  function bankFlight(clouds, drops, pearls = 0) {
    const g = rewardsFor(clouds, drops);
    KH.grant(g);
    S.cloudGifts.pearls += pearls;
    S.stats.pearls += pearls;
    S.stats.cloudRuns++;
    S.stats.clouds += clouds;
    S.stats.cloudBest = Math.max(S.stats.cloudBest, clouds);
    if (KH.bondAdd) KH.bondAdd(Math.floor(clouds / CR.bondPer));
    KH.emit('cloudrun', { clouds, drops, pearls });
    KH.save();
    return g;
  }

  // ======================================================================
  // Wyrm Gifts: lasting upgrades for the flight, bought with Rain Pearls
  // ======================================================================
  const giftCost = (d) => d.cost[gift(d.id)];
  ACT.crgift = (id) => {
    const d = CR.gifts.find((x) => x.id === id);
    if (!d) return;
    const c = giftCost(d);
    if (c == null) return KH.toast(`${d.name} is already as strong as it gets.`, 'warn');
    if (S.cloudGifts.pearls < c) return KH.toast(`${d.name} needs ${c} Rain Pearls.`, 'warn');
    S.cloudGifts.pearls -= c;
    S.cloudGifts.lv[id] = gift(id) + 1;
    KH.sfx('complete');
    KH.toast(`${d.name} ${gift(id) > 1 ? `rises to ${gift(id)}` : 'is yours'}.`, 'good');
    KH.save();
    if (!host().hidden) ACT.crgifts();
  };
  ACT.crgifts = () => {
    const rows = CR.gifts.map((d) => {
      const lv = gift(d.id), c = giftCost(d), max = d.cost.length;
      return `<div class="cr-gift ${c == null ? 'done' : ''}">${icon(d.icon)}<div class="grow"><b>${esc(d.name)}</b> <span class="muted small">${lv}/${max}</span><div class="muted small">${esc(d.desc)}</div></div>
        ${c == null ? icon('i-check') : `<button class="btn small ${S.cloudGifts.pearls >= c ? 'gold' : 'off'}" data-act="crgift" data-arg="${d.id}">${icon('i-pearl')}${c}</button>`}</div>`;
    }).join('');
    card(`<h2>Wyrm Gifts</h2><p class="muted small">Rain Pearls turn up once in every full flight, and now and then by luck. You have ${icon('i-pearl')}<b>${S.cloudGifts.pearls}</b>.</p>
      <div class="cr-gifts">${rows}</div>
      <div class="row" style="justify-content:center;gap:8px"><button class="btn alt" data-act="cloudrun">Back</button></div>`);
  };

  // ======================================================================
  // The flight
  // ======================================================================
  const SEGS = 22, SP = 10; // body points trailing the head, and their spacing (px)
  let G = null; // the running flight
  function host() {
    let el = $('#cloudrun');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cloudrun';
      el.hidden = true;
      el.innerHTML = '<canvas class="cr-2d"></canvas><canvas class="cr-3d"></canvas><div class="cr-hud"></div><div class="cr-card"></div>';
      $('#battle').parentNode.appendChild(el);
      const cv = el.querySelector('.cr-2d');
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
      <p class="muted small">Drag to steer. Fly through clouds (storm clouds count ${gift('storm') ? 'four' : 'three'}) and thread the rain rings: every ring in a row makes each cloud worth more. Catch golden drops and Rain Pearls, and dodge the dust devils. ${flightSeconds()} seconds and ${heartsMax()} hearts a flight.</p>
      <div class="row" style="justify-content:center;gap:8px">${left() ? `<button class="btn gold" data-act="crgo">Fly! (${left()} left today)</button>` : '<span class="chip">No flights left today</span>'}<button class="btn alt" data-act="crclose">Not now</button></div>
      <button class="btn small alt cr-giftbtn" data-act="crgifts">${icon('i-pearl')}Wyrm Gifts · ${S.cloudGifts.pearls} pearl${S.cloudGifts.pearls === 1 ? '' : 's'}</button>`);
    drawIdle();
  };
  function card(html) { const c = host().querySelector('.cr-card'); c.innerHTML = html; c.hidden = !html; }
  ACT.crclose = () => { if (G) G.on = false; G = null; host().hidden = true; };
  ACT.crgo = () => {
    if (!left()) return;
    spend();
    card('');
    const cv = host().querySelector('.cr-2d'), r = cv.getBoundingClientRect(), dur = flightSeconds();
    G = {
      on: true, t: 0, dur, w: r.width, h: r.height, x: r.width / 2, tx: r.width / 2, hearts: heartsMax(), inv: 0,
      clouds: 0, drops: 0, pearls: 0, objs: [], dist: 0, spawn: 0, keys: {}, last: performance.now(), shake: 0, pops: [],
      combo: 0, comboT: 0, bestCombo: 0, rings: 0, ringAt: CR.ring.gap[0] * 0.6, shield: gift('storm') > 0, flash: 0,
      pearlAt: CR.pearl.at[0] + Math.random() * (CR.pearl.at[1] - CR.pearl.at[0]), pearlDone: false,
    };
    G.segs = Array.from({ length: SEGS }, () => G.x);
    requestAnimationFrame(loop);
  };
  function finish() {
    G.on = false;
    const clouds = Math.floor(G.clouds);
    const g = bankFlight(clouds, G.drops, G.pearls);
    S.stats.rings += G.rings;
    const best = S.stats.cloudBest === clouds && clouds > 0;
    card(`<h2>${G.hearts > 0 ? 'Home with the clouds!' : 'Back early'}</h2>
      <div class="cr-score"><b>${clouds}</b><span>clouds${best ? ' · new best' : ''}${G.bestCombo ? ` · best combo ×${(1 + CR.ring.step * G.bestCombo).toFixed(1)}` : ''}</span></div>
      ${Object.keys(g).length ? `<div class="costs" style="justify-content:center">${KH.rewardHTML(g)}${G.pearls ? `<span class="chip">${icon('i-pearl')}${G.pearls}</span>` : ''}</div>` : '<p class="muted">No clouds this time.</p>'}
      <p class="muted small">${left() ? `${left()} flight${left() > 1 ? 's' : ''} left today.` : 'That was the last flight today.'}</p>
      <div class="row" style="justify-content:center;gap:8px">${left() ? '<button class="btn gold" data-act="crgo">Fly again</button>' : ''}<button class="btn alt" data-act="crclose">Back to the keep</button></div>
      <button class="btn small alt cr-giftbtn" data-act="crgifts">${icon('i-pearl')}Wyrm Gifts · ${S.cloudGifts.pearls} pearl${S.cloudGifts.pearls === 1 ? '' : 's'}</button>`);
    KH.sfx('victory');
  }

  function spawn() {
    const k = clamp(G.t / G.dur, 0, 1), roll = Math.random(), x = 30 + Math.random() * (G.w - 60);
    const pDrop = 0.05 * (1 + 0.6 * gift('gold'));
    if (Math.random() < CR.pearl.chance) G.objs.push({ kind: 'pearl', x, y: -30, r: 14, ph: 0 });
    else if (roll < pDrop) G.objs.push({ kind: 'drop', x, y: -30, r: 13 });
    else if (roll < pDrop + 0.06) G.objs.push({ kind: 'storm', x, y: -40, r: 30 });
    else if (roll < pDrop + 0.06 + 0.14 + 0.26 * k) G.objs.push({ kind: 'devil', x, y: -40, r: 20, ph: Math.random() * 6, dx: (Math.random() - 0.5) * 60 });
    else G.objs.push({ kind: 'cloud', x, y: -30, r: 22 + Math.random() * 6 });
  }
  // pickup words rise just ahead of the head, stacked so two at once stay readable
  const pop = (x, y, txt, col) => {
    if (G.pops.length >= 3) G.pops.shift();
    const used = G.pops.filter((p) => p.t < 0.45).map((p) => p.slot);
    let slot = 0;
    while (used.includes(slot)) slot++;
    G.pops.push({ x: clamp(x, 60, G.w - 60), y: Math.min(y, G.h * 0.72 - 48) - slot * 24, slot, t: 0, txt, col });
  };
  function loop(now) {
    if (!G || !G.on) return;
    const dt = Math.min(0.05, (now - G.last) / 1000);
    G.last = now;
    G.t += dt;
    const k = clamp(G.t / G.dur, 0, 1), v = CR.speed[0] + (CR.speed[1] - CR.speed[0]) * k;
    if (G.keys.ArrowLeft) G.tx = clamp(G.tx - 420 * dt, 24, G.w - 24);
    if (G.keys.ArrowRight) G.tx = clamp(G.tx + 420 * dt, 24, G.w - 24);
    G.x += (G.tx - G.x) * Math.min(1, dt * 9);
    // each body point follows the one ahead of it, so the body stays whole at any frame rate
    for (let i = 0; i < G.segs.length; i++) { const ahead = i ? G.segs[i - 1] : G.x; G.segs[i] += (ahead - G.segs[i]) * Math.min(1, dt * 14); }
    G.dist += v * dt;
    G.spawn -= v * dt;
    if (G.spawn <= 0) { spawn(); G.spawn = 70 + Math.random() * 60; }
    // rain rings, and the pearl that waits in every long enough flight
    if (G.dist >= G.ringAt) {
      G.objs.push({ kind: 'ring', x: 50 + Math.random() * (G.w - 100), y: -40, r: 34 });
      G.ringAt = G.dist + CR.ring.gap[0] + Math.random() * (CR.ring.gap[1] - CR.ring.gap[0]);
    }
    if (!G.pearlDone && G.t >= G.pearlAt) { G.pearlDone = true; G.objs.push({ kind: 'pearl', x: 50 + Math.random() * (G.w - 100), y: -30, r: 14, ph: 0 }); }
    // the combo slips a step when no ring comes for a while
    if (G.combo > 0) { G.comboT -= dt; if (G.comboT <= 0) { G.combo--; G.comboT = CR.ring.hold; } }
    const hy = G.h * 0.72, pull = gift('call');
    for (const o of G.objs) {
      o.y += v * dt;
      if (o.kind === 'devil') { o.ph += dt * 6; o.x = clamp(o.x + o.dx * dt, 20, G.w - 20); }
      if (o.kind === 'pearl') o.ph += dt * 3;
      if (pull && !o.gone && o.kind !== 'devil' && o.kind !== 'ring' && o.y > hy - 240 && o.y < hy + 10) o.x += (G.x - o.x) * Math.min(1, dt * 0.9 * pull);
      if (o.gone) continue;
      const d = Math.hypot(o.x - G.x, o.y - hy);
      if (o.kind === 'ring') {
        if (d < o.r) {
          o.gone = true;
          G.combo = Math.min(CR.ring.max, G.combo + 1); G.comboT = CR.ring.hold; G.rings++;
          G.bestCombo = Math.max(G.bestCombo, G.combo);
          pop(o.x, o.y, `combo ×${(1 + CR.ring.step * G.combo).toFixed(1)}`, '#7ff0ff');
          KH.sfx('claim');
        }
        continue;
      }
      if (d < o.r + 16) {
        if (o.kind === 'devil') {
          if (G.inv > 0) continue;
          if (G.shield) { G.shield = false; G.inv = 1; G.flash = 0.4; pop(G.x, hy - 30, 'glanced off', '#ffe08a'); KH.sfx('tap'); continue; }
          G.hearts--; G.inv = 1.3; G.shake = 0.35; G.combo = 0; KH.sfx('hurt');
          if (navigator.vibrate) try { navigator.vibrate(60); } catch (e) { /* ignore */ }
        } else {
          o.gone = true;
          if (o.kind === 'drop') { G.drops++; pop(o.x, o.y, `+${CR.drop}◆`, '#ffd36e'); KH.sfx('coin'); } else if (o.kind === 'pearl') { G.pearls++; pop(o.x, o.y, '+1 pearl', '#e6f8ff'); KH.sfx('complete'); } else {
            const n = (o.kind === 'storm' ? (gift('storm') ? 4 : 3) : 1) * (1 + CR.ring.step * G.combo);
            G.clouds += n;
            pop(o.x, o.y, `+${Math.round(n * 10) / 10}`, '#ffffff');
            KH.sfx('tap');
          }
        }
      }
    }
    G.objs = G.objs.filter((o) => o.y < G.h + 60 && !(o.gone && o.kind !== 'devil'));
    G.inv -= dt; G.shake = Math.max(0, G.shake - dt); G.flash = Math.max(0, G.flash - dt);
    for (const p of G.pops) p.t += dt;
    G.pops = G.pops.filter((p) => p.t < 0.8);
    draw(now / 1000);
    if (G.hearts <= 0 || G.t >= G.dur) return finish();
    requestAnimationFrame(loop);
  }

  // ======================================================================
  // Drawing
  // ======================================================================
  function canvasCtx() {
    const cv = host().querySelector('.cr-2d'), r = cv.getBoundingClientRect(), DPR = Math.min(2, window.devicePixelRatio || 1);
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
  // where WebGL is missing: the Rainwyrm drawn in 2D from above, flying up the screen
  function wyrm(g, x, y, t, blink) {
    const sk = DATA.skins[S.skins.on] || DATA.skins.river, n = 16, sp = 9;
    g.save(); g.translate(x, y); g.scale(1.2, 1.2); g.translate(-x, -y);
    if (blink && Math.floor(t * 12) % 2) g.globalAlpha = 0.45;
    const pts = [[x, y]];
    for (let i = 1; i <= n; i++) pts.push([(G && G.segs ? G.segs[i - 1] : x) + Math.sin(t * 6 - i * 0.6) * 2, y + i * sp]);
    const rad = (i) => (i === 0 ? 10 : Math.max(1.8, 11.5 - i * 0.6));
    const dir = (i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
    const fin = (fx, fy, ang, len, spread, rays) => {
      g.fillStyle = sk.fin; g.globalAlpha *= 0.62;
      g.beginPath(); g.moveTo(fx, fy);
      for (let k = 0; k <= rays * 2; k++) {
        const f = k / (rays * 2), a = ang - spread / 2 + f * spread, r = len * (k % 2 ? 0.78 : 1);
        g.lineTo(fx + Math.cos(a) * r, fy + Math.sin(a) * r);
      }
      g.closePath(); g.fill();
      g.globalAlpha /= 0.62;
      g.strokeStyle = 'rgba(255,255,255,.65)'; g.lineWidth = 1;
      for (let k = 0; k <= rays; k++) { const a = ang - spread / 2 + (k / rays) * spread; g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx + Math.cos(a) * len, fy + Math.sin(a) * len); g.stroke(); }
    };
    const outline = (k) => {
      const L = [], R = [];
      for (let i = 0; i <= n; i++) { const [dx, dy] = dir(i), r = rad(i) * k, [px, py] = pts[i]; L.push([px - dy * r, py + dx * r]); R.push([px + dy * r, py - dx * r]); }
      g.beginPath(); g.moveTo(L[0][0], L[0][1]);
      for (const q of L) g.lineTo(q[0], q[1]);
      for (const q of R.reverse()) g.lineTo(q[0], q[1]);
      g.closePath();
    };
    // tail fan and shoulder fins under the body
    const [tx, ty] = pts[n], [tdx, tdy] = dir(n);
    fin(tx, ty, Math.atan2(tdy, tdx), 16, 1.6, 5);
    const flap = Math.sin(t * 8) * 0.35, [sx, sy] = pts[3], [sdx, sdy] = dir(3), sa = Math.atan2(sdy, sdx);
    fin(sx - sdy * 8, sy + sdx * 8, sa + Math.PI / 2 + 0.5 + flap, 18, 1.1, 4);
    fin(sx + sdy * 8, sy - sdx * 8, sa - Math.PI / 2 - 0.5 - flap, 18, 1.1, 4);
    // body: bright flanks, a dark stripe down the spine, scale dots, the back fin
    g.fillStyle = sk.body[1]; outline(1); g.fill();
    g.fillStyle = sk.body[0]; outline(0.48); g.fill();
    g.fillStyle = 'rgba(255,255,255,.18)';
    for (let i = 1; i < n; i += 2) { const [px, py] = pts[i], r = rad(i) * 0.7; g.beginPath(); g.arc(px - r, py, 1.4, 0, Math.PI * 2); g.arc(px + r, py, 1.4, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = sk.fin; g.lineWidth = 2.2; g.globalAlpha *= 0.85;
    g.beginPath();
    for (let i = 1; i <= n - 1; i++) { const [px, py] = pts[i], [dx, dy] = dir(i), w = Math.sin(t * 7 - i * 0.9) * 2.5; g.lineTo(px - dy * w, py + dx * w); }
    g.stroke(); g.globalAlpha /= 0.85;
    // head: horns and ear frills behind it, barbels streaming back
    g.strokeStyle = sk.horn; g.lineWidth = 1.4;
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x + s * 4, y - 26); g.quadraticCurveTo(x + s * (20 + Math.sin(t * 5) * 3), y - 8, x + s * (24 + Math.sin(t * 4 + s) * 4), y + 30); g.stroke(); }
    for (const s of [-1, 1]) fin(x + s * 10, y + 2, Math.PI / 2 + s * 1.1, 15, 1.1, 4);
    g.fillStyle = sk.horn;
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(x + s * 4, y - 6); g.quadraticCurveTo(x + s * 13, y - 2, x + s * 15, y + 20); g.quadraticCurveTo(x + s * 9, y + 2, x + s * 2, y - 1); g.fill();
    }
    g.fillStyle = sk.body[1];
    g.beginPath(); g.ellipse(x, y - 3, 12, 13, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(x - 9, y - 8); g.quadraticCurveTo(x - 8, y - 26, x, y - 31); g.quadraticCurveTo(x + 8, y - 26, x + 9, y - 8); g.fill();
    g.fillStyle = sk.body[0];
    g.beginPath(); g.moveTo(x - 4, y + 6); g.quadraticCurveTo(x - 5, y - 16, x, y - 25); g.quadraticCurveTo(x + 5, y - 16, x + 4, y + 6); g.fill();
    for (const s of [-1, 1]) {
      g.fillStyle = '#1a0e07'; g.beginPath(); g.ellipse(x + s * 8.5, y - 9, 3.6, 4.2, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffb43a'; g.beginPath(); g.ellipse(x + s * 8.8, y - 9, 2.6, 3.2, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1a0e07'; g.fillRect(x + s * 8.8 - 0.6, y - 11.6, 1.2, 5.2);
    }
    g.restore();
    g.globalAlpha = 1;
  }
  function ring(g, o, t) {
    g.save();
    g.lineWidth = 7; g.strokeStyle = 'rgba(70,214,208,.35)';
    g.beginPath(); g.ellipse(o.x, o.y, o.r + 3, (o.r + 3) * 0.42, 0, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 4; g.strokeStyle = '#ffe08a';
    g.beginPath(); g.ellipse(o.x, o.y, o.r, o.r * 0.42, 0, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 1.5; g.strokeStyle = '#ffffff';
    g.beginPath(); g.ellipse(o.x, o.y - 1, o.r - 2, (o.r - 2) * 0.4, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
    for (let k = 0; k < 4; k++) { const a = t * 3 + (k * Math.PI) / 2; g.fillStyle = '#7ff0ff'; g.beginPath(); g.arc(o.x + Math.cos(a) * o.r, o.y + Math.sin(a) * o.r * 0.42, 2.2, 0, Math.PI * 2); g.fill(); }
    g.restore();
  }
  function pearl(g, o) {
    const gl = g.createRadialGradient(o.x, o.y, 2, o.x, o.y, o.r * 2.4);
    gl.addColorStop(0, 'rgba(220,250,255,.75)'); gl.addColorStop(1, 'rgba(120,220,255,0)');
    g.fillStyle = gl; g.beginPath(); g.arc(o.x, o.y, o.r * 2.4, 0, Math.PI * 2); g.fill();
    const b = g.createRadialGradient(o.x - o.r * 0.35, o.y - o.r * 0.35, 1, o.x, o.y, o.r);
    b.addColorStop(0, '#ffffff'); b.addColorStop(0.6, '#d8f2fb'); b.addColorStop(1, '#8fc6dc');
    g.fillStyle = b; g.beginPath(); g.arc(o.x, o.y + Math.sin(o.ph) * 2, o.r * 0.75, 0, Math.PI * 2); g.fill();
  }
  // the body's path on screen, head first: [x, y, height above the sand]
  function bodyPath(t, x, hy, segs) {
    const pts = [[x, hy, 34]];
    // a swimming wave that grows toward the tail
    segs.forEach((sx, i) => pts.push([sx + Math.sin(t * 5 - i * 0.45) * (1.5 + i * 0.42), hy + (i + 1) * SP, 30 - i * 0.5 + Math.sin(t * 5 - i * 0.7) * 5]));
    return pts;
  }
  function shadow(g, pts) {
    g.save();
    g.strokeStyle = 'rgba(90,50,20,.2)'; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const wd of [22, 13]) {
      g.lineWidth = wd;
      g.beginPath();
      pts.forEach(([x, y], i) => { if (i) g.lineTo(x + 10, y + 16); else g.moveTo(x + 10, y + 16); });
      g.stroke();
    }
    g.restore();
  }
  // the 3D wyrm in flight; false where WebGL is missing (the 2D drawing stands in)
  function wyrm3d(pts, t, blink) {
    const A = KH.A3, c3 = host().querySelector('.cr-3d');
    if (!A || !A.ok || !A.enabled() || !A.flyer || !A.flyer(c3)) { c3.hidden = true; return false; }
    c3.hidden = false;
    const r = c3.getBoundingClientRect(), stIdx = KH.stageIndex(S.lv.wyrm);
    c3.style.opacity = blink && Math.floor(t * 12) % 2 ? 0.45 : 1;
    return A.flyRender({ w: r.width, h: r.height, dpr: Math.min(2, window.devicePixelRatio || 1), pts, t, level: S.lv.wyrm, skin: S.skins.on, element: S.wyrm.element, scale: 29 + stIdx * 1.6 });
  }
  function draw(t) {
    const { g, w, h } = canvasCtx();
    g.save();
    if (G.shake > 0) g.translate((Math.random() - 0.5) * 10 * G.shake, (Math.random() - 0.5) * 10 * G.shake);
    ground(g, w, h, G.dist);
    const hy = h * 0.72, pts = bodyPath(t, G.x, hy, G.segs);
    shadow(g, pts);
    for (const o of G.objs) {
      if (o.gone && o.kind !== 'devil') continue;
      if (o.kind === 'cloud') puff(g, o.x, o.y, o.r, '#ffffff', 'rgba(120,150,180,.35)');
      else if (o.kind === 'ring') ring(g, o, t);
      else if (o.kind === 'pearl') pearl(g, o);
      else if (o.kind === 'storm') {
        puff(g, o.x, o.y, o.r, '#b8c4d4', 'rgba(60,70,90,.4)');
        if (Math.sin(t * 9 + o.x) > 0.7) { g.strokeStyle = '#fff4b8'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(o.x, o.y + 8); g.lineTo(o.x - 6, o.y + 22); g.lineTo(o.x + 3, o.y + 22); g.lineTo(o.x - 4, o.y + 38); g.stroke(); }
      } else if (o.kind === 'drop') {
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
    if (!wyrm3d(pts, t, G.inv > 0)) wyrm(g, G.x, hy, t, G.inv > 0);
    if (G.flash > 0) { g.fillStyle = `rgba(255,224,138,${G.flash})`; g.beginPath(); g.arc(G.x, hy, 40, 0, Math.PI * 2); g.fill(); }
    g.font = "800 20px 'Barlow Semi Condensed', sans-serif"; g.textAlign = 'center';
    for (const p of G.pops) { g.globalAlpha = 1 - p.t / 0.8; g.fillStyle = p.col || '#ffffff'; g.strokeStyle = 'rgba(40,20,6,.7)'; g.lineWidth = 3; g.strokeText(p.txt, p.x, p.y - p.t * 40); g.fillText(p.txt, p.x, p.y - p.t * 40); }
    g.globalAlpha = 1;
    g.restore();
    const hud = host().querySelector('.cr-hud'), hm = heartsMax();
    const combo = G.combo ? `<span class="cr-combo">×${(1 + CR.ring.step * G.combo).toFixed(1)}<i style="width:${(G.comboT / CR.ring.hold) * 100}%"></i></span>` : '';
    const txt = `<span class="cr-clouds">☁ ${Math.floor(G.clouds)}</span>${combo}<span class="cr-pearls">${G.pearls ? `${icon('i-pearl')}${G.pearls}` : ''}</span><span class="cr-hearts">${G.shield ? '<b class="cr-shield">◈</b>' : ''}${'♥'.repeat(Math.max(0, G.hearts))}<i>${'♥'.repeat(Math.max(0, hm - Math.max(0, G.hearts)))}</i></span><div class="cr-time"><i style="width:${(1 - G.t / G.dur) * 100}%"></i></div>`;
    if (hud._h !== txt) { hud.innerHTML = txt; hud._h = txt; }
  }
  function drawIdle() {
    const { g, w, h } = canvasCtx();
    ground(g, w, h, 0);
    const t = performance.now() / 1000, pts = bodyPath(t, w / 2, h * 0.72, Array.from({ length: SEGS }, () => w / 2));
    shadow(g, pts);
    if (!wyrm3d(pts, t, false)) {
      const saved = G;
      G = { segs: Array.from({ length: 16 }, () => w / 2) };
      wyrm(g, w / 2, h * 0.72, t, false);
      G = saved;
    }
    const hud = host().querySelector('.cr-hud'); hud.innerHTML = ''; hud._h = '';
  }

  // entry points: a side button and the Rainwyrm's sheet
  KH.side.push({ id: 'cloudrun', icon: 'i-storm', label: 'Cloud Run', act: 'cloudrun', show: () => unlocked(), dot: () => left() === CR.perDay || CR.gifts.some((d) => giftCost(d) != null && S.cloudGifts.pearls >= giftCost(d)), badge: () => `${left()}/${CR.perDay}` });
  const prevExtras = KH.wyrmExtras;
  KH.wyrmExtras = () => `${prevExtras ? prevExtras() : ''}${unlocked() ? `<button class="btn wide gold" data-act="cloudrun">${icon('i-storm')}Cloud Run · ${left()}/${CR.perDay} flights today</button>` : ''}`;

  // for tests and the balance bot: a flight flown well brings home its pearl too
  KH.cloudRun = {
    unlocked, left, gift, heartsMax, flightSeconds, state: () => G,
    pearls: () => S.cloudGifts.pearls,
    auto: (clouds = 32, drops = 1, pearls = 1) => { if (!unlocked() || !left()) return null; spend(); return bankFlight(clouds, drops, pearls); },
    // buy the cheapest gift there are pearls for
    buyCheapest: () => {
      const d = CR.gifts.filter((x) => giftCost(x) != null).sort((a, b) => giftCost(a) - giftCost(b))[0];
      if (d && S.cloudGifts.pearls >= giftCost(d)) { ACT.crgift(d.id); return d.id; }
      return null;
    },
  };
})();
