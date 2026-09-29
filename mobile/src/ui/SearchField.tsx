import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fonts, MIN_TOUCH, radius, spacing, usePalette } from './theme';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
}

export function SearchField({ value, onChangeText, placeholder }: Props) {
  const palette = usePalette();
  return (
    <View style={[styles.wrap, { backgroundColor: palette.surfaceAlt, borderColor: palette.border }]}>
      <Ionicons name="search" size={20} color={palette.textMuted} />
      <TextInput
        accessibilityLabel={placeholder}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.textMuted}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="never"
        style={[styles.input, { color: palette.text, fontFamily: fonts.regular }]}
      />
      {value ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={12} onPress={() => onChangeText('')}>
          <Ionicons name="close-circle" size={22} color={palette.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  input: { flex: 1, fontSize: 17, minHeight: MIN_TOUCH },
});
