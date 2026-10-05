// In-run stats and the level-up card draw.
import { SKILLS, EVOLUTIONS, WEAPON_SLOTS, BASE } from './data.js';

export function computeStats(L, lv, chapter, level) {
  const g = (k) => lv[k] || 0;
  const ch = chapter.id - 1;
  return {
    dmgMul: L.dmgMul * (1 + 0.10 * g('might')),
    haste: L.hasteMul * (1 + 0.08 * g('frenzy')),
    speed: L.speed * (1 + 0.08 * g('haste')),
    maxHp: L.hpMax + 20 * g('vitality'),
    pickup: BASE.pickup * (1 + 0.30 * g('soulMagnet')),
    raise: Math.min(0.85, L.raise + 0.06 * g('raiseDead')),
    cap: Math.min(BASE.hardLegionMax, Math.round((BASE.cap + L.capBonus + 10 * g('legionCap')) * L.capMul)),
    minionDmg: BASE.minionDmg * L.dmgMul * L.minionDmgMul * (1 + 0.2 * g('minionFury')) * (1 + 0.04 * (level - 1)) * (1 + 0.45 * ch),
    minionSpeed: BASE.minionSpeed * L.minionSpeedMul,
    minionHp: BASE.minionHp * (1 + 0.08 * (level - 1)) * (1 + 0.4 * ch),
    novaMul: L.novaMul,
    crit: 0.1,
    area: 1,
  };
}

/** Draw up to n distinct upgrade cards, weighted toward deepening the current build. */
export function rollChoices(run, n = 3) {
  const lv = run.skillLv;
  const pool = [];
  for (const [id, ev] of Object.entries(EVOLUTIONS)) {
    if (!run.evolved[id] && (lv[ev.from] || 0) >= 5 && (lv[ev.needs] || 0) >= 1) pool.push({ id, kind: 'evolution', weight: 1000 });
  }
  const weaponsOwned = Object.keys(SKILLS).filter((k) => SKILLS[k].type === 'weapon' && lv[k]).length;
  for (const [id, s] of Object.entries(SKILLS)) {
    const cur = lv[id] || 0;
    if (cur >= s.max) continue;
    if (s.type === 'weapon' && !cur && weaponsOwned >= WEAPON_SLOTS) continue;
    let w = cur ? 1.5 : 1.0;
    if (id === 'raiseDead' || id === 'legionCap' || id === 'minionFury') w *= 1.3;
    if (s.type === 'weapon' && !cur && weaponsOwned < 2) w *= 1.5;
    pool.push({ id, kind: s.type, weight: w });
  }
  const picks = [];
  while (picks.length < n && pool.length) {
    const total = pool.reduce((a, o) => a + o.weight, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < pool.length; idx++) { r -= pool[idx].weight; if (r <= 0) break; }
    idx = Math.min(idx, pool.length - 1);
    picks.push(pool[idx]);
    pool.splice(idx, 1);
  }
  if (!picks.length) picks.push({ id: 'heal', kind: 'bonus' }, { id: 'gold', kind: 'bonus' });
  return picks.map((p) => describe(run, p));
}

export function describe(run, p) {
  const lv = run.skillLv;
  if (p.kind === 'evolution') {
    const ev = EVOLUTIONS[p.id];
    return { ...p, name: ev.name, icon: ev.icon, desc: ev.desc, level: 0, max: 0, rarity: 'legendary' };
  }
  if (p.kind === 'bonus') {
    return p.id === 'heal'
      ? { ...p, name: 'Second Wind', icon: 'heart', desc: 'Restore 50% HP', level: 0, max: 0, rarity: 'rare' }
      : { ...p, name: 'Grave Gold', icon: 'coin', desc: '+150 gold this run', level: 0, max: 0, rarity: 'rare' };
  }
  const s = SKILLS[p.id];
  const next = (lv[p.id] || 0) + 1;
  return { ...p, name: s.name, icon: s.icon, desc: s.desc(next), level: next, max: s.max, isNew: next === 1, rarity: next === 5 ? 'epic' : s.type === 'weapon' ? 'rare' : 'common' };
}

export function applyChoice(run, c) {
  if (c.kind === 'evolution') run.evolved[c.id] = true;
  else if (c.kind === 'bonus') {
    if (c.id === 'heal') run.player.heal(run.player.maxHp * 0.5);
    else run.bonusGold += 150;
  } else run.skillLv[c.id] = (run.skillLv[c.id] || 0) + 1;
  run.recomputeStats();
  if (c.id === 'vitality') { run.player.update(0, { x: 0, z: 0 }); run.player.heal(run.player.maxHp * 0.3); }
}
