import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ActivityIndicator, Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { radius, useTheme } from '../theme';
import { PressableScale } from './motion';
import { Text } from './Text';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  size?: 'md' | 'sm';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Button({ label, onPress, variant = 'primary', icon, loading, disabled, size = 'md', style, testID }: Props) {
  const { c } = useTheme();
  const palette = {
    primary: { bg: c.primary, pressed: c.primaryPressed, fg: c.onPrimary, border: 'transparent' },
    secondary: { bg: c.surface, pressed: c.surfaceAlt, fg: c.ink, border: c.border },
    ghost: { bg: 'transparent', pressed: c.surfaceAlt, fg: c.primary, border: 'transparent' },
    danger: { bg: 'transparent', pressed: c.surfaceAlt, fg: c.danger, border: 'transparent' },
  }[variant];
  const off = disabled || loading;

  return (
    <PressableScale
      testID={testID}
      containerStyle={style}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={() => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        { backgroundColor: pressed ? palette.pressed : palette.bg, borderColor: palette.border, opacity: off ? 0.55 : 1 },
        styles.fill,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 20} color={palette.fg} /> : null}
          <Text variant="bodyStrong" color={palette.fg} style={size === 'sm' ? { fontSize: 15 } : { fontSize: 17 }}>
            {label}
          </Text>
        </>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  // Fills the animated wrapper, which takes the caller's layout style (width, minHeight, alignSelf).
  fill: { flexGrow: 1 },
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: radius.md },
  md: { minHeight: 54, paddingHorizontal: 20 },
  sm: { minHeight: 44, paddingHorizontal: 14, borderRadius: radius.sm },
});
