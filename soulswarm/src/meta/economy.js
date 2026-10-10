// Economy & progression rules. Pure-ish functions that mutate the profile and return what changed.
// UI modules call these and then commit(p) to persist and notify listeners.
import {
  HEROES, HERO_ORDER, HERO_UNLOCK_SHARDS, HERO_STAR_COST, HERO_MAX_STARS, heroStarBonus,
  RELICS, RELIC_TYPES, RELIC_SLOTS, relicValue, RARITIES,
  TALENTS, talentCost, SKUS, GEM_SHOP, ALTAR, PASS_TIERS, PASS_XP_PER_TIER, passReward,
  QUEST_DAILY, QUEST_SLOTS, QUEST_POOL, LOGIN_REWARDS, ENERGY_MAX, ENERGY_REGEN_SEC, ENERGY_COST, CHAPTERS, CAMPAIGN_LENGTH, ENDLESS_ID, CAMPAIGN_REWARDS, firstClearGems, firstClearSigils, SKINS, BASE, TRIAL, MUTATORS, BLOOD_MOON, WEEKLY_CHEST,
  ASCENSION,
} from '../game/data.js';
import { saveProfile, todayKey } from './save.js';
import { now, today, dayTime } from './clock.js';
import { resultDifficulty, clearedOn, recordDifficulty, rollHoard, hoardOdds } from './difficulty.js';
import { analytics } from './analytics.js';
import { BESTIARY, TUTORIAL, BOSS_RUSH } from '../game/data.js';
import { bestiaryEntry, bestiaryClaimable, addBestiaryKills } from './bestiary.js';
import { newPages } from './grimoire.js';
import { heroMastery, masteryPerks, gainMastery, resultHero } from './mastery.js';

// ---------------------------------------------------------------- change notification
const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export function commit(p) {
  saveProfile(p);
  for (const fn of listeners) { try { fn(p); } catch (e) { console.error(e); } }
}

const rand = Math.random;
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

// ---------------------------------------------------------------- daily upkeep
export function upkeep(p) {
  // energy regen
  if (p.energyTs > now()) p.energyTs = now(); // the clock went back: restart the step rather than freeze regen until then
  if (p.energy >= ENERGY_MAX) p.energyTs = now();
  else {
    const step = ENERGY_REGEN_SEC * 1000;
    const gain = Math.floor((now() - p.energyTs) / step);
    if (gain > 0) {
      p.energy = Math.min(ENERGY_MAX, p.energy + gain);
      p.energyTs = p.energy >= ENERGY_MAX ? now() : p.energyTs + gain * step;
    }
  }
  // daily quest reset
  const today = todayKey();
  if (p.quests.day !== today) p.quests = { day: today, progress: {}, claimed: [], ids: pickQuests(p, today) };
}
export function energyNextIn(p) {
  if (p.energy >= ENERGY_MAX) return 0;
  return Math.max(0, Math.ceil((p.energyTs + ENERGY_REGEN_SEC * 1000 - now()) / 1000));
}
export const canPlay = (p) => p.energy >= ENERGY_COST;
export function spendEnergy(p) {
  if (p.energy < ENERGY_COST) return false;
  if (p.energy >= ENERGY_MAX) p.energyTs = now();
  p.energy -= ENERGY_COST;
  return true;
}

// ---------------------------------------------------------------- currencies & grants
export const canAfford = (p, cur, amt) => (p[cur] || 0) >= amt;
export function spend(p, cur, amt) {
  if (!(amt >= 0) || !canAfford(p, cur, amt)) return false; // a negative or NaN price would pay out
  p[cur] -= amt;
  return true;
}

export function addRelic(p, type, rarity) {
  const existing = p.relics.find((r) => r.type === type && r.rarity === rarity);
  if (existing) {
    // past Lv10 a duplicate becomes an ascension shard (Relic Ascension) instead of being lost
    if ((existing.level || 1) >= 10) { existing.dups = Math.min(999, (existing.dups || 0) + 1); return { relic: existing, merged: true, overflow: true }; }
    existing.level = Math.min(10, (existing.level || 1) + 1);
    return { relic: existing, merged: true };
  }
  const relic = { uid: 'r' + (p.relicSeq++), type, rarity, level: 1 };
  p.relics.push(relic);
  // auto-equip into an empty slot so new players feel the upgrade immediately
  const empty = p.equipped.indexOf(null);
  if (empty >= 0) p.equipped[empty] = relic.uid;
  return { relic, merged: false };
}

function rollRelicRarity(spec) {
  if (spec === 'epic+') return rand() < 0.2 ? 'legendary' : 'epic';
  if (RARITIES.includes(spec)) return spec;
  return rollRarity(false).rarity;
}

