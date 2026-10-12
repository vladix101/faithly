// Local notifications: channel, permission, and idempotent (re)scheduling of reminders.
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import { isFaithlyReminder, type PlannedReminder } from './reminder-plan';

export const CHANNEL_ID = 'daily-reminder';

export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Podsetnici',
    description: 'Dnevni citat, praznici i početak posta',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export async function getPermission(): Promise<PermissionState> {
  const p = await Notifications.getPermissionsAsync();
  if (p.granted) return 'granted';
  return p.canAskAgain ? 'undetermined' : 'denied';
}

/** Asks only when the system still allows asking; otherwise reports "denied" so the UI can link to settings. */
export async function requestPermission(): Promise<PermissionState> {
  await ensureChannel(); // Android 13+ shows the prompt only after a channel exists
  const current = await getPermission();
  if (current !== 'undetermined') return current;
  const p = await Notifications.requestPermissionsAsync();
  if (p.granted) return 'granted';
  return p.canAskAgain ? 'undetermined' : 'denied';
}

export const openSystemSettings = () => Linking.openSettings();

/**
 * Makes the scheduled set equal to the plan: every Faithly reminder is cancelled first,
 * then the plan is scheduled with stable identifiers, so repeated calls never duplicate.
 * Notifications that are not Faithly's are left alone.
 */
export async function applyPlan(plan: PlannedReminder[]): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled.filter((n) => isFaithlyReminder(n.identifier)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
  if (!plan.length) return;
  if ((await getPermission()) !== 'granted') return;
  await ensureChannel();
  for (const r of plan) {
    await Notifications.scheduleNotificationAsync({
      identifier: r.id,
      content: { title: r.title, body: r.body, data: { url: '/' } },
      trigger:
        r.kind === 'daily'
          ? { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: r.hour, minute: r.minute, channelId: CHANNEL_ID }
          : { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.fireAt, channelId: CHANNEL_ID },
    });
  }
}

export async function sendTestNotification(title: string, body: string): Promise<void> {
  await ensureChannel();
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data: { url: '/' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2, channelId: CHANNEL_ID },
  });
}
