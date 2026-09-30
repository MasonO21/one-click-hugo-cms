// Builds src/locales/en.json — every piece of text the player can see, in English — from two sources:
//  1. string literals passed to t() / tk() in src/*.js (the English wording is the key; 'one|other' marks a plural), and
//  2. game content in src/data.js (creature names, decor, quests…), keyed by id like 'form:crab.0'.
// Translators work from en.json; test/i18n.test.mjs checks that every locale has every key.
//   node tools/i18n-extract.mjs          write src/locales/en.json (and create empty locale files that don't exist yet)
//   node tools/i18n-extract.mjs --check  exit 1 if en.json is out of date
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as D from '../src/data.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_KEY = /^[a-z]+:[\w.-]+$/;
const plural = (s) => (s.includes('|') ? { one: s.split('|')[0], other: s.split('|')[1] } : s);

/** UI strings: literal first arguments of t( and tk( in the shipped source. */
export function uiStrings() {
  const out = new Map();
  for (const f of fs.readdirSync(path.join(root, 'src')).filter((n) => n.endsWith('.js')).sort()) {
    const src = fs.readFileSync(path.join(root, 'src', f), 'utf8');
    const re = /\b(?:t|tk|tr)\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)")/g;
    let m;
    while ((m = re.exec(src))) {
      const line = src.slice(src.lastIndexOf('\n', m.index) + 1, m.index).trim();
      if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) continue;      // examples in comments
      const key = (m[1] ?? m[2]).replace(/\\(['"\\])/g, '$1');
      if (!key || CONTENT_KEY.test(key)) continue;
      if (!out.has(key)) out.set(key, f);
    }
  }
  return out;
}

/** Game content from data.js. */
export function contentStrings() {
  const c = {};
  for (const id of D.FORM_IDS) { c[`form:${id}`] = D.FORMS[id].name; c[`blurb:${id}`] = D.FORMS[id].blurb; }
  for (const fam of D.FAMILY_IDS) c[`hint:${fam}`] = D.FAMILIES[fam].hint;
  for (const tr of D.TRAITS) c[`trait:${tr}`] = D.TRAIT_INFO[tr].name;
  for (const [id, p] of Object.entries(D.PIECES)) { c[`piece:${id}`] = p.name; c[`pieceshort:${id}`] = p.short || p.name; }
  for (const id of D.DECOR_IDS) { const d = D.DECOR[id]; if (d.fig) continue; c[`decor:${id}`] = d.name; if (d.blurb) c[`decorblurb:${id}`] = d.blurb; }
  for (const it of D.GACHA_POOL) if (it.filler) c[`prize:${it.id}`] = it.name;
  for (const [id, p] of Object.entries(D.PACKS)) { c[`pack:${id}`] = p.name; c[`packblurb:${id}`] = p.blurb; }
  for (const [pid, P] of Object.entries(D.PRODUCTS)) if (P.type !== 'consumable') c[`product:${pid.slice(D.APP_ID.length + 1)}`] = P.name;
  for (const [id, b] of Object.entries(D.BOOSTS)) { c[`boost:${id}`] = b.name; c[`boostdesc:${id}`] = b.desc; }
  for (const q of D.QUEST_TEMPLATES) c[`quest:${q.id}`] = plural(q.text);
  for (const w of D.GIFT_WINDOWS) c[`gift:${w.id}`] = w.name;
  for (const tier of D.GACHA.tiers) c[`tier:${tier.id}`] = tier.name;
  return c;
}

export function buildEnglish() {
  const en = contentStrings();
  for (const key of [...uiStrings().keys()].sort((a, b) => a.localeCompare(b, 'en'))) en[key] = plural(key);
  return en;
}
export const stringify = (o) => JSON.stringify(o, null, 1) + '\n';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = path.join(root, 'src/locales/en.json'), json = stringify(buildEnglish());
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== json) { console.error('src/locales/en.json is out of date. Run: npm run i18n'); process.exit(1); }
    console.log('src/locales/en.json is up to date');
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, json);
    const n = Object.keys(JSON.parse(json)).length;
    console.log(`src/locales/en.json: ${n} strings (${Object.keys(contentStrings()).length} content, ${n - Object.keys(contentStrings()).length} interface)`);
  }
}
