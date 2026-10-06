/*
 * Rainkeep: the Sunsteel Forge and the Warden's Gear. The Forge smelts sandstone and
 * copper into Sunsteel while it is lit; Sunsteel and stone upgrade six pieces of gear that
 * strengthen every squad you send out (expedition, Spire, Duels, the Dunes, raids).
 * Plugs into core through KH.hooks, KH.ACT, KH.plotRows / KH.plotExtras and the
 * Heroes tab's Gear subtab (KH.panelGear). core.js reads KH.gearBonus in teamStats.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { fmt, icon, esc } = KH.u;
  const { UI, ACT, NAME } = KH;
  const F = DATA.forge;
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });

  KH.hooks.defaults.push((s) => {
    s.forge = { on: true, acc: 0 };
    s.gear = Object.fromEntries(F.gear.map((g) => [g.id, 0]));
    s.stats.gearUps = 0; s.stats.smelted = 0;
  });

  const tempering = () => (S && S.tech.tempering) || 0;
  const smeltRate = (L = S.lv.forge) => (L ? F.smelt(L) * (1 + 0.05 * tempering() + KH.stewardVal('sunsteel') / 100) : 0); // per minute
  const gearCap = () => (S.lv.forge ? F.gearCap(S.lv.forge) : 0);
  const tierOf = (L) => F.tiers.filter((t) => L >= t.from).pop();
  const gearValue = (g, L) => F.bonus(g.per, L) * (1 + 0.02 * tempering());
  const gearCost = (L) => F.cost(L);

  // Squad-wide and per-class bonuses, read by core teamStats.
  KH.gearBonus = () => {
    const out = { atk: 0, def: 0, hp: 0, troop: {} };
    if (!S || !S.gear) return out;
    for (const g of F.gear) {
      const L = S.gear[g.id] || 0;
      if (!L) continue;
      const v = gearValue(g, L);
      if (g.stat) out[g.stat] += v;
      else out.troop[g.troop] = (out.troop[g.troop] || 0) + v;
    }
    return out;
  };
  KH.hooks.power.push(() => (S && S.gear ? Object.values(S.gear).reduce((a, b) => a + b, 0) * 30 : 0));

  // Smelting: stone and copper in, Sunsteel out, while the Forge is lit and its racks have room.
  KH.hooks.tick.push((dt, offline, log) => {
    if (!S || !S.lv.forge || !S.forge.on || !dt) return;
    if (S.sunsteel >= F.store(S.lv.forge)) { S.forge.full = true; return; }
    S.forge.full = false;
    const want = (smeltRate() / 60) * dt * (offline ? DATA.offline.efficiency : 1);
    if (Object.entries(F.input).some(([r, n]) => S.res[r] < n * want)) { S.forge.starved = true; return; }
    S.forge.starved = false;
    for (const [r, n] of Object.entries(F.input)) S.res[r] -= n * want;
    S.forge.acc += want;
    const whole = Math.floor(S.forge.acc);
    if (whole > 0) { S.sunsteel += whole; S.forge.acc -= whole; S.stats.smelted += whole; if (log) log.sunsteel = (log.sunsteel || 0) + whole; }
  });

  ACT.forgetoggle = () => {
    if (!S.lv.forge) return;
    S.forge.on = !S.forge.on;
    KH.toast(S.forge.on ? 'The Forge is lit. It smelts stone and copper into Sunsteel.' : 'The Forge is banked. Stone and copper stay in the stores.', '');
  };
  ACT.gearup = (arg) => {
    const [id, times] = String(arg).split(':');
    const g = F.gear.find((x) => x.id === id);
    if (!g) return;
    if (!S.lv.forge) return KH.toast('Build the Sunsteel Forge first.', 'warn');
    const n = times === '5' ? 5 : 1;
    let done = 0;
    for (let i = 0; i < n; i++) {
      const L = S.gear[id];
      if (L >= gearCap()) { if (!done) KH.toast(L >= 50 ? 'This piece is fully forged.' : 'Upgrade the Forge to raise the gear level cap.', 'warn'); break; }
      const c = gearCost(L);
      if (!KH.canAfford(c)) { if (!done) KH.toast('Not enough Sunsteel or stone.', 'warn'); break; }
      KH.pay(c);
      S.gear[id] = L + 1;
      S.stats.gearUps++;
      done++;
      if (KH.duty) KH.duty('gear');
      KH.emit('gear', { id, to: L + 1 });
      if (tierOf(L + 1).from === L + 1) KH.toast(`${g.name} is now ${tierOf(L + 1).name}.`, 'good');
    }
    if (done) { KH.sfx('claim'); KH.haptic('light'); KH.addPassXp(DATA.passXp.upgrade * done); }
  };

  const smeltLine = () => (!S.forge.on ? 'Banked: not smelting, so stone and copper stay in the stores.'
    : S.sunsteel >= F.store(S.lv.forge) ? `The Sunsteel racks are full (${fmt(F.store(S.lv.forge))}). Smelting waits until you forge some gear.`
      : S.forge.starved ? 'Out of stone or copper: smelting has paused.'
        : `Smelting ${smeltRate().toFixed(1)} Sunsteel a minute from ${fmt(smeltRate() * F.input.stone)} stone and ${fmt(smeltRate() * F.input.copper)} copper.`);
  const canUpgrade = (g) => S.lv.forge && S.gear[g.id] < gearCap() && KH.canAfford(gearCost(S.gear[g.id]));
  KH.gearDot = () => !!(S && S.lv.forge && F.gear.some(canUpgrade));
  const pct = (v) => `+${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;

  KH.panelGear = () => {
    const head = `<div class="panel-head"><h2>Warden's Gear</h2><p>${icon('i-sunsteel')}${fmt(S.sunsteel)} Sunsteel</p></div>`;
    if (!S.lv.forge) {
      return `${head}<div class="card stack"><b>${icon('i-anvil')}The Sunsteel Forge</b><p class="muted small">At Rainwyrm Lv ${KH.PLOT.forge.unlock} you can build a forge hot enough to work Sunsteel, the glassy metal the Sunheart left behind. Six pieces of gear strengthen every squad you send out.</p>
        ${S.lv.wyrm >= KH.PLOT.forge.unlock ? '<button class="btn wide gold" data-act="plot" data-arg="forge">Build the Forge</button>' : `<p class="notice heat">Unlocks at Rainwyrm Lv ${KH.PLOT.forge.unlock}.</p>`}</div>`;
    }
    const cap = gearCap(), b = KH.gearBonus();
    const status = `<div class="card stack"><div class="row"><div class="grow"><b>${icon('i-anvil')}Forge Lv ${S.lv.forge}</b><div class="muted small">${smeltLine()} Gear level cap ${cap}.</div></div>
      <button class="switch ${S.forge.on ? 'on' : ''}" data-act="forgetoggle" role="switch" aria-checked="${S.forge.on}" aria-label="Forge lit"><i></i></button></div>
      <div class="row wrap"><span class="chip">${icon('i-sword')}${pct(b.atk)} attack</span><span class="chip">${icon('i-guard')}${pct(b.def)} defense</span><span class="chip">${icon('i-heart')}${pct(b.hp)} health</span></div></div>`;
    const first = F.gear.find(canUpgrade);
    const cards = F.gear.map((g) => {
      const L = S.gear[g.id], t = tierOf(L), maxed = L >= 50, capped = L >= cap;
      const c = gearCost(L), ok = !capped && KH.canAfford(c);
      const next = maxed ? '' : `<span class="up">→ ${pct(gearValue(g, L + 1))}</span>`;
      return `<div class="card gear" style="--tier:${t.color}"><div class="gear-ic">${icon(g.icon)}<span>${L}</span></div>
        <div class="grow"><h3>${esc(g.name)} <span class="tier" style="color:${t.color}">${t.name}</span></h3>
          <div class="muted small">${esc(g.desc)} ${pct(gearValue(g, L))} ${next}</div>
          <div class="bar"><i style="width:${(L / 50) * 100}%;background:${t.color}"></i></div>
          ${maxed ? '<div class="muted small">Fully forged.</div>' : capped ? `<div class="muted small">Level cap ${cap}: upgrade the Forge.</div>` : KH.costHTML(c)}</div>
        ${maxed || capped ? '' : `<div class="stack" style="gap:6px"><button class="btn small ${ok ? '' : 'off'}" data-act="gearup" data-arg="${g.id}:1" ${first === g ? 'data-primary' : ''}>Forge</button><button class="btn small alt ${ok ? '' : 'off'}" data-act="gearup" data-arg="${g.id}:5">×5</button></div>`}</div>`;
    }).join('');
    return `${head}${status}<div class="section-label">Six pieces · every 10 levels a piece reaches a new tier and gets a bigger bonus</div><div class="stack">${cards}</div>
      <p class="muted small">Gear strengthens every squad you send: the expedition, the Mirage Spire, the Dune Duels, marches on the Dunes and the keep's defense.</p>`;
  };

  KH.plotRows.forge = (pid, L, N, up) => {
    const r = (lv) => smeltRate(lv);
    return [
      ['Sunsteel smelted', L ? `${r(L).toFixed(1)}/min` : '—', up(`${r(N).toFixed(1)}/min`)],
      ['Stone and copper used', L ? `${fmt(r(L) * F.input.stone)} + ${fmt(r(L) * F.input.copper)}/min` : '—', up(`${fmt(r(N) * F.input.stone)} + ${fmt(r(N) * F.input.copper)}/min`)],
      ['Gear level cap', `${L ? F.gearCap(L) : 0}`, up(F.gearCap(N))],
      ['Sunsteel racks', L ? fmt(F.store(L)) : '—', up(fmt(F.store(N)))],
    ];
  };
  KH.plotExtras.forge = () => `<div class="card stack"><div class="row"><div class="grow"><b>${S.forge.on ? 'Lit' : 'Banked'}</b><div class="muted small">${smeltLine()} You have ${fmt(S.sunsteel)} of ${fmt(F.store(S.lv.forge))} Sunsteel.</div></div>
      <button class="switch ${S.forge.on ? 'on' : ''}" data-act="forgetoggle" role="switch" aria-checked="${S.forge.on}" aria-label="Forge lit"><i></i></button></div>
      <button class="btn wide gold" data-act="tab" data-arg="gear">${icon('i-anvil')}Warden's Gear</button></div>`;

  KH.forge = { smeltRate, gearCap, gearCost, tierOf, gearValue };
})();
