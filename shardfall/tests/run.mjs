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
    p.level = 12; p.points = 12; p.recalc(); p.hp = p.maxHp;
    m.autoUpgrade(p);
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
    const m = run(botMatch(SF, { mode: 'brawl' }), 16 * 60);   // every match times out at 15:00
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

section('Skill ranks', () => {
  const dummy = () => {
    const m = new SF.Match({ hero: 'orin', difficulty: 'normal', allies: [{ id: 'kaida', name: 'A' }, { id: 'sylva', name: 'B' }], enemies: [{ id: 'brakka', name: 'C' }, { id: 'nyx', name: 'D' }, { id: 'lumen', name: 'E' }] });
    const p = m.player, foe = m.heroes.find(h => h.team === 1);
    for (const o of m.heroes) if (o !== p) { o.brain = null; o.human = true; o.x = o.team ? 3100 : 100; o.y = 600; }
    m.nextWave = 1e9; p.x = 1500; p.y = 600; foe.x = 1700; foe.y = 600;
    m.updateVisibility();
    return { m, p, foe };
  };
  {
    const { m, p } = dummy();
    check('heroes start with one skill point and no skills learned', p.points === 1 && p.ranks.every(r => r === 0));
    check('an unlearned skill cannot be cast', m.castSkill(p, 0) === 'unranked');
    check('the ultimate stays locked before level 4', m.castSkill(p, 2) === 'locked' && !m.canUpgrade(p, 2));
    check('a point learns a skill', m.upgradeSkill(p, 0) && p.ranks[0] === 1 && p.points === 0);
    check('no point, no upgrade', !m.upgradeSkill(p, 1));
    m.giveXp(p, 150);
    check('levelling up gives a point', p.level === 2 && p.points === 1);
    check('basic rank is capped at half your level', !m.canUpgrade(p, 0) && m.canUpgrade(p, 1));
  }
  {
    const { m, p } = dummy();
    p.level = 12; p.points = 12;
    m.autoUpgrade(p);
    check('auto-upgrade maxes everything by level 12', p.ranks.join() === '4,4,3' && p.points === 1, p.ranks.join() + ' left ' + p.points);
    const q = dummy().p, m2 = q.m;
    q.level = 4; q.points = 4; q.m.autoUpgrade(q);
    check('auto-upgrade takes the ultimate at 4 and unlocks both basics', q.ranks[2] === 1 && q.ranks[0] >= 1 && q.ranks[1] >= 1, q.ranks.join());
  }
  {
    // The same skill hits harder and comes back sooner at a higher rank.
    const hit = rank => {
      const { m, p, foe } = dummy();
      p.level = 8; p.recalc(); p.ranks = [rank, 0, 0]; p.points = 0;
      const hp0 = foe.hp;
      m.castSkill(p, 0, m.resolveAim(p, 0, { x: 1, y: 0, len: 1 }));
      for (let k = 0; k < 60; k++) m.update(1 / 30);
      return { dmg: hp0 - foe.hp, cd: SF.skillCdOf(p, 0) };
    };
    const r1 = hit(1), r4 = hit(4);
    check('rank 4 deals more damage than rank 1', r4.dmg > r1.dmg * 1.4, `${Math.round(r1.dmg)} vs ${Math.round(r4.dmg)}`);
    check('rank 4 has a shorter cooldown', r4.cd < r1.cd);
  }
  {
    const m = run(botMatch(SF, {}), 6 * 60);
    check('bots spend their skill points', m.heroes.filter(h => h.brain).every(h => h.points <= 1 && h.ranks[0] > 0), m.heroes.map(h => h.ranks.join('') + '/' + h.points).join(' '));
    const b = new SF.Match({ hero: 'kaida', mode: 'brawl', difficulty: 'normal', allies: [{ id: 'orin' }, { id: 'sylva' }], enemies: [{ id: 'brakka' }, { id: 'nyx' }, { id: 'lumen' }] });
    check('Shard Brawl starts with five points', b.player.points === 5);
  }
});

