// Browser smoke test: every lobby screen at phone and desktop sizes, then one match of each offline
// mode. Fails on page errors or horizontal overflow. Screenshots go to $SHOT_DIR when set.
// Run: node tests/ui.mjs
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchChromium } from '../tools/lib/pw.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = pathToFileURL(join(root, 'web', 'index.html')).href;
const SHOTS = process.env.SHOT_DIR;
let failed = 0;
const check = (name, ok, detail) => { if (!ok) { failed++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); } };
const shot = (page, name) => (SHOTS ? page.screenshot({ path: join(SHOTS, name + '.png') }) : null);

const browser = await launchChromium();
const sizes = [['phone-landscape', 844, 390, true], ['phone-portrait', 390, 844, true], ['desktop', 1366, 800, false]];
try {
  for (const [label, width, height, mobile] of sizes) {
    console.log(`• ${label}`);
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url);
    await page.waitForTimeout(700);
    // Give the profile something to show: a few matches, a rank and some mastery.
    await page.evaluate(() => {
      document.getElementById('modal')?.remove();
      const S = SF.store, d = S.d;
      d.account.level = 3; d.tutorial = true; d.rank.stars = 20; d.rank.best = 2;
      S.addMastery('kaida', 900); S.addMastery('orin', 350);
      d.stats.matches = 6; d.stats.wins = 4; d.stats.kills = 21; d.stats.deaths = 9; d.stats.assists = 17; d.event.tokens = 180;
      S.pushHistory({ mode: 'ranked', hero: 'kaida', skin: 'kaida_classic', won: true, k: 7, d: 2, a: 5, mvp: true, time: 431, at: new Date().toISOString() });
      S.pushHistory({ mode: 'brawl', hero: 'vexa', skin: 'vexa_classic', won: false, k: 3, d: 6, a: 8, mvp: false, time: 302, at: new Date().toISOString() });
      SF.lobby._test.go('home');
    });
    for (const v of ['home', 'heroes', 'shop', 'pass', 'missions', 'event', 'free', 'profile']) {
      await page.evaluate(v => SF.lobby._test.go(v), v);
      await page.waitForTimeout(150);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      check(`${label}/${v} has no horizontal overflow`, over <= 0, `${over}px`);
      await shot(page, `${label}-${v}`);
    }
    for (const tab of ['skins', 'gems', 'chests', 'exchange']) {
      await page.evaluate(() => SF.lobby._test.go('shop'));
      await page.click(`[data-act=shopTab][data-tab=${tab}]`);
      await page.waitForTimeout(100);
    }
    for (const m of ['quick', 'ranked', 'brawl', 'online', 'practice']) {
      await page.evaluate(() => SF.lobby._test.go('home'));
      await page.click(`[data-act=mode][data-m=${m}]`);
      await page.waitForTimeout(100);
    }
    await shot(page, `${label}-home-online`);
    await page.click('.topbar [data-act=settings]');
    await page.waitForTimeout(150);
    await shot(page, `${label}-settings`);
    await page.click('[data-act=setting][data-k=lefty]');
    await page.click('[data-act=close]');
    check(`${label} has no page errors in the lobby`, errors.length === 0, errors.join('; '));

    if (label === 'phone-landscape') {
      // Training Grounds: starts any hero, shows the DPS meter, and leaving earns nothing.
      await page.evaluate(() => { SF.store.d.train.hero = 'oska'; SF.lobby._test.startBattle('practice'); });
      await page.waitForTimeout(3600);
      const tr = await page.evaluate(() => ({ mode: SF.hud.match.mode, hero: SF.hud.match.player.def0.id, dps: !document.getElementById('dps').hidden, coins: SF.store.d.coins, matches: SF.store.d.stats.matches }));
      check('training starts the chosen hero', tr.mode === 'practice' && tr.hero === 'oska', JSON.stringify(tr));
      check('training shows the DPS meter', tr.dps);
      await shot(page, 'match-practice');
      await page.evaluate(() => SF.hud.match.end(1));
      await page.waitForTimeout(3300);
      const left = await page.evaluate(() => ({ coins: SF.store.d.coins, matches: SF.store.d.stats.matches, lobby: !document.getElementById('lobby').hidden }));
      check('leaving training returns to the lobby with no rewards', left.lobby && left.coins === tr.coins && left.matches === tr.matches, JSON.stringify(left));
      for (const mode of ['quick', 'ranked', 'brawl']) {
        await page.evaluate(m => SF.lobby._test.startBattle(m), mode);
        await page.waitForFunction(() => SF.hud.match && !document.getElementById('match').hidden, null, { timeout: 8000 });
        const m = await page.evaluate(() => ({ mode: SF.hud.match.mode, level: SF.hud.match.player.level, lefty: document.getElementById('match').classList.contains('lefty') }));
        check(`${mode} starts`, mode === 'brawl' ? m.mode === 'brawl' && m.level === 5 : m.mode === 'classic', JSON.stringify(m));
        check('left-handed layout applied', m.lefty);
        await page.evaluate(() => { const mt = SF.hud.match; mt.player.brain = new SF.Brain(mt, mt.player, 'normal'); for (let i = 0; i < 30 * 100; i++) mt.update(1 / 30); mt.player.brain = null; });
        await page.keyboard.press('q'); await page.keyboard.press('e');
        await page.click('#scoreBtn');
        await page.waitForTimeout(250);
        if (mode === 'quick') await shot(page, 'match-scoreboard');
        check(`${mode} scoreboard opens`, await page.evaluate(() => !document.getElementById('board').hidden));
        await page.click('#board');
        if (mode === 'brawl') await shot(page, 'match-brawl');
        await page.evaluate(() => SF.hud.match.end(0));
        await page.waitForFunction(() => !SF.hud.match && SF.lobby._test.view === 'results', null, { timeout: 8000 });
        await page.waitForTimeout(200);
        if (mode === 'ranked') await shot(page, 'results-ranked');
        check(`${mode} results show a verdict`, (await page.textContent('.verdict')) === 'Victory');
      }
      const after = await page.evaluate(() => ({ matches: SF.store.d.stats.matches, history: SF.store.d.history.length, stars: SF.store.d.rank.stars }));
      check('matches are recorded', after.matches === 9 && after.history === 5 && after.stars > 20, JSON.stringify(after));
      check('no page errors during matches', errors.length === 0, errors.join('; '));
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(failed ? `\n${failed} check(s) failed` : '\nAll UI checks passed');
process.exit(failed ? 1 : 0);
