// Meta UI shell: top bar (player + currencies), five-tab bottom nav, tab panes and one shared 1 s ticker.
// Tabs re-render only when the profile really changes (onChange + signature) or when they are shown dirty.
import './meta.css';
import { h, $, $$, fmt, modal } from '../dom.js';
import { icon } from '../icons.js';
import { ENERGY_MAX } from '../../game/data.js';
import { todayKey } from '../../meta/save.js';
import { now as clockNow } from '../../meta/clock.js';
import {
  onChange, commit, upkeep, notifications, energyNextIn, accountXpFor, starterAvailable, pactActive,
} from '../../meta/economy.js';
import { cd, fmtLeft, fillPortraits, tap, energyFullIn, bar } from './util.js';
import { createHome } from './home.js';
import { createShop } from './shop.js';
import { createHeroes } from './heroes.js';
import { createAltar } from './altar.js';
import { createPass } from './pass.js';
import { openEnergy } from './panels.js';

const TABS = ['shop', 'heroes', 'battle', 'altar', 'pass'];
const NAV = { shop: ['bag', 'Shop'], heroes: ['helm', 'Heroes'], battle: ['swords', 'Battle'], altar: ['altar', 'Altar'], pass: ['scroll', 'Pass'] };

/** Profile fingerprint (ignores timestamps that change on every save) plus time-based states. */
const signature = (p) => JSON.stringify(p, (k, v) => (k === 'lastSeen' || k === 'energyTs' ? undefined : v))
  + todayKey() + starterAvailable(p) + pactActive(p);