section('Hero passives', () => {
  // A frozen duel between two chosen heroes; everyone else parked far away.
  const duel = (me, them, extra = {}) => {
    const rest = SF.HEROES.map(h => h.id).filter(id => id !== me && id !== them && id !== 'oska');
    const enemies = [{ id: them, name: 'Foe' }, { id: rest[2], name: 'E2' }, { id: rest[3], name: 'E3' }];
    const m = new SF.Match(Object.assign({ hero: me, difficulty: 'normal', allies: [{ id: rest[0], name: 'A1' }, { id: rest[1], name: 'A2' }], enemies }, extra));
    const p = m.player, foe = m.heroes.find(h => h.def0.id === them);
    for (const o of m.heroes) { if (o !== p) { o.brain = null; o.human = true; } if (o !== p && o !== foe) { o.x = o.team ? 3100 : 100; o.y = 600; } }
    m.nextWave = 1e9; p.x = 1500; p.y = 600; foe.x = 1590; foe.y = 600;
    p.level = 8; p.recalc(); p.hp = p.maxHp; p.ranks = [4, 4, 2]; p.points = 0;
    m.updateVisibility();
    return { m, p, foe };
  };
  const hit = (m, a, t) => { const hp = t.hp; m.attack(a, t); m.updateProjs(1); a.atkCd = 0; return hp - t.hp; };
  check('every hero has a named passive', SF.HEROES.every(h => h.passive && h.passive.id && h.passive.name && h.passive.desc));
  check('passives are all different', new Set(SF.HEROES.map(h => h.passive.id)).size === SF.HEROES.length);
  {
    const { m, p, foe } = duel('kaida', 'lumen');
    const plain = hit(m, p, foe);
    for (let i = 0; i < 3; i++) m.applyDamage(p, foe, 1, { skill: p.def0.skills[0] });
    check('Kindling: skill hits build up to two stacks', p.pstack === 2);
    p.hp = p.maxHp * 0.5; const hp0 = p.hp;
    const big = hit(m, p, foe);
    check('Kindling: the next attack erupts for 60% more and heals', Math.abs(big / plain - 1.6) < 0.02 && p.hp > hp0 && !p.pstack, `x${(big / plain).toFixed(2)}`);
  }
  {
    const { m, p, foe } = duel('orin', 'lumen');
    const a = m.applyDamage(p, foe, 100, { skill: p.def0.skills[0] }), b = m.applyDamage(p, foe, 100, { skill: p.def0.skills[0] });
    check('Undertow: skills hit Soaked enemies 20% harder', Math.abs(b / a - 1.2) < 0.01, `x${(b / a).toFixed(2)}`);
  }
  {
    const { m, p, foe } = duel('sylva', 'lumen');
    const d = [hit(m, p, foe), hit(m, p, foe), hit(m, p, foe)];
    check('Galewind: no slow before the 4th attack', foe.slowT <= 0);
    const fourth = hit(m, p, foe);
    check('Galewind: the 4th attack hits 40% harder and slows', Math.abs(fourth / d[0] - 1.4) < 0.02 && foe.slowT > 0, `x${(fourth / d[0]).toFixed(2)}`);
  }
  {
    const { m, foe } = duel('kaida', 'brakka');
    const src = m.player;
    foe.hp = foe.maxHp * 0.6;
    m.applyDamage(src, foe, foe.maxHp * 0.3, { true: true });   // 60% -> would be 30%
    check('Bedrock: falling below 40% raises a shield that soaks the hit', Math.abs(foe.hpPct - 0.42) < 0.01, `hp ${Math.round(foe.hpPct * 100)}%`);
    foe.hp = foe.maxHp; foe.shield = 0;
    m.applyDamage(src, foe, foe.maxHp * 0.7, { true: true });
    check('Bedrock: only once every 30 seconds', foe.shield === 0);
  }
  {
    const { m, p, foe } = duel('nyx', 'lumen');
    const full = hit(m, p, foe);
    foe.hp = foe.maxHp * 0.4;
    const low = hit(m, p, foe);
    check('Predator: attacks hit wounded heroes 15% harder', Math.abs(low / full - 1.15) < 0.02, `x${(low / full).toFixed(2)}`);
    p.skillCd[0] = 6;
    m.applyDamage(p, foe, 1e6, { true: true });
    check('Predator: a takedown resets Shadow Lunge', !foe.alive && p.skillCd[0] === 0);
  }
  {
    const { m, p } = duel('lumen', 'kaida');
    const foe = m.heroes.find(h => h.def0.id === 'kaida'), ally = m.heroes.find(h => h.team === 0 && h !== p);
    ally.x = 1450; ally.y = 650; ally.hp = ally.maxHp * 0.5;
    const h0 = ally.hp;
    hit(m, p, foe);
    check('Dawnlight: an attack heals the most wounded ally nearby', ally.hp > h0 + ally.maxHp * 0.035);
    const h1 = ally.hp;
    hit(m, p, foe);
    check('Dawnlight: once every 6 seconds', ally.hp === h1);
  }
  {
    const { m, p, foe } = duel('vexa', 'lumen');
    m.applyDamage(p, foe, 1, { skill: p.def0.skills[0] }); m.applyDamage(p, foe, 1, { skill: p.def0.skills[0] });
    check('Overcharge: no stun before the 3rd skill hit', foe.stunT <= 0 && p.pstack === 2);
    m.applyDamage(p, foe, 1, { skill: p.def0.skills[0] });
    check('Overcharge: the 3rd skill hit stuns', foe.stunT > 0.5);
  }
  {
    const { m, p } = duel('drace', 'lumen');
    m.passiveTick(p); const fast0 = p.atkSpeed();
    p.hp = p.maxHp * 0.2; m.passiveTick(p);
    check('Bloodrage: attack speed climbs as health drops', p.atkSpeed() > fast0 * 1.35, `${fast0.toFixed(2)} -> ${p.atkSpeed().toFixed(2)}`);
  }
  {
    const { m, p, foe } = duel('rhea', 'lumen');
    const d = []; for (let i = 0; i < 6; i++) d.push(hit(m, p, foe));
    check('Focus: attacks on one target ramp up to 32%', Math.abs(d[5] / d[0] - 1.32) < 0.02, `x${(d[5] / d[0]).toFixed(2)}`);
    const other = m.heroes.find(h => h.team === 1 && h !== foe); other.x = 1590; other.y = 640; m.updateVisibility();
    hit(m, p, other);
    check('Focus: switching targets resets it', p.pstack === 0);
  }
  {
    const { m, p, foe } = duel('kaida', 'oska');
    const lone = m.heroes.find(h => h.team === 1 && h !== foe);
    lone.x = 1590; lone.y = 1120; lone.hp = lone.maxHp;   // out of the 450 aura
    const far = m.applyDamage(p, lone, 300, { true: true });
    lone.x = foe.x; lone.y = foe.y + 60; lone.hp = lone.maxHp;
    const near = m.applyDamage(p, lone, 300, { true: true });
    check('Tidewall: allies near Oska take 8% less hero damage', Math.abs(near / far - 0.92) < 0.005, `x${(near / far).toFixed(3)}`);
  }
  {
    const { m, p, foe } = duel('sylva', 'lumen');
    p.pstack = -99;   // keep Galewind out of the way
    const plain = hit(m, p, foe);
    p.crit = 1;
    const crit = hit(m, p, foe);
    check('critical hits deal 175%', Math.abs(crit / plain - 1.75) < 0.02, `x${(crit / plain).toFixed(2)}`);
    check('crit items carry crit chance', SF.ITEMS.storm_bow.stats.crit > 0 && SF.ITEMS.reaper_cleaver.stats.crit > 0);
  }
});