/** Grant a reward bundle. Returns display items: [{kind, amount, label, rarity?}] */
export function grant(p, rewards = {}) {
  const items = [];
  for (const cur of ['gold', 'gems', 'sigils']) {
    if (rewards[cur]) { p[cur] += rewards[cur]; items.push({ kind: cur, amount: rewards[cur] }); }
  }
  if (rewards.energy) { p.energy = Math.min(99, p.energy + rewards.energy); items.push({ kind: 'energy', amount: rewards.energy }); }
  if (rewards.passXp) { addPassXp(p, rewards.passXp); items.push({ kind: 'passXp', amount: rewards.passXp }); }
  if (rewards.shards) {
    for (const [hid, n] of Object.entries(rewards.shards)) {
      p.heroes[hid].shards += n; items.push({ kind: 'shards', hero: hid, amount: n });
    }
  }
  if (rewards.hero) {
    const h = p.heroes[rewards.hero];
    if (h.owned) { h.shards += 20; items.push({ kind: 'shards', hero: rewards.hero, amount: 20 }); }
    else { h.owned = true; h.stars = Math.max(1, h.stars); items.push({ kind: 'hero', hero: rewards.hero, amount: 1 }); }
  }
  if (rewards.relic) {
    const rarity = rollRelicRarity(rewards.relic);
    const { relic, merged, overflow } = addRelic(p, pick(RELIC_TYPES), rarity);
    items.push({ kind: 'relic', relic, merged, overflow, rarity, amount: 1 });
  }
  if (rewards.skin) {
    p.skins[rewards.skin] = true; items.push({ kind: 'skin', skin: rewards.skin, amount: 1 });
  }
  return items;
}

// ---------------------------------------------------------------- loadout (stats going into a run)
export function computeLoadout(p, heroId = p.selectedHero) {
  const hero = HEROES[heroId];
  const hs = p.heroes[heroId];
  const stars = Math.max(1, hs.stars || 1);
  const sb = heroStarBonus(stars);
  const t = p.talents;
  const relics = p.equipped.map((uid) => p.relics.find((r) => r.uid === uid)).filter(Boolean);
  const rsum = (stat) => relics.filter((r) => RELICS[r.type].stat === stat).reduce((a, r) => a + relicValue(r), 0);
  const skinId = Object.keys(p.skins || {}).find((s) => SKINS[s]?.hero === heroId && p.equippedSkin === s);
  const M = masteryPerks(heroMastery(p, heroId).rank); // Hero Mastery (meta/mastery.js)

  const L = {
    heroId, hero, stars, skin: skinId || null,
    hpMax: Math.round((hero.hp + t.vitality * TALENTS.vitality.per + rsum('hp')) * (1 + sb.hp) * (1 + M.hp)),
    dmgMul: (1 + sb.dmg) * (1 + t.might * TALENTS.might.per + rsum('dmg')) * (1 + M.dmg),
    speed: hero.speed * (1 + t.swift * TALENTS.swift.per + rsum('speed')),
    raise: BASE.raise + (hero.passive.raise || 0) + t.raise * TALENTS.raise.per + rsum('raise'),
    capBonus: t.cap * TALENTS.cap.per + Math.round(rsum('cap')),
    capMul: 1 + (hero.passive.cap || 0),
    goldMul: (1 + t.greed * TALENTS.greed.per + rsum('gold')) * (pactActive(p) ? 1.2 : 1),
    hasteMul: 1 + rsum('haste'),
    novaMul: 1 + (hero.passive.nova || 0) + rsum('nova'),
    minionDmgMul: 1 + (hero.passive.minionDmg || 0),
    minionSpeedMul: 1 + (hero.passive.minionSpeed || 0),
    revives: hero.passive.revive || 0,
    mastery: { rank: M.rank, asc: M.asc, aura: M.aura, riteCdMul: 1 - M.riteCd, weaponLv: M.weaponLv },
  };
  L.power = powerRating(L);
  return L;
}
export const powerRating = (L) => Math.round(L.hpMax * 2 + L.dmgMul * 600 + L.raise * 900 + L.capBonus * 12 + L.speed * 20);

// ---------------------------------------------------------------- heroes
export function heroAction(p, id) {
  const h = p.heroes[id];
  if (!h.owned) {
    if (h.shards < HERO_UNLOCK_SHARDS) return { ok: false };
    h.shards -= HERO_UNLOCK_SHARDS; h.owned = true; h.stars = 1;
    analytics.track('hero_upgrade', { hero: id, stars: 1, unlocked: true });
    return { ok: true, unlocked: true };
  }
  if (h.stars >= HERO_MAX_STARS) return { ok: false };
  const cost = HERO_STAR_COST[h.stars];
  if (h.shards < cost) return { ok: false };
  h.shards -= cost; h.stars += 1;
  analytics.track('hero_upgrade', { hero: id, stars: h.stars, unlocked: false });
  return { ok: true, stars: h.stars };
}
export function heroNextCost(p, id) {
  const h = p.heroes[id];
  if (!h.owned) return HERO_UNLOCK_SHARDS;
  if (h.stars >= HERO_MAX_STARS) return 0;
  return HERO_STAR_COST[h.stars];
}
export function selectHero(p, id) { if (p.heroes[id].owned) p.selectedHero = id; }
/** Toggle an owned skin on or off. Returns the equipped skin id (or null). */
export function equipSkin(p, id) {
  if (!p.skins[id]) return p.equippedSkin || null;
  p.equippedSkin = p.equippedSkin === id ? null : id;
  return p.equippedSkin;
}

