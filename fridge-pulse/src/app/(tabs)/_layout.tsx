import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import { Platform } from 'react-native';
import { useShopping } from '../../store/shopping';
import { FONT, useTheme } from '../../theme';

type IconName = keyof typeof Ionicons.glyphMap;

const TABS: { name: string; title: string; icon: IconName; iconOn: IconName }[] = [
  { name: 'index', title: 'Pulse', icon: 'pulse-outline', iconOn: 'pulse' },
  { name: 'inventory', title: 'Items', icon: 'basket-outline', iconOn: 'basket' },
  { name: 'list', title: 'List', icon: 'cart-outline', iconOn: 'cart' },
  { name: 'meals', title: 'Meals', icon: 'restaurant-outline', iconOn: 'restaurant' },
  { name: 'settings', title: 'Settings', icon: 'settings-outline', iconOn: 'settings' },
];

export default function TabsLayout() {
  const { c, scheme } = useTheme();
  const toBuy = useShopping((s) => s.items.filter((i) => !i.checked).length);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.inkFaint,
        tabBarStyle: {
          backgroundColor: c.surface,
          // A thin neon line along the top in the dark theme.
          borderTopColor: scheme === 'dark' ? `${c.glow}66` : c.border,
          ...(scheme === 'dark' ? { boxShadow: `0px -6px 18px ${c.glow}22` } : null),
          ...(Platform.OS === 'web' ? { height: 78, paddingTop: 6, paddingBottom: 10 } : null),
        },
        tabBarLabelStyle: { fontSize: 11, lineHeight: 16, fontFamily: FONT.headingBold, letterSpacing: 0.3 },
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarButtonTestID: `tab-${t.name}`,
            tabBarAccessibilityLabel: t.name === 'list' && toBuy > 0 ? `${t.title}, ${toBuy} to buy` : t.title,
            tabBarBadge: t.name === 'list' && toBuy > 0 ? toBuy : undefined,
            tabBarBadgeStyle: { backgroundColor: c.primaryFill, color: c.onPrimary, fontSize: 11, fontFamily: FONT.bodyBold },
            tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? t.iconOn : t.icon} size={size} color={color} />,
          }}
        />
      ))}
    </Tabs>
  );
}
