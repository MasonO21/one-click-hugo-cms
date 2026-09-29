import { Text, type TextProps } from 'react-native';
import { typeStyles, usePalette, type Palette, type TextVariant } from './theme';

export type TextTone = keyof Pick<Palette, 'text' | 'textMuted' | 'primary' | 'danger' | 'onPrimary' | 'onHighlight'>;

interface Props extends TextProps {
  variant?: TextVariant;
  tone?: TextTone;
}

export function AppText({ variant = 'body', tone = 'text', style, ...rest }: Props) {
  const palette = usePalette();
  return <Text {...rest} style={[typeStyles[variant], { color: palette[tone] }, style]} />;
}
