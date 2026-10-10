/**
 * Wardrobe, the pure parts: which cosmetics each tab shows, how they sort and filter, where a locked one comes from
 * ("💎 450", "Season pass · level 15", "Cache exclusive: Ancient Relic or better", "Starter Pack"), what each
 * kind changes, rarity colours, and when a Nova purchase asks for confirmation. No DOM: panels/WardrobePanel.ts and
 * panels/wardrobe/cards.ts draw it.
 */
import type { DataRegistry } from '../../data';
import type { CosmeticDef, CosmeticKind, CosmeticRarity, Reward, ThemeFx } from '../../data/schema';
import { NOVA_CONFIRM_AT } from '../../data/novaShop';

export type WardrobeTabId = 'outfits' | 'hats' | 'pets' | 'colony' | 'rides' | 'frames';

export interface WardrobeTab {
  id: WardrobeTabId;
  label: string;
  icon: string;
  kinds: CosmeticKind[];
}

export const WARDROBE_TABS: WardrobeTab[] = [
  { id: 'outfits', label: 'Outfits', icon: '🧥', kinds: ['outfit'] },
  { id: 'hats', label: 'Hats', icon: '🧢', kinds: ['hat'] },
  { id: 'pets', label: 'Pets', icon: '🐾', kinds: ['pet'] },
  { id: 'colony', label: 'Colony', icon: '🏡', kinds: ['base_theme', 'colonist_outfit', 'decoration'] },
  { id: 'rides', label: 'Rides & Turrets', icon: '🛞', kinds: ['vehicle_skin', 'turret_skin'] },
  { id: 'frames', label: 'Frames', icon: '🖼️', kinds: ['photo_frame'] },
];

export function wardrobeTab(id: string): WardrobeTab {
  return WARDROBE_TABS.find((t) => t.id === id) ?? WARDROBE_TABS[0];
}

/** The tab a kind lives on. */
export function tabOfKind(kind: CosmeticKind): WardrobeTabId {
  return (WARDROBE_TABS.find((t) => t.kinds.includes(kind)) ?? WARDROBE_TABS[0]).id;
}

export const RARITY_ORDER: CosmeticRarity[] = ['common', 'rare', 'epic', 'legendary', 'mythic'];

/** Ring / ribbon colours: common cream, rare blue, epic purple, legendary gold, mythic rainbow. */
export const RARITY_STYLE: Record<CosmeticRarity, { label: string; color: string; deep: string; ring: string }> = {
  common: { label: 'Common', color: '#f4e4c1', deep: '#b8925a', ring: '#f4e4c1' },
  rare: { label: 'Rare', color: '#6cb8ff', deep: '#2f7fd0', ring: '#6cb8ff' },
  epic: { label: 'Epic', color: '#b48cff', deep: '#7a4fd6', ring: '#b48cff' },
  legendary: { label: 'Legendary', color: '#ffcf4a', deep: '#c98a12', ring: '#ffcf4a' },
  mythic: {
    label: 'Mythic',
    color: '#ff8ad8',
    deep: '#9a4fd6',
    ring: 'conic-gradient(from 210deg, #ff8a8a, #ffd36a, #a6f08a, #7ad8ff, #b48cff, #ff8ad8, #ff8a8a)',
  },
};

export function rarityRank(r: CosmeticRarity): number {
  return Math.max(0, RARITY_ORDER.indexOf(r));
}

export const KIND_LABEL: Record<CosmeticKind, string> = {
  base_theme: 'Colony theme',
  outfit: 'Outfit',
  hat: 'Hat',
  pet: 'Pet',
  colonist_outfit: 'Colonist outfit',
  vehicle_skin: 'Vehicle finish',
  turret_skin: 'Turret skin',
  decoration: 'Decorations',
  photo_frame: 'Photo frame',
};

const FX_TEXT: Record<ThemeFx, string> = {
  petals: 'drifting petals',
  snow: 'gentle snowfall',
  leaves: 'tumbling leaves',
  fireflies: 'fireflies',
  stars: 'twinkling stardust',
  aurora: 'aurora ribbons in the sky',
  embers: 'glowing motes',
};

/** "What it changes": one or two short lines for the detail sheet. */
export function cosmeticEffect(def: CosmeticDef): string[] {
  switch (def.kind) {
    case 'base_theme':
      return ["Recolours the roofs and trims across your colony.", def.fx ? `Adds ${FX_TEXT[def.fx]} over the colony.` : 'A new look for the whole colony.'];
    case 'outfit':
      return ['Changes what your explorer wears.'];
    case 'hat':
      return ['Worn by your explorer, with any outfit.'];
    case 'pet':
      return ['A companion that follows you around the colony.'];
    case 'colonist_outfit':
      return ['Every colonist in the colony wears it.'];
    case 'vehicle_skin':
      return ['A new finish for the vehicles you drive.'];
    case 'turret_skin':
      return ['A new finish for every defense turret. Looks only.'];
    case 'decoration':
      return ['Unlocks new pieces in Build › Decor.'];
    case 'photo_frame':
      return ['Frames your pictures in Photo Mode (Menu › Photo).', 'Switch frames on the photo before you share it.'];
  }
}

// ----------------------------------------------------------------------------------- sources

export type SourceKind = 'nova' | 'season' | 'pack' | 'mission' | 'chest';

export interface CosmeticSource {
  kind: SourceKind;
  /** Card / sheet text. */
  label: string;
  /** nova: the price. */
  nova?: number;
  /** season: the level (premium track or free). */
  level?: number;
  premium?: boolean;
  /** pack: the product id. */
  product?: string;
  /** chest: the cheapest chest that can drop it. */
  chest?: string;
}

