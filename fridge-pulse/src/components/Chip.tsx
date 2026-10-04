import { Pressable, StyleSheet } from 'react-native';
import { glow, radius, useTheme } from '../theme';
import { Text } from './Text';

interface Props {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  testID?: string;
}

export function Chip({ label, selected, onPress, testID }: Props) {
  const { c, scheme } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      hitSlop={{ top: 4, bottom: 4 }}
      style={[
        styles.chip,
        { backgroundColor: selected ? c.primaryFill : c.surface, borderColor: selected ? c.primaryFill : c.border },
        selected && scheme === 'dark' ? glow(c.primaryFill, 12, 0.45) : null,
      ]}
    >
      <Text variant="caption" color={selected ? c.onPrimary : c.ink} style={{ fontWeight: '600', fontSize: 14 }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1 },
});
