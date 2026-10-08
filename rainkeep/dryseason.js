/*
 * Rainkeep: the Dry Season. From Rainwyrm Lv 6 a drought comes every three days of keep time and lasts twelve
 * hours, sighted two hours ahead: the wells give less, the keep drinks more and the air is hotter. The Warden
 * answers it with one edict: ration the water (everyone drinks less, the work slows), dig a deep cistern (stone
 * and copper; the wells hold up, and every cistern adds a little water for good) or keep the rain watch (Call the
 * Rain comes back sooner and lasts longer, but the Torrent tires). When it ends the keep is graded on thirst and
 * sickness, and a chest pays by the grade. The season and the edicts work through KH.hooks.bonus (water output,
 * drinking, heat, production, the rain, the Torrent).
 */
'use strict';
(function () {
  const KH = window.KH;
  const { fmtTime, icon, esc } = KH.u;
  const { UI, ACT } = KH;
  const D = DATA.dry, ED = Object.fromEntries(D.edicts.map((e) => [e.id, e]));
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => {
    s.dry = { open: false, next: 0, start: 0, end: 0, active: false, warned: false, edict: null, cisterns: 0, thirst: 0, sick0: 0, last: null };
    s.stats.drySeasons = 0; s.stats.dryA = 0; s.stats.cisterns = 0;
  });
  const unlocked = () => !!S && S.lv.wyrm >= D.unlock;
  const X = () => S.dry;
  const active = () => !!S && !!S.dry && S.dry.active;
  const warning = () => !!S && !!S.dry && !S.dry.active && S.dry.open && S.time >= S.dry.next - D.warn;
  const lasting = () => Math.min(ED.dig.max, S.dry.cisterns || 0) * ED.dig.keep; // the cisterns' water, for good

  KH.hooks.bonus.push((k) => {
    if (!S || !S.dry) return 0;
    let v = k === 'mult_water' ? lasting() : 0;
    if (S.dry.active) {
      v += D.fx[k] || 0;
      if (S.dry.edict) v += ED[S.dry.edict].fx[k] || 0;
    }
    return v;
  });

  const gradeOf = (thirstMin, sickShare) => D.grades.find((g) => thirstMin <= g.thirst && sickShare <= g.sick) || D.grades[D.grades.length - 1];
  function begin(offline) {
    const x = X();
    x.active = true; x.start = x.next; x.end = x.next + D.length; x.thirst = 0; x.sick0 = S.stats.sickTotal || 0; x.pop0 = Math.max(1, S.pop);
    KH.emit('dryStart', {});
    if (!offline) {
      KH.toast('The Dry Season has come. The wells sink and the air burns. Choose an edict.', 'warn', 'dry', 5);
      if (!x.edict && KH.queueSheet) KH.queueSheet({ kind: 'dry' });
    }
  }
  function finish(offline, log) {
    const x = X(), thirstMin = x.thirst / 60, sick = Math.max(0, (S.stats.sickTotal || 0) - x.sick0), share = sick / x.pop0;
    const g = gradeOf(thirstMin, share), chest = {};
    for (const [k, v] of Object.entries(g.chest)) if (k in S.res || k === 'journals') chest[k] = v;
    const out = KH.scaleReward(chest);
    for (const [k, v] of Object.entries(g.chest)) if (!(k in S.res) && k !== 'journals') out[k] = v;
    S.stats.drySeasons++;
    if (g.g === 'A') S.stats.dryA++;
    x.last = { grade: g.g, thirst: Math.round(thirstMin), sick, edict: x.edict, at: S.time };
    x.active = false; x.warned = false; x.edict = null;
    x.next = x.start + D.every;
    while (x.next <= S.time) x.next += D.every;
    KH.mail(`The Dry Season is over: grade ${g.g}`, `The rains are back in the wells. ${thirstMin < 1 ? 'The keep never went thirsty' : `The keep went thirsty for ${Math.round(thirstMin)} minutes`}${sick ? `, and ${sick} fell sick` : ', and no one fell sick'}. The Warden's chest for the season:`, out);
    KH.emit('dryEnd', { grade: g.g });
    const what = `The Dry Season is over: grade ${g.g}.`;
    if (log) (log.marches = log.marches || []).push(what);
    else KH.toast(what, g.g === 'A' ? 'good' : '');
  }
  KH.hooks.tick.push((dt, offline, log) => {
    if (!unlocked()) return;
    const x = X();
    if (!x.open) {
      x.open = true; x.next = S.time + D.first;
      KH.mail('The Dry Season', `The elders say a dry season comes every ${D.every / 86400} days now, and lasts half a day: the wells sink, the keep drinks more and the air burns. The watchtower will see it coming ${D.warn / 3600} hours ahead. When it comes, give one edict: ration the water, dig a deep cistern, or keep the rain watch. When it ends the keep is judged on how thirsty and sick its people were, and the Warden's chest pays by the grade.`);
      return;
    }
    if (!x.active) {
      if (!x.warned && S.time >= x.next - D.warn) {
        x.warned = true;
        if (!offline) KH.toast(`The watchtower sees a Dry Season coming, in ${fmtTime(x.next - S.time)}.`, 'warn', 'dry', 5);
      }
      if (S.time >= x.next) begin(offline);
    } else {
      if (S.thirsty) x.thirst += dt;
      if (S.time >= x.end) finish(offline, log);
    }
  });

  ACT.dry = () => {
    if (!unlocked()) return KH.toast(`Dry Seasons come from Rainwyrm Lv ${D.unlock}.`, 'warn');
    UI.sheet = { kind: 'dry' };
  };
  // one edict a season, given when it is sighted or once it has come
  ACT.dryedict = (id) => {
    const e = ED[id], x = X();
    if (!e || !unlocked()) return;
    if (!active() && !warning()) return KH.toast('No Dry Season in sight.', 'warn');
    if (x.edict) return KH.toast(`You have given your edict for this season: ${ED[x.edict].name}.`, 'warn');
    if (e.cost) {
      const c = KH.scaleReward(e.cost);
      if (!KH.canAfford(c)) return KH.toast('Not enough stone and copper to dig a cistern.', 'warn');
      KH.pay(c);
      x.cisterns = (x.cisterns || 0) + 1; S.stats.cisterns++;
    }
    x.edict = id;
    KH.emit('dryEdict', { id });
    KH.sfx('claim');
    KH.toast(`${e.name}. The keep will hold.`, 'good');
  };

  KH.sheets.dry = () => {
    const x = X(), on = active(), soon = warning();
    const status = on ? `<div class="card row dry-now">${icon('i-dry', 'dry-ic')}<div class="grow"><b>The Dry Season</b><div class="muted small">${fmtTime(x.end - S.time)} left${x.thirst > 0 ? ` · thirsty ${Math.round(x.thirst / 60)} min so far` : ' · no thirst so far'}</div></div></div>`
      : `<div class="card row">${icon('i-dry', 'dry-ic')}<div class="grow"><b>${soon ? 'A Dry Season is coming' : 'The next Dry Season'}</b><div class="muted small">in ${fmtTime(Math.max(0, x.next - S.time))}${soon ? ': the watchtower has sighted it' : ''}</div></div></div>`;
    const fx = `<div class="row wrap dry-fx"><span class="chip r-legendary">${icon('i-water')}Wells -${Math.round(-D.fx.mult_water * 100)}%</span><span class="chip r-legendary">${icon('i-people')}Drinking +${Math.round(-D.fx.drinkCut * 100)}%</span><span class="chip r-legendary">${icon('i-temp')}+${-D.fx.cool}°C</span></div>`;
    const can = on || soon;
    const cards = D.edicts.map((e) => {
      const chosen = x.edict === e.id, other = x.edict && !chosen, c = e.cost ? KH.scaleReward(e.cost) : null;
      const btn = chosen ? '<span class="chip dc-on">Given</span>' : other || !can ? '' : `<button class="btn small ${c && !KH.canAfford(c) ? 'off' : 'gold'}" data-act="dryedict" data-arg="${e.id}">Give</button>`;
      return `<div class="card row dc-card ${chosen ? 'on' : ''} ${other ? 'locked' : ''}">${icon(e.icon, 'dc-ic')}<div class="grow"><b>${esc(e.name)}</b><div class="small">${esc(e.text)}</div>${c ? `<div class="costs small">${KH.costHTML(c)}</div>` : ''}</div>${btn}</div>`;
    }).join('');
    const grades = D.grades.map((g) => `<div class="row small dry-grade"><b class="dry-g g-${g.g}">${g.g}</b><span class="grow muted">${g.g === 'A' ? 'Never thirsty, few sick' : g.g === 'B' ? `Thirsty under ${g.thirst} minutes, under a tenth sick` : 'Anything worse'}</span><div class="costs">${KH.rewardHTML(KH.scaleReward(Object.fromEntries(Object.entries(g.chest).filter(([k]) => k in S.res || k === 'journals'))))}${KH.rewardHTML(Object.fromEntries(Object.entries(g.chest).filter(([k]) => !(k in S.res) && k !== 'journals')))}</div></div>`).join('');
    const L = x.last;
    return {
      title: 'The Dry Season', lvl: on ? 'Now' : soon ? 'Sighted' : '',
      body: `${KH.art && KH.art.banner ? KH.art.banner('event', 'dry', 'Every three days the wells sink and the air burns.') : ''}${status}${fx}
        <div class="section-label">${on || soon ? 'Your edict for this season' : 'Edicts (one a season, once it is sighted)'}</div><div class="stack">${cards}</div>
        <div class="muted small">${x.cisterns ? `${x.cisterns} deep cistern${x.cisterns === 1 ? '' : 's'} dug: water +${Math.round(lasting() * 100)}% for good.` : 'Every deep cistern dug adds 1% to water for good.'}</div>
        <div class="card stack"><b>The Warden's chest</b>${grades}</div>
        ${L ? `<div class="muted small">Last season: grade ${L.grade}${L.edict ? `, ${esc(ED[L.edict].name)}` : ', no edict'}, ${L.thirst} min thirsty, ${L.sick} sick.</div>` : ''}`,
    };
  };
  KH.chips.push(() => {
    if (!unlocked() || (!active() && !warning())) return '';
    const x = X();
    return active()
      ? `<button class="qchip ${x.edict ? '' : 'raid'}" data-act="dry">${icon('i-dry')}${x.edict ? 'Dry Season' : 'Dry Season: give an edict'} <time>${fmtTime(Math.max(0, x.end - S.time))}</time></button>`
      : `<button class="qchip incident" data-act="dry">${icon('i-dry')}Dry Season in <time>${fmtTime(Math.max(0, x.next - S.time))}</time></button>`;
  });

  KH.dry = { unlocked, active, warning, lasting, gradeOf, edicts: D.edicts };
})();
