import { StyleSheet, View, type ViewProps } from 'react-native';
import { radius, useTheme } from '../theme';

export function Card({ style, ...rest }: ViewProps) {
  const { c } = useTheme();
  return <View {...rest} style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, style]} />;
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1, padding: 16 },
});
