// Soul Altar (gacha): animated rune circle, visible pity counter, summon buttons, odds disclosure
// and the full-screen reveal sequence.
import { h, $, fmt, toast, modal, uiRoot, watchAd } from '../dom.js';
import { icon } from '../icons.js';
import { ALTAR, RARITY_COLOR, RARITY_LABEL, RARITY_MULT, RELICS, RELIC_TYPES, HEROES } from '../../game/data.js';
import { commit, summon, freeSummonAvailable } from '../../meta/economy.js';
import { cd, nextMidnight, bar, tap, delegate } from './util.js';
import { notEnough } from './panels.js';
import { HERO_ART, relicArt } from '../art.js';

const ORDER = ['legendary', 'epic', 'rare', 'common'];
const RUNES = [
  'M0-6V6M0-6l4 4M0-1l4 4', 'M-3 6V-6l6 6V6', 'M0-6V6M0-3l3 3-3 3', 'M-3-6 3 6M3-6-3 6',
  'M-3-6V6M3-6V6M-3-2l6 4', 'M0-6l3 6-3 6-3-6z', 'M-3-6 0-2l3-4M0-2V6', 'M-3 6V-6h6M-3 0h4',
];

/** Static rune-circle art (built once so its animations never restart). */
function circleArt() {
  const N = 24;
  const glyphs = Array.from({ length: N }, (_, i) => {
    const a = (i / N) * 360;
    return `<g transform="rotate(${a} 100 100) translate(100 13)"><path d="${RUNES[i % RUNES.length]}"/></g>`;
  }).join('');
  const ticks = Array.from({ length: 72 }, (_, i) => `<path transform="rotate(${i * 5} 100 100)" d="M100 ${i % 3 ? 26 : 24}V28"/>`).join('');
  const star = Array.from({ length: 5 }, (_, i) => {
    const a = (-90 + i * 144) * Math.PI / 180;
    return `${(100 + Math.cos(a) * 66).toFixed(2)},${(100 + Math.sin(a) * 66).toFixed(2)}`;
  }).join(' ');
  const nodes = Array.from({ length: 5 }, (_, i) => {
    const a = (-90 + i * 72) * Math.PI / 180;
    return `<circle cx="${(100 + Math.cos(a) * 66).toFixed(2)}" cy="${(100 + Math.sin(a) * 66).toFixed(2)}" r="3.4"/>`;
  }).join('');
  const motes = Array.from({ length: 16 }, (_, i) => `<i style="left:${(i * 61) % 100}%;animation-delay:${((i * 0.73) % 6).toFixed(2)}s;animation-duration:${(5 + (i % 5)).toFixed(1)}s"></i>`).join('');
  return `
    <div class="alt-motes">${motes}</div>
    <div class="alt-circle">
      <div class="alt-halo"></div>
      <div class="alt-conic"></div>
      <svg class="alt-ring-a" viewBox="0 0 200 200" aria-hidden="true">
        <circle cx="100" cy="100" r="96" class="ln"/><circle cx="100" cy="100" r="92" class="ln thin"/>
        <circle cx="100" cy="100" r="78" class="ln"/>
        <g class="ticks">${ticks}</g>
        <g class="runes">${glyphs}</g>
      </svg>
      <svg class="alt-ring-b" viewBox="0 0 200 200" aria-hidden="true">
        <circle cx="100" cy="100" r="66" class="ln"/>
        <polygon points="${star}" class="star"/>
        <g class="nodes">${nodes}</g>
        <circle cx="100" cy="100" r="26" class="ln thin"/>
      </svg>
      <div class="alt-core"><i></i></div>
    </div>`;
}

