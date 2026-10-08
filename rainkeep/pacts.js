/*
 * Rainkeep: Pacts & Feuds. Every rival keep (rivals.js) holds you in some regard, from -100 to 100: gifts raise it,
 * raids lower it, and it drifts back toward indifference over the days. A rival that trusts you (50 and up) will
 * sign a pact: it sends tribute every 8 hours and warriors to stand on your walls when raiders come (more for each
 * pact, up to three), and it can't be raided while the pact holds. Breaking one turns the keep into an enemy. A
 * keep in a feud (-50 and below) sends its warband against your gate on its own every so often, so the choice is
 * which keeps to farm and which to befriend. Plugs into rivals.js (the rival's sheet, the standings, raids),
 * world.js (the attack button, the gate fight) and core through KH.hooks.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { fmtTime, icon, esc, rand, clamp } = KH.u;
  const { UI, ACT } = KH;
  const P = DATA.pacts;
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => {
    s.stats.gifts = 0; s.stats.pacts = 0; s.stats.pactMost = 0; s.stats.feudWins = 0;
  });

  const list = () => (KH.rivals ? KH.rivals.list() : []);
  const st = (r) => r.st || 0;
  const band = (v) => P.bands.reduce((a, b) => (v >= b[0] ? b : a), P.bands[0]);
  const slots = () => (S ? P.pact.slots.reduce((a, [w, n]) => (S.lv.wyrm >= w ? n : a), 0) : 0);
  const allies = () => list().filter((r) => r.pact);
  const allied = (k) => { const r = KH.rivals && KH.rivals.at(k); return !!(r && r.pact); };
  const feud = (r) => !r.pact && st(r) <= P.feud.at;
  const adjust = (r, d) => { r.st = clamp(st(r) + d, -100, 100); };
  const giftCost = () => KH.scaleReward(P.gift.cost);
  const giftWait = (r) => (r.giftAt == null ? 0 : Math.max(0, r.giftAt + P.gift.every - S.time));
  // allies on the walls: defense for the gate fight (world.js)
  const gate = () => Math.min(allies().length, 3) * P.pact.gate;

  // you raided a keep (rivals.js): it remembers
  function raided(id, win) {
    const r = list()[id];
    if (!r) return;
    if (win && feud(r)) S.stats.feudWins++;
    adjust(r, P.raid);
    if (feud(r) && !r.feudNext) r.feudNext = S.time + rand(P.feud.every[0], P.feud.every[1]);
  }

  KH.hooks.tick.push((dt, offline, log) => {
    if (!KH.rivals || !KH.rivals.open() || !dt) return;
    list().forEach((r, i) => {
      // regard fades back toward indifference, unless a pact holds
      if (!r.pact && st(r)) { const d = (P.drift * dt) / 86400; r.st = st(r) > 0 ? Math.max(0, st(r) - d) : Math.min(0, st(r) + d); }
      // tribute from an ally, every 8 hours
      if (r.pact) {
        if (!r.tribAt) r.tribAt = S.time + P.pact.every;
        for (let n = 0; n < 6 && S.time >= r.tribAt; n++) {
          r.tribAt += P.pact.every;
          const g = KH.scaleReward(P.pact.tribute);
          KH.grant(g);
          const what = `Tribute from ${r.name}, your ally on the Dunes.`;
          if (log) (log.marches = log.marches || []).push(what);
          else KH.toast(what, 'good');
        }
      }
      // a keep in a feud sends its warband on its own now and then (world.js brings it to the gate)
      if (feud(r)) {
        if (!r.feudNext) r.feudNext = S.time + rand(P.feud.every[0], P.feud.every[1]);
        else if (S.time >= r.feudNext) {
          r.feudNext = S.time + rand(P.feud.every[0], P.feud.every[1]);
          if (S.map.raid.from == null && !KH.rivals.peace()) {
            S.map.raid.from = i; S.map.raid.next = S.time + rand(DATA.rivals.strike.after[0], DATA.rivals.strike.after[1]); S.map.raid.warned = false;
            if (!offline) KH.toast(`${r.name} is in a feud with you, and its warband rides for your gate.`, 'warn');
          }
        }
      } else r.feudNext = 0;
    });
  });

  // ======================================================================
  // Actions
  // ======================================================================
  const rivalAt = (k) => (KH.rivals ? KH.rivals.at(k) : null);
  ACT.rivalgift = (k) => {
    const r = rivalAt(k);
    if (!r) return;
    if (giftWait(r) > 0) return KH.toast(`${r.name} had a gift from you lately. Another in ${fmtTime(giftWait(r))}.`, 'warn');
    const c = giftCost();
    if (!KH.canAfford(c)) return KH.toast('Not enough in the storehouse for a gift.', 'warn');
    KH.pay(c);
    r.giftAt = S.time;
    const was = band(st(r))[1];
    adjust(r, P.gift.gain);
    S.stats.gifts++;
    KH.emit('rivalGift', { k });
    KH.sfx('coin');
    const now = band(st(r))[1];
    KH.toast(`${r.warden} of ${r.name} accepts your gift.${now !== was ? ` They are ${now.toLowerCase()} now.` : ''}`, 'good');
  };
  ACT.rivalpact = (k) => {
    const r = rivalAt(k);
    if (!r || r.pact) return;
    if (st(r) < P.pact.need) return KH.toast(`${r.name} doesn't trust you enough for a pact yet.`, 'warn');
    if (allies().length >= slots()) return KH.toast(`You hold ${slots()} pact${slots() === 1 ? '' : 's'}, all your Rainwyrm's word can carry.`, 'warn');
    r.pact = true; r.tribAt = S.time + P.pact.every; r.feudNext = 0;
    S.stats.pacts++;
    S.stats.pactMost = Math.max(S.stats.pactMost || 0, allies().length);
    KH.emit('rivalPact', { k });
    KH.sfx('claim');
    KH.mail(`A pact with ${r.name}`, `${r.warden} of ${r.name} has set a seal beside yours. While the pact holds, ${r.name} sends tribute every ${P.pact.every / 3600} hours and warriors to your walls when raiders come, and your marches will not ride against it.`);
    KH.toast(`You and ${r.name} have a pact.`, 'good');
  };
  ACT.rivalbreak = (k) => {
    const r = rivalAt(k);
    if (!r || !r.pact) return;
    if (UI.breakAsk !== k) { UI.breakAsk = k; return KH.toast(`Tap again to break the pact. ${r.name} will not forgive it.`, 'warn'); }
    UI.breakAsk = null;
    r.pact = false; r.st = P.pact.broken; r.tribAt = 0;
    r.feudNext = S.time + rand(P.feud.every[0], P.feud.every[1]);
    KH.emit('rivalBreak', { k });
    KH.sfx('defeat');
    KH.toast(`The pact with ${r.name} is broken. They are in a feud with you now.`, 'warn');
  };

  // ======================================================================
  // On the rival's sheet and in the standings (rivals.js)
  // ======================================================================
  const meter = (v) => {
    const [, nm, col] = band(v), pct = (v + 100) / 2;
    return `<div class="pc-bar"><i class="pc-mid"></i><i class="pc-pin" style="left:${pct}%;background:${col}"></i></div><div class="row small"><span class="muted">Feud</span><span class="grow" style="text-align:center;color:${col}"><b>${esc(nm)}</b> · ${Math.round(v)}</span><span class="muted">Trusted</span></div>`;
  };
  function card(r) {
    if (!r) return '';
    const v = st(r), wait = giftWait(r), c = giftCost(), free = allies().length < slots();
    const say = r.pact ? `A pact holds. ${esc(r.name)} sends tribute every ${P.pact.every / 3600} hours (next in ${fmtTime(Math.max(0, (r.tribAt || 0) - S.time))}) and warriors to your walls when raiders come.`
      : feud(r) ? `${esc(r.name)} is in a feud with you and sends its warband against your gate on its own. Gifts can mend it, slowly.`
        : v >= P.pact.need ? `${esc(r.name)} trusts you. ${free ? 'It will sign a pact.' : `You already hold ${slots()} pact${slots() === 1 ? '' : 's'}.`}`
          : `Gifts raise ${esc(r.name)}'s regard; raids cost ${-P.raid}. At ${P.pact.need} it will sign a pact.`;
    const gift = `<button class="btn small ${wait || !KH.canAfford(c) ? 'off' : 'alt'}" data-act="rivalgift" data-arg="${r.k}">${icon('i-chest')}Gift${wait ? ` · ${fmtTime(wait)}` : ''}</button>`;
    const pact = r.pact ? `<button class="btn small alt" data-act="rivalbreak" data-arg="${r.k}">Break the pact</button>`
      : v >= P.pact.need && free ? `<button class="btn small gold" data-act="rivalpact" data-arg="${r.k}">${icon('i-peace')}Sign a pact</button>` : '';
    return `<div class="card stack pc-card"><div class="row"><b class="grow">Relations</b>${r.pact ? `<span class="chip pc-ally">${icon('i-peace')}Pact</span>` : ''}</div>${meter(v)}
      <div class="muted small">${say}</div><div class="row wrap" style="gap:6px">${r.pact ? '' : gift}${pact}</div>${r.pact ? '' : `<div class="costs small">${KH.costHTML(c)}</div>`}</div>`;
  }
  const tag = (r) => (r.pact ? ` <span class="pc-tag" style="color:${P.bands[4][2]}">pact</span>` : feud(r) ? ` <span class="pc-tag" style="color:${P.bands[0][2]}">feud</span>` : '');

  KH.pacts = { st, band, slots, allies, allied, feud, gate, raided, card, tag, giftWait, giftCost };
})();
