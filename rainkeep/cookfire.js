/*
 * Rainkeep: the Cookfire. From Rainwyrm Lv 4 every fish landed at the spring (fishing.js) also goes into the
 * larder, and the cookfire in the courtyard turns fish and food into dishes that serve the keep for a few hours:
 * Minnow Skewers for gathering, Sand Carp Stew for production, Golden Barb Pilaf for battle, Glass Eel Broth for
 * the sick, a Whiskers Roast for the troops and, from the rarest catch, a Rain Koi Banquet that does a little of
 * everything. Two dishes at once, never the same one twice. Effects through KH.hooks.bonus.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { fmt, fmtTime, icon, esc } = KH.u;
  const { UI, ACT } = KH;
  const C = DATA.cook, R = Object.fromEntries(C.recipes.map((r) => [r.id, r])), FISH = Object.fromEntries(DATA.fishing.fish.map((f) => [f.id, f]));
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => {
    s.cook = { larder: {}, table: [] };
    s.stats.cooked = 0; s.stats.banquets = 0;
  });
  const unlocked = () => !!S && S.lv.wyrm >= C.unlock;
  const larder = () => (S && S.cook ? S.cook.larder : {});
  const table = () => (S && S.cook ? S.cook.table.filter((d) => d.until > S.time) : []);
  const serving = (id) => table().some((d) => d.id === id);
  const foodOf = (r) => KH.scaleReward({ food: r.food });
  const hasFish = (r) => Object.entries(r.fish).every(([f, n]) => (larder()[f] || 0) >= n);
  const can = (r) => hasFish(r) && KH.canAfford(foodOf(r)) && !serving(r.id) && table().length < C.table;

  // every fish landed goes into the larder too
  KH.on('fish', ({ id }) => { if (S && S.cook) S.cook.larder[id] = (S.cook.larder[id] || 0) + 1; });

  KH.hooks.bonus.push((k) => {
    if (!S || !S.cook) return 0;
    let v = 0;
    for (const d of S.cook.table) if (d.until > S.time && R[d.id] && R[d.id].fx[k]) v += R[d.id].fx[k];
    return v;
  });
  KH.hooks.tick.push(() => {
    if (!S || !S.cook || !S.cook.table.length) return;
    if (S.cook.table.some((d) => d.until <= S.time)) S.cook.table = S.cook.table.filter((d) => d.until > S.time);
  });

  ACT.cookfire = () => {
    if (!unlocked()) return KH.toast(`The cookfire is lit at Rainwyrm Lv ${C.unlock}.`, 'warn');
    UI.sheet = { kind: 'cookfire' };
  };
  ACT.cook = (id) => {
    const r = R[id];
    if (!r || !unlocked()) return;
    if (serving(id)) return KH.toast(`${r.name} is already on the table.`, 'warn');
    if (table().length >= C.table) return KH.toast(`The table holds ${C.table} dishes at a time.`, 'warn');
    if (!hasFish(r)) return KH.toast('Not enough fish in the larder. Catch more at the spring.', 'warn');
    const food = foodOf(r);
    if (!KH.canAfford(food)) return KH.toast('Not enough food for the dish.', 'warn');
    KH.pay(food);
    for (const [f, n] of Object.entries(r.fish)) S.cook.larder[f] -= n;
    S.cook.table = table().concat([{ id, until: S.time + r.hours * 3600 }]);
    if (r.cure && S.sick) S.sick = Math.floor(S.sick * (1 - r.cure));
    S.stats.cooked++;
    if (id === 'banquet') S.stats.banquets++;
    if (KH.duty) KH.duty('cook');
    KH.emit('cooked', { id });
    KH.sfx('claim');
    KH.toast(`${r.name} on the table: ${r.text.toLowerCase()} for ${r.hours} hours.`, 'good');
  };

  const fishChip = (f, n, have) => `<span class="chip ${have >= n ? '' : 'r-legendary'}">${icon(`i-fish-${f}`)}${n} ${esc(FISH[f].name.split(' ').pop())}${n > 1 ? 's' : ''}</span>`;
  KH.sheets.cookfire = () => {
    const L = larder(), on = table();
    const shelf = DATA.fishing.fish.map((f) => `<span class="ck-fish ${L[f.id] ? '' : 'none'}">${icon(`i-fish-${f.id}`)}<b>${fmt(L[f.id] || 0)}</b></span>`).join('');
    const served = on.map((d) => `<div class="row ck-served">${icon(R[d.id].icon, 'ck-ic')}<div class="grow"><b>${esc(R[d.id].name)}</b><div class="muted small">${esc(R[d.id].text)}</div></div><span class="chip dc-on">${icon('i-clock')}${fmtTime(d.until - S.time)}</span></div>`).join('');
    const cards = C.recipes.map((r) => {
      const ok = can(r), srv = serving(r.id);
      return `<div class="card row ck-card ${srv ? 'on' : ''}">${icon(r.icon, 'ck-ic')}<div class="grow"><b>${esc(r.name)}</b><div class="small">${esc(r.text)} · ${r.hours} h</div>
        <div class="row wrap ck-need">${Object.entries(r.fish).map(([f, n]) => fishChip(f, n, L[f] || 0)).join('')}${KH.costHTML(foodOf(r))}</div></div>
        ${srv ? '<span class="chip dc-on">Served</span>' : `<button class="btn small ${ok ? 'gold' : 'off'}" data-act="cook" data-arg="${r.id}">Cook</button>`}</div>`;
    }).join('');
    return {
      title: 'The Cookfire', lvl: `${on.length}/${C.table}`,
      body: `${KH.art && KH.art.banner ? KH.art.banner('event', 'cookfire', 'Fish from the spring, food from the stores, and a fire in the courtyard.') : ''}
        <p class="muted small">Every fish you land at the spring also goes into the larder. Cook them into dishes that serve the whole keep for a few hours, ${C.table} on the table at a time.</p>
        <div class="card stack"><div class="row"><b class="grow">The larder</b><button class="btn small alt" data-act="fishing">${icon('i-fish-rod')}Go fishing</button></div><div class="row wrap ck-shelf">${shelf}</div></div>
        ${served ? `<div class="card stack"><div class="section-label">On the table</div>${served}</div>` : ''}
        <div class="stack">${cards}</div>`,
    };
  };
  KH.side.push({ id: 'cookfire', icon: 'i-ck-fire', label: 'Cookfire', act: 'cookfire', show: unlocked, dot: () => table().length < C.table && C.recipes.some(can), badge: () => `${table().length}/${C.table}` });
  KH.chips.push(() => {
    const on = table();
    if (!on.length) return '';
    const d = on.slice().sort((a, b) => a.until - b.until)[0];
    return `<button class="qchip" data-act="cookfire">${icon(R[d.id].icon)}${on.length > 1 ? `${on.length} dishes` : esc(R[d.id].name)} <time>${fmtTime(Math.max(0, d.until - S.time))}</time></button>`;
  });

  KH.cook = { unlocked, larder, table, serving, can, recipes: C.recipes };
})();