export function createAltar(ctx) {
  const { app } = ctx;
  const el = h(`<section class="pane pane-altar" data-tab="altar">
    <div class="alt-bg"></div>
    <div class="alt-col">
      <div class="alt-head"></div>
      <div class="alt-stage">${circleArt()}</div>
      <div class="alt-foot"></div>
    </div>
  </section>`);
  const head = $(el, '.alt-head');
  const foot = $(el, '.alt-foot');
  let busy = false;

  const payFor = (count) => {
    const p = app.profile;
    if (p.sigils >= count) return { cur: 'sigils', amt: count };
    return { cur: 'gems', amt: count === 10 ? ALTAR.cost10 : ALTAR.cost1 * count };
  };

  function render() {
    const p = app.profile;
    const left = Math.max(0, ALTAR.pityLegendary - p.altar.pity);
    const c1 = payFor(1), c10 = payFor(10);
    const free = freeSummonAvailable(p);
    head.innerHTML = `
      <div class="alt-top">
        <span class="alt-owned">${icon('sigils')}<b class="tnum">${fmt(p.sigils)}</b><small>${p.sigils === 1 ? 'Sigil' : 'Sigils'}</small></span>
        <button class="alt-odds" data-act="odds">${icon('info')} Odds &amp; rates</button>
      </div>
      <div class="alt-title t-display">Soul Altar</div>
      <div class="alt-sub">Summon relics and hero shards</div>`;
    foot.innerHTML = `
      <div class="pity panel">
        <div class="pity-top"><span>Legendary guaranteed within <b class="glow-gold tnum">${left}</b> ${left === 1 ? 'pull' : 'pulls'}</span><span class="t-dim tnum">${p.altar.pity}/${ALTAR.pityLegendary}</span></div>
        ${bar(p.altar.pity / ALTAR.pityLegendary, 'mbar-pity')}
      </div>
      <div class="sum-row">
        <button class="btn btn-soul sum-btn" data-act="s1">
          <span class="sum-l">Summon ×1</span>
          <span class="sum-c ${p[c1.cur] < c1.amt ? 'is-poor' : ''}">${icon(c1.cur)}<b class="tnum">${fmt(c1.amt)}</b></span>
        </button>
        <button class="btn btn-gem sum-btn sum-10" data-act="s10">
          <span class="sum-rib">Epic+ guaranteed</span>
          <span class="sum-l">Summon ×10</span>
          <span class="sum-c ${p[c10.cur] < c10.amt ? 'is-poor' : ''}">${icon(c10.cur)}<b class="tnum">${fmt(c10.amt)}</b></span>
        </button>
      </div>
      ${free
        ? `<button class="btn btn-ad btn-block sum-free" data-act="free">${icon('ad')} Free daily summon</button>`
        : `<div class="sum-free-wait t-dim">${icon('hourglass')} Next free summon in ${cd(nextMidnight(), 0, 'cd-strong')}</div>`}`;
  }

  async function doSummon(count, payWith) {
    const p = app.profile;
    if (busy) return;
    if (!payWith) {
      const c = payFor(count);
      if (p[c.cur] < c.amt) { notEnough(ctx, c.cur, c.amt); return; }
      payWith = c.cur;
    }
    busy = true;
    try {
      if (payWith === 'free') {
        const ok = await watchAd(app, 'free_summon');
        if (!ok) return;
      }
      const res = summon(p, count, payWith);
      if (!res.ok) { if (res.reason === 'free') toast('Free summon already used today'); else notEnough(ctx, res.reason, count === 10 ? ALTAR.cost10 : ALTAR.cost1); return; }
      commit(p);
      reveal(app, res.results, { again: () => doSummon(payWith === 'free' ? 1 : count) , againCount: payWith === 'free' ? 1 : count, payFor });
    } finally { busy = false; }
  }

  delegate(el, {
    s1: () => { tap(app, 'medium'); doSummon(1); },
    s10: () => { tap(app, 'medium'); doSummon(10); },
    free: () => { tap(app); doSummon(1, 'free'); },
    odds: () => { tap(app); openOdds(app); },
  });

  return { el, render };
}

