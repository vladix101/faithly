// Web (PWA) reminders: real Web Push sent by the Faithly server, also when the app is closed.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { planWebNotices } from '@/services/reminder-sync.web';
import { useApp } from '@/state/app';
import { radius, space } from '@/theme/tokens';
import { useWebDbs } from '@/web/dbs';
import { getEnvironment, subscribe } from '@/web/pwa';
import { disableReminder, enableReminder, getRegistration, PushError, sendTest, syncNotices, syncRegistration } from '@/web/push';

import { InstallInstructions } from './install-instructions';
import { ReminderTimePicker } from './stepper';
import { Button, Row, T } from './ui';

type Status = 'loading' | 'not-installed' | 'unsupported' | 'denied' | 'ready';

export function ReminderSettings() {
  const { settings, update, colors, ui, c } = useApp();
  const { user, content } = useWebDbs();
  const [status, setStatus] = useState<Status>('loading');
  const [registered, setRegistered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const env = getEnvironment();
    const reg = await getRegistration(user);
    // The stored server registration is the source of truth (it exists only while a reminder is on).
    setRegistered(!!reg && env.notificationPermission === 'granted');
    if (env.ios && !env.standalone) return setStatus('not-installed');
    if (!env.pushSupported) return setStatus('unsupported');
    if (env.notificationPermission === 'denied') return setStatus('denied');
    setStatus('ready');
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      return subscribe(() => void refresh());
    }, [refresh]),
  );

  const dailyOn = registered && settings.reminderEnabled;
  const feastsOn = registered && settings.feastReminders;
  const { reminderHour: hour, reminderMinute: minute } = settings;

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

  const feastNotices = () => planWebNotices(content, c, ui);

  // Daily reminder and feast/fast notices share one push subscription; it is deleted from the
  // server only when both are off.
  const setDaily = (on: boolean) =>
    run(async () => {
      if (on) {
        await enableReminder(user, hour, minute, true);
        if (feastsOn) await syncNotices(user, await feastNotices());
        else if (settings.feastReminders) await update('feastReminders', false); // stale flag without a subscription
      } else if (feastsOn) await syncRegistration(user, hour, minute, false);
      else await disableReminder(user);
      await update('reminderEnabled', on);
      setNotice(on ? ui('Dnevni podsetnik je uključen.') : ui('Dnevni podsetnik je isključen.'));
    });
  const setFeasts = (on: boolean) =>
    run(async () => {
      if (on) {
        if (!registered) {
          await enableReminder(user, hour, minute, false);
          if (settings.reminderEnabled) await update('reminderEnabled', false); // stale flag without a subscription
        }
        await syncNotices(user, await feastNotices());
      } else if (dailyOn) await syncNotices(user, []);
      else await disableReminder(user);
      await update('feastReminders', on);
      setNotice(on ? ui('Podsetnici za praznike i post su uključeni.') : ui('Podsetnici za praznike i post su isključeni.'));
    });
  const setTime = (h: number, m: number) =>
    run(async () => {
      await update('reminderHour', h);
      await update('reminderMinute', m);
      if (dailyOn) await syncRegistration(user, h, m, true);
    });
  const test = () =>
    run(async () => {
      await sendTest(user);
      setNotice(ui('Probna notifikacija je poslata. Treba da stigne za nekoliko sekundi.'));
    });

  const toggle = (value: boolean, onChange: (v: boolean) => void, label: string) => (
    <Switch
      value={value}
      onValueChange={onChange}
      disabled={busy}
      accessibilityLabel={label}
      trackColor={{ true: colors.gold, false: colors.line }}
      thumbColor={colors.surface}
    />
  );

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

      {status === 'ready' ? (
        <>
          <Row
            title={ui('Dnevni podsetnik')}
            subtitle={ui('Obaveštenje da je citat dana spreman')}
            right={toggle(dailyOn, setDaily, ui('Dnevni podsetnik'))}
          />
          {dailyOn ? <ReminderTimePicker hour={hour} minute={minute} onChange={setTime} /> : null}
          <Row
            title={ui('Praznici i početak posta')}
            subtitle={ui('Veče pre crvenog slova i pre početka višednevnog posta')}
            right={toggle(feastsOn, setFeasts, ui('Podsetnici za praznike i post'))}
          />
          {registered ? (
            <Button label={ui('Pošalji probnu notifikaciju')} icon="notifications-outline" kind="secondary" onPress={test} disabled={busy} />
          ) : null}
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
          'Podsetnike šalje Faithly server preko interneta, pa stižu i kada je aplikacija zatvorena, obično u roku od nekoliko minuta od zakazanog vremena. Na server se šalju samo adresa za notifikacije, vreme, vremenska zona i tekstovi narednih podsetnika za praznike i post; beleške i omiljeni ostaju na telefonu.',
        )}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { padding: space.l, borderRadius: radius.m, gap: space.m },
});
