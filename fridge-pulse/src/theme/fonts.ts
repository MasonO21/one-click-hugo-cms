import type { TextStyle } from 'react-native';

/**
 * Brand typefaces: Montserrat for headlines, labels and buttons; Open Sans for reading text.
 * Each weight is its own family name (that is how custom fonts load in React Native), so pick
 * the family with `brandFont` rather than setting `fontWeight`.
 */
export const FONT = {
  headingBold: 'Montserrat_700Bold',
  headingBlack: 'Montserrat_800ExtraBold',
  body: 'OpenSans_400Regular',
  bodySemiBold: 'OpenSans_600SemiBold',
  bodyBold: 'OpenSans_700Bold',
} as const;

export type FontName = (typeof FONT)[keyof typeof FONT];

function weightOf(w: TextStyle['fontWeight']): number {
  if (w === undefined || w === 'normal') return 400;
  if (w === 'bold') return 700;
  const n = typeof w === 'number' ? w : Number.parseInt(w, 10);
  return Number.isFinite(n) ? n : 400;
}

/** The brand family for a style: `heading` (Montserrat) or `body` (Open Sans) at the nearest weight. */
export function brandFont(kind: 'heading' | 'body', weight?: TextStyle['fontWeight']): FontName {
  const w = weightOf(weight);
  if (kind === 'heading') return w >= 800 ? FONT.headingBlack : FONT.headingBold;
  if (w >= 700) return FONT.bodyBold;
  if (w >= 600) return FONT.bodySemiBold;
  return FONT.body;
}