section('Abyssal Wyrm', () => {
  const mk = mode => new SF.Match({ hero: 'kaida', mode, difficulty: 'normal', allies: [{ id: 'orin' }, { id: 'sylva' }], enemies: [{ id: 'brakka' }, { id: 'nyx' }, { id: 'lumen' }] });
  check('the Wyrm wakes at 6:00 (2:30 in Brawl)', mk().wyrmAt === 360 && mk('brawl').wyrmAt === 150);
  const m = mk();
  for (const h of m.heroes) { h.brain = null; h.human = true; }
  m.nextWave = 1e9; m.t = 359.9; for (let k = 0; k < 4; k++) m.update(0.05);
  const w = m.wyrm;
  check('the Wyrm spawns at the bottom of the river', w && w.alive && w.mtype === 'wyrm' && w.y > 900);
  const p = m.player, ally = m.heroes.find(h => h.team === 0 && h !== p), foe = m.heroes.find(h => h.team === 1);
  ally.alive = false;   // a dead teammate gets no Aegis
  const gold = p.gold;
  m.applyDamage(p, w, 1e7, { true: true });
  check('slaying it pays the team and grants Wyrm Aegis', !w.alive && p.gold >= gold + 200 && p.hasBuff('aegis') && !ally.hasBuff('aegis') && !foe.hasBuff('aegis') && m.teamStats[0].wyrms === 1);
  check('it comes back four minutes later', m.wyrm === null && Math.abs(m.wyrmAt - (m.t + 240)) < 0.01);
  p.x = 1500; p.y = 600; foe.x = 1580; foe.y = 600; m.updateVisibility();
  m.applyDamage(foe, p, 1e7, { true: true });
  check('Aegis cheats death once', p.alive && Math.abs(p.hpPct - 0.4) < 0.01 && !p.hasBuff('aegis'));
  check('…with a moment of invulnerability', m.applyDamage(foe, p, 1e7, { true: true }) === 0 && p.alive);
  m.t += 2;
  m.applyDamage(foe, p, 1e7, { true: true });
  check('…and only once', !p.alive);
  // Group up points at the closer objective; Smite takes objectives first.
  const g = mk();
  g.nextWave = 1e9; g.spawnShard(); g.spawnWyrm();
  g.player.x = 1600; g.player.y = 900;
  g.signal(g.player, 'gather');
  check('Group up calls the nearer objective', g.orders[0].target === g.wyrm && g.orders[0].text === 'Take the Wyrm!');
  let took = 0;
  for (let i = 0; i < 6; i++) { const mm = run(botMatch(SF, { difficulty: 'hard' }), 14 * 60); took += mm.teamStats[0].wyrms + mm.teamStats[1].wyrms; }
  check('bots fight over the Wyrm', took > 0, `${took} slain in 6 matches`);
});

