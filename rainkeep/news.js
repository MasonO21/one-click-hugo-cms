/*
 * Rainkeep: What's new. After an update a returning player sees the newest features once, each with a button
 * that opens it (or what opens it). New players start with it marked seen; it stays in the Menu.
 * Plugs into core through KH.hooks, KH.sheets, KH.side (the Menu) and KH.on('booted').
 */
'use strict';
(function () {
  const KH = window.KH;
  const { icon, esc } = KH.u;
  const { UI, ACT } = KH;
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  // (a missing key in an old save is filled from here, so the default must read as not seen)
  KH.hooks.defaults.push((s) => { s.newsSeen = ''; });

  ACT.news = () => { UI.sheet = { kind: 'news' }; };
  ACT.newsgo = (act) => { S.newsSeen = DATA.version; UI.sheet = null; if (ACT[act]) ACT[act](); };
  KH.on('booted', () => {
    if (!S) return;
    // a keep still on its intro has nothing to catch up on
    if (!S.seenIntro) { S.newsSeen = DATA.version; return; }
    if (S.newsSeen !== DATA.version) KH.queueSheet({ kind: 'news' });
  });

  KH.sheets.news = () => {
    S.newsSeen = DATA.version;
    const cards = DATA.news.map((n) => `<div class="section-label">Version ${esc(n.v)}</div>${n.items.map((it) => {
      const open = !it.open || it.open(S);
      return `<div class="card row news-item">${icon(it.icon, 'news-ic')}<div class="grow"><b>${esc(it.name)}</b><div class="muted small">${esc(it.text)}</div>
        ${open ? '' : `<div class="small news-need">${icon('i-lock')}Opens with ${esc(it.needs)}</div>`}</div>
        ${open && it.act ? `<button class="btn small gold" data-act="newsgo" data-arg="${it.act}">Go</button>` : ''}</div>`;
    }).join('')}`).join('');
    return { title: "What's new", lvl: `v${DATA.version.replace(/\.0$/, '')}`, body: `<p class="muted small">The latest additions to Rainkeep, newest first. This list stays in the Menu.</p>${cards}` };
  };

  KH.side.push({ id: 'news', icon: 'i-scroll', label: "What's new", act: 'news', show: () => true });
})();