// ---------------------------------------------------------------- relics & talents
export function equipRelic(p, uid) {
  if (p.equipped.includes(uid)) { p.equipped[p.equipped.indexOf(uid)] = null; return 'unequipped'; }
  let slot = p.equipped.indexOf(null);
  if (slot < 0) slot = RELIC_SLOTS - 1;
  p.equipped[slot] = uid;
  return 'equipped';
}
/** Relic Ascension: what the next star costs ({ star, shards, gold }), or null (below Lv10, or fully ascended). */
export function ascendCost(r) {
  const s = r.stars || 0;
  if ((r.level || 1) < 10 || s >= ASCENSION.max) return null;
  return { star: s + 1, shards: ASCENSION.shards[s], gold: ASCENSION.gold[s] };
}
export const canAscend = (p, r) => { const c = ascendCost(r); return !!c && (r.dups || 0) >= c.shards && p.gold >= c.gold; };
/** Ascend a Lv10 relic one star: spends its shards and the gold. Returns the new star count, or 0. */
export function ascendRelic(p, uid) {
  const r = p.relics.find((x) => x.uid === uid);
  if (!r || !canAscend(p, r)) return 0;
  const c = ascendCost(r);
  if (!spend(p, 'gold', c.gold)) return 0;
  r.dups -= c.shards; r.stars = c.star;
  analytics.track('relic_ascend', { type: r.type, rarity: r.rarity, stars: r.stars });
  return r.stars;
}
export function upgradeTalent(p, key) {
  const lv = p.talents[key] || 0;
  if (lv >= TALENTS[key].max) return false;
  const cost = talentCost(lv);
  if (!spend(p, 'gold', cost)) return false;
  p.talents[key] = lv + 1;
  analytics.track('talent_up', { talent: key, level: lv + 1 });
  return true;
}

// ---------------------------------------------------------------- Soul Altar (gacha)
export function rollRarity(forceLegendary) {
  if (forceLegendary) return { rarity: 'legendary' };
  const r = rand(); let acc = 0;
  for (const rar of ['legendary', 'epic', 'rare', 'common']) {
    acc += ALTAR.odds[rar];
    if (r < acc) return { rarity: rar };
  }
  return { rarity: 'common' };
}

/** payWith: 'sigils' | 'gems' | 'free'. Returns { ok, results: [{rarity, relic, merged, shards}] } */
export function summon(p, count, payWith) {
  if (payWith === 'sigils') { if (!spend(p, 'sigils', count)) return { ok: false, reason: 'sigils' }; }
  else if (payWith === 'gems') { if (!spend(p, 'gems', count === 10 ? ALTAR.cost10 : ALTAR.cost1 * count)) return { ok: false, reason: 'gems' }; }
  else if (payWith === 'free') { if (p.altar.freeDate === todayKey()) return { ok: false, reason: 'free' }; p.altar.freeDate = todayKey(); }

  const rolls = [];
  for (let i = 0; i < count; i++) {
    p.altar.pity += 1; p.altar.pulls += 1;
    let { rarity } = rollRarity(p.altar.pity >= ALTAR.pityLegendary);
    if (rarity === 'legendary') p.altar.pity = 0;
    rolls.push(rarity);
  }
  // 10-pull guarantee: at least one Epic or better
  if (count >= 10 && !rolls.some((r) => r === 'epic' || r === 'legendary')) rolls[rolls.length - 1] = 'epic';

  const results = rolls.map((rarity) => {
    const { relic, merged, overflow } = addRelic(p, pick(RELIC_TYPES), rarity);
    const res = { rarity, relic, merged, overflow, shards: null };
    const drops = ALTAR.shardDrops[rarity];
    if (drops) {
      const hid = pick(Object.keys(drops));
      p.heroes[hid].shards += drops[hid];
      res.shards = { hero: hid, amount: drops[hid] };
    }
    return res;
  });
  analytics.track('altar_pull', { count, payWith, epic: rolls.filter((r) => r === 'epic').length, legendary: rolls.filter((r) => r === 'legendary').length });
  return { ok: true, results };
}
export const freeSummonAvailable = (p) => p.altar.freeDate !== todayKey();

