import { useColorScheme } from 'react-native';
import type { Urgency } from '../lib/expiry';

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
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  primaryTint: string;
  hero: string;
  onHero: string;
  danger: string;
  freezer: string;
  urgency: Record<Urgency, UrgencyColors>;
}

export const lightPalette: Palette = {
  bg: '#F4F7F1',
  surface: '#FFFFFF',
  surfaceAlt: '#ECF1E8',
  border: '#DFE6DA',
  ink: '#14261B',
  inkMuted: '#56665C',
  inkFaint: '#65736A',
  primary: '#137A3B',
  primaryPressed: '#0F6B34',
  onPrimary: '#FFFFFF',
  primaryTint: '#E1F3E8',
  hero: '#12382A',
  onHero: '#FFFFFF',
  danger: '#C93B3B',
  freezer: '#2F7DB8',
  urgency: {
    expired: { solid: '#D64545', fg: '#A82323', tint: '#FCE7E5' },
    today: { solid: '#EE7A2B', fg: '#A5410C', tint: '#FDEBDC' },
    soon: { solid: '#E5A50A', fg: '#7D5700', tint: '#FFF2C9' },
    week: { solid: '#3AA0C0', fg: '#1A6580', tint: '#DFF0F6' },
    ok: { solid: '#2DB36B', fg: '#146B3C', tint: '#E1F3E8' },
  },
};

export const darkPalette: Palette = {
  bg: '#0D1410',
  surface: '#16201B',
  surfaceAlt: '#1D2A23',
  border: '#28372F',
  ink: '#EAF2EC',
  inkMuted: '#A3B3A9',
  inkFaint: '#8A9A90',
  primary: '#3BC97B',
  primaryPressed: '#2FAF69',
  onPrimary: '#052012',
  primaryTint: '#173626',
  hero: '#12382A',
  onHero: '#FFFFFF',
  danger: '#FF8A85',
  freezer: '#7FB8E6',
  urgency: {
    expired: { solid: '#F0605A', fg: '#FF9F99', tint: '#3A1D1B' },
    today: { solid: '#F58B45', fg: '#FFB984', tint: '#3B2415' },
    soon: { solid: '#EDB92B', fg: '#F5CE6B', tint: '#39300F' },
    week: { solid: '#52B6D4', fg: '#86D3E8', tint: '#14323B' },
    ok: { solid: '#3BC97B', fg: '#78E2A8', tint: '#17362A' },
  },
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;
export const radius = { sm: 10, md: 14, lg: 20, pill: 999 } as const;

export function useTheme() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return { c: scheme === 'dark' ? darkPalette : lightPalette, scheme } as const;
}
