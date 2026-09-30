import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { radius, useTheme } from '../theme';
import { Text } from './Text';

interface Props {
  label: string;
  onDecrement: () => void;
  onIncrement: () => void;
  testID?: string;
  /** Spoken names for the buttons, e.g. "One day earlier". */
  decrementLabel?: string;
  incrementLabel?: string;
}

export function Stepper({ label, onDecrement, onIncrement, testID, decrementLabel = 'Decrease', incrementLabel = 'Increase' }: Props) {
  const { c } = useTheme();
  const btn = (name: 'remove' | 'add', onPress: () => void, hint: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint}
      onPress={onPress}
      style={({ pressed }) => [styles.btn, { backgroundColor: pressed ? c.border : c.surfaceAlt }]}
    >
      <Ionicons name={name} size={18} color={c.ink} />
    </Pressable>
  );
  return (
    <View testID={testID} style={styles.row}>
      {btn('remove', onDecrement, decrementLabel)}
      <Text variant="bodyStrong" style={styles.label}>
        {label}
      </Text>
      {btn('add', onIncrement, incrementLabel)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  btn: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  label: { minWidth: 92, textAlign: 'center' },
});
