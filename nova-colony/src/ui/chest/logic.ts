/**
 * Pure parts of the cache scene (unit-tested in node): what a reward card shows, how long each reveal takes, which
 * sound and buzz go with it, how many particles the device can afford, and what Android back does in each phase.
 */
import type { DataRegistry } from '../../data';
import type { ChestCard } from '../../sim/chests';
import type { CosmeticKind, CosmeticRarity } from '../../data/schema';
import type { QualityLevel } from '../../core/state';
import { fmt } from '../../core/format';
import { bagEntries } from '../../core/bag';
import { cosmeticArt, hudArt, itemArt, professionArt, resourceArt, vehicleArt } from '../art';

/** The scene's steps. */
export type ChestPhase = 'off' | 'drop' | 'idle' | 'open' | 'cards' | 'done' | 'closing';

/** Android back / Escape: skip straight to everything revealed, then close. */
export function chestBack(phase: ChestPhase): 'skip' | 'close' | 'none' {
  if (phase === 'off' || phase === 'closing') return 'none';
  return phase === 'done' ? 'close' : 'skip';
}

export const RARITY_LABEL: Record<CosmeticRarity, string> = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', mythic: 'Mythic' };

const KIND_LABEL: Record<CosmeticKind, string> = {
  base_theme: 'Colony theme',
  outfit: 'Outfit',
  hat: 'Hat',
  pet: 'Pet',
  colonist_outfit: 'Crew outfit',
  vehicle_skin: 'Vehicle paint',
  turret_skin: 'Turret skin',
  decoration: 'Decor',
  photo_frame: 'Photo frame',
};

const BOOST_LABEL: Record<string, string> = { production: 'Production', research: 'Research', gather: 'Gathering' };

/** One icon on a card face: a painting, else the emoji. */
export interface FaceIcon {
  art: string | null;
  emoji: string;
  /** Small amount under a multi-icon card ("+120"). */
  amount?: string;
}

export interface CardFace {
  icons: FaceIcon[];
  /** The big line: "+450", "×2", "2×" ('' for a new cosmetic: its NEW tag says it). */
  amount: string;
  name: string;
  /** A small second line ("20 min", "Rare engineer", "Already yours: Ranger Hat"). */
  sub: string;
  /** A cosmetic that can be worn / applied right away. */
  equip?: string;
  isNew?: boolean;
  dupe?: boolean;
}

