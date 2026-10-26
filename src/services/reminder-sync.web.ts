// Web: when the app opens or returns to the foreground, tell the server about a new time zone,
// reminder time or rotated push endpoint, and send the feast/fast notices of the coming weeks.
// Scheduling and sending happen on the server.
import { useEffect } from 'react';

import { getCalendarRange, getRedEvents, type WebContentDb } from '@/db/content.web';
import type { UserDb } from '@/db/user.web';
import { addDays, localDateKey } from '@/lib/dates';
import { useApp } from '@/state/app';
import { useWebDbs } from '@/web/dbs';
import { syncNotices, syncRegistration, type WebNotice } from '@/web/push';

import { planReminders } from './reminder-plan';

/** The server keeps notices for this many days, so they arrive even if the app stays closed for weeks. */
const WEB_HORIZON_DAYS = 60;
const MAX_NOTICES = 40;

/** Feast/fast notices of the coming weeks, planned exactly like the Android reminders. */
export async function planWebNotices(
  content: WebContentDb,
  c: (s: string) => string,
  ui: (s: string) => string,
  now = new Date(),
): Promise<WebNotice[]> {
  const today = localDateKey(now);
  const from = addDays(today, -1);
  const to = addDays(today, WEB_HORIZON_DAYS);
  const [days, events] = await Promise.all([getCalendarRange(content, from, to), getRedEvents(content, from, to)]);
  const plan = planReminders(
    { dailyEnabled: false, hour: 0, minute: 0, feastsEnabled: true },
    today,
    now,
    days,
    events,
    c,
    ui,
    WEB_HORIZON_DAYS,
  );
  return plan
    .flatMap((p) => (p.kind === 'date' ? [{ tag: p.id, sendAt: p.fireAt.getTime(), title: p.title, body: p.body }] : []))
    .slice(0, MAX_NOTICES);
}

/** Brings the server in line with the reminder settings of this installation. */
export async function syncWebReminders(
  user: UserDb,
  content: WebContentDb,
  settings: { reminderEnabled: boolean; reminderHour: number; reminderMinute: number; feastReminders: boolean },
  c: (s: string) => string,
  ui: (s: string) => string,
): Promise<void> {
  const ok = await syncRegistration(user, settings.reminderHour, settings.reminderMinute, settings.reminderEnabled);
  if (!ok) return;
  await syncNotices(user, settings.feastReminders ? await planWebNotices(content, c, ui) : []);
}

export function useReminderSync(): void {
  const { settings, c, ui } = useApp();
  const { user, content } = useWebDbs();
  const { reminderEnabled, reminderHour, reminderMinute, feastReminders } = settings;

  useEffect(() => {
    if ((!reminderEnabled && !feastReminders) || typeof document === 'undefined') return;
    const run = () =>
      syncWebReminders(user, content, { reminderEnabled, reminderHour, reminderMinute, feastReminders }, c, ui).catch((e) =>
        console.warn('Push sync failed', e),
      );
    void run();
    const onVisible = () => document.visibilityState === 'visible' && void run();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user, content, reminderEnabled, reminderHour, reminderMinute, feastReminders, c, ui]);
}
