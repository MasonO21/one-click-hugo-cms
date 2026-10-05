// Save data (per-device). Every access is guarded: storage can be unavailable (private mode, previews).
const KEY = 'sizzleflip.save.v1';

const DEFAULTS = {
  stars: {},        // levelIndex -> best stars (1..3)
  best: {},         // levelIndex -> fewest flips
  unlocked: 1,      // number of unlocked levels (sequential)
  skin: 'classic',
  sfx: true,
  music: true,
  haptics: true,
  longAim: false,
  seenTips: {},
  totalFlips: 0,
  seenSkins: {},
};

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const d = JSON.parse(raw);
    return { ...DEFAULTS, ...d, stars: d.stars || {}, best: d.best || {}, seenTips: d.seenTips || {}, seenSkins: d.seenSkins || {} };
  } catch (e) {
    return { ...DEFAULTS };
  }
}

export function writeSave(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
}

export function resetSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  return { ...DEFAULTS };
}

export function totalStars(save) {
  let n = 0;
  for (const k in save.stars) n += save.stars[k] || 0;
  return n;
}