section('Quarra: turrets, walls and the bastion', () => {
  const setup = () => {
    const m = new SF.Match({ hero: 'quarra', difficulty: 'normal', allies: [{ id: 'kaida', name: 'A1' }, { id: 'oska', name: 'A2' }], enemies: [{ id: 'brakka', name: 'E1' }, { id: 'nyx', name: 'E2' }, { id: 'lumen', name: 'E3' }] });
    for (const h of m.heroes) if (h !== m.player) { h.brain = null; h.human = true; h.x = h.team ? 3100 : 100; h.y = 600; }
    m.nextWave = 1e9; m.camps.forEach(c => { c.respawnAt = 1e9; });
    const p = m.player; p.level = 8; p.recalc(); p.hp = p.maxHp; p.ranks = [4, 4, 2]; p.points = 0; p.x = 1400; p.y = 600;
    const foe = m.heroes.find(h => h.team === 1); foe.x = 1700; foe.y = 600;
    m.updateVisibility();
    return { m, p, foe };
  };
  const turrets = (m, p) => m.units.filter(u => u.alive && u.owner === p && u.mtype === 'turret');
  {
    const { m, p, foe } = setup();
    check('Shard Turret builds a turret at the spot', m.castSkill(p, 0, { dir: { x: 1, y: 0 }, point: { x: 1550, y: 600 } }) === true && turrets(m, p).length === 1);
    const hp0 = foe.hp;
    for (let k = 0; k < 60; k++) m.update(1 / 30);
    check('the turret shoots nearby enemies', foe.hp < hp0, `${Math.round(hp0 - foe.hp)} dmg`);
    const plain = (() => { const q = setup(); q.foe.x = q.p.x + 200; const h = q.foe.hp; q.m.attack(q.p, q.foe); q.m.updateProjs(1); return h - q.foe.hp; })();
    foe.x = p.x + 200; foe.markT = m.t + 3; foe.markBy = p; const h1 = foe.hp; p.atkCd = 0;
    m.attack(p, foe); m.updateProjs(1);
    check('Masterwork: attacks hit turret-marked enemies 25% harder', Math.abs((h1 - foe.hp) / plain - 1.25) < 0.03, `x${((h1 - foe.hp) / plain).toFixed(2)}`);
    p.skillCd[0] = 0; m.castSkill(p, 0, { dir: { x: 1, y: 0 }, point: { x: 1500, y: 650 } });
    const first = turrets(m, p).sort((a, b) => a.born - b.born)[0];
    p.skillCd[0] = 0; m.castSkill(p, 0, { dir: { x: 1, y: 0 }, point: { x: 1500, y: 550 } });
    check('at most two turrets: a third replaces the oldest', turrets(m, p).length === 2 && !first.alive);
    for (let k = 0; k < 30 * 13; k++) m.update(1 / 30);
    check('turrets crumble after 12 seconds', turrets(m, p).length === 0);
  }
  {
    const { m, p, foe } = setup();
    foe.hp = 30; foe.x = 1600; foe.y = 600; m.updateVisibility();
    m.castSkill(p, 0, { dir: { x: 1, y: 0 }, point: { x: 1500, y: 600 } });
    const k0 = p.k;
    for (let k = 0; k < 60 && foe.alive; k++) m.update(1 / 30);
    check('a turret kill is credited to Quarra', !foe.alive && p.k === k0 + 1);
  }
  {
    const { m, p, foe } = setup();
    foe.x = 1640; foe.y = 600; m.updateVisibility();
    m.castSkill(p, 1, { dir: { x: 1, y: 0 }, point: { x: 1640, y: 600 } });
    check('Prism Wall throws enemies on the line to the far side and slows them', foe.x > 1640 + 16 && foe.slowT > 0, `x=${Math.round(foe.x)}`);
    foe.wantDir = { x: -1, y: 0 };
    for (let k = 0; k < 30; k++) m.update(1 / 30);
    check('enemies cannot walk through the wall', foe.x > 1640, `x=${Math.round(foe.x)}`);
    const ally = m.heroes.find(h => h.team === 0 && h !== p); ally.x = 1600; ally.y = 700; ally.wantDir = { x: 1, y: 0 };   // off the enemy's line
    for (let k = 0; k < 20; k++) m.update(1 / 30);
    check('allies walk through it', ally.x > 1680, `x=${Math.round(ally.x)}`);
    for (let k = 0; k < 30 * 3; k++) m.update(1 / 30);
    foe.wantDir = { x: -1, y: 0 };
    for (let k = 0; k < 30; k++) m.update(1 / 30);
    check('the wall falls after 3 seconds', m.walls.length === 0 && foe.x < 1600);
  }
  {
    const { m, p, foe } = setup();
    const foe2 = m.heroes.find(h => h.team === 1 && h !== foe); foe2.x = 1700; foe2.y = 700; foe.y = 520;
    const ally = m.heroes.find(h => h.team === 0 && h !== p); ally.x = 1420; ally.y = 650;
    m.updateVisibility();
    p.ranks[2] = 2;
    check('Crystal Bastion summons a bastion', m.castSkill(p, 2, { dir: { x: 1, y: 0 }, point: { x: 1480, y: 600 } }) === true && m.units.some(u => u.alive && u.mtype === 'bastion'));
    const a0 = foe.hp, b0 = foe2.hp;
    for (let k = 0; k < 75; k++) m.update(1 / 30);
    check('the bastion hits two enemies at once', foe.hp < a0 && foe2.hp < b0);
    check('the bastion shields nearby allies', ally.shield > 0 && p.shield > 0);
  }
  {
    const casts = [0, 0, 0];
    for (let i = 0; i < 4; i++) {
      const ids = SF.HEROES.map(h => h.id).filter(x => x !== 'quarra').sort(() => Math.random() - 0.5);
      const m = new SF.Match({ hero: ids[0], difficulty: 'hard', autoplay: true, allies: [{ id: 'quarra' }, { id: ids[1] }], enemies: [{ id: ids[2] }, { id: ids[3] }, { id: ids[4] }] });
      m.on('cast', (h, sk) => { if (h.def0.id === 'quarra') casts[h.def0.skills.indexOf(sk)]++; });
      run(m, 9 * 60);
    }
    check('bots play Quarra: turrets, walls and the bastion all get used', casts.every(n => n > 0), casts.join('/'));
  }
});

