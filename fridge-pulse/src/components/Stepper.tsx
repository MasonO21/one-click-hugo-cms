import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { radius, useTheme } from '../theme';
import { Text } from './Text';

interface Props {
  label: string;
  onDecrement: () => void;
  onIncrement: () => void;
  testID?: string;
}

export function Stepper({ label, onDecrement, onIncrement, testID }: Props) {
  const { c } = useTheme();
  const btn = (name: 'remove' | 'add', onPress: () => void, hint: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint}
      hitSlop={6}
      onPress={onPress}
      style={[styles.btn, { backgroundColor: c.surfaceAlt }]}
    >
      <Ionicons name={name} size={18} color={c.ink} />
    </Pressable>
  );
  return (
    <View testID={testID} style={styles.row}>
      {btn('remove', onDecrement, 'Decrease')}
      <Text variant="bodyStrong" style={styles.label}>
        {label}
      </Text>
      {btn('add', onIncrement, 'Increase')}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  btn: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  label: { minWidth: 96, textAlign: 'center' },
});
