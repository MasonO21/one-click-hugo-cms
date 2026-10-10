/*
 * Rainkeep: Ready now. The keep has many things running at once, and each marks itself with a dot when something
 * waits for the player (attacks left on the Leviathan, a full stack of Trowels, a decree ready, dishes to cook). This
 * gathers every one of them into one list with a button each, along with idle builders, an idle Archive or Barracks
 * and a quest to claim, so nothing waits unseen. A standing entry on the rail shows how many are ready.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { icon, esc } = KH.u;
  const { UI, ACT } = KH;
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });

  // everything waiting for the player: [{ icon, label, why, act, arg, key }], worked out at most once a moment
  let memo = { at: 0, t: -1, list: [] };
  function items() {
    if (!S) return [];
    const now = Date.now();
    if (memo.t === S.time && now - memo.at < 400) return memo.list;
    memo = { at: now, t: S.time, list: gather() };
    return memo.list;
  }
  function gather() {
    const out = [];
    const q = DATA.quests[S.quest];
    if (q && q.check(S)) out.push({ key: 'quest', icon: 'i-scroll', label: 'Chapter quest', why: q.text, act: 'claimquest', arg: '', now: true });
    const idle = S.builders - S.builds.length;
    if (idle > 0) {
      const target = q && !q.check(S) && q.go.startsWith('plot:') ? q.go : 'tab:town';
      out.push({ key: 'builder', icon: 'i-hammer', label: idle > 1 ? `${idle} builders idle` : 'A builder is idle', why: target.startsWith('plot:') ? `The quest wants the ${KH.plotName(target.slice(5))}` : 'Choose something to build', act: 'go', arg: target });
    }
    if (S.lv.archive && !S.research) out.push({ key: 'research', icon: 'i-journal', label: 'The Archive is idle', why: 'Start a research project', act: 'plot', arg: 'archive' });
    if (S.lv.barracks && !S.training) out.push({ key: 'training', icon: 'i-people', label: 'The Barracks is idle', why: 'Train troops', act: 'plot', arg: 'barracks' });
    for (const b of KH.side) {
      if (b.id === 'ready' || (b.show && !b.show()) || !(b.dot && b.dot())) continue;
      const badge = b.badge ? b.badge() : '';
      out.push({ key: b.id, icon: b.icon, label: b.label, why: badge || 'Something is waiting', act: b.act, arg: b.arg || '' });
    }
    return out;
  }
  KH.readyItems = items;

  ACT.ready = () => { UI.sheet = { kind: 'ready' }; };
  KH.sheets.ready = () => {
    const list = items();
    const rows = list.map((it) => `<div class="row rd-row">${icon(it.icon, 'rd-ic')}<div class="grow"><b>${esc(it.label)}</b><div class="muted small">${esc(it.why)}</div></div>
      <button class="btn small ${it.now ? 'gold' : 'alt'}" data-act="${it.now ? it.act : 'hubopen'}" data-arg="${it.now ? it.arg : `ready|${it.act}|${it.arg}`}">${it.now ? 'Claim' : 'Go'}</button></div>`).join('');
    return {
      title: 'Ready now', lvl: `${list.length}`,
      body: list.length ? `<p class="muted small">Everything in the keep that is waiting for you, in one place.</p><div class="card stack">${rows}</div>`
        : '<p class="muted">Nothing is waiting. The keep is running on its own for now.</p>',
    };
  };
  KH.side.push({ id: 'ready', icon: 'i-check', label: 'Ready', act: 'ready', pin: true, show: () => !!S && S.quest >= 6, dot: () => items().length > 0, badge: () => `${items().length}` });
})();