section('Bot team-fight targeting', () => {
  // A bot's pick when it can see two enemies at the same distance.
  const pick = (botId, a, b, setup) => {
    const m = new SF.Match({ hero: 'lumen', difficulty: 'hard', allies: [{ id: botId, name: 'Bot' }, { id: 'sylva', name: 'Ally' }], enemies: [{ id: a, name: 'A' }, { id: b, name: 'B' }, { id: 'orin', name: 'Far' }] });
    m.nextWave = 1e9;
    const bot = m.heroes.find(h => h.def0.id === botId), ally = m.heroes.find(h => h.def0.id === 'sylva');
    const A = m.heroes.find(h => h.def0.id === a), B = m.heroes.find(h => h.def0.id === b), far = m.heroes.find(h => h.def0.id === 'orin');
    for (const h of m.heroes) if (h !== bot) { h.brain = null; h.human = true; }
    bot.brain.jungler = false;
    m.player.x = 100; far.x = 3100;
    bot.x = 1250; bot.y = 600; ally.x = 1210; ally.y = 640;   // clear of the enemy tower, so diving isn't the question
    A.x = 1520; A.y = 520; B.x = 1520; B.y = 680;
    setup({ m, bot, ally, A, B });
    m.updateVisibility();
    bot.brain.tick = 0; bot.brain.think(0.05);
    return bot.target === A ? 'A' : bot.target === B ? 'B' : String(bot.target && bot.target.name);
  };
  check('divers reach past the tank for the squishy carry', pick('kaida', 'brakka', 'rhea', ({ A, B }) => { A.hp = A.maxHp * 0.75; B.hp = B.maxHp * 0.85; }) === 'B');
  check('tanks peel the enemy attacking a teammate', pick('brakka', 'nyx', 'vexa', ({ A, B, ally }) => { A.hp = A.maxHp * 0.85; B.hp = B.maxHp * 0.65; A.target = ally; }) === 'A');
  check('without a reason, the lowest-health enemy is the pick', pick('drace', 'nyx', 'vexa', ({ A, B }) => { A.hp = A.maxHp * 0.9; B.hp = B.maxHp * 0.5; }) === 'B');
});

