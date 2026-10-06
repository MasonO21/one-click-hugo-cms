// Balance harness: a bot plays every chapter with the progression a typical player has on arrival
// (talents, relics, hero stars per GDD §8) and reports clears, deaths, boss time-to-kill and damage taken.
// usage: node scripts/balance.mjs [url] [runsPerChapter] [chapters, e.g. 1,3,5]
//        GOD=1 ... keeps the bot alive so every run reaches Gravemaw (measures fight length)
//        HERO=liora ... plays another hero at the same progression (default vael)
//        TUNE='{"liora":{"hp":115,"passive":{"raise":0.05}}}' ... trial hero data changes without editing data.js
//        DIFF=nightmare|torment ... plays that difficulty (unlocked for the run); default normal
//        PROG=5 ... uses chapter 5's progression on every chapter (a Nightmare player is stronger than PROGRESSION assumes)
//        DTUNE='{"hp":3.5,"dmg":2}' ... trial run.diff changes for DIFF without editing data.js (patches the live run, so
//          constructor-time fields such as extraElites and tint are not covered)
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pw = require(execSync('npm root -g').toString().trim() + '/playwright');
const URL = process.argv[2] || 'http://localhost:5173/';
const RUNS = +(process.argv[3] || 3);
const CHAPTERS = (process.argv[4] || '1,2,3,4,5').split(',').map(Number);
const GOD = process.env.GOD === '1';
const HERO = process.env.HERO || 'vael';
const DIFF = process.env.DIFF || 'normal';
const PROG = process.env.PROG ? +process.env.PROG : 0;

// What a player typically owns when they reach chapter c (talent levels are spread over Might, Vitality, Necromancy, Dominion, Swiftness).
const PROGRESSION = {
  1: { talents: 0, stars: 1, relics: [['crown', 'common', 1], ['heart', 'common', 1]] },
  2: { talents: 8, stars: 1, relics: [['crown', 'rare', 2], ['heart', 'common', 3], ['lantern', 'common', 2]] },
  3: { talents: 25, stars: 2, relics: [['crown', 'rare', 4], ['heart', 'rare', 3], ['lantern', 'rare', 3]] },
  4: { talents: 60, stars: 3, relics: [['crown', 'epic', 4], ['heart', 'rare', 6], ['idol', 'epic', 3]] },
  5: { talents: 110, stars: 3, relics: [['crown', 'epic', 7], ['heart', 'epic', 5], ['idol', 'epic', 6]] },
};

