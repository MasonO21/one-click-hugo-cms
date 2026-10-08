/*
 * Rainkeep: Hero Awakening. Past 5 stars a hero can be awakened, A1 to A5, with its own shards (each step costs
 * a number of duplicates' worth for its rarity, each step opening at a Rainwyrm level), so recruits keep counting
 * once a hero is fully starred. Every
 * awakening adds to the hero's attack, defense and health and 10 levels to its cap; A3 and A5 also strengthen
 * its skill. Plugs into core through KH.awakenBoost (heroStats, skillScale, heroCap), the hero sheet
 * (KH.heroAwaken) and the roster card (KH.awakenBadge).
 */
'use strict';
(function () {
  const KH = window.KH;
  const { fmt, icon, esc } = KH.u;
  const { ACT } = KH;
  const W = DATA.awaken, MAX = W.dupes.length;
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => { s.awaken = {}; s.stats.awakened = 0; s.stats.awakenTop = 0; });

  const lvOf = (id) => (S && S.awaken && S.awaken[id]) || 0;
  const hero = (id) => DATA.heroes.find((h) => h.id === id);
  const unlocked = () => !!S && S.lv.wyrm >= W.unlock;
  const ready = (id) => unlocked() && !!S.heroes[id] && S.heroes[id].stars >= DATA.heroMaxStars;
  const costOf = (id, L = lvOf(id)) => (L >= MAX ? 0 : W.dupes[L] * DATA.shardsPerDupe[hero(id).rarity]);
  const skillAt = (L) => (L >= 5 ? W.skill[5] : L >= 3 ? W.skill[3] : 0);
  const pct = (v) => `${Math.round(v * 100)}%`;
  // core.js asks for these: 'stat' for attack, defense and health, 'skill' for the skill's strength, 'cap' for levels
  KH.awakenBoost = (id, kind) => {
    const L = lvOf(id);
    if (!L) return 0;
    return kind === 'stat' ? L * W.stat : kind === 'cap' ? L * W.cap : skillAt(L);
  };

  ACT.awaken = (id) => {
    const d = hero(id);
    if (!d || !S.heroes[id]) return;
    if (!unlocked()) return KH.toast(`Awakening opens at Rainwyrm Lv ${W.unlock}.`, 'warn');
    if (!ready(id)) return KH.toast(`${d.name.split(' ')[0]} needs ${DATA.heroMaxStars} stars first.`, 'warn');
    const L = lvOf(id);
    if (L >= MAX) return;
    if (S.lv.wyrm < W.wyrm[L]) return KH.toast(`A${L + 1} opens at Rainwyrm Lv ${W.wyrm[L]}.`, 'warn');
    const c = costOf(id), h = S.heroes[id];
    if (h.shards < c) return KH.toast(`That takes ${c} shards of ${d.name.split(' ')[0]}. You have ${h.shards}.`, 'warn');
    h.shards -= c;
    S.awaken[id] = L + 1;
    S.stats.awakened++;
    S.stats.awakenTop = Math.max(S.stats.awakenTop || 0, L + 1);
    KH.emit('awaken', { id, lv: L + 1 });
    KH.sfx(L + 1 >= MAX ? 'legendary' : 'upgrade');
    const extra = L + 1 === 3 || L + 1 === 5 ? ` Skill +${pct(skillAt(L + 1))}.` : '';
    KH.toast(`${d.name.split(' ')[0]} awakens: A${L + 1}. +${pct(W.stat)} stats, +${W.cap} levels.${extra}`, 'good');
  };

  // the card on a 5-star hero's sheet
  KH.heroAwaken = (id) => {
    const h = S.heroes[id];
    if (!h || h.stars < DATA.heroMaxStars) return '';
    const L = lvOf(id), d = hero(id), first = d.name.split(' ')[0];
    const pips = Array.from({ length: MAX }, (_, i) => `<i class="${i < L ? 'on' : ''}${i === 2 || i === 4 ? ' star' : ''}"></i>`).join('');
    if (!unlocked()) return `<div class="card row aw-card">${icon('i-star', 'aw-ic')}<div class="grow"><b>Awakening</b><div class="muted small">Opens at Rainwyrm Lv ${W.unlock}. A fully starred hero can be awakened five times with its own shards.</div></div></div>`;
    const now = `+${pct(L * W.stat)} stats, +${L * W.cap} levels${skillAt(L) ? `, skill +${pct(skillAt(L))}` : ''}`;
    if (L >= MAX) return `<div class="card stack aw-card on"><div class="row">${icon('i-star', 'aw-ic')}<div class="grow"><b>Awakened · A${MAX}</b> <span class="decor-pips aw-pips">${pips}</span><div class="muted small">${now}. ${esc(first)} is fully awakened.</div></div></div></div>`;
    const c = costOf(id), next = L + 1, gate = S.lv.wyrm < W.wyrm[L] ? W.wyrm[L] : 0, gain = `+${pct(W.stat)} stats, +${W.cap} levels${next === 3 || next === 5 ? `, skill +${pct(skillAt(next))}` : ''}`;
    return `<div class="card stack aw-card${L ? ' on' : ''}"><div class="row">${icon('i-star', 'aw-ic')}<div class="grow"><b>Awakening${L ? ` · A${L}` : ''}</b> <span class="decor-pips aw-pips">${pips}</span>
        <div class="muted small">${L ? `${now}. ` : ''}A${next}: ${gain}.</div></div></div>
      <div class="row"><div class="grow muted small">${fmt(h.shards)}/${fmt(c)} shards${gate ? ` · opens at Rainwyrm Lv ${gate}` : ''}</div><button class="btn small ${h.shards >= c && !gate ? 'gold' : 'off'}" data-act="awaken" data-arg="${id}">Awaken A${next}</button></div>
      <div class="bar xp"><i style="width:${Math.min(100, (h.shards / c) * 100)}%"></i></div></div>`;
  };
  // a small badge on the roster card
  KH.awakenBadge = (id) => (lvOf(id) ? `<span class="aw-badge">A${lvOf(id)}</span>` : '');
  KH.awaken = { unlocked, ready, lvOf, costOf, max: MAX };
})();
