// Native (Android) reminders: local notifications scheduled on the device.
// The web build uses reminder-settings.web.tsx (Web Push).
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { getPermission, openSystemSettings, requestPermission, sendTestNotification, type PermissionState } from '@/services/notifications';
import { DAILY_BODY, DAILY_TITLE } from '@/services/reminder-plan';
import { useApp } from '@/state/app';
import { radius, space } from '@/theme/tokens';

import { ReminderTimePicker } from './stepper';
import { Button, Row, T } from './ui';

export function ReminderSettings() {
  const { settings, update, colors, ui } = useApp();
  const [permission, setPermission] = useState<PermissionState | null>(null);
  const [testSent, setTestSent] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getPermission().then(setPermission);
    }, []),
  );

  /** Permission is requested when the user turns a reminder on, not at launch. */
  const enable = async (key: 'reminderEnabled' | 'feastReminders', on: boolean) => {
    if (on) {
      const p = await requestPermission();
      setPermission(p);
      if (p !== 'granted') return;
    }
    await update(key, on);
  };

  const sendTest = async () => {
    const p = await requestPermission();
    setPermission(p);
    if (p !== 'granted') return;
    await sendTestNotification(ui(DAILY_TITLE), ui(DAILY_BODY));
    setTestSent(true);
  };

  const toggle = (value: boolean, onChange: (v: boolean) => void, label: string) => (
    <Switch
      value={value}
      onValueChange={onChange}
      accessibilityLabel={label}
      trackColor={{ true: colors.gold, false: colors.line }}
      thumbColor={colors.surface}
    />
  );

  return (
    <>
      {permission === 'denied' ? (
        <View style={[styles.notice, { backgroundColor: colors.redSoft }]}>
          <T variant="body">{ui('Notifikacije su isključene u sistemskim podešavanjima, pa podsetnici ne mogu da stignu.')}</T>
          <Button label={ui('Otvori sistemska podešavanja')} icon="open-outline" kind="secondary" onPress={openSystemSettings} />
        </View>
      ) : null}
      <Row
        title={ui('Dnevni podsetnik')}
        subtitle={ui('Obaveštenje da je citat dana spreman')}
        right={toggle(settings.reminderEnabled, (v) => enable('reminderEnabled', v), ui('Dnevni podsetnik'))}
      />
      {settings.reminderEnabled ? (
        <ReminderTimePicker
          hour={settings.reminderHour}
          minute={settings.reminderMinute}
          onChange={(h, m) => {
            void update('reminderHour', h);
            void update('reminderMinute', m);
          }}
        />
      ) : null}
      <Row
        title={ui('Praznici i početak posta')}
        subtitle={ui('Veče pre crvenog slova i pre početka višednevnog posta')}
        right={toggle(settings.feastReminders, (v) => enable('feastReminders', v), ui('Podsetnici za praznike i post'))}
      />
      <View style={{ marginTop: space.m, gap: space.s }}>
        <Button
          label={ui(testSent ? 'Probna notifikacija je poslata' : 'Pošalji probnu notifikaciju')}
          icon="notifications-outline"
          kind="secondary"
          onPress={sendTest}
        />
        <T variant="caption" muted>
          {ui(
            'Android može da odloži isporuku nekoliko minuta radi uštede baterije. Podsetnici rade i kada je aplikacija zatvorena i ponovo se zakazuju posle restarta telefona.',
          )}
        </T>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  notice: { padding: space.l, borderRadius: radius.m, gap: space.m, marginBottom: space.m },
});