/** What a reward card shows. */
export function cardFace(card: ChestCard, data: DataRegistry): CardFace {
  const r = card.reward;
  switch (card.kind) {
    case 'resources': {
      const parts = bagEntries(r.resources);
      if (parts.length === 1) {
        const [k, v] = parts[0];
        const d = data.resource(k);
        return { icons: [{ art: resourceArt(k), emoji: d?.icon ?? '📦' }], amount: `+${fmt(v)}`, name: d?.name ?? k, sub: '' };
      }
      return {
        icons: parts.map(([k, v]) => ({ art: resourceArt(k), emoji: data.resource(k)?.icon ?? '📦', amount: `+${fmt(v)}` })),
        amount: '',
        name: 'Supplies',
        sub: parts.map(([k]) => data.resource(k)?.name ?? k).join(' & '),
      };
    }
    case 'boost': {
      const b = r.boost!;
      const art = b.kind === 'production' ? hudArt('power') : b.kind === 'research' ? hudArt('tech') : itemArt('stone_axe');
      const emoji = b.kind === 'production' ? '⚡' : b.kind === 'research' ? '🔬' : '🪓';
      return { icons: [{ art, emoji }], amount: `${fmt(b.mult)}×`, name: `${BOOST_LABEL[b.kind] ?? b.kind} boost`, sub: `${fmt(b.minutes)} min` };
    }
    case 'item': {
      const [id, n] = Object.entries(r.items ?? {})[0] ?? ['', 0];
      const d = data.item(id);
      return { icons: [{ art: itemArt(id), emoji: d?.icon ?? '🎁' }], amount: `×${n}`, name: d?.name ?? id, sub: '' };
    }
    case 'colonist': {
      const c = card.colonist;
      const prof = c ? data.profession(c.specialty) : undefined;
      const role = prof?.name?.toLowerCase() ?? 'colonist';
      return {
        icons: [{ art: (c && professionArt(c.specialty)) ?? hudArt('crew'), emoji: prof?.icon ?? '🧑‍🚀' }],
        amount: '',
        name: c?.name ?? 'New colonist',
        sub: `Joins as ${/^[aeiou]/.test(role) ? 'an' : 'a'} ${role}`,
      };
    }
    case 'nova':
      return { icons: [{ art: resourceArt('nova'), emoji: '💎' }], amount: `+${fmt(r.nova ?? 0)}`, name: 'Nova', sub: '' };
    case 'rp':
      return { icons: [{ art: hudArt('tech'), emoji: '🔬' }], amount: `+${fmt(r.rp ?? 0)}`, name: 'Research', sub: '' };
    case 'xp':
      return { icons: [{ art: hudArt('season'), emoji: '⭐' }], amount: `+${fmt(r.xp ?? 0)}`, name: 'Season XP', sub: '' };
    case 'vehicle': {
      const v = data.vehicle(r.vehicle ?? '');
      return { icons: [{ art: vehicleArt(r.vehicle ?? ''), emoji: v?.icon ?? '🚙' }], amount: '', name: v?.name ?? 'Vehicle', sub: 'Vehicle', isNew: true };
    }
    case 'cosmetic': {
      const def = card.cosmetic ? data.cosmetic(card.cosmetic) : undefined;
      const icon: FaceIcon = { art: def ? cosmeticArt(def.id) : null, emoji: def?.icon ?? '✨' };
      if (card.dupe) {
        return {
          icons: [icon, { art: resourceArt('nova'), emoji: '💎' }],
          amount: `+${fmt(r.nova ?? 0)}`,
          name: 'Nova',
          sub: def ? `Already yours: ${def.name}` : 'Collection complete',
          dupe: true,
        };
      }
      return {
        icons: [icon],
        amount: '',
        name: def?.name ?? 'Cosmetic',
        sub: def ? KIND_LABEL[def.kind] : '',
        equip: def && def.kind !== 'decoration' ? def.id : undefined,
        isNew: true,
      };
    }
  }
}

/** Milliseconds from one card's reveal to the next: rarer cards get a longer moment. */
export function revealGap(rarity: CosmeticRarity, crate: boolean): number {
  if (crate) return 300;
  return { common: 430, rare: 520, epic: 700, legendary: 1000, mythic: 1250 }[rarity];
}

/** A beat of suspense (the card wobbles, glowing) before a legendary or mythic card flips. */
export function teaseMs(rarity: CosmeticRarity): number {
  return rarity === 'mythic' ? 650 : rarity === 'legendary' ? 450 : 0;
}

/** The sound of a card flipping, by rarity (existing sound ids). */
export function revealSound(rarity: CosmeticRarity): string {
  return { common: 'collect', rare: 'coin', epic: 'reward', legendary: 'celebrate', mythic: 'tier_up' }[rarity];
}

/** Particles and canvas resolution the device can afford. */
export function fxBudget(quality: QualityLevel, reducedMotion: boolean): { amount: number; ambient: boolean; dpr: number } {
  if (reducedMotion) return { amount: 0.25, ambient: false, dpr: 1 };
  if (quality === 'low') return { amount: 0.4, ambient: true, dpr: 1 };
  if (quality === 'medium') return { amount: 0.7, ambient: true, dpr: 1.5 };
  return { amount: 1, ambient: true, dpr: 2 };
}

/** Taps it takes to open: caches build up over three, crates pop on the first. */
export function tapsToOpen(variant: 'chest' | 'crate'): number {
  return variant === 'crate' ? 1 : 3;
}

/** The little line under the cache while it waits for taps. */
export function tapHint(taps: number, need: number): string {
  const left = need - taps;
  if (taps <= 0) return 'Tap to open';
  if (left <= 1) return 'Once more';
  return 'Again';
}

/** "3 finds" under the cache's name. */
export function findsLabel(n: number): string {
  return `${n} ${n === 1 ? 'find' : 'finds'}`;
}
