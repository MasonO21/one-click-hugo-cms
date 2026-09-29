import type { ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { usePalette } from './theme';

interface Props {
  children: ReactNode;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
}

export function Screen({ children, edges = ['bottom', 'left', 'right'], style }: Props) {
  const palette = usePalette();
  return (
    <SafeAreaView edges={edges} style={[styles.fill, { backgroundColor: palette.background }, style]}>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
