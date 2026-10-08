/*
 * Rainkeep: the Spice Road, a dice board the Caravan Hall's traders run. A caravan travels a loop of 24
 * stops; each Road Die moves it 1 to 6 stops and the stop it lands on pays out: resources, Starglass, a
 * buried cache, a free pick at the Bazaar, a fight with bandits, a Sweet Well that doubles the next payout,
 * a mirage or a dust devil that carries it further, a shrine with a free die. Every lap past Home Oasis
 * pays, and laps fill a prize track that starts over each Road season (8 hours of keep time). A Lucky Die
 * rolls the number you choose.
 * Road Dice come free (one every 20 minutes of keep time while fewer than 10 are in hand), from the daily
 * duty chests, expedition bosses, now and then a beast (1 in 20), the Bazaar and caches, and the Road Dice pack.
 * Plugs into core through KH.hooks (defaults, tick), KH.sheets, KH.side and KH.on.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { fmt, fmtTime, icon, esc, clamp, pick } = KH.u;
  const { UI, ACT } = KH;
  const R = DATA.road, B = R.board, ST = R.stops, N = B.length;
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });

  KH.hooks.defaults.push((s) => {
    s.road = { open: false, pos: 0, laps: 0, season: -1, claimed: [], dbl: false, acc: 0, wares: null, last: 0, log: [] };
    s.stats.laps = 0; s.stats.rolls = 0; s.stats.bandits = 0;
  });

  const unlocked = () => !!S && S.lv[R.unlockPlot] > 0;
  const open = () => unlocked() && !!S.road.open;
  const seasonIdx = () => Math.floor(S.time / R.season);
  const seasonLeft = () => (seasonIdx() + 1) * R.season - S.time;
  const lapReady = () => R.laps.some(([n], i) => S.road.laps >= n && !S.road.claimed.includes(i));
  // a reward in words, for the log and toasts
  const words = (g) => Object.entries(g).map(([k, v]) => `${fmt(v)} ${((DATA.items[k] && DATA.items[k].name) || KH.NAME[k] || k).toLowerCase()}`).join(', ');

  // the season's lap prizes that were earned but never collected arrive by mail when it ends
  function endSeason() {
    const missed = {};
    R.laps.forEach(([n, g], i) => {
      if (S.road.laps >= n && !S.road.claimed.includes(i)) for (const [k, v] of Object.entries(KH.scaleReward(g))) missed[k] = (missed[k] || 0) + v;
    });
    if (Object.keys(missed).length) KH.mail('Spice Road: lap prizes', `The Road season ended after ${S.road.laps} laps. Here are the prizes you earned but didn't collect.`, missed);
  }

  KH.hooks.tick.push((dt) => {
    if (!unlocked()) return;
    const P = S.road;
    if (!P.open) {
      P.open = true; P.season = seasonIdx(); P.acc = 0;
      KH.mail('The Spice Road opens', 'With the Caravan Hall built, the traders have opened the old spice road again. Roll Road Dice to move your caravan from stop to stop: each stop pays out, and every lap past Home Oasis earns a prize. A Lucky Die rolls the number you choose. Here are dice to start you off.', { dice: R.welcome.dice, lucky: R.welcome.lucky });
      KH.emit('roadOpen', {});
      return;
    }
    if (P.season !== seasonIdx()) {
      endSeason();
      P.season = seasonIdx(); P.laps = 0; P.claimed = [];
    }
    // a free die every 20 minutes of keep time, while fewer than 10 are in hand
    if (!dt) return;
    if (KH.have('dice') >= R.free.cap) { P.acc = 0; return; }
    P.acc += dt;
    while (P.acc >= R.free.every && KH.have('dice') < R.free.cap) { P.acc -= R.free.every; KH.grant({ dice: 1 }); }
    if (KH.have('dice') >= R.free.cap) P.acc = 0;
  });

  // Road Dice from the rest of the game: two for every expedition boss, now and then one for a beast
  const dice = (n, why) => { if (!open() || !n) return; KH.grant({ dice: n }); KH.toast(`+${n} Road ${n > 1 ? 'Dice' : 'Die'} ${why}.`, 'good', 'dice', 3); };
  KH.on('stage', ({ n }) => { if (open() && KH.enemyFor && KH.enemyFor(n).boss) dice(R.bossDice, 'from the fallen boss'); });
  KH.on('beast', () => { if (open() && Math.random() < R.beastDice) dice(1, 'from the beast hunt'); });

  // ======================================================================
  // Moving the caravan
  // ======================================================================
  function lap(log) {
    S.road.laps++; S.stats.laps++;
    const g = KH.scaleReward(R.lapGive);
    KH.grant(g);
    log.push({ icon: 'i-road', text: `Lap ${S.road.laps} round the road: ${words(g)}` });
    KH.emit('roadLap', { laps: S.road.laps });
  }
  function move(steps, log) {
    for (let i = 0; i < steps; i++) {
      S.road.pos = (S.road.pos + 1) % N;
      if (S.road.pos === 0) lap(log);
    }
  }
  // a stop's payout, doubled when the caravan last drank at the Sweet Well
  function pay(g, log, what, ic) {
    if (S.road.dbl) { g = Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v * 2])); S.road.dbl = false; what += ' (doubled)'; }
    KH.grant(g);
    log.push({ icon: ic, text: `${what}: ${words(g)}` });
  }
  const weighted = (table) => {
    let r = Math.random() * table.reduce((a, [w]) => a + w, 0);
    for (const [w, g] of table) { r -= w; if (r < 0) return g; }
    return table[0][1];
  };
  function bandits(log) {
    const st = Math.max(2, Math.min(S.stage * R.bandits.stage, S.lv.wyrm * 3));
    const foe = { n: Math.round(st), name: 'Bandits', cls: pick(['guard', 'bow', 'lancer']), boss: false, ...KH.foeStats(st, 1) };
    const res = KH.simulateBattle(KH.teamStats(foe.cls), foe);
    if (res.win) {
      S.stats.bandits++;
      pay(KH.scaleReward(R.bandits.win), log, 'Bandits driven off', 'i-bandit');
      KH.emit('roadBandits', {});
    } else log.push({ icon: 'i-bandit', text: 'The bandits were too many for your squad; the caravan slipped past them.' });
  }
  // what happens at the stop the caravan lands on (a mirage or a dust devil can carry it on, twice at most)
  function land(log, depth = 0) {
    const kind = B[S.road.pos], st = ST[kind];
    if (st.give) return pay(KH.scaleReward(st.give), log, st.name, st.icon);
    if (kind === 'home') { KH.grant({ dice: R.homeDice }); log.push({ icon: 'i-die', text: `Home Oasis: +${R.homeDice} Road Die` }); return; }
    if (kind === 'chest') return pay(KH.scaleReward(weighted(R.cache)), log, 'Buried Cache', 'i-chest');
    if (kind === 'bandits') return bandits(log);
    if (kind === 'market') {
      const idx = R.wares.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, 3);
      S.road.wares = idx;
      log.push({ icon: 'i-market', text: 'A trader at the Bazaar lets you pick one of three wares.' });
      return;
    }
    if (kind === 'well') { S.road.dbl = true; log.push({ icon: 'i-well', text: 'Sweet Well: the next stop that pays out pays double.' }); return; }
    if (kind === 'shrine') {
      KH.grant({ dice: R.shrineDice });
      if (KH.bondAdd) KH.bondAdd(R.shrineBond);
      log.push({ icon: 'i-shrine', text: `Shrine of Rain: +${R.shrineDice} Road Die, and the Rainwyrm feels the prayer` });
      return;
    }
    if (depth >= 2) return;
    if (kind === 'mirage') {
      const k = 2 + Math.floor(Math.random() * 6);
      log.push({ icon: 'i-mirage', text: `A mirage leads the caravan ${k} stops on` });
      move(k, log);
      return land(log, depth + 1);
    }
    if (kind === 'dustdevil') {
      log.push({ icon: 'i-dustdevil', text: 'A dust devil carries the caravan 3 stops on' });
      move(3, log);
      return land(log, depth + 1);
    }
  }
  function rollOnce(face, lucky) {
    const from = S.road.pos, log = [];
    S.road.last = face; S.stats.rolls++;
    move(face, log);
    land(log);
    S.road.log = [{ face, lucky: !!lucky, lines: log, at: B[S.road.pos] }, ...S.road.log].slice(0, 5);
    if (KH.duty) KH.duty('road');
    KH.emit('roadRoll', { face, lucky: !!lucky });
    return from;
  }

  // the board animation: the die tumbles, then the caravan hops stop by stop to where it landed
  let animTimer = null;
  function animate(from, to) {
    clearInterval(animTimer);
    UI.road = { show: from, to, rolling: true, t0: performance.now() };
    KH.renderAll(true);
    animTimer = setInterval(() => {
      const A = UI.road;
      if (!A) return clearInterval(animTimer);
      if (A.rolling) { if (performance.now() - A.t0 > 520) A.rolling = false; KH.renderAll(true); return; }
      if (A.show === A.to) { clearInterval(animTimer); UI.road = null; KH.renderAll(true); return; }
      A.show = (A.show + 1) % N;
      KH.renderAll(true);
    }, 150);
  }

  // ======================================================================
  // Actions
  // ======================================================================
  ACT.road = () => { UI.sheet = { kind: 'road' }; };
  // roll one die, up to 10 in a row (stopping at the Bazaar), or a Lucky Die for a chosen number ('lucky:4')
  ACT.roadroll = (arg) => {
    if (!open()) return;
    if (S.road.wares) return KH.toast('Pick a ware at the Bazaar first, or pass.', 'warn');
    const [mode, v] = String(arg || '1').split(':');
    if (mode === 'lucky') {
      if (KH.have('lucky') < 1) return KH.toast('No Lucky Dice. They come from lap prizes, caches and the Road Dice pack.', 'warn');
      KH.pay({ lucky: 1 });
      const face = clamp(Number(v) || 1, 1, 6), from = rollOnce(face, true);
      UI.roadPick = false;
      KH.sfx('claim');
      return animate(from, S.road.pos);
    }
    const want = mode === 'all' ? 10 : clamp(Number(mode) || 1, 1, 10);
    if (KH.have('dice') < 1) return KH.toast(`No Road Dice left. A free one comes every ${Math.round(R.free.every / 60)} minutes.`, 'warn');
    let n = 0, from = S.road.pos;
    while (n < want && KH.have('dice') > 0 && !S.road.wares) { KH.pay({ dice: 1 }); const f = rollOnce(1 + Math.floor(Math.random() * 6)); if (!n) from = f; n++; }
    KH.sfx('coin');
    if (n === 1) animate(from, S.road.pos);
    else { UI.road = null; KH.toast(`${n} rolls: the caravan is at ${ST[B[S.road.pos]].name}.`, 'good'); }
  };
  ACT.roadlucky = () => {
    if (!UI.roadPick && KH.have('lucky') < 1) return KH.toast('No Lucky Dice. They come from lap prizes, caches and the Road Dice pack.', 'warn');
    UI.roadPick = !UI.roadPick;
  };
  // take one ware at the Bazaar (free), or pass
  ACT.roadbuy = (i) => {
    if (!S.road.wares) return;
    if (i === 'pass') { S.road.wares = null; return KH.toast('You pass the Bazaar by.', ''); }
    const w = R.wares[S.road.wares[Number(i)]];
    if (!w) return;
    S.road.wares = null;
    const log = [];
    pay(KH.scaleReward(w), log, 'Bazaar', 'i-market');
    if (S.road.log[0]) S.road.log[0].lines.push(...log);
    KH.toast(log[0].text, 'good');
    KH.sfx('claim');
  };
  ACT.roadlap = (i) => {
    i = Number(i);
    const t = R.laps[i];
    if (!t || S.road.laps < t[0] || S.road.claimed.includes(i)) return;
    S.road.claimed.push(i);
    KH.grant(KH.scaleReward(t[1]));
    KH.toast(`Lap prize collected: ${words(KH.scaleReward(t[1]))}.`, 'good');
    KH.sfx('claim');
  };

  // ======================================================================
  // The sheet: the board, the die, the lap prizes
  // ======================================================================
  // stop i on a 7 x 7 ring, clockwise from Home Oasis in the bottom-left corner
  function cell(i) {
    if (i <= 6) return [6, i];
    if (i <= 12) return [6 - (i - 6), 6];
    if (i <= 18) return [0, 6 - (i - 12)];
    return [i - 18, 0];
  }
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const dieFace = (n, cls = '') => `<span class="road-die ${cls}">${Array.from({ length: 9 }, (_, k) => `<i class="${PIPS[n].includes(k) ? 'on' : ''}"></i>`).join('')}</span>`;

  KH.sheets.road = () => {
    const intro = KH.art.banner('event', 'road', 'Roll Road Dice to move your caravan round the old spice road. Every stop pays out, and every lap past Home Oasis earns a prize.');
    if (!unlocked()) return { title: 'Spice Road', lvl: 'Locked', body: `${intro}<div class="card"><p>${icon('i-lock')} The Spice Road opens once you build the Caravan Hall.</p></div>` };
    const P = S.road, A = UI.road, shown = A ? A.show : P.pos;
    const tiles = B.map((k, i) => {
      const [r, c] = cell(i), st = ST[k];
      return `<div class="road-stop ${k}${i === shown ? ' here' : ''}${i % 6 === 0 ? ' corner' : ''}" style="grid-row:${r + 1};grid-column:${c + 1}" title="${esc(st.name)}">${icon(st.icon)}</div>`;
    }).join('');
    const [tr, tc] = cell(shown);
    const token = `<div class="road-token${A && !A.rolling ? ' hop' : ''}" style="left:${((tc + 0.5) / 7) * 100}%;top:${((tr + 0.5) / 7) * 100}%">${icon('i-road')}</div>`;
    const face = A && A.rolling ? dieFace(1 + Math.floor(Math.random() * 6), 'rolling') : dieFace(P.last || 6, P.last ? '' : 'idle');
    const nDice = KH.have('dice'), nLucky = KH.have('lucky');
    const here = ST[B[A ? A.to : P.pos]];
    const free = nDice >= R.free.cap ? `Free dice wait while you hold ${R.free.cap}.` : `Next free die in ${fmtTime(R.free.every - P.acc)}.`;
    // the Lucky Die's number picker takes the place of the roll buttons while it is open
    const controls = UI.roadPick && nLucky
      ? `<div class="road-pick-label small">Roll a Lucky Die for</div><div class="road-pick">${[1, 2, 3, 4, 5, 6].map((n) => `<button class="btn small gold" data-act="roadroll" data-arg="lucky:${n}">${n}</button>`).join('')}</div>
        <button class="btn small alt" data-act="roadlucky">Cancel</button>`
      : `<button class="btn wide ${nDice && !P.wares ? 'gold' : 'off'}" data-act="roadroll" data-arg="1" data-primary>${icon('i-die')}Roll</button>
        <div class="row"><button class="btn small grow alt ${nDice > 1 && !P.wares ? '' : 'off'}" data-act="roadroll" data-arg="all">Roll ${Math.min(10, Math.max(2, nDice))}</button>
        <button class="btn small grow ${nLucky && !P.wares ? '' : 'off'}" data-act="roadlucky">${icon('i-luckydie')}Lucky</button></div>`;
    const center = `<div class="road-center">
      ${face}
      <div class="road-here">${esc(here.name)}${P.dbl ? ' · <b class="good">next payout doubled</b>' : ''}</div>
      <div class="row road-have"><span class="chip">${icon('i-die')}${fmt(nDice)}</span><span class="chip">${icon('i-luckydie')}${fmt(nLucky)}</span></div>
      ${controls}</div>`;
    const board = `<div class="road-board art-e-roadboard">${tiles}${center}${token}</div>`;
    const wares = P.wares ? `<div class="card stack road-wares"><b>${icon('i-market')}The Bazaar: pick one, free</b><div class="row wrap">${P.wares.map((w, i) => `<button class="btn alt road-ware" data-act="roadbuy" data-arg="${i}">${KH.rewardHTML(KH.scaleReward(R.wares[w]))}</button>`).join('')}</div>
      <button class="btn small off" data-act="roadbuy" data-arg="pass">Pass</button></div>` : '';
    const log = P.log.length ? `<div class="section-label">Last rolls</div><div class="stack road-log">${P.log.map((e) => `<div class="row">${dieFace(e.face, e.lucky ? 'tiny lucky' : 'tiny')}<div class="grow small">${e.lines.length ? e.lines.map((l) => `<div>${icon(l.icon)}${esc(l.text)}</div>`).join('') : `<div>${esc(ST[e.at].name)}</div>`}</div></div>`).join('')}</div>` : '';
    const maxLap = R.laps[R.laps.length - 1][0];
    const prizes = R.laps.map(([n, g], i) => {
      const got = P.claimed.includes(i), ready = P.laps >= n;
      return `<div class="duty ${got ? 'done' : ''}"><span class="chip">Lap ${n}</span><div class="costs grow">${KH.rewardHTML(KH.scaleReward(g))}</div>${got ? '<span class="muted small">Got</span>' : ready ? `<button class="btn small gold" data-act="roadlap" data-arg="${i}">Collect</button>` : ''}</div>`;
    }).join('');
    const stops = Object.values(ST).filter((s) => s.desc).map((s) => `<div class="row small">${icon(s.icon)}<span><b>${esc(s.name)}</b> ${esc(s.desc)}</span></div>`).join('');
    return {
      title: 'Spice Road', lvl: `Lap ${P.laps}`,
      body: `${intro}${wares}${board}
        <p class="muted small">${esc(free)} Dice also come from the daily duty chests, expedition bosses, beasts on the Dunes and the Bazaar.</p>
        ${log}
        <div class="section-label">Lap prizes · season ends in ${fmtTime(seasonLeft())}</div>
        <div class="bar"><i style="width:${Math.min(100, (P.laps / maxLap) * 100)}%"></i></div>
        <div class="stack">${prizes}</div>
        <div class="section-label">The stops</div><div class="stack road-key">${stops}</div>`,
    };
  };

  // the side rail
  KH.side.push({ id: 'road', icon: 'i-road', label: 'Spice Road', act: 'road', show: unlocked,
    dot: () => open() && (KH.have('dice') >= 3 || !!S.road.wares || lapReady()), badge: () => `${fmt(KH.have('dice'))}` });

  // for tests and the balance bot
  KH.road = { unlocked, open, lapReady, cell, board: B, seasonLeft, pos: () => (S ? S.road.pos : 0) };
})();
