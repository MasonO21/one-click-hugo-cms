/**
 * Colony Journal presentation logic (pure, no DOM): painted icons, progress text, the per-line views, their order,
 * the section totals and the Colony Records (lifetime stats).
 */
import type { Game } from '../../core/Game';
import type { AchievementCategory, AchievementDef, AchievementMedal } from '../../data/schema';
import { ACHIEVEMENT_CATEGORIES } from '../../data/achievements';
import { fmtDuration } from '../../core/format';
import { counterValue } from '../../sim/meta/achievementRules';
import { alienArt, buildingArt, hudArt, itemArt, poiArt, professionArt, resourceArt, rewardArt, tierArt } from '../art';

// ------------------------------------------------------------------------------------------------ icons

/** Painted icon of an achievement ("resource:wood", "hud:build", …) or null (the emoji is used then). */
export function achievementArt(d: Pick<AchievementDef, 'art'>): string | null {
  if (!d.art) return null;
  const i = d.art.indexOf(':');
  const kind = d.art.slice(0, i);
  const id = d.art.slice(i + 1);
  switch (kind) {
    case 'resource': return resourceArt(id);
    case 'building': return buildingArt(id);
    case 'hud': return hudArt(id);
    case 'alien': return alienArt(id);
    case 'tier': return tierArt(Number(id));
    case 'poi': return poiArt(id);
    case 'reward': return rewardArt(id);
    case 'profession': return professionArt(id);
    case 'item': return itemArt(id);
    default: return null;
  }
}

export const MEDAL_EMOJI: Record<AchievementMedal, string> = { bronze: '🥉', silver: '🥈', gold: '🥇', special: '🏆' };
export const MEDAL_LABEL: Record<AchievementMedal, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', special: 'Trophy' };

/** Painted medal (bronze / silver / gold) or null: 🏆 has no illustration. */
export function medalArt(m: AchievementMedal): string | null {
  return m === 'special' ? null : rewardArt(`medal_${m}`);
}

/** A toast's emoji icon -> its painted version (medals, the journal), else null. */
export function toastIconArt(icon: string | undefined): string | null {
  switch (icon) {
    case '🥉': return rewardArt('medal_bronze');
    case '🥈': return rewardArt('medal_silver');
    case '🥇': return rewardArt('medal_gold');
    case '📔': return hudArt('journal');
    default: return null;
  }
}

// ------------------------------------------------------------------------------------------------ numbers & dates

const NF = new Intl.NumberFormat('en-US');

/** 3412 -> "3,412" (the journal shows exact counts; big numbers get separators, not suffixes). */
export function fmtNum(n: number): string {
  return NF.format(Math.floor(Math.max(0, n) + 1e-9));
}

