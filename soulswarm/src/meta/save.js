// Player profile persistence. localStorage can be unavailable (private mode, sandboxed previews),
// so every access is guarded and the game still runs from in-memory state.
import { HERO_ORDER, ENERGY_MAX, STARTER_PACK_HOURS } from '../game/data.js';

const KEY = 'soulswarm.save.v1';

export const todayKey = (t = Date.now()) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function newProfile() {
  const now = Date.now();
  const heroes = {};
  for (const id of HERO_ORDER) heroes[id] = { owned: id === 'vael', stars: id === 'vael' ? 1 : 0, shards: 0 };
  return {
    v: 1,
    createdAt: now,
    lastSeen: now,
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
    pass: { season: 1, xp: 0, premium: false, claimedFree: [], claimedPrem: [] },
    quests: { day: todayKey(now), progress: {}, claimed: [] },
    login: { streak: 0, lastClaim: null },
    purchases: { first: {}, starterBought: false, starterExpires: now + STARTER_PACK_HOURS * 3600e3, pactUntil: 0, pactLastClaim: null, history: [] },
    altar: { pity: 0, pulls: 0, freeDate: null },
    stats: { runs: 0, kills: 0, bestLegion: 0, raised: 0, clears: 0 },
    settings: { music: 0.5, sfx: 0.8, quality: 'auto', haptics: true, muted: false, shake: 1, reduceFlash: false, autoNova: false, lefty: false, fps30: false },
    flags: { tutorialDone: false, hints: {} },
    freeChestDate: null,
  };
}

// Fill missing keys when loading an older or partial save.
function migrate(p) {
  const base = newProfile();
  const out = { ...base, ...p };
  for (const k of ['heroes', 'talents', 'chapter', 'pass', 'quests', 'login', 'purchases', 'altar', 'stats', 'settings', 'flags']) {
    out[k] = { ...base[k], ...(p[k] || {}) };
  }
  for (const id of HERO_ORDER) out.heroes[id] = { ...base.heroes[id], ...(out.heroes[id] || {}) };
  if (!Array.isArray(out.relics)) out.relics = base.relics;
  if (!Array.isArray(out.equipped)) out.equipped = base.equipped;
  return out;
}

export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) { /* storage unavailable or corrupt: start fresh */ }
  return newProfile();
}

let saveTimer = 0;
export function saveProfile(p, immediate = false) {
  p.lastSeen = Date.now();
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
