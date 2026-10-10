// Pacing bot CLI: plays a fresh colony to Titanium with the engaged-player bot (tests/pacing/*) and prints the
// pacing report (time to each tier, gaps between accomplishments, bottlenecks, storage caps, raids, research
// backlog, missions, exploration, expeditions, sessions).
//
//   node scripts/pacing-bot.mjs                        20-minute sessions, 5 a day (offline gaps in between)
//   node scripts/pacing-bot.mjs --mode online          one continuous session
//   node scripts/pacing-bot.mjs --session-min 30 --per-day 3 --nova spend --out /tmp/pacing/run1
//
// Options: --mode sessions|online  --session-min N  --per-day N  --nova save|spend  --pace human|fast
//          --seed N  --hours N (max online hours)  --post-titanium N (online hours after Titanium)
//          --out PATH (writes PATH.md, PATH.json with every event/sample, PATH.log with the bot's decisions)
//          --saves DIR  QA saves in the localStorage envelope: DIR/tier-<n>.txt the moment each tier is reached,
//                       DIR/tier-6-plus<H>h.txt H online hours into Titanium (--ti-save-h, default 3) and DIR/final.txt.
//                       Rebased so they load as "just closed" at the time they are written (the bot's calendar starts
//                       2026-10-12); DIR/raw/ keeps the bot's own calendar. tests/pacing/qa.ts rebaseSave moves them again.
//          --save-at M,M...  with --saves: also DIR/min-<M>.txt at these online minutes (e.g. 10,20,30)
//          --soak  save sizes, growing lists, NaN/Infinity, step cost and notification plans (PATH.soak.md / .json)
// TypeScript is loaded through Vite's module runner, so no extra tooling is needed.
import { runnerImport } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  process.exit(0);
}
const arg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
};
const opts = {
  mode: arg('mode', 'sessions'),
  sessionMin: Number(arg('session-min', 20)),
  sessionsPerDay: Number(arg('per-day', 5)),
  nova: arg('nova', 'save'),
  pace: arg('pace', 'human'),
  seed: Number(arg('seed', 20261012)),
  maxOnlineHours: Number(arg('hours', 80)),
  postTitaniumHours: Number(arg('post-titanium', 0)),
  verbose: args.includes('--verbose'),
};
const out = arg('out', null);
const savesDir = arg('saves', null);
const tiSaveH = Number(arg('ti-save-h', 3));
const saveAt = String(arg('save-at', '')).split(',').filter(Boolean).map(Number).sort((a, b) => a - b);
const soak = args.includes('--soak');

const load = async (rel) => (await runnerImport(path.join(root, rel), { root, configFile: false, logLevel: 'error' })).module;
const { runPlaythrough } = await load('tests/pacing/run.ts');
const { fullReport } = await load('tests/pacing/report.ts');

const { exportSave } = await load('tests/pacing/qa.ts');
const { soakHooks, soakReport } = await load('tests/pacing/soak.ts');
const hooks = { onTier: [], onSample: [], onClose: [], inspect: [] };
let soakData = null;
if (soak) {
  const s = soakHooks(2);
  soakData = s.data;
  for (const k of Object.keys(hooks)) if (s.hooks[k]) hooks[k].push(s.hooks[k]);
}
if (savesDir) {
  fs.mkdirSync(path.join(savesDir, 'raw'), { recursive: true });
  const write = (name, game) => {
    fs.writeFileSync(path.join(savesDir, 'raw', name), exportSave(game));
    fs.writeFileSync(path.join(savesDir, name), exportSave(game, Date.now()));
    console.error(`[saves] ${name}: tier ${game.state.colony.tier}, ${(game.state.playTime / 3600).toFixed(1)} h online, ${game.state.colonists.list.length} colonists`);
  };
  let tiAt = -1;
  hooks.onTier.push((tier, game) => {
    write(`tier-${tier}.txt`, game);
    if (tier >= 6) tiAt = game.state.playTime;
  });
  hooks.onSample.push((game) => {
    while (saveAt.length && game.state.playTime >= saveAt[0] * 60) write(`min-${saveAt.shift()}.txt`, game);
    if (tiAt >= 0 && game.state.playTime - tiAt >= tiSaveH * 3600) {
      tiAt = -1;
      write(`tier-6-plus${tiSaveH}h.txt`, game);
    }
  });
  hooks.inspect.push((game) => write('final.txt', game));
}
for (const k of Object.keys(hooks)) {
  const list = hooks[k];
  if (list.length) opts[k] = (...a) => list.forEach((f) => f(...a));
}
const r = runPlaythrough(opts);
const title = `Pacing playthrough (${opts.mode}${opts.mode === 'sessions' ? `, ${opts.sessionMin} min x ${opts.sessionsPerDay}/day` : ''}, ${opts.pace}, Nova ${opts.nova})`;
const md = fullReport(r, title);
console.log(md);
if (out) {
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(`${out}.md`, md);
  fs.writeFileSync(`${out}.json`, JSON.stringify(r));
  fs.writeFileSync(`${out}.log`, r.botLog.join('\n'));
  if (soakData) {
    fs.writeFileSync(`${out}.soak.md`, soakReport(r, soakData));
    fs.writeFileSync(`${out}.soak.json`, JSON.stringify({ ...soakData, stepCost: r.stepCost }));
  }
  console.log(`\nwrote ${out}.md, ${out}.json, ${out}.log`);
}
