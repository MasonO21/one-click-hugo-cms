// Player profile persistence. localStorage can be unavailable (private mode, sandboxed previews),
// so every access is guarded and the game still runs from in-memory state.
import { HERO_ORDER, HEROES, HERO_MAX_STARS, ENERGY_MAX, STARTER_PACK_HOURS, RELICS, RARITIES, RELIC_SLOTS, TALENTS, CAMPAIGN_LENGTH, ENDLESS_ID, ENDLESS_UNLOCK } from '../game/data.js';
import { migrateDifficulty } from './difficulty.js';
import { BESTIARY, GRIMOIRE } from '../game/data.js';
import { bestiaryGoals } from './bestiary.js';
import { sanitizeMastery } from './mastery.js';
import { blankPrivacy, sanitizePrivacy } from './privacy.js';
import { sanitizeFeats } from './feats.js';
import { now as clockNow, today, dateKey, snapshot, restore } from './clock.js';

const KEY = 'soulswarm.save.v1';

/** today() for daily resets (meta/clock.js, never earlier than a day already seen), or the local day of t. */
export const todayKey = (t) => (t === undefined ? today() : dateKey(t));

export function newProfile() {
  const now = clockNow();
  const heroes = {};
  for (const id of HERO_ORDER) heroes[id] = { owned: id === 'vael', stars: id === 'vael' ? 1 : 0, shards: 0 };
  return {
    v: 2, // 2: the 30-chapter campaign (Update 13); the Endless Abyss moved from chapter id 6 to ENDLESS_ID
    createdAt: now,
    lastSeen: now,
    clock: { t: 0, day: '' }, // meta/clock.js: last trusted time and latest day, so winding the clock back gains nothing
    name: 'Shepherd',
    level: 1, xp: 0,
    gold: 1500, gems: 150, sigils: 1,
    energy: ENERGY_MAX, energyTs: now,
    heroes,
    selectedHero: 'vael',
    skins: {},
    relics: [
      { uid: 'r1', type: 'crown', rarity: 'common', level: 1 },
      { uid: 'r2', type: 'lantern', rarity: 'rare', level: 1 },
    ],
    equipped: ['r1', 'r2', null],
    relicSeq: 3,
    talents: { might: 0, vitality: 0, raise: 0, cap: 0, greed: 0, swift: 0 },
    chapter: { unlocked: 1, selected: 1, best: {} },
    diff: { sel: {}, best: {} }, // Nightmare / Torment: last choice and records per chapter (meta/difficulty.js)
    pass: { season: 1, xp: 0, premium: false, claimedFree: [], claimedPrem: [] },
    quests: { day: todayKey(now), progress: {}, claimed: [] },
    login: { streak: 0, lastClaim: null },
    purchases: { first: {}, starterBought: false, starterExpires: now + STARTER_PACK_HOURS * 3600e3, pactUntil: 0, pactLastClaim: null, history: [] },
    altar: { pity: 0, pulls: 0, freeDate: null },
    trial: { day: null, done: false, ads: 0, won: false, failPaid: 0, clears: 0 }, // Daily Trial (economy.trialState)
    rush: { event: null, day: null, tries: 0, ads: 0, claimed: 0, best: 0, bestKills: 0, allBest: 0, clears: 0, court: '' }, // Boss Rush (economy.rushState)
    weekly: { week: null, done: 0, claimed: false },
    stats: { runs: 0, kills: 0, bestLegion: 0, raised: 0, clears: 0, bestStreak: 0 },
    grimoire: { selected: '', seen: [] }, // meta/grimoire.js: the inscribed page and the unlocked pages already shown
    mastery: {}, // meta/mastery.js: per hero { xp: lifetime mastery XP, paid: the highest rank whose reward was paid }
    feats: { claimed: {} }, // meta/feats.js: tiers claimed per Feat family (Update 14)
    bestiary: { kills: Object.fromEntries(BESTIARY.order.map((id) => [id, 0])), claimed: Object.fromEntries(BESTIARY.order.map((id) => [id, 0])) }, // meta/bestiary.js
    settings: { music: 0.5, sfx: 0.8, voice: 0.9, quality: 'auto', haptics: true, muted: false, shake: 1, reduceFlash: false, autoNova: false, lefty: false, fps30: false, reminders: false, gatePreview: false, stick: 1 },
    privacy: blankPrivacy(), // meta/privacy.js: the age gate's band, consent and the player ID (Update 14)
    flags: { tutorialDone: false, tutorialPaid: false, hints: {}, coach: '' }, // tutorialPaid: its reward paid once; coach: the post-tutorial pointer ('talent' → 'battle' → '')
    freeChestDate: null,
  };
}

