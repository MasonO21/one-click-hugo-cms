// Heroes tab with four sub-tabs: Heroes (roster + detail), Relics (gear), Talents (gold sink) and the Bestiary (bestiary.js).
import { h, $, fmt, toast, modal } from '../dom.js';
import { icon, RELIC_ICON } from '../icons.js';
import {
  HEROES, HERO_ORDER, HERO_MAX_STARS, SKILLS, RARITY_COLOR, RARITY_LABEL, RARITIES, RELICS, RELIC_SLOTS,
  relicValue, formatRelicValue, TALENTS, talentCost, SKINS, RITES,
} from '../../game/data.js';
import { riteIcon } from '../riteui.js';
import {
  onChange, commit, computeLoadout, heroAction, heroNextCost, selectHero, equipRelic, upgradeTalent, notifications,
  starterAvailable, equipSkin } from '../../meta/economy.js';
import { portrait, bar, stars, tap, delegate, keepScroll } from './util.js';
import { openStarter } from './panels.js';
import { renderBestiary, openFoe } from './bestiary.js';

const RANK = { legendary: 0, epic: 1, rare: 2, common: 3 };
const rarityPill = (r) => `<span class="pill rpill" style="--rc:${RARITY_COLOR[r]}">${RARITY_LABEL[r]}</span>`;

/** Sum of equipped relic bonuses, grouped by stat. */
function relicTotals(p) {
  const tot = {};
  for (const uid of p.equipped) {
    const r = p.relics.find((x) => x.uid === uid);
    if (!r) continue;
    const d = RELICS[r.type];
    tot[d.stat] = tot[d.stat] || { v: 0, d };
    tot[d.stat].v += relicValue(r);
  }
  return Object.values(tot).map(({ v, d }) => (d.fmt === 'pct' ? `+${Math.round(v * 100)}% ${d.text}` : `+${Math.round(v)} ${d.text}`));
}
const talentVal = (t, lv) => (t.fmt === 'pct' ? `+${Math.round(t.per * lv * 100)}%` : `+${Math.round(t.per * lv)}`);

