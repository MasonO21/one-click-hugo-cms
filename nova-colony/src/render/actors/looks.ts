/**
 * Who wears what: the colours a settler is drawn in (pure, hex strings; no allocation-sensitive
 * paths — the Characters actor resolves a look once per colonist and caches the THREE.Colors).
 *
 *  - Colonists in their own clothes: a top from OUTFIT_COLORS, trims from ACCENT_COLORS, trousers from
 *    TROUSER_COLORS, boots from BOOT_COLORS, all picked from their appearance indices + id.
 *  - A `colonist_outfit` cosmetic dresses every colonist in its `color` (top and, a shade darker, the
 *    trousers) with `accent` trims, each colonist a touch lighter / darker / warmer than the next so a
 *    crowd in uniform still reads as people.
 *  - The player wears the equipped `outfit` cosmetic the same way (one-piece look), or the default
 *    field jacket.
 */
import * as THREE from 'three';
import type { ColonistAppearance } from '../../core/state';
import { SKIN_TONES, HAIR_COLORS, OUTFIT_COLORS, ACCENT_COLORS, TROUSER_COLORS, BOOT_COLORS, HAIR_STYLES, pick } from '../core/palette';

export interface LookHex {
  skin: string;
  hair: string;
  outfit: string;
  accent: string;
  trousers: string;
  boots: string;
  /** Hair style index (0..HAIR_STYLES-1). */
  style: number;
}

/** A cosmetic's paint (CosmeticDef color / accent). */
export interface Paint {
  color?: string;
  accent?: string;
}

/** The player's default field jacket (no outfit equipped). */
export const PLAYER_DEFAULT: Readonly<Required<Paint>> = { color: '#d4663f', accent: '#ecd7a8' };
const PLAYER_TROUSERS = '#465466';

const _a = new THREE.Color();
const _hsl = { h: 0, s: 0, l: 0 };

function hex(c: THREE.Color): string {
  return '#' + c.getHexString();
}

/** Darker, slightly desaturated shade of a colour (trousers of a one-piece outfit). */
export function trouserShade(color: string): string {
  _a.set(color);
  _a.getHSL(_hsl);
  _a.setHSL(_hsl.h, _hsl.s * 0.85, _hsl.l * 0.72);
  return hex(_a);
}

/** Deterministic small hash of an id → 0..1. */
export function idNoise(id: number, salt = 0): number {
  let h = Math.imul((id | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt + 1, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2d);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** A uniform colour nudged per wearer: ±5% lightness, ±8% saturation, a hair of hue. */
export function varyColor(color: string, id: number, amount = 1): string {
  _a.set(color);
  _a.getHSL(_hsl);
  const dl = (idNoise(id, 1) - 0.5) * 0.1 * amount;
  const ds = (idNoise(id, 2) - 0.5) * 0.16 * amount;
  const dh = (idNoise(id, 3) - 0.5) * 0.024 * amount;
  _a.setHSL((_hsl.h + dh + 1) % 1, Math.min(1, Math.max(0, _hsl.s * (1 + ds))), Math.min(0.95, Math.max(0.04, _hsl.l + dl)));
  return hex(_a);
}

export function colonistLook(ap: ColonistAppearance | undefined, id: number, uniform?: Paint): LookHex {
  const skin = pick(SKIN_TONES, ap?.skin ?? 0);
  const hair = pick(HAIR_COLORS, ap?.hairColor ?? 0);
  const outfitIdx = ap?.outfit ?? 0;
  const style = (((ap?.hair ?? 0) % HAIR_STYLES) + HAIR_STYLES) % HAIR_STYLES;
  const boots = pick(BOOT_COLORS, id + outfitIdx);
  if (uniform?.color) {
    const outfit = varyColor(uniform.color, id);
    return { skin, hair, style, boots, outfit, accent: varyColor(uniform.accent ?? uniform.color, id, 0.5), trousers: trouserShade(outfit) };
  }
  return {
    skin,
    hair,
    style,
    boots,
    outfit: pick(OUTFIT_COLORS, outfitIdx),
    accent: pick(ACCENT_COLORS, outfitIdx * 5 + (ap?.skin ?? 0) + id),
    trousers: pick(TROUSER_COLORS, outfitIdx * 3 + (ap?.hairColor ?? 0)),
  };
}

export function playerLook(outfit?: Paint): LookHex {
  const color = outfit?.color ?? PLAYER_DEFAULT.color;
  return {
    skin: SKIN_TONES[1],
    hair: HAIR_COLORS[1],
    style: 0,
    boots: BOOT_COLORS[0],
    outfit: color,
    accent: outfit?.color ? (outfit.accent ?? color) : PLAYER_DEFAULT.accent,
    trousers: outfit?.color ? trouserShade(color) : PLAYER_TROUSERS,
  };
}
