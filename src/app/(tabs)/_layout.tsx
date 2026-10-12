import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';

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
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
        tabBarLabelStyle: { fontFamily: fonts.sansMedium, fontSize: 12.5 },
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
