import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { useTheme } from '../theme';

export function Logo({ size = 56 }: { size?: number }) {
  const { c } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name="pulse" size={size * 0.6} color={c.onPrimary} />
    </View>
  );
}
