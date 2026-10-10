/**
 * Celebration and reward cards that arrive within MERGE_WINDOW_MS of each other become one summary card instead of a
 * stack of modals to tap through ("3 research complete" with each one listed; a daily gift, a wheel prize and a
 * season reward as one "3 rewards" card with everything added up). The audit counted up to a dozen cards in a row.
 *
 * Only plain cards merge: tier-ups, the crash-landing intro, "What's new", illustrated moments (a biome postcard, a
 * world event, a new colonist's portrait) and rewards carrying a colonist, a cosmetic, a vehicle or a boost keep their
 * own card. Pure: PanelManager calls it when a modal opens.
 */
import type { CelebrateArg, RewardArg } from '../panels/CelebratePanel';
import type { Reward } from '../../data/schema';
import { bagAdd } from '../../core/bag';

export const MERGE_WINDOW_MS = 10_000;
/** A summary card lists at most this many entries (the rest read "+N more"). */
export const MERGE_LIST_MAX = 6;

const RESEARCH_TITLE = 'Research Complete!';

/** One celebration folded into a summary card. */
export interface MergedEntry {
  title: string;
  text?: string;
  icon?: string;
}

/** Panels whose cards can merge. */
export function mergeKind(name: string): boolean {
  return name === 'celebrate' || name === 'reward';
}

/** Can this card join (or start) a summary card? */
export function canMerge(name: string, arg: unknown): boolean {
  if (!arg || typeof arg !== 'object') return false;
  if (name === 'celebrate') {
    const a = arg as CelebrateArg;
    if (a.entries?.length) return true; // already a summary
    return a.tier == null && !a.big && !a.quiet && !a.art && !a.unlocks?.length && !a.researchUnlocks?.length && !a.notes?.length && !a.ok;
  }
  if (name === 'reward') {
    const a = arg as RewardArg;
    const r = a.reward ?? {};
    if (a.from?.length) return true;
    if (/^Thank you/i.test(a.title ?? '')) return false; // a purchase keeps its own thank-you card
    return !r.colonist && !r.cosmetic && !r.cosmetics?.length && !r.vehicle && !r.boost;
  }
  return false;
}

/** The note line of a merged celebration: a research card's own text ("Sharper Tools — Unlocks: …"), else its title. */
export function noteOf(e: MergedEntry): string {
  if (e.title === RESEARCH_TITLE && e.text) return e.text;
  return e.text && e.text.length <= 48 ? `${e.title} ${e.text}` : e.title;
}

function entriesOf(a: CelebrateArg): MergedEntry[] {
  return a.entries?.length ? a.entries : [{ title: a.title, text: a.text, icon: a.icon }];
}

/** Two celebration cards as one summary card. */
export function mergeCelebrate(a: CelebrateArg, b: CelebrateArg): CelebrateArg {
  const entries = [...entriesOf(a), ...entriesOf(b)];
  const n = entries.length;
  const research = entries.every((e) => e.title === RESEARCH_TITLE);
  const same = entries.every((e) => e.title === entries[0].title);
  const title = research ? `${n} research complete` : same ? `${entries[0].title.replace(/!$/, '')} ×${n}` : `${n} things to celebrate`;
  const notes = entries.slice(0, MERGE_LIST_MAX).map((e) => ({ icon: e.icon ?? '🎉', text: noteOf(e) }));
  if (n > MERGE_LIST_MAX) notes.push({ icon: '✨', text: `+${n - MERGE_LIST_MAX} more` });
  return { title, icon: research ? entries[0].icon ?? '🔬' : '🎉', notes, entries };
}

/** Everything in two rewards added up (callers only merge plain rewards, see canMerge). */
export function addRewards(a: Reward, b: Reward): Reward {
  const out: Reward = {};
  if (a.resources || b.resources) out.resources = bagAdd(a.resources ?? {}, b.resources);
  if (a.items || b.items) {
    const items: Record<string, number> = { ...(a.items ?? {}) };
    for (const [k, v] of Object.entries(b.items ?? {})) items[k] = (items[k] ?? 0) + v;
    out.items = items;
  }
  const sum = (x?: number, y?: number) => (x ?? 0) + (y ?? 0);
  if (a.nova || b.nova) out.nova = sum(a.nova, b.nova);
  if (a.rp || b.rp) out.rp = sum(a.rp, b.rp);
  if (a.xp || b.xp) out.xp = sum(a.xp, b.xp);
  return out;
}

/** Two reward cards as one: "3 rewards", everything added up, the cards' titles listed. */
export function mergeReward(a: RewardArg, b: RewardArg): RewardArg {
  const from = [...(a.from?.length ? a.from : [a.title]), ...(b.from?.length ? b.from : [b.title])];
  return { title: `${from.length} rewards`, reward: addRewards(a.reward ?? {}, b.reward ?? {}), icon: '🎁', from };
}

/** Merge `incoming` into `current` (same panel, both mergeable). */
export function mergeArgs(name: string, current: unknown, incoming: unknown): unknown {
  if (name === 'celebrate') return mergeCelebrate(current as CelebrateArg, incoming as CelebrateArg);
  return mergeReward(current as RewardArg, incoming as RewardArg);
}
