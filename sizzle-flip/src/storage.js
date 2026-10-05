// Save data (per-device). Every access is guarded: storage can be unavailable (private mode, previews).
const KEY = 'sizzleflip.save.v1';

// A fresh object each time, so nested maps are never shared with (or mutated into) the defaults.
const defaults = () => ({
  stars: {},        // levelIndex -> best stars (1..3)
  best: {},         // levelIndex -> fewest flips
  skipped: {},      // levelIndex -> true when skipped with a reward ad (no stars until beaten)
  unlocked: 1,      // number of unlocked levels (sequential)
  skin: 'classic',
  sfx: true,
  music: true,
  haptics: true,
  longAim: false,
  seenTips: {},
  totalFlips: 0,
  seenSkins: {},
  ach: {},
  counters: {},
  ads: null,        // ad pacing state, owned by AdManager (src/ads.js)
  adsRemoved: false,
  adFast: false,
});

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const d = JSON.parse(raw);
    const base = defaults();
    return { ...base, ...d, stars: d.stars || {}, best: d.best || {}, skipped: d.skipped || {}, seenTips: d.seenTips || {}, seenSkins: d.seenSkins || {}, ach: d.ach || {}, counters: d.counters || {} };
  } catch (e) {
    return defaults();
  }
}

export function writeSave(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
}

export function resetSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  return defaults();
}

export function totalStars(save) {
  let n = 0;
  for (const k in save.stars) n += save.stars[k] || 0;
  return n;
}
