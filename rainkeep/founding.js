/*
 * Rainkeep: the Founding Week. A young keep's first seven days: five missions open each day (upgrades, the
 * expedition, recruits, troops, the Dunes, the Rainwyrm's level), each worth points once collected, with chests
 * along the points track and a Legendary hero of the player's choosing at the end. A day opens each real day since
 * the week began or after each 24 hours of keep time, whichever comes first; the week stays open two days past the
 * seventh, then any chests earned and not opened come by mail. Only keeps no further than Rainwyrm Lv 6 when it
 * would open get it, so an old save is never handed a week of missions already done.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { fmt, fmtTime, icon, esc, clamp } = KH.u;
  const { UI, ACT } = KH;
  const F = DATA.founding, ALL = F.missions.flatMap((day, d) => day.map((m) => ({ ...m, day: d + 1 })));
  const BY = Object.fromEntries(ALL.map((m) => [m.id, m]));
  const MAX = ALL.length * F.pts;
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => { s.founding = { state: 'none', start: 0, startReal: 0, base: {}, got: [], chests: [] }; });

  const W = () => S && S.founding;
  const active = () => !!W() && W().state === 'open';
  const dayNow = () => {
    const w = W();
    if (!w || w.state === 'none') return 0;
    const real = Math.floor((Date.now() - w.startReal) / 864e5), keep = Math.floor((S.time - w.start) / 86400);
    return 1 + Math.max(0, real, keep);
  };
  const endsIn = () => { const w = W(); return Math.max(0, (F.days + F.grace) * 86400 - Math.max(S.time - w.start, (Date.now() - w.startReal) / 1000)); };
  const progress = (m) => {
    if (m.stage) return clamp(S.stage - 1, 0, m.stage);
    if (m.wyrm) return Math.min(S.lv.wyrm, m.wyrm);
    return clamp((S.stats[m.stat] || 0) - (W().base[m.stat] || 0), 0, m.n);
  };
  const goal = (m) => m.stage || m.wyrm || m.n;
  const open = (m) => dayNow() >= m.day;
  const ready = (m) => open(m) && !W().got.includes(m.id) && progress(m) >= goal(m);
  const points = () => W().got.length * F.pts;
  const chestReady = (i) => points() >= F.chests[i][0] && !W().chests.includes(i);
  const anyReady = () => active() && (ALL.some(ready) || F.chests.some((c, i) => chestReady(i)));

  KH.hooks.tick.push(() => {
    const w = W();
    if (!w) return;
    if (w.state === 'none') {
      if (S.lv.wyrm < F.unlock) return;
      if (S.lv.wyrm > F.youngUntil) { w.state = 'skipped'; return; }
      Object.assign(w, { state: 'open', start: S.time, startReal: Date.now(), base: { ...S.stats }, got: [], chests: [] });
      KH.mail('The Founding Week', `Every keep's first week decides what it becomes. Five missions open each day for seven days: collect each one for points, open the chests along the way, and at ${fmt(MAX)} points choose any Legendary hero to join you.`, null);
      KH.emit('foundingOpen', {});
      return;
    }
    if (w.state === 'open' && dayNow() > F.days + F.grace) {
      w.state = 'ended';
      const left = {};
      F.chests.forEach(([need, g], i) => { if (points() >= need && !w.chests.includes(i)) for (const [k, v] of Object.entries(KH.scaleReward(g))) left[k] = (left[k] || 0) + v; });
      KH.mail('The Founding Week is over', Object.keys(left).length ? 'The week has ended. Here are the chests you earned and did not open.' : 'The week has ended. The keep stands on what you built in it.', Object.keys(left).length ? left : null);
    }
  });

  ACT.founding = () => {
    if (!W() || W().state === 'none' || W().state === 'skipped') return KH.toast(`The Founding Week opens at Rainwyrm Lv ${F.unlock}.`, 'warn');
    UI.sheet = { kind: 'founding' };
    if (!UI.fwDay) UI.fwDay = clamp(dayNow(), 1, F.days);
  };
  ACT.fwday = (d) => { UI.fwDay = clamp(+d, 1, F.days); };
  ACT.fwclaim = (id) => {
    if (!active() || (id !== 'all' && !BY[id])) return;
    const ids = id === 'all' ? ALL.filter(ready).map((x) => x.id) : ready(BY[id]) ? [id] : [];
    if (!ids.length) return;
    W().got.push(...ids);
    KH.sfx('claim');
    KH.toast(`+${ids.length * F.pts} Founding points.`, 'good');
    KH.emit('foundingPts', { n: points() });
  };
  ACT.fwchest = (i) => {
    i = +i;
    if (!active() || !chestReady(i)) return;
    W().chests.push(i);
    const g = KH.scaleReward(F.chests[i][1]);
    KH.grant(g);
    KH.sfx(i === F.chests.length - 1 ? 'legendary' : 'claim');
    KH.toast(i === F.chests.length - 1 ? 'The Founding Week is won! Open the Legendary Shard Pouch in your bag to choose your hero.' : 'Founding chest opened.', 'good');
  };

  KH.sheets.founding = () => {
    const w = W(), d = dayNow(), sel = UI.fwDay || clamp(d, 1, F.days), pts = points();
    const tabs = F.missions.map((day, k) => {
      const n = k + 1, locked = n > d, dot = !locked && day.some((m) => ready({ ...m, day: n }));
      return `<button class="fw-tab ${n === sel ? 'on' : ''} ${locked ? 'locked' : ''}" data-act="fwday" data-arg="${n}">${locked ? icon('i-lock') : ''}Day ${n}${dot ? '<i class="dot"></i>' : ''}</button>`;
    }).join('');
    const opensIn = (n) => {
      const keepLeft = (n - 1) * 86400 - (S.time - w.start), realLeft = ((n - 1) * 864e5 - (Date.now() - w.startReal)) / 1000;
      return Math.max(0, Math.min(keepLeft, realLeft));
    };
    const list = F.missions[sel - 1].map((m0) => {
      const m = BY[m0.id], got = w.got.includes(m.id), p = progress(m), g = goal(m), r = ready(m);
      return `<div class="row fw-mission ${got ? 'got' : ''}"><div class="grow"><div>${esc(m.text)}</div>
        <div class="bar"><i style="width:${Math.round((100 * p) / g)}%"></i></div><div class="muted small">${fmt(p)} / ${fmt(g)}</div></div>
        ${got ? `<span class="chip">${icon('i-check')}Done</span>` : `<button class="btn small ${r ? 'gold' : 'off'}" data-act="fwclaim" data-arg="${m.id}">+${F.pts}</button>`}</div>`;
    }).join('');
    const chests = F.chests.map(([need, g], i) => {
      const done = w.chests.includes(i), can = chestReady(i), last = i === F.chests.length - 1;
      return `<button class="fw-chest ${done ? 'done' : ''} ${can ? 'ready' : ''} ${last ? 'final' : ''}" style="left:${(100 * need) / MAX}%" data-act="fwchest" data-arg="${i}" aria-label="${need} points">${icon(last ? 'i-star' : 'i-chest')}<small>${need}</small></button>`;
    }).join('');
    const nReady = ALL.filter(ready).length;
    return {
      title: 'The Founding Week', lvl: w.state === 'open' ? `Day ${Math.min(d, F.days)}` : 'Ended',
      body: `${KH.art && KH.art.banner ? KH.art.banner('event', 'founding', 'Seven days to found a keep that lasts.') : ''}
        <div class="card stack"><div class="row"><b class="grow">${fmt(pts)} / ${fmt(MAX)} points</b>${w.state === 'open' ? `<span class="chip">${icon('i-clock')}${fmtTime(endsIn())}</span>` : ''}</div>
          <div class="fw-track"><div class="bar"><i style="width:${Math.round((100 * pts) / MAX)}%"></i></div>${chests}</div>
          <p class="muted small">At ${fmt(MAX)} points: a Legendary Shard Pouch. Choose any Legendary hero to join the keep.</p></div>
        <div class="fw-tabs">${tabs}</div>
        ${sel > d ? `<div class="card"><p class="muted">Day ${sel}'s missions open in ${fmtTime(opensIn(sel))}.</p></div>`
          : `<div class="card stack">${list}${nReady > 1 ? `<button class="btn gold" data-act="fwclaim" data-arg="all">Collect all (${nReady})</button>` : ''}</div>`}`,
    };
  };
  KH.side.push({ id: 'founding', icon: 'i-fw', label: 'Founding', act: 'founding', pin: true, show: active, dot: anyReady, badge: () => `Day ${Math.min(dayNow(), F.days)}` });

  KH.founding = { active, dayNow, progress, ready, points, missions: ALL, max: MAX, chestReady };
})();
