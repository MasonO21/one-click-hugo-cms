/**
 * Season pass, the pure parts of the panel: what the premium track holds (computed from the data, never typed in:
 * "10 cosmetics · 8 chests · 3,000 Nova"), and which part of a level's reward is its "hero" picture (a cosmetic or
 * a Nova chest) with the rest left for the chips.
 */
import type { DataRegistry } from '../../data';
import type { Reward, SeasonDef } from '../../data/schema';

export interface SeasonHighlights {
  /** Cosmetic ids on the premium track, in level order. */
  cosmetics: string[];
  /** Of those, how many can only be had from the season (no Nova price, no chest, no pack). */
  exclusive: number;
  /** Nova chests on the premium track, in level order (one entry per chest). */
  chests: string[];
  /** Total Nova on the premium track. */
  nova: number;
  /** Colonists on the premium track. */
  colonists: number;
  /** Bonus past the last level: its cache, or its Nova where it pays Nova (null when the season has none). */
  bonus: { xp: number; chest: string | null; nova: number } | null;
}

const cosmeticsOf = (r: Reward): string[] => [...(r.cosmetic ? [r.cosmetic] : []), ...(r.cosmetics ?? [])];

export function seasonHighlights(data: DataRegistry, season: SeasonDef = data.season): SeasonHighlights {
  const cosmetics: string[] = [];
  const chests: string[] = [];
  let nova = 0;
  let colonists = 0;
  for (const l of season.levels) {
    const r = l.premium;
    cosmetics.push(...cosmeticsOf(r));
    for (const [id, n] of Object.entries(r.items ?? {})) if (data.chest(id)) for (let i = 0; i < n; i++) chests.push(id);
    nova += r.nova ?? 0;
    if (r.colonist) colonists++;
  }
  // "only here": nothing else in the game hands it out
  const elsewhere = new Set<string>();
  for (const p of data.products) if (p.section !== 'season') cosmeticsOf(p.grants).forEach((c) => elsewhere.add(c));
  for (const m of data.missions) cosmeticsOf(m.reward).forEach((c) => elsewhere.add(c));
  const exclusive = cosmetics.filter((id) => {
    const c = data.cosmetic(id);
    return !!c && c.nova === 0 && !c.chest && !elsewhere.has(id);
  }).length;
  const b = season.bonus;
  const bonusChest = b ? (Object.keys(b.reward.items ?? {}).find((id) => data.chest(id)) ?? null) : null;
  return { cosmetics, exclusive, chests, nova, colonists, bonus: b ? { xp: b.xp, chest: bonusChest, nova: b.reward.nova ?? 0 } : null };
}

/** The premium card's line about the bonus: "an Explorer's Case every 400 XP after level 50" (or its Nova). */
export function bonusLine(data: DataRegistry, b: NonNullable<SeasonHighlights['bonus']>, lastLevel: number): string {
  const what = b.chest ? article(data.chest(b.chest)?.name ?? 'bonus cache') : b.nova > 0 ? `${b.nova.toLocaleString('en-US')} Nova` : 'a bonus reward';
  return `${what} every ${b.xp.toLocaleString('en-US')} XP after level ${lastLevel}`;
}

/** "an Explorer's Case", "a Supply Cache". */
export function article(name: string): string {
  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;
}

/** "3,000" for a round number, else rounded down to a friendly step with a "+" (3,240 -> "3,200+"). */
export function friendlyAmount(n: number): string {
  const v = Math.max(0, Math.floor(n));
  const step = v >= 1000 ? 100 : v >= 200 ? 50 : v >= 50 ? 10 : 1;
  const down = Math.floor(v / step) * step;
  return down.toLocaleString('en-US') + (down < v ? '+' : '');
}

/** The headline chips: "10 cosmetics", "8 caches", "3,000 Nova", "5 colonists". */
export function highlightChips(h: SeasonHighlights): string[] {
  const out: string[] = [];
  if (h.cosmetics.length) out.push(`${h.cosmetics.length} cosmetic${h.cosmetics.length === 1 ? '' : 's'}`);
  if (h.chests.length) out.push(`${h.chests.length} cache${h.chests.length === 1 ? '' : 's'}`);
  if (h.nova > 0) out.push(`${friendlyAmount(h.nova)} Nova`);
  if (h.colonists > 0) out.push(`${h.colonists} colonist${h.colonists === 1 ? '' : 's'}`);
  return out;
}

export interface RewardHero {
  kind: 'cosmetic' | 'chest';
  id: string;
  /** cosmetic heroes: the level's best Nova chest too, shown beside it (null when there is none). */
  chest?: string | null;
  /** The reward without the hero (and that chest), for the chips under it. */
  rest: Reward;
}

/** The best Nova chest among a reward's items (null when there is none). */
function bestChest(data: DataRegistry, r: Reward): string | null {
  let best: string | null = null;
  let bestRank = -1;
  for (const id of Object.keys(r.items ?? {})) {
    const rank = data.chests.findIndex((c) => c.id === id);
    if (rank > bestRank) {
      best = id;
      bestRank = rank;
    }
  }
  return best;
}

/** `r` with one `id` taken out of its items. */
function withoutOne(r: Reward, id: string): Reward {
  const items = { ...(r.items ?? {}) };
  if ((items[id] ?? 0) > 1) items[id]--;
  else delete items[id];
  const rest: Reward = { ...r, items };
  if (!Object.keys(items).length) delete rest.items;
  return rest;
}

/** The picture a season cell leads with: its cosmetic (with its best chest beside it), else its best Nova chest. */
export function rewardHero(data: DataRegistry, r: Reward): RewardHero | null {
  const cos = cosmeticsOf(r);
  if (cos.length) {
    let rest: Reward = { ...r };
    if (r.cosmetic === cos[0]) delete rest.cosmetic;
    else rest.cosmetics = (r.cosmetics ?? []).filter((c) => c !== cos[0]);
    if (rest.cosmetics && !rest.cosmetics.length) delete rest.cosmetics;
    const chest = bestChest(data, rest);
    if (chest) rest = withoutOne(rest, chest);
    return { kind: 'cosmetic', id: cos[0], chest, rest };
  }
  const best = bestChest(data, r);
  return best ? { kind: 'chest', id: best, rest: withoutOne(r, best) } : null;
}
