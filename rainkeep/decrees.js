/*
 * Rainkeep: Warden's Decrees. Orders the Warden gives the whole keep from Rainwyrm Lv 5: Harvest Rite (production),
 * Rush Order (cuts the timers under way), Call to Arms (attack), Open Roads (gathering), Feast of Rain (cures the
 * sick, faster healing) and Wyrm's Vigil (the Torrent). Each lasts a while or acts at once, then rests before it
 * can be given again, so the decision is when: a Harvest Rite before a long night away, a Call to Arms before a
 * rival raid or the Wadi Clash. A resting decree can be given again early for Starglass. Plugs in through
 * KH.hooks.bonus (the fx keys), KH.sheets, KH.side (pinned on the rail) and KH.chips.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { fmt, fmtTime, icon, esc } = KH.u;
  const { UI, ACT } = KH;
  const D = DATA.decrees, BY = Object.fromEntries(D.list.map((d) => [d.id, d]));
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => {
    s.decrees = { act: {}, cd: {} };
    s.stats.decrees = 0; s.stats.decreeMost = 0;
  });

  const unlocked = () => !!S && S.lv.wyrm >= D.unlock;
  const open = (d) => !!S && S.lv.wyrm >= d.lv;
  const active = (id) => !!S && (S.decrees.act[id] || 0) > S.time;
  const resting = (id) => (S ? Math.max(0, (S.decrees.cd[id] || 0) - S.time) : 0);
  const ready = (d) => open(d) && !active(d.id) && resting(d.id) <= 0;
  const reissueCost = (id) => Math.max(D.reissue.min, Math.ceil(resting(id) / 3600) * D.reissue.perHour);
  const inForce = () => (S ? D.list.filter((d) => active(d.id)) : []);
  const anyReady = () => unlocked() && D.list.some(ready);

  // while a decree is in force its fx count toward KH.bonus
  KH.hooks.bonus.push((k) => {
    if (!S || !S.decrees) return 0;
    let v = 0;
    for (const d of D.list) if (d.fx && d.fx[k] && active(d.id)) v += d.fx[k];
    return v;
  });

  // Rush Order: a share of the time left on every build, research and training, up to a cap each
  function rush(d) {
    let n = 0;
    const cut = (job) => {
      if (!job || job.end <= S.time) return;
      job.end -= Math.min(d.max, (job.end - S.time) * d.cut); n++;
    };
    for (const b of S.builds) cut(b);
    cut(S.research); cut(S.training);
    return n;
  }
  function give(d) {
    const X = S.decrees;
    if (d.dur) X.act[d.id] = S.time + d.dur;
    X.cd[d.id] = S.time + d.dur + d.cd; // it rests once it has run its course
    let note = '';
    if (d.cut) { const n = rush(d); note = n ? ` ${n} job${n === 1 ? '' : 's'} sped up.` : ''; }
    if (d.cure && S.sick) { note = ` ${S.sick} sick back on their feet.`; S.sick = 0; }
    S.stats.decrees++;
    S.stats.decreeMost = Math.max(S.stats.decreeMost || 0, inForce().length);
    if (KH.duty) KH.duty('decree');
    KH.emit('decree', { id: d.id });
    KH.sfx('chime');
    KH.toast(`${d.name}: ${d.line}${note}`, 'good');
  }
  ACT.decrees = () => {
    if (!unlocked()) return KH.toast(`The Warden gives decrees from Rainwyrm Lv ${D.unlock}.`, 'warn');
    UI.sheet = { kind: 'decrees' };
  };
  ACT.decree = (id) => {
    const d = BY[id];
    if (!d || !unlocked()) return;
    if (!open(d)) return KH.toast(`${d.name} opens at Rainwyrm Lv ${d.lv}.`, 'warn');
    if (active(d.id)) return KH.toast(`${d.name} is already in force.`, 'warn');
    if (resting(d.id) > 0) return KH.toast(`${d.name} can be given again in ${fmtTime(resting(d.id))}.`, 'warn');
    give(d);
  };
  // give a resting decree again early, for Starglass
  ACT.decreenow = (id) => {
    const d = BY[id];
    if (!d || !open(d) || active(d.id) || resting(d.id) <= 0) return;
    const c = reissueCost(id);
    if (S.starglass < c) return KH.toast(`Giving ${d.name} again now takes ${fmt(c)} Starglass.`, 'warn');
    S.starglass -= c;
    S.decrees.cd[id] = S.time;
    give(d);
  };

  // tell the player when one has run its course (not while away)
  KH.hooks.tick.push((dt, offline) => {
    if (!unlocked()) return;
    const X = S.decrees;
    for (const id in X.act) {
      if (X.act[id] <= S.time) {
        delete X.act[id];
        if (!offline && BY[id]) KH.toast(`${BY[id].name} has run its course.`);
      }
    }
  });

  KH.sheets.decrees = () => {
    const cards = D.list.map((d) => {
      const on = active(d.id), rest = resting(d.id), lock = !open(d);
      const state = lock ? `<span class="chip muted">${icon('i-lock')}Rainwyrm Lv ${d.lv}</span>`
        : on ? `<span class="chip dc-on">${icon('i-clock')}${fmtTime(S.decrees.act[d.id] - S.time)} left</span>`
          : rest > 0 ? `<span class="chip muted">${icon('i-clock')}Rests ${fmtTime(rest)}</span>` : '<span class="chip dc-ready">Ready</span>';
      const btn = lock ? '' : on ? '' : rest > 0
        ? `<button class="btn small alt" data-act="decreenow" data-arg="${d.id}">${icon('i-gem')}${fmt(reissueCost(d.id))}</button>`
        : `<button class="btn small gold" data-act="decree" data-arg="${d.id}">Give</button>`;
      const span = d.dur ? `${fmtTime(d.dur)}, then rests ${fmtTime(d.cd)}` : `At once, then rests ${fmtTime(d.cd)}`;
      return `<div class="card row dc-card ${on ? 'on' : ''} ${lock ? 'locked' : ''}">${icon(d.icon, 'dc-ic')}<div class="grow"><b>${esc(d.name)}</b>
        <div class="small">${esc(d.text)}</div><div class="muted small">${span}</div><div class="row dc-state">${state}</div></div>${btn}</div>`;
    }).join('');
    const n = inForce().length;
    return {
      title: "Warden's Decrees", lvl: n ? `${n} in force` : '',
      body: `<p class="muted small">Orders for the whole keep. Each one lasts a while, or acts at once, and then rests before you can give it again, so choose your moment: a Harvest Rite before a long time away, a Call to Arms before a battle. A resting decree can be given again early for Starglass.</p>
        <div class="stack">${cards}</div>`,
    };
  };
  KH.side.push({ id: 'decrees', pin: true, icon: 'i-decree', label: 'Decrees', act: 'decrees', show: unlocked, dot: anyReady, badge: () => { const n = inForce().length; return n ? `${n}` : ''; } });
  KH.chips.push(() => {
    const on = inForce();
    if (!on.length) return '';
    const d = on.slice().sort((a, b) => S.decrees.act[a.id] - S.decrees.act[b.id])[0];
    return `<button class="qchip dc" data-act="decrees">${icon(d.icon)}${on.length > 1 ? `${on.length} decrees` : esc(d.name)} <time>${fmtTime(S.decrees.act[d.id] - S.time)}</time></button>`;
  });

  KH.decrees = { unlocked, open, active, resting, ready, reissueCost, inForce, list: D.list };
})();
