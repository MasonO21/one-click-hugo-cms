// Balance simulator: plays the real game code with a virtual clock as a free-to-play player.
//   node sim/f2p.js <archetype> [maxDays] [calibrationJSON]
// Archetypes describe how often and how long the simulated player checks in.
// Calibration mode: node sim/f2p.js regular_mobile 400 '{"police":8,"fire":7,"ems":12}'
//   plays with a zeroed promotion table and records the earnings at the target time of each rank
//   (used once to derive the REQ tables in game/src/01-data-state.js).
const { launch, build, url } = require('../lib');

const ARCH = {
  casual_mobile:    { sessions: 2, minutes: 10, mode: 'mobile' },
  regular_mobile:   { sessions: 4, minutes: 15, mode: 'mobile' },
  dedicated_mobile: { sessions: 8, minutes: 10, mode: 'mobile' },
  desktop_open:     { sessions: 6, minutes: 15, mode: 'open' },   // browser tab left open all day
  always_on:        { sessions: 1, minutes: 1440, mode: 'always' },
};

(async () => {
  const name = process.argv[2] || 'regular_mobile';
  const maxDays = +(process.argv[3] || 1500);
  const calib = process.argv[4] ? JSON.parse(process.argv[4]) : null;
  if (!ARCH[name]) { console.error('archetypes:', Object.keys(ARCH).join(', ')); process.exit(1); }
  if (!process.env.NO_BUILD) build();
  const browser = await launch();
  const page = await (await browser.newContext({ viewport: { width: 400, height: 820 } })).newPage();
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.goto(url());
  await page.waitForTimeout(400);
  const out = await page.evaluate(({ cfg, maxDays, calib }) => {
    // reproducible randomness
    let seed = 987654321;
    Math.random = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const N = window.__np; const S = N.S(); const D = N.D;
    let vt = new Date().getTime(); const RD = Date;
    window.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(vt); } static now() { return vt; } };
    S.sound = false; S.haptics = false; S.badges = 0; S.last = vt; S.t0 = vt;
    const stats = { bounties: 0, claims: 0, activeSec: 0, ops: 0, crates: 0, promos: 0 };
    window.__active = false;
    window.spawnFugitive = () => { if (window.__active && Math.random() < 0.7) { N.catchFugitive(); stats.bounties++; } };
    const cleared = {}, promoLog = [], order = ['police', 'fire', 'ems'];
    const t0 = vt, T = () => (vt - t0) / 1000, DAY = 86400;
    let lastPromoT = 0; const tables = { police: [], fire: [], ems: [] };
    if (calib) N.worlds().forEach(w => { w.req.table = w.req.table.map(() => 0); });
    const weights = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 7], wsum = weights.reduce((a, b) => a + b, 0);
    const targetDays = (w, r) => calib[w] * weights[r] / wsum;

    function spendBadges() {                       // cheapest permanent upgrade first
      const c = [], it = N.ITEMS;
      ['off1', 'off2', 'off3', 'slot1', 'slot2'].forEach(id => { const x = it[id]; if (!(x.once && x.once()) && (!x.need || x.need())) c.push({ p: x.price, f: () => N.buyItem(id) }); });
      N.AGENTS().forEach(a => { if (!S.agents[a.id]) c.push({ p: a.price, f: () => N.buyAgent(a.id) }); });
      c.sort((a, b) => a.p - b.p);
      if (c.length && S.badges >= c[0].p) { c[0].f(); return true; } return false;
    }
    function buyLoop() {                           // greedy best cost-per-income purchase
      const G = N.GENS(), g = N.W().g; let guard = 0;
      while (guard++ < 300) {
        let best = null, br = Infinity;
        for (let i = 0; i < G.length; i++) { const c = G[i].cost * Math.pow(g, S.owned[i]); if (!(S.owned[i] > 0 || S.run >= G[i].cost * 0.4 || i === 0)) continue; const rr = c / D.unit[i]; if (rr < br) { br = rr; best = { t: 'g', i, c }; } }
        for (const u of N.availUps()) {
          let gain = 0;
          if (u.kind === 'gen') gain = D.gen[u.gen]; else if (u.kind === 'glob') gain = D.ips * u.p / (1 + u.p);
          else if (u.kind === 'tap' || u.kind === 'pct') { if (u.cost < S.funds * 0.05) N.buyUp(u.id); continue; } else continue;
          if (gain <= 0) continue; const rr = u.cost / gain; if (rr < br) { br = rr; best = { t: 'u', id: u.id, c: u.cost }; }
        }
        if (!best || best.c > S.funds) break;
        if (best.t === 'g') { S.amt = 1; N.buyGen(best.i); } else N.buyUp(best.id);
      }
    }
    function housekeeping() {
      ['std', 'elite', 'legend'].forEach(k => { while (S.crates[k] > 0) { N.openCrate(k); stats.crates++; } });
      if (!N.dailyState().claimed) N.claimDaily();
      for (let t = 1; t <= N.passLevel(); t++) N.claimPass(t, false, true);
      for (let i = 0; i < 5; i++) if (S.ops[i] && N.opLeft(i) <= 0) { N.claimOp(i); stats.ops++; }
      while (spendBadges()) { }
    }
    function startOps() { const slots = N.opSlots(); for (let k = 0; k < slots; k++) if (!S.ops[k]) N.startOp('king'); }
    function tryPromote() {
      const w = N.W().id; let did = false;
      if (calib) {
        const need = targetDays(w, Math.min(S.promos, 10)) * DAY;
        if (T() - lastPromoT >= need && N.canPromote()) {
          const req = S.run; const r = N.promote(); if (!r) return false;
          tables[w].push(req); stats.promos++; lastPromoT = T(); did = true; promoLog.push({ w, rank: S.promos, day: +(T() / DAY).toFixed(2) });
          if (r.cleared) { cleared[w] = T() / DAY; const idx = order.indexOf(w); if (idx < 2) { N.travel(order[idx + 1]); lastPromoT = T(); } else cleared.done = true; }
        }
        return did;
      }
      while (N.canPromote()) {
        const r = N.promote(); if (!r) break; stats.promos++; did = true; promoLog.push({ w, rank: S.promos, day: +(T() / DAY).toFixed(2) });
        if (r.cleared) { cleared[w] = T() / DAY; const idx = order.indexOf(w); if (idx < 2) N.travel(order[idx + 1]); else cleared.done = true; break; }
      }
      return did;
    }
    function runSession(minutes) {
      window.__active = true; S.last = vt; housekeeping(); startOps();
      const steps = Math.round(minutes * 60 / 5);
      for (let s = 0; s < steps; s++) {
        vt += 5000; N.tickGame(); stats.activeSec += 5;
        if (N.rallyReady()) { N.claimRally(); stats.claims++; }        // free Rally Boost (15 min x2, every 3 h)
        if (N.supplyReady()) { N.claimSupply(); stats.claims++; }      // free Supply Drop crate (every 6 h)
        N.addFunds(D.tap * 2 * 3 * 5);                                  // ~3 taps a second at about x2 combo
        buyLoop();
        if (s % 12 === 0) { housekeeping(); if (tryPromote()) buyLoop(); }
        if (cleared.done) break;
      }
      tryPromote(); buyLoop(); housekeeping(); startOps();
      window.__active = false;
    }
    function gap(secs, mode) {
      if (secs <= 0) return;
      vt += secs * 1000; S.last = vt; N.recalc();
      if (mode === 'mobile') { const o = N.offlineFor(secs); N.addFunds(o.amount); }   // capped, 50% (100% with Chief's Club)
      else N.addFunds(D.ips * secs);                                                    // tab left open: full income, nothing bought
    }
    const wake = 7, sleep = 23; let day = 0;
    if (cfg.mode === 'always') { while (!cleared.done && day < maxDays) { runSession(1440); day++; } }
    else {
      while (!cleared.done && day < maxDays) {
        const n = cfg.sessions, times = []; for (let i = 0; i < n; i++) times.push(n === 1 ? wake : wake + i * ((sleep - wake) / (n - 1)));
        let cursor = 0;
        for (let i = 0; i < n; i++) {
          const st = times[i] * 3600; gap(st - cursor, (cfg.mode === 'open' && i > 0) ? 'open' : 'mobile'); cursor = st;
          runSession(cfg.minutes); cursor += cfg.minutes * 60;
          if (cleared.done) break;
        }
        gap(24 * 3600 - cursor, 'mobile'); day++;
      }
    }
    const bad = []; ['funds', 'run', 'life', 'badges', 'medals', 'piggy'].forEach(k => { if (!isFinite(S[k]) || isNaN(S[k])) bad.push(k); });
    return { days: T() / DAY, cleared, stats, activeHours: stats.activeSec / 3600, tables, promoLog, bad };
  }, { cfg: ARCH[name], maxDays, calib });
  console.log(JSON.stringify({ name, out }));
  await browser.close();
})();