const int = (v, d, lo = 0, hi = 1e9) => { const n = Math.floor(+v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
/** A loaded value coerced to the type of its default: a wrong type falls back to the default, objects recurse (unknown keys kept). */
function like(v, d) {
  if (typeof d === 'number') return v !== null && v !== '' && Number.isFinite(+v) ? +v : d;
  if (typeof d === 'boolean' || typeof d === 'string') return typeof v === typeof d ? v : d;
  if (Array.isArray(d)) return Array.isArray(v) ? v : d;
  if (d && typeof d === 'object') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return d;
    const o = { ...v };
    for (const k of Object.keys(d)) o[k] = like(v[k], d[k]);
    return o;
  }
  return v === undefined ? d : v; // null defaults (dates, last claims) keep what was saved
}

// Fill missing keys when loading an older or partial save, and repair wrong types, out-of-range values and ids this
// build does not know (a removed hero or relic would otherwise crash the boot or the home screen).
function migrate(p) {
  const base = newProfile();
  const out = like(p, base);
  for (const k of ['gold', 'gems', 'sigils', 'xp']) out[k] = int(out[k], base[k]);
  out.level = int(out.level, 1, 1, 999); out.energy = int(out.energy, ENERGY_MAX, 0, 99); out.pass.xp = int(out.pass.xp, 0);
  for (const id of HERO_ORDER) { const h = out.heroes[id]; h.shards = int(h.shards, 0); h.stars = int(h.stars, 0, h.owned ? 1 : 0, HERO_MAX_STARS); }
  out.heroes.vael.owned = true; out.heroes.vael.stars = Math.max(1, out.heroes.vael.stars);
  if (!HEROES[out.selectedHero] || !out.heroes[out.selectedHero].owned) out.selectedHero = 'vael';
  for (const k of Object.keys(TALENTS)) out.talents[k] = int(out.talents[k], 0, 0, TALENTS[k].max);
  for (const k of Object.keys(out.quests.progress)) out.quests.progress[k] = int(out.quests.progress[k], 0);
  const uids = new Set();
  out.relics = out.relics.filter((r) => r && RELICS[r.type] && RARITIES.includes(r.rarity) && r.uid && !uids.has(r.uid) && uids.add(r.uid))
    .map((r) => ({ ...r, level: int(r.level, 1, 1, 10), stars: int(r.stars, 0, 0, 5), dups: int(r.dups, 0, 0, 999) })); // Relic Ascension: stars and shards
  out.equipped = Array.from({ length: RELIC_SLOTS }, (_, i) => { const u = out.equipped[i]; return uids.has(u) && out.equipped.indexOf(u) === i ? u : null; });
  out.relicSeq = Math.max(int(out.relicSeq, 1, 1), ...out.relics.map((r) => (parseInt(String(r.uid).slice(1), 10) || 0) + 1)); // new relics never reuse an id
  // Update 13: the Endless Abyss was chapter id 6 while the campaign had five chapters; a v1 save's records and choice for it
  // move to ENDLESS_ID (unlocked 6 = Chapter 5 cleared = Chapter 6 and the Endless Abyss open)
  if (!(p && +p.v >= 2)) {
    const C = out.chapter, D = out.diff;
    if (C.best && C.best[6]) { C.best[ENDLESS_ID] = C.best[6]; delete C.best[6]; }
    if (D && D.best && D.best[6]) { D.best[ENDLESS_ID] = D.best[6]; delete D.best[6]; }
    if (D && D.sel) delete D.sel[6];
    if (+C.selected === 6) C.selected = ENDLESS_ID;
  }
  out.v = 2;
  out.chapter.unlocked = int(out.chapter.unlocked, 1, 1, CAMPAIGN_LENGTH);
  out.chapter.selected = +out.chapter.selected === ENDLESS_ID && out.chapter.unlocked >= ENDLESS_UNLOCK ? ENDLESS_ID : int(out.chapter.selected, 1, 1, CAMPAIGN_LENGTH);
  migrateDifficulty(out);
  for (const id of BESTIARY.order) { const b = out.bestiary; b.kills[id] = int(b.kills[id], 0); b.claimed[id] = int(b.claimed[id], 0, 0, bestiaryGoals(id).length); }
  if (!(p && p.bestiary)) out.bestiary.kills.gravemaw = int(out.stats.clears, 0); // saves from before the Bestiary: every clear slew Gravemaw
  { const T = out.trial; for (const k of ['ads', 'failPaid', 'clears']) T[k] = int(T[k], 0); T.won = !!T.won; T.done = !!T.done; }
  { const R = out.rush; for (const k of ['tries', 'ads', 'best', 'allBest', 'clears']) R[k] = int(R[k], 0); R.claimed = int(R.claimed, 0, 0, 5); R.bestKills = int(R.bestKills, 0, 0, 5); R.court = R.court === 'hollow' || R.court === 'fallen' ? R.court : ''; }
  if (!(p && p.flags && 'tutorialPaid' in p.flags)) out.flags.tutorialPaid = !!out.flags.tutorialDone; // saves from before the tutorial: their first run was it
  { const S = out.settings, cl = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d); // sliders within their ranges
    for (const [k, d] of [['music', 0.5], ['sfx', 0.8], ['voice', 0.9], ['shake', 1]]) S[k] = cl(S[k], 0, 1, d); S.stick = cl(S.stick, 0.75, 1.5, 1); }
  { const R = out.flags.review; if (R !== undefined) out.flags.review = { n: int(R && R.n, 0, 0, 99), at: Math.max(0, +(R && R.at) || 0) }; } // meta/review.js
  { const G = out.grimoire; if (!GRIMOIRE.pages[G.selected]) G.selected = ''; G.seen = [...new Set(G.seen.filter((id) => GRIMOIRE.pages[id]))]; }
  out.mastery = sanitizeMastery(out.mastery);
  out.feats = sanitizeFeats(out.feats);
  out.privacy = sanitizePrivacy(p && p.privacy); // a save from before Update 14 gets a player ID and meets the age gate once
  return out;
}

/** A profile from outside (a transfer code, meta/transfer.js) through the same repairs as a loaded save. */
export const sanitizeProfile = (obj) => migrate(obj);

export function loadProfile() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
    if (raw) { const p = migrate(JSON.parse(raw)); restore(p.clock); return p; }
  } catch (e) {
    // storage unavailable or the save is unreadable: start fresh, but keep the unreadable bytes for support
    console.warn('[save] unreadable save, starting fresh', e);
    try { if (raw) localStorage.setItem(KEY + '.corrupt', raw); } catch (e2) { /* ignore */ }
  }
  return newProfile();
}

let saveTimer = 0;
export function saveProfile(p, immediate = false) {
  p.lastSeen = clockNow(); p.clock = snapshot(); // the offline floor and the latest day (meta/clock.js)
  const write = () => {
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* ignore */ }
  };
  clearTimeout(saveTimer);
  if (immediate) write(); else saveTimer = setTimeout(write, 250);
}

export function resetProfile() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  return newProfile();
}
