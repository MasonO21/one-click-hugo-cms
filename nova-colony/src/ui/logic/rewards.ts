/** Flatten a Reward into display parts (icon + amount) for chips, chests and popups. */
import type { Reward } from '../../data/schema';
import type { DataRegistry } from '../../data';
import { fmt } from '../../core/format';
import { bagEntries } from '../../core/bag';
import { itemArt, resourceArt } from '../art';

export interface RewardPart {
  kind: 'resource' | 'nova' | 'rp' | 'xp' | 'item' | 'colonist' | 'boost' | 'cosmetic' | 'vehicle';
  icon: string;
  /** Illustration URL (resources, Nova and items) — null means show `icon`. */
  art: string | null;
  /** Short amount text: "+120", "×2", "30m". */
  amount: string;
  /** Name for tooltips / big reward cards. */
  label: string;
  color: string;
}

export const RARITY_COLOR: Record<string, string> = {
  common: '#9aa7b4',
  rare: '#4fb3f6',
  epic: '#b48cff',
  legendary: '#ffc83d',
};

export function rewardParts(r: Reward | null | undefined, data: DataRegistry): RewardPart[] {
  const out: RewardPart[] = [];
  if (!r) return out;
  for (const [id, v] of bagEntries(r.resources)) {
    const d = data.resource(id);
    out.push({ kind: 'resource', icon: d?.icon ?? '📦', art: resourceArt(id), amount: `+${fmt(v)}`, label: d?.name ?? id, color: d?.color ?? '#999' });
  }
  if (r.nova) out.push({ kind: 'nova', icon: '💎', art: resourceArt('nova'), amount: `+${fmt(r.nova)}`, label: 'Nova Crystals', color: '#b48cff' });
  if (r.rp) out.push({ kind: 'rp', icon: '🔬', art: null, amount: `+${fmt(r.rp)}`, label: 'Research Points', color: '#8fa8ff' });
  if (r.xp) out.push({ kind: 'xp', icon: '⭐', art: null, amount: `+${fmt(r.xp)}`, label: 'Season XP', color: '#ffcf4a' });
  if (r.items) {
    for (const [id, n] of Object.entries(r.items)) {
      const d = data.item(id);
      out.push({ kind: 'item', icon: d?.icon ?? '🎁', art: itemArt(id), amount: `×${n}`, label: d?.name ?? id, color: '#ff9e5e' });
    }
  }
  if (r.colonist) out.push({ kind: 'colonist', icon: '🧑‍🚀', art: null, amount: '+1', label: `${cap(r.colonist)} colonist`, color: RARITY_COLOR[r.colonist] ?? '#9aa7b4' });
  if (r.boost) out.push({ kind: 'boost', icon: '⚡', art: null, amount: `${r.boost.minutes}m`, label: `${fmt(r.boost.mult)}× ${r.boost.kind}`, color: '#ffd84a' });
  if (r.cosmetic) out.push({ kind: 'cosmetic', icon: '👕', art: null, amount: 'NEW', label: data.cosmetic(r.cosmetic)?.name ?? r.cosmetic, color: '#ff6f91' });
  if (r.vehicle) out.push({ kind: 'vehicle', icon: data.vehicle(r.vehicle)?.icon ?? '🚙', art: null, amount: 'NEW', label: data.vehicle(r.vehicle)?.name ?? r.vehicle, color: '#5ef2ff' });
  return out;
}

/**
 * Item toasts from the sim ("Crafted Medkit!", "🧰 Medkit opened!") only carry an emoji. Recognise them and return
 * the text (without the leading emoji) plus the item's illustration, or null when the text is about something else
 * or the item has no art.
 */
export function itemToast(text: string, data: DataRegistry): { text: string; icon: string } | null {
  const crafted = /^Crafted (.+)!$/.exec(text);
  if (crafted) {
    const r = data.recipes.find((x) => x.name === crafted[1] && x.outputs.items);
    const art = r ? itemArt(Object.keys(r.outputs.items ?? {})[0] ?? '') : null;
    return art ? { text, icon: art } : null;
  }
  if (text.endsWith(' opened!')) {
    for (const d of data.items) {
      const art = d.use ? itemArt(d.id) : null;
      if (art && text === `${d.icon} ${d.name} opened!`) return { text: text.slice(d.icon.length + 1), icon: art };
    }
  }
  return null;
}

export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
