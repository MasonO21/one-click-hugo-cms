/*
 * Rainkeep: formations. Choose which troop class leads your marches and expedition battles: Balanced (every
 * class in proportion) or a lead class that makes up most of the march. The class that counters a foe hits it
 * 20% harder, but the classes differ (Shieldbearers are tough and hit softly, Archers hit hard and break
 * easily), so the picker fights the battle out in advance with each formation and marks the one that fares best.
 * core.js reads S.formation in capTroops (marchTroops), world.js in pickTroops.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { icon, esc } = KH.u;
  const { ACT } = KH;
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => { s.formation = null; });

  const counterOf = (cls) => Object.keys(DATA.counters).find((c) => DATA.counters[c] === cls);
  const LEADS = [null, ...Object.keys(DATA.counters)];
  ACT.formation = (arg) => {
    S.formation = arg && DATA.counters[arg] ? arg : null;
    KH.sfx('tap');
  };
  // how each formation would fare against this foe (the same battle engine, fought out in advance): a win
  // scores 1 plus the health left, a loss what share of the foe's health went down
  function rate(foe, frac = 1, heroes) {
    const cap = KH.marchCap();
    return LEADS.map((lead) => {
      const pool = KH.capTroops(S.troops, cap, lead), troops = {};
      for (const k in pool) troops[k] = Math.floor(pool[k] * frac);
      const team = KH.teamStats(foe.cls, { troops, heroes });
      const r = KH.simulateBattle(team, foe), last = r.rounds[r.rounds.length - 1];
      return { lead, score: r.win ? 1 + r.th / team.hp : 1 - (last ? last.eh : foe.hp) / foe.hp };
    });
  }
  const best = (foe, frac, heroes) => rate(foe, frac, heroes).reduce((a, b) => (b.score > a.score + 1e-9 ? b : a)).lead;
  // the picker: Balanced or a lead class, the class that counters the foe marked with a dot and the formation that
  // fares best against it marked Best
  KH.formationRow = (foe, frac = 1) => {
    if (!S || !S.lv.barracks) return '';
    const c = foe ? counterOf(foe.cls) : null, cur = S.formation || null;
    const b = foe && Object.values(S.troops).some((n) => n > 0) ? best(foe, frac) : undefined;
    const name = (id) => (id ? `${DATA.classes[id].name} lead` : 'Balanced');
    const opt = (id) => `<button class="${cur === id ? 'on' : ''}${id && id === c ? ' counter' : ''}${b !== undefined && id === b ? ' best' : ''}" data-act="formation" data-arg="${id || ''}" aria-pressed="${cur === id}">${id ? icon(DATA.classes[id].icon) : ''}${esc(id ? DATA.classes[id].name.replace(/s$/, '') : 'Balanced')}</button>`;
    const tip = b === undefined ? '' : b === cur ? `${name(cur)} is the best formation against this foe.` : `Best against this foe: ${name(b)}.${c ? ` ${DATA.classes[c].name} counter it (+20% attack each), but every class fights differently.` : ''}`;
    return `<div class="fm"><span class="fm-lbl">Formation</span><div class="seg fm-seg">${LEADS.map(opt).join('')}</div>${tip ? `<div class="muted small fm-tip">${esc(tip)}</div>` : ''}</div>`;
  };
  KH.formation = { rate, best, leads: LEADS };
  KH.counterOf = counterOf;
})();
