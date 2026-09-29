import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { useTheme } from '../theme';

export type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'caption' | 'label';

const STYLES: Record<TextVariant, TextStyle> = {
  display: { fontSize: 40, lineHeight: 44, fontWeight: '800', letterSpacing: -1 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.6 },
  heading: { fontSize: 19, lineHeight: 25, fontWeight: '700', letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 23, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
};

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
  return <RNText {...rest} style={[STYLES[variant], { color: tone }, style]} />;
}
