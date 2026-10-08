/*
 * Rainkeep: Trade Routes. From Rainwyrm Lv 10 trade caravans leave the keep for four markets beyond the Dunes
 * (Saltmarch Bazaar, the Southern Wells, the Copper Coast and the Glass Cities) with goods each market asks for,
 * and come home with what the keep can't make: journals, whetstones, Sunsteel, speedups, companion treats and
 * bells, Road Dice, Starglass. Each market posts two orders at a time (new ones every 6 hours of keep time) and its
 * prices move from day to day. The longer roads pay better but cross worse bandit country: troops sent as escort
 * cut the risk, and an ambushed caravan loses half its payment and a fifth of its escort. world3d.js draws the
 * camel trains heading off the edge of the map.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { fmt, fmtTime, icon, esc, sum, clamp, seeded } = KH.u;
  const { UI, ACT } = KH;
  const T = DATA.trade, M = Object.fromEntries(T.markets.map((m) => [m.id, m]));
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => {
    s.trade = { board: {}, refreshAt: 0, trips: [], seq: 0, last: null };
    s.stats.tradeTrips = 0; s.stats.tradeGlass = 0; s.stats.tradeAmbush = 0;
  });
  UI.tradeEscort = 0;

  const unlocked = () => !!S && S.lv.wyrm >= T.unlock;
  const slots = () => (S ? T.slots.reduce((a, [w, n]) => (S.lv.wyrm >= w ? n : a), 0) : 0);
  const trips = () => (S && S.trade ? S.trade.trips : []);
  // a market's prices today: the same all day, different the next
  const mood = (m) => {
    const r = seeded(((Math.floor(S.time / T.day) + 1) * 7919 + m.id.length * 104729 + m.id.charCodeAt(0) * 31) >>> 0);
    r(); return Math.round((T.mood[0] + r() * (T.mood[1] - T.mood[0])) * 20) / 20;
  };
  // the board: two orders a market, drawn afresh every 6 hours; a taken order leaves its place empty till then
  function refresh(force) {
    const X = S.trade;
    if (!force && S.time < X.refreshAt) return;
    X.refreshAt = (Math.floor(S.time / T.refresh) + 1) * T.refresh;
    const r = seeded((Math.floor(S.time / T.refresh) * 2654435761) >>> 0);
    X.board = {};
    for (const m of T.markets) {
      const pick = m.orders.map((o, i) => [r(), i]).sort((a, b) => a[0] - b[0]).slice(0, 2).map(([, i]) => i);
      X.board[m.id] = pick.map((i) => ({ i, taken: false }));
    }
  }
  const want = (m, o) => KH.scaleReward(m.orders[o.i].want);
  function pay(m, o) {
    const p = KH.scaleReward(m.orders[o.i].pay), k = mood(m), out = {};
    for (const [key, v] of Object.entries(p)) out[key] = key in S.res || key === 'journals' || key === 'starglass' ? Math.round(v * k) : Math.max(1, Math.round(v * k));
    return out;
  }
  const hours = (m) => m.hours * 3600;
  const escortNeed = (m) => Math.ceil(KH.marchCap() * m.escort);
  const risk = (m, escort) => Math.max(0, m.risk * (1 - Math.min(1, escort / escortNeed(m))));
  const escortOf = (m, frac) => KH.world.march.pickTroops(Math.min(1, (frac * KH.marchCap()) / Math.max(1, sum(KH.capTroops(S.troops, KH.marchCap(), S.formation)))));

  ACT.trade = () => {
    if (!unlocked()) return KH.toast(`Trade caravans set out from Rainwyrm Lv ${T.unlock}.`, 'warn');
    refresh();
    UI.sheet = { kind: 'trade' };
  };
  ACT.tradeescort = (f) => { UI.tradeEscort = Number(f) || 0; };
  ACT.tradego = (arg) => {
    const [id, n] = String(arg).split(':'), m = M[id];
    if (!m || !unlocked()) return;
    refresh();
    const o = S.trade.board[id] && S.trade.board[id][Number(n)];
    if (!o || o.taken) return KH.toast('That order has been filled.', 'warn');
    if (trips().length >= slots()) return KH.toast(`All ${slots()} of your caravans are on the road.`, 'warn');
    const w = want(m, o);
    if (!KH.canAfford(w)) return KH.toast(`${m.name} wants more than the storehouse holds.`, 'warn');
    // the escort: a share of the escort that makes the road safe (none, half, all of it)
    const troops = UI.tradeEscort ? escortOf(m, m.escort * UI.tradeEscort) : {};
    KH.pay(w);
    for (const k in troops) S.troops[k] -= troops[k];
    o.taken = true;
    const X = S.trade;
    X.seq++;
    X.trips.push({ id: X.seq, m: id, i: o.i, pay: pay(m, o), escort: troops, depart: S.time, at: S.time + hours(m) / 2, back: S.time + hours(m), risk: risk(m, sum(troops)), ambushed: null });
    if (KH.duty) KH.duty('trade');
    KH.emit('tradeOut', { m: id });
    KH.sfx('build');
    KH.toast(`A caravan sets out for ${m.name}. Home in ${fmtTime(hours(m))}.`, 'good');
  };

  KH.hooks.tick.push((dt, offline, log) => {
    if (!S || !unlocked()) return;
    if (S.time >= S.trade.refreshAt) refresh();
    for (const t of trips().slice()) {
      const m = M[t.m];
      // the road out: bandits strike, or don't, on the way to the market
      if (t.ambushed == null && S.time >= t.at) {
        t.ambushed = Math.random() < t.risk;
        if (t.ambushed) {
          for (const k in t.pay) t.pay[k] = Math.floor(t.pay[k] * (1 - T.ambush.lose));
          for (const k in t.escort) t.escort[k] -= Math.round(t.escort[k] * T.ambush.escortLoss);
        }
      }
      if (S.time >= t.back) {
        S.trade.trips = trips().filter((x) => x !== t);
        for (const k in t.escort) S.troops[k] += t.escort[k];
        const g = Object.fromEntries(Object.entries(t.pay).filter(([, v]) => v > 0));
        KH.grant(g);
        S.stats.tradeTrips++;
        if (t.m === 'glass') S.stats.tradeGlass++;
        if (t.ambushed) S.stats.tradeAmbush++;
        S.trade.last = { m: t.m, pay: g, ambushed: t.ambushed, at: S.time };
        KH.emit('tradeHome', { m: t.m, ambushed: t.ambushed });
        const what = `A caravan is home from ${m.name}${t.ambushed ? ', short: bandits caught it on the road' : ''}.`;
        if (log) (log.marches = log.marches || []).push(what);
        else KH.toast(what, t.ambushed ? 'warn' : 'good');
      }
    }
  });

  KH.sheets.trade = () => {
    refresh();
    const X = S.trade, onRoad = trips().length, full = onRoad >= slots();
    const esc3 = [[0, 'None'], [0.5, 'Half'], [1, 'Full']].map(([f, l]) => `<button class="${UI.tradeEscort === f ? 'on' : ''}" data-act="tradeescort" data-arg="${f}">${l}</button>`).join('');
    const road = trips().map((t) => {
      const m = M[t.m], p = clamp((S.time - t.depart) / (t.back - t.depart), 0, 1);
      return `<div class="tr-trip"><div class="row">${icon(m.icon)}<b class="grow">${esc(m.name)}</b><span class="muted small">${t.ambushed ? '<span class="r-legendary">ambushed</span> · ' : ''}home in ${fmtTime(t.back - S.time)}</span></div><div class="bar xp"><i style="width:${p * 100}%"></i></div></div>`;
    }).join('');
    const cards = T.markets.map((m) => {
      const k = mood(m), orders = (X.board[m.id] || []).map((o, n) => {
        if (o.taken) return '<div class="tr-order taken muted small">Filled. New orders in ' + fmtTime(X.refreshAt - S.time) + '.</div>';
        const w = want(m, o), p = pay(m, o), ok = KH.canAfford(w) && !full;
        return `<div class="tr-order"><div class="tr-swap"><div class="costs">${KH.costHTML(w)}</div><span class="tr-arrow">→</span><div class="costs">${KH.rewardHTML(p)}</div></div>
          <button class="btn small ${ok ? 'gold' : 'off'}" data-act="tradego" data-arg="${m.id}:${n}">Send</button></div>`;
      }).join('');
      const pct = Math.round(risk(m, UI.tradeEscort ? escortNeed(m) * UI.tradeEscort : 0) * 100);
      return `<div class="card stack tr-market" style="--mk:${m.color}"><div class="row">${icon(m.icon, 'tr-ic')}<div class="grow"><b>${esc(m.name)}</b><div class="muted small">${esc(m.text)}</div></div></div>
        <div class="row small tr-meta"><span class="chip">${icon('i-clock')}${m.hours} h there and back</span><span class="chip ${k >= 1.15 ? 'r-epic' : k <= 0.9 ? 'muted' : ''}">Prices ×${k.toFixed(2)}</span><span class="chip ${pct >= 20 ? 'r-legendary' : ''}">${icon('i-bandit')}${pct}% bandits</span></div>
        ${UI.tradeEscort ? `<div class="muted small">Escort: ${fmt(Math.ceil(escortNeed(m) * UI.tradeEscort))} troops, home with the caravan.</div>` : ''}
        <div class="stack">${orders}</div></div>`;
    }).join('');
    return {
      title: 'Trade Routes', lvl: `${onRoad}/${slots()}`,
      body: `<p class="muted small">Caravans carry what a market asks for and come home with what it pays. New orders every 6 hours; prices change daily. The far roads pay best and have the most bandits: an escort cuts the risk (troops come home with the caravan), and a caravan caught on the road loses half its payment.</p>
        ${road ? `<div class="card stack">${road}</div>` : ''}
        <div class="row"><span class="grow section-label">Escort</span></div><div class="seg">${esc3}</div>
        <div class="stack">${cards}</div>`,
    };
  };
  KH.side.push({ id: 'trade', icon: 'i-caravan', label: 'Trade', act: 'trade', show: unlocked, dot: () => trips().length < slots(), badge: () => `${trips().length}/${slots()}` });
  KH.chips.push(() => {
    if (!S || !trips().length) return '';
    const t = trips().slice().sort((a, b) => a.back - b.back)[0];
    return `<button class="qchip" data-act="trade">${icon('i-caravan')}${esc(M[t.m].name.replace(/^the /, ''))} <time>${fmtTime(Math.max(0, t.back - S.time))}</time></button>`;
  });
  // for world3d.js: where each caravan is on its road, 0 at the gate, 1 at the edge of the map
  function roads() {
    return trips().map((t) => {
      const m = M[t.m], half = (t.back - t.depart) / 2, el = S.time - t.depart;
      const p = el < half ? el / half : 1 - (el - half) / half;
      return { id: t.id, dir: (m.dir * Math.PI) / 180, p: clamp(p, 0, 1), back: el >= half, color: m.color, ambushed: !!t.ambushed };
    });
  }
  // troops out with caravans, for housing, ranks and the Hall (world.js, ranks.js, hall.js)
  const escorted = () => trips().reduce((a, t) => a + sum(t.escort), 0);
  const escortOfClass = (c) => trips().reduce((a, t) => a + (t.escort[c] || 0), 0);
  KH.trade = { unlocked, slots, trips, mood, refresh, want, pay, risk, escortNeed, roads, escorted, escortOfClass, markets: T.markets };
})();