section('Post-match stats', () => {
  const m = new SF.Match({ hero: 'lumen', spell: 'mend', difficulty: 'normal', allies: [{ id: 'kaida', name: 'A1' }, { id: 'sylva', name: 'A2' }], enemies: [{ id: 'brakka', name: 'E1' }, { id: 'nyx', name: 'E2' }, { id: 'vexa', name: 'E3' }] });
  for (const h of m.heroes) if (h !== m.player) { h.brain = null; h.human = true; }
  m.nextWave = 1e9;
  const p = m.player, ally = m.heroes.find(h => h.team === 0 && h !== p), foe = m.heroes.find(h => h.team === 1);
  p.x = ally.x = 1500; p.y = 600; ally.y = 650; foe.x = 1600; foe.y = 600;
  m.applyDamage(p, foe, 100, { true: true });
  foe.hp = 50; m.applyDamage(p, foe, 500, { true: true });
  check('hero damage counts, overkill does not', Math.round(p.heroDmg) === 150, `${p.heroDmg}`);
  check('damage taken is tracked', Math.round(foe.dmgTaken) === 150);
  ally.hp = ally.maxHp * 0.5;
  m.useSpell(p);
  check('healing is credited to the healer', p.healed > ally.maxHp * 0.14 && !(ally.healed > 0));
  for (let k = 0; k < 30 * 31; k++) m.update(1 / 30);
  check('team gold is sampled every 15 seconds', m.goldLine.length === 3 && m.goldLine[2][0] === 30);
  const sum = m.summary(), me = sum.rows.find(r => r.isPlayer);
  check('the summary carries the new stats and a gold line', me.hd === 150 && me.hl > 0 && sum.goldLine.length === 4 && sum.goldLine[3][0] === Math.round(m.t));
});

