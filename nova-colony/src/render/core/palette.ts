/**
 * Colors shared by all render modules: tier material styles derived from TierDef, colonist
 * appearance palettes (indices referenced by ColonistAppearance), and small color helpers.
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
}

/** Per-tier hand-tuned colors not present in TierDef (trim, floor, roof...). Index = tier. */
const TIER_EXTRA: { trim: string; floor: string; floorAlt: string; roof: string; roofEdge: string; metal: string; machine: string; machineDark: string }[] = [
  { trim: '#7a4e28', floor: '#c48c53', floorAlt: '#b47d47', roof: '#c4683a', roofEdge: '#8a4524', metal: '#5a4a3a', machine: '#8c6a48', machineDark: '#5c4430' },
  { trim: '#55351c', floor: '#a56a3c', floorAlt: '#945e34', roof: '#9c4f2f', roofEdge: '#6e3620', metal: '#3f3a36', machine: '#75573a', machineDark: '#4c3625' },
  { trim: '#6f6c66', floor: '#bdb8ae', floorAlt: '#aba69c', roof: '#8d6b5d', roofEdge: '#5f4a40', metal: '#4b4843', machine: '#8a8780', machineDark: '#5a5751' },
  { trim: '#3f4852', floor: '#8c97a3', floorAlt: '#7c8792', roof: '#5f6b78', roofEdge: '#2f3842', metal: '#262c33', machine: '#6c7986', machineDark: '#3b4752' },
  { trim: '#2f4152', floor: '#7d9bb4', floorAlt: '#6d8ba3', roof: '#4e6a82', roofEdge: '#243545', metal: '#1f2c38', machine: '#577896', machineDark: '#2f4659' },
  { trim: '#1b2535', floor: '#4f6485', floorAlt: '#44587a', roof: '#2f3f5a', roofEdge: '#131c2b', metal: '#0f1620', machine: '#3a4b66', machineDark: '#1f2a3c' },
  { trim: '#9fb2c4', floor: '#eef3f8', floorAlt: '#dbe4ee', roof: '#f3f7fb', roofEdge: '#9fb2c4', metal: '#7c8ea0', machine: '#d7e0ea', machineDark: '#8da0b4' },
];

const styleCache = new Map<number, TierStyle>();

export function tierStyle(def: TierDef): TierStyle {
  const idx = Math.max(0, Math.min(TIER_EXTRA.length - 1, def.index | 0));
  let s = styleCache.get(idx);
  if (s) return s;
  const ex = TIER_EXTRA[idx];
  const base = new THREE.Color(def.color);
  s = {
    index: idx,
    id: def.id,
    base,
    dark: base.clone().multiplyScalar(0.72),
    light: base.clone().lerp(new THREE.Color('#ffffff'), 0.22),
    trim: new THREE.Color(ex.trim),
    accent: new THREE.Color(def.accent),
    glow: def.glow,
    floor: new THREE.Color(ex.floor),
    floorAlt: new THREE.Color(ex.floorAlt),
    roof: new THREE.Color(ex.roof),
    roofEdge: new THREE.Color(ex.roofEdge),
    metal: new THREE.Color(ex.metal),
    machine: new THREE.Color(ex.machine),
    machineDark: new THREE.Color(ex.machineDark),
  };
  styleCache.set(idx, s);
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
