import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { focusFirstHeading, focusLost } from '../lib/focus';
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
  /**
   * On the web, take focus (its heading) when it opens. Tab screens say 'if-lost': switching tabs
   * leaves focus on the tab, as tabs should, but arriving from a screen that closed (the paywall)
   * does not leave it on the page itself.
   */
  focusOnOpen?: boolean | 'if-lost';
}

/** The first screen of a visit does not take focus: the page has only just loaded. */
let opened = false;

/** Page container: themed background, safe areas, and a readable max width on wide screens. */
export function Screen({ children, scroll = true, edges = ['top'], contentStyle, footer, focusOnOpen = true }: Props) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const root = useRef<View>(null);
  useEffect(() => {
    const first = !opened;
    opened = true;
    if (!first && (focusOnOpen === true || (focusOnOpen === 'if-lost' && focusLost()))) focusFirstHeading(root.current);
    // Once, when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
      // On the web every scroll counts as a drag, and a phone browser scrolls to show the field you tap,
      // so dismissing on drag would close the keyboard as soon as you started typing.
      keyboardDismissMode={Platform.OS === 'web' ? 'none' : 'on-drag'}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, styles.flex, contentStyle]}>{children}</View>
  );
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: c.bg }]} edges={edges}>
      <View ref={root} style={[styles.flex, styles.center]}>
        {body}
      </View>
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
