/*
 * Rainkeep: Field Orders. From stage 20 Captain Hadi posts three orders a day, each a stage the keep has cleared
 * (a few to thirty behind the front) to fight again under a condition. Some conditions are set for the fight (the
 * Breath Art the wyrm must use, the formation's lead, no breath at all, only the two strongest heroes at home), so the
 * order asks whether the squad can win that way; others are a result to earn (within four rounds, or with 70% of the
 * squad's health), which the live battle can reach early. Each order pays Starglass and journals, all three a Beacon
 * Token, and a failed order can be tried again. The orders are seeded by the day, so they don't change on a reload;
 * the sheet sits in the Rewards hub.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { icon, esc, seeded } = KH.u;
  const { UI, ACT } = KH;
  const O = DATA.orders, K = O.kinds, AR = DATA.battle.arts;
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => { s.orders = { day: 0, list: [], all: false }; s.stats.ordersDone = 0; });

  const today = () => { const d = new Date(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 864e5); };
  const unlocked = () => !!S && S.stage > O.from;
  const top = () => Math.min(S.stage - 1, DATA.finalStage);
  // the day's three orders, drawn once a day from the stages behind the front and the conditions the keep can meet
  function list() {
    if (!S || !unlocked()) return [];
    if (S.orders.day === today() && S.orders.list.length) return S.orders.list;
    const rnd = seeded(today() * 7919 + 31), pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const arts = AR.order.filter((a) => KH.artOpen(a) && a !== 'torrent');
    const kinds = Object.keys(K).filter((k) => (k !== 'art' || arts.length) && (k !== 'lead' || S.lv.barracks) && (k !== 'nobreath' || !S.dormant));
    const bag = []; for (const k of kinds) for (let i = 0; i < K[k].w; i++) bag.push(k);
    const out = [], used = new Set();
    for (let i = 0; i < O.count; i++) {
      let kind = pick(bag);
      for (let t = 0; t < 10 && used.has(kind); t++) kind = pick(bag);
      used.add(kind);
      const n = Math.max(1, top() + 1 - O.back[0] - Math.floor(rnd() * (O.back[1] - O.back[0] + 1)));
      const arg = kind === 'art' ? pick(arts) : kind === 'lead' ? pick(['guard', 'bow', 'lancer']) : null;
      out.push({ n, kind, arg, done: false });
    }
    S.orders = { day: today(), list: out, all: false };
    return out;
  }
  const textOf = (o) => (o.kind === 'art' ? K.art.text(AR[o.arg].name) : o.kind === 'lead' ? K.lead.text(DATA.classes[o.arg].name.replace(/s$/, '')) : o.kind === 'swift' ? K.swift.text(K.swift.rounds) : o.kind === 'hale' ? K.hale.text(K.hale.share) : K[o.kind].text());
  const left = () => list().filter((o) => !o.done).length;
  // the two strongest heroes at home, for a duo order
  const duo = () => KH.squadHome().slice().sort((a, b) => KH.heroPower(b) - KH.heroPower(a)).slice(0, 2);

  ACT.orders = () => { if (!unlocked()) return KH.toast(`Field Orders begin after stage ${O.from}.`, 'warn'); UI.sheet = { kind: 'orders' }; };
  ACT.orderfight = (i) => {
    const L0 = list(), o = L0[+i];
    if (!o || o.done) return;
    if (!KH.squadHome().length) return KH.toast('Your squad is out on the Dunes. Wait for them to return.', 'warn');
    const foe = KH.enemyFor(o.n);
    // what the order sets for the fight: the art, the lead (put back afterwards), no breath, two heroes
    const lead0 = S.formation;
    if (o.kind === 'lead') S.formation = o.arg;
    const team = KH.teamStats(foe.cls, o.kind === 'duo' ? { heroes: duo() } : {});
    if (o.kind === 'lead') S.formation = lead0;
    const opts = { art: o.kind === 'art' ? o.arg : KH.artOf() };
    if (o.kind === 'nobreath') opts.noBreath = true;
    UI.sheet = null;
    KH.fightLive({
      title: `Field order · stage ${o.n}`, foe, team, opts,
      onEnd: (result) => {
        const met = result.win && (o.kind !== 'swift' || result.rounds.length <= K.swift.rounds) && (o.kind !== 'hale' || result.th / Math.max(1, team.hp) >= K.hale.share);
        KH.emit('battle', { kind: 'order', win: result.win, foe, heroes: team.heroes });
        if (!met) { KH.save(); return { noTips: result.win, extra: result.win ? `Won, but the order wanted: ${esc(textOf(o))}. Try again.` : '' }; }
        o.done = true; S.stats.ordersDone++;
        const g = KH.scaleReward(O.reward);
        // judged on the day's list the fight began with, even if midnight passed while it went on
        if (S.orders.list === L0 && !S.orders.all && L0.every((x) => x.done)) { S.orders.all = true; Object.assign(g, O.all); }
        KH.grant(g);
        KH.save();
        return { rewards: g, resultTitle: 'Order carried out', extra: g.beacons ? 'All three of today\'s orders: a Beacon Token from Captain Hadi.' : '' };
      },
    });
  };

  KH.sheets.orders = () => {
    const L = list(), g = KH.scaleReward(O.reward), home = KH.squadHome().length;
    const rows = L.map((o, i) => {
      const f = KH.enemyFor(o.n);
      return `<div class="row od-row ${o.done ? 'done' : ''}">${icon(o.done ? 'i-check' : 'i-scroll', 'od-ic')}<div class="grow"><b>${esc(textOf(o))}</b><div class="muted small">Stage ${o.n} · ${esc(f.name)}${f.traits.length ? ` · ${f.traits.map((t) => esc(DATA.traits.list[t].name)).join(', ')}` : ''}</div></div>
        ${o.done ? '<span class="chip">Done</span>' : `<button class="btn small ${home ? '' : 'off'}" data-act="orderfight" data-arg="${i}">Fight</button>`}</div>`;
    }).join('');
    const cast = DATA.cast && DATA.cast.hadi;
    return {
      title: 'Field Orders', lvl: `${L.length - left()}/${L.length}`,
      body: `<div class="card row od-hadi">${cast ? `<div class="od-face">${KH.art.portrait(cast)}</div>` : ''}<p class="grow small">"Three orders for today, warden. Win them the way I ask, not the easy way. The Dunes won't always let you choose."<br><span class="muted">Captain Hadi</span></p></div>
        <div class="card stack">${rows}</div>
        ${(() => { const f = L.find((x) => !x.done); return f ? `<div class="card stack od-setup"><div class="muted small">For the orders that leave it to you:</div>${KH.formationRow ? KH.formationRow(KH.enemyFor(f.n)) : ''}${KH.artRow ? KH.artRow(KH.enemyFor(f.n)) : ''}</div>` : ''; })()}
        <div class="row muted small"><span class="grow">Each order:</span><div class="costs">${KH.rewardHTML(g)}</div></div>
        <div class="row muted small"><span class="grow">All three today:</span><div class="costs">${KH.rewardHTML(O.all)}</div></div>
        <p class="muted small">New orders each day. A failed order can be fought again.</p>`,
    };
  };
  KH.side.push({ id: 'orders', icon: 'i-scroll', label: 'Orders', act: 'orders', show: unlocked, dot: () => left() > 0 && KH.squadHome().length > 0, badge: () => `${list().length - left()}/${list().length}` });
  KH.orders = { list, textOf, left, unlocked };
})();
