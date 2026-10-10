/*
 * Rainkeep: Hero Kinships. Pairs of heroes whose stories are tied (the Glasshands, the Wyrm-Singers, the Keep
 * Kitchen...). A kinship forms once both are recruited and works whenever both are in the squad that fights: one
 * bonus for the whole squad, bigger for humbler pairs and growing with the stars between them. Applied in teamStats
 * (core.js asks KH.kinTeam), so it counts in every fight a squad makes; shown on the roster, the hero sheet and its
 * own sheet.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { icon, esc } = KH.u;
  const { UI, ACT } = KH;
  const K = DATA.kinships, HERO = Object.fromEntries(DATA.heroes.map((h) => [h.id, h]));
  const OF = {};
  for (const p of K.pairs) for (const id of p.heroes) OF[id] = p;
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => { s.stats.kinFought = 0; s.stats.kinTop = 0; });

  const formed = (p) => !!S && p.heroes.every((id) => S.heroes[id]);
  const stars = (p) => p.heroes.reduce((a, id) => a + (S.heroes[id] ? S.heroes[id].stars : 0), 0);
  const level = (p) => (formed(p) ? 1 + K.levelAt.filter((n) => stars(p) >= n).length : 0);
  const fxOf = (p, L = level(p)) => Object.fromEntries(Object.entries(p.fx).map(([k, v]) => [k, L ? v * (1 + K.grow * (L - 1)) : 0]));
  const activeIn = (heroes) => K.pairs.filter((p) => formed(p) && p.heroes.every((id) => heroes.includes(id)));
  // the squad-wide bonus of every kinship whose heroes are all in this squad
  KH.kinTeam = (heroes) => {
    const out = { atk: 0, def: 0, hp: 0, torrent: 0, dr: 0 };
    if (!S) return out;
    for (const p of activeIn(heroes)) for (const [k, v] of Object.entries(fxOf(p))) out[k] += v;
    return out;
  };
  const NAMES = { atk: 'attack', def: 'defense', hp: 'health', torrent: 'the Torrent', dr: 'damage taken' };
  const fxText = (fx) => Object.entries(fx).map(([k, v]) => (k === 'dr' ? `${NAMES[k]} −${Math.round(v * 100)}%` : `${NAMES[k]} +${Math.round(v * 100)}%`)).join(', ');
  const first = (id) => esc(HERO[id].name.split(' ')[0]);

  // a squad fight with a kinship at work counts toward the achievement (not marches, raids or the gate)
  const SQUAD_FIGHTS = new Set(['stage', 'replay', 'heroic', 'order', 'crossing', 'leviathan', 'tale', 'duel', 'spire']);
  KH.on('battle', (e) => { if (S && e && SQUAD_FIGHTS.has(e.kind) && activeIn(S.squad).length) S.stats.kinFought++; });
  KH.hooks.tick.push(() => { if (S) S.stats.kinTop = Math.max(S.stats.kinTop || 0, ...K.pairs.map(level)); });

  const pairRow = (p) => {
    const L = level(p), on = activeIn(S.squad).includes(p), next = K.levelAt.find((n) => stars(p) < n);
    const faces = p.heroes.map((id) => `<button class="kin-face ${S.heroes[id] ? '' : 'missing'} ${S.squad.includes(id) ? 'sq' : ''}" data-act="hero" data-arg="${id}">${KH.art.portrait(id)}<small>${first(id)}</small></button>`).join('<span class="kin-link">' + icon('i-heart') + '</span>');
    const state = on ? '<span class="chip kin-on">In the squad</span>' : L ? '<span class="chip">Formed</span>' : `<span class="chip muted">Recruit ${p.heroes.filter((id) => !S.heroes[id]).map(first).join(' and ')}</span>`;
    return `<div class="card kin-card ${on ? 'on' : ''} ${L ? '' : 'off'}"><div class="row kin-faces">${faces}</div>
      <div class="row"><b class="grow">${esc(p.name)}${L ? ` <span class="muted small">Lv ${L}</span>` : ''}</b>${state}</div>
      <div class="small">${fxText(fxOf(p, Math.max(1, L)))} for the squad${L && L < 5 ? ` · Lv ${L + 1} at ${next} stars between them` : ''}</div>
      <div class="muted small">${esc(p.text)}</div></div>`;
  };
  ACT.kinships = () => { UI.sheet = { kind: 'kinships' }; };
  KH.sheets.kinships = () => {
    const nForm = K.pairs.filter(formed).length, on = activeIn(S.squad);
    return {
      title: 'Hero Kinships', lvl: `${nForm}/${K.pairs.length}`,
      body: `<p class="muted small">Heroes whose stories are tied fight better together. A kinship works whenever both heroes are in the squad, and grows with the stars between them. No hero belongs to two.</p>
        ${on.length ? '' : '<p class="notice">No kinship is at work in your squad.</p>'}
        <div class="stack">${K.pairs.slice().sort((a, b) => (activeIn(S.squad).includes(b) - activeIn(S.squad).includes(a)) || (level(b) - level(a))).map(pairRow).join('')}</div>`,
    };
  };
  // the roster: a line for the squad's kinship (or the nearest one to forming)
  const prevRoster = KH.rosterExtras;
  KH.rosterExtras = () => {
    const on = activeIn(S.squad), nForm = K.pairs.filter(formed).length;
    const line = on.length ? `${icon('i-heart')}<b>${esc(on[0].name)}</b> at work: ${fxText(fxOf(on[0]))}`
      : `${icon('i-heart')}${nForm ? `${nForm} kinship${nForm > 1 ? 's' : ''} formed, none in the squad` : 'Recruit both heroes of a pair to form a kinship'}`;
    return (prevRoster ? prevRoster() : '') + `<button class="card row kin-strip ${on.length ? 'on' : ''}" data-act="kinships"><span class="grow small">${line}</span><span class="chip">${nForm}/${K.pairs.length}</span></button>`;
  };
  // the hero sheet: the hero's kinship and its partner
  KH.heroKin = (id) => {
    const p = OF[id];
    if (!p) return '';
    const mate = p.heroes.find((x) => x !== id), L = level(p), on = activeIn(S.squad).includes(p);
    return `<button class="card kin-hero ${on ? 'on' : ''}" data-act="kinships"><div class="row"><b class="grow">${icon('i-heart')}${esc(p.name)}${L ? ` · Lv ${L}` : ''}</b>${on ? '<span class="chip kin-on">At work</span>' : ''}</div>
      <div class="small">With ${first(mate)}: ${fxText(fxOf(p, Math.max(1, L)))} for the squad${on ? '' : S.heroes[mate] ? `, when both are in the squad` : `, once ${first(mate)} is recruited`}.</div></button>`;
  };
  KH.kinships = { formed, level, stars, activeIn, fxOf, of: (id) => OF[id], pairs: K.pairs };
})();
