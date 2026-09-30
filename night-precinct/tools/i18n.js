// Translation catalog tooling.
//   node tools/i18n.js extract   -> game/i18n/source.json  (every English string the game shows, with a usage note)
//   node tools/i18n.js check     -> checks every game/i18n/<code>.json against source.json
// A catalog file maps the English text to the translation: { "Rally Boost": "Impulso de patrulla", ... }.
// Placeholders like {rank} and inline tags like <strong> must be kept exactly.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'game', 'src'), DIR = path.join(ROOT, 'game', 'i18n');
const CODES = ['es', 'fr', 'de', 'it', 'pt-BR', 'ja', 'ko', 'zh-Hans', 'zh-Hant'];

/* Notes for strings whose space on screen is tight or whose meaning is not obvious from the text. */
const NOTES = {
  'HQ': 'bottom tab label, max 8 chars', 'Roster': 'bottom tab label, max 8 chars', 'Gear-Up': 'bottom tab label (upgrades), max 8 chars',
  'Cases': 'bottom tab label (timed jobs and crates), max 8 chars', 'Store': 'bottom tab label, max 8 chars', 'Career': 'bottom tab label, max 8 chars',
  'MAX': 'buy-amount toggle, max 4 chars', 'Claim': 'small button, max 10 chars', 'claim': 'lowercase chip status, max 8 chars', 'Open': 'small button', 'ON': 'chip status', 'OFF': 'chip status',
  '{n}s': 'duration: seconds, compact', '{n}m': 'duration: MINUTES, compact', '{h}h {m}m': 'duration: hours and minutes, compact', '{h}h': 'duration: hours, compact',
  '{d}d {h}h': 'duration: days and hours, compact', '{d}d': 'duration: days, compact', 'D{n}': 'calendar cell: Day number, max 4 chars',
  '2x INCOME': 'header chip, capitals, max 14 chars', "CHIEF'S CLUB": 'header chip (subscription name), capitals', 'STARTER DEAL': 'header chip, capitals', 'RALLY BOOST': 'header chip, capitals',
  'DAILY REWARD': 'header chip, capitals', 'AUTO': 'header chip: auto-clicker', 'COMBO AUTO': 'header chip: combo auto-clicker', 'AUTO-CLICK': 'header chip: buy the auto-clicker',
  '24H DONUTS': 'neon shop sign on the police street, very short', '24H CLINIC': 'neon sign on the EMS street, very short', 'STATION 1': 'sign on the fire station, very short',
  "Chief's Club": 'name of the weekly subscription (a VIP club); translate or keep, but be consistent everywhere',
  'Gold Badges': 'premium currency name; be consistent everywhere', 'Medals': 'prestige currency earned by promotion',
  'Have 25 {units}': '{units} is the unit name; in English it is pluralised with s, in other languages it is the singular name, so phrase around it (e.g. "25 x {units}")',
  '25 free {units}': 'see "Have 25 {units}"', 'A fresh start with 10 free {units} and {n} Gold Badges. Your legacy bonus, Badges, gear and purchases came with you.': 'see "Have 25 {units}"',
  'Crews, upgrades and cash reset. Badges, gear, recruits, cosmetics and purchases stay. You restart with {n} {units} and 25 Badges.': 'see "Have 25 {units}"',
  'Tap {button} or the street to earn your first {amount}': '{button} is the big tap button word in capitals, e.g. ARREST',
  'By buying you agree to the {terms}, {privacy} and {purchase}.': 'the placeholders become links named Terms of Use, Privacy Policy and Purchase Terms',
  "Chief's Club renews automatically every week until you cancel. Payment is charged to your Apple Account when you confirm. Cancel at least 24 hours before the end of the current week in Settings, then your name, then Subscriptions. Deleting the app does not cancel it.": 'Apple-required subscription disclosure; translate accurately, use the iOS Settings wording of your language',
  'Automatic ({language})': 'language setting: follow the device language; {language} is the language name',
};

function extractStatic() {
  const keys = new Map();
  const re = /(?:\b_|\bN_|\beT|\bhT)\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/g;
  for (const f of fs.readdirSync(SRC).filter(f => f.endsWith('.js')).sort()) {
    const text = fs.readFileSync(path.join(SRC, f), 'utf8');
    let m;
    while ((m = re.exec(text))) {
      const s = m[2].replace(/\\(['"\\])/g, '$1');
      const line = text.slice(0, m.index).split('\n').length;
      if (!keys.has(s)) keys.set(s, `${f}:${line}`);
    }
  }
  return keys;
}

async function extractRuntime() {
  const out = path.join(ROOT, 'game', 'tests', '.build', 'i18n_extract.html');
  execFileSync('python3', [path.join(ROOT, 'tools', 'build.py'), '--target', 'native', '--debug', '--out', out], { stdio: 'ignore' });
  const { launch } = require(path.join(ROOT, 'game', 'tests', 'lib.js'));
  const b = await launch(); const p = await (await b.newContext()).newPage();
  await p.goto('file://' + out); await p.waitForTimeout(300);
  const data = await p.evaluate(() => [...window.__np.I18N_SEEN.entries()]);
  await b.close();
  return new Map(data);
}

async function extract() {
  const stat = extractStatic(), run = await extractRuntime();
  const all = {};
  for (const [k, ctx] of stat) all[k] = NOTES[k] || ('ui text (' + ctx + ')');
  for (const [k, ctx] of run) if (!(k in all)) all[k] = NOTES[k] || ctx;
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, 'source.json'), JSON.stringify(all, null, 1) + '\n');
  console.log(`source.json: ${Object.keys(all).length} strings (${stat.size} in code, ${run.size} in data)`);
}

const tokens = s => (s.match(/\{\w+\}/g) || []).sort().join(',');
const tags = s => (s.match(/<\/?[a-z]+>/gi) || []).sort().join(',');
function check() {
  const src = JSON.parse(fs.readFileSync(path.join(DIR, 'source.json'), 'utf8'));
  let bad = 0;
  const only = process.argv[3];
  for (const code of CODES.filter(c => !only || c === only)) {
    const f = path.join(DIR, code + '.json');
    if (!fs.existsSync(f)) { console.log(`${code}: MISSING FILE`); bad++; continue; }
    let cat; try { cat = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.log(`${code}: invalid JSON ${e.message}`); bad++; continue; }
    const missing = Object.keys(src).filter(k => !(k in cat) || typeof cat[k] !== 'string' || !cat[k].trim());
    const extra = Object.keys(cat).filter(k => !(k in src));
    const ph = Object.keys(src).filter(k => typeof cat[k] === 'string' && cat[k] && (tokens(k) !== tokens(cat[k]) || tags(k) !== tags(cat[k])));
    const same = Object.keys(src).filter(k => cat[k] === k && /[a-z]{4}/.test(k) && !/^\{|Night Precinct/.test(k));
    const ok = !missing.length && !ph.length;
    if (!ok) bad++;
    console.log(`${code}: ${Object.keys(src).length - missing.length}/${Object.keys(src).length} translated` +
      (missing.length ? `, ${missing.length} missing (e.g. ${JSON.stringify(missing.slice(0, 3))})` : '') +
      (ph.length ? `, ${ph.length} placeholder/tag mismatches (e.g. ${JSON.stringify(ph.slice(0, 3))})` : '') +
      (extra.length ? `, ${extra.length} unused` : '') + (same.length ? `, ${same.length} left in English` : ''));
  }
  process.exit(bad ? 1 : 0);
}

const cmd = process.argv[2];
if (cmd === 'extract') extract();
else if (cmd === 'check') check();
else console.log('usage: node tools/i18n.js extract | check [code]');
