/*
 * Rainkeep: the Patron program. Lifetime spend (and a few points for each daily visit)
 * raises a Patron level with production and convenience perks: faster production,
 * building and smelting, free finishes on short timers, a longer offline bank, extra
 * Duel ticket slots and a daily chest. No combat stats, so Duels and Oasis Wars stay fair.
 * Perks reach the game through KH.bonus; the Store tab shows KH.patronCard.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { fmt, fmtTime, icon, esc, today } = KH.u;
  const { UI, ACT } = KH;
  const P = DATA.patron;
  let S = null;
  KH.hooks.boot.push(() => {
    S = KH.S;
    // saves from before the Patron program get credit for what they already spent
    if (!S.patron.seeded) { S.patron.pts += Math.round((S.spentUsd || 0) * P.perDollar); S.patron.seeded = true; }
  });
  KH.hooks.defaults.push((s) => { s.patron = { pts: 0, day: -1, chestDay: -1, seeded: false }; });

  const level = () => (S ? P.levels.filter((l) => S.patron.pts >= l.at).length : 0);
  const perks = (lv) => (lv ? P.levels[lv - 1] : {});
  KH.patronLevel = level;

  // every Patron perk is a bonus key: prod, build, freeFinish, offlineCap, tickets, smelt
  KH.hooks.bonus.push((k) => {
    const v = perks(level())[k];
    return typeof v === 'number' ? v : 0;
  });

  function addPoints(n, why) {
    const before = level();
    S.patron.pts += n;
    const after = level();
    if (after > before) {
      KH.toast(`Patron ${after}! ${perkList(after).slice(0, 2).join(', ')}${perkList(after).length > 2 ? ' and more' : ''}.`, 'good');
      KH.emit('patron', { level: after });
    } else if (why) KH.toast(why, '');
  }
  KH.on('purchase', (e) => { if (e.usd > 0) addPoints(Math.round(e.usd * P.perDollar)); });
  KH.hooks.tick.push((dt, offline) => {
    if (!S || offline || !dt || !S.seenIntro) return;
    if (S.patron.day !== today()) { S.patron.day = today(); addPoints(P.daily, `+${P.daily} Patron points for visiting today.`); }
  });

  ACT.patronchest = () => {
    const lv = level();
    if (!lv) return KH.toast(`Reach Patron 1 to open the daily Patron chest.`, 'warn');
    if (S.patron.chestDay === today()) return KH.toast('Already opened today. Back tomorrow.', 'warn');
    S.patron.chestDay = today();
    KH.grant(perks(lv).chest);
    KH.sfx('claim');
    KH.toast('Patron chest opened.', 'good');
  };
  ACT.patron = () => { UI.sheet = { kind: 'patron' }; };
  KH.patronDot = () => !!(S && level() && S.patron.chestDay !== today());

  function perkList(lv) {
    const p = perks(lv), out = [];
    if (p.prod) out.push(`+${Math.round(p.prod * 100)}% production`);
    if (p.build) out.push(`+${Math.round(p.build * 100)}% build and research speed`);
    if (p.freeFinish) out.push(`timers under ${fmtTime(p.freeFinish)} finish free`);
    if (p.offlineCap) out.push(`+${p.offlineCap / 3600} h offline bank`);
    if (p.smelt) out.push(`+${Math.round(p.smelt * 100)}% Sunsteel smelting`);
    if (p.tickets) out.push(`+${p.tickets} Duel ticket slot${p.tickets > 1 ? 's' : ''}`);
    return out;
  }
  const dollars = (pts) => `$${Math.max(1, Math.ceil(pts / P.perDollar))}`;

  KH.patronCard = () => {
    const lv = level(), next = P.levels[lv], pts = S.patron.pts;
    const from = lv ? P.levels[lv - 1].at : 0;
    const chest = lv ? (S.patron.chestDay === today() ? '<span class="muted small">Chest opened today</span>' : '<button class="btn small gold" data-act="patronchest">Open chest</button>') : '';
    return `<div class="card patron stack"><div class="row"><span class="patron-badge">${lv ? `P${lv}` : 'P0'}</span>
        <div class="grow"><b>${lv ? `Patron ${lv}` : 'Become a Patron'}</b><div class="muted small">${fmt(pts)} Patron points${next ? ` · ${fmt(next.at - pts)} to Patron ${lv + 1}` : ' · highest level'}</div></div>${chest}</div>
      ${next ? `<div class="bar xp"><i style="width:${Math.min(100, ((pts - from) / (next.at - from)) * 100)}%"></i></div>` : ''}
      <div class="row wrap">${(lv ? perkList(lv) : ['Every purchase and every daily visit earns Patron points']).map((t) => `<span class="chip small">${esc(t)}</span>`).join('')}</div>
      <div class="row"><span class="muted small grow">${P.perDollar} points per $1 spent, ${P.daily} for each day you visit. Perks never add combat strength.</span><button class="btn small alt" data-act="patron">All levels</button></div></div>`;
  };
  KH.sheets.patron = () => {
    const lv = level();
    const rows = P.levels.map((l, i) => `<div class="card patron-row ${i + 1 === lv ? 'on' : i + 1 < lv ? 'done' : ''}"><span class="patron-badge">P${i + 1}</span>
      <div class="grow"><b>${fmt(l.at)} points</b> <span class="muted small">(about ${dollars(l.at)})</span><div class="small">${perkList(i + 1).map(esc).join(' · ')}</div>
      <div class="costs" style="margin-top:4px">${KH.rewardHTML(l.chest)}</div></div></div>`).join('');
    return {
      title: 'Patron levels', lvl: lv ? `Patron ${lv}` : '',
      body: `<p class="muted small">Patron levels come from lifetime spend (${P.perDollar} points per $1) and from visiting: the first visit each day adds ${P.daily} points. Perks are production and convenience only, and each level includes a daily chest (shown under each level).</p><div class="stack">${rows}</div>`,
    };
  };
})();