function fmtHours(h: number): string {
  if (h >= 10) return fmtNum(h);
  const r = Math.floor(h * 10 + 1e-9) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** "3,412 / 5,000", "Tier 2 / 4", "3.4 / 10 h". */
export function progressLabel(d: Pick<AchievementDef, 'target' | 'unit'>, value: number): string {
  const v = Math.min(Math.max(0, value), d.target);
  if (d.unit === 'tier') return `Tier ${Math.floor(v)} / ${d.target}`;
  if (d.unit === 'hours') return `${fmtHours(v)} / ${fmtHours(d.target)} h`;
  return `${fmtNum(v)} / ${fmtNum(d.target)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Mar 4", or "Mar 4, 2025" when it is not this year. */
export function fmtDay(ms: number, nowMs: number): string {
  const d = new Date(ms);
  const base = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === new Date(nowMs).getFullYear() ? base : `${base}, ${d.getFullYear()}`;
}

// ------------------------------------------------------------------------------------------------ line views

export type LineState = 'claim' | 'progress' | 'done';

export interface LineView {
  line: string;
  category: AchievementCategory;
  name: string;
  icon: string;
  art: string | null;
  defs: AchievementDef[];
  /** The first medal not yet earned (null when every medal is earned). */
  next: AchievementDef | null;
  /** Live value towards `next` (the last medal's target once everything is earned). */
  value: number;
  /** 0..1 towards `next`. */
  frac: number;
  /** Earned and waiting for Claim. */
  claimable: AchievementDef[];
  earned: number;
  total: number;
  state: LineState;
}

/** One view per line (a tiered line's three medals share a card; a one-off is a line of one). */
export function lineViews(game: Game): LineView[] {
  const ach = game.sys.achievements;
  const byLine = new Map<string, AchievementDef[]>();
  for (const d of game.data.achievements) {
    const list = byLine.get(d.line);
    if (list) list.push(d);
    else byLine.set(d.line, [d]);
  }
  const out: LineView[] = [];
  for (const [line, defs] of byLine) {
    const first = defs[0];
    const next = defs.find((d) => !ach.isUnlocked(d.id)) ?? null;
    const claimable = defs.filter((d) => ach.isUnlocked(d.id) && !ach.isClaimed(d.id));
    const earned = defs.filter((d) => ach.isUnlocked(d.id)).length;
    const value = next ? ach.value(next.id) : defs[defs.length - 1].target;
    const frac = next ? Math.max(0, Math.min(1, value / next.target)) : 1;
    out.push({
      line,
      category: first.category,
      name: first.name,
      icon: first.icon,
      art: achievementArt(first),
      defs,
      next,
      value,
      frac,
      claimable,
      earned,
      total: defs.length,
      state: claimable.length ? 'claim' : next ? 'progress' : 'done',
    });
  }
  return out;
}

const RANK: Record<LineState, number> = { claim: 0, progress: 1, done: 2 };

/** Lines to claim first, then the ones in progress, finished lines last; otherwise the authored order. */
export function orderLines(lines: readonly LineView[]): LineView[] {
  return lines.map((l, i) => ({ l, i })).sort((a, b) => RANK[a.l.state] - RANK[b.l.state] || a.i - b.i).map((x) => x.l);
}

export interface CategoryView {
  id: AchievementCategory;
  name: string;
  icon: string;
  blurb: string;
  lines: LineView[];
  /** Medals earned / medals in the section. */
  earned: number;
  total: number;
  /** Medals waiting for Claim. */
  claimable: number;
}

/** The journal's sections in display order, each with its lines ordered for the player. */
export function categoryViews(game: Game): CategoryView[] {
  const all = lineViews(game);
  return ACHIEVEMENT_CATEGORIES.map((c) => {
    const lines = orderLines(all.filter((l) => l.category === c.id));
    return {
      ...c,
      lines,
      earned: lines.reduce((n, l) => n + l.earned, 0),
      total: lines.reduce((n, l) => n + l.total, 0),
      claimable: lines.reduce((n, l) => n + l.claimable.length, 0),
    };
  }).filter((c) => c.lines.length > 0);
}

/** Number on the Journal's menu tile and the menu button: medals waiting for Claim. */
export function journalBadge(game: Game): number {
  return game.sys.achievements.claimableCount();
}

// ------------------------------------------------------------------------------------------------ colony records

export interface RecordRow {
  id: string;
  icon: string;
  art: string | null;
  label: string;
  value: string;
}

/** Lifetime stats for the Colony Records section: everything is read from counters / state the game already keeps. */
export function colonyRecords(game: Game): RecordRow[] {
  const s = game.state;
  const c = (type: Parameters<typeof counterValue>[1], target = '*') => counterValue(game, type, target);
  const bosses = game.data.aliens.filter((a) => a.boss).reduce((n, a) => n + c('kill', a.id), 0);
  const raids = Math.max(c('defend'), s.stats.wavesWon);
  const regions = s.world.regionsDiscovered.length;
  const row = (id: string, icon: string, art: string | null, label: string, value: string | number): RecordRow => ({ id, icon, art, label, value: typeof value === 'number' ? fmtNum(value) : value });
  const sum = game.sys.achievements.summary();
  return [
    row('time', '⏳', hudArt('day'), 'Time in the colony', fmtDuration(s.playTime)),
    row('days', '🌅', hudArt('sunrise'), 'Days on this planet', s.time.day),
    row('wood', '🪵', resourceArt('wood'), 'Wood gathered', c('gather', 'wood')),
    row('stone', '🪨', resourceArt('stone'), 'Stone gathered', c('gather', 'stone')),
    row('gathered', '🌿', resourceArt('fiber'), 'Resources gathered', c('gather')),
    row('built', '🔨', hudArt('build'), 'Buildings built', c('build')),
    row('upgrades', '⬆️', buildingArt('workshop'), 'Upgrades finished', c('upgrade')),
    row('research', '🔬', hudArt('tech'), 'Research done', `${s.research.completed.length} / ${game.data.research.length}`),
    row('crafted', '🛠️', hudArt('craft'), 'Items crafted', c('craft')),
    row('aliens', '👾', alienArt('crawler'), 'Aliens defeated', c('kill')),
    row('raids', '🛡️', hudArt('defense'), 'Raids survived', raids),
    row('bosses', '👑', alienArt('queen'), 'Bosses defeated', bosses),
    row('colonists', '🧑‍🤝‍🧑', hudArt('population'), 'Colonists welcomed', s.colonists.list.length),
    row('rescued', '🆘', professionArt('doctor'), 'Survivors rescued', c('rescue')),
    row('regions', '🗺️', hudArt('map'), 'Regions discovered', `${regions} / ${game.data.biomes.length}`),
    row('looted', '🎒', poiArt('supply_cache'), 'Treasures looted', c('loot')),
    row('expeditions', '🥾', buildingArt('radio_tower'), 'Expeditions sent', s.expeditions.launched),
    row('hauls', '📦', itemArt('supply_crate'), 'Hauls brought home', s.expeditions.collected),
    row('charted', '🌠', poiArt('beacon'), 'Frontier sites charted', s.expeditions.frontier.charted.length),
    row('gifts', '🎁', rewardArt('daily_gift'), 'Daily gifts collected', s.liveops.daily.streak),
    row('medals', '🏅', hudArt('journal'), 'Achievements earned', `${sum.unlocked} / ${sum.total}`),
  ];
}
