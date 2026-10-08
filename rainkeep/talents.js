/*
 * Rainkeep: Hero Talents. From Rainwyrm Lv 6 every hero chooses one of two talents at levels 10, 30, 50, 70 and 90,
 * named for their class. Each tier sets the hero against the fight: their own attack, defense or health on one
 * side; on the other, leading the troops of their class, a stronger skill, a skill ready a round sooner, a bigger
 * edge over the class they beat, or a stronger Torrent. The first choice at a tier is free; changing it costs
 * Starglass. Core reads the talents through KH.talentBoost (heroStats, skillScale) and KH.talentTeam (teamStats
 * and the battle's skills and Torrent).
 */
'use strict';
(function () {
  const KH = window.KH;
  const { icon, esc, fmt } = KH.u;
  const { UI, ACT } = KH;
  const T = DATA.talents, HERO = Object.fromEntries(DATA.heroes.map((h) => [h.id, h]));
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => {
    s.talents = {};
    s.stats.talents = 0; s.stats.talentFull = 0;
  });

  const unlocked = () => !!S && S.lv.wyrm >= T.unlock;
  const picks = (id) => (S && S.talents && S.talents[id]) || [];
  const tierOpen = (id, t) => !!S && !!S.heroes[id] && S.heroes[id].lvl >= T.levels[t];
  // a hero's talents add up by key (atk, def, hp, lead, skill, charge, counter, torrent)
  function boost(id, key) {
    const p = picks(id);
    let v = 0;
    for (let t = 0; t < p.length; t++) if (p[t] != null && T.tiers[t]) v += T.tiers[t][p[t]].fx[key] || 0;
    return v;
  }
  // what a fighting team's heroes give: lead and counter for each troop class, the Torrent, and each hero's charge
  function team(heroes) {
    const out = { lead: {}, counter: {}, torrent: 0 };
    for (const id of heroes || []) {
      if (!S.heroes[id] || !HERO[id]) continue;
      const c = HERO[id].cls;
      out.lead[c] = (out.lead[c] || 0) + boost(id, 'lead');
      out.counter[c] = (out.counter[c] || 0) + boost(id, 'counter');
      out.torrent += boost(id, 'torrent');
    }
    return out;
  }
  // talents a hero could choose now
  const ready = (id) => (unlocked() && S.heroes[id] ? T.levels.filter((_, t) => tierOpen(id, t) && picks(id)[t] == null).length : 0);
  const anyReady = (ids) => (ids || S.squad).some((id) => ready(id) > 0);

  const name = (id, t, k) => T.names[HERO[id].cls][t][k];
  function fxText(id, fx) {
    const c = HERO[id].cls, cls = DATA.classes[c].name, beat = DATA.classes[DATA.counters[c]].name;
    const [[key, v]] = Object.entries(fx), pc = `${Math.round(v * 100)}%`;
    return {
      atk: `Attack +${pc}`, def: `Defense +${pc}`, hp: `Health +${pc}`, skill: `Skill +${pc}`,
      lead: `${cls}s in the fight +${pc} attack, defense and health`,
      charge: 'Skill ready a round sooner',
      counter: `+${pc} more edge over ${beat}s, for the hero and every ${cls}`,
      torrent: `The Rainwyrm's Torrent +${pc}`,
    }[key];
  }
  const fxIcon = (fx) => ({ atk: 'i-sword', def: 'i-guard', hp: 'i-heart', skill: 'i-star', lead: 'i-flag', charge: 'i-clock', counter: 'i-target', torrent: 'i-raincloud' })[Object.keys(fx)[0]];

  ACT.talent = (arg) => {
    const [id, ts, ks] = String(arg).split(':'), t = Number(ts), k = Number(ks);
    if (!unlocked() || !S.heroes[id] || !T.tiers[t] || (k !== 0 && k !== 1)) return;
    if (!tierOpen(id, t)) return KH.toast(`${HERO[id].name.split(' ')[0]} chooses this talent at Lv ${T.levels[t]}.`, 'warn');
    const p = (S.talents[id] = S.talents[id] || []), was = p[t];
    if (was === k) return;
    if (was != null) {
      // changing a talent: tap once to see the price, again to pay it
      const ask = `${id}:${t}:${k}`;
      if (UI.talentAsk !== ask) { UI.talentAsk = ask; return KH.toast(`Tap again to change to ${name(id, t, k)} for ${T.change} Starglass.`); }
      UI.talentAsk = null;
      if (S.starglass < T.change) return KH.toast(`Changing a talent takes ${T.change} Starglass.`, 'warn');
      S.starglass -= T.change;
    } else S.stats.talents++;
    p[t] = k;
    if (p.filter((x) => x != null).length === T.levels.length) S.stats.talentFull = Math.max(S.stats.talentFull || 0, 1);
    KH.emit('talent', { id, t, k });
    KH.sfx('upgrade');
    KH.toast(`${HERO[id].name.split(' ')[0]} takes ${name(id, t, k)}.`, 'good');
  };

  // the card on the hero sheet
  KH.heroTalents = (id) => {
    if (!unlocked() || !S.heroes[id]) return '';
    const p = picks(id), lv = S.heroes[id].lvl, n = ready(id);
    const rows = T.tiers.map((pair, t) => {
      const open = lv >= T.levels[t];
      const opts = pair.map((o, k) => {
        const on = p[t] === k, other = p[t] != null && !on;
        return `<button class="tl-opt ${on ? 'on' : ''} ${other ? 'other' : ''} ${open ? '' : 'off'}" data-act="talent" data-arg="${id}:${t}:${k}">${icon(fxIcon(o.fx))}<b>${esc(name(id, t, k))}</b><small>${esc(fxText(id, o.fx))}</small></button>`;
      }).join('');
      return `<div class="tl-tier ${open ? (p[t] == null ? 'choose' : '') : 'locked'}"><span class="tl-lv">Lv ${T.levels[t]}</span><div class="tl-pair">${opts}</div></div>`;
    }).join('');
    return `<div class="card stack tl-card"><div class="row"><b class="grow">Talents</b>${n ? `<span class="chip dc-ready">${n} to choose</span>` : ''}</div>
      <div class="muted small">One of two at each tier. The first choice is free; changing one costs ${fmt(T.change)} Starglass.</div>
      <div class="stack">${rows}</div></div>`;
  };

  KH.talentBoost = boost;
  KH.talentTeam = team;
  KH.talents = { unlocked, picks, tierOpen, boost, team, ready, anyReady, name, fxText };
})();
