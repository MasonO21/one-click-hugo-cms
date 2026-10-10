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
//        RITE=0 ... the bot never casts the hero's Rite (a before/after comparison on the same build)
//        RTUNE='{"nyx":{"dmg":80}}' ... trial Rite tunables (RITES in data.js)
//        RUSH=1 ... plays the Boss Rush (the five bosses back to back) instead; the chapters list picks the progression
//          (e.g. 2,5 = a player who just cleared Chapter 1 and one at Chapter 5) and the table reports bosses beaten
//        BRTUNE='{"hp":[1,0.8,0.6,0.5,0.45]}' ... trial BOSS_RUSH tunables
//        PAGE=glass ... inscribes that Grimoire page (GRIMOIRE in data.js; its goals are met for the run)
//        MASTERY=10 ... the hero's Hero Mastery rank (MASTERY in data.js; default 1, so runs never feed each other's mastery)
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
const RITE = process.env.RITE !== '0';
const RUSH = process.env.RUSH === '1';

// What a player typically owns when they reach chapter c (talent levels are spread over Might, Vitality, Necromancy, Dominion, Swiftness).
const PROGRESSION = {
  1: { talents: 0, stars: 1, relics: [['crown', 'common', 1], ['heart', 'common', 1]] },
  2: { talents: 8, stars: 1, relics: [['crown', 'rare', 2], ['heart', 'common', 3], ['lantern', 'common', 2]] },
  3: { talents: 25, stars: 2, relics: [['crown', 'rare', 4], ['heart', 'rare', 3], ['lantern', 'rare', 3]] },
  4: { talents: 60, stars: 3, relics: [['crown', 'epic', 4], ['heart', 'rare', 6], ['idol', 'epic', 3]] },
  5: { talents: 110, stars: 3, relics: [['crown', 'epic', 7], ['heart', 'epic', 5], ['idol', 'epic', 6]] },
};

