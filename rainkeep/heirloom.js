/*
 * Rainkeep: Heirlooms. Every hero carries one thing from before the keep (Zahra's lantern, Bashir's well rope,
 * Omar's emergency pick). It wakes when the hero reaches 3 stars and is tempered with Desert Whetstones up to
 * Lv 10; each level adds to the hero's attack, defense and health and to the strength of their skill.
 * Whetstones come from watchtower errands and bounties, the Crossing and siege chests, the Bazaar, now and then
 * a beast, and the Heirloom Kit.
 * Plugs into core through KH.heirloomBoost (heroStats and skillScale), the hero sheet (KH.heroHeirloom),
 * KH.hooks, KH.sheets and KH.on.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { fmt, icon, esc } = KH.u;
  const { UI, ACT } = KH;
  const H = DATA.heirloom, MAX = H.cost.length;
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => {
    s.heirlooms = {};
    s.stats.heirWoken = 0; s.stats.heirTop = 0; s.stats.tempers = 0;
  });

  const lvOf = (id) => (S && S.heirlooms && S.heirlooms[id]) || 0;
  const awake = (id) => !!S && !!S.heroes[id] && S.heroes[id].stars >= H.stars;
  const costOf = (id) => H.cost[lvOf(id)];
  const first = (id) => DATA.heroes.find((h) => h.id === id).name.split(' ')[0];
  const pct = (v) => `${+(v * 100).toFixed(1)}%`;
  const iconOf = (id) => H.icons[id] || H.icons[DATA.heroes.find((h) => h.id === id).cls] || 'i-heirloom';
  // core.js asks for these: 'stat' for attack, defense and health, 'skill' for the skill's strength
  KH.heirloomBoost = (id, kind) => lvOf(id) * (kind === 'skill' ? H.skill : H.stat);

  ACT.heirloom = (id) => {
    if (!H.list[id] || !awake(id)) return KH.toast(`${first(id)}'s heirloom wakes at ${H.stars} stars.`, 'warn');
    const lv = lvOf(id);
    if (lv >= MAX) return;
    const c = H.cost[lv];
    if (KH.have('whetstone') < c) return KH.toast(`That takes ${c} Desert Whetstones. You have ${KH.have('whetstone')}.`, 'warn');
    KH.pay({ whetstone: c });
    S.heirlooms[id] = lv + 1;
    if (!lv) S.stats.heirWoken++;
    else S.stats.tempers++;
    S.stats.heirTop = Math.max(S.stats.heirTop, lv + 1);
    if (KH.duty) KH.duty('temper');
    KH.emit('temper', { id, lv: lv + 1 });
    KH.sfx(lv ? 'upgrade' : 'legendary');
    KH.toast(lv ? `${H.list[id][0]} tempered to Lv ${lv + 1}.` : `${H.list[id][0]} wakes in ${first(id)}'s hands.`, 'good', 'heirloom', 3);
  };
  ACT.heirlooms = () => { UI.sheet = { kind: 'heirlooms' }; };

  // a beast now and then carries a whetstone
  KH.on('beast', () => { if (Math.random() < H.beast) { KH.grant({ whetstone: 1 }); KH.toast('+1 Desert Whetstone from the beast hunt.', 'good', 'whetstone', 3); } });

  // the card on a hero's sheet
  KH.heroHeirloom = (id) => {
    const it = H.list[id];
    if (!it || !S.heroes[id]) return '';
    const lv = lvOf(id), have = KH.have('whetstone');
    const now = lv ? `<div class="small hl-now">+${pct(lv * H.stat)} attack, defense and health · skill +${pct(lv * H.skill)}</div>` : '';
    let foot;
    if (!awake(id)) foot = `<div class="small hl-need">${icon('i-lock')}Wakes when ${esc(first(id))} reaches ${H.stars} stars</div>`;
    else if (lv >= MAX) foot = '<div class="small hl-now"><b>Fully tempered.</b></div>';
    else {
      const c = H.cost[lv];
      foot = `<div class="row hl-row"><span class="grow muted small">${lv ? `Lv ${lv + 1}: +${pct((lv + 1) * H.stat)} stats, skill +${pct((lv + 1) * H.skill)}` : `Wakes at Lv 1: +${pct(H.stat)} stats, skill +${pct(H.skill)}`}</span>
        <button class="btn small ${have >= c ? 'gold' : 'off'}" data-act="heirloom" data-arg="${id}">${icon('i-whetstone')}${c} · ${lv ? 'Temper' : 'Wake'}</button></div>`;
    }
    return `<div class="card stack hl-card ${lv ? 'awake' : ''}"><div class="row">${icon(iconOf(id), 'hl-ic')}<div class="grow"><b>${esc(it[0])}</b>${lv ? ` <span class="chip hl-lv">Lv ${lv}/${MAX}</span>` : ''}<div class="muted small">${esc(it[1])}</div>${now}</div></div>${foot}</div>`;
  };

  // every hero's heirloom at a glance, the ones you can temper first
  KH.sheets.heirlooms = () => {
    const have = KH.have('whetstone');
    const ids = Object.keys(S.heroes).filter((id) => H.list[id]);
    const score = (id) => (awake(id) ? (lvOf(id) < MAX && have >= costOf(id) ? 3 : 2) : 0) + (S.squad.includes(id) ? 0.5 : 0) + lvOf(id) / 100;
    ids.sort((a, b) => score(b) - score(a));
    const rows = ids.map((id) => {
      const lv = lvOf(id), ready = awake(id) && lv < MAX && have >= costOf(id);
      return `<button class="hl-item ${awake(id) ? '' : 'asleep'}" data-act="hero" data-arg="${id}">${KH.portrait(id)}<span class="grow"><b>${esc(H.list[id][0])}</b><span class="muted small">${esc(first(id))}${S.squad.includes(id) ? ' · in the squad' : ''} · ${awake(id) ? (lv ? `Lv ${lv}/${MAX}` : 'ready to wake') : `wakes at ${H.stars} stars`}</span></span>${ready ? '<i class="dot"></i>' : ''}</button>`;
    }).join('');
    return {
      title: 'Heirlooms', lvl: `${fmt(have)} whetstone${have === 1 ? '' : 's'}`,
      body: `<p class="muted small">Every hero carries one thing from before the keep. It wakes at ${H.stars} stars; each Desert Whetstone tempering adds ${pct(H.stat)} to the hero's attack, defense and health and ${pct(H.skill)} to their skill, up to Lv ${MAX}. Whetstones come from watchtower errands and bounties, the Crossing and siege chests, the Bazaar and now and then a beast.</p>
        <div class="stack hl-list">${rows || '<p class="muted">Recruit heroes at the Beacon.</p>'}</div>`,
    };
  };

  // for tests and the balance bot
  KH.heirloom = { lvOf, awake, costOf, max: MAX };
})();
