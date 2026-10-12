// Web: when the app opens or returns to the foreground, tell the server about a new time zone,
// reminder time or rotated push endpoint. Scheduling itself happens on the server.
import { useEffect } from 'react';

import { useApp } from '@/state/app';
import { useWebDbs } from '@/web/dbs';
import { syncRegistration } from '@/web/push';

export function useReminderSync(): void {
  const { settings } = useApp();
  const { user } = useWebDbs();
  const { reminderEnabled, reminderHour, reminderMinute } = settings;

  useEffect(() => {
    if (!reminderEnabled || typeof document === 'undefined') return;
    const run = () => syncRegistration(user, reminderHour, reminderMinute).catch((e) => console.warn('Push sync failed', e));
    void run();
    const onVisible = () => document.visibilityState === 'visible' && void run();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user, reminderEnabled, reminderHour, reminderMinute]);
}