const hasCosmetic = (r: Reward | null | undefined, id: string): boolean => !!r && (r.cosmetic === id || !!r.cosmetics?.includes(id));

/** Shorter shop names on the cards ("Titanium Founder Pack" -> "Founder Pack"). */
export function packLabel(name: string): string {
  return name.replace(/^Titanium /, '');
}

/**
 * Every way to get a cosmetic, most direct first: its Nova price, the season pass, a pack or bundle, a mission,
 * Nova chests. A chest-only cosmetic reads "Cache exclusive: Ancient Relic or better" (the cheapest chest
 * whose tier reaches the cosmetic's rarity; the top chest drops nothing "better").
 */
export function cosmeticSources(data: DataRegistry, def: CosmeticDef): CosmeticSource[] {
  const out: CosmeticSource[] = [];
  if (def.nova > 0) out.push({ kind: 'nova', label: `${def.nova}`, nova: def.nova });
  data.season.levels.forEach((l, i) => {
    if (hasCosmetic(l.premium, def.id)) out.push({ kind: 'season', label: `Season pass · level ${i + 1}`, level: i + 1, premium: true });
    if (hasCosmetic(l.free, def.id)) out.push({ kind: 'season', label: `Season pass · level ${i + 1} (free)`, level: i + 1, premium: false });
  });
  for (const p of data.products) {
    if ((p.section === 'packs' || p.section === 'bundles') && hasCosmetic(p.grants, def.id)) out.push({ kind: 'pack', label: packLabel(p.name), product: p.id });
  }
  for (const m of data.missions) if (hasCosmetic(m.reward, def.id)) out.push({ kind: 'mission', label: `Mission: ${m.name}` });
  if (def.chest) {
    const chest = data.chests.find((c) => rarityRank(c.rarity as CosmeticRarity) >= rarityRank(def.rarity));
    if (chest) {
      const top = chest === data.chests[data.chests.length - 1];
      const name = chest.name;
      const where = top ? name : `${name} or better`;
      out.push({ kind: 'chest', label: out.length === 0 ? `Cache exclusive: ${where}` : `Nova caches: ${where}`, chest: chest.id });
    }
  }
  return out;
}

/** The source a locked card shows. */
export function primarySource(sources: CosmeticSource[]): CosmeticSource | null {
  return sources[0] ?? null;
}

// ----------------------------------------------------------------------------------- state, sort, filter

export type CosmeticState = 'equipped' | 'owned' | 'locked';

export interface WardrobeOwnership {
  owned: readonly string[];
  equipped: Partial<Record<string, string>>;
}

export function cosmeticState(def: CosmeticDef, own: WardrobeOwnership): CosmeticState {
  if (own.equipped[def.kind] === def.id && own.owned.includes(def.id)) return 'equipped';
  return own.owned.includes(def.id) ? 'owned' : 'locked';
}

export type WardrobeFilter = 'all' | 'owned' | 'locked';

/** The cosmetics a tab shows (in catalogue order), optionally only owned / only locked ones. */
export function filterCosmetics(all: readonly CosmeticDef[], tab: WardrobeTabId, own: WardrobeOwnership, filter: WardrobeFilter = 'all'): CosmeticDef[] {
  const kinds = wardrobeTab(tab).kinds;
  return all.filter((c) => {
    if (!kinds.includes(c.kind)) return false;
    if (filter === 'all') return true;
    const owned = own.owned.includes(c.id);
    return filter === 'owned' ? owned : !owned;
  });
}

/**
 * Wardrobe order: what you wear, then what you own, then what you can buy with Nova (cheapest first), then
 * everything else; inside each group the tab's kinds keep their order (Colony: themes, colonist outfits, decor),
 * then rarity (common first), then name.
 */
export function sortCosmetics(list: readonly CosmeticDef[], own: WardrobeOwnership, tab?: WardrobeTabId): CosmeticDef[] {
  const kinds = tab ? wardrobeTab(tab).kinds : [];
  const group = (c: CosmeticDef): number => {
    const s = cosmeticState(c, own);
    return s === 'equipped' ? 0 : s === 'owned' ? 1 : c.nova > 0 ? 2 : 3;
  };
  return [...list].sort(
    (a, b) =>
      group(a) - group(b) ||
      (kinds.length ? kinds.indexOf(a.kind) - kinds.indexOf(b.kind) : 0) ||
      (group(a) === 2 ? a.nova - b.nova : 0) ||
      rarityRank(a.rarity) - rarityRank(b.rarity) ||
      a.name.localeCompare(b.name),
  );
}

/** Owned / total for a tab (the tab strip's "3/7"). */
export function tabProgress(all: readonly CosmeticDef[], tab: WardrobeTabId, own: WardrobeOwnership): { owned: number; total: number } {
  const list = filterCosmetics(all, tab, own);
  return { owned: list.filter((c) => own.owned.includes(c.id)).length, total: list.length };
}

/** Ask "Buy X for 450 Nova?" before spending this much in one tap. */
export function needsNovaConfirm(price: number): boolean {
  return price >= NOVA_CONFIRM_AT;
}

/** A frame chip row for Photo Mode: the classic frame, then every owned frame (catalogue order). */
export function ownedFrames(all: readonly CosmeticDef[], owned: readonly string[]): CosmeticDef[] {
  return all.filter((c) => c.kind === 'photo_frame' && owned.includes(c.id));
}
