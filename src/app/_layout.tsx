import { Alegreya_400Regular, Alegreya_400Regular_Italic, Alegreya_500Medium, Alegreya_700Bold } from '@expo-google-fonts/alegreya';
import { AlegreyaSans_400Regular, AlegreyaSans_500Medium, AlegreyaSans_700Bold } from '@expo-google-fonts/alegreya-sans';
import * as Notifications from 'expo-notifications';
import { router, Stack, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useFonts } from 'expo-font';
import { useCallback, useEffect } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { configureNotificationHandler } from '@/services/notifications';
import { useReminderSync } from '@/services/reminder-sync';
import { AppProvider, useApp } from '@/state/app';
import { fonts } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();
configureNotificationHandler();

/**
 * Tapping a reminder opens "Danas", which always shows today's quote. A cold start from a
 * notification already lands on "Danas" (the initial route), so only taps while running navigate.
 */
function useNotificationRouting() {
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const url = r.notification.request.content.data?.url;
      if (typeof url === 'string') router.navigate(url as '/');
    });
    return () => sub.remove();
  }, []);
}

function Navigation() {
  const { colors, dark, ui } = useApp();
  useReminderSync();
  useNotificationRouting();
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.bg).catch(() => undefined);
  }, [colors.bg]);

  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.ink,
          headerTitleStyle: { fontFamily: fonts.serifMedium, fontSize: 21 },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="book/[id]" options={{ title: '' }} />
        <Stack.Screen name="read/[book]/[chapter]" options={{ title: '' }} />
        <Stack.Screen name="search" options={{ title: ui('Pretraga Biblije') }} />
        <Stack.Screen name="prayer/[id]" options={{ title: '' }} />
        <Stack.Screen name="note/[book]/[chapter]/[verse]" options={{ title: ui('Beleška'), presentation: 'modal' }} />
        <Stack.Screen name="settings" options={{ title: ui('Podešavanja') }} />
        <Stack.Screen name="about" options={{ title: ui('O aplikaciji') }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Alegreya_400Regular,
    Alegreya_400Regular_Italic,
    Alegreya_500Medium,
    Alegreya_700Bold,
    AlegreyaSans_400Regular,
    AlegreyaSans_500Medium,
    AlegreyaSans_700Bold,
  });
  const onReady = useCallback(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  if (!fontsLoaded && !fontError) return null;
  return (
    <SafeAreaProvider>
      <AppProvider onReady={onReady}>
        <Navigation />
      </AppProvider>
    </SafeAreaProvider>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: '#F6F0E3', padding: 24, justifyContent: 'center', gap: 16 }}>
      <Text style={{ fontSize: 22, color: '#23201B' }}>Faithly nije mogao da se pokrene</Text>
      <Text style={{ fontSize: 16, color: '#6B6252' }}>{error.message}</Text>
      <Text onPress={retry} accessibilityRole="button" style={{ fontSize: 17, color: '#9A7531', paddingVertical: 12 }}>
        Pokušaj ponovo
      </Text>
    </View>
  );
}
