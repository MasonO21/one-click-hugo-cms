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
  KH.hooks.defaults.push((s) => { s.breathArt = 'torrent'; s.stats.artSwitches = 0; s.stats.artsOpen = 1; });
  KH.hooks.tick.push(() => { if (S) S.stats.artsOpen = AR.order.filter((a) => KH.artOpen(a)).length; });

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
    const tip = tr.length && !good(cur) && AR.order.some((a) => KH.artOpen(a) && good(a))
      ? `Against ${esc(DATA.traits.list[tr.find((t) => (ANSWERS[t] || []).some((a) => KH.artOpen(a)))].name.toLowerCase())} foes: ${AR.order.filter((a) => KH.artOpen(a) && good(a)).map((a) => AR[a].name).join(' or ')}.`
      : esc(AR[cur].text);
    return `<div class="fm ba"><span class="fm-lbl">Breath</span><div class="seg fm-seg ba-seg">${AR.order.map(opt).join('')}</div><div class="muted small fm-tip">${tip}</div></div>`;
  };
  KH.arts = { answers: ANSWERS, good: (a, foe) => ((foe && foe.traits) || []).some((t) => (ANSWERS[t] || []).includes(a)) };
})();
