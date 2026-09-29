import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { radius, spacing, usePalette } from './theme';

interface Props {
  label?: string;
  value: string;
  onPress?: () => void;
  selected?: boolean;
  accessibilityLabel?: string;
}

// A small tag such as "Weather  Rain 9°C". With onPress it acts as a button.
export function Chip({ label, value, onPress, selected, accessibilityLabel }: Props) {
  const palette = usePalette();
  const content = (
    <View
      style={[
        styles.chip,
        { backgroundColor: selected ? palette.primary : palette.highlight },
      ]}
    >
      {label ? (
        <AppText variant="small" tone={selected ? 'onPrimary' : 'textMuted'}>
          {label}
        </AppText>
      ) : null}
      <AppText variant="caption" tone={selected ? 'onPrimary' : 'onHighlight'}>
        {value}
      </AppText>
    </View>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={accessibilityLabel ?? (label ? `${label}: ${value}` : value)}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (label ? `${label}: ${value}` : value)}
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8 }}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
  },
});
