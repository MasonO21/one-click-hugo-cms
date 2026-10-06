/*
 * Rainkeep: the Rainwyrm's bond. Every few minutes the wyrm wants something: to feel the rain,
 * a handful of dates, a story from the Dunes, a splash in the channels. Granting a wish adds bond
 * points and a small gift; each bond level adds a lasting perk (more water, cooler air, a quicker
 * rain, stronger breath). Wishes you miss simply fade. A thought bubble over the spring shows the
 * current wish; the card sits at the top of the Rainwyrm's sheet.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { clamp, fmt, fmtTime, icon, esc, rand } = KH.u;
  const { UI, ACT } = KH;
  const B = DATA.bond;
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => {
    s.bond = { pts: 0, wish: null, next: 240, last: '', granted: 0, missed: 0 };
    s.stats.bond = 1;
  });

  const level = () => (S ? B.levels.filter((p) => S.bond.pts >= p).length : 1);
  const unlocked = () => !!S && S.lv.wyrm >= B.unlock;
  const name = () => esc(S.wyrm.name);
  const fill = (t) => t.replace(/\{n\}/g, S.wyrm.name);
  const def = (id) => B.wishes.find((w) => w.id === id);
  KH.bondLevel = level;

  // perks for every bond level reached
  KH.hooks.bonus.push((k) => {
    if (!S || !S.bond) return 0;
    let v = 0;
    const L = level();
    for (let i = 1; i < L; i++) { const p = B.perks[i]; if (p && p.key === k) v += p.val; }
    return v;
  });

  // ======================================================================
  // Wishes
  // ======================================================================
  function roll() {
    const pool = B.wishes.filter((w) => w.id !== S.bond.last && (!w.needs || w.needs(S)));
    // the dates wish only when there is food to spare
    const ok = pool.filter((w) => !w.feed || KH.canAfford(KH.scaleReward(w.feed)));
    const w = ok[Math.floor(Math.random() * ok.length)];
    if (!w) return;
    S.bond.wish = { id: w.id, got: 0, need: w.need, until: S.time + B.lasts };
    S.bond.last = w.id;
    KH.toast(`${fill(w.text)} (${fill(w.how)})`, '', 'wish', 3);
  }
  function grant() {
    const w = S.bond.wish, d = def(w.id);
    const before = level();
    const x = 1 + KH.bonus('wishx');
    S.bond.pts += d.pts;
    const g = KH.scaleReward({ journals: B.reward.journals * x });
    g.starglass = 5 * x;
    KH.grant(g);
    S.bond.wish = null;
    S.bond.granted++;
    S.bond.next = S.time + rand(B.every[0], B.every[1]);
    const after = level();
    S.stats.bond = after;
    UI.petT = performance.now();
    KH.sfx('claim');
    if (after > before) {
      const p = B.perks[after - 1];
      KH.toast(`Bond Lv ${after} with ${S.wyrm.name}!${p ? ` ${p.text}.` : ''}`, 'good');
      KH.emit('bond', { level: after });
    } else KH.toast(`${S.wyrm.name} is delighted. +${d.pts} bond.`, 'good');
    KH.emit('wish', { id: d.id });
  }
  function progress(n = 1) {
    const w = S.bond.wish;
    if (!w) return;
    w.got = Math.min(w.need, w.got + n);
    if (w.got >= w.need) grant();
  }
  // wishes granted by things you already do
  const evs = new Set(B.wishes.filter((w) => w.ev).map((w) => w.ev));
  for (const ev of evs) {
    KH.on(ev, (e) => {
      if (!S || !S.bond || !S.bond.wish) return;
      const d = def(S.bond.wish.id);
      if (!d || d.ev !== ev) return;
      if (d.win && e && e.win === false) return;
      if (e && e.offline) return;
      progress(1);
    });
  }
  KH.hooks.tick.push((dt, offline) => {
    if (!S || !S.bond || !unlocked()) return;
    const w = S.bond.wish;
    if (w) {
      if (S.time >= w.until) { S.bond.wish = null; S.bond.missed++; S.bond.next = S.time + rand(B.every[0], B.every[1]) / 2; return; }
      const d = def(w.id);
      if (d && d.mist && !offline && S.mist === d.mist && !S.dormant) progress(dt);
    } else if (!offline && S.seenIntro && S.time >= S.bond.next && !UI.sheet) roll();
  });
  ACT.bondfeed = () => {
    const w = S.bond.wish, d = w && def(w.id);
    if (!d || !d.feed) return;
    const cost = KH.scaleReward(d.feed);
    if (!KH.canAfford(cost)) return KH.toast('Not enough food in the stores.', 'warn');
    KH.pay(cost);
    progress(w.need);
  };
  KH.bondWish = () => (S && S.bond && unlocked() ? S.bond.wish : null);
  KH.bondTap = () => ACT.plot('wyrm');

  // ======================================================================
  // The card at the top of the Rainwyrm's sheet
  // ======================================================================
  KH.wyrmTop = () => {
    if (!unlocked()) return `<p class="muted small">At Lv ${B.unlock} ${name()} starts to ask you for things. Grant its wishes to grow your bond.</p>`;
    const L = level(), from = B.levels[L - 1], to = B.levels[L];
    const w = S.bond.wish, d = w && def(w.id);
    let wish;
    if (d) {
      let btn = '';
      if (d.feed) { const c = KH.scaleReward(d.feed); btn = `<button class="btn small gold" data-act="bondfeed">Feed ${KH.costHTML ? KH.costHTML(c) : fmt(c.food)}</button>`; }
      else if (d.act) btn = `<button class="btn small" data-act="${d.act}" data-arg="${d.arg || ''}">${esc(d.label || 'Go')}</button>`;
      else if (d.go) btn = `<button class="btn small" data-act="go" data-arg="${d.go}">${esc(d.label || 'Go')}</button>`;
      const prog = d.mist ? `${Math.floor(w.got)}/${w.need}s` : `${w.got}/${w.need}`;
      wish = `<div class="bond-wish"><div class="row"><span class="bond-bubble">${icon('i-heart')}</span><div class="grow"><b>${esc(fill(d.text))}</b><div class="muted small">${esc(fill(d.how))} · ${prog} · fades in ${fmtTime(w.until - S.time)}</div></div></div>${btn ? `<div class="row" style="justify-content:flex-end">${btn}</div>` : ''}</div>`;
    } else wish = `<p class="muted small">${name()} is content. Another wish comes ${S.time >= S.bond.next ? 'any moment' : `in about ${fmtTime(S.bond.next - S.time)}`}.</p>`;
    const perks = B.perks.map((p, i) => (p ? `<span class="chip small ${i < L ? 'on' : 'off'}">Lv ${i + 1}: ${esc(p.text)}</span>` : '')).join('');
    return `<div class="card bond stack"><div class="row"><span class="bond-badge">${icon('i-heart')}<b>${L}</b></span><div class="grow"><b>Bond Lv ${L}</b><div class="muted small">${to ? `${fmt(S.bond.pts - from)}/${fmt(to - from)} to Lv ${L + 1}` : 'The deepest bond'} · ${fmt(S.bond.granted)} wishes granted</div></div></div>
      ${to ? `<div class="bar xp"><i style="width:${clamp(((S.bond.pts - from) / (to - from)) * 100, 0, 100)}%"></i></div>` : ''}
      ${wish}
      <details class="bond-perks"><summary class="muted small">Bond perks</summary><div class="row wrap">${perks}</div></details></div>`;
  };
})();
