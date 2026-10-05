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
        <AppText variant="small" tone={selected ? 'onPrimary' : 'textMuted'} style={styles.label}>
          {label}
        </AppText>
      ) : null}
      <AppText variant="caption" tone={selected ? 'onPrimary' : 'onHighlight'} style={styles.value}>
        {value}
      </AppText>
    </View>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={accessibilityLabel ?? (label ? `${label}: ${value}` : value)} style={styles.shrink}>
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
      style={styles.shrink}
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
    // Long place or route names wrap inside the chip instead of running off the card.
    maxWidth: '100%',
    flexShrink: 1,
  },
  shrink: { maxWidth: '100%', flexShrink: 1 },
  label: { flexShrink: 0 },
  value: { flexShrink: 1 },
});
