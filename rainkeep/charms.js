/*
 * Rainkeep: Relic Charms. Every kind of relic dug up in the Buried City (dig.js) can be worn by one hero as a charm:
 * a Clay Lamp for health, a Bronze Spear for attack, a Star Tablet for skill power, and so on. A charm's level is the
 * number of that kind found (up to 10), so digging deeper keeps every charm growing, and the grand relics give the
 * most a level. One charm per hero, one hero per charm. The bonus reaches heroStats and skillScale (core.js asks
 * KH.charmBoost); the choice is made on the hero's sheet.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { icon, esc } = KH.u;
  const { UI, ACT } = KH;
  const C = DATA.dig.charms, KIND = {};
  for (const list of Object.values(DATA.dig.relics)) for (const r of list) KIND[r.id] = r;
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => { s.charms = {}; s.stats.charmTop = 0; s.stats.charmsWorn = 0; });

  const found = (k) => (S && S.dig && S.dig.found ? S.dig.found[k] || 0 : 0);
  const level = (k) => Math.min(C.max, found(k));
  const valueOf = (k, L = level(k)) => C.kinds[k].per * L;
  const wornBy = (k) => Object.keys(S.charms || {}).find((id) => S.charms[id] === k) || null;
  const unlocked = () => !!S && Object.keys(C.kinds).some((k) => found(k) > 0);
  // the bonus a hero's charm gives to one stat ('atk', 'def', 'hp' or 'skill')
  KH.charmBoost = (id, stat) => {
    if (!S || !S.charms) return 0;
    const k = S.charms[id];
    return k && C.kinds[k] && C.kinds[k].fx === stat ? valueOf(k) : 0;
  };
  const NAMES = { atk: 'attack', def: 'defense', hp: 'health', skill: 'skill power' };
  const fxText = (k, L = level(k)) => `${NAMES[C.kinds[k].fx]} +${(valueOf(k, L) * 100).toFixed(1).replace(/\.0$/, '')}%`;
  KH.hooks.tick.push(() => { if (S && S.dig && S.dig.found) S.stats.charmTop = Math.max(S.stats.charmTop || 0, ...Object.keys(C.kinds).map(level)); });

  ACT.charmpick = (id) => { if (!S.heroes[id] || !unlocked()) return; UI.sheet = { kind: 'charms', id }; };
  ACT.charmset = (arg) => {
    const [id, k] = String(arg).split(':');
    if (!S.heroes[id]) return;
    if (k === 'none') { delete S.charms[id]; UI.sheet = { kind: 'hero', id }; return; }
    if (!C.kinds[k] || !found(k)) return;
    const other = wornBy(k);
    if (other && other !== id) delete S.charms[other];
    S.charms[id] = k;
    S.stats.charmsWorn = Object.keys(S.charms).length;
    KH.sfx('claim');
    KH.toast(`${HERO(id)} wears the ${KIND[k].name}: ${fxText(k)}.`, 'good');
    UI.sheet = { kind: 'hero', id };
  };
  const HERO = (id) => esc(DATA.heroes.find((h) => h.id === id).name.split(' ')[0]);
  KH.sheets.charms = () => {
    const id = UI.sheet.id, mine = S.charms[id];
    const rows = Object.keys(C.kinds).map((k) => {
      const n = found(k), L = level(k), who = wornBy(k);
      if (!n) return `<div class="row ch-charm off">${icon(`i-dg-${k}`, 'ch-ic')}<div class="grow"><b>${esc(KIND[k].name)}</b><div class="muted small">Not dug up yet · ${NAMES[C.kinds[k].fx]}</div></div></div>`;
      return `<button class="row ch-charm ${mine === k ? 'on' : ''}" data-act="charmset" data-arg="${id}:${k}">${icon(`i-dg-${k}`, 'ch-ic')}<div class="grow"><b>${esc(KIND[k].name)}</b> <span class="muted small">Lv ${L}</span>
        <div class="small">${fxText(k)}${L < C.max ? ` · Lv ${L + 1} with another one dug up` : ''}</div>${who && who !== id ? `<div class="muted small">Worn by ${HERO(who)}: they give it up</div>` : ''}</div>${mine === k ? icon('i-check') : ''}</button>`;
    }).join('');
    return {
      title: `${HERO(id)}'s charm`, lvl: mine ? KIND[mine].name : 'None',
      body: `<p class="muted small">Each kind of relic from the Buried City can be worn by one hero. A charm grows a level with every one of its kind dug up, to Lv ${C.max}.</p>
        <div class="stack">${rows}</div>${mine ? `<button class="btn alt wide" data-act="charmset" data-arg="${id}:none">Take the charm off</button>` : ''}`,
    };
  };
  // the hero sheet: the hero's charm, or a prompt to choose one
  KH.heroCharm = (id) => {
    if (!unlocked() || !S.heroes[id]) return '';
    const k = S.charms[id];
    return `<button class="card row ch-hero ${k ? 'on' : ''}" data-act="charmpick" data-arg="${id}">${k ? icon(`i-dg-${k}`, 'ch-ic') : icon('i-dg-chest', 'ch-ic')}
      <div class="grow"><b>${k ? `${esc(KIND[k].name)} · Lv ${level(k)}` : 'Relic charm'}</b><div class="small ${k ? '' : 'muted'}">${k ? fxText(k) : 'Choose a relic from the Buried City for this hero to wear.'}</div></div><span class="chip">${k ? 'Change' : 'Choose'}</span></button>`;
  };
  KH.charms = { unlocked, level, found, valueOf, wornBy, kinds: C.kinds };
})();