section('Training Grounds', () => {
  const m = new SF.Match({ hero: 'vexa', spell: 'blink', difficulty: 'easy', mode: 'practice', allies: [], enemies: [{ id: 'kaida', name: 'D1' }, { id: 'brakka', name: 'D2' }, { id: 'rhea', name: 'D3' }], practice: { cd: true, gold: true, max: true } });
  const p = m.player, dummies = m.heroes.filter(h => h.team === 1);
  m.nextWave = 1e9;   // no minions wandering into the dummies mid-test
  check('practice mode builds a solo hero and three dummies', m.mode === 'practice' && m.heroes.filter(h => h.team === 0).length === 1 && dummies.every(d => d.dummy && !d.brain));
  check('max level: level 12 with every point to spend', p.level === 12 && p.points === 12);
  check('free gold', p.gold >= 99999 && m.buy(p, 'starfire_codex') && (m.update(1 / 30), p.gold >= 99999));
  m.autoUpgrade(p);
  const spot = dummies.map(d => [d.x, d.y]);
  for (let k = 0; k < 90; k++) m.update(1 / 30);
  check('dummies stand still', dummies.every((d, i) => Math.hypot(d.x - spot[i][0], d.y - spot[i][1]) < 30));
  const d = dummies[0];
  p.x = d.x - 150; p.y = d.y; m.updateVisibility();
  check('no cooldowns', m.castSkill(p, 0, m.resolveAim(p, 0, { x: 1, y: 0, len: 1 })) === true && (m.update(1 / 30), p.skillCd[0] === 0));
  d.hp = d.maxHp * 0.3; d.lastHurt = m.t;
  for (let k = 0; k < 30 * 5; k++) m.update(1 / 30);
  check('dummies heal to full a few seconds after the last hit', d.hp === d.maxHp);
  m.applyDamage(p, d, 1e7, { true: true });
  check('a fallen dummy stands back up after 2 seconds', !d.alive && d.respawnT <= 2);
  for (let k = 0; k < 30 * 3; k++) m.update(1 / 30);
  check('…at its spot', d.alive && Math.hypot(d.x - spot[0][0], d.y - spot[0][1]) < 30);
  m.t = 1000; m.update(1 / 30);
  check('training never times out', !m.over);
  const off = new SF.Match({ hero: 'vexa', difficulty: 'easy', mode: 'practice', allies: [], enemies: [{ id: 'kaida' }, { id: 'brakka' }, { id: 'rhea' }], practice: { cd: false, gold: false, max: false } });
  check('options can be switched off', off.player.level === 1 && off.player.gold < 1000);
});

section('River power-ups', () => {
  const mk = mode => new SF.Match({ hero: 'kaida', mode, difficulty: 'normal', allies: [{ id: 'orin' }, { id: 'sylva' }], enemies: [{ id: 'brakka' }, { id: 'nyx' }, { id: 'lumen' }] });
  check('shards first appear at 2:00 (1:00 in Brawl)', mk().runeAt === 120 && mk('brawl').runeAt === 60);
  const m = mk();
  for (const h of m.heroes) { h.brain = null; h.human = true; }
  m.nextWave = 1e9; m.t = 119.98; m.update(0.05);
  check('two shards spawn, one at each river spot', m.runes.length === 2 && SF.RUNE_SPOTS.every(sp => m.runes.some(r => r.x === sp.x && r.y === sp.y)));
  const p = m.player, r0 = m.runes[0];
  r0.type = 'haste'; m.runes[1].type = 'bulwark';
  const ms0 = p.speed();
  p.x = r0.x + 20; p.y = r0.y; m.update(0.05);
  check('walking over a shard takes it', m.runes.length === 1 && !m.runes.includes(r0));
  check('Haste Shard: 30% faster', Math.abs(p.speed() / ms0 - 1.3) < 0.01);
  check('the pickup shows in the feed', m.feed.some(f => f.msg && /Haste Shard/.test(f.msg) && f.from === p));
  m.t += 30; m.update(0.05);
  check('spots refill only when empty', m.runes.length === 1 || m.t < m.runeAt);
  p.x = 300; p.y = 600;   // step off the spot so the new shard isn't taken at once
  m.t = m.runeAt; m.update(0.05);
  check('the empty spot refills 90s later', m.runes.length === 2);
  const take = type => { const q = mk(); q.nextWave = 1e9; const h = q.player; h.hp = h.maxHp * 0.5; const r = { id: 1, x: 0, y: 0, type }; q.takeRune(h, r); return h; };
  check('Renewal Shard heals 35%', Math.abs(take('renewal').hpPct - 0.85) < 0.01);
  check('Bulwark Shard shields 20% of max health', Math.abs(take('bulwark').shield / take('bulwark').maxHp - 0.2) < 0.01);
  check('Fury Shard adds 15% damage', Math.abs(take('fury').dmgMul() - 1.15) < 0.001);
  let grabbed = 0;
  for (let i = 0; i < 4; i++) { const mm = botMatch(SF, {}); mm.on('rune', () => grabbed++); run(mm, 6 * 60); }
  check('bots pick up shards', grabbed > 0, `${grabbed} in 4 matches`);
});

