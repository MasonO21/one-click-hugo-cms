/*
 * Rainkeep: Spring Fishing. Since the rains came back the keep's spring has fish in it. Tap to cast, tap again
 * the moment the float dips (too soon and the fish scatter, too late and it is gone), then hold to reel and let
 * go when the fish runs: reeling against a run piles on tension, and too much snaps the line. Six kinds, from
 * Spring Minnows to the Rain Koi that only ever shows after rain, each with a size and a first-catch bonus, in
 * a catch book. Casts come back one an hour (six at most), and calling the rain brings fish to the surface.
 * The pond is drawn on a 2D canvas in its own overlay (like Cloud Run). The rules live in step(), which the
 * game loop and the auto-player (tests, balance bot) both run.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { $, clamp, fmt, icon, esc } = KH.u;
  const { UI, ACT } = KH;
  const F = DATA.fishing, RL = F.reel, KIND = Object.fromEntries(F.fish.map((f) => [f.id, f]));
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => {
    s.fishing = { open: false, casts: 0, acc: 0, book: {}, last: null };
    s.stats.fish = 0; s.stats.fishKinds = 0; s.stats.koi = 0;
  });

  const unlocked = () => !!S && S.lv.wyrm >= F.unlock;
  const raining = () => !!(KH.keep && KH.keep.raining && KH.keep.raining());
  const rand = (a, b) => a + Math.random() * (b - a);

  // casts come back with keep time, and with the rain
  KH.hooks.tick.push((dt) => {
    if (!unlocked() || !dt) return;
    const X = S.fishing;
    if (!X.open) {
      X.open = true; X.casts = F.casts.cap; X.acc = 0;
      KH.mail('Fish in the spring', 'Since the rains came back, the children swear there are fish in the spring. They are right. Cast from the stone rim, strike when the float dips, and reel gently: let the line go slack when a fish runs, or it will snap. A new cast every hour, and more after rain.');
      return;
    }
    if (X.casts >= F.casts.cap) { X.acc = 0; return; }
    X.acc += dt;
    while (X.acc >= F.casts.every && X.casts < F.casts.cap) { X.acc -= F.casts.every; X.casts++; }
    if (X.casts >= F.casts.cap) X.acc = 0;
  });
  KH.on('rain', () => { if (unlocked() && S.fishing.open) S.fishing.casts = Math.min(F.casts.cap + F.casts.rain, S.fishing.casts + F.casts.rain); });

  // ======================================================================
  // The rules
  // ======================================================================
  function pickFish() {
    const w = F.fish.map((f) => f.w * (f.id === 'koi' && raining() ? 4 : 1));
    let v = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < w.length; i++) { v -= w[i]; if (v < 0) return F.fish[i]; }
    return F.fish[0];
  }
  function newGame() { return { phase: 'idle', t: 0, p: 0, T: 0, run: 0, runNext: 0, runLeft: 0, left: 0, holding: false, fish: null, cm: 0, result: null, biteAt: 0, biteT: 0, banked: false, rewards: null, first: false }; }
  function cast(G) {
    if (S.fishing.casts < 1) return false;
    S.fishing.casts--;
    Object.assign(G, newGame(), { phase: 'wait', biteAt: rand(F.bite[0], F.bite[1]), fish: pickFish() });
    const f = G.fish; G.cm = Math.round(rand(f.cm[0], f.cm[1]));
    return true;
  }
  // a tap: cast, strike, or (too soon) scatter the fish
  function tap(G) {
    if (G.phase === 'idle' || G.phase === 'done') return cast(G);
    if (G.phase === 'wait') { G.phase = 'done'; G.result = 'spooked'; return true; }
    if (G.phase === 'bite') { Object.assign(G, { phase: 'reel', p: 18, T: 8, t: 0, run: 0, runNext: rand(RL.runEvery[0], RL.runEvery[1]), left: RL.time }); return true; }
    return false;
  }
  function step(G, dt) {
    G.t += dt;
    if (G.phase === 'wait' && G.t >= G.biteAt) { G.phase = 'bite'; G.biteT = 0; }
    else if (G.phase === 'bite') { G.biteT += dt; if (G.biteT > F.strike) { G.phase = 'done'; G.result = 'missed'; } }
    else if (G.phase === 'reel') {
      const pull = G.fish.pull;
      if (G.run) { G.runLeft -= dt; if (G.runLeft <= 0) { G.run = 0; G.runNext = rand(RL.runEvery[0], RL.runEvery[1]) / Math.sqrt(pull); } }
      else { G.runNext -= dt; if (G.runNext <= 0) { G.run = 1; G.runLeft = rand(RL.runFor[0], RL.runFor[1]) * Math.sqrt(pull); } }
      if (G.holding) {
        G.p += (RL.gain / Math.pow(pull, 0.6)) * (G.run ? 0.25 : 1) * dt;
        G.T += RL.up * pull * (G.run ? RL.runUp : 1) * dt;
      } else {
        G.p -= RL.slip * pull * (G.run ? 1.6 : 1) * dt;
        G.T -= RL.down * dt;
      }
      G.T = Math.max(0, G.T);
      G.left -= dt;
      if (G.T >= 100) { G.phase = 'done'; G.result = 'snapped'; }
      else if (G.p >= 100) { G.phase = 'done'; G.result = 'caught'; land(G); }
      else if (G.p <= 0 || G.left <= 0) { G.phase = 'done'; G.result = 'escaped'; }
    }
    if (G.phase === 'done' && !G.banked) { G.banked = true; KH.save(); }
  }
  function land(G) {
    const f = G.fish, X = S.fishing, b = X.book[f.id] || { n: 0, best: 0 }, first = !b.n;
    const m = first ? F.firstCatch : 1, g = {};
    for (const [k, v] of Object.entries(f.give || {})) g[k] = v * m;
    if (f.journals) g.journals = f.journals * m;
    const out = KH.scaleReward(g);
    for (const k of ['starglass', 'whetstone', 'beacons']) if (f[k]) out[k] = f[k] * m;
    KH.grant(out);
    b.n++; b.best = Math.max(b.best, G.cm);
    X.book[f.id] = b;
    S.stats.fish++; S.stats.fishKinds = Object.keys(X.book).length;
    if (f.id === 'koi') S.stats.koi++;
    X.last = { id: f.id, cm: G.cm, first, rewards: out };
    G.rewards = out; G.first = first;
    if (KH.duty) KH.duty('fish');
    KH.emit('fish', { id: f.id, cm: G.cm });
  }

  // ======================================================================
  // The pond
  // ======================================================================
  let G = null, raf = 0;
  function host() {
    let el = $('#fishing');
    if (!el) {
      el = document.createElement('div');
      el.id = 'fishing';
      el.hidden = true;
      el.innerHTML = '<canvas class="fs-cv"></canvas><div class="fs-hud"></div><div class="fs-tip"></div><div class="fs-card"></div><button class="icon-btn fs-x" data-act="fishclose" aria-label="Close">✕</button>';
      $('#battle').parentNode.appendChild(el);
      const cv = el.querySelector('.fs-cv');
      cv.addEventListener('pointerdown', (e) => { if (!G) return; e.preventDefault(); if (G.phase === 'reel') G.holding = true; else if (tap(G)) { if (G.phase === 'wait') KH.sfx('tap'); else if (G.phase === 'reel') KH.sfx('hit'); } });
      const up = () => { if (G) G.holding = false; };
      cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('pointerleave', up);
      window.addEventListener('keydown', (e) => { if (!G || el.hidden || e.key !== ' ') return; e.preventDefault(); if (G.phase === 'reel') G.holding = true; else if (!e.repeat) tap(G); });
      window.addEventListener('keyup', (e) => { if (G && e.key === ' ') G.holding = false; });
    }
    return el;
  }
  const card = (html) => { const c = host().querySelector('.fs-card'); c.innerHTML = html; c.hidden = !html; };
  const castsLine = () => `${S.fishing.casts} cast${S.fishing.casts === 1 ? '' : 's'}${S.fishing.casts < F.casts.cap ? ` · next in ${KH.u.fmtTime(F.casts.every - S.fishing.acc)}` : ''}`;
  ACT.fishing = () => {
    if (!unlocked()) return KH.toast(`The spring is still too low for fish. Grow your Rainwyrm to Lv ${F.unlock}.`, 'warn');
    UI.sheet = null;
    const el = host();
    el.hidden = false;
    G = newGame();
    card(`<h2>Spring Fishing</h2><p>Tap to cast. When the float dips, tap to strike. Then hold to reel, and let go while the fish runs, or the line snaps.</p>
      ${raining() ? '<p class="small good">It is raining: the Rain Koi are rising.</p>' : ''}
      <div class="row" style="justify-content:center;gap:8px">${S.fishing.casts ? '<button class="btn gold" data-act="fishgo">Cast</button>' : '<span class="chip">No casts left</span>'}<button class="btn alt" data-act="fishbook">Catch book</button></div>
      <p class="muted small">${castsLine()}</p>`);
    loopStart();
  };
  ACT.fishgo = () => { if (!G) return; card(''); if (!cast(G)) { ACT.fishing(); } else KH.sfx('tap'); };
  ACT.fishclose = () => { cancelAnimationFrame(raf); raf = 0; if (G && (G.phase === 'reel' || G.phase === 'bite')) { G.phase = 'done'; G.result = 'escaped'; } G = null; host().hidden = true; };
  ACT.fishbook = () => { ACT.fishclose(); UI.sheet = { kind: 'fishbook' }; };

  function resultCard() {
    const f = G.fish, r = G.result;
    if (r === 'caught') {
      card(`<div class="fs-catch">${icon(`i-fish-${f.id}`, 'fs-ic')}<h2>${esc(f.name)}</h2><div class="fs-cm">${G.cm} cm${S.fishing.book[f.id].best === G.cm && S.fishing.book[f.id].n > 1 ? ' · biggest yet' : ''}</div></div>
        ${G.first ? '<p class="small good">First of its kind: double reward.</p>' : ''}<p class="muted small">${esc(f.text)}</p><div class="costs">${KH.rewardHTML(G.rewards)}</div>
        <div class="row" style="justify-content:center;gap:8px">${S.fishing.casts ? '<button class="btn gold" data-act="fishgo">Cast again</button>' : '<span class="chip">No casts left</span>'}<button class="btn alt" data-act="fishbook">Catch book</button></div><p class="muted small">${castsLine()}</p>`);
      KH.sfx(f.id === 'koi' ? 'legendary' : 'claim');
    } else {
      const why = { spooked: 'Too soon! The fish scatter.', missed: 'Too slow. It took the bait and went.', snapped: 'Snap! The line could not take it.', escaped: 'It slipped the hook and was gone.' }[r];
      card(`<h2>${esc(why)}</h2>${r === 'snapped' ? `<p class="muted small">It felt like a ${esc(f.name)}. Let go while it runs.</p>` : ''}
        <div class="row" style="justify-content:center;gap:8px">${S.fishing.casts ? '<button class="btn gold" data-act="fishgo">Cast again</button>' : '<span class="chip">No casts left</span>'}<button class="btn alt" data-act="fishbook">Catch book</button></div><p class="muted small">${castsLine()}</p>`);
      KH.sfx('defeat');
    }
  }
  function loopStart() {
    cancelAnimationFrame(raf);
    let last = performance.now(), shown = false;
    const frame = (now) => {
      if (!G || host().hidden) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const before = G.phase;
      if (G.phase !== 'idle' && G.phase !== 'done') step(G, dt);
      if (G.phase === 'bite' && before !== 'bite') { KH.sfx('chime'); if (navigator.vibrate) try { navigator.vibrate(40); } catch (e) { /* ignore */ } }
      if (G.phase === 'done' && !shown) { shown = true; resultCard(); }
      if (G.phase !== 'done') shown = false;
      draw(now / 1000);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }

  // shadows that swim about the pond; one comes to the float before a bite
  const shadows = Array.from({ length: 4 }, (_, i) => ({ x: 0.2 + 0.2 * i, y: 0.3 + 0.12 * (i % 3), a: i * 1.7, s: 0.6 + (i % 2) * 0.4 }));
  function draw(t) {
    const el = host(), cv = el.querySelector('.fs-cv'), r = cv.getBoundingClientRect(), DPR = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(r.width * DPR) || cv.height !== Math.round(r.height * DPR)) { cv.width = Math.round(r.width * DPR); cv.height = Math.round(r.height * DPR); }
    const c = cv.getContext('2d'), W = r.width, H = r.height;
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    // the stone rim and the water
    c.fillStyle = '#d9b98a'; c.fillRect(0, 0, W, H);
    const rx = W * 0.47, ry = H * 0.36, cx = W / 2, cy = H * 0.44;
    c.fillStyle = '#b8955f'; c.beginPath(); c.ellipse(cx, cy + 6, rx + 18, ry + 18, 0, 0, Math.PI * 2); c.fill();
    const wg = c.createRadialGradient(cx, cy - ry * 0.3, 10, cx, cy, rx * 1.1);
    wg.addColorStop(0, raining() ? '#4fb8c8' : '#3fc8c0'); wg.addColorStop(0.6, '#1f8a96'); wg.addColorStop(1, '#0f4a5a');
    c.fillStyle = wg; c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.fill();
    c.save(); c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.clip();
    // glints and rings
    for (let i = 0; i < 9; i++) {
      const gx = cx + Math.sin(i * 7.3 + t * 0.3) * rx * 0.8, gy = cy + Math.cos(i * 3.1 + t * 0.21) * ry * 0.7;
      c.strokeStyle = `rgba(255,255,255,${0.12 + 0.1 * Math.sin(t * 2 + i)})`; c.lineWidth = 1.5;
      c.beginPath(); c.ellipse(gx, gy, 14 + 6 * Math.sin(t + i), 4, 0, 0, Math.PI * 2); c.stroke();
    }
    if (raining()) for (let i = 0; i < 18; i++) { const k = (t * 1.3 + i * 0.37) % 1, x = cx + Math.sin(i * 12.9) * rx * 0.9, y = cy + Math.cos(i * 4.7) * ry * 0.8; c.strokeStyle = `rgba(230,250,255,${0.5 * (1 - k)})`; c.beginPath(); c.ellipse(x, y, 4 + 18 * k, 1.5 + 6 * k, 0, 0, Math.PI * 2); c.stroke(); }
    // the float: drifts in the middle, comes in as you reel
    const fx = cx + Math.sin(t * 0.7) * 6, base = cy - ry * 0.15;
    const fy = G && G.phase === 'reel' ? base + (clamp(G.p, 0, 100) / 100) * (cy + ry * 0.75 - base) : base;
    // shadows
    for (const sh of shadows) {
      let x, y;
      if (G && G.fish && (G.phase === 'wait' || G.phase === 'bite') && sh === shadows[0]) {
        const k = G.phase === 'bite' ? 1 : clamp(G.t / G.biteAt, 0, 1);
        x = fx + (1 - k) * (sh.x - 0.5) * rx * 1.4 + 12; y = fy + (1 - k) * 40 + 10;
      } else if (G && G.phase === 'reel' && sh === shadows[0]) {
        x = fx + Math.sin(t * (G.run ? 14 : 5)) * (G.run ? 26 : 10); y = fy + 18 + (G.run ? 14 : 0);
      } else { sh.a += 0.004 * sh.s; x = cx + Math.cos(sh.a + t * 0.2 * sh.s) * rx * 0.6; y = cy + Math.sin(sh.a * 1.3 + t * 0.15) * ry * 0.55; }
      const size = sh === shadows[0] && G && G.fish ? 10 + G.fish.pull * 9 : 12 + sh.s * 6;
      c.fillStyle = 'rgba(8,30,40,.35)';
      c.save(); c.translate(x, y); c.rotate(Math.sin(t * 2 + sh.a) * 0.4);
      c.beginPath(); c.ellipse(0, 0, size, size * 0.42, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.moveTo(-size, 0); c.lineTo(-size * 1.5, -size * 0.35); c.lineTo(-size * 1.5, size * 0.35); c.fill();
      c.restore();
    }
    // splash when it bites
    if (G && G.phase === 'bite') for (let i = 0; i < 3; i++) { const k = ((t * 3 + i / 3) % 1); c.strokeStyle = `rgba(255,255,255,${0.8 * (1 - k)})`; c.lineWidth = 2; c.beginPath(); c.ellipse(fx, fy, 8 + 30 * k, 3 + 10 * k, 0, 0, Math.PI * 2); c.stroke(); }
    c.restore();
    // the line from the rod tip
    if (G && G.phase !== 'idle' && !(G.phase === 'done' && G.result !== 'caught')) {
      c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(W * 0.5, H); c.quadraticCurveTo(W * 0.5 + (G.phase === 'reel' ? Math.sin(t * 9) * (G.run ? 14 : 4) : 0), (fy + H) / 2, fx, fy); c.stroke();
    }
    // the float
    if (G && G.phase !== 'idle') {
      const dip = G.phase === 'bite' ? 5 + Math.sin(t * 30) * 2 : G.phase === 'reel' ? 3 : Math.sin(t * 3) * 1.5;
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(fx, fy + dip, 7, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#d0303a'; c.beginPath(); c.arc(fx, fy + dip, 7, Math.PI, Math.PI * 2); c.fill();
    }
    // the reel: tension on the left, progress round the float
    const hud = el.querySelector('.fs-hud'), tip = el.querySelector('.fs-tip');
    if (G && G.phase === 'reel') {
      const bx = 18, by = H * 0.2, bh = H * 0.45, T = clamp(G.T, 0, 100);
      c.fillStyle = 'rgba(20,12,30,.7)'; c.fillRect(bx, by, 16, bh);
      c.fillStyle = T > 75 ? '#e0503a' : T > 50 ? '#f0b040' : '#5fd08a'; c.fillRect(bx + 2, by + bh - (bh - 4) * T / 100 - 2, 12, (bh - 4) * T / 100);
      c.strokeStyle = '#ffcf6e'; c.lineWidth = 4; c.beginPath(); c.arc(fx, fy, 18, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * clamp(G.p, 0, 100)) / 100); c.stroke();
    }
    const msg = !G ? '' : G.phase === 'wait' ? 'Wait for it…' : G.phase === 'bite' ? 'Now! Tap!' : G.phase === 'reel' ? (G.run ? 'It runs! Let go!' : G.holding ? 'Reeling…' : 'Hold to reel') : G.phase === 'idle' ? '' : '';
    const hh = `<span class="fs-casts">${icon('i-fish')}${S.fishing.casts}</span>${G && G.phase === 'reel' ? `<span class="fs-time">${Math.ceil(G.left)}s</span>` : ''}`;
    if (hud._h !== hh) { hud.innerHTML = hh; hud._h = hh; }
    if (tip._m !== msg) { tip.textContent = msg; tip._m = msg; tip.className = `fs-tip${G && G.run ? ' run' : ''}${G && G.phase === 'bite' ? ' bite' : ''}`; }
  }

  // ======================================================================
  // The catch book
  // ======================================================================
  KH.sheets.fishbook = () => {
    const X = S.fishing;
    const rows = F.fish.map((f) => {
      const b = X.book[f.id];
      return `<div class="card row fb-row ${b ? '' : 'unknown'}">${icon(`i-fish-${f.id}`, 'fb-ic')}<div class="grow"><b>${b ? esc(f.name) : '???'}</b><div class="muted small">${b ? `${esc(f.text)}<br>${b.n} caught · biggest ${b.best} cm` : 'Not caught yet.'}</div></div></div>`;
    }).join('');
    return { title: 'Catch book', lvl: `${Object.keys(X.book).length}/${F.fish.length}`,
      body: `<p class="muted small">${S.stats.fish} fish caught. ${castsLine()}. The first of each kind pays double, and the Rain Koi rise after rain.</p><div class="stack">${rows}</div>
        <button class="btn wide gold" data-act="fishing">${icon('i-fish')}To the spring</button>` };
  };
  KH.side.push({ id: 'fishing', icon: 'i-fish', label: 'Fishing', act: 'fishing', show: unlocked, dot: () => S.fishing.casts >= F.casts.cap, badge: () => `${S.fishing.casts}` });

  // ======================================================================
  // Auto play, for tests and the balance bot: strikes after a short delay, reels unless the fish runs or the
  // tension is high. skill 0..1 slows its reactions.
  // ======================================================================
  function auto(skill = 1) {
    const g = newGame(), out = [];
    while (S.fishing.casts > 0) {
      cast(g);
      const react = 0.15 + (1 - skill) * 0.7;
      let guard = 0;
      while (g.phase !== 'done' && guard++ < 4000) {
        const dt = 1 / 30;
        if (g.phase === 'bite' && g.biteT >= react) tap(g);
        if (g.phase === 'reel') g.holding = !g.run && g.T < 70 - (1 - skill) * 30;
        step(g, dt);
      }
      out.push(g.result === 'caught' ? g.fish.id : g.result);
    }
    return out;
  }

  KH.fishing = { unlocked, auto, step, tap, cast, newGame, casts: () => (S ? S.fishing.casts : 0) };
})();