// ---------------------------------------------------------------- odds disclosure (store policy)
export function openOdds(app) {
  const p = app.profile;
  const drops = (r) => Object.entries(ALTAR.shardDrops[r]).map(([hid, n]) => `<b style="color:${HEROES[hid].css}">${HEROES[hid].name} ×${n}</b>`).join(' or ');
  modal({
    title: 'Odds & rates',
    cls: 'mm-odds scroll',
    body: `<table class="odds">
        <thead><tr><th>Rarity</th><th>Chance</th><th>Stat power</th></tr></thead>
        <tbody>${ORDER.map((r) => `<tr style="--rc:${RARITY_COLOR[r]}"><td><i></i>${RARITY_LABEL[r]}</td><td class="tnum">${+(ALTAR.odds[r] * 100).toFixed(2)}%</td><td class="tnum">×${RARITY_MULT[r]}</td></tr>`).join('')}</tbody>
      </table>
      <div class="odds-sec"><div class="t-label">Pity rules</div>
        <ul>
          <li>A <b>Legendary</b> is guaranteed on your ${ALTAR.pityLegendary}th pull without one. Your counter: <b class="tnum">${p.altar.pity}/${ALTAR.pityLegendary}</b>. It resets whenever a Legendary drops.</li>
          <li>Every <b>10-pull</b> contains at least one <b>Epic or better</b>.</li>
          <li>The counter never resets on its own and carries across days.</li>
        </ul></div>
      <div class="odds-sec"><div class="t-label">Hero shards</div>
        <ul>
          <li>Epic pull: also grants ${drops('epic')} (equal chance).</li>
          <li>Legendary pull: also grants ${drops('legendary')} (equal chance).</li>
        </ul></div>
      <div class="odds-sec"><div class="t-label">Relics &amp; costs</div>
        <ul>
          <li>Each pull gives one of ${RELIC_TYPES.length} relic types with equal chance. Duplicates merge into +1 level (+15% stat, max Lv 10).</li>
          <li>1 pull: ${fmt(ALTAR.cost1)} gems or 1 sigil. 10 pulls: ${fmt(ALTAR.cost10)} gems or 10 sigils.</li>
          <li>One free summon per day with an optional video.</li>
        </ul></div>
      <div class="pf-note t-dim">${icon('info')} Total pulls so far: <b class="tnum">${fmt(p.altar.pulls)}</b>.</div>`,
    actions: [{ label: 'Got it', cls: 'btn-soul btn-block' }],
  });
}

// ---------------------------------------------------------------- reveal sequence
const FLIP_GAP = { common: 230, rare: 300, epic: 520, legendary: 950 };

