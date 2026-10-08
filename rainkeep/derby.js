/*
 * Rainkeep: the Camel Derby. From Rainwyrm Lv 8 the keep keeps a racing camel, Saffron. Train her Speed, Stamina
 * and Spirit (one session at a time, food and keep time) and race her on the salt pan below the keep
 * against five rival camels in three cups (the Village Cup, the Oasis Stakes and the Desert Crown), each opening
 * when you win the one before and bringing a piece of tack the first time you win it. In a race you hold to urge:
 * an urged camel runs faster and holds its pace over the dunes but burns energy, and one that runs dry is spent for
 * a few seconds, so the riding is in when to spend it. The race is drawn on a 2D canvas in its own overlay (like
 * fishing), with the painted camel and course from artmap.js; step() holds the rules, which the live race, the
 * jockey's auto-ride, the tests and the balance bot all run.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { $, clamp, fmt, fmtTime, icon, esc } = KH.u;
  const { UI, ACT } = KH;
  const D = DATA.derby, R = D.rules, CUP = Object.fromEntries(D.cups.map((c) => [c.id, c])), STAT = Object.fromEntries(D.stats.map((s) => [s.id, s]));
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => {
    s.derby = { open: false, name: 'Saffron', camel: { spd: 1, sta: 1, spi: 1 }, train: null, entries: 0, acc: 0, wins: {}, tack: [], best: {}, last: null };
    s.stats.derbyRaces = 0; s.stats.derbyWins = 0; s.stats.derbyCrown = 0; s.stats.derbyTop = 1;
  });
  const unlocked = () => !!S && S.lv.wyrm >= D.unlock;
  const name = () => (S && S.derby.name) || 'Saffron';
  // Saffron in a race: her trained levels and her tack
  function mine() {
    const c = { ...S.derby.camel };
    for (const t of S.derby.tack) for (const [k, v] of Object.entries(D.tack[t].fx)) c[k] += v;
    return c;
  }
  const cupOpen = (i) => i === 0 || (S.derby.wins[D.cups[i - 1].id] || 0) > 0;
  const trainTime = (lv) => D.train.time + D.train.perLv * lv;
  const trainCost = (lv) => KH.scaleReward(Object.fromEntries(Object.entries(D.train.cost).map(([k, v]) => [k, v * (1 + D.train.growth * (lv - 1))])));

  // entries come back with keep time; a training session finishes
  KH.hooks.tick.push((dt, offline, log) => {
    if (!unlocked()) return;
    const X = S.derby;
    if (!X.open) {
      X.open = true; X.entries = D.entries.cap; X.acc = 0;
      KH.mail('The Camel Derby', `The camel men have marked out a course on the salt pan below the keep, and the stable has a racing camel for you: ${name()}, young and quick and very sure of herself. Train her at the stable, then race her for the Village Cup. Hold to urge her on, and let her breathe when she tires. A race entry comes every ${D.entries.every / 3600} hours.`);
    }
    if (X.entries < D.entries.cap) {
      X.acc += dt;
      while (X.acc >= D.entries.every && X.entries < D.entries.cap) { X.acc -= D.entries.every; X.entries++; }
      if (X.entries >= D.entries.cap) X.acc = 0;
    }
    if (X.train && S.time >= X.train.end) {
      const st = X.train.stat;
      X.camel[st] = Math.min(D.maxLv, X.camel[st] + 1);
      X.train = null;
      S.stats.derbyTop = Math.max(S.stats.derbyTop || 1, X.camel[st]);
      KH.emit('derbyTrain', { stat: st, lv: X.camel[st] });
      const what = `${name()} finished her training: ${STAT[st].name} Lv ${X.camel[st]}.`;
      if (log) (log.marches = log.marches || []).push(what);
      else KH.toast(what, 'good');
    }
  });

  ACT.derbytrain = (st) => {
    if (!unlocked() || !STAT[st]) return;
    const X = S.derby, lv = X.camel[st];
    if (X.train) return KH.toast(`${name()} is already training.`, 'warn');
    if (lv >= D.maxLv) return KH.toast(`${STAT[st].name} is as high as it goes.`, 'warn');
    const cost = trainCost(lv);
    if (!KH.canAfford(cost)) return KH.toast('Not enough food for the training.', 'warn');
    KH.pay(cost);
    X.train = { stat: st, start: S.time, end: S.time + trainTime(lv) };
    KH.sfx('build');
  };

  // ======================================================================
  // The race (pure rules: the live race, the jockey, tests and the bot)
  // ======================================================================
  const rnd = (a, b) => a + Math.random() * (b - a);
  const speedOf = (c) => R.base * (1 + R.perSpeed * c.spd) * (c.form || 1);
  const urgeOf = (c) => R.urge + R.perSpirit * c.spi;
  const groundAt = (x) => { for (const [a, b, k] of R.track) if (x >= a && x < b) return k; return 'flat'; };
  const runner = (st, o) => ({ ...st, ...o, x: 0, v: 0, e: 1, tired: 0, urging: false, done: 0 });
  function newRace(cupId) {
    const cup = CUP[cupId], L = () => Math.round(rnd(cup.lv[0], cup.lv[1]));
    const names = D.rivals.slice().sort(() => Math.random() - 0.5);
    const run = [runner({ ...mine(), form: rnd(...R.form) }, { you: true, name: name(), keep: 'Rainkeep', color: '#3fd0c0', ai: 'steady', kick: 0.7, hold: 0.45 })];
    ['steady', 'sprinter', 'closer', 'steady', 'closer'].forEach((ai, i) => run.push(runner({ spd: L(), sta: L(), spi: L(), form: rnd(...R.form) }, { name: names[i][0], keep: names[i][1], color: D.colors[i], ai, kick: rnd(0.6, 0.75), hold: rnd(0.35, 0.55) })));
    const lanes = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5);
    run.forEach((c, i) => { c.lane = lanes[i]; });
    return { cup: cupId, t: 0, run, over: false, count: 3, hold: false, auto: false, place: 0, ranking: [], paid: false };
  }
  // the riders: a steady rider urges over the dunes and from the turn for home; a sprinter goes whenever she
  // can; a closer saves everything for the end
  function think(c) {
    if (c.ai === 'sprinter') return c.e > 0.15 && (c.urging || c.e > 0.6);
    if (c.ai === 'closer') return c.x > R.length * c.kick ? c.e > 0.02 : groundAt(c.x) === 'dune' && c.e > 0.7;
    if (c.x > R.length * c.kick) return c.e > 0.05;
    return groundAt(c.x) === 'dune' ? c.e > c.hold : c.urging ? c.e > c.hold : c.e > 0.95;
  }
  function step(G, dt) {
    if (G.over) return;
    if (G.count > 0) { G.count -= dt; return; }
    G.t += dt;
    for (const c of G.run) {
      if (c.done) continue;
      c.urging = c.you && !G.auto ? G.hold : think(c);
      if (c.tired > 0) { c.tired -= dt; c.urging = false; }
      const g = groundAt(c.x), urg = c.urging && c.e > 0;
      let target = speedOf(c) * (urg ? urgeOf(c) : 1);
      target *= g === 'dune' ? (urg ? R.duneUrged : R.ground.dune) : R.ground[g];
      if (c.tired > 0) target = speedOf(c) * R.tired.pace;
      c.v += (target - c.v) * Math.min(1, R.accel * dt);
      if (urg) {
        c.e -= R.drain * (1 - R.perStamDrain * c.sta) * dt;
        if (c.e <= 0) { c.e = 0; c.tired = R.tired.secs; c.spent = (c.spent || 0) + 1; }
      } else if (c.tired <= 0) c.e = Math.min(1, c.e + R.regen * (1 + R.perStamRegen * c.sta) * dt);
      else c.e = Math.min(R.tired.back, c.e + 0.08 * dt);
      c.x += c.v * dt;
      if (c.x >= R.length) c.done = G.t - (c.x - R.length) / Math.max(1, c.v);
    }
    // your place is settled once you cross: no one still running can beat you
    const you = G.run[0];
    if (you.done && !G.place) G.place = 1 + G.run.filter((c) => !c.you && c.done && c.done < you.done).length;
    if (G.run.every((c) => c.done)) {
      G.over = true;
      G.ranking = G.run.map((c, i) => i).sort((a, b) => G.run[a].done - G.run[b].done);
      G.place = G.ranking.indexOf(0) + 1;
    }
  }
  // pay out a finished race
  function settle(G) {
    if (G.paid) return G.rewards;
    G.paid = true;
    const X = S.derby, cup = CUP[G.cup], r = cup.rewards[Math.min(G.place, cup.rewards.length) - 1], g = {};
    for (const [k, v] of Object.entries(r)) if (k in S.res || k === 'journals') g[k] = v;
    const out = KH.scaleReward(g);
    for (const [k, v] of Object.entries(r)) if (!(k in S.res) && k !== 'journals') out[k] = v;
    S.stats.derbyRaces++;
    X.best[G.cup] = Math.min(X.best[G.cup] || 9, G.place);
    if (G.place === 1) {
      S.stats.derbyWins++;
      if (G.cup === 'crown') S.stats.derbyCrown++;
      X.wins[G.cup] = (X.wins[G.cup] || 0) + 1;
      if (!X.tack.includes(cup.tack)) { X.tack.push(cup.tack); G.tack = cup.tack; }
    }
    KH.grant(out);
    X.last = { cup: G.cup, place: G.place, time: +G.run[0].done.toFixed(1), at: S.time };
    if (KH.duty) KH.duty('derby');
    KH.emit('derby', { cup: G.cup, place: G.place });
    G.rewards = out;
    KH.save();
    return out;
  }
  function start(cupId) {
    const i = D.cups.findIndex((c) => c.id === cupId);
    if (!unlocked() || i < 0 || !cupOpen(i) || S.derby.entries < 1) return null;
    S.derby.entries--;
    return newRace(cupId);
  }
  // the jockey rides the whole race (tests, the bot, and Auto in the live race)
  function auto(G, dt = 0.05) {
    G.auto = true; G.count = 0;
    for (let k = 0; k < 20000 && !G.over; k++) step(G, dt);
    return G;
  }
  function autoRace(cupId) {
    const G = start(cupId);
    if (!G) return null;
    auto(G); settle(G);
    return G;
  }

  // ======================================================================
  // The live race
  // ======================================================================
  let G = null, raf = 0;
  const imgs = {};
  const img = (k) => {
    if (imgs[k]) return imgs[k];
    const src = window.RK_ART && window.RK_ART.derby && window.RK_ART.derby[k];
    if (!src) return null;
    const im = new Image(); im.src = src; imgs[k] = im;
    return im;
  };
  function host() {
    let el = $('#derby');
    if (!el) {
      el = document.createElement('div');
      el.id = 'derby';
      el.hidden = true;
      el.innerHTML = '<canvas class="dy-cv"></canvas><div class="dy-hud"></div><div class="dy-tip"></div><div class="dy-bar"><i></i><b>Energy</b></div><button class="dy-auto" data-act="derbyauto">Auto</button><div class="fs-card dy-card" hidden></div><button class="icon-btn fs-x" data-act="derbyclose" aria-label="Close">✕</button>';
      $('#battle').parentNode.appendChild(el);
      const cv = el.querySelector('.dy-cv');
      const down = (e) => { if (e) e.preventDefault(); if (G && !G.over) { G.hold = true; if (G.auto) G.auto = false; } };
      const up = () => { if (G) G.hold = false; };
      cv.addEventListener('pointerdown', down);
      cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('pointerleave', up);
      window.addEventListener('keydown', (e) => { if (!G || el.hidden || e.key !== ' ') return; e.preventDefault(); down(); });
      window.addEventListener('keyup', (e) => { if (G && e.key === ' ') G.hold = false; });
    }
    return el;
  }
  const card = (html) => { const c = host().querySelector('.dy-card'); c.innerHTML = html; c.hidden = !html; };
  const entriesLine = () => `${S.derby.entries} race entr${S.derby.entries === 1 ? 'y' : 'ies'}${S.derby.entries < D.entries.cap ? ` · next in ${fmtTime(D.entries.every - S.derby.acc)}` : ''}`;
  ACT.derby = () => {
    if (!unlocked()) return KH.toast(`The Camel Derby opens at Rainwyrm Lv ${D.unlock}.`, 'warn');
    UI.sheet = { kind: 'derby' };
  };
  ACT.derbygo = (cupId) => {
    if (!unlocked()) return;
    const i = D.cups.findIndex((c) => c.id === cupId);
    if (i < 0) return;
    if (!cupOpen(i)) return KH.toast(`Win the ${D.cups[i - 1].name} first.`, 'warn');
    if (S.derby.entries < 1) return KH.toast(`No race entries left. The next comes in ${fmtTime(D.entries.every - S.derby.acc)}.`, 'warn');
    UI.sheet = null;
    G = start(cupId);
    const el = host();
    el.hidden = false;
    card('');
    UI.derbyCup = cupId;
    KH.sfx('raid');
    loopStart();
  };
  ACT.derbyauto = () => { if (G && !G.over) { G.auto = !G.auto; G.hold = false; } };
  ACT.derbyclose = () => {
    // leaving mid-race: the jockey rides it out
    if (G && !G.over) { auto(G); settle(G); KH.toast(`${name()} finished ${ord(G.place)} in the ${CUP[G.cup].name}.`, G.place === 1 ? 'good' : ''); }
    cancelAnimationFrame(raf); raf = 0; G = null; host().hidden = true;
    UI.sheet = { kind: 'derby' };
  };
  const ord = (n) => ['1st', '2nd', '3rd', '4th', '5th', '6th'][n - 1];
  function resultCard() {
    settle(G);
    const cup = CUP[G.cup], rows = G.ranking.map((i, k) => {
      const c = G.run[i];
      return `<div class="row cl-res ${c.you ? 'dy-you' : ''}"><b class="cl-place">${k + 1}</b><i class="cl-dot" style="background:${c.color}"></i><span class="grow">${esc(c.name)} <small class="muted">${esc(c.keep)}</small></span><b>${c.done.toFixed(1)}s</b></div>`;
    }).join('');
    const tk = G.tack ? D.tack[G.tack] : null;
    card(`<h2>${G.place === 1 ? `${esc(name())} wins the ${esc(cup.name)}!` : `${ord(G.place)} in the ${esc(cup.name)}`}</h2><div class="stack cl-ranks">${rows}</div>
      ${tk ? `<p class="small good">${icon(tk.icon)} New tack: ${esc(tk.name)} (${esc(tk.text)})</p>` : ''}
      ${G.run[0].spent ? `<p class="muted small">${esc(name())} ran dry ${G.run[0].spent === 1 ? 'once' : `${G.run[0].spent} times`}. Let her breathe on the flats and save her for the dunes and the home straight.</p>` : ''}
      <div class="costs">${KH.rewardHTML(G.rewards)}</div>
      <div class="row" style="justify-content:center;gap:8px">${S.derby.entries ? `<button class="btn gold" data-act="derbygo" data-arg="${G.cup}">Race again</button>` : '<span class="chip">No entries left</span>'}<button class="btn alt" data-act="derbyclose">Stable</button></div>
      <p class="muted small">${entriesLine()}</p>`);
    KH.sfx(G.place === 1 ? 'victory' : G.place <= 3 ? 'claim' : 'defeat');
  }
  function loopStart() {
    cancelAnimationFrame(raf);
    let last = performance.now(), shown = false;
    const frame = (now) => {
      if (!G || host().hidden) return;
      // fixed substeps, so a slow frame never changes the race
      let dt = Math.min(0.25, (now - last) / 1000); last = now;
      while (dt > 1e-4) { const h = Math.min(0.05, dt); step(G, h); dt -= h; }
      if (G.over && !shown) { shown = true; resultCard(); }
      draw(now / 1000);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }
  const GROUND = { dune: '#d9a05e', pan: '#f3ead6', flat: '#e6d2ac' };
  function draw(t) {
    const el = host(), cv = el.querySelector('.dy-cv'), r = cv.getBoundingClientRect(), DPR = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(r.width * DPR) || cv.height !== Math.round(r.height * DPR)) { cv.width = Math.round(r.width * DPR); cv.height = Math.round(r.height * DPR); }
    const c = cv.getContext('2d'), W = r.width, H = r.height, you = G.run[0];
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    const ppm = Math.max(W, 360) / 24; // pixels a metre at the middle lane
    const cam = you.x - (W * 0.36) / ppm;
    // the painted course behind, drifting slowly
    const bg = img('track'), top = H * 0.08, bh = H * 0.6;
    c.fillStyle = '#f0c79a'; c.fillRect(0, 0, W, H);
    if (bg && bg.complete && bg.naturalWidth) {
      // every other copy mirrored, so the painting runs on without a seam
      const bw = bh * (bg.naturalWidth / bg.naturalHeight), scroll = cam * ppm * 0.08, k0 = Math.floor(scroll / bw);
      for (let k = k0, x = k0 * bw - scroll; x < W; k++, x += bw) {
        if (k % 2 === 0) c.drawImage(bg, x, top, bw, bh);
        else { c.save(); c.translate(x + bw, top); c.scale(-1, 1); c.drawImage(bg, 0, 0, bw, bh); c.restore(); }
      }
    }
    // the course: six lanes on the salt pan, dunes and hard pan as they come
    const y0 = H * 0.5, y1 = H * 0.86, laneY = (l) => y0 + (y1 - y0) * ((l + 0.5) / 6), laneK = (l) => 0.78 + 0.1 * l;
    c.fillStyle = '#e6d2ac'; c.fillRect(0, y0 - 6, W, H - y0 + 6);
    const mx = (m) => (m - cam) * ppm;
    for (const [a, b, k] of R.track) {
      const xa = mx(a), xb = mx(b);
      if (xb < 0 || xa > W) continue;
      c.fillStyle = GROUND[k]; c.fillRect(xa, y0 - 6, xb - xa, y1 - y0 + 14);
      if (k === 'dune') { c.strokeStyle = '#c4884a'; c.lineWidth = 2; for (let y = y0 + 4; y < y1; y += 14) { c.beginPath(); for (let x = Math.max(0, xa); x < Math.min(W, xb); x += 8) c.lineTo(x, y + Math.sin((x + cam * ppm) * 0.05 + y) * 3); c.stroke(); } }
      if (k === 'pan') { c.strokeStyle = '#d8ccb4'; c.lineWidth = 1; for (let i = 0; i < 12; i++) { const px = xa + ((i * 97) % Math.max(1, xb - xa)), py = y0 + ((i * 53) % (y1 - y0)); c.beginPath(); c.moveTo(px, py); c.lineTo(px + 18, py + 6); c.lineTo(px + 30, py - 2); c.stroke(); } }
      // the name of the ground, at the start of each stretch
      if (xa > -40 && xa < W) { c.fillStyle = '#5a3a1acc'; c.font = '700 12px Barlow, sans-serif'; c.fillText(k === 'dune' ? 'DUNES' : k === 'pan' ? 'HARD PAN' : '', xa + 6, y0 + 12); }
    }
    c.strokeStyle = '#ffffff55'; c.lineWidth = 1;
    for (let l = 0; l <= 6; l++) { const y = y0 + (y1 - y0) * (l / 6); c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    // posts every 100 metres, and the finish
    c.font = '700 11px Barlow, sans-serif'; c.textAlign = 'center';
    for (let m = 100; m < R.length; m += 100) { const x = mx(m); if (x < -20 || x > W + 20) continue; c.fillStyle = '#7a5a34'; c.fillRect(x - 1.5, y0 - 26, 3, 26); c.fillStyle = '#5a3a1a'; c.fillText(`${R.length - m} m`, x, y0 - 30); }
    const fx = mx(R.length);
    if (fx > -30 && fx < W + 30) {
      for (let i = 0; i < 16; i++) { c.fillStyle = i % 2 ? '#222' : '#fff'; c.fillRect(fx - 3, y0 - 6 + i * ((y1 - y0 + 12) / 16), 6, (y1 - y0 + 12) / 16); }
      c.fillStyle = '#b5352a'; c.fillRect(fx - 2, y0 - 46, 4, 46); c.fillStyle = '#e0b04a'; c.fillRect(fx + 2, y0 - 46, 34, 16); c.fillStyle = '#2a1608'; c.fillText('FINISH', fx + 19, y0 - 34);
    }
    c.textAlign = 'left';
    // the camels, back lanes first
    const cam1 = img('camel');
    for (const k of G.run.slice().sort((a, b) => a.lane - b.lane)) {
      const x = mx(k.x), y = laneY(k.lane), s = laneK(k.lane), w = 4.4 * ppm * s, h = w * 0.5;
      if (x < -w || x > W + w) continue;
      const ph = k.x * 0.55, bob = Math.abs(Math.sin(ph)) * 4 * s, tilt = Math.sin(ph) * 0.03 * (k.tired > 0 ? 0.4 : 1);
      // dust behind an urged camel
      if (k.urging && k.e > 0 && !k.done) for (let i = 0; i < 4; i++) { c.fillStyle = `rgba(214,180,130,${0.35 - i * 0.07})`; c.beginPath(); c.arc(x - w * 0.55 - i * 9 - ((t * 60) % 9), y - 4 + Math.sin(t * 9 + i) * 3, 5 + i * 2.5, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = '#0003'; c.beginPath(); c.ellipse(x, y + 2, w * 0.38, 5 * s, 0, 0, Math.PI * 2); c.fill();
      c.save(); c.translate(x, y - bob); c.rotate(tilt);
      if (cam1 && cam1.complete && cam1.naturalWidth) c.drawImage(cam1, -w / 2, -h, w, h);
      else { c.fillStyle = '#c9a26a'; c.fillRect(-w / 2, -h * 0.7, w, h * 0.4); }
      // the rider's colours on the saddle cloth
      c.fillStyle = k.color; c.globalAlpha = k.you ? 0 : 0.75; c.beginPath(); c.ellipse(-w * 0.12, -h * 0.66, w * 0.1, h * 0.12, 0, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
      c.restore();
      if (k.tired > 0) { c.fillStyle = '#6ab8e8'; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(x + w * 0.3 + i * 6, y - h - 4 - ((t * 30 + i * 7) % 12), 2.2, 0, Math.PI * 2); c.fill(); } }
      if (k.you) { c.fillStyle = '#ffe3a0'; c.strokeStyle = '#2a1608'; c.lineWidth = 3; c.font = '800 13px Barlow, sans-serif'; c.textAlign = 'center'; c.strokeText(name(), x, y - h - 10); c.fillText(name(), x, y - h - 10); c.textAlign = 'left'; }
    }
    // everyone's progress along the top, so no rival is out of sight
    const px0 = 16, px1 = W - 60, py = top + 6;
    c.fillStyle = '#2a1f3ccc'; c.fillRect(px0 - 6, py - 8, px1 - px0 + 12, 16);
    for (const k of G.run) { const x = px0 + (px1 - px0) * clamp(k.x / R.length, 0, 1); c.fillStyle = k.color; c.beginPath(); c.arc(x, py, k.you ? 6 : 4.5, 0, Math.PI * 2); c.fill(); if (k.you) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke(); } }
    // the HUD: place, distance, energy, and what to do
    const order = G.run.map((k, i) => [k.done || -k.x, i]).sort((a, b) => (a[0] > 0 && b[0] > 0 ? a[0] - b[0] : a[0] > 0 ? -1 : b[0] > 0 ? 1 : a[0] - b[0]));
    const place = G.place || order.findIndex(([, i]) => i === 0) + 1;
    const hud = el.querySelector('.dy-hud'), html = `<span>${ord(place)}</span><span>${Math.max(0, Math.round(R.length - you.x))} m</span><span class="dy-cup">${esc(CUP[G.cup].name)}</span>`;
    if (hud._h !== html) { hud.innerHTML = html; hud._h = html; }
    const bar = el.querySelector('.dy-bar');
    bar.querySelector('i').style.width = `${Math.round(you.e * 100)}%`;
    bar.classList.toggle('low', you.e < 0.25); bar.classList.toggle('spent', you.tired > 0);
    el.querySelector('.dy-auto').classList.toggle('on', !!G.auto);
    const ahead = groundAt(you.x + 25), tip = el.querySelector('.dy-tip');
    const msg = G.count > 0 ? `${Math.ceil(G.count)}` : G.t < 1 ? 'Go!' : G.over || you.done ? '' : you.tired > 0 ? `${name()} is spent!` : G.auto ? 'The jockey is riding' : ahead === 'dune' && groundAt(you.x) !== 'dune' ? 'Dunes ahead: urge her over them' : G.t < 7 ? 'Hold to urge her on' : you.x > R.length * 0.7 ? 'The home straight!' : '';
    if (tip._m !== msg) { tip.textContent = msg; tip._m = msg; tip.classList.toggle('big', G.count > 0 || msg === 'Go!'); }
  }

  // ======================================================================
  // The stable
  // ======================================================================
  KH.sheets.derby = () => {
    const X = S.derby, my = mine();
    const statRows = D.stats.map((st) => {
      const lv = X.camel[st.id], bonus = my[st.id] - lv, max = lv >= D.maxLv, on = X.train && X.train.stat === st.id;
      const cost = max ? null : trainCost(lv);
      const right = on ? `<span class="chip dc-on">${icon('i-clock')}${fmtTime(X.train.end - S.time)}</span>`
        : max ? '<span class="chip muted">Top level</span>'
          : `<button class="btn small ${X.train || !KH.canAfford(cost) ? 'off' : 'gold'}" data-act="derbytrain" data-arg="${st.id}">Train</button>`;
      return `<div class="row dy-stat">${icon(st.icon, 'dy-ic')}<div class="grow"><b>${esc(st.name)} Lv ${lv}${bonus ? ` <small class="good">+${bonus}</small>` : ''}</b><div class="muted small">${esc(st.text)}${!max && !on ? ` · ${fmtTime(trainTime(lv))}` : ''}</div>
        <div class="bar xp"><i style="width:${(lv / D.maxLv) * 100}%"></i></div>${!max && !on ? `<div class="costs small">${KH.costHTML(cost)}</div>` : ''}</div>${right}</div>`;
    }).join('');
    const cups = D.cups.map((cup, i) => {
      const open = cupOpen(i), w = X.wins[cup.id] || 0, tk = D.tack[cup.tack];
      return `<div class="card stack dy-cupcard ${open ? '' : 'locked'}" style="--cc:${cup.color}"><div class="row">${icon('i-dy-cup', 'dy-ic')}<div class="grow"><b>${esc(cup.name)}</b><div class="muted small">Rival camels Lv ${cup.lv[0]} to ${cup.lv[1]}${w ? ` · won ${w} time${w === 1 ? '' : 's'}` : X.best[cup.id] ? ` · best ${ord(X.best[cup.id])}` : ''}</div></div>
        ${open ? `<button class="btn small ${X.entries ? 'gold' : 'off'}" data-act="derbygo" data-arg="${cup.id}">Race</button>` : `<span class="chip muted">${icon('i-lock')}Win the ${esc(D.cups[i - 1].name)}</span>`}</div>
        <div class="row small"><span class="muted">1st</span><div class="costs">${KH.rewardHTML(KH.scaleReward(Object.fromEntries(Object.entries(cup.rewards[0]).filter(([k]) => k in S.res || k === 'journals'))))}${KH.rewardHTML(Object.fromEntries(Object.entries(cup.rewards[0]).filter(([k]) => !(k in S.res) && k !== 'journals')))}</div></div>
        <div class="row small">${icon(tk.icon)}<span class="${X.tack.includes(cup.tack) ? 'good' : 'muted'}">${esc(tk.name)} (${esc(tk.text)})${X.tack.includes(cup.tack) ? '' : ': for the first win'}</span></div></div>`;
    }).join('');
    return {
      title: 'Camel Derby', lvl: `${X.entries}/${D.entries.cap}`,
      body: `${KH.art && KH.art.banner ? KH.art.banner('event', 'derby', 'Races on the salt pan below the keep, for a cup and a purse.') : ''}
        <p class="muted small">Five rival camels and ${esc(name())}, once down the salt pan and over two lines of dunes. Hold to urge her on: she runs faster and keeps her pace over the dunes, but it tires her, and if she runs dry she slows for a few seconds. Let her breathe on the flats, urge her over the dunes, and save something for the home straight.</p>
        <div class="card stack"><div class="row">${icon('i-derby', 'dy-ic dy-big')}<div class="grow"><b>${esc(name())}</b><div class="muted small">Your racing camel. One training at a time.</div></div></div>${statRows}</div>
        <div class="card row">${icon('i-dy-ribbon', 'dy-ic')}<div class="grow"><b>${entriesLine()}</b><div class="muted small">${fmt(S.stats.derbyRaces)} raced · ${fmt(S.stats.derbyWins)} won</div></div></div>
        <div class="stack">${cups}</div>`,
    };
  };
  KH.side.push({ id: 'derby', icon: 'i-derby', label: 'Derby', act: 'derby', show: unlocked, dot: () => S.derby.entries >= D.entries.cap || (!S.derby.train && D.stats.some((st) => S.derby.camel[st.id] < D.maxLv && KH.canAfford(trainCost(S.derby.camel[st.id])))), badge: () => `${S.derby.entries}` });
  KH.chips.push(() => {
    if (!S || !S.derby || !S.derby.train) return '';
    const tr = S.derby.train;
    return `<button class="qchip" data-act="derby">${icon(STAT[tr.stat].icon)}${esc(name())} · ${esc(STAT[tr.stat].name)} <time>${fmtTime(Math.max(0, tr.end - S.time))}</time></button>`;
  });

  KH.derby = { unlocked, mine, cupOpen, trainCost, trainTime, newRace, step, think, settle, start, auto, autoRace, groundAt, speedOf, live: () => G };
})();
