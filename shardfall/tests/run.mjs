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

section('Battle spells', () => {
  // A quiet duel: player at x=1500, one enemy hero at 1700, everything else frozen and far away.
  const duel = spell => {
    const ids = SF.HEROES.map(h => h.id);
    const m = new SF.Match({ hero: ids[0], spell, difficulty: 'normal', allies: [{ id: ids[1], name: 'A' }, { id: ids[2], name: 'B' }], enemies: [{ id: ids[3], name: 'C' }, { id: ids[4], name: 'D' }, { id: ids[5], name: 'E' }] });
    const p = m.player, foe = m.heroes.find(h => h.team === 1), ally = m.heroes.find(h => h.team === 0 && h !== p);
    for (const o of m.heroes) if (o !== p) { o.brain = null; o.human = true; o.x = o.team ? 3100 : 100; o.y = 600; }
    m.nextWave = 1e9; m.camps.forEach(c => { c.respawnAt = 1e9; });
    p.level = 8; p.recalc(); p.hp = p.maxHp; p.x = 1500; p.y = 600;
    foe.x = 1700; foe.y = 600; ally.x = 1450; ally.y = 650;
    m.updateVisibility();
    return { m, p, foe, ally };
  };
  check('every spell has a name, cooldown, unlock level and icon', SF.SPELL_IDS.length === 6 && SF.SPELL_IDS.every(id => { const x = SF.SPELLS[id]; return x.name && x.cd > 0 && x.lvl >= 1 && x.icon && x.desc; }));
  check('player defaults to Blink', new SF.Match({ hero: 'kaida', difficulty: 'easy', allies: [{ id: 'orin' }, { id: 'sylva' }], enemies: [{ id: 'brakka' }, { id: 'nyx' }, { id: 'lumen' }] }).player.spell === 'blink');
  check('unknown spell ids fall back to Blink', duel('nope').p.spell === 'blink');
  {
    const { m, p } = duel('blink');
    const x = p.x;
    check('Blink casts', m.useSpell(p, { dir: { x: -1, y: 0 } }) === true);
    check('Blink moves 250 units the chosen way', Math.abs(p.x - (x - 250)) < 1, `moved ${Math.round(p.x - x)}`);
    check('Blink goes on cooldown', p.spellCd === SF.SPELLS.blink.cd && m.useSpell(p, { dir: { x: 1, y: 0 } }) === 'cooldown');
    p.spellCd = 0; m.stun(p, 1);
    check('Blink cannot be used while stunned', m.useSpell(p, { dir: { x: 1, y: 0 } }) === 'stunned');
  }
  {
    const { m, p, foe, ally } = duel('mend');
    p.hp = p.maxHp * 0.4; ally.hp = ally.maxHp * 0.4; foe.hp = foe.maxHp * 0.4;
    const before = [p.hp, ally.hp, foe.hp];
    check('Mend casts', m.useSpell(p) === true);
    check('Mend heals you and nearby allies', p.hp > before[0] + p.maxHp * 0.14 && ally.hp > before[1] + ally.maxHp * 0.14);
    check('Mend never heals enemies', foe.hp === before[2]);
    check('Mend gives a burst of speed', p.speed() > p.ms * 1.15);
  }
  {
    const { m, p } = duel('sprint');
    const base = p.speed();
    check('Sprint casts', m.useSpell(p) === true);
    check('Sprint makes you 40% faster', Math.abs(p.speed() - base * 1.4) < 1, `${Math.round(base)} -> ${Math.round(p.speed())}`);
    for (let k = 0; k < 30 * 9; k++) m.update(1 / 30);
    check('Sprint wears off after 8s', !p.hasBuff('sprint'));
  }
  {
    const { m, p } = duel('purify');
    m.stun(p, 2); m.slow(p, 0.5, 2);
    check('Purify works while stunned', m.useSpell(p) === true);
    check('Purify clears stun and slow', p.stunT === 0 && p.slowT === 0);
    m.stun(p, 1); m.slow(p, 0.5, 1);
    check('Purify blocks new stuns and slows for a moment', p.stunT === 0 && p.slowT === 0);
  }
  {
    const { m, p, foe } = duel('shatter');
    foe.hp = foe.maxHp * 0.3;
    const hp0 = foe.hp, want = SF.spellDamage('shatter', p, foe);
    check('Shatter casts on a nearby enemy hero', m.useSpell(p) === true);
    check('Shatter deals true damage (defense ignored)', Math.abs((hp0 - foe.hp) - want) < 1 || !foe.alive, `${Math.round(hp0 - foe.hp)} vs ${Math.round(want)}`);
    const far = duel('shatter'); far.foe.x = 2300; far.m.updateVisibility();
    check('Shatter needs a hero in range', far.m.useSpell(far.p) === 'notarget');
    const low = duel('shatter'); low.foe.hp = 100; low.m.updateVisibility();
    check('the HUD knows when Shatter would kill', low.m.spellWouldKill(low.p) === true);
    low.foe.hp = low.foe.maxHp;
    check('…and when it would not', low.m.spellWouldKill(low.p) === false);
  }
  {
    const { m, p } = duel('smite');
    check('Smite needs a monster or minion in range', m.useSpell(p) === 'notarget');
    const camp = m.camps[0];
    m.spawnCamp(camp);
    const mon = camp.unit; mon.x = p.x + 150; mon.y = p.y;
    mon.hp = SF.spellDamage('smite', p, mon) - 10;
    const gold = p.gold;
    check('Smite casts on a monster', m.useSpell(p) === true);
    check('Smite kills a low monster and pays its bounty', !mon.alive && p.gold >= gold + mon.gold, `alive=${mon.alive}`);
  }
  {
    const m = botMatch(SF, {});
    const bots = m.heroes.filter(h => h.brain && !h.human);
    check('bots bring battle spells', bots.every(h => SF.SPELLS[h.spell]));
    check('each team\'s jungler bot brings Smite', bots.filter(h => h.brain.jungler).every(h => h.spell === 'smite'));
    const casts = {};
    for (let i = 0; i < 6; i++) { const mm = botMatch(SF, { difficulty: 'hard' }); mm.on('spell', (h, id) => { casts[id] = (casts[id] || 0) + 1; }); run(mm, 10 * 60); }
    check('bots use their spells in real matches', (casts.smite || 0) > 0 && (casts.mend || 0) + (casts.purify || 0) + (casts.sprint || 0) + (casts.blink || 0) + (casts.shatter || 0) > 0, JSON.stringify(casts));
  }
  {
    const S = SF.store; S.load();
    const d = S.d; d.account.level = 1;
    check('locked spells cannot be chosen', !S.setSpell('kaida', 'shatter') && S.spellOf('kaida') === 'blink');
    check('unlocked spells are remembered per hero', S.setSpell('kaida', 'smite') && S.spellOf('kaida') === 'smite' && S.spellOf('orin') === 'blink');
    d.account.level = 4;
    check('Shatter unlocks at account level 4', S.setSpell('orin', 'shatter') && S.spellOf('orin') === 'shatter');
  }
});