// ---------------------------------------------------------------- quests
export function questProgress(p, key, amount, mode = 'add') {
  const cur = p.quests.progress[key] || 0;
  p.quests.progress[key] = mode === 'max' ? Math.max(cur, amount) : cur + amount;
}
/** The day's 5 pool quests (seeded by date, so a reload never reshuffles them). */
export function pickQuests(p, day) {
  let h = 0; for (const ch of 'quests:' + day) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const pool = QUEST_POOL.filter((q) => !q.late || p.chapter.unlocked >= 2).map((q) => q.id);
  const out = [];
  while (out.length < QUEST_SLOTS.length && pool.length) { h = Math.imul(h ^ (h >>> 13), 2246822507) >>> 0; out.push(pool.splice(h % pool.length, 1)[0]); }
  return out;
}
export function questList(p) {
  if (!p.quests.ids) p.quests.ids = pickQuests(p, p.quests.day); // saves from before the rotating pool
  const list = p.quests.ids.map((id, i) => ({ ...QUEST_POOL.find((q) => q.id === id), rewards: QUEST_SLOTS[i] })).concat(QUEST_DAILY);
  return list.map((q) => {
    const prog = Math.min(q.goal, p.quests.progress[q.key] || 0);
    const claimed = p.quests.claimed.includes(q.id);
    return { ...q, progress: prog, done: prog >= q.goal, claimed };
  });
}
export function claimQuest(p, id) {
  const q = questList(p).find((x) => x.id === id);
  if (!q || !q.done || q.claimed) return null;
  p.quests.claimed.push(id);
  weekly(p).done++;
  analytics.track('quest_claim', { quest: id });
  return grant(p, q.rewards);
}

// ---------------------------------------------------------------- weekly chest
const weekKey = (t = dayTime(today())) => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return todayKey(d.getTime()); };
function weekly(p) { const k = weekKey(); if (!p.weekly || p.weekly.week !== k) p.weekly = { week: k, done: 0, claimed: false }; return p.weekly; }
export function weeklyState(p) { const w = weekly(p); return { done: Math.min(w.done, WEEKLY_CHEST.goal), goal: WEEKLY_CHEST.goal, claimed: w.claimed, ready: !w.claimed && w.done >= WEEKLY_CHEST.goal, rewards: WEEKLY_CHEST.rewards }; }
export function claimWeekly(p) { const w = weekly(p); if (w.claimed || w.done < WEEKLY_CHEST.goal) return null; w.claimed = true; return grant(p, WEEKLY_CHEST.rewards); }
/** Next Monday 00:00 local time (the weekly chest resets then). */
export function nextWeek(t = now()) { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + (8 - d.getDay()) % 7 || 7); return d.getTime(); }

// ---------------------------------------------------------------- Blood Moon (weekends, UTC)
/** profile.flags.bloodMoon = 'on' | 'off' overrides the calendar (QA). */
export function bloodMoon(p, t = now()) {
  const o = p.flags && p.flags.bloodMoon;
  if (o === 'on' || o === 'off') return o === 'on';
  return BLOOD_MOON.days.includes(new Date(t).getUTCDay());
}
/** When the current Blood Moon ends (next Monday 00:00 UTC), or when the next one rises (Friday 00:00 UTC). */
export function bloodMoonTimes(t = now()) {
  const d = new Date(t), day = d.getUTCDay(), base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return { ends: base + ((8 - day) % 7 || 7) * 864e5, starts: base + ((5 - day + 7) % 7 || 7) * 864e5 };
}
export const questsClaimable = (p) => questList(p).filter((q) => q.done && !q.claimed).length;

// ---------------------------------------------------------------- 7-day login
export function loginState(p) {
  const today = todayKey();
  return { canClaim: p.login.lastClaim !== today, day: p.login.streak % 7, streak: p.login.streak, rewards: LOGIN_REWARDS };
}
export function claimLogin(p) {
  const s = loginState(p);
  if (!s.canClaim) return null;
  const items = grant(p, LOGIN_REWARDS[s.day]);
  p.login.streak += 1; p.login.lastClaim = todayKey();
  return items;
}

// ---------------------------------------------------------------- Soul Pass
export function addPassXp(p, n) { p.pass.xp = Math.min(PASS_TIERS * PASS_XP_PER_TIER, p.pass.xp + n); }
export function passState(p) {
  const tier = Math.min(PASS_TIERS, Math.floor(p.pass.xp / PASS_XP_PER_TIER));
  const into = tier >= PASS_TIERS ? PASS_XP_PER_TIER : p.pass.xp % PASS_XP_PER_TIER;
  const tiers = [];
  for (let t = 1; t <= PASS_TIERS; t++) {
    tiers.push({
      tier: t, reached: tier >= t,
      free: passReward(t, false), prem: passReward(t, true),
      freeClaimed: p.pass.claimedFree.includes(t), premClaimed: p.pass.claimedPrem.includes(t),
    });
  }
  return { tier, into, perTier: PASS_XP_PER_TIER, premium: p.pass.premium, tiers };
}
export function claimPass(p, tier, premium) {
  const s = passState(p);
  if (!Number.isInteger(tier) || tier < 1 || tier > s.tier) return null;
  const list = premium ? p.pass.claimedPrem : p.pass.claimedFree;
  if (premium && !p.pass.premium) return null;
  if (list.includes(tier)) return null;
  list.push(tier);
  return grant(p, passReward(tier, premium));
}
export function passClaimable(p) {
  const s = passState(p);
  return s.tiers.filter((t) => t.reached && (!t.freeClaimed || (s.premium && !t.premClaimed))).length;
}