// Flees the horde, circle-strafes the boss, takes the better gate, picks the first card. No god mode, no revives.
const BOT = `window.__balance = (ch, prog, god, hero, diff, dtune) => {
  const app = window.__soulswarm, p = app.profile, E = app.engine;
  E.manual = true;
  const keys = ['might', 'vitality', 'raise', 'cap', 'swift'];
  for (const k of Object.keys(p.talents)) p.talents[k] = 0;
  for (let i = 0; i < prog.talents; i++) { const k = keys[i % keys.length]; p.talents[k] = Math.min(p.talents[k] + 1, k === 'swift' ? 15 : k === 'raise' || k === 'cap' ? 20 : 25); }
  p.relics = prog.relics.map(([type, rarity, level], i) => ({ uid: 'b' + i, type, rarity, level }));
  p.equipped = p.relics.map((r) => r.uid);
  Object.assign(p.heroes[hero], { owned: true, stars: prog.stars }); p.selectedHero = hero;
  p.chapter.unlocked = Math.max(p.chapter.unlocked, ch); p.energy = 30;
  p.chapter.best[ch] = { time: 420, cleared: true, kills: 0 }; p.diff.best[ch] = { nightmare: { time: 420, legion: 0, kills: 0, cleared: true } }; // open every difficulty
  p.flags.hints = { move: 1, raise: 1, gates: 1, nova: 1 }; p.flags.tutorialDone = true;
  app.startRun(ch, { difficulty: diff });
  const r = app.run; if (dtune) Object.assign(r.diff, dtune);
  let hurt = 0; const h0 = r.player.hurt.bind(r.player);
  r.player.hurt = (d) => { const before = r.player.hp; h0(d); hurt += Math.max(0, before - r.player.hp); if (god) r.player.hp = r.player.maxHp; };
  let bossAt = -1, peakEnemies = 0;
  for (let i = 0; i < 30 * 960 && !r.ended && !r.player.dead; i++) {
    const P = r.player; let fx = 0, fz = 0;
    r.enemies.query(P.x, P.z, 7, (e) => { if (e.type === 'boss') return; const dx = P.x - e.x, dz = P.z - e.z, d2 = dx * dx + dz * dz + 0.5; fx += dx / d2; fz += dz / d2; });
    const B = r.bossEnemy;
    if (B && B.active) { if (bossAt < 0) bossAt = r.time; const dx = B.x - P.x, dz = B.z - P.z, d = Math.hypot(dx, dz) || 1, pull = d > 7.5 ? 1.2 : d < 5 ? -1.6 : 0; fx += dx / d * pull - dz / d * 0.8; fz += dz / d * pull + dx / d * 0.8; }
    if (r.gates.pair && !r.gates.pair.done) { const g = r.gates.pair.gates.find((G) => G.op.type === 'mul' || G.op.type === 'add'); if (g) { const dx = g.x - P.x, dz = g.z - P.z, l = Math.hypot(dx, dz); fx += dx / l * 1.5; fz += dz / l * 1.5; } }
    fx += Math.cos(r.time * 0.35) * 0.25; fz += Math.sin(r.time * 0.35) * 0.25;
    const l = Math.hypot(fx, fz) || 1;
    r.input.keys.clear(); r.input.tx = fx / l; r.input.tz = fz / l; r.input.moved = true;
    if (r.levelPending) { const c = document.querySelector('.lvl-back .card'); if (c) c.click(); }
    if (!r.levelPending && (r.levelQueue > 0 || r.chestQueue > 0)) r.showLevelUp();
    if (r.nova >= 1 && r.legion.count > 25) r.ui.wantsNova = true;
    peakEnemies = Math.max(peakEnemies, r.enemies.count);
    r.update(1 / 30);
  }
  const out = { ch, diff: r.diff.id, hp: r.diff.hp, cleared: !!r.bossDead, died: !!r.player.dead, t: Math.round(r.time), bossTTK: r.bossDead && bossAt >= 0 ? Math.round(r.time - bossAt) : null,
    hurt: Math.round(hurt), maxHp: r.player.maxHp, level: r.level, kills: r.counters.kills, peakLegion: r.legion.peak, peakEnemies, novas: r.counters.novas };
  app.exitRun();
  return out;
};`;

const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const rows = [];
for (const ch of CHAPTERS) {
  for (let i = 0; i < RUNS; i++) {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await page.evaluate(BOT);
    if (process.env.TUNE) await page.evaluate(async (tune) => { const { HEROES } = await import('/src/game/data.js'); for (const [id, o] of Object.entries(tune)) { const { passive, ...rest } = o; Object.assign(HEROES[id], rest); if (passive) Object.assign(HEROES[id].passive, passive); } }, JSON.parse(process.env.TUNE));
    const res = await page.evaluate(([c, p, g, h, d, t]) => window.__balance(c, p, g, h, d, t), [ch, PROGRESSION[PROG || ch], GOD, HERO, DIFF, process.env.DTUNE ? JSON.parse(process.env.DTUNE) : null]);
    res.errors = errors.length;
    rows.push(res);
    console.log(JSON.stringify(res));
    await page.context().close();
  }
}
await browser.close();
console.log(`\n${HERO} · ${DIFF}${PROG ? ` · chapter ${PROG} progression` : ''}${GOD ? ' (god mode)' : ''}\nch | clears | deaths (avg time) | survival avg | boss TTK avg | dmg taken avg | peak legion avg`);
for (const ch of CHAPTERS) {
  const R = rows.filter((r) => r.ch === ch), avg = (f) => { const v = R.map(f).filter((x) => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : '-'; };
  const deaths = R.filter((r) => r.died);
  console.log(`${ch}  | ${R.filter((r) => r.cleared).length}/${R.length} | ${deaths.length} (${deaths.length ? avg((r) => (r.died ? r.t : null)) + 's' : '-'}) | ${avg((r) => r.t)}s | ${avg((r) => r.bossTTK)}s | ${avg((r) => r.hurt)} | ${avg((r) => r.peakLegion)}`);
}
