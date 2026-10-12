// Registers the service worker and shows "Dostupna je nova verzija" when an update is waiting.
// The update is applied only when the user taps it, so a page never reloads mid-reading.
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/state/app';
import { radius, space } from '@/theme/tokens';
import { applyUpdate, registerServiceWorker, subscribe, updateAvailable } from '@/web/pwa';

import { Button, T } from './ui';

export function PwaShell() {
  const { colors, ui } = useApp();
  const insets = useSafeAreaInsets();
  const [hasUpdate, setHasUpdate] = useState(false);

  useEffect(() => {
    void registerServiceWorker();
    return subscribe(() => setHasUpdate(updateAvailable()));
  }, []);

  if (!hasUpdate) return null;
  return (
    <View
      accessibilityRole="alert"
      style={{
        position: 'absolute',
        left: space.l,
        right: space.l,
        bottom: insets.bottom + 72,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.m,
        padding: space.m,
        paddingLeft: space.l,
        borderRadius: radius.m,
        backgroundColor: colors.ink,
      }}>
      <T variant="label" color={colors.bg} style={{ flex: 1 }}>
        {ui('Dostupna je nova verzija.')}
      </T>
      <Button label={ui('Osveži')} onPress={applyUpdate} />
    </View>
  );
}
