import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { FONT, glow, radius, useTheme } from '../theme';
import { PressableScale } from './motion';
import { Text } from './Text';

interface Props {
  label: string;
  onPress: () => void;
  /**
   * primary: glowing magenta. cta: the big orange "scan" button (always full size, with large
   * text so white on orange stays readable). secondary: neon outline. ghost and danger: text only.
   */
  variant?: 'primary' | 'cta' | 'secondary' | 'ghost' | 'danger';
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  size?: 'md' | 'sm';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Button({ label, onPress, variant = 'primary', icon, loading, disabled, size: requested = 'md', style, testID }: Props) {
  const { c, scheme } = useTheme();
  const size = variant === 'cta' ? 'md' : requested;
  const palette = {
    primary: { bg: c.primaryFill, pressed: c.primaryPressed, fg: c.onPrimary, border: c.primaryFill },
    cta: { bg: c.cta[1], pressed: c.cta[1], fg: c.onCta, border: 'transparent' },
    secondary: { bg: c.surface, pressed: c.surfaceAlt, fg: c.ink, border: scheme === 'dark' ? `${c.glow}99` : c.border },
    ghost: { bg: 'transparent', pressed: c.surfaceAlt, fg: c.primary, border: 'transparent' },
    danger: { bg: 'transparent', pressed: c.surfaceAlt, fg: c.danger, border: 'transparent' },
  }[variant];
  const off = disabled || loading;
  const halo =
    off || scheme !== 'dark'
      ? null
      : variant === 'primary'
        ? glow(c.primaryFill, 16, 0.5)
        : variant === 'cta'
          ? glow(c.cta[0], 22, 0.55)
          : variant === 'secondary'
            ? glow(c.glow, 10, 0.25)
            : null;

  return (
    <PressableScale
      testID={testID}
      containerStyle={style}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={() => {
        if (Platform.OS !== 'web') Haptics.impactAsync(variant === 'cta' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' ? styles.sm : variant === 'cta' ? styles.cta : styles.md,
        { backgroundColor: pressed ? palette.pressed : palette.bg, borderColor: palette.border, opacity: off ? 0.55 : 1 },
        halo,
        styles.fill,
      ]}
    >
      {({ pressed }) => (
        <>
          {variant === 'cta' ? (
            <LinearGradient
              colors={pressed ? [c.cta[1], c.cta[1]] : c.cta}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[StyleSheet.absoluteFill, { borderRadius: radius.lg }]}
            />
          ) : null}
          {loading ? (
            <ActivityIndicator color={palette.fg} />
          ) : (
            <>
              {icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : variant === 'cta' ? 22 : 20} color={palette.fg} /> : null}
              <Text
                variant="bodyStrong"
                color={palette.fg}
                style={
                  variant === 'cta'
                    ? styles.ctaLabel
                    : { fontFamily: FONT.headingBold, fontSize: size === 'sm' ? 14 : 16, letterSpacing: 0.2 }
                }
              >
                {label}
              </Text>
            </>
          )}
        </>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  // Fills the animated wrapper, which takes the caller's layout style (width, minHeight, alignSelf).
  fill: { flexGrow: 1 },
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: radius.md, overflow: 'visible' },
  md: { minHeight: 54, paddingHorizontal: 20 },
  sm: { minHeight: 44, paddingHorizontal: 14, borderRadius: radius.sm },
  cta: { minHeight: 60, paddingHorizontal: 22, borderRadius: radius.lg, borderWidth: 0 },
  // Large text (19pt bold) so white on the orange gradient meets WCAG AA for large text (3:1).
  ctaLabel: { fontFamily: FONT.headingBlack, fontSize: 19, lineHeight: 24, letterSpacing: 1, textTransform: 'uppercase' },
});
