/*
 * Rainkeep: the Sparring Ring. Heroes off the squad fall far behind it, because the squad gets the journals, so a
 * kinship partner, a hero whose skill answers a foe's trait or a party for a far journey is rarely worth fielding.
 * From Rainwyrm Lv 10 up to four of them (six with Starglass) can sit in the ring, where they spar with the squad and
 * fight at its level: the lowest level among the squad's heroes, never past a seated hero's own cap. A seat whose
 * hero leaves can't seat another for twelve hours, so the ring is a choice and not a rotation. heroStats asks
 * KH.sparLevel (core.js); the ring sits on the Heroes tab and each hero's sheet.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { fmtTime, icon, esc } = KH.u;
  const { UI, ACT } = KH;
  const P = DATA.spar, HERO = Object.fromEntries(DATA.heroes.map((h) => [h.id, h]));
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => { s.spar = { seats: Array.from({ length: P.seats }, () => ({ id: null, until: 0 })), bought: 0 }; s.stats.sparSeated = 0; });

  const unlocked = () => !!S && S.lv.wyrm >= P.unlock;
  const seats = () => (S && S.spar ? S.spar.seats : []);
  const seatOf = (id) => seats().findIndex((x) => x.id === id);
  // the squad's level: its lowest hero's
  const squadLevel = () => {
    const lv = (S.squad || []).filter((id) => S.heroes[id]).map((id) => S.heroes[id].lvl);
    return lv.length ? Math.min(...lv) : 1;
  };
  KH.sparLevel = (id) => {
    const h = S && S.heroes[id];
    if (!h) return 1;
    if (!unlocked() || seatOf(id) < 0 || S.squad.includes(id)) return h.lvl;
    return Math.max(h.lvl, Math.min(squadLevel(), KH.heroCap(id)));
  };
  const name = (id) => esc(HERO[id].name.split(' ')[0]);

  ACT.sparpick = (i) => { if (!unlocked()) return; UI.sheet = { kind: 'spar', seat: +i }; };
  ACT.sparset = (arg) => {
    const [i, id] = String(arg).split(':'), seat = seats()[+i];
    if (!seat || !S.heroes[id] || S.squad.includes(id) || seatOf(id) >= 0) return;
    if (seat.id) return KH.toast('Take the hero out of this seat first.', 'warn');
    if (seat.until > S.time) return KH.toast(`This seat is free again in ${fmtTime(seat.until - S.time)}.`, 'warn');
    seat.id = id;
    S.stats.sparSeated = seats().filter((x) => x.id).length;
    KH.sfx('claim');
    KH.toast(`${name(id)} spars with the squad: Lv ${KH.sparLevel(id)} in a fight.`, 'good');
    UI.sheet = null;
  };
  ACT.sparout = (i) => {
    const seat = seats()[+i];
    if (!seat || !seat.id) return;
    KH.toast(`${name(seat.id)} leaves the ring. The seat is free again in ${fmtTime(P.cooldown)}.`, '');
    seat.id = null; seat.until = S.time + P.cooldown;
    UI.sheet = null;
  };
  ACT.sparbuy = () => {
    const n = S.spar.bought, cost = P.extra[n];
    if (cost == null) return;
    if (S.starglass < cost) return KH.toast(`A new seat costs ${cost} Starglass.`, 'warn');
    S.starglass -= cost; S.spar.bought++;
    S.spar.seats.push({ id: null, until: 0 });
    KH.sfx('upgrade');
    KH.toast('A new seat in the Sparring Ring.', 'good');
  };
  // a hero who joins the squad gives up the seat (and the seat starts over at once)
  KH.hooks.tick.push(() => {
    if (!S || !S.spar) return;
    for (const seat of S.spar.seats) if (seat.id && (!S.heroes[seat.id] || S.squad.includes(seat.id))) { seat.id = null; seat.until = 0; }
  });

  // the picker: heroes off the squad, strongest first, with the level each would fight at
  KH.sheets.spar = () => {
    const i = UI.sheet.seat, lv = squadLevel();
    const pool = Object.keys(S.heroes).filter((id) => !S.squad.includes(id) && seatOf(id) < 0).sort((a, b) => S.heroes[b].stars - S.heroes[a].stars || KH.heroPower(b) - KH.heroPower(a));
    const rows = pool.map((id) => {
      const h = S.heroes[id], at = Math.max(h.lvl, Math.min(lv, KH.heroCap(id)));
      return `<button class="row sp-pick" data-act="sparset" data-arg="${i}:${id}">${KH.art.portrait(id)}<div class="grow"><b>${esc(HERO[id].name)}</b><div class="small">Lv ${h.lvl} → <b>Lv ${at}</b> in a fight${at < lv ? ` (capped by ${h.stars}★)` : ''}</div><div class="muted small">${esc(DATA.battle.skills[KH.skillKind(id)].name)}${KH.kinships && KH.kinships.of(id) ? ` · ${esc(KH.kinships.of(id).name)}` : ''}</div></div></button>`;
    }).join('');
    return {
      title: 'The Sparring Ring', lvl: `Squad Lv ${lv}`,
      body: `<p class="muted small">A hero in the ring fights at the squad's level (its lowest hero's, Lv ${lv} now), up to their own level cap.</p><div class="stack">${rows || '<p class="muted">Every hero is in the squad or the ring.</p>'}</div>`,
    };
  };
  // the ring on the Heroes tab
  const prevRoster = KH.rosterExtras;
  KH.rosterExtras = () => {
    const before = prevRoster ? prevRoster() : '';
    if (!unlocked()) return before;
    const lv = squadLevel();
    const slot = (seat, i) => (seat.id
      ? `<button class="slot sp-seat on" data-act="sparout" data-arg="${i}" aria-label="${name(seat.id)} leaves the ring">${KH.art.portrait(seat.id)}<small>Lv ${KH.sparLevel(seat.id)}</small></button>`
      : seat.until > S.time ? `<div class="slot sp-seat wait"><small>${fmtTime(seat.until - S.time)}</small></div>`
        : `<button class="slot sp-seat" data-act="sparpick" data-arg="${i}" aria-label="Seat a hero">+</button>`);
    const more = P.extra[S.spar.bought];
    return `${before}<div class="card stack sp-ring"><div class="row"><b class="grow">${icon('i-duel')}Sparring Ring</b><span class="chip">Squad Lv ${lv}</span></div>
      <div class="muted small">Heroes here fight at the squad's level. Tap a seated hero to take them out (the seat rests ${Math.round(P.cooldown / 3600)} hours).</div>
      <div class="sp-seats">${seats().map(slot).join('')}${more != null ? `<button class="slot sp-seat buy" data-act="sparbuy" aria-label="A new seat">${icon('i-gem')}<small>${more}</small></button>` : ''}</div></div>`;
  };
  // the hero sheet: in the ring, or a way in
  KH.heroSpar = (id) => {
    if (!unlocked() || !S.heroes[id] || S.squad.includes(id)) return '';
    const i = seatOf(id), h = S.heroes[id];
    if (i >= 0) return `<div class="card row sp-hero on">${icon('i-duel')}<div class="grow"><b>In the Sparring Ring</b><div class="small">Fights at Lv ${KH.sparLevel(id)} (own Lv ${h.lvl}).</div></div><button class="btn small alt" data-act="sparout" data-arg="${i}">Leave</button></div>`;
    const free = seats().findIndex((x) => !x.id && x.until <= S.time);
    return free >= 0 ? `<div class="card row sp-hero">${icon('i-duel')}<div class="grow"><b>Sparring Ring</b><div class="small">Would fight at Lv ${Math.max(h.lvl, Math.min(squadLevel(), KH.heroCap(id)))} in the ring.</div></div><button class="btn small" data-act="sparset" data-arg="${free}:${id}">Seat</button></div>` : '';
  };
  KH.spar = { unlocked, seats, squadLevel, seatOf };
})();
