import { StyleSheet, View, type ViewProps } from 'react-native';
import { glow as halo, radius, useTheme } from '../theme';

interface Props extends ViewProps {
  /** A neon outline that glows in the dark theme: electric blue, or magenta for emphasis. */
  glow?: 'blue' | 'magenta';
}

export function Card({ style, glow, ...rest }: Props) {
  const { c, scheme } = useTheme();
  const neon = glow === 'magenta' ? c.primaryFill : c.glow;
  return (
    <View
      {...rest}
      style={[
        styles.card,
        { backgroundColor: c.surface, borderColor: glow ? `${neon}${scheme === 'dark' ? 'B3' : '80'}` : c.border },
        glow && scheme === 'dark' ? halo(neon, 16, 0.28) : null,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1, padding: 16 },
});
