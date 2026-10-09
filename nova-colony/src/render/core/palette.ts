/**
 * Colors shared by all render modules: tier material styles derived from TierDef, colonist
 * appearance palettes (indices referenced by ColonistAppearance), and small color helpers.
 *
 * Tier palette cheat sheet (sRGB, what each tier should read as from the 3/4 camera):
 *  0 Wood        warm fresh timber, rope + canvas, lantern glow
 *  1 Reinforced  darker oiled timber, iron bands, blue banners
 *  2 Stone       warm grey masonry, timber trims, slate roofs
 *  3 Steel       mid warm-grey riveted plates, RUST-ORANGE stripes, warm window light (never black)
 *  4 Alloy       blue-silver + white panels, orange safety accents, cyan glow
 *  5 Nano        deep teal / indigo with bright glowing cyan edges
 *  6 Titanium    pearl white + gold trim + soft blue glow
 */
import * as THREE from 'three';
import type { TierDef } from '../../data/schema';

/** Resolved look of one material tier (wood .. titanium). All colors are linear THREE.Colors. */
export interface TierStyle {
  index: number;
  id: string;
  /** Main surface (walls, panels). */
  base: THREE.Color;
  dark: THREE.Color;
  light: THREE.Color;
  /** Posts, frames, trims. */
  trim: THREE.Color;
  /** Neon / emissive accent (TierDef.accent). */
  accent: THREE.Color;
  /** 0..1 emissive strength at night. */
  glow: number;
  floor: THREE.Color;
  floorAlt: THREE.Color;
  roof: THREE.Color;
  roofEdge: THREE.Color;
  /** Bolts, rivets, braces. */
  metal: THREE.Color;
  /** Machine body color for facilities of this tier. */
  machine: THREE.Color;
  machineDark: THREE.Color;
  /**
   * Painted (non-glowing) secondary accent: rope (wood), banner blue (reinforced / stone),
   * rust-orange hazard stripes (steel), safety orange (alloy), cyan paint (nano), gold (titanium).
   * Use with SLOT_LIT for stripes, bands, flags and trims that should NOT light up at night.
   */
  stripe: THREE.Color;
  /** Window / lantern light color (SLOT_GLOW): warm for the low tiers, cool for the high ones. */
  lamp: THREE.Color;
  /**
   * Cosmetic look on top of the tier ('' = the stock tier look): a colony theme ('theme:<id>') or a
   * turret skin ('skin:<id>'). Part of every model / piece cache key, so themed and stock models never mix.
   */
  look: string;
  /** A turret skin repaints the body: models that would use bare timber / stone use `base` / `machine` instead. */
  skinned?: boolean;
}

/** The colours a cosmetic look leans toward (CosmeticDef.color / accent). */
export interface LookTint {
  id: string;
  color: string;
  accent?: string;
}

interface TierColors {
  /** Overrides TierDef.color when set (the data colours were tuned for UI chips, not 3D surfaces). */
  base?: string;
  dark: string;
  light: string;
  trim: string;
  /** Overrides TierDef.accent when set. */
  accent?: string;
  floor: string;
  floorAlt: string;
  roof: string;
  roofEdge: string;
  metal: string;
  machine: string;
  machineDark: string;
  stripe: string;
  lamp: string;
}

