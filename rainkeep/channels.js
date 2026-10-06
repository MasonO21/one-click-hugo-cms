/*
 * Rainkeep: Channels, the water puzzle. Every tile is a stone channel piece; tap one to turn it.
 * Water runs from the spring through every piece that lines up, and the puzzle is solved when it
 * reaches every hut, palm and field with nothing spilling. Puzzles are built from their number
 * (a random spanning tree, then every piece turned at random), so Channel 12 is the same for
 * everyone. A campaign opens a few puzzles per Rainwyrm level; a daily puzzle pays extra; stars
 * fill star chests; dowsing hints set one piece right. Played in a sheet on a canvas.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { clamp, fmt, icon, esc, seeded, today } = KH.u;
  const { UI, ACT } = KH;
  const C = DATA.channels;
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => {
    s.chan = { stars: {}, chests: [], daily: -1, dailyStars: 0, cur: null, mode: 'camp', pick: 1, hints: { day: -1, used: 0 } };
    s.stats.channels = 0; s.stats.chanClears = 0; s.stats.chanStars = 0;
  });

  // ======================================================================
  // Puzzles
  // ======================================================================
  // openings: 1 up, 2 right, 4 down, 8 left; a tap turns a piece a quarter clockwise
  const DIRS = [[1, 0, -1], [2, 1, 0], [4, 0, 1], [8, -1, 0]];
  const rot = (m) => ((m << 1) | (m >> 3)) & 15;
  const opp = (d) => rot(rot(d));
  const bits = (m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);
  function turnsTo(from, to) { let m = from; for (let k = 0; k < 4; k++) { if (m === to) return k; m = rot(m); } return 0; }
  const unlocked = () => !!S && S.lv.wyrm >= C.unlock;
  const openCount = () => (unlocked() ? C.base + C.perLevel * (S.lv.wyrm - C.unlock) : 0);
  const sizeOf = (n) => { let s = C.sizes[0]; for (const z of C.sizes) if (n >= z[0]) s = z; return { cols: s[1], rows: s[2], rocks: s[3] }; };

  function build(seed, cols, rows, rocks, mix = 1) {
    const r = seeded(seed), N = cols * rows;
    const sol = new Array(N).fill(0), rock = new Array(N).fill(false), inT = new Array(N).fill(false);
    const nb = (i, d) => {
      const [, dx, dy] = DIRS.find((q) => q[0] === d);
      const x = (i % cols) + dx, y = Math.floor(i / cols) + dy;
      return x < 0 || y < 0 || x >= cols || y >= rows ? -1 : y * cols + x;
    };
    const src = Math.floor(rows / 2) * cols + Math.floor(cols / 2);
    for (let i = 0; i < N; i++) if (i !== src && r() < rocks) rock[i] = true;
    // randomized Prim from the spring, shy of four-way crossings
    inT[src] = true;
    const edges = [];
    const grow = (i) => { for (const [d] of DIRS) { const j = nb(i, d); if (j >= 0 && !rock[j] && !inT[j]) edges.push([i, d, j]); } };
    grow(src);
    while (edges.length) {
      const k = Math.floor(r() * edges.length), [i, d, j] = edges[k];
      edges[k] = edges[edges.length - 1]; edges.pop();
      if (inT[j]) continue;
      if (bits(sol[i]) >= 3 && r() < 0.85) continue;
      inT[j] = true; sol[i] |= d; sol[j] |= opp(d);
      grow(j);
    }
    for (let i = 0; i < N; i++) if (!inT[i]) rock[i] = true;
    // the first puzzles turn only some of the pieces
    const start = sol.map((m, i) => { let x = m; const k = rock[i] ? 0 : Math.floor(r() * 4), go = r() < mix; for (let q = 0; go && q < k; q++) x = rot(x); return x; });
    // never hand out a puzzle that is already solved
    if (flow({ cols, rows, src, rock, cur: start }).won) { const i = start.findIndex((m, q) => !rock[q] && bits(m) && m !== 15 && rot(m) !== m); if (i >= 0) start[i] = rot(start[i]); }
    const par = start.reduce((a, m, i) => a + (rock[i] ? 0 : turnsTo(m, sol[i])), 0);
    // what each dead end waters: a hut, a palm or a field
    const kind = sol.map((m, i) => (i === src || rock[i] || bits(m) !== 1 ? '' : ['hut', 'palm', 'field'][Math.floor(r() * 3)]));
    return { cols, rows, src, sol, rock, start, par, kind, nb };
  }
  // follow the water from the spring: which pieces are wet, where it spills, is it solved
  function flow(p) {
    const { cols, rows, src, rock, cur } = p, N = cols * rows;
    const wet = new Array(N).fill(-1), leaks = [];
    const nbr = (i, dx, dy) => { const x = (i % cols) + dx, y = Math.floor(i / cols) + dy; return x < 0 || y < 0 || x >= cols || y >= rows ? -1 : y * cols + x; };
    wet[src] = 0;
    const q = [src];
    while (q.length) {
      const i = q.shift();
      for (const [d, dx, dy] of DIRS) {
        if (!(cur[i] & d)) continue;
        const j = nbr(i, dx, dy);
        if (j < 0 || rock[j] || !(cur[j] & opp(d))) { leaks.push([i, d]); continue; }
        if (wet[j] < 0) { wet[j] = wet[i] + 1; q.push(j); }
      }
    }
    let need = 0, got = 0;
    for (let i = 0; i < N; i++) if (!rock[i]) { need++; if (wet[i] >= 0) got++; }
    return { wet, leaks, won: got === need && !leaks.length, got, need };
  }
  function puzzle(key) {
    if (key === 'daily') {
      const [cols, rows, rocks] = C.daily.size;
      return { key, daily: true, day: today(), ...build(7919 * today() + 17, cols, rows, rocks) };
    }
    const n = Number(key), z = sizeOf(n);
    return { key: String(n), n, ...build(n * 2654435761 % 4294967296 + 99, z.cols, z.rows, z.rocks, Math.min(1, 0.3 + n * 0.1)) };
  }

  // ======================================================================
  // Play state (saved, so a half-turned puzzle waits for you)
  // ======================================================================
  let P = null; // the open puzzle: generated data plus the saved turns
  const anim = {};
  function load(key) {
    const base = puzzle(key);
    let c = S.chan.cur && S.chan.cur.key === key ? S.chan.cur : null;
    if (c && key === 'daily' && c.day !== today()) c = null;
    P = { ...base, cur: c ? c.cur.slice() : base.start.slice(), moves: c ? c.moves : 0, fixed: c ? c.fixed.slice() : [], done: c && c.done ? c.done : null };
    S.chan.cur = { key, day: today(), cur: P.cur, moves: P.moves, fixed: P.fixed, done: P.done };
    P.f = flow(P);
    for (const k in anim) delete anim[k];
    return P;
  }
  const keyNow = () => (S.chan.mode === 'daily' ? 'daily' : String(clamp(S.chan.pick, 1, Math.max(1, openCount()))));
  function ensure() {
    const key = keyNow();
    if (!P || P.key !== key || (P.daily && P.day !== today())) load(key);
    return P;
  }
  const save = () => { if (P) Object.assign(S.chan.cur, { cur: P.cur, moves: P.moves, fixed: P.fixed, done: P.done }); };
  const hintsLeft = () => (S.chan.hints.day === today() ? Math.max(0, C.hintsPerDay - S.chan.hints.used) : C.hintsPerDay);
  const nextChest = () => C.starChests.findIndex((c, i) => !S.chan.chests.includes(i));
  const totalStars = () => Object.values(S.chan.stars).reduce((a, b) => a + b, 0);
  function syncStats() {
    S.stats.chanClears = Object.keys(S.chan.stars).length;
    S.stats.chanStars = totalStars();
  }
  function starsFor(p) {
    if (p.fixed.length) return Math.min(2, p.moves <= p.par + 2 ? 2 : 1);
    if (p.moves <= p.par) return 3;
    return p.moves <= p.par + Math.max(3, Math.ceil(p.par * 0.5)) ? 2 : 1;
  }
  function solved() {
    const st = starsFor(P);
    const out = { stars: st, at: performance.now(), reward: null };
    if (P.daily) {
      if (S.chan.daily !== today()) { S.chan.daily = today(); S.chan.dailyStars = st; out.reward = KH.scaleReward(C.daily.reward); KH.grant(out.reward); }
    } else {
      const prev = S.chan.stars[P.n] || 0;
      if (!prev) { out.reward = KH.scaleReward(C.reward(P.n)); KH.grant(out.reward); }
      if (st > prev) S.chan.stars[P.n] = st;
      out.best = Math.max(st, prev);
    }
    S.stats.channels++;
    syncStats();
    P.done = out;
    save();
    KH.emit('channel', { n: P.n || 0, stars: st, daily: !!P.daily });
    KH.sfx('claim');
    KH.save();
    KH.renderAll(true);
  }
  function tap(i) {
    if (!P || P.done || P.rock[i]) return;
    if (P.fixed.includes(i)) return KH.toast('Dowsed into place. That piece is already right.', '', 'dowsed', 2);
    if (P.cur[i] === 15) return;
    P.cur[i] = rot(P.cur[i]);
    P.moves++;
    anim[i] = performance.now();
    P.f = flow(P);
    KH.sfx('tap');
    save();
    if (P.f.won) setTimeout(() => { if (P && P.f.won && !P.done) solved(); }, 260);
  }

  // ======================================================================
  // Actions
  // ======================================================================
  ACT.channels = () => {
    if (!unlocked()) return KH.toast(`The channels open at Rainwyrm Lv ${C.unlock}.`, 'warn');
    if (!S.chan.pick || S.chan.pick > openCount()) S.chan.pick = firstOpen();
    UI.sheet = { kind: 'channels' };
  };
  const firstOpen = () => { for (let n = 1; n <= openCount(); n++) if (!S.chan.stars[n]) return n; return Math.max(1, openCount()); };
  ACT.chanmode = (m) => { S.chan.mode = m === 'daily' ? 'daily' : 'camp'; P = null; };
  ACT.chanpick = (d) => {
    const n = clamp(S.chan.pick + Number(d), 1, Math.max(1, openCount()));
    if (n === S.chan.pick && Number(d) > 0) return KH.toast(`Channel ${n + 1} opens at Rainwyrm Lv ${S.lv.wyrm + 1}.`, '', 'chanlock', 2);
    S.chan.pick = n; S.chan.mode = 'camp'; P = null;
  };
  ACT.channext = () => { S.chan.mode = 'camp'; S.chan.pick = firstOpen(); if (S.chan.stars[S.chan.pick] && S.chan.pick < openCount()) S.chan.pick++; P = null; };
  ACT.chanreset = () => {
    if (!P) return;
    P.cur = P.start.slice(); P.moves = 0; P.fixed = []; P.done = null;
    P.f = flow(P);
    save();
  };
  ACT.chanhint = () => {
    if (!P || P.done) return;
    if (!hintsLeft()) return KH.toast('No dowsing left today. The rod rests until tomorrow.', 'warn');
    const wrong = P.cur.map((m, i) => i).filter((i) => !P.rock[i] && !P.fixed.includes(i) && P.cur[i] !== P.sol[i]);
    // prefer a piece next to the water
    wrong.sort((a, b) => nearWet(a) - nearWet(b));
    const i = wrong[0];
    if (i == null) return KH.toast('Every piece already lies the right way.', '');
    if (S.chan.hints.day !== today()) S.chan.hints = { day: today(), used: 0 };
    S.chan.hints.used++;
    P.cur[i] = P.sol[i];
    P.fixed.push(i);
    anim[i] = performance.now();
    P.f = flow(P);
    save();
    KH.sfx('upgrade');
    if (P.f.won) setTimeout(() => { if (P && P.f.won && !P.done) solved(); }, 260);
  };
  function nearWet(i) {
    const x = i % P.cols, y = Math.floor(i / P.cols);
    let best = 99;
    P.f.wet.forEach((w, j) => { if (w >= 0) best = Math.min(best, Math.abs((j % P.cols) - x) + Math.abs(Math.floor(j / P.cols) - y)); });
    return best;
  }
  ACT.chanchest = (i) => {
    i = Number(i);
    const c = C.starChests[i];
    if (!c || S.chan.chests.includes(i) || totalStars() < c[0]) return;
    S.chan.chests.push(i);
    const g = KH.scaleReward(c[1]);
    KH.grant(g);
    KH.toast(`Star chest opened: ${c[0]} stars.`, 'good');
    KH.sfx('claim');
  };
  const chestReady = () => C.starChests.some((c, i) => !S.chan.chests.includes(i) && totalStars() >= c[0]);
  const dailyReady = () => unlocked() && S.chan.daily !== today();
  const newReady = () => unlocked() && openCount() > 0 && !S.chan.stars[openCount()] && Object.keys(S.chan.stars).length < openCount();

  KH.side.push({ id: 'channels', icon: 'i-channel', label: 'Channels', act: 'channels', show: () => unlocked(), dot: () => dailyReady() || chestReady(), badge: () => `★${totalStars()}` });
  KH.on('channel', () => { if (KH.duty) KH.duty('channel'); });
  KH.on('upgrade', (e) => {
    if (e.plot === 'wyrm' && !e.offline && e.to === C.unlock) KH.toast('The old channels below the spring can flow again. Tap Channels to guide the water.', 'good', 'chanopen', 5);
  });

  // ======================================================================
  // Sheet
  // ======================================================================
  KH.sheets.channels = () => {
    const p = ensure(), daily = !!p.daily;
    const tabs = `<div class="subtabs"><button class="${daily ? '' : 'on'}" data-act="chanmode" data-arg="camp">Campaign</button><button class="${daily ? 'on' : ''}" data-act="chanmode" data-arg="daily">Daily${dailyReady() ? '<i class="dot"></i>' : ''}</button></div>`;
    const starRow = (n) => [1, 2, 3].map((k) => `<span class="cs ${k <= n ? 'on' : ''}">★</span>`).join('');
    const head = daily
      ? `<div class="row chan-head"><div class="grow"><b>Today's channel</b><div class="muted small">${p.cols}×${p.rows} · par ${p.par}${S.chan.daily === today() ? ' · solved today' : ''}</div></div></div>`
      : `<div class="row chan-head"><button class="btn small alt" data-act="chanpick" data-arg="-1" aria-label="Previous channel">‹</button>
          <div class="grow" style="text-align:center"><b>Channel ${p.n}</b> <span class="chan-stars">${starRow(S.chan.stars[p.n] || 0)}</span><div class="muted small">${p.cols}×${p.rows} · par ${p.par} · ${openCount()} open</div></div>
          <button class="btn small alt" data-act="chanpick" data-arg="1" aria-label="Next channel">›</button></div>`;
    let foot;
    if (p.done) {
      const d = p.done;
      foot = `<div class="card chan-done stack"><div class="row"><span class="chan-stars big">${starRow(d.stars)}</span><b class="grow">${d.stars === 3 ? 'Perfect flow!' : d.stars === 2 ? 'The water runs.' : 'Solved.'}</b></div>
        ${d.reward ? `<div class="costs">${KH.rewardHTML(d.reward)}</div>` : `<div class="muted small">${daily ? 'Today\'s reward was already collected.' : 'First-clear reward already collected. Beat par for three stars.'}</div>`}
        <div class="row"><button class="btn alt small" data-act="chanreset">Play again</button><span class="grow"></span>${daily ? '' : '<button class="btn small" data-act="channext" data-primary>Next channel</button>'}</div></div>`;
    } else {
      const reward = daily ? (S.chan.daily === today() ? null : KH.scaleReward(C.daily.reward)) : (S.chan.stars[p.n] ? null : KH.scaleReward(C.reward(p.n)));
      foot = `<div class="row chan-tools"><span class="chip" id="chan-moves">Moves 0</span><span class="grow"></span>
          <button class="btn small alt" data-act="chanhint" ${hintsLeft() ? '' : 'disabled'}>Dowse (${hintsLeft()})</button><button class="btn small alt" data-act="chanreset">Start over</button></div>
        ${reward ? `<div class="row"><span class="muted small">${daily ? 'Daily reward' : 'First clear'}</span><div class="costs">${KH.rewardHTML(reward)}</div></div>` : ''}
        <p class="muted small">Tap a piece to turn it. Water must reach every hut, palm and field with nothing spilling. Solve in par moves or fewer for three stars; a dowsing hint sets one piece right but caps the puzzle at two stars.</p>`;
    }
    const chests = C.starChests.map((c, i) => {
      const got = S.chan.chests.includes(i), ready = !got && totalStars() >= c[0];
      return `<div class="chan-chest ${got ? 'got' : ready ? 'ready' : ''}">${ready ? `<button class="btn small gold" data-act="chanchest" data-arg="${i}">★${c[0]}</button>` : `<span class="chip small">${got ? '✓' : `★${c[0]}`}</span>`}</div>`;
    }).join('');
    return {
      title: 'Channels', lvl: `★ ${totalStars()}`,
      body: `${tabs}${head}<canvas class="chan-canvas" data-chan="1"></canvas>${foot}
        <div class="section-label">Star chests</div><div class="row wrap chan-chests">${chests}</div>`,
    };
  };

  // ======================================================================
  // Board: drawn every frame while the sheet is open
  // ======================================================================
  const COL = { slab: '#e2bd88', slabD: '#c99a62', edge: '#a87444', groove: '#7a5232', grooveD: '#5e3c22', water: '#3fc0d8', waterL: '#a8f0ff', rock: '#9a6640', rockL: '#b98258', sand: '#d6a868' };
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function drawTile(g, i, s, t, now) {
    const m = P.cur[i], wet = P.f.wet[i] >= 0, fixed = P.fixed.includes(i);
    const flood = P.done ? clamp((now - P.done.at) / 70 - P.f.wet[i], 0, 1) : 1;
    g.fillStyle = fixed ? '#f0d08a' : COL.slab; rr(g, -s / 2 + 2, -s / 2 + 2, s - 4, s - 4, s * 0.12); g.fill();
    g.strokeStyle = fixed ? '#e8a830' : COL.edge; g.lineWidth = fixed ? 2.5 : 1.4; g.stroke();
    g.fillStyle = 'rgba(255,240,210,.25)'; g.fillRect(-s / 2 + 5, -s / 2 + 4, s - 10, 3);
    const w = s * 0.3;
    // the carved groove, then the water in it
    for (const pass of [0, 1]) {
      if (pass && !wet) break;
      g.strokeStyle = pass ? COL.water : COL.groove;
      g.lineWidth = pass ? w * 0.62 : w;
      g.lineCap = 'round';
      for (const [d, dx, dy] of DIRS) if (m & d) { g.beginPath(); g.moveTo(0, 0); g.lineTo((dx * s) / 2, (dy * s) / 2); g.stroke(); }
      g.fillStyle = pass ? COL.water : COL.grooveD;
      g.beginPath(); g.arc(0, 0, pass ? w * 0.42 : w * 0.62, 0, Math.PI * 2); g.fill();
    }
    if (wet) {
      // shimmer along the water
      g.strokeStyle = `rgba(200,250,255,${0.35 + 0.25 * Math.sin(t * 4 + i)})`; g.lineWidth = 1.5;
      for (const [d, dx, dy] of DIRS) if (m & d) { const o = ((t * 0.6 + i * 0.13) % 1) * 0.5; g.beginPath(); g.moveTo(dx * s * o * 0.8 - dy * 2, dy * s * o * 0.8 + dx * 2); g.lineTo(dx * s * (o + 0.12) * 0.8 - dy * 2, dy * s * (o + 0.12) * 0.8 + dx * 2); g.stroke(); }
    }
    const kind = P.kind[i];
    if (i === P.src) {
      g.fillStyle = '#c9a070'; g.beginPath(); g.arc(0, 0, s * 0.3, 0, Math.PI * 2); g.fill();
      const gr = g.createRadialGradient(0, -s * 0.05, 1, 0, 0, s * 0.24);
      gr.addColorStop(0, COL.waterL); gr.addColorStop(1, COL.water);
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, s * 0.23, 0, Math.PI * 2); g.fill();
      g.strokeStyle = `rgba(255,255,255,${0.5 + 0.3 * Math.sin(t * 3)})`; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, s * 0.12 + 3 * Math.sin(t * 2) ** 2, 0, Math.PI * 2); g.stroke();
    } else if (kind) {
      const ok = wet && flood >= 1, bob = P.done && ok ? -Math.abs(Math.sin((now - P.done.at) / 160 + i)) * s * 0.06 : 0;
      g.save(); g.translate(0, bob);
      if (kind === 'hut') {
        g.fillStyle = ok ? '#e8c088' : '#b08860'; g.fillRect(-s * 0.17, -s * 0.06, s * 0.34, s * 0.22);
        g.fillStyle = ok ? '#c46a3a' : '#7a5a40'; g.beginPath(); g.moveTo(-s * 0.22, -s * 0.05); g.lineTo(0, -s * 0.24); g.lineTo(s * 0.22, -s * 0.05); g.closePath(); g.fill();
        g.fillStyle = ok ? '#ffcf6e' : '#4a3020'; g.fillRect(-s * 0.04, s * 0.04, s * 0.08, s * 0.12);
      } else if (kind === 'palm') {
        g.strokeStyle = '#7a5634'; g.lineWidth = s * 0.06; g.beginPath(); g.moveTo(0, s * 0.18); g.quadraticCurveTo(s * 0.04, 0, 0, -s * 0.12); g.stroke();
        g.fillStyle = ok ? '#4f9f36' : '#9a8a50';
        for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k - 2) * 0.62; g.beginPath(); g.ellipse(Math.cos(a) * s * 0.12, -s * 0.12 + Math.sin(a) * s * 0.08, s * 0.12, s * 0.04, a, 0, Math.PI * 2); g.fill(); }
      } else {
        g.fillStyle = ok ? '#5fa83e' : '#a08050'; rr(g, -s * 0.2, -s * 0.16, s * 0.4, s * 0.32, 3); g.fill();
        g.strokeStyle = ok ? '#3d7a28' : '#7a5a38'; g.lineWidth = 1.5;
        for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(k * s * 0.11, -s * 0.13); g.lineTo(k * s * 0.11, s * 0.13); g.stroke(); }
      }
      g.restore();
      if (P.done && ok) { g.fillStyle = `rgba(255,240,170,${0.6 * Math.max(0, Math.sin((now - P.done.at) / 200 + i))})`; g.beginPath(); g.arc(s * 0.2, -s * 0.22, 3, 0, Math.PI * 2); g.fill(); }
    }
  }
  function draw(cv, now) {
    if (!P) return;
    const t = now / 1000, W = cv.clientWidth || 340;
    const s = Math.floor(Math.min((W - 12) / P.cols, 64)), DPR = Math.min(2, window.devicePixelRatio || 1);
    const bw = s * P.cols, bh = s * P.rows;
    if (cv.width !== Math.round(W * DPR) || cv.height !== Math.round((bh + 12) * DPR)) {
      cv.width = Math.round(W * DPR); cv.height = Math.round((bh + 12) * DPR); cv.style.height = `${bh + 12}px`;
    }
    const g = cv.getContext('2d');
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.clearRect(0, 0, W, bh + 12);
    const ox = Math.floor((W - bw) / 2), oy = 6;
    cv._g = { ox, oy, s };
    // the sandy bed under the board
    g.fillStyle = COL.sand; rr(g, ox - 5, oy - 5, bw + 10, bh + 10, 10); g.fill();
    g.strokeStyle = '#a87444'; g.lineWidth = 2; g.stroke();
    for (let i = 0; i < P.cols * P.rows; i++) {
      const x = ox + (i % P.cols) * s + s / 2, y = oy + Math.floor(i / P.cols) * s + s / 2;
      g.save(); g.translate(x, y);
      if (P.rock[i]) {
        g.fillStyle = COL.rock; g.beginPath(); g.ellipse(0, s * 0.06, s * 0.36, s * 0.3, 0.3, 0, Math.PI * 2); g.fill();
        g.fillStyle = COL.rockL; g.beginPath(); g.ellipse(-s * 0.06, -s * 0.02, s * 0.2, s * 0.15, 0.3, 0, Math.PI * 2); g.fill();
      } else {
        const a0 = anim[i];
        if (a0) { const k = clamp((now - a0) / 140, 0, 1); if (k >= 1) delete anim[i]; else g.rotate(-(1 - k * (2 - k)) * Math.PI / 2); }
        drawTile(g, i, s, t, now);
      }
      g.restore();
    }
    // water spilling from open ends
    for (const [i, d] of P.f.leaks) {
      const [, dx, dy] = DIRS.find((q) => q[0] === d);
      const x = ox + (i % P.cols) * s + s / 2 + (dx * s) / 2, y = oy + Math.floor(i / P.cols) * s + s / 2 + (dy * s) / 2;
      for (let k = 0; k < 3; k++) {
        const ph = (t * 1.6 + k / 3 + i * 0.1) % 1;
        g.fillStyle = `rgba(120,220,245,${0.8 * (1 - ph)})`;
        g.beginPath(); g.arc(x + dx * ph * 7 + (k - 1) * 3 * dy, y + dy * ph * 7 + (k - 1) * 3 * dx, 2.6 * (1 - ph * 0.5), 0, Math.PI * 2); g.fill();
      }
    }
    const mv = document.getElementById('chan-moves');
    if (mv) { const txt = `Moves ${P.moves} · ${P.f.got}/${P.f.need} wet`; if (mv.textContent !== txt) mv.textContent = txt; }
  }
  function loop(now) {
    if (!UI.sheet || UI.sheet.kind !== 'channels') { running = false; return; }
    requestAnimationFrame(loop);
    const cv = document.querySelector('canvas[data-chan]');
    if (cv && P) draw(cv, now);
  }
  let running = false;
  KH.renderHooks.push(() => { if (UI.sheet && UI.sheet.kind === 'channels' && !running) { running = true; requestAnimationFrame(loop); } });
  document.addEventListener('pointerdown', (e) => {
    const cv = e.target;
    if (!cv || !cv.matches || !cv.matches('canvas[data-chan]') || !P || !cv._g) return;
    e.preventDefault();
    const r = cv.getBoundingClientRect(), { ox, oy, s } = cv._g;
    const x = Math.floor((e.clientX - r.left - ox) / s), y = Math.floor((e.clientY - r.top - oy) / s);
    if (x < 0 || y < 0 || x >= P.cols || y >= P.rows) return;
    tap(y * P.cols + x);
  });

  // for tests and the balance bot
  KH.channels = {
    open: openCount, unlocked, puzzle, flow, totalStars,
    // solve puzzle n (or 'daily') the way a player would, in about par moves
    autoSolve(key, stars = 3) {
      S.chan.mode = key === 'daily' ? 'daily' : 'camp';
      if (key !== 'daily') S.chan.pick = Number(key);
      load(String(key));
      if (P.done && key === 'daily') return false;
      P.cur = P.sol.slice(); P.moves = stars === 3 ? P.par : P.par + Math.max(3, Math.ceil(P.par * 0.5)) + (stars === 1 ? 5 : 0); P.f = flow(P);
      solved();
      return true;
    },
    state: () => P,
  };
})();