// Flees the horde, circle-strafes the boss, takes the better gate, picks the first card. No god mode, no revives.
// Casts the Rite on a simple rule per hero: Mordrake at 2+ foes within 3 m or 5+ within 6 m; Liora at 3+ within 3 m, 8+
// within 6 m, or when a Witch's fire circle is about to land on her (the Knell clears it); Nyx the same, dashing straight
// away from the crowd (or out of the circle); Vael at 12+ foes within 12 m; Seraphine at 14+ within 12 m, an elite or 2+
// Witches in sight; Grimsby at 3+ within 3 m or 8+ within 6 m (the blaze sends them running); Osric at 10+ within 12 m
// (the legion has work to do). Gravemaw in reach (8 m) always counts.
const BOT = `window.__balance = (ch, prog, god, hero, rite, diff, dtune, rush, page) => {
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
  p.grimoire.selected = page || ''; // a Grimoire page (its goals met, so the run carries it)
  p.mastery = { [hero]: { xp: window.__mastXp || 0, paid: 10 } }; // Hero Mastery: reset every run (results add XP)
  if (page) { Object.assign(p.stats, { runs: 99, raised: 1e5, bestStreak: 999, bestLegion: 400, kills: 1e6 }); p.chapter.unlocked = Math.max(p.chapter.unlocked, 5); }
  if (rush) { p.flags.bossRush = 'on'; p.rush.tries = 0; p.chapter.unlocked = Math.max(p.chapter.unlocked, 2); app.startRun(1, { rush: true }); } else app.startRun(ch, { difficulty: diff });
  const r = app.run; if (dtune) Object.assign(r.diff, dtune);
  const splits = []; let kills0 = 0;
  let hurt = 0; const h0 = r.player.hurt.bind(r.player);
  r.player.hurt = (d) => { const before = r.player.hp; h0(god ? Math.min(d, r.player.hp - 1) : d); // god: no hit can kill (Torment one-shots fragile builds)
    hurt += Math.max(0, before - r.player.hp); if (god) r.player.hp = r.player.maxHp; };
  let bossAt = -1, peakEnemies = 0;
  for (let i = 0; i < 30 * 960 && !r.ended && !r.player.dead; i++) {
    const P = r.player; let fx = 0, fz = 0;
    r.enemies.query(P.x, P.z, 7, (e) => { if (e.type === 'boss') return; const dx = P.x - e.x, dz = P.z - e.z, d2 = dx * dx + dz * dz + 0.5; fx += dx / d2; fz += dz / d2; });
    const ax = fx, az = fz, B = r.bossEnemy; // ax, az: straight away from the crowd
    if (B && B.active) { if (bossAt < 0) bossAt = r.time; const dx = B.x - P.x, dz = B.z - P.z, d = Math.hypot(dx, dz) || 1, pull = d > 7.5 ? 1.2 : d < 5 ? -1.6 : 0; fx += dx / d * pull - dz / d * 0.8; fz += dz / d * pull + dx / d * 0.8; }
    if (r.gates.pair && !r.gates.pair.done) { const g = r.gates.pair.gates.find((G) => G.op.type === 'mul' || G.op.type === 'add'); if (g) { const dx = g.x - P.x, dz = g.z - P.z, l = Math.hypot(dx, dz); fx += dx / l * 1.5; fz += dz / l * 1.5; } }
    fx += Math.cos(r.time * 0.35) * 0.25; fz += Math.sin(r.time * 0.35) * 0.25;
    const l = Math.hypot(fx, fz) || 1;
    r.input.keys.clear(); r.input.tx = fx / l; r.input.tz = fz / l; r.input.moved = true;
    if (r.levelPending) { const c = document.querySelector('.lvl-back .card'); if (c) c.click(); }
    if (!r.levelPending && (r.levelQueue > 0 || r.chestQueue > 0)) r.showLevelUp();
    if (r.nova >= 1 && r.legion.count > 25) r.ui.wantsNova = true;
    if (rite && r.rites.ready && !r.levelPending) {
      let close = 0, near = 0, wide = 0, elite = false, witches = 0; // foes within 3 / 6 / 12 m
      r.enemies.query(P.x, P.z, 12, (e, d2) => { if (e.type === 'boss') return; wide++; if (d2 < 36) near++; if (d2 < 9) close++; if (e.elite) elite = true; if (e.type === 'witch') witches++; });
      const lob = (r.projectiles.lobs || []).find((L) => L.flight - L.t < 0.4 && (L.tx - P.x) ** 2 + (L.tz - P.z) ** 2 < (L.r + 0.8) ** 2); // a fire circle about to land on you
      const boss = !!(B && B.active && Math.hypot(B.x - P.x, B.z - P.z) < 8), low = P.hp < P.maxHp * 0.5;
      const go = hero === 'vael' ? wide >= 12 || boss                                    // Grave Call: plenty to raise (at the cap it mends the legion)
        : hero === 'nyx' ? !!lob || close >= 3 || near >= 8                               // Shadow Step: dodge the fire, slip out as they close in
        : hero === 'seraphine' ? wide >= 14 || elite || witches >= 2 || boss               // Ashfall: a field of targets, an elite, or the casters
        : hero === 'liora' ? !!lob || close >= 3 || near >= 8 || boss                      // Death Knell: silence the falling fire, or ring as they close in
        : hero === 'grimsby' ? close >= 3 || near >= 8 || boss                             // Hallowfire: scatter them as they close in
        : hero === 'osric' ? wide >= 10 || boss                                            // Bone Mass: the legion fights harder where there is a fight
        : close >= 2 || near >= 5 || boss;                                                 // Ossuary Wall: as soon as they gather round
      if (go) {
        if (hero === 'nyx') { // straight away from the crowd, or out of the fire circle
          let dx = ax, dz = az;
          if (lob) { dx = P.x - lob.tx; dz = P.z - lob.tz; if (dx * dx + dz * dz < 0.04) { dx = r.input.tx; dz = r.input.tz; } }
          const al = Math.hypot(dx, dz); if (al > 0.01) { r.input.tx = dx / al; r.input.tz = dz / al; }
        }
        r.ui.wantsRite = true;
      }
    }
    peakEnemies = Math.max(peakEnemies, r.enemies.count);
    r.update(1 / 30);
    if (r.bossKills > kills0) { kills0 = r.bossKills; splits.push(Math.round(r.time)); } // Boss Rush: when each boss fell
  }
  const out = { ch, diff: r.diff.id, cleared: !!r.bossDead, died: !!r.player.dead, t: Math.round(r.time), bossTTK: r.bossDead && bossAt >= 0 ? Math.round(r.time - bossAt) : null,
    hurt: Math.round(hurt), maxHp: r.player.maxHp, level: r.level, kills: r.counters.kills, peakLegion: r.legion.peak, peakEnemies, novas: r.counters.novas, rites: r.counters.rites, bossKills: r.bossKills, splits };
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
    if (process.env.BRTUNE) await page.evaluate(async (tune) => { const { BOSS_RUSH } = await import('/src/game/data.js'); Object.assign(BOSS_RUSH, tune); }, JSON.parse(process.env.BRTUNE));
    if (process.env.RTUNE) await page.evaluate(async (tune) => { const { RITES } = await import('/src/game/data.js'); for (const [id, o] of Object.entries(tune)) Object.assign(RITES[id], o); }, JSON.parse(process.env.RTUNE));
    if (process.env.MASTERY) await page.evaluate(async (rank) => { const { MASTERY } = await import('/src/game/data.js'); let xp = 0; for (let i = 1; i < rank; i++) xp += MASTERY.need[i]; window.__mastXp = xp; }, +process.env.MASTERY);
    if (process.env.TUNE) await page.evaluate(async (tune) => { const { HEROES } = await import('/src/game/data.js'); for (const [id, o] of Object.entries(tune)) { const { passive, ...rest } = o; Object.assign(HEROES[id], rest); if (passive) Object.assign(HEROES[id].passive, passive); } }, JSON.parse(process.env.TUNE));
    const res = await page.evaluate(([c, p, g, h, rt, d, dt, ru, pg]) => window.__balance(c, p, g, h, rt, d, dt, ru, pg), [ch, PROGRESSION[PROG || ch], GOD, HERO, RITE, DIFF, process.env.DTUNE ? JSON.parse(process.env.DTUNE) : null, RUSH, process.env.PAGE || '']);
    res.errors = errors.length;
    rows.push(res);
    console.log(JSON.stringify(res));
    await page.context().close();
  }
}
await browser.close();
if (RUSH) { // Boss Rush: per progression, how many bosses fall and how fast
  console.log(`\nBoss Rush · ${HERO}${GOD ? ' (god mode)' : ''}\nprog | clears | bosses beaten (each run) | clear time avg | when each boss fell (first run)`);
  for (const ch of CHAPTERS) {
    const R = rows.filter((r) => r.ch === ch), C = R.filter((r) => r.bossKills >= 5);
    console.log(`${ch}    | ${C.length}/${R.length} | ${R.map((r) => r.bossKills).join(' ')} | ${C.length ? Math.round(C.reduce((a, r) => a + r.t, 0) / C.length) + 's' : '-'} | ${R[0] ? R[0].splits.join(' ') : ''}`);
  }
  process.exit(0);
}
console.log(`\n${HERO} · ${DIFF}${PROG ? ` · chapter ${PROG} progression` : ''}${GOD ? ' (god mode)' : ''}${RITE ? '' : ' (no Rite)'}\nch | clears | deaths (avg time) | survival avg | boss TTK avg | dmg taken avg | peak legion avg | Rites per run`);
for (const ch of CHAPTERS) {
  const R = rows.filter((r) => r.ch === ch), avg = (f) => { const v = R.map(f).filter((x) => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : '-'; };
  const deaths = R.filter((r) => r.died);
  console.log(`${ch}  | ${R.filter((r) => r.cleared).length}/${R.length} | ${deaths.length} (${deaths.length ? avg((r) => (r.died ? r.t : null)) + 's' : '-'}) | ${avg((r) => r.t)}s | ${avg((r) => r.bossTTK)}s | ${avg((r) => r.hurt)} | ${avg((r) => r.peakLegion)} | ${avg((r) => r.rites)}`);
}