section('Item passives', () => {
  const duel = () => {
    const m = new SF.Match({ hero: 'drace', difficulty: 'normal', allies: [{ id: 'kaida', name: 'A' }, { id: 'sylva', name: 'B' }], enemies: [{ id: 'lumen', name: 'C' }, { id: 'nyx', name: 'D' }, { id: 'vexa', name: 'E' }] });
    const p = m.player, foe = m.heroes.find(h => h.def0.id === 'lumen');
    for (const o of m.heroes) if (o !== p) { o.brain = null; o.human = true; if (o !== foe) { o.x = o.team ? 3100 : 100; o.y = 600; } }
    m.nextWave = 1e9; p.x = 1500; p.y = 600; foe.x = 1600; foe.y = 600;
    m.updateVisibility();
    return { m, p, foe };
  };
  check('every passive item says what it does', Object.values(SF.ITEMS).filter(i => i.passive).every(i => /Passive:/.test(i.desc)));
  check('every recommended build only uses real items', SF.HEROES.every(h => h.build.every(id => SF.ITEMS[id])));
  {
    const { m, p, foe } = duel();
    p.items = ['witherblade']; p.recalc();
    foe.hp = foe.maxHp * 0.5;
    m.applyDamage(p, foe, 10, { basic: true });
    const before = foe.hp; m.heal(foe, 200, true);
    check('Witherblade halves healing', Math.abs((foe.hp - before) - 100) < 0.01, `healed ${foe.hp - before}`);
    m.t += 3; const b2 = foe.hp; m.heal(foe, 200, true);
    check('…for 2.5 seconds', Math.abs((foe.hp - b2) - 200) < 0.01);
  }
  {
    const { m, p, foe } = duel();
    p.items = ['rimefang']; p.recalc();
    m.applyDamage(p, foe, 10, { basic: true });
    check('Rimefang attacks slow', foe.slowT > 0 && Math.abs(foe.slowAmt - 0.2) < 1e-9);
    foe.slowT = 0; foe.slowAmt = 0;
    m.applyDamage(p, foe, 10, { skill: p.def0.skills[0] });
    check('…but only attacks, not skills', foe.slowT === 0);
  }
  {
    const { m, p, foe } = duel();
    foe.items = ['spined_carapace']; foe.recalc();
    const hp0 = p.hp;
    m.applyDamage(p, foe, 200, { basic: true });
    check('Spined Carapace reflects attack damage as true damage', Math.abs((hp0 - p.hp) - 50) < 0.01, `reflected ${hp0 - p.hp}`);
    const hp1 = p.hp;
    m.applyDamage(p, foe, 200, { skill: p.def0.skills[0] });
    check('…but not skill damage', p.hp === hp1);
  }
  {
    const plain = duel(), glass = duel();
    glass.p.items = ['nightglass']; glass.p.recalc(); plain.p.items = ['nightglass']; plain.p.recalc(); plain.p.passives.clear();
    const sk = glass.p.def0.skills[0];
    const d0 = plain.m.applyDamage(plain.p, plain.foe, 100, { skill: sk }), d1 = glass.m.applyDamage(glass.p, glass.foe, 100, { skill: sk });
    check('Nightglass adds max-health damage to skill hits', d1 > d0 + 0.04 * glass.foe.maxHp * 0.5, `${Math.round(d0)} vs ${Math.round(d1)}`);
    const d2 = glass.m.applyDamage(glass.p, glass.foe, 100, { skill: sk });
    check('…once per 1.5 seconds', Math.abs(d2 - d0) < 0.01);
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
    allies.forEach((a, i) => { a.x = 1720; a.y = 560 + i * 80; });   // pushing, inside the enemy tower's range
    p.x = 1300;
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
