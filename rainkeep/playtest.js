/*
 * Rainkeep: the closed playtest. Each tester's game keeps a small report of how they play and sends it through
 * KH.net (NETWORK.md, "Playtest report"): the days they played (for day-1, day-3 and day-7 retention), sessions
 * and time played, when they reached each first-session milestone, how far they got, which screens they opened,
 * their device, its start-up times and frame rate, any script errors, and the notes they write in Feedback.
 * The owner of the game's link (or an admin of the server) reads every tester's report on the Playtest sheet:
 * retention, the first-session funnel, progress, devices, errors and feedback, with a summary to copy.
 * Without a backend nothing leaves the device; the report and the feedback stay in the save.
 * Nothing here records names, messages or anything typed outside the Feedback box.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { icon, esc, fmt } = KH.u;
  const { UI, ACT } = KH;
  const net = KH.net;
  let S = null;
  KH.hooks.defaults.push((s) => { s.pt = { first: 0, last: 0, days: [], sessions: 0, secs: 0, ftue: {}, feat: {}, err: [], fb: [], rep: [], motd: null }; });
  const today = () => { const d = new Date(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 864e5); };
  const now = () => Date.now();

  // the first-session milestones, in the order a new player meets them
  const FTUE = [
    ['intro', 'Opened the keep', (s) => s.seenIntro],
    ['build', 'First upgrade started', (s) => s.stats.upgrades > 0 || s.builds.length > 0],
    ['battle', 'First expedition battle', (s) => s.stage > 1 || (s.stats.battles || 0) > 0],
    ['stage3', 'Stage 3 cleared', (s) => s.stage > 3],
    ['wyrm3', 'Rainwyrm Lv 3', (s) => s.lv.wyrm >= 3],
    ['hero', 'A second hero', (s) => Object.keys(s.heroes).length >= 2],
    ['stage10', 'Stage 10 cleared', (s) => s.stage > 10],
    ['caravan', 'Joined a Caravan', (s) => !!(s.caravan && s.caravan.joined) || !!(s.online && s.online.aid)],
    ['wyrm8', 'Rainwyrm Lv 8', (s) => s.lv.wyrm >= 8],
    ['stage30', 'Stage 30 cleared', (s) => s.stage > 30],
    ['act2', 'Act II', (s) => s.stage > DATA.actOneStage],
  ];

  KH.hooks.boot.push((fresh) => {
    S = KH.S;
    const P = S.pt, t = now();
    // a save from before playtest reports: its first session is long past, so it gives no funnel times
    if (!P.first) { P.first = t; if (S.stage > 1 || S.stats.upgrades > 0) P.old = true; }
    // a new session after half an hour away
    if (t - (P.last || 0) > 30 * 60000) P.sessions++;
    P.last = t;
    if (!P.days.includes(today())) P.days = P.days.concat(today()).slice(-60);
    void fresh;
  });

  // ---- what happens in play ----
  let lastT = 0, lastSheet = null, lastTab = null;
  const bump = (k) => { const f = S.pt.feat; f[k] = (f[k] || 0) + 1; };
  KH.hooks.tick.push(() => {
    if (!S || document.hidden) return;
    const t = now(), P = S.pt;
    if (lastT) P.secs += Math.min(5, (t - lastT) / 1000);
    lastT = t;
    P.last = t;
    if (!P.days.includes(today())) P.days = P.days.concat(today()).slice(-60);
    if (!P.old) for (const [k, , test] of FTUE) if (P.ftue[k] == null && test(S)) P.ftue[k] = Math.round((t - P.first) / 1000);
    const sk = UI.sheet ? UI.sheet.kind + (UI.sheet.id ? `:${UI.sheet.id}` : '') : null;
    if (sk && sk !== lastSheet) bump(sk);
    lastSheet = sk;
    if (UI.tab !== lastTab) { bump(`tab:${UI.tab}`); lastTab = UI.tab; }
  });
  // script errors: the message only, counted, the last twenty kinds
  const onErr = (m) => {
    if (!S || !m) return;
    m = String(m).replace(/\s+/g, ' ').slice(0, 160);
    const E = S.pt.err, e = E.find((x) => x.m === m);
    if (e) { e.n++; e.at = now(); } else { E.push({ m, n: 1, at: now() }); if (E.length > 20) E.shift(); }
  };
  window.addEventListener('error', (e) => onErr(e.message || (e.error && e.error.message)));
  window.addEventListener('unhandledrejection', (e) => onErr(`promise: ${e.reason && (e.reason.message || e.reason)}`));

  // ---- the report, sent through KH.net about once a minute when it changed ----
  function report() {
    const P = S.pt, g = KH.gfx ? KH.gfx.info() : {}, T = KH.timing || {};
    const feat = Object.entries(P.feat).sort((a, b) => b[1] - a[1]).slice(0, 60);
    return {
      v: 1, first: P.first, last: P.last, days: P.days, sessions: P.sessions, secs: Math.round(P.secs), ftue: P.ftue,
      stage: S.stage, wyrm: S.lv.wyrm, power: Math.round(KH.power()), ver: DATA.version,
      feat: Object.fromEntries(feat), spend: { n: (S.purchases || []).length || 0, usd: Math.round((S.spentUsd || 0) * 100) / 100 },
      dev: { tier: g.tier || null, gpu: (g.device && g.device.gpu) || '', mem: (g.device && g.device.mem) || 0, cores: (g.device && g.device.cores) || 0, w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1, ua: navigator.userAgent.slice(0, 120), ui: T.ui || null, keep3d: T.keep3d || null, dunes3d: T.dunes3d || null },
      fps: KH.gfx && KH.gfx.fps ? KH.gfx.fps() : null, err: P.err, fb: P.fb, rep: P.rep || [], old: !!P.old,
    };
  }
  KH.playtestReport = () => (S ? report() : null);
  let sent = '', sentAt = 0;
  function send(force) {
    if (!S || !net.online()) return;
    if (!force && now() - sentAt < 60000) return;
    const r = report(), key = JSON.stringify({ ...r, last: 0, secs: Math.round(r.secs / 60), fps: null });
    if (!force && key === sent) return;
    sent = key; sentAt = now();
    net.putTelemetry(r);
  }
  KH.hooks.tick.push(() => send(false));
  window.addEventListener('pagehide', () => send(true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) send(true); });

  // the makers' message of the day (live config), once per message
  KH.on('netReady', async (e) => {
    if (!e.online) return;
    send(true);
    const c = await net.config();
    if (!c || !S) return;
    const id = KH.netClean.str(String(c.motdId || ''), 40), motd = KH.netClean.str(c.motd, 200);
    if (motd && id && S.pt.motd !== id) {
      S.pt.motd = id;
      KH.mail('From the makers of Rainkeep', motd, null);
    }
  });

  // ======================================================================
  // Feedback: a rating and a note, sent with the report
  // ======================================================================
  ACT.feedback = () => { UI.sheet = { kind: 'feedback' }; UI.fbRate = UI.fbRate || 0; };
  ACT.fbrate = (n) => { UI.fbRate = Math.max(1, Math.min(5, +n || 0)); };
  ACT.fbsend = () => {
    const el = document.getElementById('fb-text');
    const t = KH.netClean.str(el ? el.value : '', 500);
    if (!UI.fbRate && !t) return KH.toast('Pick a rating or write a few words first.', 'warn');
    S.pt.fb = S.pt.fb.concat({ at: now(), r: UI.fbRate || 0, t, stage: S.stage, ver: DATA.version }).slice(-30);
    if (el) el.value = '';
    UI.fbRate = 0;
    send(true);
    KH.toast(net.online() ? 'Thank you. Your note went to the makers.' : 'Thank you. Your note is saved and goes out the next time the game is online.', 'good');
    UI.sheet = null;
  };
  KH.sheets.feedback = () => {
    const stars = [1, 2, 3, 4, 5].map((n) => `<button class="pt-star ${UI.fbRate >= n ? 'on' : ''}" data-act="fbrate" data-arg="${n}" aria-label="${n} of 5">${icon('i-star')}</button>`).join('');
    return {
      title: 'Feedback', lvl: '',
      body: `<p class="small">How is Rainkeep playing for you? Anything confusing, slow, broken or great: it all helps.</p>
        <div class="row pt-stars">${stars}</div>
        <label class="field"><span class="muted small">Your note (up to 500 letters)</span><textarea id="fb-text" maxlength="500" rows="5" placeholder="What happened, and where?"></textarea></label>
        <p class="muted small">Sent with your stage (${S.stage}) and the game's version. ${net.online() ? '' : 'You are offline: it goes out next time the game is online.'}</p>
        <button class="btn wide" data-act="fbsend">Send</button>`,
    };
  };
  KH.side.push({ id: 'feedback', icon: 'i-mail', label: 'Feedback', act: 'feedback', show: () => true });

  // ======================================================================
  // The owner's Playtest sheet: every tester's report, summed up
  // ======================================================================
  const T = { list: null, at: 0, names: {} };
  ACT.playtest = () => { UI.sheet = { kind: 'playtest' }; T.at = 0; load(); };
  ACT.ptremove = async (rid) => {
    const r = (T.reports || []).find((x) => x.rid === rid);
    if (!r || !net.isAdmin()) return;
    if (await net.removeMessage(r.ch, r.mid, r.rid)) { T.reports = T.reports.filter((x) => x.rid !== rid); KH.toast('Message removed.', 'good'); KH.renderAll(); }
  };
  ACT.ptcopy = () => {
    const txt = summaryText();
    try { navigator.clipboard.writeText(txt).then(() => KH.toast('Summary copied.', 'good'), () => KH.toast('Copying was refused. Select the summary and copy it instead.', 'warn')); } catch (e) { KH.toast('Copying is not available here.', 'warn'); }
  };
  async function load() {
    if (!net.isAdmin() || now() - T.at < 20000) return;
    T.at = now();
    const list = await net.allTelemetry();
    // each tester wrote their own report: anything not shaped as expected is dropped, so one odd report can't
    // break the sheet
    const arr = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object' && !Array.isArray(x)) : []);
    const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    T.list = list.filter((r) => r && typeof r === 'object' && r.first).map((r) => ({
      ...r, days: Array.isArray(r.days) ? r.days.filter((d) => Number.isFinite(d)) : [], err: arr(r.err), fb: arr(r.fb), rep: arr(r.rep),
      ftue: r.old ? {} : obj(r.ftue), feat: obj(r.feat), dev: obj(r.dev),
    }));
    // chat reports travel in the reporters' own reports; the ones whose message the owner removed drop off
    const removed = await net.moderation(), seen = new Set();
    T.reports = [];
    for (const r of T.list) for (const x of Array.isArray(r.rep) ? r.rep : []) {
      const mid = KH.netClean.idOf(x.mid), ch = KH.netClean.str(x.ch, 60);
      if (!mid || removed[mid] || seen.has(mid)) continue;
      seen.add(mid);
      T.reports.push({ rid: mid, mid, ch, by: KH.netClean.idOf(x.by), text: KH.netClean.str(x.text, 200), rep: r.id, rat: N(x.rat) });
    }
    // and the server's own reports (HTTP backend), each closed by its id there
    for (const x of await net.reports()) if (x && x.mid && !seen.has(x.mid)) { seen.add(x.mid); T.reports.push(x); }
    T.reports.sort((a, b) => b.rat - a.rat);
    T.names = await net.names(T.list.map((r) => r.id).concat(T.reports.map((r) => r.by)));
    KH.renderAll();
  }
  const N = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
  const med = (a) => { const s = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
  const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '–');
  function stats() {
    const L = T.list || [], dayNow = today();
    const firstDay = (r) => { const d = (r.days || []).map(N).filter(Boolean); return d.length ? Math.min(...d) : null; };
    const ret = (k) => {
      const due = L.filter((r) => firstDay(r) != null && dayNow - firstDay(r) >= k);
      const back = due.filter((r) => (r.days || []).map(N).includes(firstDay(r) + k));
      return { n: back.length, of: due.length };
    };
    const funnel = FTUE.map(([k, label]) => { const t = L.map((r) => r.ftue && N(r.ftue[k], NaN)).filter((x) => Number.isFinite(x)); return { k, label, n: t.length, med: med(t) }; });
    const errs = {};
    for (const r of L) for (const e of r.err || []) { const m = String(e.m || '').slice(0, 160); errs[m] = (errs[m] || 0) + N(e.n, 1); }
    const fb = [];
    for (const r of L) for (const f of r.fb || []) fb.push({ id: r.id, at: N(f.at), r: N(f.r), t: String(f.t || '').slice(0, 500), stage: N(f.stage) });
    fb.sort((a, b) => b.at - a.at);
    const tiers = {};
    for (const r of L) { const t = (r.dev && r.dev.tier) || '?'; tiers[t] = (tiers[t] || 0) + 1; }
    return {
      n: L.length, today: L.filter((r) => (r.days || []).map(N).includes(dayNow)).length, d1: ret(1), d3: ret(3), d7: ret(7),
      sessions: med(L.map((r) => N(r.sessions))), mins: med(L.map((r) => N(r.secs) / 60)), stage: med(L.map((r) => N(r.stage))), funnel,
      fps: med(L.map((r) => N(r.fps, NaN))), ui: med(L.map((r) => N(r.dev && r.dev.ui, NaN))), tiers,
      errs: Object.entries(errs).sort((a, b) => b[1] - a[1]).slice(0, 8), fb: fb.slice(0, 30),
      spend: L.reduce((s, r) => s + N(r.spend && r.spend.usd), 0), payers: L.filter((r) => N(r.spend && r.spend.usd) > 0).length,
    };
  }
  function summaryText() {
    const s = stats();
    const lines = [`Rainkeep playtest, ${new Date().toISOString().slice(0, 10)}: ${s.n} testers, ${s.today} played today.`,
      `Retention: day 1 ${pct(s.d1.n, s.d1.of)} (${s.d1.n}/${s.d1.of}), day 3 ${pct(s.d3.n, s.d3.of)} (${s.d3.n}/${s.d3.of}), day 7 ${pct(s.d7.n, s.d7.of)} (${s.d7.n}/${s.d7.of}).`,
      `Median: ${s.sessions ?? '–'} sessions, ${s.mins != null ? Math.round(s.mins) : '–'} minutes played, stage ${s.stage ?? '–'}. Simulated spend $${s.spend.toFixed(2)} from ${s.payers} testers.`,
      'First-session funnel:', ...s.funnel.map((f) => `  ${f.label}: ${pct(f.n, s.n)}${f.med != null ? ` (median ${Math.round(f.med / 60)} min in)` : ''}`),
      `Devices: ${Object.entries(s.tiers).map(([k, v]) => `${k} ${v}`).join(', ')}; median ${s.fps ?? '–'} fps in the keep, first screen at ${s.ui != null ? `${(s.ui / 1000).toFixed(1)} s` : '–'}.`,
      'Errors:', ...(s.errs.length ? s.errs.map(([m, n]) => `  ${n}× ${m}`) : ['  none']),
      'Feedback:', ...(s.fb.length ? s.fb.map((f) => `  [${f.r || '-'}/5, stage ${f.stage}] ${f.t}`) : ['  none'])];
    return lines.join('\n');
  }
  KH.sheets.playtest = () => {
    if (!net.isAdmin()) { UI.sheet = null; return { title: '', body: '' }; }
    load();
    if (!T.list) return { title: 'Playtest', lvl: '', body: '<p class="muted">Reading the testers\' reports…</p>' };
    const s = stats();
    const card = (v, label) => `<div class="pt-kpi"><b>${v}</b><span>${label}</span></div>`;
    const funnel = s.funnel.map((f) => `<div class="row pt-f"><span class="grow small">${esc(f.label)}</span><div class="pt-bar"><i style="width:${s.n ? (100 * f.n) / s.n : 0}%"></i></div><b class="small">${pct(f.n, s.n)}</b></div>`).join('');
    const people = (T.list || []).slice().sort((a, b) => N(b.last) - N(a.last)).slice(0, 40).map((r) => `<div class="row pt-p"><div class="grow small"><b>${esc(T.names[r.id] || 'A tester')}</b><div class="muted">${(r.days || []).length} day${(r.days || []).length === 1 ? '' : 's'} · ${Math.round(N(r.secs) / 60)} min · stage ${N(r.stage)} · Wyrm ${N(r.wyrm)}${r.dev && r.dev.tier ? ` · ${esc(r.dev.tier)}` : ''}${r.fps ? ` · ${N(r.fps)} fps` : ''}</div></div><span class="muted small">${new Date(N(r.last)).toLocaleDateString()}</span></div>`).join('');
    const fb = s.fb.map((f) => `<div class="pt-fb"><div class="muted small">${esc(T.names[f.id] || 'A tester')} · ${f.r ? `${f.r}/5 · ` : ''}stage ${f.stage} · ${new Date(f.at).toLocaleDateString()}</div><p class="small">${esc(f.t) || '<i>no note</i>'}</p></div>`).join('');
    const errs = s.errs.map(([m, n]) => `<div class="row small"><b>${n}×</b><span class="grow">${esc(m)}</span></div>`).join('');
    return {
      title: 'Playtest', lvl: `${s.n} testers`,
      body: `<div class="pt-kpis">${card(s.n, 'testers')}${card(s.today, 'played today')}${card(pct(s.d1.n, s.d1.of), `day 1 (${s.d1.of})`)}${card(pct(s.d3.n, s.d3.of), `day 3 (${s.d3.of})`)}${card(pct(s.d7.n, s.d7.of), `day 7 (${s.d7.of})`)}${card(s.mins != null ? Math.round(s.mins) : '–', 'median minutes')}</div>
        <p class="muted small">Retention counts testers who came back exactly that many days after their first. Genre targets for a soft launch: about 40% day 1, 15% day 7.</p>
        <div class="section-label">First session</div><div class="card stack">${funnel}</div>
        <div class="section-label">Devices</div><div class="card stack small"><div>${Object.entries(s.tiers).map(([k, v]) => `${esc(k)} ${v}`).join(' · ')}</div><div class="muted">Median ${s.fps ?? '–'} fps in the keep · first screen at ${s.ui != null ? `${(s.ui / 1000).toFixed(1)} s` : '–'}</div></div>
        <div class="section-label">Feedback</div><div class="card stack">${fb || '<p class="muted small">No notes yet.</p>'}</div>
        ${(T.reports || []).length ? `<div class="section-label">Reported messages</div><div class="card stack">${T.reports.map((r) => `<div class="row pt-p"><div class="grow small"><b>${esc(T.names[r.by] || 'A player')}</b> in ${r.ch === 'world' ? 'the Square' : 'a Caravan'}: "${esc(r.text)}"</div><button class="btn small" data-act="ptremove" data-arg="${esc(r.rid)}">Remove</button></div>`).join('')}</div>` : ''}
        <div class="section-label">Errors</div><div class="card stack">${errs || '<p class="muted small">None reported.</p>'}</div>
        <div class="section-label">Testers</div><div class="card stack">${people || '<p class="muted small">No reports yet. Share the game\'s link (Contributor access) and they appear as people play.</p>'}</div>
        <div class="row"><button class="btn alt grow" data-act="ptcopy">Copy summary</button><button class="btn alt grow" data-act="playtest">Refresh</button></div>`,
    };
  };
  KH.side.push({ id: 'playtest', icon: 'i-scroll', label: 'Playtest', act: 'playtest', show: () => net.isAdmin() });
  // a chat message reported from the Square or a Caravan (mp.js): kept with this player's report, last twenty
  const addReport = (r) => {
    if (!S) return false;
    S.pt.rep = (S.pt.rep || []).filter((x) => x.mid !== r.mid).concat({ ...r, rat: now() }).slice(-20);
    send(true);
    return true;
  };
  KH.playtest = { FTUE, stats, summaryText, addReport, report: () => (S ? report() : null) };
})();
