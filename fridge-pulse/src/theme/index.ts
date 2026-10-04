import { useColorScheme } from 'react-native';
import type { Urgency } from '../lib/expiry';
import { useSettings, type Appearance } from '../store/settings';

export { brandFont, FONT } from './fonts';

/**
 * The Fridge Pulse brand (see `docs/brand.md`): Pulse Magenta, Electric Blue, Zesty Orange, Lime
 * Spark and Charcoal Slate, in a dark neon interface. Raw brand colours are for marks and glows;
 * text always uses the palette tokens below, which are tuned to pass WCAG AA on their surfaces
 * (`__tests__/contrast.test.ts`).
 */
export const BRAND = {
  magenta: '#FF007F',
  blue: '#007FFF',
  orange: '#FF5F00',
  lime: '#A7F432',
  charcoal: '#222222',
  /** The dashboard's deep navy, used for the hero card and the icon's fridge in both modes. */
  navy: '#0B1530',
} as const;

interface UrgencyColors {
  /** Solid colour for dots and bar segments. */
  solid: string;
  /** Text colour on `tint`. */
  fg: string;
  tint: string;
}

export interface Palette {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  ink: string;
  inkMuted: string;
  inkFaint: string;
  /** Magenta for text, icons and selected outlines on the background and cards. */
  primary: string;
  /** Magenta fill for buttons, selected chips and badges, with `onPrimary` text. */
  primaryFill: string;
  primaryPressed: string;
  onPrimary: string;
  primaryTint: string;
  /** Electric blue for text and icons (secondary accent). */
  blue: string;
  /** The two halves of the "Fridge Pulse" wordmark (large text only). */
  wordFridge: string;
  wordPulse: string;
  /** Neon outline colour for glowing cards and outlined buttons. */
  glow: string;
  /** The orange "scan" call to action: gradient stops, with large white text (3:1 rule). */
  cta: [string, string];
  onCta: string;
  /** Lime for good news: the "used it" swipe, rescues, the freshness meter. */
  success: string;
  onSuccess: string;
  hero: string;
  onHero: string;
  danger: string;
  /** Text on a danger-coloured background (the "Thrown out" swipe). */
  onDanger: string;
  freezer: string;
  /** The message bar. */
  snackBg: string;
  snackText: string;
  snackAction: string;
  /** Off-state switch track; needs 3:1 against the card it sits on. */
  switchOff: string;
  urgency: Record<Urgency, UrgencyColors>;
}

/** The neon look from the brand sheet: the default. */
export const darkPalette: Palette = {
  bg: '#070B16',
  surface: '#0E1528',
  surfaceAlt: '#16203A',
  border: '#22335A',
  ink: '#F3F6FF',
  inkMuted: '#AAB5D1',
  inkFaint: '#8E9AB8',
  primary: '#FF4DA6',
  primaryFill: '#E0007A',
  primaryPressed: '#C4006B',
  onPrimary: '#FFFFFF',
  primaryTint: '#2A0F2E',
  blue: '#5AAEFF',
  wordFridge: '#3D9BFF',
  wordPulse: '#FF2D95',
  glow: BRAND.blue,
  cta: ['#FF5A00', '#FF2E00'],
  onCta: '#FFFFFF',
  success: BRAND.lime,
  onSuccess: '#13200A',
  hero: BRAND.navy,
  onHero: '#FFFFFF',
  danger: '#FF5C7A',
  onDanger: '#1F0008',
  freezer: '#5AAEFF',
  snackBg: '#16203A',
  snackText: '#FFFFFF',
  snackAction: BRAND.lime,
  switchOff: '#5B6785',
  urgency: {
    expired: { solid: '#FF2D8F', fg: '#FF7DBA', tint: '#3A0E27' },
    today: { solid: '#FF6A1A', fg: '#FFA066', tint: '#3A1B0B' },
    soon: { solid: '#FFC233', fg: '#FFD46E', tint: '#382B0B' },
    week: { solid: '#2E8BFF', fg: '#7DB8FF', tint: '#0D2448' },
    ok: { solid: BRAND.lime, fg: '#C2F86A', tint: '#1E2E0C' },
  },
};

/** The same brand on white, with Charcoal Slate text, for people who prefer a light screen. */
export const lightPalette: Palette = {
  bg: '#F5F7FC',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF2FA',
  border: '#DCE3F0',
  ink: BRAND.charcoal,
  inkMuted: '#545B6B',
  inkFaint: '#626979',
  primary: '#C2006A',
  primaryFill: '#D6006B',
  primaryPressed: '#B8005C',
  onPrimary: '#FFFFFF',
  primaryTint: '#FFE6F2',
  blue: '#0062CC',
  wordFridge: BRAND.blue,
  wordPulse: '#E6007A',
  glow: BRAND.blue,
  cta: ['#FF5A00', '#FF2E00'],
  onCta: '#FFFFFF',
  success: BRAND.lime,
  onSuccess: '#13200A',
  hero: BRAND.navy,
  onHero: '#FFFFFF',
  danger: '#C8102E',
  onDanger: '#FFFFFF',
  freezer: '#0062CC',
  snackBg: BRAND.charcoal,
  snackText: '#FFFFFF',
  snackAction: BRAND.lime,
  switchOff: '#7A8294',
  urgency: {
    expired: { solid: '#FF007F', fg: '#B00059', tint: '#FFE4F1' },
    today: { solid: '#FF5F00', fg: '#A63D00', tint: '#FFE9DB' },
    soon: { solid: '#F5B000', fg: '#7A5600', tint: '#FFF3CF' },
    week: { solid: '#007FFF', fg: '#0058B8', tint: '#E2EEFF' },
    ok: { solid: '#7CCB12', fg: '#3B6A00', tint: '#EDF9D9' },
  },
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;
export const radius = { sm: 10, md: 14, lg: 20, pill: 999 } as const;

export type { Appearance };

/** Which palette an appearance setting resolves to. */
export function resolveScheme(appearance: Appearance, system: string | null | undefined): 'dark' | 'light' {
  if (appearance === 'system') return system === 'light' ? 'light' : 'dark';
  return appearance;
}

/** A soft neon halo (web and the new architecture support `boxShadow`). */
export function glow(color: string, size = 14, alpha = 0.45): { boxShadow: string } {
  const a = Math.round(Math.min(Math.max(alpha, 0), 1) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
  return { boxShadow: `0px 0px ${size}px ${color}${a}` };
}

export function useTheme() {
  const system = useColorScheme();
  const appearance = useSettings((s) => s.appearance);
  const scheme = resolveScheme(appearance, system);
  return { c: scheme === 'dark' ? darkPalette : lightPalette, scheme } as const;
}
