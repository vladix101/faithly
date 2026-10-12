// PWA runtime helpers (web build only): service worker lifecycle, install prompt and
// environment detection. Capabilities are detected, not inferred from the browser name;
// the user agent is only used to choose which install instructions to show.

type Listener = () => void;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l());

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

// ---------- service worker ----------
let waiting: ServiceWorker | null = null;
let registered: Promise<ServiceWorkerRegistration | null> | null = null;

export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (registered) return registered;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return (registered = Promise.resolve(null));
  registered = navigator.serviceWorker
    .register('/sw.js', { scope: '/', updateViaCache: 'none' })
    .then((reg) => {
      const track = (sw: ServiceWorker | null) => {
        if (!sw) return;
        const check = () => {
          // A new version is installed and an old one still controls the page.
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            waiting = sw;
            emit();
          }
        };
        sw.addEventListener('statechange', check);
        check();
      };
      track(reg.waiting);
      reg.addEventListener('updatefound', () => track(reg.installing));
      // Look for updates when the app comes back to the foreground.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => undefined);
      });
      return reg;
    })
    .catch((e) => {
      console.warn('Service worker registration failed', e);
      return null;
    });
  let reloading = false;
  navigator.serviceWorker?.addEventListener('controllerchange', () => {
    if (reloading || !waiting) return;
    reloading = true;
    window.location.reload();
  });
  return registered;
}

export const updateAvailable = () => waiting !== null;

/** Activates the waiting version; the page reloads once it takes control. */
export function applyUpdate(): void {
  waiting?.postMessage({ type: 'SKIP_WAITING' });
}

// ---------- install ----------
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
let installEvent: BeforeInstallPromptEvent | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // show our own button instead of the mini-infobar
    installEvent = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    emit();
  });
}

export const canPromptInstall = () => installEvent !== null;

export async function promptInstall(): Promise<boolean> {
  if (!installEvent) return false;
  const e = installEvent;
  installEvent = null;
  await e.prompt();
  const choice = await e.userChoice;
  emit();
  return choice.outcome === 'accepted';
}

// ---------- environment ----------
export interface WebEnvironment {
  /** Running from the home screen (no browser toolbar) */
  standalone: boolean;
  /** iPhone/iPad (including iPadOS that reports itself as a Mac) */
  ios: boolean;
  /** iOS browser other than Safari (Chrome, Firefox, Edge…) */
  iosOtherBrowser: boolean;
  /** Service worker + Push API + Notifications API present in this context */
  pushSupported: boolean;
  notificationPermission: NotificationPermission | 'unsupported';
}

export function getEnvironment(): WebEnvironment {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const ua = nav?.userAgent ?? '';
  const ios = /iPhone|iPad|iPod/.test(ua) || (nav?.platform === 'MacIntel' && (nav?.maxTouchPoints ?? 0) > 1);
  const standalone =
    (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) ||
    (nav as (Navigator & { standalone?: boolean }) | undefined)?.standalone === true;
  const pushSupported =
    !!nav && 'serviceWorker' in nav && typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window;
  return {
    standalone,
    ios,
    iosOtherBrowser: ios && /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua),
    pushSupported,
    notificationPermission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
  };
}
