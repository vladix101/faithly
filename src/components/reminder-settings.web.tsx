// Web (PWA) reminders: real Web Push sent by the Faithly server, also when the app is closed.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useApp } from '@/state/app';
import { radius, space } from '@/theme/tokens';
import { useWebDbs } from '@/web/dbs';
import { getEnvironment, subscribe } from '@/web/pwa';
import { disableReminder, enableReminder, getRegistration, PushError, sendTest, syncRegistration } from '@/web/push';

import { InstallInstructions } from './install-instructions';
import { ReminderTimePicker } from './stepper';
import { Button, T } from './ui';

type Status = 'loading' | 'not-installed' | 'unsupported' | 'denied' | 'off' | 'active';

export function ReminderSettings() {
  const { settings, update, colors, ui } = useApp();
  const { user } = useWebDbs();
  const [status, setStatus] = useState<Status>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const env = getEnvironment();
    const reg = await getRegistration(user);
    if (env.ios && !env.standalone) return setStatus('not-installed');
    if (!env.pushSupported) return setStatus('unsupported');
    if (env.notificationPermission === 'denied') return setStatus('denied');
    // The stored server registration is the source of truth (it exists only while the reminder is on).
    setStatus(reg && env.notificationPermission === 'granted' ? 'active' : 'off');
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      return subscribe(() => void refresh());
    }, [refresh]),
  );

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      if (e instanceof PushError && e.message === 'denied') setStatus('denied');
      else setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  const turnOn = () =>
    run(async () => {
      await enableReminder(user, settings.reminderHour, settings.reminderMinute);
      await update('reminderEnabled', true);
      setNotice(ui('Podsetnik je uključen.'));
    });
  const turnOff = () =>
    run(async () => {
      await disableReminder(user);
      await update('reminderEnabled', false);
      setNotice(ui('Podsetnik je isključen i pretplata je obrisana sa servera.'));
    });
  const setTime = (hour: number, minute: number) =>
    run(async () => {
      await update('reminderHour', hour);
      await update('reminderMinute', minute);
      if (status === 'active') await syncRegistration(user, hour, minute);
    });
  const test = () =>
    run(async () => {
      await sendTest(user);
      setNotice(ui('Probna notifikacija je poslata. Treba da stigne za nekoliko sekundi.'));
    });

  return (
    <View style={{ gap: space.m }}>
      {status === 'not-installed' ? (
        <>
          <T variant="body">{ui('Na iPhone-u podsetnici rade samo kada je Faithly dodat na početni ekran (iOS 16.4 ili noviji).')}</T>
          <InstallInstructions />
        </>
      ) : null}
      {status === 'unsupported' ? (
        <T variant="body">
          {ui(
            'Ovaj pregledač ne podržava push notifikacije. Čitanje radi normalno; za podsetnike otvori Faithly u Chrome-u (Android) ili dodaj na početni ekran iz Safarija (iPhone).',
          )}
        </T>
      ) : null}
      {status === 'denied' ? (
        <View style={[styles.notice, { backgroundColor: colors.redSoft }]}>
          <T variant="body">
            {ui(
              'Notifikacije su odbijene. Uključi ih u podešavanjima telefona: iPhone – Podešavanja → Notifikacije → Faithly; Android – podešavanja sajta u Chrome-u → Notifikacije.',
            )}
          </T>
        </View>
      ) : null}

      {status === 'off' || status === 'active' ? (
        <>
          <T variant="body">{status === 'active' ? ui('Dnevni podsetnik je aktivan.') : ui('Dnevni podsetnik je isključen.')}</T>
          <ReminderTimePicker hour={settings.reminderHour} minute={settings.reminderMinute} onChange={setTime} />
          {status === 'active' ? (
            <View style={{ gap: space.s }}>
              <Button
                label={ui('Pošalji probnu notifikaciju')}
                icon="notifications-outline"
                kind="secondary"
                onPress={test}
                disabled={busy}
              />
              <Button label={ui('Isključi podsetnik')} icon="notifications-off-outline" kind="quiet" onPress={turnOff} disabled={busy} />
            </View>
          ) : (
            <Button label={ui('Uključi podsetnik')} icon="notifications-outline" onPress={turnOn} disabled={busy} />
          )}
        </>
      ) : null}

      {notice ? (
        <T variant="small" color={colors.gold}>
          {notice}
        </T>
      ) : null}
      {error ? (
        <View style={[styles.notice, { backgroundColor: colors.redSoft }]}>
          <T variant="body">
            {ui('Greška pri registraciji podsetnika:')} {error}
          </T>
        </View>
      ) : null}
      <T variant="caption" muted>
        {ui(
          'Podsetnik šalje Faithly server preko interneta, pa stiže i kada je aplikacija zatvorena, obično u roku od nekoliko minuta od izabranog vremena. Na server se šalju samo adresa za notifikacije, vreme i vremenska zona; beleške i omiljeni ostaju na telefonu.',
        )}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { padding: space.l, borderRadius: radius.m, gap: space.m },
});
