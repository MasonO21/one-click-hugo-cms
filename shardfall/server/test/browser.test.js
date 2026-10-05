// End-to-end: two real game clients (headless Chromium) join one online match through the lobby.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer } from './helpers.js';

let chromium = null;
for (const spec of ['/opt/node-tools/node_modules/playwright/index.mjs', 'playwright']) {
  try { ({ chromium } = await import(spec)); break; } catch (e) { /* try next */ }
}
const page = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'index.html')).href;

test('two browsers play an online match end to end', { skip: !chromium && 'Playwright not installed' }, async () => {
  const srv = await startServer({ QUEUE_WAIT: '2' });
  const browser = await chromium.launch();
  after(async () => { await browser.close(); srv.stop(); });
  const errors = [];
  const open = async name => {
    const p = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    p.on('pageerror', e => errors.push(`${name}: ${e.message}`));
    await p.goto(page);
    await p.waitForTimeout(600);
    await p.evaluate(url => {
      document.getElementById('modal')?.remove();
      SF.store.d.settings.server = url; SF.store.d.name = 'Player' + Math.floor(Math.random() * 90 + 10);
      SF.store.d.tutorial = true;
    }, srv.url);
    return p;
  };
  const A = await open('A'), B = await open('B');
  await Promise.all([A.evaluate(() => SF.lobby._test.startBattle('online')), B.evaluate(() => SF.lobby._test.startBattle('online'))]);
  for (const p of [A, B]) await p.waitForFunction(() => SF.hud.match && SF.hud.match.remote && SF.hud.match.snaps.length > 2, null, { timeout: 15000 });
  const rooms = await Promise.all([A, B].map(p => p.evaluate(() => SF.hud.match.roomId)));
  assert.equal(rooms[0], rooms[1], 'both browsers are in the same match');
  const teams = await Promise.all([A, B].map(p => p.evaluate(() => ({ team: SF.hud.match.myTeam, x: SF.hud.match.player.x }))));
  for (const t of teams) assert.ok(t.x < 1000, `each player starts on the left of their own screen (x=${Math.round(t.x)}, server team ${t.team})`);

  // Walk right (toward the enemy on screen) and check the SERVER moved the hero the right way.
  const serverX = p => p.evaluate(() => { const m = SF.hud.match, s = m.snaps[m.snaps.length - 1]; return s.pos.get(m.player.id).x; });
  const x0 = await serverX(A);
  await A.keyboard.down('d'); await A.waitForTimeout(1200); await A.keyboard.up('d');
  await A.waitForTimeout(300);
  const x1 = await serverX(A), dirA = teams[0].team === 0 ? 1 : -1;
  assert.ok((x1 - x0) * dirA > 150, `server-side movement ${x1 - x0}`);

  await A.keyboard.press('e');
  await A.waitForTimeout(500);
  assert.ok(await A.evaluate(() => SF.hud.match.player.skillCd[1] > 1), 'skill cast confirmed by the server');
  await A.screenshot({ path: process.env.SHOT_DIR ? join(process.env.SHOT_DIR, 'online-a.png') : undefined });
  await B.screenshot({ path: process.env.SHOT_DIR ? join(process.env.SHOT_DIR, 'online-b.png') : undefined });

  await A.evaluate(() => SF.hud.match.end(1));
  for (const p of [A, B]) await p.waitForFunction(() => SF.lobby._test.view === 'results', null, { timeout: 15000 });
  const verdicts = await Promise.all([A, B].map(p => p.textContent('.verdict')));
  assert.deepEqual(verdicts.sort(), teams[0].team === teams[1].team ? [verdicts[0], verdicts[0]].sort() : ['Defeat', 'Victory']);
  assert.deepEqual(errors, []);
});