export function createHeroes(ctx) {
  const { app } = ctx;
  const el = h(`<section class="pane pane-heroes" data-tab="heroes">
    <div class="subtabs"></div>
    <div class="pane-scroll scroll sub-scroll" data-keep="heroes"><div class="hz"></div></div>
  </section>`);
  const tabsEl = $(el, '.subtabs');
  const root = $(el, '.hz');
  let sub = 'heroes';
  let flash = null; // talent key to flash after an upgrade

  function render() {
    const p = app.profile;
    const n = notifications(p);
    tabsEl.innerHTML = ['heroes', 'relics', 'talents', 'bestiary'].map((k) =>
      `<button class="subtab ${sub === k ? 'on' : ''}" data-sub="${k}">${{ heroes: 'Heroes', relics: 'Relics', talents: 'Talents', bestiary: 'Bestiary' }[k]}${(k === 'heroes' && n.heroes) || (k === 'bestiary' && n.bestiary) ? '<i class="badge-dot"></i>' : ''}</button>`).join('');
    keepScroll(el, () => {
      root.className = 'hz hz-' + sub;
      root.innerHTML = sub === 'heroes' ? renderRoster(p) : sub === 'relics' ? renderRelics(p) : sub === 'talents' ? renderTalents(p) : renderBestiary(p);
    });
    if (flash) { root.querySelector(`[data-tal="${flash}"]`)?.classList.add('flash'); flash = null; }
  }

  // ---------------------------------------------------------------- roster
  function renderRoster(p) {
    return `<div class="roster">${HERO_ORDER.map((id) => {
      const hero = HEROES[id]; const hs = p.heroes[id];
      const cost = heroNextCost(p, id);
      const ready = cost && hs.shards >= cost;
      const rc = RARITY_COLOR[hero.rarity];
      return `<button class="hcard r-${hero.rarity} ${hs.owned ? '' : 'is-locked'} ${p.selectedHero === id ? 'is-sel' : ''}" data-act="hero" data-id="${id}" style="--rc:${rc};--hc:${hero.css}">
        <span class="hcard-frame">
          ${portrait(app, id, 'hcard-portrait')}
          <span class="hcard-shine"></span>
          ${rarityPill(hero.rarity)}
          ${p.selectedHero === id ? '<span class="hcard-sel">Selected</span>' : ''}
          ${hs.owned ? '' : `<span class="hcard-lock">${icon('lock')}</span>`}
          <span class="hcard-info">
            <span class="hcard-name t-display">${hero.name}</span>
            ${hs.owned ? stars(hs.stars, HERO_MAX_STARS) : '<span class="hcard-locked-t">Locked</span>'}
          </span>
        </span>
        <span class="hcard-shards">
          <span class="ic-tint" style="color:${hero.css}">${icon('shard')}</span>
          ${cost ? `${bar(hs.shards / cost, ready ? 'mbar-ok' : '')}<b class="tnum">${hs.shards}/${cost}</b>` : '<b class="hcard-max">MAX</b>'}
          ${ready ? `<span class="hcard-up">${icon('plus')}</span>` : ''}
        </span>
      </button>`;
    }).join('')}</div>
    <div class="mhint t-dim">${icon('info')} Hero shards drop from Epic and Legendary pulls at the Soul Altar.</div>`;
  }

  function openHero(id) {
    const p = app.profile; const hero = HEROES[id];
    const body = h('<div class="hd"></div>');
    let celebrate = false;
    const draw = () => {
      const hs = p.heroes[id];
      const L = computeLoadout(p, id);
      const cost = heroNextCost(p, id);
      const w = SKILLS[hero.weapon];
      const skin = Object.keys(SKINS).find((s) => SKINS[s].hero === id && p.skins[s]);
      let actions = '';
      if (!hs.owned) {
        actions = `<button class="btn btn-primary btn-lg btn-block" data-a="unlock" ${hs.shards >= cost ? '' : 'disabled'}>${icon('shard')} Unlock · ${hs.shards}/${cost}</button>`;
      } else {
        actions = `<div class="row">
          ${p.selectedHero === id ? `<button class="btn btn-ghost" disabled>${icon('check')} Selected</button>` : '<button class="btn btn-soul" data-a="select">Select</button>'}
          ${hs.stars >= HERO_MAX_STARS ? '<button class="btn btn-ghost" disabled>Max rank</button>'
            : `<button class="btn btn-primary" data-a="rank" ${hs.shards >= cost ? '' : 'disabled'}>Rank up <span class="hd-cost">${icon('shard')}<b class="tnum">${hs.shards}/${cost}</b></span></button>`}
        </div>`;
      }
      const source = !hs.owned ? `<div class="hd-src">${icon('info')}<span>${id === 'nyx'
        ? 'Get Nyx instantly in the <b>Starter Pack</b>, or collect shards from Epic Soul Altar pulls.'
        : id === 'seraphine' ? 'Shards drop from <b>Epic</b> and <b>Legendary</b> Soul Altar pulls and from premium Soul Pass tiers.'
          : 'Shards drop from <b>Legendary</b> Soul Altar pulls (guaranteed within 60 pulls).'}</span>
        ${id === 'nyx' && starterAvailable(p) ? '<button class="btn btn-primary btn-sm" data-a="starter">View pack</button>' : ''}
        ${id !== 'nyx' || !starterAvailable(p) ? '<button class="btn btn-gem btn-sm" data-a="altar">Altar</button>' : ''}</div>` : '';
      body.innerHTML = `
        <div class="hd-art r-${hero.rarity} ${celebrate ? 'celebrate' : ''} ${hs.owned ? '' : 'is-locked'}" style="--rc:${RARITY_COLOR[hero.rarity]};--hc:${hero.css}">
          ${portrait(app, id, 'hd-portrait')}
          ${hs.owned ? '' : `<span class="hd-lock">${icon('lock')}</span>`}
          <div class="hd-burst"></div>
        </div>
        <div class="hd-id">
          <div class="hd-name t-display" style="--hc:${hero.css}">${hero.name}</div>
          <div class="hd-title">${hero.title}</div>
          <div class="hd-tags">${rarityPill(hero.rarity)}${hs.owned ? stars(hs.stars) : ''}</div>
        </div>
        <p class="hd-lore">${hero.lore}</p>
        <div class="hd-rows">
          <div class="hd-row"><span class="hd-ri" style="color:${hero.css}">${icon(w.icon)}</span><div><small class="t-label">Signature weapon</small><b>${w.name}</b><span class="t-dim">${w.desc(1)}</span></div></div>
          <div class="hd-row"><span class="hd-ri" style="color:${hero.css}">${icon('raise')}</span><div><small class="t-label">Passive</small><b>${hero.passiveText}</b></div></div>
          ${RITES[id] ? `<div class="hd-row hd-rite"><span class="hd-ri" style="color:${hero.css}">${riteIcon(id)}</span><div><small class="t-label">Rite</small><b>${RITES[id].name}</b><span class="t-dim">${RITES[id].desc} Cooldown ${RITES[id].cd} s.</span></div></div>` : ''}
        </div>
        <div class="hd-stats">
          <div><small class="t-label">HP</small><b class="tnum">${fmt(L.hpMax)}</b></div>
          <div><small class="t-label">Damage</small><b class="tnum">×${L.dmgMul.toFixed(2)}</b></div>
          <div><small class="t-label">Power</small><b class="tnum glow-gold">${fmt(L.power)}</b></div>
        </div>
        ${hs.owned && cost ? `<div class="hd-next"><span class="t-dim">Next rank: +12% damage, +8% HP</span>${bar(hs.shards / cost, hs.shards >= cost ? 'mbar-ok' : '')}</div>` : ''}
        ${skin ? `<button class="btn btn-ghost btn-sm btn-block hd-skin" data-a="skin">${icon('crown')} ${p.equippedSkin === skin ? 'Unequip' : 'Equip'} ${SKINS[skin].name}</button>` : ''}
        ${source}
        <div class="hd-actions">${actions}</div>`;
      celebrate = false;
    };
    draw();
    const off = onChange(draw);
    const m = modal({ body, cls: 'mm-hero scroll', onClose: off });
    body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
      const a = b.dataset.a;
      if (a === 'select') {
        selectHero(p, id); tap(app, 'medium', 'select');
        try { app.showcase && app.showcase.setHero(id); } catch (err) { console.warn(err); }
        commit(p); toast(`${hero.name} leads your legion`);
      } else if (a === 'unlock' || a === 'rank') {
        const res = heroAction(p, id);
        if (!res.ok) return;
        celebrate = true;
        app.audio.sfx('levelup'); app.haptic('success');
        if (res.unlocked && app.showcase && p.selectedHero === id) app.showcase.setHero(id);
        commit(p);
        toast(res.unlocked ? `${hero.name} joins your legion!` : `${hero.name} reached ${res.stars} stars`);
      } else if (a === 'skin') {
        const skin = Object.keys(SKINS).find((s) => SKINS[s].hero === id && p.skins[s]);
        equipSkin(p, skin);
        tap(app); commit(p);
        try { app.showcase && app.showcase.setHero(p.selectedHero); } catch (err) { console.warn(err); }
      } else if (a === 'starter') { m.close(); openStarter(ctx); }
      else if (a === 'altar') { m.close(); ctx.go('altar'); }
    });
  }

  // ---------------------------------------------------------------- relics
  const relicTile = (r, p, cls = '') => {
    const c = RARITY_COLOR[r.rarity];
    const eq = p.equipped.includes(r.uid);
    return `<button class="relic r-${r.rarity} ${cls} ${eq ? 'is-eq' : ''}" data-act="relic" data-uid="${r.uid}" style="--rc:${c}">
      <span class="relic-ic">${icon(RELIC_ICON[r.type])}</span>
      <span class="relic-lv tnum">Lv ${r.level || 1}</span>
      ${eq ? `<span class="relic-eq">${icon('check')}</span>` : ''}
    </button>`;
  };
  function renderRelics(p) {
    const slots = Array.from({ length: RELIC_SLOTS }, (_, i) => {
      const r = p.relics.find((x) => x.uid === p.equipped[i]);
      if (!r) return '<div class="slot is-empty"><span class="slot-ic">' + icon('plus') + '</span><small>Empty</small></div>';
      return `<div class="slot">${relicTile(r, p, 'relic-lg')}<small>${RELICS[r.type].name}</small><span class="slot-v">${formatRelicValue(r)}</span></div>`;
    }).join('');
    const totals = relicTotals(p);
    const inv = [...p.relics].sort((a, b) => RANK[a.rarity] - RANK[b.rarity] || (b.level || 1) - (a.level || 1) || a.type.localeCompare(b.type));
    const counts = RARITIES.map((r) => [r, p.relics.filter((x) => x.rarity === r).length]).filter(([, c]) => c);
    return `<div class="relic-top panel">
        <div class="t-label">Equipped relics</div>
        <div class="slots">${slots}</div>
        <div class="relic-tot">${totals.length ? totals.map((t) => `<span class="pill">${t}</span>`).join('') : '<span class="t-dim">Equip relics to gain bonuses.</span>'}</div>
      </div>
      <div class="sec-h"><span class="sec-t t-display">Inventory</span><span class="sec-r inv-counts">${counts.map(([r, c]) => `<span class="inv-c" style="--rc:${RARITY_COLOR[r]}" title="${RARITY_LABEL[r]}"><i></i>${c}</span>`).join('')}</span></div>
      <div class="relic-grid">${inv.map((r) => relicTile(r, p)).join('')}</div>
      <div class="mhint t-dim">${icon('info')} Duplicates merge into +1 level (+15% stat). Summon relics at the Soul Altar.</div>`;
  }
  function openRelic(uid) {
    const p = app.profile;
    const body = h('<div class="rd"></div>');
    const draw = () => {
      const r = p.relics.find((x) => x.uid === uid); if (!r) return;
      const d = RELICS[r.type]; const c = RARITY_COLOR[r.rarity];
      const eq = p.equipped.includes(uid);
      const full = !eq && p.equipped.indexOf(null) < 0;
      const replaced = full ? p.relics.find((x) => x.uid === p.equipped[RELIC_SLOTS - 1]) : null;
      const next = { ...r, level: Math.min(10, (r.level || 1) + 1) };
      body.innerHTML = `
        <div class="rd-art" style="--rc:${c}"><span class="rd-ic">${icon(RELIC_ICON[r.type])}</span></div>
        <div class="rd-name t-display">${d.name}</div>
        <div class="hd-tags">${rarityPill(r.rarity)}<span class="pill tnum">Lv ${r.level || 1}/10</span></div>
        <div class="rd-val" style="--rc:${c}">${formatRelicValue(r)}</div>
        ${(r.level || 1) < 10 ? `<div class="rd-next t-dim">Next duplicate: ${formatRelicValue(next)}</div>` : '<div class="rd-next t-dim">Max level reached</div>'}
        ${replaced ? `<div class="rd-warn">${icon('info')} Slots full: replaces ${RELICS[replaced.type].name}</div>` : ''}
        <button class="btn ${eq ? 'btn-ghost' : 'btn-soul'} btn-lg btn-block" data-a="eq">${eq ? 'Unequip' : 'Equip'}</button>`;
    };
    draw();
    const off = onChange(draw);
    const m = modal({ body, cls: 'mm-relic', onClose: off });
    body.addEventListener('click', (e) => {
      if (!e.target.closest('[data-a="eq"]')) return;
      const res = equipRelic(p, uid);
      tap(app, 'medium', 'select');
      commit(p);
      m.close();
      toast(res === 'equipped' ? 'Relic equipped' : 'Relic unequipped');
    });
  }

  // ---------------------------------------------------------------- talents
  function renderTalents(p) {
    const L = computeLoadout(p);
    return `<div class="tal-head panel"><div><div class="t-label">Power</div><b class="glow-gold tnum">${fmt(L.power)}</b></div>
        <div><div class="t-label">Gold</div><b class="tnum">${icon('gold')} ${fmt(p.gold)}</b></div></div>
      <div class="tals">${Object.entries(TALENTS).map(([k, t]) => {
        const lv = p.talents[k] || 0; const max = lv >= t.max; const cost = talentCost(lv);
        const poor = p.gold < cost;
        return `<div class="tal ${max ? 'is-max' : ''}" data-tal="${k}">
          <span class="tal-ic">${icon(t.icon)}</span>
          <div class="tal-main">
            <div class="tal-top"><b>${t.name}</b><span class="tal-lv tnum">Lv ${lv}/${t.max}</span></div>
            ${bar(lv / t.max, 'mbar-thin')}
            <div class="tal-val"><span>${t.text} ${talentVal(t, lv)}</span>${max ? '' : `<span class="tal-arrow">${icon('right')}</span><b class="tal-next">${talentVal(t, lv + 1)}</b>`}</div>
          </div>
          ${max ? '<span class="tal-maxed">MAX</span>' : `<button class="btn btn-primary btn-sm tal-btn" data-act="talent" data-k="${k}" ${poor ? 'disabled' : ''}>${icon('gold')}<span class="price">${fmt(cost)}</span></button>`}
        </div>`;
      }).join('')}</div>
      <div class="mhint t-dim">${icon('info')} Talents are permanent and apply to every hero. Earn gold from runs, quests and chests.</div>`;
  }

  tabsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sub]'); if (!b || b.dataset.sub === sub) return;
    sub = b.dataset.sub; tap(app);
    render();
    const sc = $(el, '.sub-scroll'); sc.scrollTop = 0;
    root.classList.add('enter');
  });
  delegate(root, {
    hero: (b) => { tap(app); openHero(b.dataset.id); },
    relic: (b) => { tap(app); openRelic(b.dataset.uid); },
    foe: (b) => { tap(app); openFoe(ctx, b.dataset.id); },
    talent: (b) => {
      const k = b.dataset.k;
      if (!upgradeTalent(app.profile, k)) { toast('Not enough gold'); return; }
      app.audio.sfx('coin'); app.haptic('light');
      flash = k;
      commit(app.profile);
    },
  });

  return { el, render, setSub: (s) => { sub = s; } };
}