/** Per-tier hand-tuned colors. Index = tier. */
const TIER_EXTRA: TierColors[] = [
  // 0 Wood — fresh timber, rope, canvas tents
  { base: '#b67f49', dark: '#8a5a30', light: '#d2a068', trim: '#6b4323', accent: '#ffd27a', floor: '#c48c53', floorAlt: '#b07a46', roof: '#dcc89c', roofEdge: '#8d6a40', metal: '#6a5f55', machine: '#8c6a48', machineDark: '#5c4430', stripe: '#dcbb7e', lamp: '#ffd27a' },
  // 1 Reinforced Wood — oiled dark timber, iron bands, blue banners
  { base: '#8d5b31', dark: '#653f1e', light: '#a9733f', trim: '#4a2d16', accent: '#e8b96a', floor: '#a56a3c', floorAlt: '#8e5a32', roof: '#774728', roofEdge: '#4b2b15', metal: '#4b4542', machine: '#75573a', machineDark: '#4c3625', stripe: '#3f6fb8', lamp: '#ffcf74' },
  // 2 Stone — warm grey masonry, timber trims, slate roofs
  { base: '#aba497', dark: '#857e71', light: '#c7c0b2', trim: '#7a5230', accent: '#f0dca4', floor: '#bab3a6', floorAlt: '#a69f92', roof: '#5b6472', roofEdge: '#3b4250', metal: '#4e4a46', machine: '#7e7b75', machineDark: '#54504b', stripe: '#3a6cc4', lamp: '#ffcf74' },
  // 3 Steel — mid warm-grey riveted plates, rust-orange stripes, warm windows
  { base: '#8d8983', dark: '#67635d', light: '#aba69f', trim: '#5c5853', accent: '#ffad3e', floor: '#9b978f', floorAlt: '#87837c', roof: '#767370', roofEdge: '#4b4844', metal: '#45423e', machine: '#6f6b66', machineDark: '#484440', stripe: '#d4712b', lamp: '#ffc266' },
  // 4 Advanced Alloy — blue-silver + white panels, orange safety accents, cyan glow
  { base: '#9eb2c7', dark: '#7a8ea4', light: '#d5dfe9', trim: '#4f6378', accent: '#58d0ff', floor: '#b0bfcd', floorAlt: '#9aabbb', roof: '#8ea4ba', roofEdge: '#4c6075', metal: '#3b4c5e', machine: '#6d8296', machineDark: '#44576a', stripe: '#ff9440', lamp: '#a4e6ff' },
  // 5 Nano-Tech — deep teal / indigo with bright cyan edges
  { base: '#275866', dark: '#19393f', light: '#357087', trim: '#20304e', accent: '#4ef4ff', floor: '#2b4f60', floorAlt: '#22404f', roof: '#25475a', roofEdge: '#122230', metal: '#131f2c', machine: '#305a71', machineDark: '#1d3649', stripe: '#38d6ef', lamp: '#62f0ff' },
  // 6 Titanium — pearl white + gold trim + soft blue glow
  { base: '#eef1f5', dark: '#c6cdd7', light: '#ffffff', trim: '#d9bb72', accent: '#86cfff', floor: '#eef3f8', floorAlt: '#d7dfe9', roof: '#f5f8fb', roofEdge: '#cfb47a', metal: '#99a6b7', machine: '#dfe6ee', machineDark: '#a8b5c5', stripe: '#e3b650', lamp: '#a6dcff' },
];

const styleCache = new Map<number, TierStyle>();

export function tierStyle(def: TierDef): TierStyle {
  const idx = Math.max(0, Math.min(TIER_EXTRA.length - 1, def.index | 0));
  let s = styleCache.get(idx);
  if (s) return s;
  const ex = TIER_EXTRA[idx];
  const base = new THREE.Color(ex.base ?? def.color);
  s = {
    index: idx,
    id: def.id,
    base,
    dark: new THREE.Color(ex.dark),
    light: new THREE.Color(ex.light),
    trim: new THREE.Color(ex.trim),
    accent: new THREE.Color(ex.accent ?? def.accent),
    glow: def.glow,
    floor: new THREE.Color(ex.floor),
    floorAlt: new THREE.Color(ex.floorAlt),
    roof: new THREE.Color(ex.roof),
    roofEdge: new THREE.Color(ex.roofEdge),
    metal: new THREE.Color(ex.metal),
    machine: new THREE.Color(ex.machine),
    machineDark: new THREE.Color(ex.machineDark),
    stripe: new THREE.Color(ex.stripe),
    lamp: new THREE.Color(ex.lamp),
    look: '',
  };
  styleCache.set(idx, s);
  return s;
}

const lookCache = new Map<string, TierStyle>();

/**
 * Themes whose point is the light after dark: their glow strips (TierStyle.accent, drawn in the glow
 * slot from Steel up) take this colour almost fully instead of the gentle accent lean, so the
 * Bioluminescent Night really glows teal, Neon Night magenta, and so on.
 */
export const THEME_GLOW: Record<string, string> = {
  theme_biolume: '#3ee8c8',
  theme_neon_night: '#ff5ad0',
  theme_aurora: '#7be0c8',
  theme_starfall: '#f2dc9a',
  theme_titanium_dawn: '#46d8e8',
};

