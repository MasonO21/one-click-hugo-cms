// Automated smoke playtest: boots the game headless and drives a bot through every major system.
// usage: npm run playtest            (starts its own dev server on :5199)
//        node scripts/playtest.mjs http://localhost:5173/   (use a running server)
import { execSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pw = require(execSync('npm root -g').toString().trim() + '/playwright');
let URL = process.argv[2];
let server = null;
if (!URL) {
  URL = 'http://localhost:5199/';
  server = spawn('npx', ['vite', '--port', '5199', '--strictPort'], { cwd: new globalThis.URL('..', import.meta.url).pathname, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await fetch(URL); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }
}

// In-page bot: flees the horde, circle-strafes the boss, walks into good gates, picks the first card.
const BOT = `window.__bot = (secs, god) => {
  const app = window.__soulswarm, r = app.run;
  if (god && !r.__god) { r.__god = true; r.player.hurt = () => {}; }
  for (let i = 0; i < Math.round(secs * 30); i++) {
    if (app.run !== r || r.ended) break;
    const P = r.player; let fx = 0, fz = 0;
    r.enemies.query(P.x, P.z, 7, (e) => { if (e.type === 'boss') return; const dx = P.x - e.x, dz = P.z - e.z, d2 = dx * dx + dz * dz + 0.5; fx += dx / d2; fz += dz / d2; });
    const B = r.bossEnemy;
    if (B && B.active) { const dx = B.x - P.x, dz = B.z - P.z, d = Math.hypot(dx, dz) || 1, pull = d > 7.5 ? 1.2 : d < 5 ? -1.6 : 0; fx += dx / d * pull - dz / d * 0.8; fz += dz / d * pull + dx / d * 0.8; }
    if (r.gates.pair && !r.gates.pair.done) { const g = r.gates.pair.gates.find((G) => G.op.type === 'mul' || G.op.type === 'add'); if (g) { const dx = g.x - P.x, dz = g.z - P.z, l = Math.hypot(dx, dz); fx += dx / l * 1.5; fz += dz / l * 1.5; } }
    fx += Math.cos(r.time * 0.35) * 0.25; fz += Math.sin(r.time * 0.35) * 0.25;
    const l = Math.hypot(fx, fz) || 1;
    r.input.keys.clear(); r.input.tx = fx / l; r.input.tz = fz / l; r.input.moved = true;
    if (r.levelPending) { const c = document.querySelector('.lvl-back .card'); if (c) c.click(); }
    if (!r.levelPending && (r.levelQueue > 0 || r.chestQueue > 0)) r.showLevelUp();
    if (r.nova >= 1 && r.legion.count > 25) r.ui.wantsNova = true;
    if (r.paused && r.player.dead) { r.revive(false); document.querySelectorAll('.modal-back').forEach((n) => n.remove()); }
    r.update(1 / 30);
  }
  r.input.tx = r.input.tz = 0;
  return { t: Math.round(r.time), kills: r.counters.kills, legion: r.legion.count, peak: r.legion.peak, level: r.level, novas: r.counters.novas, gates: r.counters.gates, bossKills: r.bossKills, bossDead: r.bossDead, ended: r.ended };
};`;

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
async function session(fn) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_|net::|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.evaluate(BOT);
  // the suite runs on any day: a weekend Blood Moon (8 elites, a darker blood-red world) only where a test turns it on
  await page.evaluate(() => { const p = window.__soulswarm && window.__soulswarm.profile; if (p) p.flags.bloodMoon = 'off'; });
  try { await fn(page, errors); } catch (e) { errors.push('harness: ' + e.message); }
  await ctx.close();
  return errors;
}
let errs;
// 50. Update 14: privacy, consent and analytics. A neutral age gate (once) sets a band; adults and older teens get a
//     consent sheet (analytics and personalised ads, both off until chosen); children get restricted mode (no purchases,
//     nothing measured, non-personalised ads). Settings → Privacy shows the player ID and the choices, exports the data
//     and deletes it. Events queue on the device only with consent, carrying only their listed properties.
errs = await session(async (page) => {
  const s = await page.evaluate(async () => {
    const D = await import('/src/game/data.js'), PV = await import('/src/meta/privacy.js'), save = await import('/src/meta/save.js'), eco = await import('/src/meta/economy.js');
    const app = window.__soulswarm, p = app.profile, A = app.analytics, out = {};
    const wait = (ms) => new Promise((r) => setTimeout(r, ms)), q = (sel) => document.querySelector(sel), qa = (sel) => [...document.querySelectorAll(sel)];
    const year = new Date().getFullYear();
    // automated browsers answer as an adult who chose "Necessary only"; nothing was shown or measured
    out.auto = { band: p.privacy.band, asked: p.privacy.asked, consent: { ...p.privacy.consent }, gate: !!q('.mm-gate'), id: /^ss-[0-9a-f]{12}$/.test(p.privacy.id), events: A.events().length };
    // the gate, as a new player meets it: no year suggested, Continue waits for one, then the consent sheet
    p.privacy = PV.blankPrivacy(); A.clear();
    let done = 0; app.privacy.openAgeGate(() => { done++; }); await wait(50);
    const sel = q('.mm-gate .pv-year'), go = q('.mm-gate .pv-go');
    out.gate = { open: !!q('.mm-gate'), placeholder: sel.value === '', disabled: go.disabled, years: sel.options.length - 1, dismiss: !q('.mm-gate .modal-x') };
    sel.value = String(year - 30); sel.dispatchEvent(new Event('change')); go.click(); await wait(50);
    out.gate.band = p.privacy.band; out.gate.closed = !q('.mm-gate');
    const sheet = q('.mm-consent');
    out.sheet = { open: !!sheet, toggles: qa('.mm-consent .tgl').length, offAll: qa('.mm-consent .tgl').every((t) => !t.classList.contains('on')), buttons: qa('.mm-consent .modal-actions .btn').map((b) => b.textContent).join('|') };
    qa('.mm-consent .modal-actions .btn').find((b) => b.textContent === 'Necessary only').click(); await wait(50);
    out.sheet.after = { ...p.privacy.consent, asked: p.privacy.asked, done, events: A.events().length };
    // changing one's mind in Settings: analytics on → runs are measured, only with their listed properties
    app.privacy.openConsent('settings'); await wait(50);
    q('.mm-consent .tgl[data-k="analytics"]').click(); qa('.mm-consent .modal-actions .btn').find((b) => b.textContent === 'Save my choices').click(); await wait(50);
    out.on = { ...p.privacy.consent };
    p.flags.tutorialDone = true; p.flags.hints = { move: 1, raise: 1, gates: 1, nova: 1, rite: 1 }; p.flags.bloodMoon = 'off'; p.energy = 30;
    app.startRun(1); const r = app.run; r.player.hurt = () => {}; app.engine.manual = true;
    for (let i = 0; i < 30 * 3; i++) app.engine.step(1 / 30);
    r.end(false); await wait(50); app.exitRun(); app.engine.manual = false; await wait(50);
    const ev = A.events(), names = ev.map((e) => e.n);
    const start = ev.find((e) => e.n === 'run_start'), end = ev.find((e) => e.n === 'run_end');
    out.events = { names: [...new Set(names)].join(','), start: start && start.p, end: end && end.p, user: ev.every((e) => e.u === p.privacy.id), session: new Set(ev.map((e) => e.s)).size,
      allowed: ev.every((e) => Object.keys(e.p).every((k) => D.ANALYTICS.events[e.n].includes(k))), noYear: !JSON.stringify(ev).includes(String(year - 30)) };
    out.track = { unknown: A.track('made_up', { x: 1 }), text: (A.track('quest_claim', { quest: 'free text with spaces!' }), A.events().slice(-1)[0].p) };
    for (let i = 0; i < 600; i++) A.track('screen_view', { screen: 'shop' });
    out.cap = A.events().length;
    // withdrawing consent empties the queue and stops measuring
    app.privacy.openConsent('settings'); await wait(50);
    qa('.mm-consent .modal-actions .btn').find((b) => b.textContent === 'Necessary only').click(); await wait(50);
    out.off = { queue: A.events().length, tracked: A.track('screen_view', { screen: 'shop' }) };
    // a child: restricted mode (no consent sheet, no purchases or paid offers, non-personalised ads)
    p.privacy = PV.blankPrivacy(); done = 0;
    app.privacy.openAgeGate(() => { done++; }); await wait(50);
    q('.mm-gate .pv-year').value = String(year - 9); q('.mm-gate .pv-year').dispatchEvent(new Event('change')); q('.mm-gate .pv-go').click(); await wait(80);
    out.child = { band: p.privacy.band, sheet: !!q('.mm-consent'), done, purchase: PV.canPurchase(p), ads: PV.adsPersonalised(p), track: PV.canTrack(p) };
    p.purchases.starterExpires = Date.now() + 864e5; p.purchases.starterBought = false; eco.commit(p); app.meta.show('battle'); app.meta.refresh(); await wait(80);
    out.child.starterFab = !!q('.hm [data-act="starter"]'); out.child.pactFab = !!q('.hm [data-act="pact"]');
    const { purchaseFlow } = await import('/src/ui/dom.js');
    purchaseFlow(app, D.GEM_SKUS[0]); await wait(50); out.child.buySheet = !!q('.modal-purchase');
    q('[data-nav="shop"]').click(); await wait(250); out.child.banner = !!q('.shop-locked');
    q('[data-nav="battle"]').click(); await wait(100);
    // teens: an EU 15-year-old is asked nothing (analytics and personalised ads stay off); elsewhere, analytics only
    const t = { privacy: PV.blankPrivacy() }; PV.answerGate(t, year - 16, true); out.teenEU = { band: t.privacy.band, consent: PV.needsConsent(t), a: PV.canAskAnalytics(t), ads: PV.canAskAds(t) };
    const u = { privacy: PV.blankPrivacy() }; PV.answerGate(u, year - 16, false); out.teen = { band: u.privacy.band, consent: PV.needsConsent(u), a: PV.canAskAnalytics(u), ads: PV.canAskAds(u) };
    // teens' monthly spending limits: $50 under 16, $100 at 16–17, this calendar month's list prices
    const buyer = (age, spent) => ({ privacy: (() => { const o = { privacy: PV.blankPrivacy() }; PV.answerGate(o, year - age - 1, false); return o.privacy; })(), purchases: { history: spent ? [{ sku: 'x', t: Date.now(), price: spent }, { sku: 'y', t: Date.now() - 40 * 864e5, price: 500 }] : [] } });
    const b15 = buyer(15, 45), b17 = buyer(17, 95), b30 = buyer(30, 999);
    out.caps = { cap15: PV.spendCap(b15), ok15: PV.purchaseBlock(b15, 4.99), no15: PV.purchaseBlock(b15, 9.99), cap17: PV.spendCap(b17), no17: PV.purchaseBlock(b17, 9.99), adult: PV.purchaseBlock(b30, 99.99), child: PV.purchaseBlock(buyer(9, 0), 0.99) };
    // saves: one from before Update 14 meets the gate once and gets an ID; a tampered band follows the year; a new policy asks again
    const KEY = 'soulswarm.save.v1', load = (v) => { localStorage.setItem(KEY, JSON.stringify(v)); const x = save.loadProfile(); localStorage.removeItem(KEY); return x; };
    const old = load({ v: 2, gold: 5 }), bad = load({ v: 2, privacy: { id: 'x', band: 'adult', birthYear: year - 8, consent: { analytics: true, ads: true }, asked: 1 } });
    out.save = { gate: PV.needsGate(old), id: /^ss-/.test(old.privacy.id), bad: [bad.privacy.band, bad.privacy.consent.analytics, bad.privacy.consent.ads, /^ss-/.test(bad.privacy.id)].join() };
    const adult = { privacy: PV.blankPrivacy() }; PV.answerGate(adult, year - 40, false); PV.setConsent(adult, { analytics: true, ads: false });
    out.policy = { now: PV.needsConsent(adult) }; adult.privacy.asked = D.PRIVACY.version - 1; out.policy.bumped = PV.needsConsent(adult);
    // Settings → Privacy: the ID, the state, the choices, the policy, export; "Delete my data" says what it erases
    p.privacy = PV.blankPrivacy(); PV.answerGate(p, year - 30, false); PV.setConsent(p, { analytics: true, ads: true }); eco.commit(p);
    q('.hm [data-act="settings"]').click(); await wait(150);
    const st = q('.mm-settings');
    out.settings = { id: st.querySelector('.pv-id')?.textContent === p.privacy.id, state: /analytics: on/i.test(st.querySelector('.pv-state')?.textContent || ''), choices: !!st.querySelector('[data-act="consent"]'),
      policy: st.querySelector('a[href="' + D.PRIVACY.policyUrl + '"]')?.target === '_blank', del: /Delete my data/.test(st.textContent) };
    st.querySelector('[data-act="reset"]').click(); out.settings.erases = /privacy choices/.test(st.querySelector('.st-confirm')?.textContent || '');
    st.querySelector('[data-act="export"]').click(); await wait(80);
    const json = q('.mm-export .pv-json')?.value || '';
    out.settings.export = (() => { try { const o = JSON.parse(json); return !!(o.profile && o.profile.privacy && Array.isArray(o.events)); } catch (e) { return false; } })();
    document.querySelectorAll('.modal-back').forEach((n) => n.remove());
    return out;
  });
  check('privacy: test browsers answer the gate as an adult with "Necessary only" (no sheet, nothing measured, a random player ID)',
    s.auto.band === 'adult' && s.auto.asked === 1 && !s.auto.consent.analytics && !s.auto.consent.ads && !s.auto.gate && s.auto.id && s.auto.events === 0, JSON.stringify(s.auto));
  check('privacy: the neutral age gate (no year suggested, Continue waits, cannot be dismissed), then the consent sheet with both choices off and equal-weight buttons',
    s.gate.open && s.gate.placeholder && s.gate.disabled && s.gate.years === 101 && s.gate.dismiss && s.gate.band === 'adult' && s.gate.closed && s.sheet.open && s.sheet.toggles === 2 && s.sheet.offAll
    && s.sheet.buttons === 'Necessary only|Allow all|Save my choices' && !s.sheet.after.analytics && !s.sheet.after.ads && s.sheet.after.asked === 1 && s.sheet.after.done === 1 && s.sheet.after.events === 0, JSON.stringify({ g: s.gate, c: s.sheet }));
  const E = s.events;
  check('analytics: with consent a run records run_start and run_end (mode, chapter, act, difficulty, hero; result, time, death minute) under the player ID, and the consent change itself',
    s.on.analytics && !s.on.ads && /run_start/.test(E.names) && /run_end/.test(E.names) && /consent/.test(E.names) && E.start && E.start.mode === 'campaign' && E.start.chapter === 1 && E.start.act === 1 && E.start.hero
    && E.end && E.end.victory === false && E.end.deathMinute === 0 && E.user && E.session === 1, JSON.stringify(E));
  check('analytics: events carry only their listed properties (no free text, never the birth year); unknown events are refused; the queue keeps 500; withdrawing consent empties it',
    E.allowed && E.noYear && s.track.unknown === false && !('quest' in s.track.text) && s.cap === 500 && s.off.queue === 0 && s.off.tracked === false, JSON.stringify({ t: s.track, cap: s.cap, off: s.off }));
  check('privacy: a child is in restricted mode (no consent sheet, no purchases, no Starter or Pact offers, a closed shop banner, nothing measured, non-personalised ads)',
    s.child.band === 'child' && !s.child.sheet && s.child.done === 1 && !s.child.purchase && !s.child.ads && !s.child.track && !s.child.starterFab && !s.child.pactFab && !s.child.buySheet && s.child.banner, JSON.stringify(s.child));
  check('privacy: an EU 15-year-old is asked nothing; elsewhere a teen is asked about analytics only; personalised ads stay off under 18',
    s.teenEU.band === 'teen' && !s.teenEU.consent && !s.teenEU.a && !s.teenEU.ads && s.teen.band === 'teen' && s.teen.consent && s.teen.a && !s.teen.ads, JSON.stringify({ eu: s.teenEU, t: s.teen }));
  check('privacy: teens\' monthly spending limits ($50 under 16, $100 at 16–17, this month only); none for adults; children cannot buy',
    s.caps.cap15 === 50 && s.caps.ok15 === '' && s.caps.no15 === 'cap' && s.caps.cap17 === 100 && s.caps.no17 === 'cap' && s.caps.adult === '' && s.caps.child === 'age', JSON.stringify(s.caps));
  check('privacy saves: an old save meets the gate once and gets an ID; a tampered band follows the year (choices off); a new policy version asks again',
    s.save.gate && s.save.id && s.save.bad === 'child,false,false,true' && !s.policy.now && s.policy.bumped, JSON.stringify({ s: s.save, p: s.policy }));
  check('privacy settings: the player ID, the state, Privacy choices, the policy link, Export my data (JSON) and Delete my data (it says what it erases)',
    s.settings.id && s.settings.state && s.settings.choices && s.settings.policy && s.settings.del && s.settings.erases && s.settings.export, JSON.stringify(s.settings));
});
check('update 14 privacy: no runtime errors', !errs.length, errs[0] || '');

await browser.close();
if (server) server.kill();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
