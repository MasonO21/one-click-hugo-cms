import { Text as RNText, StyleSheet, type TextProps, type TextStyle } from 'react-native';
import { brandFont, useTheme } from '../theme';

export type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'caption' | 'label';

const STYLES: Record<TextVariant, TextStyle> = {
  display: { fontSize: 38, lineHeight: 44, fontWeight: '800', letterSpacing: -0.8 },
  title: { fontSize: 27, lineHeight: 34, fontWeight: '800', letterSpacing: -0.5 },
  heading: { fontSize: 18, lineHeight: 25, fontWeight: '700', letterSpacing: -0.1 },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 23, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
};

/** Headlines and labels are set in Montserrat, everything else in Open Sans. */
const HEADING_VARIANTS = new Set<TextVariant>(['display', 'title', 'heading', 'label']);

interface Props extends TextProps {
  variant?: TextVariant;
  muted?: boolean;
  faint?: boolean;
  color?: string;
}

/** Emoji sized with a matching line height, so large glyphs do not overlap the text around them. */
export function Emoji({ size, children }: { size: number; children: string }) {
  return (
    <RNText accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ fontSize: size, lineHeight: Math.round(size * 1.25), textAlign: 'center' }}>
      {children}
    </RNText>
  );
}

export function Text({ variant = 'body', muted, faint, color, style, ...rest }: Props) {
  const { c } = useTheme();
  const tone = color ?? (faint ? c.inkFaint : muted ? c.inkMuted : c.ink);
  const flat = StyleSheet.flatten([STYLES[variant], style]);
  // Each weight is its own font family; the weight itself is then left to the family.
  const family = flat.fontFamily ?? brandFont(HEADING_VARIANTS.has(variant) ? 'heading' : 'body', flat.fontWeight);
  return <RNText {...rest} style={[{ color: tone }, flat, { fontFamily: family, fontWeight: 'normal' }]} />;
}
