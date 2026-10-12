import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { IconName } from '@/components/ui';
import { useApp } from '@/state/app';
import { fonts } from '@/theme/tokens';

const TABS: { name: string; title: string; icon: IconName; iconActive: IconName }[] = [
  { name: 'index', title: 'Danas', icon: 'sunny-outline', iconActive: 'sunny' },
  { name: 'bible', title: 'Biblija', icon: 'book-outline', iconActive: 'book' },
  { name: 'calendar', title: 'Kalendar', icon: 'calendar-outline', iconActive: 'calendar' },
  { name: 'prayers', title: 'Molitve', icon: 'flame-outline', iconActive: 'flame' },
  { name: 'favorites', title: 'Omiljeni', icon: 'heart-outline', iconActive: 'heart' },
];

export default function TabsLayout() {
  const { colors, ui } = useApp();
  // Alegreya Sans needs more line height than the default tab label box, which clipped the
  // descenders (j, g); the bar also reserves the home-indicator inset (iPhone) / gesture bar (Android).
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          // tab item = icon (28) + label line (17) + item padding (10); the rest is breathing room
          height: 66 + insets.bottom,
          paddingTop: 4,
          paddingBottom: Math.max(insets.bottom, 6),
        },
        tabBarLabelStyle: { fontFamily: fonts.sansMedium, fontSize: 12.5, lineHeight: 17, flexShrink: 0 },
        tabBarLabelPosition: 'below-icon',
        tabBarAllowFontScaling: true,
        sceneStyle: { backgroundColor: colors.bg },
      }}>
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: ui(t.title),
            tabBarIcon: ({ color, focused, size }) => <Ionicons name={focused ? t.iconActive : t.icon} color={color} size={size} />,
          }}
        />
      ))}
    </Tabs>
  );
}
