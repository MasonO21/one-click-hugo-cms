// Headless game tests: loads the real game scripts into a Node VM (no browser) and checks
// skills, full matches, ranked/mastery/economy rules and save migration.
// Run: node tests/run.mjs   (add --balance for a longer hero win-rate report)
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const web = join(dirname(fileURLToPath(import.meta.url)), '..', 'web');
const BALANCE = process.argv.includes('--balance');

function loadSF(saved) {
  const mem = new Map(saved ? [['shardfall.save.v1', JSON.stringify(saved)]] : []);
  const ctx = { console, Math, Date, JSON, Map, Set, Promise, setTimeout, clearTimeout, setInterval, clearInterval };
  ctx.window = ctx;
  ctx.performance = { now: () => Date.now() };
  ctx.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
  ctx.document = { getElementById: () => null, addEventListener() {}, hidden: true };
  vm.createContext(ctx);
  for (const f of ['data.js', 'store.js', 'audio.js', 'match.js']) vm.runInContext(readFileSync(join(web, 'js', f), 'utf8'), ctx, { filename: f });
  return ctx.SF;
}

let failures = 0, passes = 0;
function check(name, cond, detail) {
  if (cond) { passes++; return; }
  failures++;
  console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
}
function section(name, fn) {
  console.log(`• ${name}`);
  try { fn(); } catch (e) { failures++; console.log(`  ✗ threw: ${e.stack}`); }
}
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function botMatch(SF, opts = {}) {
  const ids = shuffle(SF.HEROES.map(h => h.id)).slice(0, 6);
  return new SF.Match(Object.assign({
    hero: ids[0], skin: SF.defaultSkin(ids[0]), difficulty: 'normal', autoplay: true,
    allies: [{ id: ids[1], name: 'A1' }, { id: ids[2], name: 'A2' }],
    enemies: [{ id: ids[3], name: 'E1' }, { id: ids[4], name: 'E2' }, { id: ids[5], name: 'E3' }]
  }, opts));
}
function run(m, maxSeconds) {
  let steps = 0;
  while (!m.over && steps < maxSeconds * 30) { m.update(1 / 30); steps++; }
  return m;
}

const SF = loadSF();

section('Every hero can cast every skill', () => {
  for (const hero of SF.HEROES) {
    const others = SF.HEROES.filter(h => h.id !== hero.id).map(h => h.id);
    const m = new SF.Match({ hero: hero.id, difficulty: 'normal', allies: [{ id: others[0], name: 'A' }, { id: others[1], name: 'B' }], enemies: [{ id: others[2], name: 'C' }, { id: others[3], name: 'D' }, { id: others[4], name: 'E' }] });
    const p = m.player, foe = m.heroes.find(h => h.team === 1);
    p.level = 12; p.recalc(); p.hp = p.maxHp;
    // Isolate the duel: park every other hero far away and freeze the bots.
    for (const o of m.heroes) if (o !== p) { o.brain = null; o.human = true; if (o !== foe) { o.x = o.team ? 3100 : 100; o.y = 600; } }
    m.nextWave = 1e9;
    p.x = 1500; p.y = 600; foe.x = 1700; foe.y = 600;
    m.updateVisibility();
    const reset = () => {
      if (!p.alive) m.respawn(p);
      p.skillCd = [0, 0, 0]; p.dash = null; p.lockT = 0; p.stunT = 0; p.knock = null; p.hp = p.maxHp;
      p.x = 1500; p.y = 600;
      if (!foe.alive) m.respawn(foe);
      foe.x = 1700; foe.y = 600; foe.knock = null; foe.hp = Math.max(foe.hp, foe.maxHp * 0.5);
      m.updateVisibility();
    };
    for (let i = 0; i < 3; i++) {
      reset();
      const r = m.castSkill(p, i, null);
      check(`${hero.name} ${hero.skills[i].name} (auto aim)`, r === true, `returned ${r}`);
      for (let k = 0; k < 75; k++) m.update(1 / 30);
      reset();
      const r2 = m.castSkill(p, i, m.resolveAim(p, i, { x: 1, y: 0, len: 0.6 }));
      check(`${hero.name} ${hero.skills[i].name} (manual aim)`, r2 === true, `returned ${r2}`);
      for (let k = 0; k < 75; k++) m.update(1 / 30);
    }
    check(`${hero.name} skills deal damage or support`, p.dmgDealt > 0 || ['heal', 'buff'].some(k => hero.skills.some(s => s.kind === k)), `dmg ${p.dmgDealt}`);
  }
});