// ---------------------------------------------------------------- purchases (called by Store after confirmation)
export const pactActive = (p) => now() < (p.purchases.pactUntil || 0);
export const pactDailyAvailable = (p) => pactActive(p) && p.purchases.pactLastClaim !== todayKey();
export function claimPactDaily(p) {
  if (!pactDailyAvailable(p)) return null;
  p.purchases.pactLastClaim = todayKey();
  return grant(p, SKUS.soul_pact.daily);
}
export const starterAvailable = (p) => !p.purchases.starterBought && now() < p.purchases.starterExpires;
export const firstPurchaseBonus = (p, skuId) => SKUS[skuId]?.kind === 'gems' && !p.purchases.first[skuId];

export function applyPurchase(p, skuId) {
  const sku = SKUS[skuId];
  if (!sku) return null;
  p.purchases.history.push({ sku: skuId, t: now(), price: sku.price });
  let items = [];
  if (sku.kind === 'gems') {
    const doubled = firstPurchaseBonus(p, skuId);
    p.purchases.first[skuId] = true;
    items = grant(p, { gems: sku.gems * (doubled ? 2 : 1) });
  } else if (sku.kind === 'bundle') {
    p.purchases.starterBought = true;
    items = grant(p, sku.rewards);
  } else if (sku.kind === 'sub') {
    p.purchases.pactUntil = Math.max(now(), p.purchases.pactUntil || 0) + sku.days * 864e5;
    items = grant(p, sku.rewards);
    const daily = claimPactDaily(p);
    if (daily) items = items.concat(daily);
  } else if (sku.kind === 'pass') {
    p.pass.premium = true;
    items = [{ kind: 'pass', amount: 1 }];
  }
  return items;
}
export function buyGemShop(p, key) {
  const item = GEM_SHOP[key];
  if (!item || !spend(p, 'gems', item.cost)) return null;
  return grant(p, item.rewards);
}
export const freeChestAvailable = (p) => p.freeChestDate !== todayKey();
export function claimFreeChest(p) {
  if (!freeChestAvailable(p)) return null;
  p.freeChestDate = todayKey();
  return grant(p, { gold: 800 + Math.floor(rand() * 700), gems: 10, relic: rand() < 0.15 ? 'rare' : 'common' });
}

// ---------------------------------------------------------------- run results
export const accountXpFor = (lv) => 80 + lv * 40;

/**
 * result: { chapter, time, kills, raised, bestLegion, novas, gates, victory, level, bestStreak }
 * Grants rewards once and returns { rewards, items, firstClear, newBest, levelUps, streakRecord }.
 */
// ---------------------------------------------------------------- Daily Trial
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const trialToday = (p) => { const t = todayKey(); if (p.trial.day !== t) Object.assign(p.trial, { day: t, done: false, ads: 0, won: false, failPaid: 0 }); return p.trial; };
/** Today's trial: a chapter the player has cleared, one boon and one bane, picked from the date. */
export function dailyTrial(p, day = todayKey()) {
  const h = hashStr('trial:' + day);
  const all = p.chapter.best[CAMPAIGN_LENGTH] && p.chapter.best[CAMPAIGN_LENGTH].cleared; // every chapter cleared
  const cleared = Math.max(1, Math.min(CAMPAIGN_LENGTH, p.chapter.unlocked - 1 + (all ? 1 : 0)));
  const of = (kind) => Object.keys(MUTATORS).filter((k) => MUTATORS[k].kind === kind);
  const boons = of('boon'), banes = of('bane');
  return { day, chapter: 1 + (h % cleared), boon: boons[(h >>> 8) % boons.length], bane: banes[(h >>> 16) % banes.length] };
}
export function trialState(p) {
  const t = trialToday(p), unlocked = p.chapter.unlocked >= TRIAL.unlockAt;
  return { ...dailyTrial(p), unlocked, available: unlocked && !t.done, retry: unlocked && t.done && !t.won, won: !!t.won, clears: t.clears };
}
/** Uses today's attempt. */
export function beginTrial(p) { const t = trialToday(p); if (t.done || p.chapter.unlocked < TRIAL.unlockAt) return false; t.done = true; return true; }
/** A rewarded ad buys one more attempt, as many as wanted until today's trial is beaten. */
export function grantTrialRetry(p) { const t = trialToday(p); if (!t.done || t.won) return false; t.ads++; t.done = false; return true; }

