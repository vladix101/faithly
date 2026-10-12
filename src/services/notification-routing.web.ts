// Web: the service worker focuses an open Faithly window on notification click and asks it
// to show "Danas"; a closed app is opened at "/" directly by the worker.
import { router } from 'expo-router';
import { useEffect } from 'react';

export function setupNotifications(): void {
  // Nothing to configure: presentation is done by the service worker (public/sw.js).
}

export function useNotificationRouting(): void {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'faithly-navigate' && typeof e.data.url === 'string') router.navigate(e.data.url as '/');
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);
}