section('Bot matches finish (classic + brawl, every difficulty)', () => {
  const classic = [], brawl = [];
  const N = BALANCE ? 120 : 24;
  const wins = {}, games = {};
  for (let i = 0; i < N; i++) {
    const diff = Object.keys(SF.DIFFICULTY)[i % 5];
    const m = run(botMatch(SF, { difficulty: diff }), 16 * 60);
    check(`classic match ${i} ends`, m.over, `t=${Math.round(m.t)}`);
    classic.push(m.t);
    for (const h of m.heroes) { games[h.def0.id] = (games[h.def0.id] || 0) + 1; if (h.team === m.winner) wins[h.def0.id] = (wins[h.def0.id] || 0) + 1; }
  }
  for (let i = 0; i < 8; i++) {
    const m = run(botMatch(SF, { mode: 'brawl' }), 12 * 60);
    check(`brawl match ${i} ends`, m.over, `t=${Math.round(m.t)}`);
    check(`brawl heroes start at level 5`, m.heroes.every(h => h.level >= 5));
    brawl.push(m.t);
  }
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  const mmss = t => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`;
  console.log(`  classic avg ${mmss(avg(classic))} (min ${mmss(Math.min(...classic))}, max ${mmss(Math.max(...classic))}), brawl avg ${mmss(avg(brawl))}`);
  check('classic matches average 5–12 minutes', avg(classic) > 300 && avg(classic) < 720, mmss(avg(classic)));
  check('brawl is faster than classic', avg(brawl) < avg(classic));
  if (BALANCE) {
    console.log('  hero win rates:');
    for (const h of SF.HEROES) console.log(`    ${h.name.padEnd(8)} ${String(Math.round((wins[h.id] || 0) / games[h.id] * 100)).padStart(3)}% of ${games[h.id]}`);
  }
});

section('Online-style roster with two humans', () => {
  const ids = SF.HEROES.map(h => h.id);
  const m = new SF.Match({ difficulty: 'normal', localPid: 'p2', roster: [
    [{ id: ids[0], name: 'Human1', human: true, pid: 'p1' }, { id: ids[1], name: 'Bot' }, { id: ids[2], name: 'Bot' }],
    [{ id: ids[3], name: 'Human2', human: true, pid: 'p2' }, { id: ids[4], name: 'Bot' }, { id: ids[5], name: 'Bot' }]
  ] });
  const h1 = m.heroes.find(h => h.pid === 'p1'), h2 = m.heroes.find(h => h.pid === 'p2');
  check('local player resolves by pid', m.player === h2 && h2.isPlayer && !h1.isPlayer);
  check('humans have no brain', !h1.brain && !h2.brain);
  const x1 = h1.x, x2 = h2.x;
  h1.wantDir = { x: 1, y: 0 }; h2.wantDir = { x: -1, y: 0 };
  for (let k = 0; k < 30; k++) m.update(1 / 30);
  check('both humans move from input', h1.x > x1 + 100 && h2.x < x2 - 100, `${Math.round(h1.x - x1)}, ${Math.round(x2 - h2.x)}`);
});

section('Economy, ranked, mastery, achievements, event', () => {
  const S = SF.store;
  S.load();
  const d = S.d;
  check('fresh save has 3 heroes', d.heroes.length === 3);
  const total = SF.CHEST.table.reduce((a, e) => a + e.w, 0);
  check('chest odds total 100%', total === 100, total);
  const fr0 = d.fragments;
  S.grant([{ type: 'skin', id: 'kaida_classic' }]);
  check('duplicate skin turns into shards', d.fragments > fr0);
  d.chests = 1; d.chestPity = SF.CHEST.pity - 1;
  const before = d.skins.length;
  const r = S.openChest();
  check('pity chest guarantees an Epic skin (or shards if all owned)', d.skins.length === before + 1 || r.got.some(x => x.type === 'fragments'), JSON.stringify(r));
  check('pity counter resets', d.chestPity === 0);
  S.addPassXp(2500);
  check('pass tier from XP', S.passTier() === 2);
  check('pass claimable counts free tiers', S.passClaimable() === 2);

  const rk = (s) => S.rankOf(s);
  check('rank 0 is Bronze III', rk(0).label === 'Bronze III');
  check('rank 9 is Silver III', rk(9).label === 'Silver III');
  check('rank 45 is Master', rk(45).name === 'Master');
  check('rank 70 is Legend', rk(70).name === 'Legend');
  d.rank.stars = 9; d.rank.streak = 0;
  check('Silver is protected from demotion', S.applyRanked(false, false).delta === 0 && d.rank.stars === 9);
  d.rank.stars = 20;
  check('MVP loses no star', S.applyRanked(false, true).delta === 0);
  check('normal loss loses a star', S.applyRanked(false, false).delta === -1 && d.rank.stars === 19);
  d.rank.streak = 2;
  check('win streak gives two stars below Platinum', S.applyRanked(true, false).delta === 2);
  d.rank.stars = 30; d.rank.streak = 5;
  check('no streak bonus at Platinum+', S.applyRanked(true, false).delta === 1);
  check('best tier tracked', d.rank.best >= 3);
  check('rank rewards become claimable', S.rankRewardsReady().length >= 3);

  const ms = S.addMastery('orin', 850);
  check('mastery levels up and pays rewards', ms.after === 2 && ms.got.length === 2, JSON.stringify(ms));
  check('mastery names', S.masteryOf('orin').name === 'Veteran');

  d.stats.wins = 1;
  check('First Victory achievement ready', S.achievementsReady().some(a => a.id === 'win1'));

  d.event.tokens = 1000;
  const g1 = S.eventBuy('ev_coins');
  check('event exchange grants reward', g1 && g1[0].type === 'coins' && d.event.tokens === 940);
  d.event.bought.ev_coins = 5;
  check('event weekly limit enforced', S.eventBuy('ev_coins') === null);
  check('event skin purchasable once', S.eventBuy('ev_skin') && S.eventBuy('ev_skin') === null);

  d.settings.cap = 10;
  S.recordPurchase('x', 'Test', 9);
  check('spending cap blocks purchases over the limit', !S.capAllows(1.99) && S.capAllows(0.99));
});

section('Old saves migrate without losing data', () => {
  const old = { v: 1, name: 'Veteran', coins: 5000, gems: 90, heroes: ['kaida', 'orin', 'sylva', 'nyx'], skins: ['kaida_classic'], settings: { sound: false, cap: 25 }, stats: { matches: 12, wins: 7, kills: 30, deaths: 10, assists: 20 } };
  const SF2 = loadSF(old);
  SF2.store.load();
  const d = SF2.store.d;
  check('keeps old values', d.coins === 5000 && d.heroes.includes('nyx') && d.settings.sound === false && d.settings.cap === 25 && d.stats.matches === 12);
  check('adds new fields', d.settings.music === true && d.stats.mvps === 0 && d.rank.stars === 0 && Array.isArray(d.history) && d.event.tokens === 0);
});

section('Every look has splash art and an in-match sprite', () => {
  const sw = readFileSync(join(web, 'sw.js'), 'utf8');
  for (const sk of SF.SKINS) {
    const art = SF.artFor(sk.hero, sk.id), sprite = SF.spriteFor(sk.hero, sk.id);
    check(`${sk.id} has splash art`, art && existsSync(join(web, art)), art);
    check(`${sk.id} has a sprite`, sprite && existsSync(join(web, sprite)), sprite);
    if (sprite) check(`${sk.id} sprite is precached by the service worker`, sw.includes(`'${sprite.split('/').pop().replace('.webp', '')}'`));
  }
  check('unknown skins have no sprite', SF.spriteFor('kaida', 'nope') === null);
});

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
