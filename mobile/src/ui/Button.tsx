import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { REPEAT_TAP_MS } from './useTapGuard';
import { tap } from './haptics';
import { MIN_TOUCH, radius, spacing, usePalette } from './theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';



interface Props {
  label: string;
  // Return the promise of async work: the button stays busy until it settles.
  onPress: () => void | Promise<unknown>;
  variant?: Variant;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, variant = 'primary', icon, loading, disabled, accessibilityHint, style }: Props) {
  const palette = usePalette();
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const lastTap = useRef(0);
  const inactive = disabled || loading || pending;

  function handlePress() {
    const now = Date.now();
    if (busy.current || now - lastTap.current < REPEAT_TAP_MS) return;
    lastTap.current = now;
    tap();
    const result = onPress();
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      busy.current = true;
      setPending(true);
      (result as Promise<unknown>)
        .catch(() => undefined)
        .finally(() => {
          busy.current = false;
          setPending(false);
        });
    }
  }

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
      accessibilityState={{ disabled: Boolean(inactive), busy: Boolean(loading || pending) }}
      disabled={inactive}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: colors.background, borderColor: colors.border, opacity: inactive ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      <View style={styles.content}>
        {loading || pending ? (
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