export function createMeta(app) {
  const el = h(`<div class="meta" data-tab="battle">
    <header class="mt-top">
      <button class="mt-player" data-top="player" aria-label="Profile">
        <span class="mt-lv"><b class="tnum"></b></span>
        <span class="mt-pinfo"><span class="mt-pname"></span><span class="mt-xp"><i></i></span></span>
      </button>
      <div class="mt-curs">
        <span class="mt-cw"><button class="cur mt-cur" data-top="energy" aria-label="Energy">${icon('energy')}<b class="tnum mt-energy"></b><span class="plus">+</span></button><span class="mt-ecd"></span></span>
        <span class="mt-cw"><button class="cur mt-cur" data-top="gold" aria-label="Gold">${icon('gold')}<b class="tnum mt-gold"></b><span class="plus">+</span></button></span>
        <span class="mt-cw"><button class="cur mt-cur" data-top="gems" aria-label="Gems">${icon('gems')}<b class="tnum mt-gems"></b><span class="plus">+</span></button></span>
      </div>
    </header>
    <main class="mt-panes"></main>
    <nav class="mt-nav">${TABS.map((t) => `
      <button class="nav-b ${t === 'battle' ? 'nav-battle' : ''}" data-nav="${t}">
        ${t === 'battle' ? `<span class="nav-orb-w"><span class="nav-orb">${icon(NAV[t][0])}</span></span>` : icon(NAV[t][0])}
        <span class="nav-lb">${NAV[t][1]}</span><i class="badge-dot" hidden></i>
      </button>`).join('')}
    </nav>
  </div>`);

  const panes = $(el, '.mt-panes');
  let current = 'battle';
  const ctx = { app, go: (tab, arg) => setTab(tab, arg), refresh: () => refresh() };
  const tabs = {
    shop: createShop(ctx), heroes: createHeroes(ctx), battle: createHome(ctx), altar: createAltar(ctx), pass: createPass(ctx),
  };
  for (const t of TABS) { tabs[t].el.hidden = t !== current; panes.appendChild(tabs[t].el); }

  // ---------------------------------------------------------------- top bar + nav badges (cheap text updates)
  const top = {
    lv: $(el, '.mt-lv b'), name: $(el, '.mt-pname'), xp: $(el, '.mt-xp i'),
    energy: $(el, '.mt-energy'), gold: $(el, '.mt-gold'), gems: $(el, '.mt-gems'), ecd: $(el, '.mt-ecd'),
  };
  let ecdShown = null;
  function updateTop() {
    const p = app.profile;
    top.lv.textContent = p.level;
    top.name.textContent = p.name || 'Shepherd';
    top.xp.style.width = Math.min(100, (p.xp / accountXpFor(p.level)) * 100).toFixed(1) + '%';
    top.energy.textContent = `${p.energy}/${ENERGY_MAX}`;
    top.gold.textContent = fmt(p.gold);
    top.gems.textContent = fmt(p.gems);
    const showCd = p.energy < ENERGY_MAX;
    if (showCd !== ecdShown) { ecdShown = showCd; top.ecd.innerHTML = showCd ? `+1 ${cd('energy', energyNextIn(p))}` : ''; }
    const n = notifications(p);
    const counts = { shop: n.shop, heroes: n.heroes + n.bestiary, battle: n.quests + n.login, altar: n.altar, pass: n.pass };
    for (const t of TABS) $(el, `[data-nav="${t}"] .badge-dot`).hidden = !counts[t];
  }

  // ---------------------------------------------------------------- rendering
  const dirty = new Set(TABS);
  let sig = '';
  const renderTab = (t) => {
    try { tabs[t].render(); } catch (e) { console.error('[meta] render failed:', t, e); }
    dirty.delete(t);
  };
  function refresh(force = true) {
    updateTop();
    const s = signature(app.profile);
    if (!force && s === sig) return;
    sig = s;
    TABS.forEach((t) => dirty.add(t));
    if (!el.hidden) renderTab(current);
  }
  onChange(() => refresh(false));

  // ---------------------------------------------------------------- tabs
  function setTab(tab, arg) {
    if (!tabs[tab]) tab = 'battle';
    const prev = current;
    if (dirty.has(tab)) renderTab(tab);
    if (prev !== tab) {
      const dir = TABS.indexOf(tab) > TABS.indexOf(prev) ? 'in-r' : 'in-l';
      const pe = tabs[prev].el, ne = tabs[tab].el;
      pe.classList.remove('in-r', 'in-l');
      pe.classList.add('leaving');
      setTimeout(() => { pe.classList.remove('leaving'); if (current !== prev) pe.hidden = true; }, 200);
      ne.hidden = false;
      ne.classList.remove('leaving', 'in-r', 'in-l');
      void ne.offsetWidth; // restart the enter animation
      ne.classList.add(dir);
      current = tab;
      el.dataset.tab = tab;
      $$(el, '[data-nav]').forEach((b) => b.classList.toggle('on', b.dataset.nav === tab));
    }
    tabs[tab].onShow && tabs[tab].onShow(arg);
    if (tab === 'shop' && arg) tabs.shop.scrollTo(arg);
  }
  $$(el, '[data-nav]').forEach((b) => b.classList.toggle('on', b.dataset.nav === current));

  el.addEventListener('click', (e) => {
    const nb = e.target.closest('[data-nav]');
    if (nb) { tap(app, 'light'); setTab(nb.dataset.nav); return; }
    const tb = e.target.closest('[data-top]');
    if (!tb) return;
    tap(app);
    const k = tb.dataset.top;
    if (k === 'energy') openEnergy(ctx);
    else if (k === 'gold') setTab('shop', 'daily');
    else if (k === 'gems') setTab('shop', 'gems');
    else if (k === 'player') openProfile(app);
  });

  // ---------------------------------------------------------------- shared 1 s ticker
  let lastDay = todayKey();
  setInterval(() => {
    if (el.hidden) return;
    const p = app.profile; const now = clockNow();
    let expired = false;
    for (const n of document.querySelectorAll('#ui [data-cd]')) {
      const k = n.dataset.cd;
      let s;
      if (k === 'energy') s = energyNextIn(p);
      else if (k === 'energy-full') s = energyFullIn(p);
      else {
        s = (Number(k) - now) / 1000;
        if (s <= 0 && !n.dataset.x) { n.dataset.x = '1'; expired = true; }
      }
      const txt = fmtLeft(s);
      if (n.textContent !== txt) n.textContent = txt;
    }
    // Energy tick, day roll-over or an offer expiring: run upkeep and re-render.
    const day = todayKey();
    if ((p.energy < ENERGY_MAX && energyNextIn(p) <= 0) || day !== lastDay || expired) {
      lastDay = day;
      upkeep(p);
      commit(p);
      if (expired) refresh(true);
    }
    fillPortraits(el.parentElement || el, app);
  }, 1000);

  return {
    el,
    show(tab = 'battle') {
      el.hidden = false;
      // The profile may have changed while hidden (e.g. a run): mark every tab stale, then show the target.
      updateTop();
      sig = signature(app.profile);
      TABS.forEach((t) => dirty.add(t));
      setTab(tab);
    },
    hide() { el.hidden = true; },
    get tab() { return current; },
    refresh: () => refresh(true),
  };
}

/** Small profile card from the player badge. */
function openProfile(app) {
  const p = app.profile; const s = p.stats; const need = accountXpFor(p.level);
  modal({
    title: p.name || 'Shepherd',
    cls: 'mm-profile',
    body: `<div class="pr">
      <div class="pr-lv"><span class="mt-lv mt-lv-lg"><b class="tnum">${p.level}</b></span>
        <div class="pr-xp"><span class="t-label">Account level</span>${bar(p.xp / need)}<span class="tnum t-dim">${fmt(p.xp)}/${fmt(need)} XP</span></div></div>
      <div class="pr-stats">
        <div><small class="t-label">Runs</small><b class="tnum">${fmt(s.runs)}</b></div>
        <div><small class="t-label">Clears</small><b class="tnum">${fmt(s.clears)}</b></div>
        <div><small class="t-label">Foes slain</small><b class="tnum">${fmt(s.kills)}</b></div>
        <div><small class="t-label">Souls raised</small><b class="tnum">${fmt(s.raised)}</b></div>
        <div><small class="t-label">Best legion</small><b class="tnum">${fmt(s.bestLegion)}</b></div>
        <div><small class="t-label">Chapter</small><b class="tnum">${p.chapter.unlocked}</b></div>
      </div>
      <div class="mhint t-dim">${icon('info')} Each level-up grants 20 gems.</div>
    </div>`,
    actions: [{ label: 'Close', cls: 'btn-ghost btn-block' }],
  });
}
