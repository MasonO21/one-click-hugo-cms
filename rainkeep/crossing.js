/*
 * Rainkeep: the Crossing, a roguelite run across the deep desert to a hidden oasis. A route is ten
 * rows of a three-lane map (raiders, elites, oases, a merchant, mirage events and caches) that ends at
 * the Oasis Warden. Each step goes to the same lane or one beside it; the squad's health carries from
 * fight to fight, and boons picked up on the way last the whole run. Routes open in keep time (one
 * every 8 hours, two waiting), and the chest at the end grows with every row crossed.
 * Plugs into core through KH.hooks, KH.sheets, KH.side (the Play hub) and the shared battle screen
 * (KH.fightLive, which carries the squad's worn health in opts.startHp); KH.crossing.auto() plays a
 * whole run for tests and the balance bot.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { fmt, fmtTime, icon, esc, seeded, clamp } = KH.u;
  const { UI, ACT } = KH;
  const C = DATA.crossing;
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => {
    s.cross = { maps: 0, acc: 0, open: false, best: 0, run: null, last: null };
    s.stats.crossRuns = 0; s.stats.crossWins = 0;
  });

  const BOON = Object.fromEntries(C.boons.map((b) => [b.id, b]));
  const EVENT = Object.fromEntries(C.events.map((e) => [e.id, e]));
  const KIND = {
    fight: { icon: 'i-duel', name: 'Raiders' },
    elite: { icon: 'i-power', name: 'Elite' },
    oasis: { icon: 'i-water', name: 'Oasis' },
    merchant: { icon: 'i-caravan', name: 'Merchant' },
    mirage: { icon: 'i-compass', name: 'Mirage' },
    cache: { icon: 'i-chest', name: 'Cache' },
    boss: { icon: 'i-trophy', name: 'The Oasis Warden' },
  };
  const pct = (v) => `${Math.round(v * 100)}%`;
  const unlocked = () => !!S && S.stage >= C.unlockStage;
  const run = () => (S && S.cross ? S.cross.run : null);

  // Routes open in keep time; the first two wait the moment the Crossing opens.
  KH.hooks.tick.push((dt) => {
    if (!unlocked() || !dt) return;
    const x = S.cross;
    if (!x.open) {
      x.open = true; x.maps = C.cap; x.acc = 0;
      KH.mail('The Crossing', 'The scouts have found a route south, past the last well anyone remembers, to an oasis no map shows. Lead the squad across: ten days of desert, raiders and mirages, and a Warden at the water. Every row you cross fills the chest you bring home. A new route opens every 8 hours.');
      return;
    }
    if (x.maps >= C.cap) { x.acc = 0; return; }
    x.acc += dt;
    while (x.acc >= C.every && x.maps < C.cap) { x.acc -= C.every; x.maps++; }
    if (x.maps >= C.cap) x.acc = 0;
  });

  // ======================================================================
  // The route
  // ======================================================================
  function makeMap(seed) {
    const r = seeded(seed), kinds = Object.keys(C.odds), total = kinds.reduce((a, k) => a + C.odds[k], 0);
    const pick = () => { let v = r() * total; for (const k of kinds) { v -= C.odds[k]; if (v < 0) return k; } return 'fight'; };
    const map = [];
    for (let row = 1; row <= C.rows; row++) {
      if (row === 1) map.push(['fight', 'fight', 'fight']);
      else if (row === C.rows) map.push(['boss', 'boss', 'boss']);
      else map.push([pick(), pick(), pick()]);
    }
    // every route has an oasis somewhere in its middle rows, and the row before the Warden has a fight to earn it
    if (!map.slice(3, 6).some((row) => row.includes('oasis'))) map[4][Math.floor(r() * 3)] = 'oasis';
    return map;
  }
  const reachable = (row, lane) => {
    const R = run();
    if (!R || R.pending || row !== R.row + 1) return false;
    return row === C.rows || R.row === 0 || Math.abs(lane - R.lane) <= 1;
  };
  const boonSum = (k) => (run() ? run().boons.reduce((a, id) => a + (BOON[id][k] || 0), 0) : 0);
  const pickBoons = (n) => C.boons.filter((b) => !run().boons.includes(b.id)).map((b) => b.id).sort(() => Math.random() - 0.5).slice(0, n);
  const coinsFor = (kind) => Math.round((C.coins[kind] || 0) * (1 + boonSum('coins')));

  // foes measure themselves against the squad as it set out (R.base): softer early in the route, harder near the oasis
  function foeAt(row, kind) {
    const R = run(), ch = KH.chapterOf(Math.min(S.stage, DATA.finalStage));
    const f = ch.foes[Math.floor(seeded(R.seed + row * 17)() * ch.foes.length)];
    const m = (C.foe.start + C.foe.per * (row - 1)) * (kind === 'boss' ? C.foe.boss : kind === 'elite' ? C.foe.elite : 1);
    const st = { atk: R.base.atk * m, def: R.base.def * m, hp: R.base.hp * m };
    if (kind === 'boss') return { n: S.stage, name: 'The Oasis Warden', cls: ['guard', 'bow', 'lancer'][R.seed % 3], boss: true, chapter: 'The Crossing', ...st };
    const elite = kind === 'elite';
    return { n: S.stage, name: elite ? `Veteran ${f[0]}` : f[0], cls: f[1], boss: false, elite, chapter: 'The Crossing', ...st };
  }
  function teamFor(foe) {
    const t = KH.teamStats(foe.cls, { atkBonus: boonSum('atk') + (foe.elite || foe.boss ? boonSum('eliteAtk') : 0), defBonus: boonSum('def') });
    t.hp *= 1 + boonSum('hp');
    t.fx = { ...t.fx, burst: t.fx.burst + boonSum('burst') };
    return t;
  }
  function odds(row, kind) {
    const foe = foeAt(row, kind), t = teamFor(foe), R = run();
    const breath = S.dormant ? 0 : DATA.wyrm.breath(S.lv.wyrm) * (1 + KH.bonus('breath') + boonSum('breath'));
    const ours = KH.statPower({ atk: t.atk, def: t.def, hp: t.hp * R.hp }) * (1 + breath), theirs = KH.statPower(foe);
    return ours >= theirs * 1.15 ? 'fav' : ours >= theirs * 0.9 ? 'even' : 'risky';
  }
  const ODDS = { fav: 'Favored', even: 'Even', risky: 'Risky' };

  function step(row, lane) { const R = run(); R.row = row; R.lane = lane; R.path.push([row, lane]); }
  function heal(v) { const R = run(); R.hp = clamp(R.hp + v, 0.05, 1); }
  function endRun(won) {
    const R = run(), d = won ? C.rows : R.row;
    const rewards = KH.scaleReward(C.rewards(d, won));
    for (const k of Object.keys(rewards)) if (!rewards[k]) delete rewards[k];
    KH.grant(rewards);
    S.cross.best = Math.max(S.cross.best, d);
    S.stats.crossRuns++;
    if (won) S.stats.crossWins++;
    S.cross.last = { d, won, rewards, boons: R.boons.slice() };
    S.cross.run = null;
    KH.emit('crossing', { d, won });
    return rewards;
  }

  // ======================================================================
  // Actions
  // ======================================================================
  ACT.crossing = () => { UI.sheet = { kind: 'crossing' }; };
  ACT.cxstart = () => {
    if (!unlocked()) return KH.toast(`The Crossing opens after stage ${C.unlockStage - 1}.`, 'warn');
    if (run()) return;
    if (S.cross.maps < 1) return KH.toast(`No route is ready. The next opens in ${fmtTime(C.every - S.cross.acc)}.`, 'warn');
    S.cross.maps--;
    const seed = 1 + Math.floor(Math.random() * 1e9), t = KH.teamStats(null, { heroes: S.squad });
    S.cross.run = { seed, row: 0, lane: 1, hp: 1, coins: 0, boons: [], map: makeMap(seed), path: [], pending: null, note: '', seen: [], quit: false,
      base: { atk: t.atk, def: t.def, hp: t.hp } };
    S.cross.last = null;
    KH.sfx('tap');
  };
  ACT.cxgo = (arg) => {
    const [row, lane] = String(arg).split(':').map(Number), R = run();
    if (!reachable(row, lane)) return;
    const kind = R.map[row - 1][lane];
    R.quit = false;
    if (kind === 'fight' || kind === 'elite' || kind === 'boss') return fight(row, lane, kind);
    step(row, lane);
    if (kind === 'oasis') { heal(C.oasis); R.note = `An oasis. The squad drinks and rests: ${pct(C.oasis)} of its health back.`; KH.sfx('coin'); }
    else if (kind === 'merchant') { R.pending = { kind: 'merchant', offers: pickBoons(3), sold: [], healed: false }; R.note = ''; KH.sfx('tap'); }
    else if (kind === 'mirage') {
      const fresh = C.events.filter((e) => !R.seen.includes(e.id)), e = (fresh.length ? fresh : C.events)[Math.floor(Math.random() * (fresh.length || C.events.length))];
      R.seen.push(e.id);
      R.pending = { kind: 'event', id: e.id }; R.note = '';
      KH.sfx('tap');
    } else if (kind === 'cache') {
      const n = coinsFor('cache');
      R.coins += n;
      R.note = `A buried cache: ${n} coins.`;
      const offers = pickBoons(2);
      if (Math.random() < 0.5 && offers.length) { R.pending = { kind: 'boon', offers, why: 'Also in the cache' }; R.note += ' And something better underneath.'; }
      KH.sfx('coin');
    }
  };
  function fight(row, lane, kind) {
    const R = run();
    if (!KH.squadHome().length) return KH.toast('Your squad is out on the Dunes. Wait for them to return.', 'warn');
    const foe = foeAt(row, kind), team = teamFor(foe);
    KH.fightLive({
      title: kind === 'boss' ? 'The Crossing · the hidden oasis' : `The Crossing · row ${row}`, foe, team,
      opts: { startHp: R.hp * team.hp, breathBonus: boonSum('breath') },
      intro: kind === 'boss' ? 'Something vast rises out of the oasis, streaming water. It has guarded this place since before the sun fell.' : kind === 'elite' ? 'Veterans of the deep desert, and they know the ground better than you.' : 'Raiders on the route, and they have seen your water.',
      loseLine: 'The squad turns back, carrying its wounded home.',
      onEnd: (result) => {
        if (run() !== R) return {};
        let rewards = null;
        if (result.win) {
          step(row, lane);
          R.hp = clamp(result.th / team.hp + C.rest + boonSum('rest'), 0.05, 1);
          const n = coinsFor(kind === 'boss' ? 'elite' : kind);
          R.coins += n;
          if (kind === 'boss') rewards = endRun(true);
          else {
            R.note = `${foe.name} beaten: ${n} coins, and the squad catches its breath.`;
            if (kind === 'elite') { const offers = pickBoons(3); if (offers.length) R.pending = { kind: 'boon', offers, why: "The veterans' spoils" }; }
          }
        } else rewards = endRun(false);
        KH.emit('battle', { kind: 'crossing', win: result.win, foe });
        KH.queueSheet({ kind: 'crossing' });
        KH.save();
        return rewards && Object.keys(rewards).length ? { rewards } : {};
      },
    });
  }
  ACT.cxboon = (id) => {
    const R = run(), p = R && R.pending;
    if (!p || p.kind !== 'boon' || !p.offers.includes(id)) return;
    R.boons.push(id); R.pending = null;
    R.note = `${BOON[id].name}: ${BOON[id].desc.charAt(0).toLowerCase() + BOON[id].desc.slice(1)} for the rest of the route.`;
    KH.sfx('claim');
  };
  ACT.cxbuy = (id) => {
    const R = run(), p = R && R.pending;
    if (!p || p.kind !== 'merchant') return;
    const i = p.offers.indexOf(id), price = C.merchant.prices[i];
    if (i < 0 || p.sold.includes(id)) return;
    if (R.coins < price) return KH.toast(`${BOON[id].name} costs ${price} coins.`, 'warn');
    R.coins -= price; R.boons.push(id); p.sold.push(id);
    KH.sfx('coin');
  };
  ACT.cxheal = () => {
    const R = run(), p = R && R.pending;
    if (!p || p.kind !== 'merchant' || p.healed) return;
    if (R.coins < C.merchant.healCost) return KH.toast(`Water costs ${C.merchant.healCost} coins.`, 'warn');
    R.coins -= C.merchant.healCost; heal(C.merchant.heal); p.healed = true;
    KH.sfx('coin');
  };
  ACT.cxleave = () => { const R = run(); if (R && R.pending) { R.pending = null; R.note = R.note || 'You walk on.'; } };
  ACT.cxpick = (opt) => {
    const R = run(), p = R && R.pending;
    if (!p || p.kind !== 'event') return;
    const e = EVENT[p.id], o = e[opt === 'b' ? 'b' : 'a'];
    if (!o) return;
    if (o.coins < 0 && R.coins < -o.coins) return KH.toast(`That takes ${-o.coins} coins.`, 'warn');
    const res = o.gamble ? (Math.random() < 0.5 ? o.win : o.lose) : o;
    let says = res.says || '', boon = null;
    if (res.hp) heal(res.hp);
    if (res.coins) R.coins += res.coins;
    if (res.boon) boon = pickBoons(1)[0];
    if (boon) { R.boons.push(boon); says += ` (${BOON[boon].name}: ${BOON[boon].desc.charAt(0).toLowerCase() + BOON[boon].desc.slice(1)}.)`; }
    R.pending = null; R.note = says;
    KH.sfx('tap');
  };
  ACT.cxquit = (arg) => {
    const R = run();
    if (!R) return;
    if (arg !== 'yes') { R.quit = !R.quit; return; }
    const rewards = endRun(false);
    KH.toast(Object.keys(rewards).length ? 'The squad turns for home with what it found.' : 'The squad turns for home.', '');
  };
  ACT.cxdone = () => { S.cross.last = null; };

  // ======================================================================
  // The sheet
  // ======================================================================
  const boonChip = (id) => `<span class="cx-boon" title="${esc(BOON[id].desc)}">${icon(BOON[id].icon)}${esc(BOON[id].name)}</span>`;
  function pendingCard(R) {
    const p = R.pending;
    if (p.kind === 'boon') {
      return `<div class="card stack cx-pend"><b>${esc(p.why)}: choose one</b>${p.offers.map((id) => `<button class="btn choice wide alt" data-act="cxboon" data-arg="${id}">${icon(BOON[id].icon)}<span class="grow"><b>${esc(BOON[id].name)}</b><br><span class="muted small">${esc(BOON[id].desc)}</span></span></button>`).join('')}
        <button class="btn small alt" data-act="cxleave">Take nothing</button></div>`;
    }
    if (p.kind === 'merchant') {
      const rows = p.offers.map((id, i) => {
        const sold = p.sold.includes(id), price = C.merchant.prices[i];
        return `<div class="row cx-ware"><span class="grow">${icon(BOON[id].icon)}<b>${esc(BOON[id].name)}</b><br><span class="muted small">${esc(BOON[id].desc)}</span></span>${sold ? '<span class="chip muted">Bought</span>' : `<button class="btn small ${R.coins >= price ? 'gold' : 'off'}" data-act="cxbuy" data-arg="${id}">${price} coins</button>`}</div>`;
      }).join('');
      return `<div class="card stack cx-pend"><b>${icon('i-caravan')}A merchant's camel train</b><p class="muted small">"Water, charms, a little courage. Coins only, warden."</p>${rows}
        <div class="row cx-ware"><span class="grow">${icon('i-water')}<b>Fresh water</b><br><span class="muted small">${pct(C.merchant.heal)} of the squad's health back</span></span>${p.healed ? '<span class="chip muted">Bought</span>' : `<button class="btn small ${R.coins >= C.merchant.healCost && R.hp < 1 ? 'gold' : 'off'}" data-act="cxheal">${C.merchant.healCost} coins</button>`}</div>
        <button class="btn wide alt" data-act="cxleave">Walk on</button></div>`;
    }
    const e = EVENT[p.id];
    const opt = (k) => { const o = e[k], short = o.coins < 0 && R.coins < -o.coins; return `<button class="btn wide ${k === 'a' ? '' : 'alt'} ${short ? 'off' : ''}" data-act="cxpick" data-arg="${k}">${esc(o.label)}${o.coins < 0 ? ` · ${-o.coins} coins` : ''}</button>`; };
    return `<div class="card stack cx-pend"><b>${icon('i-compass')}${esc(e.title)}</b><p>${esc(e.text)}</p>${opt('a')}${opt('b')}</div>`;
  }
  function mapHTML(R) {
    const cells = [];
    for (let row = 1; row <= C.rows; row++) {
      const lanes = row === C.rows ? [1] : [0, 1, 2];
      const nodes = lanes.map((lane) => {
        const kind = R.map[row - 1][lane], K = KIND[kind];
        const here = R.row === row && R.lane === lane, done = R.path.some(([r, l]) => r === row && l === lane);
        const next = reachable(row, lane), fightish = kind === 'fight' || kind === 'elite' || kind === 'boss';
        const o = next && fightish ? odds(row, kind) : null;
        const cls = `cx-node k-${kind} ${here ? 'here' : done ? 'done' : next ? 'next' : row <= R.row ? 'past' : 'far'}`;
        const inner = `${icon(K.icon)}<span class="cx-lbl">${esc(K.name)}</span>${o ? `<span class="cx-odds ${o}">${ODDS[o]}</span>` : ''}`;
        return next ? `<button class="${cls}" data-act="cxgo" data-arg="${row}:${lane}" aria-label="${esc(K.name)}">${inner}</button>` : `<div class="${cls}">${inner}</div>`;
      }).join('');
      cells.push(`<div class="cx-row ${row === C.rows ? 'boss' : ''}"><span class="cx-rn">${row === C.rows ? '' : row}</span>${nodes}</div>`);
    }
    return `<div class="cx-map"><div class="cx-start">${icon('i-town')}The keep's last well</div>${cells.join('')}</div>`;
  }
  KH.sheets.crossing = () => {
    const intro = KH.art.banner('event', 'crossing', 'Ten rows of deep desert between the last well and an oasis no map shows. Choose your route: raiders, oases, mirages and a merchant, and a Warden at the water.');
    if (!unlocked()) return { title: 'The Crossing', lvl: 'Locked', body: `${intro}<div class="card"><p>${icon('i-lock')} Opens after stage ${C.unlockStage - 1}, once the Shatterjaw Sandshark is beaten.</p></div>` };
    const R = run(), x = S.cross;
    if (!R) {
      const last = x.last ? `<div class="card stack cx-last"><b>${x.last.won ? 'You reached the hidden oasis!' : x.last.d ? `The squad came home from row ${x.last.d}.` : 'The squad came home empty-handed.'}</b>
        ${Object.keys(x.last.rewards).length ? `<div class="costs">${KH.rewardHTML(x.last.rewards)}</div>` : ''}
        ${x.last.boons.length ? `<div class="cx-boons">${x.last.boons.map(boonChip).join('')}</div>` : ''}</div>` : '';
      const chest = KH.scaleReward(C.rewards(C.rows, true));
      return {
        title: 'The Crossing', lvl: `Best: ${x.best ? (x.best >= C.rows ? 'the oasis' : `row ${x.best}`) : '—'}`,
        body: `${intro}${last}
          <div class="card stack"><div class="row"><div class="grow"><b>Routes ready</b><div class="muted small">${x.maps >= C.cap ? 'Both routes are waiting.' : `A new route opens every 8 hours. Next in ${fmtTime(C.every - x.acc)}.`}</div></div><span class="cx-maps"><b>${x.maps}</b>/${C.cap}</span></div>
            <p class="muted small">Your squad's health carries from fight to fight. Win fights for coins and boons, rest at oases, and every row you cross fills the chest. Reach the oasis for all of it:</p>
            <div class="costs">${KH.rewardHTML(chest)}</div>
            <button class="btn wide ${x.maps >= 1 ? 'gold' : 'off'}" data-act="cxstart" data-primary>${icon('i-compass')}Set out</button></div>`,
      };
    }
    const hpCls = R.hp < 0.35 ? 'low' : R.hp < 0.65 ? 'mid' : '';
    const chestNow = KH.scaleReward(C.rewards(R.row, false));
    for (const k of Object.keys(chestNow)) if (!chestNow[k]) delete chestNow[k];
    return {
      title: 'The Crossing', lvl: R.row ? `Row ${R.row}/${C.rows}` : 'Setting out',
      body: `<div class="card stack cx-head"><div class="row"><div class="grow"><b>Squad health</b><div class="bar cx-hp ${hpCls}"><i style="width:${R.hp * 100}%"></i></div></div><span class="cx-hpn">${pct(R.hp)}</span><span class="chip cx-coins"><b>${R.coins}</b> coins</span></div>
          ${R.boons.length ? `<div class="cx-boons">${R.boons.map(boonChip).join('')}</div>` : '<p class="muted small">No boons yet. Elites, caches, the merchant and mirages give them.</p>'}</div>
        ${R.note ? `<p class="cx-note">${esc(R.note)}</p>` : ''}
        ${R.pending ? pendingCard(R) : mapHTML(R)}
        <div class="row cx-foot"><span class="grow muted small">${R.row ? `Turning back now brings home: ${KH.rewardHTML(chestNow) || 'nothing yet'}` : 'Pick a lane in the first row.'}</span>
          ${R.quit ? '<button class="btn small" data-act="cxquit" data-arg="yes">Turn back</button><button class="btn small alt" data-act="cxquit">Stay</button>' : '<button class="btn small alt" data-act="cxquit">Turn back…</button>'}</div>`,
    };
  };

  // the Play hub (ui.js lists it there)
  KH.side.push({ id: 'crossing', icon: 'i-compass', label: 'Crossing', act: 'crossing', show: unlocked,
    dot: () => !run() && S.cross.maps >= 1, badge: () => (run() ? `Row ${run().row}` : `${S.cross.maps}/${C.cap}`) });

  // ======================================================================
  // Auto play, for tests and the balance bot: a careful player's route through a whole run
  // ======================================================================
  function autoRun() {
    ACT.cxstart();
    const R0 = run();
    if (!R0) return null;
    const value = (kind, R) => {
      const low = R.hp < 0.45;
      return { oasis: low ? 9 : R.hp < 0.8 ? 5 : 1, cache: 4, merchant: R.coins >= 55 ? 6 : low && R.coins >= 35 ? 6 : 2, mirage: 3, fight: low ? 1 : 4, elite: R.hp > 0.75 ? 7 : 0, boss: 9 }[kind];
    };
    for (let guard = 0; guard < 40 && run() === R0; guard++) {
      const R = run();
      if (R.pending) {
        const p = R.pending;
        if (p.kind === 'boon') ACT.cxboon(p.offers[0]);
        else if (p.kind === 'merchant') {
          if (R.hp < 0.6) ACT.cxheal();
          p.offers.forEach((id) => ACT.cxbuy(id));
          ACT.cxleave();
        } else {
          const e = EVENT[p.id], can = (k) => !(e[k].coins < 0 && R.coins < -e[k].coins);
          ACT.cxpick(R.hp > 0.5 && can('a') ? 'a' : can('b') ? 'b' : 'a');
          if (R.pending) ACT.cxleave();
        }
        continue;
      }
      const row = R.row + 1, lanes = row === C.rows ? [1] : [0, 1, 2].filter((l) => reachable(row, l));
      const best = lanes.map((l) => [l, value(R.map[row - 1][l], R) + Math.random() * 0.5]).sort((a, b) => b[1] - a[1])[0][0];
      const kind = R.map[row - 1][best];
      if (kind === 'fight' || kind === 'elite' || kind === 'boss') {
        const quick = KH.quickBattles; KH.quickBattles = true;
        ACT.cxgo(`${row}:${best}`);
        KH.quickBattles = quick;
        UI.battle = null; const el = document.getElementById('battle'); if (el) el.hidden = true;
        UI.sheet = null; UI.sheetQueue = UI.sheetQueue.filter((s) => s.kind !== 'crossing');
      } else ACT.cxgo(`${row}:${best}`);
    }
    return S.cross.last;
  }

  KH.crossing = { unlocked, run, maps: () => (S ? S.cross.maps : 0), auto: autoRun, foeAt, teamFor, makeMap };
})();