// ---------------------------------------------------------------- Boss Rush (BOSS_RUSH in data.js, run.js rush)
const DAY = 864e5;
const utcDay0 = (t) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };
/** Is the Court open? (profile.flags.bossRush 'on' | 'off' overrides the calendar, for QA and live config.) */
export function rushOpen(p, t = now()) {
  const o = p.flags && p.flags.bossRush;
  if (o === 'on' || o === 'off') return o === 'on';
  return BOSS_RUSH.days.includes(new Date(t).getUTCDay());
}
/** The current event's key (the UTC date it opened), when it closes, and when the next opens. */
export function rushTimes(t = now()) {
  const D = BOSS_RUSH.days, day = new Date(t).getUTCDay(), base = utcDay0(t), first = D[0];
  const into = (day - first + 7) % 7, open = into < D.length;
  const start = base - into * DAY;
  return { key: new Date(start).toISOString().slice(0, 10), ends: start + D.length * DAY, starts: open ? start + 7 * DAY : base + ((first - day + 7) % 7 || 7) * DAY };
}
/** The profile's Boss Rush block, rolled to this event (milestones and event best) and this day (tries). */
function rushNow(p) {
  const R = p.rush, k = rushTimes().key, d = todayKey();
  if (R.event !== k) Object.assign(R, { event: k, claimed: 0, best: 0, bestKills: 0 });
  if (R.day !== d) Object.assign(R, { day: d, tries: 0, ads: 0 });
  return R;
}
export function rushState(p) {
  const R = rushNow(p), unlocked = p.chapter.unlocked >= BOSS_RUSH.unlockAt, open = rushOpen(p), T = rushTimes();
  const left = Math.max(0, BOSS_RUSH.tries + R.ads - R.tries);
  return { unlocked, open, ends: T.ends, starts: T.starts, triesLeft: left, available: unlocked && open && left > 0,
    retry: unlocked && open && left === 0, claimed: R.claimed, best: R.best, bestKills: R.bestKills, allBest: R.allBest, clears: R.clears };
}
/** Uses one of today's tries. */
export function beginRush(p) { const s = rushState(p); if (!s.available) return false; p.rush.tries++; return true; }
/** A rewarded ad buys one more try, as many as wanted (ads are never capped). */
export function grantRushTry(p) { const s = rushState(p); if (!s.retry) return false; p.rush.ads++; return true; }
/** A Boss Rush attempt: the run's gold and pass XP, quests, Bestiary kills (each boss counts for itself), the milestones
 *  newly reached this event (bosses beaten in one attempt) and the fastest full clear. No chapter records. */
function applyRushResult(p, result) {
  const R = rushNow(p), L = computeLoadout(p), n = Math.min(BOSS_RUSH.milestones.length, result.bossKills || 0);
  const rewards = { gold: Math.round((result.kills * 0.9 + result.time * 2.2) * L.goldMul + (result.bonusGold || 0)), passXp: Math.round(20 + result.time / 6 + result.kills / 40 + n * 15) };
  const milestones = [];
  for (let i = R.claimed; i < n; i++) {
    milestones.push(i);
    for (const [k, v] of Object.entries(BOSS_RUSH.milestones[i])) rewards[k] = (rewards[k] || 0) + v;
  }
  R.claimed = Math.max(R.claimed, n);
  const items = grant(p, rewards);
  const mastery = masteryResult(p, result, rewards.passXp);
  const cleared = n >= BOSS_RUSH.milestones.length;
  const newBest = cleared && (!R.best || result.time < R.best);
  if (newBest) R.best = Math.round(result.time);
  if (cleared) { R.clears = (R.clears || 0) + 1; if (!R.allBest || result.time < R.allBest) R.allBest = Math.round(result.time); }
  R.bestKills = Math.max(R.bestKills, n);
  const s = p.stats;
  s.runs += 1; s.kills += result.kills; s.raised += result.raised; s.bestLegion = Math.max(s.bestLegion, result.bestLegion);
  s.bestStreak = Math.max(s.bestStreak || 0, result.bestStreak || 0);
  addBestiaryKills(p, result.byType);
  for (const [k, v, m] of [['kills', result.kills], ['raised', result.raised], ['novas', result.novas], ['runs', 1], ['chests', result.chests || 0], ['urns', result.urns || 0], ['peak', result.bestLegion || 0, 'max'], ['evolve', result.evolutions || 0], ['bosses', n], ['survive', Math.floor(result.time), 'max']]) questProgress(p, k, v, m);
  let levelUps = 0;
  p.xp += rewards.passXp;
  while (p.xp >= accountXpFor(p.level)) { p.xp -= accountXpFor(p.level); p.level += 1; levelUps += 1; p.gems += 20; }
  return { rewards, items, firstClear: false, newBest, levelUps, streakRecord: false, difficulty: 'normal', rush: true, milestones, cleared, mastery };
}

