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
  maxOnlineHours: Number(arg('hours', 40)),
  postTitaniumHours: Number(arg('post-titanium', 0)),
  verbose: args.includes('--verbose'),
};
const out = arg('out', null);

const load = async (rel) => (await runnerImport(path.join(root, rel), { root, configFile: false, logLevel: 'error' })).module;
const { runPlaythrough } = await load('tests/pacing/run.ts');
const { fullReport } = await load('tests/pacing/report.ts');

const r = runPlaythrough(opts);
const title = `Pacing playthrough (${opts.mode}${opts.mode === 'sessions' ? `, ${opts.sessionMin} min x ${opts.sessionsPerDay}/day` : ''}, ${opts.pace}, Nova ${opts.nova})`;
const md = fullReport(r, title);
console.log(md);
if (out) {
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(`${out}.md`, md);
  fs.writeFileSync(`${out}.json`, JSON.stringify(r));
  fs.writeFileSync(`${out}.log`, r.botLog.join('\n'));
  console.log(`\nwrote ${out}.md, ${out}.json, ${out}.log`);
}
