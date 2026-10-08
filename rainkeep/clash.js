/*
 * Rainkeep: Wadi Clash. A short live battle in a dry canyon against two rival caravans. Each side has three
 * squads: yours are your squad heroes, each leading a third of the march (with its ranks, gear and formation);
 * the rivals' are sized to yours. Seven points stand in the wadi (towers, wells, the Rain Shrine and the Old
 * Cistern); holding one scores its value every second, and the first side to the goal, or the leader when time
 * runs out, wins. Squads that meet on a point fight at once by Lanchester's law, the losers limp home to heal,
 * and a point stays yours after your squad leaves until someone takes it. Tap a squad, then a point. A Clash
 * Banner comes every 8 hours of keep time (two at most). The rules live in step(), shared by the live canvas,
 * the auto-player for squads you hand over, and the balance bot.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { $, clamp, fmt, icon, esc, fmtTime } = KH.u;
  const { UI, ACT } = KH;
  const C = DATA.clash, P = C.points, MAPH = 1.5;
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => {
    s.clash = { open: false, banners: 0, acc: 0, best: 0, last: null };
    s.stats.clashes = 0; s.stats.clashWins = 0; s.stats.clashSweep = 0;
  });
  const unlocked = () => !!S && S.lv.wyrm >= C.unlock;
  const rand = (a, b) => a + Math.random() * (b - a);

  // banners come back with keep time
  KH.hooks.tick.push((dt) => {
    if (!unlocked() || !dt) return;
    const X = S.clash;
    if (!X.open) {
      X.open = true; X.banners = C.banners.cap; X.acc = 0;
      KH.mail('The Wadi Clash', 'Two rival caravans have staked their banners in the dry canyon south of the keep. Whoever holds its wells, towers, the Rain Shrine and the Old Cistern longest takes the water rights until the next moon. Send three squads in: tap a squad, then a point. Hold a point to score its value every second. A new Clash Banner comes every 8 hours.');
      return;
    }
    if (X.banners >= C.banners.cap) { X.acc = 0; return; }
    X.acc += dt;
    while (X.acc >= C.banners.every && X.banners < C.banners.cap) { X.acc -= C.banners.every; X.banners++; }
    if (X.banners >= C.banners.cap) X.acc = 0;
  });

  // ======================================================================
  // The rules
  // ======================================================================
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const camp = (side) => ({ x: C.camps[side][0], y: C.camps[side][1] });
  const might = (st) => KH.statPower(st);
  // your three squads: one squad hero each, with a third of the march
  function yourSquads() {
    const heroes = KH.squadHome(), m = KH.marchTroops(), n = 3;
    return Array.from({ length: n }, (_, i) => {
      const share = {};
      for (const k in m) share[k] = Math.floor(m[k] / n);
      const id = heroes[i], st = KH.teamStats(null, { troops: share, heroes: id ? [id] : [] });
      const lead = id ? DATA.heroes.find((h) => h.id === id) : null;
      return { name: lead ? lead.name.split(' ')[0] : `Squad ${i + 1}`, cls: lead ? lead.cls : Object.keys(share).sort((a, b) => share[b] - share[a])[0] || 'guard', hero: id || null, M: Math.max(1, might(st)) };
    });
  }
  function newGame(opts = {}) {
    const mine = yourSquads(), avg = mine.reduce((a, q) => a + q.M, 0) / mine.length;
    const names = C.rivals.slice().sort(() => Math.random() - 0.5);
    const sides = [0, 1, 2].map((s) => ({ name: s ? names[s - 1] : 'Your caravan', color: C.colors[s], score: 0, ai: s > 0 || !!opts.auto, think: rand(0.2, 1.2), str: s ? rand(...C.rivalStr[s - 1]) : 1 }));
    const squads = [];
    for (let s = 0; s < 3; s++) for (let i = 0; i < 3; i++) {
      const base = s ? { name: ['Vanguard', 'Riders', 'Spears'][i], cls: ['guard', 'lancer', 'bow'][(i + s) % 3], hero: null, M: avg * sides[s].str * rand(0.9, 1.1) } : mine[i];
      const c = camp(s);
      squads.push({ ...base, side: s, i, hp: 1, x: c.x + (i - 1) * 0.05, y: c.y, state: 'camp', to: -1, at: -1 });
    }
    return { t: 0, over: false, sides, squads, points: P.map((p) => ({ ...p, owner: -1, cap: -1, prog: 0 })), fx: [], log: [], sel: -1, place: 0, peak: 0, swept: false };
  }
  const targetOf = (G, q) => (q.to < 0 ? camp(q.side) : G.points[q.to]);
  // order a squad to a point (or home with -1); routed squads, and squads still healing in camp, can't go
  function order(G, q, to) {
    if (G.over || q.state === 'rout') return false;
    if (q.state === 'camp' && q.hp < C.ready) return false;
    if (to === q.at && q.state === 'hold') return false;
    q.to = to; q.state = 'march'; q.at = -1;
    return true;
  }
  function fight(G, p, groups) {
    // each side's strength on the point (holders fight harder), with a little luck
    const str = groups.map(([s, qs]) => [s, qs.reduce((a, q) => a + q.M * q.hp, 0) * (p.owner === s ? 1 + C.hold : 1) * rand(0.92, 1.08), qs]);
    str.sort((a, b) => b[1] - a[1]);
    const [ws, w, wq] = str[0], rest = str.slice(1).reduce((a, x) => a + x[1] * x[1], 0);
    const keep = Math.max(0.08, Math.sqrt(Math.max(0, w * w - rest)) / w);
    for (const q of wq) q.hp *= keep;
    for (const [, , qs] of str.slice(1)) for (const q of qs) { q.hp = Math.max(0.05, q.hp * 0.25); q.state = 'rout'; q.to = -1; q.at = -1; }
    if (p.cap !== ws) { p.cap = -1; p.prog = 0; }
    G.fx.push({ x: p.x, y: p.y, t: G.t, kind: 'fight' });
    G.log.unshift({ t: G.t, side: ws, text: `${G.sides[ws].name} won the fight at the ${p.name}` });
  }
  function step(G, dt) {
    if (G.over) return;
    G.t += dt;
    for (const q of G.squads) {
      if (q.state === 'march' || q.state === 'rout') {
        const tg = targetOf(G, q), d = dist(q, tg), v = C.speed * (q.state === 'rout' ? 0.7 : 1) * dt;
        if (d <= v) {
          q.x = tg.x; q.y = tg.y;
          if (q.to < 0) { q.state = 'camp'; q.at = -1; q.x += (q.i - 1) * 0.05; } else { q.state = 'hold'; q.at = q.to; }
        } else { q.x += ((tg.x - q.x) / d) * v; q.y += ((tg.y - q.y) / d) * v; }
      } else if (q.state === 'camp') q.hp = Math.min(1, q.hp + C.heal * dt);
    }
    G.points.forEach((p, pi) => {
      const here = new Map();
      for (const q of G.squads) if (q.state === 'hold' && q.at === pi) { if (!here.has(q.side)) here.set(q.side, []); here.get(q.side).push(q); }
      if (here.size > 1) return fight(G, p, [...here.entries()]);
      if (here.size === 1) {
        const [s] = here.keys();
        if (p.owner === s) { p.cap = -1; p.prog = 0; return; }
        if (p.cap !== s) { p.cap = s; p.prog = 0; }
        p.prog += dt;
        if (p.prog >= C.capture) {
          p.owner = s; p.cap = -1; p.prog = 0;
          G.fx.push({ x: p.x, y: p.y, t: G.t, kind: 'flag', side: s });
          G.log.unshift({ t: G.t, side: s, text: `${G.sides[s].name} took the ${p.name}` });
        }
      } else if (p.cap >= 0) { p.prog = Math.max(0, p.prog - dt); if (!p.prog) p.cap = -1; }
    });
    for (const p of G.points) if (p.owner >= 0) G.sides[p.owner].score += p.pts * dt;
    if (G.points.every((p) => p.owner === 0)) G.swept = true;
    for (let s = 0; s < 3; s++) {
      const sd = G.sides[s];
      if (!sd.ai) continue;
      sd.think -= dt;
      if (sd.think <= 0) { sd.think = rand(0.8, 1.6); think(G, s); }
    }
    if (G.fx.length > 30) G.fx.splice(0, G.fx.length - 30);
    if (G.log.length > 8) G.log.length = 8;
    if (G.t >= C.length || G.sides.some((x) => x.score >= C.goal)) end(G);
  }
  // a side's captains: send idle squads to the point worth most for the march, leave a guard on what you hold
  function think(G, s) {
    const mine = G.squads.filter((q) => q.side === s);
    const enemyAt = (pi) => G.squads.filter((q) => q.side !== s && ((q.state === 'hold' && q.at === pi) || (q.state === 'march' && q.to === pi && dist(q, G.points[pi]) < 0.25))).reduce((a, q) => a + q.M * q.hp, 0);
    const friendsTo = (pi, me) => mine.filter((q) => q !== me && (q.at === pi || (q.state === 'march' && q.to === pi)));
    // everyone goes after the leader: points held by the side in front are worth more to the others
    const lead = [0, 1, 2].reduce((a, b) => (G.sides[b].score > G.sides[a].score ? b : a), 0), ahead = G.sides[lead].score > 30;
    const value = (q, pi) => {
      const p = G.points[pi], own = p.owner === s, guards = friendsTo(pi, q), hunt = ahead && p.owner === lead && lead !== s ? C.hunt : 1;
      if (own && guards.length) return 0;
      const enemy = enemyAt(pi), ours = q.M * q.hp + guards.reduce((a, g) => a + g.M * g.hp, 0);
      if (enemy > ours * (p.owner === s ? 1.1 : 0.95)) return 0.04 * p.pts;
      return (p.pts * hunt * (own ? (enemy ? 1.4 : 0.3) : enemy ? 1.15 : 1) * rand(0.85, 1.15)) / (0.5 + dist(q, p));
    };
    for (const q of mine) {
      if (q.state === 'march' || q.state === 'rout') continue;
      if (q.state === 'camp' && q.hp < 0.75) continue;
      let best = -1, bv = 0;
      G.points.forEach((p, pi) => { if (pi !== q.at) { const v = value(q, pi); if (v > bv) { bv = v; best = pi; } } });
      if (best < 0) continue;
      if (q.state === 'hold') {
        // stay on a point you hold unless something is worth a good deal more (or the guard is badly hurt)
        const here = G.points[q.at], stay = (here.pts * (here.owner === s ? 1 : 1.6)) / 0.5;
        if (q.hp < 0.3) { order(G, q, -1); continue; }
        if (bv < stay * 1.35) continue;
      } else if (bv < 0.6) continue;
      order(G, q, best);
    }
  }
  function end(G) {
    G.over = true;
    const order3 = [0, 1, 2].sort((a, b) => G.sides[b].score - G.sides[a].score);
    G.place = order3.indexOf(0) + 1;
    G.ranking = order3;
  }
  // pay out a finished match
  function settle(G) {
    if (G.paid) return G.rewards;
    G.paid = true;
    const r = C.rewards[G.place - 1], g = {};
    for (const [k, v] of Object.entries(r)) if (k in S.res || k === 'journals') g[k] = v;
    const out = KH.scaleReward(g);
    for (const k of ['starglass', 'whetstone']) if (r[k]) out[k] = r[k];
    KH.grant(out);
    const X = S.clash, score = Math.round(G.sides[0].score);
    S.stats.clashes++;
    if (G.place === 1) S.stats.clashWins++;
    if (G.swept) S.stats.clashSweep = (S.stats.clashSweep || 0) + 1;
    X.best = Math.max(X.best || 0, score);
    X.last = { place: G.place, score, rivals: [1, 2].map((s) => ({ name: G.sides[s].name, score: Math.round(G.sides[s].score) })), rewards: out, at: S.time };
    if (KH.duty) KH.duty('clash');
    KH.emit('clash', { place: G.place, score });
    G.rewards = out;
    KH.save();
    return out;
  }
  function start(opts) {
    if (!unlocked() || S.clash.banners < 1) return null;
    S.clash.banners--;
    return newGame(opts);
  }
  // auto play, for squads you leave to their captains, tests and the balance bot
  function auto(G, dt = 0.25) {
    G.sides[0].ai = true;
    let guard = 0;
    while (!G.over && guard++ < 4000) step(G, dt);
    return G;
  }
  function autoMatch() {
    const G = start({ auto: true });
    if (!G) return null;
    auto(G);
    settle(G);
    return G;
  }

  // ======================================================================
  // The live wadi
  // ======================================================================
  let G = null, raf = 0, view = null;
  function host() {
    let el = $('#clash');
    if (!el) {
      el = document.createElement('div');
      el.id = 'clash';
      el.hidden = true;
      el.innerHTML = '<canvas class="cl-cv"></canvas><div class="cl-hud"></div><div class="cl-tip"></div><div class="cl-bar"></div><div class="fs-card cl-card"></div><button class="icon-btn fs-x" data-act="clashclose" aria-label="Close">✕</button>';
      $('#battle').parentNode.appendChild(el);
      const cv = el.querySelector('.cl-cv');
      cv.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (!G || G.over || !view) return;
        const r = cv.getBoundingClientRect(), mx = (e.clientX - r.left - view.ox) / view.k, my = (e.clientY - r.top - view.oy) / view.k;
        const hit = (o, rad) => Math.hypot(o.x - mx, o.y - my) < rad;
        // your own squad first, then a point, then your camp
        const own = G.squads.filter((q) => q.side === 0 && q.state !== 'rout').find((q) => hit(q, 0.06));
        if (own && (G.sel < 0 || G.squads[G.sel] !== own || own.state === 'camp')) { G.sel = G.squads.indexOf(own); KH.sfx('tap'); return; }
        const pi = G.points.findIndex((p) => hit(p, 0.08)), home = hit(camp(0), 0.09) ? -1 : null;
        const to = pi >= 0 ? pi : home;
        if (to === null) return;
        let q = G.sel >= 0 ? G.squads[G.sel] : null;
        if (!q || q.state === 'rout') {
          // nothing chosen: the nearest squad that can go
          const free = G.squads.filter((x) => x.side === 0 && x.state !== 'rout' && x.state !== 'march' && !(x.state === 'camp' && x.hp < C.ready));
          q = free.sort((a, b) => dist(a, to < 0 ? camp(0) : G.points[to]) - dist(b, to < 0 ? camp(0) : G.points[to]))[0];
        }
        if (q && order(G, q, to)) { G.sides[0].ai = false; KH.sfx('coin'); G.sel = -1; } else KH.sfx('error');
      });
    }
    return el;
  }
  const card = (html) => { const c = host().querySelector('.cl-card'); c.innerHTML = html; c.hidden = !html; };
  const bannersLine = () => `${S.clash.banners} Clash Banner${S.clash.banners === 1 ? '' : 's'}${S.clash.banners < C.banners.cap ? ` · next in ${fmtTime(C.banners.every - S.clash.acc)}` : ''}`;
  ACT.clash = () => {
    if (!unlocked()) return KH.toast(`The wadi opens at Rainwyrm Lv ${C.unlock}.`, 'warn');
    UI.sheet = { kind: 'clash' };
  };
  ACT.clashgo = () => {
    if (!unlocked()) return;
    if (S.clash.banners < 1) return KH.toast('No Clash Banners left. A new one comes every 8 hours.', 'warn');
    UI.sheet = null;
    G = start();
    const el = host();
    el.hidden = false;
    card('');
    KH.sfx('raid');
    loopStart();
  };
  // hand your squads to their captains (and back by giving an order)
  ACT.clashauto = () => { if (G && !G.over) { G.sides[0].ai = !G.sides[0].ai; G.sel = -1; } };
  ACT.clashsel = (i) => { if (!G || G.over) return; const q = G.squads[Number(i)]; if (q && q.side === 0) G.sel = G.sel === Number(i) ? -1 : Number(i); };
  ACT.clashclose = () => {
    // leaving mid-match: your captains fight it out
    if (G && !G.over) { auto(G); settle(G); KH.toast(`Your captains finished the clash: ${['1st', '2nd', '3rd'][G.place - 1]} place.`, G.place === 1 ? 'good' : ''); }
    cancelAnimationFrame(raf); raf = 0; G = null; host().hidden = true;
    UI.sheet = { kind: 'clash' };
  };
  function resultCard() {
    settle(G);
    const rows = G.ranking.map((s, i) => `<div class="row cl-res"><b class="cl-place">${i + 1}</b><i class="cl-dot" style="background:${G.sides[s].color}"></i><span class="grow">${esc(G.sides[s].name)}</span><b>${fmt(Math.round(G.sides[s].score))}</b></div>`).join('');
    card(`<h2>${G.place === 1 ? 'The wadi is yours' : G.place === 2 ? 'Second place' : 'Third place'}</h2><div class="stack cl-ranks">${rows}</div>
      ${G.swept ? '<p class="small good">You held all seven points at once.</p>' : ''}<div class="costs">${KH.rewardHTML(G.rewards)}</div>
      <div class="row" style="justify-content:center;gap:8px">${S.clash.banners ? '<button class="btn gold" data-act="clashgo">Clash again</button>' : '<span class="chip">No banners left</span>'}<button class="btn alt" data-act="clashclose">Leave</button></div>
      <p class="muted small">${bannersLine()}</p>`);
    KH.sfx(G.place === 1 ? 'victory' : 'claim');
  }
  function loopStart() {
    cancelAnimationFrame(raf);
    let last = performance.now(), shown = false;
    const frame = (now) => {
      if (!G || host().hidden) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const nfx = G.fx.length;
      step(G, dt);
      if (G.fx.length > nfx) { const f = G.fx[G.fx.length - 1]; KH.sfx(f.kind === 'fight' ? 'hit' : 'chime'); }
      if (G.over && !shown) { shown = true; resultCard(); }
      draw(now / 1000);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }
  function draw(t) {
    const el = host(), cv = el.querySelector('.cl-cv'), r = cv.getBoundingClientRect(), DPR = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(r.width * DPR) || cv.height !== Math.round(r.height * DPR)) { cv.width = Math.round(r.width * DPR); cv.height = Math.round(r.height * DPR); }
    const c = cv.getContext('2d'), W = r.width, H = r.height;
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    // fit the 1 x 1.5 map between the score bar and the squad bar
    const top = 92, bot = 132, k = Math.min((W - 24) / 1, (H - top - bot) / MAPH), ox = (W - k) / 2, oy = top + (H - top - bot - k * MAPH) / 2;
    view = { k, ox, oy };
    const X = (x) => ox + x * k, Y = (y) => oy + y * k;
    // the canyon: sand floor, rock walls, the dry riverbed winding down the middle
    c.fillStyle = '#7a4a2a'; c.fillRect(0, 0, W, H);
    const g = c.createLinearGradient(0, oy, 0, oy + k * MAPH);
    g.addColorStop(0, '#e2bf86'); g.addColorStop(1, '#d4a96a');
    c.fillStyle = g; c.beginPath(); if (c.roundRect) c.roundRect(X(-0.02), Y(-0.02), k * 1.04, k * (MAPH + 0.04), 18); else c.rect(X(-0.02), Y(-0.02), k * 1.04, k * (MAPH + 0.04)); c.fill();
    c.fillStyle = 'rgba(122,74,42,.55)';
    for (let i = 0; i < 9; i++) {
      const y = (i / 8) * MAPH, w = 0.035 + 0.025 * Math.sin(i * 2.3);
      c.beginPath(); c.ellipse(X(-0.01), Y(y), k * w, k * 0.09, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(X(1.01), Y(y + 0.08), k * (0.06 - w * 0.5), k * 0.1, 0, 0, Math.PI * 2); c.fill();
    }
    c.strokeStyle = 'rgba(160,110,60,.35)'; c.lineWidth = k * 0.07; c.lineCap = 'round';
    c.beginPath(); c.moveTo(X(0.5), Y(0)); c.bezierCurveTo(X(0.3), Y(0.4), X(0.72), Y(0.9), X(0.5), Y(MAPH)); c.stroke();
    for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(255,240,210,.18)'; c.beginPath(); c.ellipse(X((i * 0.137) % 1), Y((i * 0.291) % MAPH), k * 0.03, k * 0.006, 0.2, 0, Math.PI * 2); c.fill(); }
    // tracks from each camp to the points
    c.setLineDash([4, 6]); c.lineWidth = 1.2; c.strokeStyle = 'rgba(90,60,30,.35)';
    for (const cp of C.camps) for (const p of G.points) { c.beginPath(); c.moveTo(X(cp[0]), Y(cp[1])); c.lineTo(X(p.x), Y(p.y)); c.stroke(); }
    c.setLineDash([]);
    // camps: three tents in the side's colour
    C.camps.forEach(([cx, cy], s) => {
      c.fillStyle = 'rgba(60,35,15,.35)'; c.beginPath(); c.ellipse(X(cx), Y(cy) + 6, k * 0.1, k * 0.035, 0, 0, Math.PI * 2); c.fill();
      for (let i = -1; i <= 1; i++) {
        const tx = X(cx + i * 0.05), ty = Y(cy) - (i ? 0 : 4);
        c.fillStyle = G.sides[s].color; c.beginPath(); c.moveTo(tx - 9, ty + 6); c.lineTo(tx, ty - 10); c.lineTo(tx + 9, ty + 6); c.closePath(); c.fill();
        c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.moveTo(tx, ty - 10); c.lineTo(tx + 9, ty + 6); c.lineTo(tx + 2, ty + 6); c.closePath(); c.fill();
      }
    });
    // the points: a stone plate ringed in the holder's colour, its value, and the flag going up
    G.points.forEach((p) => {
      const x = X(p.x), y = Y(p.y), rad = 14 + p.pts * 3;
      c.fillStyle = 'rgba(60,35,15,.3)'; c.beginPath(); c.ellipse(x, y + 5, rad + 4, (rad + 4) * 0.45, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#c9a777'; c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill();
      c.lineWidth = 5; c.strokeStyle = p.owner >= 0 ? G.sides[p.owner].color : '#8a6a44'; c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.stroke();
      if (p.cap >= 0) { c.lineWidth = 4; c.strokeStyle = G.sides[p.cap].color; c.globalAlpha = 0.9; c.beginPath(); c.arc(x, y, rad + 6, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * p.prog) / C.capture); c.stroke(); c.globalAlpha = 1; }
      // a little building for each kind
      c.fillStyle = '#7a5434';
      if (p.id.startsWith('tower')) { c.fillRect(x - 5, y - 13, 10, 16); c.fillRect(x - 7, y - 15, 14, 4); }
      else if (p.id.startsWith('well')) { c.fillStyle = '#3f8fa8'; c.beginPath(); c.ellipse(x, y - 2, 8, 4, 0, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#7a5434'; c.lineWidth = 2.5; c.stroke(); c.beginPath(); c.moveTo(x - 8, y - 2); c.lineTo(x - 8, y - 14); c.lineTo(x + 8, y - 14); c.lineTo(x + 8, y - 2); c.stroke(); }
      else if (p.id === 'shrine') { c.beginPath(); c.moveTo(x - 10, y + 4); c.lineTo(x - 10, y - 8); c.arc(x, y - 8, 10, Math.PI, 0); c.lineTo(x + 10, y + 4); c.closePath(); c.fill(); c.fillStyle = '#3fd0c0'; c.beginPath(); c.arc(x, y - 6, 3.5, 0, Math.PI * 2); c.fill(); }
      else { c.fillStyle = '#2f7f96'; c.beginPath(); c.ellipse(x, y, 13, 7, 0, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#6a4a2c'; c.lineWidth = 3; c.stroke(); c.fillStyle = 'rgba(200,250,255,.5)'; c.beginPath(); c.ellipse(x - 3, y - 2, 4 + Math.sin(t * 2) * 1.5, 1.5, 0, 0, Math.PI * 2); c.fill(); }
      if (p.owner >= 0) { c.strokeStyle = '#4a3020'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x + rad - 4, y - 4); c.lineTo(x + rad - 4, y - rad - 10); c.stroke(); c.fillStyle = G.sides[p.owner].color; c.beginPath(); c.moveTo(x + rad - 4, y - rad - 10); c.lineTo(x + rad + 9 + Math.sin(t * 4) * 1.5, y - rad - 6); c.lineTo(x + rad - 4, y - rad - 2); c.closePath(); c.fill(); }
      c.font = '800 11px "Barlow Semi Condensed", sans-serif'; c.textAlign = 'center';
      c.fillStyle = 'rgba(30,18,10,.75)'; c.fillText(`${p.name} · +${p.pts}`, x, y + rad + 15);
    });
    // fights and flags going up
    for (const f of G.fx) {
      const a = G.t - f.t;
      if (a > 1.2) continue;
      if (f.kind === 'fight') for (let i = 0; i < 7; i++) { c.fillStyle = `rgba(240,220,180,${0.6 * (1 - a / 1.2)})`; c.beginPath(); c.arc(X(f.x) + Math.cos(i * 0.9) * a * 30, Y(f.y) + Math.sin(i * 0.9) * a * 18, 6 + a * 10, 0, Math.PI * 2); c.fill(); }
      else { c.strokeStyle = G.sides[f.side].color; c.globalAlpha = 1 - a / 1.2; c.lineWidth = 3; c.beginPath(); c.arc(X(f.x), Y(f.y), 20 + a * 30, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1; }
    }
    // squads: a shield in the side's colour with its class, strength round it; yours are named
    for (const q of G.squads) {
      const x = X(q.x) + (q.state === 'hold' ? (q.i - 1) * 9 : 0), y = Y(q.y) - (q.state === 'hold' ? 10 : 0), bob = q.state === 'march' || q.state === 'rout' ? Math.sin(t * 10 + q.i) * 1.5 : 0;
      if (q.state === 'march' || q.state === 'rout') { const tg = targetOf(G, q); c.strokeStyle = q.side ? 'rgba(80,40,30,.25)' : 'rgba(30,120,110,.5)'; c.lineWidth = 2; c.setLineDash([3, 4]); c.beginPath(); c.moveTo(X(q.x), Y(q.y)); c.lineTo(X(tg.x), Y(tg.y)); c.stroke(); c.setLineDash([]); }
      const sel = G.squads[G.sel] === q;
      if (sel) { c.strokeStyle = '#ffe08a'; c.lineWidth = 3; c.beginPath(); c.arc(x, y + bob, 15 + Math.sin(t * 6) * 1.5, 0, Math.PI * 2); c.stroke(); }
      c.globalAlpha = q.state === 'rout' ? 0.55 : 1;
      c.fillStyle = G.sides[q.side].color; c.strokeStyle = '#2a1608'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(x - 9, y - 9 + bob); c.lineTo(x + 9, y - 9 + bob); c.lineTo(x + 9, y + 2 + bob); c.quadraticCurveTo(x, y + 12 + bob, x - 9, y + 2 + bob); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#fff8e8'; c.font = '800 9px "Barlow Semi Condensed", sans-serif'; c.textAlign = 'center';
      c.fillText({ guard: 'S', bow: 'A', lancer: 'L' }[q.cls] || '•', x, y + 1 + bob);
      c.strokeStyle = q.hp > 0.6 ? '#5fd08a' : q.hp > 0.3 ? '#f0b040' : '#e0503a'; c.lineWidth = 2.5;
      c.beginPath(); c.arc(x, y - 2 + bob, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * q.hp); c.stroke();
      c.globalAlpha = 1;
    }
    // the score bar, the clock and your squads
    const hud = el.querySelector('.cl-hud'), bar = el.querySelector('.cl-bar'), tip = el.querySelector('.cl-tip');
    const left = Math.max(0, Math.ceil(C.length - G.t));
    const hh = `<div class="cl-clock">${icon('i-clock')}${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</div>${G.sides.map((sd) => `<div class="cl-score"><i style="background:${sd.color};width:${clamp((sd.score / C.goal) * 100, 0, 100)}%"></i><span>${esc(sd.name)}</span><b>${fmt(Math.floor(sd.score))}</b></div>`).join('')}`;
    if (hud._h !== hh) { hud.innerHTML = hh; hud._h = hh; }
    const bb = `${G.squads.filter((q) => q.side === 0).map((q) => {
      const n = G.squads.indexOf(q), st = q.state === 'rout' ? 'Routed' : q.state === 'camp' ? (q.hp < C.ready ? 'Healing' : 'In camp') : q.state === 'march' ? `To ${q.to < 0 ? 'camp' : G.points[q.to].name}` : G.points[q.at].name;
      return `<button class="cl-sq ${G.sel === n ? 'on' : ''} ${q.state}" data-act="clashsel" data-arg="${n}">${icon(DATA.classes[q.cls].icon)}<b>${esc(q.name)}</b><small>${esc(st)}</small><i style="width:${Math.round(q.hp * 100)}%"></i></button>`;
    }).join('')}<button class="cl-auto ${G.sides[0].ai ? 'on' : ''}" data-act="clashauto">Auto</button>`;
    if (bar._h !== bb) { bar.innerHTML = bb; bar._h = bb; }
    const msg = G.over ? '' : G.sides[0].ai ? 'Your captains are in command' : G.sel >= 0 ? 'Now tap a point to send them' : G.t < 6 ? 'Tap a squad, then a point' : '';
    if (tip._m !== msg) { tip.textContent = msg; tip._m = msg; }
  }

  // ======================================================================
  // The sheet
  // ======================================================================
  KH.sheets.clash = () => {
    const X = S.clash, L = X.last;
    const last = L ? `<div class="card stack"><div class="section-label">Last clash</div><div class="row"><b class="grow">${['1st', '2nd', '3rd'][L.place - 1]} place · ${fmt(L.score)}</b></div>
      <div class="muted small">${L.rivals.map((r) => `${esc(r.name)} ${fmt(r.score)}`).join(' · ')}</div></div>` : '';
    const pts = P.map((p) => `<span class="chip">${icon(p.icon)}${esc(p.name)} +${p.pts}</span>`).join('');
    return {
      title: 'Wadi Clash', lvl: `${X.banners}/${C.banners.cap}`,
      body: `${KH.art && KH.art.banner ? KH.art.banner('event', 'clash', 'Water rights to the dry canyon go to whoever holds its wells, towers, shrine and cistern longest.') : ''}<p class="muted small">Two rival caravans fight you for the dry canyon's water rights. Each side has three squads: yours are your squad heroes, each leading a third of your march. Tap a squad, then a point. Holding a point scores its value every second; the first to ${fmt(C.goal)}, or the leader after ${C.length / 60} minutes, wins. Squads that meet fight at once, the stronger winning, and a point stays yours until someone takes it.</p>
        <div class="row wrap cl-pts">${pts}</div>${last}
        <div class="card row">${icon('i-clashbanner', 'cl-ic')}<div class="grow"><b>${bannersLine()}</b><div class="muted small">${fmt(S.stats.clashes)} fought · ${fmt(S.stats.clashWins)} won · best ${fmt(X.best || 0)}</div></div></div>
        <button class="btn wide ${X.banners ? 'gold' : 'off'}" data-act="clashgo">${icon('i-clash')}Enter the wadi</button>`,
    };
  };
  KH.side.push({ id: 'clash', icon: 'i-clash', label: 'Wadi Clash', act: 'clash', show: unlocked, dot: () => S.clash.banners >= C.banners.cap, badge: () => `${S.clash.banners}` });

  KH.clash = { unlocked, newGame, step, order, think, auto, autoMatch, settle, start, banners: () => (S ? S.clash.banners : 0), live: () => G, view: () => view };
})();
