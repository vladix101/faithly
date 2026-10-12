import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { Button, IconButton, Row, Screen, Segmented, SectionTitle, T } from '@/components/ui';
import { getPermission, openSystemSettings, requestPermission, sendTestNotification, type PermissionState } from '@/services/notifications';
import { DAILY_BODY, DAILY_TITLE } from '@/services/reminder-plan';
import { useApp, type Script, type ThemePref } from '@/state/app';
import { radius, space } from '@/theme/tokens';

const pad = (n: number) => String(n).padStart(2, '0');

function Stepper({
  label,
  value,
  onMinus,
  onPlus,
  minusLabel,
  plusLabel,
}: {
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
  minusLabel: string;
  plusLabel: string;
}) {
  const { colors } = useApp();
  return (
    <View style={[styles.stepper, { backgroundColor: colors.surface, borderColor: colors.line }]} accessible={false}>
      <IconButton icon="remove" label={minusLabel} onPress={onMinus} />
      <View style={{ alignItems: 'center', minWidth: 64 }} accessible accessibilityLabel={`${label}: ${value}`}>
        <T variant="title" style={{ fontVariant: ['tabular-nums'] }}>
          {value}
        </T>
        <T variant="caption" muted>
          {label}
        </T>
      </View>
      <IconButton icon="add" label={plusLabel} onPress={onPlus} />
    </View>
  );
}

export default function SettingsScreen() {
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

  const setTime = (hour: number, minute: number) => {
    void update('reminderHour', (hour + 24) % 24);
    void update('reminderMinute', (minute + 60) % 60);
  };

  const sendTest = async () => {
    const p = await requestPermission();
    setPermission(p);
    if (p !== 'granted') return;
    await sendTestNotification(ui(DAILY_TITLE), ui(DAILY_BODY));
    setTestSent(true);
  };

  return (
    <Screen edges={['bottom']}>
      <SectionTitle style={{ marginTop: space.s }}>{ui('Pismo')}</SectionTitle>
      <Segmented<Script>
        value={settings.script}
        onChange={(v) => update('script', v)}
        options={[
          { value: 'lat', label: 'Latinica' },
          { value: 'cyr', label: 'Ћирилица' },
        ]}
      />
      <T variant="caption" muted style={{ marginTop: space.s }}>
        {ui('Tekst Biblije se čuva u originalu (ćirilica) i preslovljava samo pri prikazu.')}
      </T>

      <SectionTitle>{ui('Tema')}</SectionTitle>
      <Segmented<ThemePref>
        value={settings.theme}
        onChange={(v) => update('theme', v)}
        options={[
          { value: 'system', label: ui('Sistemska') },
          { value: 'light', label: ui('Svetla') },
          { value: 'dark', label: ui('Tamna') },
        ]}
      />

      <SectionTitle>{ui('Veličina teksta za čitanje')}</SectionTitle>
      <Stepper
        label={ui('veličina')}
        value={`${Math.round(settings.readingScale * 100)}%`}
        minusLabel={ui('Smanji tekst')}
        plusLabel={ui('Povećaj tekst')}
        onMinus={() => update('readingScale', Math.max(0.8, Math.round((settings.readingScale - 0.1) * 10) / 10))}
        onPlus={() => update('readingScale', Math.min(1.8, Math.round((settings.readingScale + 0.1) * 10) / 10))}
      />
      <T variant="caption" muted style={{ marginTop: space.s }}>
        {ui('Aplikacija prati i sistemsko povećanje teksta.')}
      </T>

      <SectionTitle>{ui('Podsetnici')}</SectionTitle>
      {permission === 'denied' ? (
        <View style={[styles.notice, { backgroundColor: colors.redSoft }]}>
          <T variant="body">{ui('Notifikacije su isključene u sistemskim podešavanjima, pa podsetnici ne mogu da stignu.')}</T>
          <Button label={ui('Otvori sistemska podešavanja')} icon="open-outline" kind="secondary" onPress={openSystemSettings} />
        </View>
      ) : null}
      <Row
        title={ui('Dnevni podsetnik')}
        subtitle={ui('Obaveštenje da je citat dana spreman')}
        right={
          <Switch
            value={settings.reminderEnabled}
            onValueChange={(v) => enable('reminderEnabled', v)}
            accessibilityLabel={ui('Dnevni podsetnik')}
            trackColor={{ true: colors.gold, false: colors.line }}
            thumbColor={colors.surface}
          />
        }
      />
      {settings.reminderEnabled ? (
        <View style={styles.timeRow}>
          <Stepper
            label={ui('sat')}
            value={pad(settings.reminderHour)}
            minusLabel={ui('Sat ranije')}
            plusLabel={ui('Sat kasnije')}
            onMinus={() => setTime(settings.reminderHour - 1, settings.reminderMinute)}
            onPlus={() => setTime(settings.reminderHour + 1, settings.reminderMinute)}
          />
          <Stepper
            label={ui('minut')}
            value={pad(settings.reminderMinute)}
            minusLabel={ui('Pet minuta ranije')}
            plusLabel={ui('Pet minuta kasnije')}
            onMinus={() =>
              setTime(
                settings.reminderHour,
                settings.reminderMinute % 5 ? settings.reminderMinute - (settings.reminderMinute % 5) : settings.reminderMinute - 5,
              )
            }
            onPlus={() => setTime(settings.reminderHour, settings.reminderMinute + 5 - (settings.reminderMinute % 5))}
          />
        </View>
      ) : null}
      <Row
        title={ui('Praznici i početak posta')}
        subtitle={ui('Veče pre crvenog slova i pre početka višednevnog posta')}
        right={
          <Switch
            value={settings.feastReminders}
            onValueChange={(v) => enable('feastReminders', v)}
            accessibilityLabel={ui('Podsetnici za praznike i post')}
            trackColor={{ true: colors.gold, false: colors.line }}
            thumbColor={colors.surface}
          />
        }
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

      <SectionTitle>{ui('Više')}</SectionTitle>
      <Row icon="information-circle-outline" title={ui('O aplikaciji i izvorima')} onPress={() => router.push('/about')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.m,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.xs,
    flex: 1,
  },
  timeRow: { flexDirection: 'row', gap: space.m, marginVertical: space.m },
  notice: { padding: space.l, borderRadius: radius.m, gap: space.m, marginBottom: space.m },
});