export function applyRunResult(p, result) {
  // a partial or malformed result must not write NaN into the profile (NaN currencies and XP are saved as null)
  result = { ...result, chapter: result.endless ? ENDLESS_ID : Math.min(CAMPAIGN_LENGTH, Math.max(1, Math.floor(result.chapter) || 1)) };
  for (const k of ['time', 'kills', 'raised', 'bestLegion', 'novas', 'gates', 'bonusGold', 'bossKills', 'chests', 'elites', 'evolutions', 'bestStreak', 'urns']) result[k] = Math.max(0, +result[k] || 0);
  if (result.tutorial) return applyTutorialResult(p, result);
  if (result.rush) return applyRushResult(p, result);
  const L = computeLoadout(p);
  const ch = result.chapter;
  const trial = !!result.trial;
  const D = resultDifficulty(result), hard = D.id !== 'normal'; // Nightmare / Torment (meta/difficulty.js)
  const firstClear = result.victory && !result.endless && !trial && !clearedOn(p, ch, D.id);
  const gold = Math.round((result.kills * 0.9 + result.time * 2.2 + (result.victory ? 400 * ch : 0)) * L.goldMul * D.gold + (result.bonusGold || 0));
  // the Daily Trial's prize pays once a day however many ad attempts it takes: the clear reward on the first clear, and
  // the fall-early gems topped up to failGemsMax across the day's attempts
  const T = p.trial, prize = trial && result.victory && !T.won;
  const trialGems = !trial ? 0 : result.victory ? (prize ? TRIAL.clear.gems : 0)
    : Math.max(0, Math.min(TRIAL.failGemsMax, Math.floor(result.time / 60) * TRIAL.failGemsPerMin) - (T.failPaid || 0));
  if (trial && !result.victory) T.failPaid = (T.failPaid || 0) + trialGems;
  if (prize) T.won = true;
  const gems = trial ? trialGems
    : result.endless ? (result.bossKills || 0) * 15 + Math.floor(result.time / 60) * 2
    : result.victory ? 10 + 2 * Math.min(ch, CAMPAIGN_REWARDS.clearGemsCap) : Math.floor(result.time / 120) * 2;
  const baseXp = Math.round(20 + result.time / 6 + result.kills / 40 + (result.victory ? 40 : 0) + (prize ? TRIAL.clear.passXp : 0));
  const passXp = Math.round(baseXp * D.passXp);
  const rewards = { gold: gold * (result.bloodMoon ? BLOOD_MOON.rewardMul : 1), gems: gems * (result.bloodMoon ? BLOOD_MOON.rewardMul : 1), passXp };
  // the first-clear bonus is flat: Blood Moon and the ad double only the clear gems (Normal, Act I: 40 + 18c on top,
  // 50 + 20c in all; later chapters CAMPAIGN_REWARDS, more for an act's last chapter)
  const firstGems = firstClear ? (hard ? D.firstClearGems : firstClearGems(ch)) : 0;
  if (firstGems) { rewards.gems += firstGems; rewards.firstClearGems = firstGems; }
  if (firstClear && !hard) rewards.sigils = firstClearSigils(ch);
  if (prize) { p.trial.clears = (p.trial.clears || 0) + 1; if (p.trial.clears % TRIAL.sigilEvery === 0) rewards.sigils = (rewards.sigils || 0) + 1; }
  if (result.victory) rewards.relic = D.hoard || ch > 5 ? rollHoard(hoardOdds(D, ch), rand()) // (difficulty.js: a harder tier never pays less)
    : ch >= 3 && rand() < 0.35 ? 'epic' : rand() < 0.5 ? 'rare' : 'common';
  if (result.endless && result.bossKills) rewards.relic = result.bossKills >= 3 ? 'epic+' : result.bossKills >= 2 ? 'epic' : 'rare';

  const items = grant(p, rewards);
  const mastery = masteryResult(p, result, passXp);

  // stats
  const s = p.stats;
  s.runs += 1; s.kills += result.kills; s.raised += result.raised;
  s.bestLegion = Math.max(s.bestLegion, result.bestLegion);
  const streakRecord = (result.bestStreak || 0) > (s.bestStreak || 0);
  s.bestStreak = Math.max(s.bestStreak || 0, result.bestStreak || 0);
  if (result.victory) s.clears += 1;
  addBestiaryKills(p, result.byType); // kills per foe (meta/bestiary.js)

  // chapter progress (a Daily Trial plays a cleared chapter under mutators: it never changes records)
  const prev = p.chapter.best[ch] || { time: 0, cleared: false, kills: 0 };
  let newBest = !trial && (result.time > prev.time || (result.victory && !prev.cleared));
  if (!trial && !hard) p.chapter.best[ch] = { time: Math.max(prev.time, result.time), cleared: prev.cleared || result.victory, kills: Math.max(prev.kills || 0, result.kills), depth: Math.max(prev.depth || 0, (result.bossKills || 0) + 1) };
  if (!trial) { const nb = recordDifficulty(p, ch, D.id, result); if (hard) newBest = nb; } // records per difficulty
  if (!trial && !hard && !result.endless && result.victory && ch === p.chapter.unlocked && ch < CAMPAIGN_LENGTH) p.chapter.unlocked = ch + 1;

  // quests
  questProgress(p, 'kills', result.kills);
  questProgress(p, 'raised', result.raised);
  questProgress(p, 'survive', Math.floor(result.time), 'max');
  questProgress(p, 'novas', result.novas);
  questProgress(p, 'gates', result.gates);
  questProgress(p, 'runs', 1);
  questProgress(p, 'chests', result.chests || 0);
  questProgress(p, 'urns', result.urns || 0); // Soul Urns smashed
  questProgress(p, 'elites', result.elites || 0);
  questProgress(p, 'peak', result.bestLegion || 0, 'max');
  questProgress(p, 'evolve', result.evolutions || 0);
  questProgress(p, 'bosses', (result.bossKills || 0) + (result.victory && !result.endless ? 1 : 0));
  if (trial && result.victory) questProgress(p, 'trial', 1);
  if (hard) { questProgress(p, 'hardElites', result.elites || 0); if (result.victory) questProgress(p, 'hardClears', 1); }

  // account level
  let levelUps = 0;
  p.xp += baseXp; // account XP ignores the difficulty bonus, so account-level gems keep their pace
  while (p.xp >= accountXpFor(p.level)) { p.xp -= accountXpFor(p.level); p.level += 1; levelUps += 1; p.gems += 20; }

  return { rewards, items, firstClear, newBest, levelUps, streakRecord, difficulty: D.id, mastery };
}
/** Hero Mastery: the run's pass XP goes to its hero; rank-up rewards are granted here, apart from the run's own rewards
 *  (so the ad double never doubles them). */
