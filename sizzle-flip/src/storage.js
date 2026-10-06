// Save data (per-device). Every access is guarded: storage can be unavailable (private mode, previews).
const KEY = 'sizzleflip.save.v1';

// A fresh object each time, so nested maps are never shared with (or mutated into) the defaults.
const defaults = () => ({
  stars: {},        // levelIndex -> best stars (1..3)
  best: {},         // levelIndex -> fewest flips
  skipped: {},      // levelIndex -> true when skipped with a reward ad (no stars until beaten)
  unlocked: 1,      // number of unlocked levels (sequential)
  skin: 'classic',
  character: 'sausage', // equipped character: 'sausage' (with `skin`) or a shop item id
  owned: {},        // shop item id -> { at, source } (purchases; restored from the store in the app)
  sfx: true,
  music: true,
  haptics: true,
  longAimUntil: 0,  // long aim guide is on until this time (ms) — unlocked with a reward ad
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
    delete d.longAim; // was a free toggle before it became a reward
    return { ...base, ...d, stars: d.stars || {}, best: d.best || {}, skipped: d.skipped || {}, owned: d.owned && typeof d.owned === 'object' ? d.owned : {}, seenTips: d.seenTips || {}, seenSkins: d.seenSkins || {}, ach: d.ach || {}, counters: d.counters || {} };
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
