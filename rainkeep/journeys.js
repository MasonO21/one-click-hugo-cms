/*
 * Rainkeep: Far Journeys. From Rainwyrm Lv 5 a board of journeys beyond the Dunes, each taking a party of up to
 * three heroes away for two to eight hours. A journey has one to three requirements the party must meet together
 * (a class, stars between them, a rarity, a hero's level, a full party of three), more for the longer and richer
 * ones, and each one on the board is drawn so the keep's own heroes can meet it. Heroes away can't fight (they
 * count as busy, like heroes leading a march), so the choice is who to spare; every hero in the party comes home
 * with shards of their own, so benched heroes grow too. A new board every 8 hours, or early for Starglass.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { fmt, fmtTime, icon, esc, sum } = KH.u;
  const { UI, ACT } = KH;
  const J = DATA.journeys, HERO = Object.fromEntries(DATA.heroes.map((h) => [h.id, h])), RANK = { rare: 0, epic: 1, legendary: 2 };
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => {
    s.journeys = { open: false, board: [], refreshAt: 0, trips: [], seq: 0 };
    s.stats.journeys = 0; s.stats.journeysHome = 0; s.stats.journey4 = 0;
  });
  const unlocked = () => !!S && S.lv.wyrm >= J.unlock;
  const slots = () => (S ? J.slots.reduce((a, [w, n]) => (S.lv.wyrm >= w ? n : a), 0) : 0);
  const trips = () => (S && S.journeys ? S.journeys.trips : []);
  const away = (id) => trips().some((t) => t.party.includes(id));
  // heroes on a journey are busy like heroes leading a march (world.js): out of the squad until they are home
  const marching = KH.heroBusy;
  KH.heroBusy = (id) => (marching ? marching(id) : false) || away(id);
  KH.heroAwayWhy = (id) => (away(id) ? 'is away on a far journey' : 'is out leading a march');

  // ======================================================================
  // Requirements
  // ======================================================================
  const COND = {
    cls: (c, p) => p.filter((id) => HERO[id].cls === c.cls).length >= c.n,
    stars: (c, p) => sum(p.map((id) => S.heroes[id].stars)) >= c.n,
    rar: (c, p) => p.some((id) => RANK[HERO[id].rarity] >= RANK[c.r]),
    lvl: (c, p) => p.some((id) => S.heroes[id].lvl >= c.n),
    size: (c, p) => p.length >= c.n,
  };
  const condText = (c) => ({
    cls: () => `${['A', 'Two', 'Three'][c.n - 1]} ${DATA.classes[c.cls].name}${c.n > 1 ? 's' : ''}`,
    stars: () => `${c.n} stars between them`,
    rar: () => (c.r === 'legendary' ? 'A Legendary hero' : 'An Epic or Legendary hero'),
    lvl: () => `A hero at Lv ${c.n} or more`,
    size: () => 'A party of three',
  })[c.t]();
  const condIcon = (c) => (c.t === 'cls' ? DATA.classes[c.cls].icon : c.t === 'stars' ? 'i-star' : c.t === 'rar' ? 'i-recruit' : c.t === 'lvl' ? 'i-up' : 'i-people');
  const meets = (j, p) => p.length >= 1 && p.length <= 3 && j.conds.every((c) => COND[c.t](c, p));
  const roster = () => Object.keys(S.heroes);
  const available = () => roster().filter((id) => !KH.heroBusy(id));
  // the party that meets a journey's requirements and costs the least: heroes off the squad first, then the
  // fewest, then the fewest stars
  function bestParty(j, pool = available()) {
    const sq = new Set(S.squad);
    let best = null, bs = Infinity;
    const take = (p) => {
      if (!meets(j, p)) return;
      const score = p.filter((id) => sq.has(id)).length * 1000 + p.length * 100 + sum(p.map((id) => S.heroes[id].stars));
      if (score < bs) { bs = score; best = p.slice(); }
    };
    const n = pool.length;
    for (let a = 0; a < n; a++) {
      take([pool[a]]);
      for (let b = a + 1; b < n; b++) { take([pool[a], pool[b]]); for (let c = b + 1; c < n; c++) take([pool[a], pool[b], pool[c]]); }
    }
    return best;
  }

  // ======================================================================
  // The board: drawn so the keep's own heroes can meet every journey on it
  // ======================================================================
  const rnd = Math.random;
  function make() {
    let u = rnd(), st = J.odds.length;
    for (let i = 0; i < J.odds.length; i++) { if (u < J.odds[i]) { st = i + 1; break; } u -= J.odds[i]; }
    const [place, what] = J.places[Math.floor(rnd() * J.places.length)];
    const nc = st === 1 ? 1 : st === 4 ? 3 : 2, ros = roster(), top = Math.max(1, ...ros.map((id) => S.heroes[id].lvl));
    for (let tries = 0; tries < 40; tries++) {
      const conds = [], types = ['cls', 'stars', 'rar', 'lvl', 'size'].sort(() => rnd() - 0.5);
      for (const t of types) {
        if (conds.length >= nc) break;
        if (t === 'cls') conds.push({ t, cls: ['guard', 'bow', 'lancer'][Math.floor(rnd() * 3)], n: st >= 3 && rnd() < 0.5 ? 2 : 1 });
        else if (t === 'stars') conds.push({ t, n: 3 + st * 2 + Math.floor(rnd() * 3) });
        else if (t === 'rar') conds.push({ t, r: st >= 3 && rnd() < 0.6 ? 'legendary' : 'epic' });
        else if (t === 'lvl') conds.push({ t, n: Math.max(5, Math.floor((top * [0.5, 0.65, 0.8, 0.95][st - 1]) / 5) * 5) });
        else conds.push({ t, n: 3 });
      }
      const j = { id: ++S.journeys.seq, st, place, what, hours: J.hours[st - 1], conds };
      if (bestParty(j, ros)) return j;
    }
    return { id: ++S.journeys.seq, st: 1, place, what, hours: J.hours[0], conds: [] };
  }
  function refresh(force) {
    const X = S.journeys;
    if (!force && S.time < X.refreshAt) return;
    X.refreshAt = (Math.floor(S.time / J.refresh) + 1) * J.refresh;
    X.board = Array.from({ length: J.board }, make).sort((a, b) => b.st - a.st);
  }
  const reward = (st) => {
    const r = J.rewards[st - 1], g = {};
    for (const [k, v] of Object.entries(r)) if (k in S.res || k === 'journals') g[k] = v;
    const out = KH.scaleReward(g);
    for (const [k, v] of Object.entries(r)) if (!(k in S.res) && k !== 'journals') out[k] = v;
    return out;
  };

  // ======================================================================
  // Actions
  // ======================================================================
  ACT.journeys = () => {
    if (!unlocked()) return KH.toast(`Far Journeys open at Rainwyrm Lv ${J.unlock}.`, 'warn');
    refresh();
    UI.sheet = { kind: 'journeys' };
    UI.jSel = null;
  };
  ACT.jpick = (id) => {
    const j = S.journeys.board.find((x) => x.id === Number(id));
    if (!j) return;
    if (trips().length >= slots()) return KH.toast(`All ${slots()} of your parties are away.`, 'warn');
    UI.jSel = { id: j.id, party: bestParty(j) || [] };
  };
  ACT.jhero = (id) => {
    const sel = UI.jSel;
    if (!sel || !S.heroes[id] || KH.heroBusy(id)) return;
    const i = sel.party.indexOf(id);
    if (i >= 0) sel.party.splice(i, 1);
    else if (sel.party.length < 3) sel.party.push(id);
    else KH.toast('A party is three heroes at most.', 'warn');
  };
  ACT.jauto = () => {
    const sel = UI.jSel, j = sel && S.journeys.board.find((x) => x.id === sel.id);
    if (!j) return;
    const p = bestParty(j);
    if (!p) return KH.toast('No party of the heroes at home meets it right now.', 'warn');
    sel.party = p;
  };
  ACT.jback = () => { UI.jSel = null; };
  ACT.jsend = () => {
    const sel = UI.jSel, X = S.journeys, j = sel && X.board.find((x) => x.id === sel.id);
    if (!j) return;
    if (trips().length >= slots()) return KH.toast(`All ${slots()} of your parties are away.`, 'warn');
    if (sel.party.some((id) => KH.heroBusy(id))) return KH.toast('One of them is already away.', 'warn');
    if (!meets(j, sel.party)) return KH.toast('The party does not meet the journey yet.', 'warn');
    X.board = X.board.filter((x) => x !== j);
    X.trips.push({ id: j.id, st: j.st, place: j.place, what: j.what, party: sel.party.slice(), start: S.time, end: S.time + j.hours * 3600 });
    S.stats.journeys++;
    if (KH.duty) KH.duty('journey');
    KH.emit('journeyOut', { st: j.st });
    KH.sfx('build');
    KH.toast(`${sel.party.map((id) => HERO[id].name.split(' ')[0]).join(', ')} set out for ${j.place}. Home in ${fmtTime(j.hours * 3600)}.`, 'good');
    UI.jSel = null;
  };
  ACT.jreroll = () => {
    if (!unlocked()) return;
    if (S.starglass < J.reroll) return KH.toast(`A new board takes ${J.reroll} Starglass.`, 'warn');
    S.starglass -= J.reroll;
    refresh(true);
    UI.jSel = null;
    KH.sfx('coin');
  };

  KH.hooks.tick.push((dt, offline, log) => {
    if (!unlocked()) return;
    const X = S.journeys;
    if (!X.open) {
      X.open = true; refresh(true);
      KH.mail('Far Journeys', `Travellers bring word of places beyond the Dunes where a few heroes could do some good: lost camels, buried bells, a debt owed to the keep. The board in the keep lists the journeys on offer; each one needs a party of up to three heroes who meet its requirements together. Heroes away can't fight, but they come home with shards of their own. A new board comes every ${J.refresh / 3600} hours.`);
      return;
    }
    if (S.time >= X.refreshAt) refresh();
    for (const t of X.trips.slice()) {
      if (S.time < t.end) continue;
      X.trips = X.trips.filter((x) => x !== t);
      const g = reward(t.st);
      KH.grant(g);
      for (const id of t.party) if (S.heroes[id]) S.heroes[id].shards += J.shards[t.st - 1];
      S.stats.journeysHome++;
      if (t.st === 4) S.stats.journey4++;
      KH.emit('journeyHome', { st: t.st });
      const what = `${t.party.map((id) => HERO[id].name.split(' ')[0]).join(', ')} came home from ${t.place}.`;
      if (log) (log.marches = log.marches || []).push(what);
      else KH.toast(what, 'good');
    }
  });

  // ======================================================================
  // The board
  // ======================================================================
  const stars = (n) => `<span class="jr-stars">${'★'.repeat(n)}<i>${'★'.repeat(4 - n)}</i></span>`;
  const face = (id, cls = '') => `<span class="jr-face ${cls}">${KH.art.portrait(id)}</span>`;
  function pickView(j, sel) {
    const conds = j.conds.map((c) => `<span class="chip jr-cond ${COND[c.t](c, sel.party) ? 'met' : ''}">${icon(condIcon(c))}${esc(condText(c))}</span>`).join('');
    const ok = meets(j, sel.party), free = trips().length < slots(), sq = new Set(S.squad);
    const heroes = roster().filter((id) => !KH.heroBusy(id)).sort((a, b) => (sq.has(a) - sq.has(b)) || S.heroes[b].stars - S.heroes[a].stars || S.heroes[b].lvl - S.heroes[a].lvl).map((id) => {
      const h = S.heroes[id], on = sel.party.includes(id);
      return `<button class="jr-hero ${on ? 'on' : ''}" data-act="jhero" data-arg="${id}">${face(id)}<b>${esc(HERO[id].name.split(' ')[0])}</b><small>${icon(DATA.classes[HERO[id].cls].icon)}${'★'.repeat(h.stars)} · Lv ${h.lvl}${sq.has(id) ? ' · squad' : ''}</small></button>`;
    }).join('');
    return `<div class="card stack jr-card"><div class="row"><div class="grow"><b>${esc(j.place)}</b><div class="muted small">${esc(j.what)} · ${fmtTime(j.hours * 3600)}</div></div>${stars(j.st)}</div>
        <div class="row wrap jr-conds">${conds || '<span class="muted small">Any party will do.</span>'}</div>
        <div class="row jr-party">${sel.party.length ? sel.party.map((id) => face(id, 'big')).join('') : '<span class="muted small">Choose up to three heroes below.</span>'}</div>
        <div class="row" style="gap:8px"><button class="btn small alt" data-act="jback">Back</button><button class="btn small alt" data-act="jauto">Best party</button><span class="grow"></span><button class="btn ${ok && free ? 'gold' : 'off'}" data-act="jsend">Send</button></div></div>
      <div class="section-label">Heroes at home</div><div class="jr-grid">${heroes}</div>`;
  }
  KH.sheets.journeys = () => {
    refresh();
    const X = S.journeys, sel = UI.jSel, j = sel && X.board.find((x) => x.id === sel.id);
    const out = trips().map((t) => {
      const p = Math.min(1, (S.time - t.start) / (t.end - t.start));
      return `<div class="jr-trip"><div class="row">${t.party.map((id) => face(id)).join('')}<div class="grow"><b>${esc(t.place)}</b> ${stars(t.st)}<div class="muted small">home in ${fmtTime(t.end - S.time)}</div></div></div><div class="bar xp"><i style="width:${p * 100}%"></i></div></div>`;
    }).join('');
    const body = j ? pickView(j, sel) : `${KH.art && KH.art.banner ? KH.art.banner('event', 'journeys', 'Places beyond the Dunes where a few heroes could do some good.') : ''}
      <p class="muted small">Each journey takes a party of up to three heroes who meet its requirements together. Heroes away can't fight, and every one of them comes home with shards of their own.</p>
      ${out ? `<div class="card stack">${out}</div>` : ''}
      <div class="stack">${X.board.map((b) => `<div class="card stack jr-card"><div class="row"><div class="grow"><b>${esc(b.place)}</b><div class="muted small">${esc(b.what)} · ${fmtTime(b.hours * 3600)}</div></div>${stars(b.st)}</div>
        <div class="row wrap jr-conds">${b.conds.map((c) => `<span class="chip jr-cond">${icon(condIcon(c))}${esc(condText(c))}</span>`).join('') || '<span class="muted small">Any party will do.</span>'}</div>
        <div class="row"><div class="costs grow">${KH.rewardHTML(reward(b.st))}<span class="chip">${icon('i-star')}+${J.shards[b.st - 1]} shards each</span></div><button class="btn small ${trips().length < slots() ? 'gold' : 'off'}" data-act="jpick" data-arg="${b.id}">Choose party</button></div></div>`).join('') || '<p class="muted">Every journey on the board has been taken.</p>'}</div>
      <div class="card row"><div class="grow"><b>A new board in ${fmtTime(X.refreshAt - S.time)}</b><div class="muted small">${fmt(S.stats.journeysHome)} journeys home</div></div><button class="btn small ${S.starglass >= J.reroll ? 'alt' : 'off'}" data-act="jreroll">${icon('i-gem')}${J.reroll} · New board</button></div>`;
    return { title: 'Far Journeys', lvl: `${trips().length}/${slots()}`, body };
  };
  KH.side.push({ id: 'journeys', icon: 'i-journey', label: 'Journeys', act: 'journeys', show: unlocked, dot: () => trips().length < slots() && S.journeys.board.length > 0, badge: () => `${trips().length}/${slots()}` });
  KH.chips.push(() => {
    if (!S || !trips().length) return '';
    const t = trips().slice().sort((a, b) => a.end - b.end)[0];
    return `<button class="qchip" data-act="journeys">${icon('i-journey')}${esc(t.place.replace(/^the /, ''))} <time>${fmtTime(Math.max(0, t.end - S.time))}</time></button>`;
  });

  KH.journeys = { unlocked, slots, trips, away, meets, bestParty, refresh, reward, condText, board: () => (S ? S.journeys.board : []) };
})();
