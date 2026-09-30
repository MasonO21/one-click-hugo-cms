// Tiny Tides — game text.
// The game ships in English. All UI text goes through t(), keyed by its English wording: t('Level up'), t('Need {n} pearls', { n }).
// Plural text is written 'one|other': t('{n} pull left|{n} pulls left', { n }) (pass `count` too when n is formatted markup).
// Game content (creature names, decor, quests…) is keyed by id: t('form:crab.0').
// src/locales/en.json is generated from the code and src/data.js by `npm run i18n` — never edit it by hand. To add a language later,
// add its code to D.LANG_CODES and a translated src/locales/<code>.json, and import it into DICTS below.
import * as D from './data.js';
import en from './locales/en.json' with { type: 'json' };

const DICTS = { en };
export const LANG_CODES = D.LANG_CODES;

let cur = 'en', dict = en, rules = new Intl.PluralRules('en');

/** Marks a literal as translatable where it is defined, for text translated later with t(variable). Returns it unchanged. */
export const tk = (s) => s;

export function setLang(code) {
  cur = DICTS[code] ? code : 'en';
  dict = DICTS[cur];
  rules = new Intl.PluralRules(cur);
  try { document.documentElement.lang = cur; } catch { /* no DOM (tests) */ }
  return cur;
}
export const lang = () => cur;
export const intlTag = () => cur;

function pick(v, n) {
  if (typeof v !== 'object' || v === null) return v;
  return v[rules.select(Number(n) || 0)] ?? v.other ?? Object.values(v)[0];
}
/** Translate. Unknown keys fall back to English, then to the key itself (so a raw native error message still shows). */
export function t(key, vars) {
  let v = dict[key];
  if (v == null || v === '') v = en[key];
  if (v == null) v = key.includes('|') ? { one: key.split('|')[0], other: key.split('|')[1] } : key;
  v = pick(v, vars?.count ?? vars?.n);          // `count` picks the plural form when {n} is pre-formatted text
  return vars ? String(v).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : v;
}

/** Locale-aware list: "a, b and c", "a、b和c". type 'unit' is a plain list without "and" ("a, b, c" / "a、b、c"). */
export function list(xs, type = 'conjunction') {
  try { return new Intl.ListFormat(intlTag(), { type, style: type === 'unit' ? 'short' : 'long' }).format(xs.map(String)); } catch { return xs.join(', '); }
}
/** Joins sentences, adding a full stop where one is missing. */
export function sentences(...xs) {
  return xs.filter(Boolean).map((x) => (/[.!?…]$/.test(x) ? x : `${x}.`)).join(' ');
}

// ------------------------------------------------------------------ numbers & durations
/** Compact number for counters: 987654 → "988K". Under 10 000 it is written in full. */
export function num(n) {
  n = Math.floor(Number(n) || 0);
  if (n < 10000) return String(n);
  const f = (v, u) => `${v.toFixed(v < 100 ? 1 : 0).replace(/\.0$/, '')}${u}`;
  if (n < 1e6) return f(n / 1e3, 'K');
  if (n < 1e9) return f(n / 1e6, 'M');
  return f(n / 1e9, 'B');
}
/** "3m", "2h 5m", "1d 4h". */
export function dur(ms) {
  ms = Math.max(0, ms);
  const s = Math.ceil(ms / 1000);
  if (s < 60) return t('{n}s', { n: s });
  const m = Math.ceil(s / 60);
  if (m < 60) return t('{n}m', { n: m });
  const h = Math.floor(m / 60), mm = m % 60;
  if (h < 24) return mm ? t('{h}h {m}m', { h, m: mm }) : t('{h}h', { h });
  return t('{d}d {h}h', { d: Math.floor(h / 24), h: h % 24 });
}

// ------------------------------------------------------------------ game content
const productKey = (pid) => pid.slice(D.APP_ID.length + 1);            // survives a bundle-id rename
export const formName = (id) => t(`form:${id}`);
export const formBlurb = (id) => t(`blurb:${id}`);
export const famName = (fam) => formName(`${fam}.0`);
export const famHint = (fam) => t(`hint:${fam}`);
export const traitName = (tr) => t(`trait:${tr}`);
export const traitTip = (tr) => t(`traittip:${tr}`);
export const stageName = (st) => t(st === 1 ? tk('Baby') : st === 2 ? tk('Evolved') : tk('Mythic'));
export const pieceName = (id) => t(`piece:${id}`);
export const pieceShort = (id) => t(`pieceshort:${id}`);
export const tierName = (tier) => t(`tier:${tier}`);
export function decorName(id) {
  const d = D.DECOR[id];
  if (d?.fig) return d.gold ? t('Golden {name}', { name: formName(d.fig) }) : t('{name} Figure', { name: formName(d.fig) });
  return t(`decor:${id}`);
}
export const decorBlurb = (id) => (D.DECOR[id]?.blurb ? t(`decorblurb:${id}`) : '');
/** Any capsule prize (collectible or small prize capsule). */
export const poolItemName = (id) => (D.POOL_BY_ID[id]?.filler ? t(`prize:${id}`) : decorName(id));
export const packName = (id) => t(`pack:${id}`);
export const packBlurb = (id) => t(`packblurb:${id}`);
export function productName(pid) {
  const P = D.PRODUCTS[pid];
  if (!P) return pid;
  return P.type === 'consumable' ? t('{n} Sea Glass', { n: P.glass }) : t(`product:${productKey(pid)}`);
}
export const productTag = (pid) => (D.PRODUCTS[pid]?.bonus ? t('+{n}% bonus', { n: D.PRODUCTS[pid].bonus }) : '');
export const boostName = (id) => t(`boost:${id}`);
export const boostDesc = (id) => t(`boostdesc:${id}`);
export const questText = (q) => t(`quest:${q.id}`, { n: q.goal });
export const dailyLabel = (i) => t(`daily:${i}`);
export const giftName = (id) => t(`gift:${id}`);
export function toySetName(set) { return set.fam ? t('{family} Family', { family: famName(set.fam) }) : t('Golden Collection'); }
export function unlockName(u) {
  if (u.kind === 'piece') return pieceName(u.id);
  if (u.kind === 'family') return famName(u.id);
  if (u.kind === 'expand') return t('Pool expansion {w}×{h}', { w: u.w, h: u.h });
  return t(tk('Deep water digging'));
}

// ------------------------------------------------------------------ helpers for the extractor & tests
export { productKey };
setLang('en');
