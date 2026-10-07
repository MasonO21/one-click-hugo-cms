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

    // Quick Match opens with a hero draft: three bot picks, then yours. Leaving returns to the lobby.
    await page.evaluate(() => { SF.store.d.mode = 'quick'; SF.lobby._test.go('home'); });
    await page.click('[data-act=battle]');
    await page.waitForFunction(() => { const d = SF.lobby._test.draft; return d && d.steps[d.i] === 'P'; }, null, { timeout: 8000 });
    await page.waitForTimeout(300);
    const dr = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, tiles: document.querySelectorAll('.dr-tile').length, heroes: SF.HEROES.length, phase: document.querySelector('.dr-title b').textContent,
      lock: document.querySelector('.dr-lock').getBoundingClientRect().bottom <= innerHeight, grid: document.querySelector('.dr-grid').scrollHeight <= document.querySelector('.dr-grid').clientHeight + 2 }));
    check(`${label} draft shows every hero and your turn`, dr.tiles === dr.heroes && dr.phase === 'Pick your hero', JSON.stringify(dr));
    check(`${label} draft fits the screen`, dr.over <= 0 && dr.lock, JSON.stringify(dr));
    await shot(page, `${label}-draft`);
    await page.click('[data-act=draftLeave]');
    check(`${label} leaving the draft returns to the lobby`, await page.evaluate(() => document.getElementById('draft').hidden && !SF.lobby._test.draft && !document.getElementById('lobby').hidden));

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

      // Ranked draft: you ban, the enemy bans, then picks. The match uses exactly the drafted heroes.
      await page.evaluate(() => { SF.store.d.mode = 'ranked'; SF.lobby._test.go('home'); });
      await page.click('[data-act=battle]');
      await page.waitForSelector('#draft:not([hidden]) .dr-tile');
      check('ranked draft opens with your ban', (await page.textContent('.dr-title b')) === 'Ban a hero');
      await page.click('.dr-tile[data-id=brakka]');
      await shot(page, 'draft-ban');
      await page.click('[data-act=draftLock]');
      await page.waitForFunction(() => { const d = SF.lobby._test.draft; return d && d.steps[d.i] === 'P'; }, null, { timeout: 8000 });
      const pre = await page.evaluate(() => { const d = SF.lobby._test.draft; return { bans: d.bans.slice(), blue: d.blue.slice(), red: d.red.slice() }; });
      check('your ban and the enemy ban are both in', pre.bans.length === 2 && pre.bans[0] === 'brakka', JSON.stringify(pre));
      check('banned heroes are not picked', !pre.blue.concat(pre.red).some(id => pre.bans.includes(id)), JSON.stringify(pre));
      check('banned tiles are disabled', await page.evaluate(() => document.querySelector('.dr-tile[data-id=brakka]').disabled));
      const pick = await page.evaluate(() => { const ok = [...document.querySelectorAll('.dr-tile:not([disabled])')].map(b => b.dataset.id); return ok.find(id => SF.store.d.heroes.includes(id)) || ok[0]; });
      await page.click(`.dr-tile[data-id=${pick}]`);
      await shot(page, 'draft-pick');
      await page.click('[data-act=draftLock]');
      await page.waitForFunction(() => SF.hud.match && !document.getElementById('match').hidden, null, { timeout: 12000 });
      const got = await page.evaluate(() => { const m = SF.hud.match; return { me: m.player.def0.id, blue: m.heroes.filter(h => h.team === 0).map(h => h.def0.id), red: m.heroes.filter(h => h.team === 1).map(h => h.def0.id) }; });
      const draft = await page.evaluate(() => SF.store.d.selected);
      check('the match starts with your drafted hero', got.me === pick, JSON.stringify({ got, pick, draft }));
      check('the match uses the drafted enemies', got.red.length === 3 && got.red.slice(0, 2).every(id => pre.red.includes(id)) && !got.red.includes('brakka') && !got.blue.includes('brakka'), JSON.stringify({ got, pre }));
      await page.evaluate(() => SF.hud.match.end(0));
      await page.waitForFunction(() => !SF.hud.match && SF.lobby._test.view === 'results', null, { timeout: 8000 });

      // Brawl shows this week's twist on the mode card and announces it in the match.
      await page.evaluate(() => { SF.store.d.mode = 'brawl'; SF.lobby._test.go('home'); });
      const mu = await page.evaluate(() => ({ shown: document.querySelector('.mutator b')?.textContent, want: SF.MUTATOR[SF.mutatorOf(SF.weekKey())].name }));
      check('Brawl card shows the weekly twist', mu.shown === mu.want, JSON.stringify(mu));
      await shot(page, 'home-brawl');
      await page.evaluate(() => SF.lobby._test.startBattle('brawl'));
      await page.waitForFunction(() => SF.hud.match && !document.getElementById('match').hidden, null, { timeout: 8000 });
      check('Brawl match runs the twist', await page.evaluate(want => SF.hud.match.mutator === want, await page.evaluate(() => SF.mutatorOf(SF.weekKey()))));
      await page.evaluate(() => SF.hud.match.end(0));
      await page.waitForFunction(() => !SF.hud.match && SF.lobby._test.view === 'results', null, { timeout: 8000 });
      check('no page errors in draft or Brawl', errors.length === 0, errors.join('; '));
      check('no page errors during matches', errors.length === 0, errors.join('; '));
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(failed ? `\n${failed} check(s) failed` : '\nAll UI checks passed');
process.exit(failed ? 1 : 0);
