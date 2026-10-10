/*
 * Rainkeep: Breath Arts. The Rainwyrm breathes once a fight, and until now the breath was always a Torrent: damage,
 * best spent on a wind-up. From Rainwyrm Lv 6 it can breathe a Mist Veil instead (it heals the squad, softens the
 * next two blows and draws out venom) and from Lv 11 a Riptide (40% of the damage, but the foe is held under for
 * two rounds: no blows, no regeneration, and a frenzy calmed). Every art breaks a wind-up. Each answers different foe
 * traits, so the choice is made against the foe: on the stage card, the star replay sheet and the Leviathan's sheet,
 * one tap. The engine is in core.js (newBattle and battleStep take the art, autoActs plays each one); the battle
 * screen names the art on the breath button (ui.js).
 */
'use strict';
(function () {
  const KH = window.KH;
  const { icon, esc } = KH.u;
  const { ACT } = KH;
  const AR = DATA.battle.arts;
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => { s.breathArt = 'torrent'; s.artTold = null; s.stats.artSwitches = 0; s.stats.artsOpen = 1; });
  // a letter for each art as the wyrm learns it
  const LETTER = {
    veil: (W) => `${W} has learned the Mist Veil. Instead of a Torrent, its one breath a fight can wrap the squad in cool mist: it heals them, softens the next two blows and draws out venom. Choose the breath on the stage card, against the foe in front of you: the Veil is the answer to venomous foes, and the surest way to end a fight above half health.`,
    riptide: (W) => `${W} has learned the Riptide. Its breath can drag the foe under for two rounds: less damage than a Torrent, but no blows land and no wound closes while it struggles. Against regenerating foes it is the breath to choose, and it calms a frenzy too.`,
  };
  KH.hooks.tick.push(() => {
    if (!S) return;
    S.stats.artsOpen = AR.order.filter((a) => KH.artOpen(a)).length;
    // the first look at a save: arts already learned (an older save) need no letter
    if (!S.artTold) { S.artTold = ['veil', 'riptide'].filter((a) => KH.artOpen(a)); return; }
    for (const a of ['veil', 'riptide']) if (KH.artOpen(a) && !S.artTold.includes(a)) { S.artTold.push(a); KH.mail(`A new breath: the ${AR[a].name}`, LETTER[a](S.wyrm.name), null); }
  });

  ACT.breathart = (a) => {
    if (!AR[a]) return;
    if (!KH.artOpen(a)) return KH.toast(`${S.wyrm.name} learns the ${AR[a].name} at Rainwyrm Lv ${AR[a].unlock}.`, 'warn');
    if (S.breathArt === a) return;
    S.breathArt = a;
    S.stats.artSwitches++;
    KH.sfx('tap');
    KH.toast(`${S.wyrm.name} will breathe a ${AR[a].name}: ${AR[a].text}`, 'good');
  };
  // the choice of breath, for a foe: the arts that answer its traits are marked
  const ANSWERS = { regen: ['riptide'], venom: ['veil'], frenzy: ['torrent', 'riptide'], shell: ['torrent'] };
  KH.artRow = (foe) => {
    if (!S || S.dormant || S.lv.wyrm < AR.veil.unlock) return '';
    const cur = KH.artOf(), tr = (foe && foe.traits) || [];
    const good = (a) => tr.some((t) => (ANSWERS[t] || []).includes(a));
    const opt = (a) => {
      const open = KH.artOpen(a), d = AR[a];
      return `<button class="${cur === a ? 'on' : ''}${open && good(a) ? ' answer' : ''}${open ? '' : ' locked'}" data-act="breathart" data-arg="${a}" aria-pressed="${cur === a}" title="${esc(d.text)}">${icon(open ? d.icon : 'i-lock')}${esc(d.name)}${open ? '' : `<small>Lv ${d.unlock}</small>`}</button>`;
    };
    // a trait the chosen art leaves unanswered that another learned art would answer, and the arts that do
    const t = tr.find((x) => !(ANSWERS[x] || []).includes(cur) && (ANSWERS[x] || []).some((a) => KH.artOpen(a)));
    const tip = t ? `Against ${esc(DATA.traits.list[t].name.toLowerCase())} foes: ${(ANSWERS[t]).filter((a) => KH.artOpen(a)).map((a) => AR[a].name).join(' or ')}.` : esc(AR[cur].text);
    return `<div class="fm ba"><span class="fm-lbl">Breath</span><div class="seg ba-seg">${AR.order.map(opt).join('')}</div><div class="muted small fm-tip">${tip}</div></div>`;
  };
  KH.arts = { answers: ANSWERS, good: (a, foe) => ((foe && foe.traits) || []).some((t) => (ANSWERS[t] || []).includes(a)) };
})();
