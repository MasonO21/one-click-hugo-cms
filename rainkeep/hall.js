/*
 * Rainkeep: the Hall of Wardens. A ranking of fifty wardens of the Dunes by power, you among them. The other
 * forty-nine are generated once per save: each is a share of a typical free player's power curve (taken from the
 * balance bot) and runs at a pace of its own, so some race ahead early and are caught later. Every day of keep
 * time the Hall pays out by rank, and passing a warden says so. Plugs in through KH.hooks, KH.sheets, KH.side and
 * KH.power.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { fmt, icon, esc, fmtTime, seeded } = KH.u;
  const { UI, ACT } = KH;
  const H = DATA.hall;
  let S = null, wardens = null;
  KH.hooks.boot.push(() => { S = KH.S; wardens = null; });
  KH.hooks.defaults.push((s) => {
    s.hall = { open: false, seed: 0, day: 0, last: 0, acc: 0 };
    s.stats.hallClimb = 0; s.stats.hallDays = 0;
  });
  const unlocked = () => !!S && S.lv.wyrm >= H.unlock;

  // a typical free player's power after h hours of keep time, log-linear between the bot's samples, and still
  // growing gently past the last one
  function ref(h) {
    const C = H.curve;
    if (h <= C[0][0]) return C[0][1];
    for (let i = 1; i < C.length; i++) {
      if (h <= C[i][0]) { const [h0, p0] = C[i - 1], [h1, p1] = C[i]; return p0 * Math.pow(p1 / p0, (h - h0) / (h1 - h0)); }
    }
    const [hn, pn] = C[C.length - 1];
    return pn * Math.pow(1 + H.tail, h - hn);
  }
  // the other wardens, made once from the save's seed: names, keeps, a share of the curve and a pace
  function list() {
    if (wardens) return wardens;
    const rnd = seeded(S.hall.seed || 1), n = H.size - 1, [lo, hi] = H.spread;
    const one = (arr) => arr[Math.floor(rnd() * arr.length)], used = new Set(), seen = new Set();
    const fresh = (make) => { for (let k = 0; k < 200; k++) { const v = make(); if (!used.has(v)) { used.add(v); return v; } } return make(); };
    wardens = Array.from({ length: n }, (_, i) => {
      const u = Math.pow(i / (n - 1), H.skew), f = lo * Math.pow(hi / lo, u) * (0.94 + rnd() * 0.12);
      const name = fresh(() => `${one(DATA.names)} ${one(H.epithets)}`);
      let keep = '';
      for (let k = 0; k < 200 && (!keep || seen.has(keep)); k++) keep = `${one(H.keepA)}${one(H.keepB)}`;
      seen.add(keep);
      return { i, name, keep, f, pace: H.pace[0] + rnd() * (H.pace[1] - H.pace[0]), color: H.colors[Math.floor(rnd() * H.colors.length)] };
    });
    return wardens;
  }
  const powerOf = (w, h = S.time / 3600) => Math.round(ref(h * w.pace) * w.f);
  // your power, counting troops out marching and holding outposts (so they don't drop you down the ledger)
  const out = (troops) => Object.entries(troops || {}).reduce((x, [k, n]) => x + n * KH.unitPower(k), 0);
  const mine = () => Math.round(KH.power() + (S.map && S.map.marches ? S.map.marches.reduce((a, m) => a + out(m.troops), 0) : 0) + (KH.outposts ? KH.outposts.list().reduce((a, o) => a + out(o.troops), 0) : 0) + (KH.trade ? KH.trade.trips().reduce((a, t) => a + out(t.escort), 0) : 0));
  // everyone, strongest first; you are the entry with you: true
  function table() {
    const h = S.time / 3600;
    const rows = list().map((w) => ({ w, name: w.name, keep: w.keep, power: powerOf(w, h), color: w.color }));
    rows.push({ you: true, name: 'You', keep: 'Rainkeep', power: mine(), color: '#3fd0c0' });
    rows.sort((a, b) => b.power - a.power || (a.you ? -1 : 1));
    return rows;
  }
  const rank = () => table().findIndex((r) => r.you) + 1;
  const rewardFor = (r) => (H.rewards.find(([n]) => r <= n) || H.rewards[H.rewards.length - 1])[1];

  KH.hooks.tick.push((dt, offline) => {
    if (!unlocked()) return;
    const X = S.hall;
    if (!X.open) {
      X.open = true; X.seed = X.seed || Math.floor(Math.random() * 1e9) + 1; wardens = null;
      X.day = Math.floor(S.time / H.daily); X.last = X.best = rank();
      S.stats.hallClimb = Math.max(S.stats.hallClimb || 0, H.size + 1 - X.last);
      KH.mail('The Hall of Wardens', `The wardens of the Dunes keep a ledger of their strength, read out in the old Hall of Wardens at every new day. Your keep has been entered at rank ${X.last} of ${H.size}. Every day the Hall pays out by rank, the most to the strongest.`);
      return;
    }
    // the day's payout, by the rank you hold when it turns
    const day = Math.floor(S.time / H.daily);
    if (day > X.day) {
      X.day = day;
      const r = rank(), g = rewardFor(r);
      S.stats.hallDays = (S.stats.hallDays || 0) + 1;
      KH.mail(`Hall of Wardens: rank ${r}`, `The Hall read out the day's ledger. Your keep stands at rank ${r} of ${H.size}.`, g);
      KH.emit('hallDay', { rank: r });
    }
    // passing a warden, checked now and then
    X.acc = (X.acc || 0) + dt;
    if (X.acc < H.check) return;
    X.acc = 0;
    const t = table(), r = t.findIndex((x) => x.you) + 1;
    // a new best only, so troops coming and going can't make it say so twice
    if (r < X.last && r < (X.best || 99) && !offline) {
      const passed = t[r]; // the warden now just below you
      KH.toast(`You passed ${passed.name} of ${passed.keep}: rank ${r} in the Hall of Wardens.`, 'good');
      KH.emit('hallRank', { rank: r });
    }
    X.last = r; X.best = Math.min(X.best || 99, r);
    S.stats.hallClimb = Math.max(S.stats.hallClimb || 0, H.size + 1 - r);
  });

  ACT.hall = () => {
    if (!unlocked()) return KH.toast(`The Hall of Wardens enters your keep at Rainwyrm Lv ${H.unlock}.`, 'warn');
    UI.sheet = { kind: 'hall' };
  };
  KH.sheets.hall = () => {
    const t = table(), me = t.findIndex((x) => x.you), r = me + 1, ahead = me > 0 ? t[me - 1] : null;
    const left = H.daily - (S.time % H.daily);
    const brackets = H.rewards.map(([n, g], i) => {
      const from = i ? H.rewards[i - 1][0] + 1 : 1, on = r >= from && r <= n;
      return `<div class="row hl-br ${on ? 'on' : ''}"><b>${from === n ? `${n}` : `${from}–${n}`}</b><span class="grow"></span>${KH.rewardHTML(g)}</div>`;
    }).join('');
    const rows = t.map((x, i) => `<div class="row hl-row ${x.you ? 'you' : ''}"><b class="hl-rank">${i + 1}</b><i class="hl-crest" style="background:${x.color}"></i>
      <span class="grow"><b>${esc(x.name)}</b><small class="muted"> · ${esc(x.keep)}</small></span><b class="hl-pw">${icon('i-power')}${fmt(x.power)}</b></div>`).join('');
    return {
      title: 'Hall of Wardens', lvl: `#${r}`,
      body: `<div class="card stack hl-me"><div class="row">${icon('i-trophy', 'hl-ic')}<div class="grow"><b>Rank ${r} of ${H.size}</b><div class="muted small">Power ${fmt(t[me].power)}${ahead ? ` · ${fmt(ahead.power - t[me].power + 1)} more to pass ${esc(ahead.name)}` : ' · the strongest warden on the Dunes'}</div></div></div></div>
        <div class="card stack"><div class="row"><b class="grow">The day's payout</b><span class="chip muted">${icon('i-clock')}${fmtTime(left)}</span></div>
          <div class="muted small">Paid by the rank you hold when the day turns.</div><div class="stack hl-brs">${brackets}</div></div>
        <div class="section-label">The ledger</div><div class="stack hl-list">${rows}</div>`,
    };
  };
  KH.side.push({ id: 'hall', icon: 'i-trophy', label: 'Wardens', act: 'hall', show: unlocked, badge: () => `#${S.hall.last || rank()}` });

  KH.hall = { unlocked, rank, table, ref, powerOf, list };
})();
