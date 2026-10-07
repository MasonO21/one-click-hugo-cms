import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { announce } from '../store/announcer';
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
  // After a press the new value is read out, so a screen reader user hears where it landed.
  const pressed = useRef(false);
  useEffect(() => {
    if (!pressed.current) return;
    pressed.current = false;
    announce(label);
  }, [label]);
  const btn = (name: 'remove' | 'add', onPress: () => void, hint: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint}
      onPress={() => {
        pressed.current = true;
        onPress();
      }}
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