function cloneStyle(base: TierStyle, look: string): TierStyle {
  const s: TierStyle = { ...base, look };
  for (const k of Object.keys(s) as (keyof TierStyle)[]) {
    const v = s[k];
    if (v instanceof THREE.Color) (s as unknown as Record<string, unknown>)[k] = v.clone();
  }
  return s;
}

/** THREE.Color from an sRGB hex. */
const col = (hex: string | undefined, fallback: string): THREE.Color => new THREE.Color(hex ?? fallback);

/**
 * A colony theme's gentle tint of a tier look: roofs and roof edges lean toward the theme colour,
 * trims, banners and painted stripes toward its accent, the neon glow halfway — walls, floors and
 * window light stay as built, so the tier still reads at a glance. Cached per tier and theme.
 */
export function themedStyle(base: TierStyle, theme: LookTint | null | undefined): TierStyle {
  if (!theme) return base;
  const look = `theme:${theme.id}`;
  const key = `${base.index}|${look}`;
  let s = lookCache.get(key);
  if (s) return s;
  s = cloneStyle(base, look);
  const c = col(theme.color, '#ffffff');
  const a = col(theme.accent, theme.color);
  s.roof.lerp(c, 0.58);
  s.roofEdge.lerp(a, 0.5);
  s.stripe.lerp(a, 0.65);
  s.trim.lerp(a, 0.28);
  const glow = THEME_GLOW[theme.id];
  if (glow) s.accent.lerp(col(glow, glow), 0.85);
  else s.accent.lerp(a, 0.45);
  s.floorAlt.lerp(c, 0.12);
  lookCache.set(key, s);
  return s;
}

/**
 * A turret skin: the body takes the skin colour (machine, panels, timber), trims, stripes and the
 * glow take its accent. Cached per tier and skin.
 */
export function skinnedStyle(base: TierStyle, skin: LookTint | null | undefined): TierStyle {
  if (!skin) return base;
  const look = `skin:${skin.id}`;
  const key = `${base.index}|${look}`;
  let s = lookCache.get(key);
  if (s) return s;
  s = cloneStyle(base, look);
  s.skinned = true;
  const c = col(skin.color, '#ffffff');
  const a = col(skin.accent, skin.color);
  const dark = c.clone().multiplyScalar(0.62);
  s.machine.copy(c);
  s.machineDark.copy(dark);
  s.base.lerp(c, 0.75);
  s.light.lerp(c, 0.55).lerp(new THREE.Color(1, 1, 1), 0.12);
  s.dark.lerp(dark, 0.75);
  s.trim.lerp(a, 0.8);
  s.stripe.copy(a);
  s.accent.copy(a);
  s.metal.lerp(dark, 0.5);
  s.roof.lerp(c, 0.6);
  s.roofEdge.lerp(a, 0.6);
  lookCache.set(key, s);
  return s;
}

/** Colonist appearance palettes. ColonistAppearance indices wrap around these. */
export const SKIN_TONES = ['#f6d3b3', '#e8b98f', '#d19a6b', '#a86f45', '#7d4b2a', '#f0c8a8'];
export const HAIR_COLORS = ['#2b1d12', '#5a3a1e', '#a86a2f', '#e0b457', '#c74d2b', '#d9d9e3', '#6b4ec9', '#3cb5a3'];
export const OUTFIT_COLORS = ['#e86f4d', '#4fa3e0', '#7cc36b', '#f0b24b', '#b26ad8', '#5ed6c8', '#e0588c', '#8a9aa8'];
export const HAIR_STYLES = 4;

export const pick = <T>(arr: T[], i: number): T => arr[((i | 0) % arr.length + arr.length) % arr.length];

const _tmpColor = new THREE.Color();
/** Desaturate + darken a linear color in place (locked regions). */
export function dimColor(c: THREE.Color, amount: number): THREE.Color {
  const l = c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
  _tmpColor.setRGB(l, l, l);
  c.lerp(_tmpColor, amount * 0.7).multiplyScalar(1 - amount * 0.3);
  return c;
}

/** Hex string -> linear color components written into out[o..o+2]. */
export function writeColor(out: Float32Array | number[], o: number, color: THREE.Color): void {
  out[o] = color.r;
  out[o + 1] = color.g;
  out[o + 2] = color.b;
}
