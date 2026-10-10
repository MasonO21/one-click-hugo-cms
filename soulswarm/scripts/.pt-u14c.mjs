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
// 52. Update 14: save transfer. Settings → Privacy → Transfer gives this device's code to copy and restores one after a
//     confirm; a code round-trips the whole profile, a mistyped or truncated one is refused, and a restored profile goes
//     through the save repairs.
errs = await session(async (page) => {
  const s = await page.evaluate(async () => {
    const T = await import('/src/meta/transfer.js'), app = window.__soulswarm, p = app.profile, out = {};
    const wait = (ms) => new Promise((r) => setTimeout(r, ms)), q = (sel) => document.querySelector(sel);
    p.gold = 123456; p.chapter.unlocked = 17; p.heroes.nyx.owned = true; p.heroes.nyx.stars = 3; p.relics.push({ uid: 'r9', type: 'eye', rarity: 'legendary', level: 10, stars: 4 });
    const code = await T.exportCode(p), back = await T.importCode(code);
    out.round = { prefix: code.slice(0, 4), short: code.length < JSON.stringify(p).length, gold: back.profile && back.profile.gold, ch: back.profile && back.profile.chapter.unlocked,
      nyx: back.profile && back.profile.heroes.nyx.stars, relic: back.profile && JSON.stringify(back.profile.relics.find((r) => r.uid === 'r9')), id: back.profile && back.profile.privacy.id === p.privacy.id };
    const parts = code.split('.');
    out.bad = { typo: (await T.importCode(parts[0] + '.' + parts[1].slice(0, -3) + 'AAA.' + parts[2])).error, cut: (await T.importCode(code.slice(0, code.length - 9))).error,
      junk: (await T.importCode('hello world')).error, spaces: !!(await T.importCode(code.replace(/(.{40})/g, '$1\n '))).profile };
    // a tampered (but well-formed) save is repaired like any loaded save
    const evil = JSON.parse(JSON.stringify(p)); evil.gems = -50; evil.chapter.unlocked = 999; evil.heroes.vael.stars = 99;
    const ev = (await T.importCode(await T.exportCode(evil))).profile;
    out.repair = [ev.gems, ev.chapter.unlocked, ev.heroes.vael.stars].join();
    // the sheet: this device's code, a pasted code asks to confirm with what it holds
    q('.hm [data-act="settings"]').click(); await wait(150); q('.mm-settings [data-act="transfer"]').click(); await wait(400);
    const m = q('.mm-transfer');
    out.ui = { open: !!m, code: (m.querySelector('.pv-code').value || '').startsWith('SS1.') };
    m.querySelector('.pv-in').value = code; m.querySelector('[data-act="check"]').click(); await wait(300);
    out.ui.confirm = !m.querySelector('.pv-confirm').hidden && /Chapter 17/.test(m.querySelector('.pv-what').textContent);
    m.querySelector('.pv-in').value = 'SS1.zzz.0'; m.querySelector('[data-act="check"]').click(); await wait(200);
    out.ui.refused = m.querySelector('.pv-confirm').hidden;
    document.querySelectorAll('.modal-back').forEach((n) => n.remove());
    return out;
  });
  check('transfer: a code round-trips the whole profile (gold, chapter, heroes, ascended relics, player ID), shorter than the save',
    s.round.prefix === 'SS1.' && s.round.short && s.round.gold === 123456 && s.round.ch === 17 && s.round.nyx === 3 && /"stars":4/.test(s.round.relic || '') && s.round.id, JSON.stringify(s.round));
  check('transfer: a mistyped, truncated or foreign code is refused; line breaks are fine; a tampered save is repaired (gems ≥ 0, chapter ≤ 30, stars ≤ 5)',
    s.bad.typo === 'checksum' && s.bad.cut === 'format' && s.bad.junk === 'format' && s.bad.spaces && s.repair === '0,30,5', JSON.stringify({ b: s.bad, r: s.repair }));
  check('transfer UI: Settings shows this device\'s code; a pasted code asks to confirm with what it holds; a bad one never does',
    s.ui.open && s.ui.code && s.ui.confirm && s.ui.refused, JSON.stringify(s.ui));
});
check('update 14 transfer: no runtime errors', !errs.length, errs[0] || '');

await browser.close();
if (server) server.kill();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