function masteryResult(p, result, xp) {
  const m = gainMastery(p, resultHero(p, result), xp);
  if (m) m.items = Object.keys(m.rewards).length ? grant(p, m.rewards) : [];
  return m;
}
/** The beginner tutorial (game/tutorial.js): finishing it pays the run's kill and time gold, a fixed bonus, Bestiary kills
 *  and lifetime stats, once per account. It is no chapter attempt: no records, unlocks, first clear, quests, pass XP or
 *  Boss Hoard. Abandoning it pays nothing (like Skip), and a replay from Settings is practice that pays nothing either
 *  (the tutorial costs no energy, so it must not be farmable). */
function applyTutorialResult(p, result) {
  p.flags.tutorialDone = true;
  const none = { rewards: {}, items: [], firstClear: false, newBest: false, levelUps: 0, streakRecord: false, difficulty: 'normal', tutorial: true };
  if (!result.victory) { if (!p.flags.tutorialPaid && !p.flags.coach) p.flags.coach = 'battle'; return { ...none, ended: true }; }
  if (p.flags.tutorialPaid) return { ...none, practice: true };
  p.flags.tutorialPaid = true;
  const L = computeLoadout(p), R = TUTORIAL.reward;
  const rewards = { gold: Math.round((result.kills * 0.9 + result.time * 2.2) * L.goldMul) + R.gold, gems: R.gems };
  const items = grant(p, rewards);
  const s = p.stats;
  s.kills += result.kills; s.raised += result.raised; s.bestLegion = Math.max(s.bestLegion, result.bestLegion);
  addBestiaryKills(p, result.byType);
  if (!p.flags.coach) p.flags.coach = Object.values(p.talents).every((v) => !v) ? 'talent' : 'battle'; // home: the way on (ui/meta)
  return { ...none, rewards, items };
}

/** Rewarded-ad "double rewards": repeat the gold and gems only. */
export function doubleRunRewards(p, rewards) {
  return grant(p, { gold: rewards.gold, gems: rewards.gems - (rewards.firstClearGems || 0) });
}

// ---------------------------------------------------------------- Bestiary milestones (meta/bestiary.js)
/** Claims an entry's next milestone once its kills reach the goal. Tiers go in order and each pays once. */
export function claimBestiary(p, id) {
  const e = BESTIARY.order.includes(id) ? bestiaryEntry(p, id) : null, t = e && e.tiers[e.claimed];
  if (!t || !t.ready) return null;
  p.bestiary.claimed[id] = e.claimed + 1;
  analytics.track('bestiary_claim', { id, tier: e.claimed + 1 });
  return grant(p, t.rewards);
}

export function notifications(p) {
  return {
    quests: questsClaimable(p) + (weeklyState(p).ready ? 1 : 0),
    pass: passClaimable(p),
    login: loginState(p).canClaim ? 1 : 0,
    altar: freeSummonAvailable(p) ? 1 : 0,
    shop: (freeChestAvailable(p) ? 1 : 0) + (pactDailyAvailable(p) ? 1 : 0),
    heroes: HERO_ORDER.filter((id) => { const c = heroNextCost(p, id); return c && p.heroes[id].shards >= c; }).length,
    bestiary: bestiaryClaimable(p), // milestones ready (the Heroes tab dot)
    grimoire: newPages(p).length, // pages unlocked since the Grimoire was last opened (the chip's dot)
    relics: p.relics.filter((r) => p.equipped.includes(r.uid) && canAscend(p, r)).length, // equipped relics ready to ascend (the Relics sub-tab dot)
  };
}
