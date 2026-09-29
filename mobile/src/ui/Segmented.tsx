import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { MIN_TOUCH, radius, spacing, usePalette } from './theme';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({ label, options, value, onChange }: Props<T>) {
  const palette = usePalette();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.row, { borderColor: palette.border }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.option, { backgroundColor: selected ? palette.primary : palette.surface }]}
          >
            <AppText variant="bodyBold" tone={selected ? 'onPrimary' : 'text'}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', borderWidth: 1.5, borderRadius: radius.md, overflow: 'hidden' },
  option: { flex: 1, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
});
