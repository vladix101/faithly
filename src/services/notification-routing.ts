// Native: foreground presentation and tap handling for local notifications.
// The web build uses notification-routing.web.ts (service worker messages).
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';

import { configureNotificationHandler } from './notifications';

export function setupNotifications(): void {
  configureNotificationHandler();
}

/**
 * Tapping a reminder opens "Danas", which always shows today's quote. A cold start from a
 * notification already lands on "Danas" (the initial route), so only taps while running navigate.
 */
export function useNotificationRouting(): void {
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const url = r.notification.request.content.data?.url;
      if (typeof url === 'string') router.navigate(url as '/');
    });
    return () => sub.remove();
  }, []);
}
