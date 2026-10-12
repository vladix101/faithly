// Keeps scheduled reminders in line with settings, the calendar horizon and the time zone.
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getCalendarRange, getRedEvents } from '@/db/content';
import { addDays, localDateKey } from '@/lib/dates';
import { useApp, type Settings } from '@/state/app';

import { applyPlan } from './notifications';
import { HORIZON_DAYS, planReminders } from './reminder-plan';

export function currentTimeZone(): string {
  let zone = '';
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    zone = '';
  }
  return `${zone}|${new Date().getTimezoneOffset()}`;
}

export async function syncReminders(
  content: SQLiteDatabase,
  settings: Settings,
  c: (s: string) => string,
  ui: (s: string) => string,
): Promise<void> {
  const today = localDateKey();
  const from = addDays(today, -1);
  const to = addDays(today, HORIZON_DAYS);
  const needCalendar = settings.feastReminders;
  const [days, events] = needCalendar
    ? await Promise.all([getCalendarRange(content, from, to), getRedEvents(content, from, to)])
    : [[], []];
  const plan = planReminders(
    {
      dailyEnabled: settings.reminderEnabled,
      hour: settings.reminderHour,
      minute: settings.reminderMinute,
      feastsEnabled: settings.feastReminders,
    },
    today,
    new Date(),
    days,
    events,
    c,
    ui,
  );
  await applyPlan(plan);
}

/**
 * Re-syncs on launch, whenever reminder settings change, when the app returns to the
 * foreground on a new day (to extend the feast horizon) and after a time-zone change.
 */
export function useReminderSync(): void {
  const { content, settings, update, c, ui } = useApp();
  const lastDay = useRef('');
  const key = `${settings.reminderEnabled}|${settings.reminderHour}|${settings.reminderMinute}|${settings.feastReminders}|${settings.script}`;

  useEffect(() => {
    const run = () => {
      lastDay.current = localDateKey();
      syncReminders(content, settings, c, ui).catch((e) => console.warn('Reminder sync failed', e));
      const tz = currentTimeZone();
      if (tz !== settings.lastTimeZone) void update('lastTimeZone', tz);
    };
    run();
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (currentTimeZone() !== settings.lastTimeZone || lastDay.current !== localDateKey()) run();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, settings.lastTimeZone]);
}
