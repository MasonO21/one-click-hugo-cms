#!/usr/bin/env node
// Per-hero win rates from bot-only matches:  node tools/balance.mjs [games per hero, default 200] [hero ...]
// Each hero plays half its games on each side, always on Normal (so neither side gets the
// difficulty damage bonus), with random teammates and opponents. One process per hero, run in
// parallel. At 200 games a hero's rate is good to about ±7%, at 300 to about ±6%.
import { readFileSync } from 'node:fs';
import { fork } from 'node:child_process';
import { cpus } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const web = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'js');
function loadSF() {
  const ctx = { console, Math, Date, JSON, Map, Set, Promise, setTimeout, clearTimeout };
  ctx.window = ctx; ctx.performance = { now: () => Date.now() };
  vm.createContext(ctx);
  for (const f of ['data.js', 'match.js']) vm.runInContext(readFileSync(join(web, f), 'utf8'), ctx, { filename: f });
  return ctx.SF;
}

function play(hero, n) {
  const SF = loadSF();
  const r = { hero, n, wins: 0, jungle: 0, jungleWins: 0, k: 0, d: 0 };
  for (let i = 0; i < n; i++) {
    const others = SF.HEROES.map(h => h.id).filter(id => id !== hero).sort(() => Math.random() - 0.5);
    const blue = i % 2 === 0 ? [hero, others[0], others[1]] : others.slice(0, 3);
    const red = i % 2 === 1 ? [hero, others[3], others[4]] : others.slice(3, 6);
    const m = new SF.Match({ hero: blue[0], difficulty: 'normal', autoplay: true,
      allies: [{ id: blue[1], name: 'B1' }, { id: blue[2], name: 'B2' }], enemies: red.map((id, j) => ({ id, name: 'R' + j })) });
    for (let s = 0; !m.over && s < 30 * 900; s++) m.update(1 / 30);
    const h = m.heroes.find(x => x.def0.id === hero), won = h.team === m.winner;
    if (won) r.wins++;
    if (h.brain && h.brain.jungler) { r.jungle++; if (won) r.jungleWins++; }
    r.k += h.k; r.d += h.dth;
  }
  return r;
}

if (process.env.SF_BALANCE_CHILD) {
  process.on('message', ({ hero, n }) => { process.send(play(hero, n)); process.exit(0); });
} else {
  const n = +(process.argv[2] || 200);
  const SF = loadSF();
  const heroes = process.argv.slice(3).length ? process.argv.slice(3) : SF.HEROES.map(h => h.id);
  const queue = heroes.slice(), results = [];
  const runOne = () => new Promise(done => {
    const hero = queue.shift();
    if (!hero) return done();
    const child = fork(fileURLToPath(import.meta.url), [], { env: Object.assign({}, process.env, { SF_BALANCE_CHILD: '1' }) });
    child.on('message', r => results.push(r));
    child.on('exit', () => runOne().then(done));
    child.send({ hero, n });
  });
  console.log(`Simulating ${n} matches for each of ${heroes.length} heroes…`);
  await Promise.all(Array.from({ length: Math.min(cpus().length, heroes.length) }, runOne));
  results.sort((a, b) => b.wins / b.n - a.wins / a.n);
  for (const r of results) {
    const pct = x => Math.round(x * 100) + '%';
    console.log(`  ${SF.HERO[r.hero].name.padEnd(8)} ${pct(r.wins / r.n).padStart(4)}   K/D ${(r.k / r.n).toFixed(1)}/${(r.d / r.n).toFixed(1)}` +
      (r.jungle ? `   as jungler ${pct(r.jungleWins / r.jungle)} of ${r.jungle}` : ''));
  }
}
