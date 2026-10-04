import { StyleSheet } from 'react-native';
import { FONT, useTheme } from '../theme';
import { Text } from './Text';

interface Props {
  /** Font size; the wordmark is only used at 24 and up (large text). */
  size?: number;
  /** Centre it (onboarding, paywall). */
  center?: boolean;
}

/** "Fridge Pulse" in the brand's two neon colours, glowing in the dark theme. */
export function Wordmark({ size = 26, center }: Props) {
  const { c, scheme } = useTheme();
  const halo = (color: string) =>
    scheme === 'dark' ? { textShadowColor: `${color}AA`, textShadowRadius: Math.round(size * 0.45), textShadowOffset: { width: 0, height: 0 } } : null;
  return (
    <Text
      accessibilityRole="header"
      accessibilityLabel="Fridge Pulse"
      variant="title"
      style={[styles.word, { fontSize: size, lineHeight: Math.round(size * 1.22) }, center && { textAlign: 'center' }]}
    >
      <Text variant="title" color={c.wordFridge} style={[styles.word, { fontSize: size }, halo(c.wordFridge)]}>
        Fridge
      </Text>{' '}
      <Text variant="title" color={c.wordPulse} style={[styles.word, { fontSize: size }, halo(c.wordPulse)]}>
        Pulse
      </Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  word: { fontFamily: FONT.headingBlack, letterSpacing: -0.4 },
});