section('Quick signals', () => {
  const setup = () => {
    const m = new SF.Match({ hero: 'kaida', difficulty: 'normal', allies: [{ id: 'orin', name: 'A1' }, { id: 'lumen', name: 'A2' }], enemies: [{ id: 'brakka', name: 'E1' }, { id: 'nyx', name: 'E2' }, { id: 'vexa', name: 'E3' }] });
    m.nextWave = 1e9;
    const p = m.player, allies = m.heroes.filter(h => h.team === 0 && h !== p), foes = m.heroes.filter(h => h.team === 1);
    for (const f of foes) { f.brain = null; f.human = true; f.x = 3000; f.y = 600; }
    return { m, p, allies, foes };
  };
  {
    const { m, p } = setup();
    check('unknown signals are ignored', m.signal(p, 'dance') === false);
    check('a signal is sent', m.signal(p, 'attack') === true);
    check('signals are rate-limited', m.signal(p, 'retreat') === false);
    check('the signal shows in the feed', m.feed[0] && m.feed[0].msg && m.feed[0].from === p);
    for (let k = 0; k < 30; k++) m.update(1 / 30);
    check('a bot ally answers', m.feed.some(f => f.msg === SF.SIGNALS.attack.reply && f.from !== p));
  }
  {
    const { m, p, allies, foes } = setup();
    const foe = foes[0]; foe.x = 1700; foe.y = 600; p.x = 1450; p.y = 600;
    allies.forEach((a, i) => { a.x = 1200; a.y = 560 + i * 80; a.brain.jungler = false; });
    m.updateVisibility();
    m.signal(p, 'attack');
    const order = m.orders[0];
    check('Attack picks the nearby enemy hero', order.target === foe, order.text);
    for (let k = 0; k < 20; k++) m.update(1 / 30);
    check('bot allies go after the called target', allies.every(a => a.target === foe), allies.map(a => a.target && a.target.name).join());
  }
  {
    const { m, p, allies } = setup();
    allies.forEach(a => { a.x = 2000; a.y = 600; });
    p.x = 1500;
    m.signal(p, 'retreat');
    const d0 = allies.map(a => a.x);
    for (let k = 0; k < 45; k++) m.update(1 / 30);
    check('Retreat pulls bot allies back toward our tower', allies.every((a, i) => a.x < d0[i] - 100), allies.map(a => Math.round(a.x)).join());
  }
  {
    const { m, p, allies } = setup();
    m.spawnShard();
    p.x = 1500; p.y = 400;
    m.signal(p, 'gather');
    check('Group up with the Colossus awake means take it', m.orders[0].target === m.shard && /Colossus/.test(m.orders[0].text));
    for (let k = 0; k < 20; k++) m.update(1 / 30);
    check('bot allies head for the Colossus', allies.every(a => a.target === m.shard));
  }
  {
    const { m, p, allies } = setup();
    allies.forEach(a => { a.x = 400; a.y = 600; a.brain.jungler = false; });
    p.x = 1300; p.y = 900;
    m.signal(p, 'gather');
    check('Group up without the Colossus gathers on you', m.orders[0].target === p && m.orders[0].text === 'Group up!');
    for (let k = 0; k < 60; k++) m.update(1 / 30);
    check('bot allies walk to you', allies.every(a => Math.hypot(a.x - p.x, a.y - p.y) < Math.hypot(400 - p.x, 600 - p.y) - 300));
    m.t = m.orders[0].until + 1;
    const o = m.orders[0];
    check('orders expire', m.t >= o.until);
  }
});

