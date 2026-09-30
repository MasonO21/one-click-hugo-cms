import { useEffect, useId, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSnackbar } from '../store/snackbar';
import { useTheme } from '../theme';

interface Props {
  children: ReactNode;
  /** Wrap content in a ScrollView. */
  scroll?: boolean;
  /** Safe-area edges to pad. Tab screens leave the bottom to the tab bar. */
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  contentStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
}

/** Page container: themed background, safe areas, and a readable max width on wide screens. */
export function Screen({ children, scroll = true, edges = ['top'], contentStyle, footer }: Props) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  // A screen with a bottom button bar tells the message bar to sit above it, and forgets on the way out.
  const footerId = hash(useId());
  const hasFooter = !!footer;
  useEffect(() => {
    if (!hasFooter) return;
    return () => useSnackbar.getState().clearFooter(footerId);
  }, [hasFooter, footerId]);
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.content, contentStyle]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, styles.flex, contentStyle]}>{children}</View>
  );
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: c.bg }]} edges={edges}>
      <View style={[styles.flex, styles.center]}>{body}</View>
      {footer ? (
        <View
          onLayout={(e) => useSnackbar.getState().setFooter(footerId, e.nativeEvent.layout.height)}
          style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: c.bg, borderTopColor: c.border }]}
        >
          {footer}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  content: { padding: 20, paddingBottom: 32, gap: 16 },
  footer: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, width: '100%', alignItems: 'center' },
});
