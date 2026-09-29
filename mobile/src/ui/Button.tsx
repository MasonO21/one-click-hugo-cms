import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { tap } from './haptics';
import { MIN_TOUCH, radius, spacing, usePalette } from './theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, variant = 'primary', icon, loading, disabled, accessibilityHint, style }: Props) {
  const palette = usePalette();
  const inactive = disabled || loading;

  const colors = {
    primary: { background: palette.primary, foreground: palette.onPrimary, border: palette.primary },
    secondary: { background: palette.surface, foreground: palette.primary, border: palette.border },
    danger: { background: palette.surface, foreground: palette.danger, border: palette.danger },
    ghost: { background: 'transparent', foreground: palette.primary, border: 'transparent' },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: Boolean(inactive), busy: Boolean(loading) }}
      disabled={inactive}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: colors.background, borderColor: colors.border, opacity: inactive ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={colors.foreground} />
        ) : (
          icon && <Ionicons name={icon} size={20} color={colors.foreground} />
        )}
        <AppText variant="bodyBold" style={{ color: colors.foreground }}>
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH + 4,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
