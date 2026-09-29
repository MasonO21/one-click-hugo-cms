import { useColorScheme } from 'react-native';

export interface Palette {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  onPrimary: string;
  highlight: string;
  onHighlight: string;
  danger: string;
  onDanger: string;
  overlay: string;
}

const light: Palette = {
  background: '#FBFDFB',
  surface: '#FFFFFF',
  surfaceAlt: '#F0F4F0',
  text: '#182620',
  textMuted: '#545C58',
  border: '#E2E8E2',
  primary: '#1F6B4F',
  onPrimary: '#FFFFFF',
  highlight: '#CEE8DA',
  onHighlight: '#1F6B4F',
  danger: '#B3261E',
  onDanger: '#FFFFFF',
  overlay: 'rgba(24, 38, 32, 0.4)',
};

const dark: Palette = {
  background: '#0F1A15',
  surface: '#16241D',
  surfaceAlt: '#1C2E25',
  text: '#E6EFE9',
  textMuted: '#9FB1A7',
  border: '#26382E',
  primary: '#5FBF95',
  onPrimary: '#0F1A15',
  highlight: '#1F3A2E',
  onHighlight: '#8FD9B6',
  danger: '#F2B8B5',
  onDanger: '#3A0B08',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 20, pill: 999 } as const;

export const fonts = {
  regular: 'NunitoSans_400Regular',
  bold: 'NunitoSans_700Bold',
} as const;

export type TextVariant = 'title' | 'heading' | 'body' | 'bodyBold' | 'small' | 'caption';

export const typeStyles: Record<TextVariant, { fontFamily: string; fontSize: number; lineHeight: number }> = {
  title: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 36 },
  heading: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 26 },
  body: { fontFamily: fonts.regular, fontSize: 17, lineHeight: 25 },
  bodyBold: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 25 },
  small: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21 },
  caption: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18 },
};

// Smallest comfortable size for anything tappable.
export const MIN_TOUCH = 48;