export function reveal(app, results, { again, againCount = 1, payFor } = {}) {
  const multi = results.length > 1;
  const best = ORDER.find((r) => results.some((x) => x.rarity === r)) || 'common';

  // Progressive "Lv up" numbers when one pull merges into the same relic several times.
  const lv = new Map(); const shown = new Array(results.length);
  for (let i = results.length - 1; i >= 0; i--) {
    const r = results[i];
    if (!r.merged) { shown[i] = 1; continue; }
    const v = lv.has(r.relic.uid) ? lv.get(r.relic.uid) : r.relic.level;
    shown[i] = v; lv.set(r.relic.uid, v - 1);
  }

  const cards = results.map((r, i) => {
    const c = RARITY_COLOR[r.rarity];
    const sh = r.shards ? HEROES[r.shards.hero] : null;
    return `<div class="rv-card r-${r.rarity}" style="--rc:${c};--i:${i}">
      <div class="rv-in">
        <div class="rv-face rv-back"><span>${icon('altar')}</span></div>
        <div class="rv-face rv-front">
          ${sh && HERO_ART[r.shards.hero] ? `<i class="rv-art" style="background-image:url(${HERO_ART[r.shards.hero]})"></i>` : ''}
          <span class="rv-ic">${relicArt(r.relic.type)}</span>
          <span class="rv-name">${RELICS[r.relic.type].name}</span>
          <span class="rv-rar">${RARITY_LABEL[r.rarity]}</span>
          ${r.merged ? `<span class="rv-lv">Lv up! ${shown[i]}</span>` : '<span class="rv-new">New</span>'}
          ${sh ? `<span class="rv-sh" style="color:${sh.css}">${icon('shard')}<b>${multi ? '' : sh.name + ' '}×${r.shards.amount}</b></span>` : ''}
        </div>
      </div>
      <div class="rv-cburst"></div>
    </div>`;
  }).join('');

  const ov = h(`<div class="rv ${multi ? 'rv-multi' : 'rv-single'} best-${best}" style="--best:${RARITY_COLOR[best]}">
    <div class="rv-bg"></div>
    <div class="rv-charge"><i class="rv-ring"></i><i class="rv-ring r2"></i><i class="rv-rays"></i><i class="rv-orb"></i></div>
    <div class="rv-flash"></div>
    <div class="rv-gold"><i class="rv-gold-rays"></i></div>
    <div class="rv-head"><div class="rv-title t-display">The Altar stirs…</div><div class="rv-sub"></div></div>
    <div class="rv-grid">${cards}</div>
    <div class="rv-actions"><button class="btn btn-ghost btn-sm rv-skip" data-a="skip">Skip</button></div>
  </div>`);
  uiRoot().appendChild(ov);
  const cardEls = [...ov.querySelectorAll('.rv-card')];
  const timers = [];
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  let flipped = 0; let done = false; let goldPlayed = false;

  app.audio.sfx('summon');
  try { app.haptic('medium'); } catch (e) { /* optional */ }
  requestAnimationFrame(() => ov.classList.add('charging'));

  const legendaryFx = () => {
    if (goldPlayed) return; goldPlayed = true;
    app.audio.sfx('legendary'); try { app.haptic('heavy'); } catch (e) { /* optional */ }
    ov.classList.remove('gold-on', 'shake'); void ov.offsetWidth;
    ov.classList.add('gold-on', 'shake');
    setTimeout(() => ov.classList.remove('shake'), 700);
  };
  const flip = (i, quiet) => {
    const c = cardEls[i]; if (!c || c.classList.contains('flipped')) return;
    c.classList.add('flipped'); flipped++;
    const r = results[i].rarity;
    if (r === 'legendary') legendaryFx();
    else if (!quiet) {
      if (r === 'epic') { app.audio.sfx('chest'); try { app.haptic('medium'); } catch (e) { /* optional */ } ov.classList.remove('epic-on'); void ov.offsetWidth; ov.classList.add('epic-on'); }
      else app.audio.sfx(r === 'rare' ? 'gem' : 'click');
    }
    if (flipped === cardEls.length) finish();
  };

  function finish() {
    if (done) return; done = true;
    const counts = ORDER.map((r) => [r, results.filter((x) => x.rarity === r).length]).filter(([, n]) => n);
    $(ov, '.rv-title').textContent = best === 'legendary' ? 'Legendary!' : best === 'epic' ? 'Epic summon!' : 'Summon complete';
    $(ov, '.rv-sub').innerHTML = counts.map(([r, n]) => `<span style="color:${RARITY_COLOR[r]}">${n} ${RARITY_LABEL[r]}</span>`).join(' · ');
    const c = payFor ? payFor(againCount) : null;
    $(ov, '.rv-actions').innerHTML = `
      ${again && c ? `<button class="btn btn-gem" data-a="again">Again ×${againCount}<span class="rv-again-c">${icon(c.cur)}<b class="tnum">${fmt(c.amt)}</b></span></button>` : ''}
      <button class="btn btn-primary" data-a="close">Continue</button>`;
    ov.classList.add('finished');
  }

  // Timeline: charge-up, flash + deal, then flip one by one (rarer cards wait longer).
  const CHARGE = 1500;
  at(CHARGE, () => { ov.classList.add('dealt'); app.audio.sfx('select'); });
  let t = CHARGE + 380 + (multi ? cardEls.length * 45 : 0);
  results.forEach((r, i) => {
    t += FLIP_GAP[r.rarity];
    if (r.rarity === 'legendary') at(t - 520, () => cardEls[i].classList.add('tease'));
    if (r.rarity === 'epic') at(t - 260, () => cardEls[i].classList.add('tease'));
    at(t, () => flip(i));
  });

  const skip = () => {
    timers.forEach(clearTimeout);
    ov.classList.add('charging', 'dealt', 'skipped');
    cardEls.forEach((_, i) => flip(i, true));
  };
  ov.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (!b) { if (!done && ov.classList.contains('dealt')) skip(); return; }
    const a = b.dataset.a;
    if (a === 'skip') { tap(app); skip(); }
    else if (a === 'close') { tap(app); timers.forEach(clearTimeout); ov.classList.add('out'); setTimeout(() => ov.remove(), 220); }
    else if (a === 'again') { tap(app, 'medium'); timers.forEach(clearTimeout); ov.remove(); again && again(); }
  });
  return ov;
}