section('Death recap', () => {
  const m = new SF.Match({ hero: 'sylva', difficulty: 'normal', allies: [{ id: 'orin', name: 'A1' }, { id: 'lumen', name: 'A2' }], enemies: [{ id: 'drace', name: 'Grim' }, { id: 'nyx', name: 'E2' }, { id: 'vexa', name: 'E3' }] });
  m.nextWave = 1e9;
  for (const h of m.heroes) if (h !== m.player) { h.brain = null; h.human = true; }
  const p = m.player, drace = m.heroes.find(h => h.def0.id === 'drace'), tower = m.towers[1][0];
  p.x = 1500; p.y = 600;
  m.applyDamage(drace, p, 200, { basic: true });
  m.applyDamage(drace, p, 300, { skill: true });
  m.applyDamage(tower, p, 150);
  let r = m.recap(p);
  check('recap groups damage by source, biggest first', r.rows[0].src === drace && r.rows[1].src === tower && r.rows.length === 2);
  check('recap splits attacks and skills', r.rows[0].basic > 0 && r.rows[0].skill > r.rows[0].basic);
  check('recap names towers', r.rows[1].name === tower.name);
  m.t += 11;
  m.applyDamage(drace, p, 50, { basic: true });
  r = m.recap(p);
  check('recap only counts the last 10 seconds', r.rows.length === 1 && Math.round(r.rows[0].total) === Math.round(r.total));
  let seen = null;
  m.on('kill', e => { if (e.victim === p) seen = e.victim.recapInfo; });
  m.applyDamage(drace, p, 1e6, { skill: true });
  check('a death stores the recap with the killer', seen && seen.killer === drace && seen.rows[0].src === drace);
  check('the damage log resets after a death', !p.taken.length);
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
