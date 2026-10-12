// Web Push client: subscribes this installation and talks to the Faithly Worker API.
// The server only receives the push endpoint/keys, the reminder time and the time zone.
import { getAllSettings, setSetting, type UserDb } from '@/db/user.web';

import { registerServiceWorker } from './pwa';

const REG_KEY = 'webPushRegistration';

export interface PushRegistration {
  id: string;
  /** Secret that authorizes changes to this subscription; never shown to the user */
  token: string;
  endpoint: string;
  hour: number;
  minute: number;
  timeZone: string;
}

export class PushError extends Error {}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

async function api<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
  } catch {
    throw new PushError('Nema veze sa serverom. Podsetnici zahtevaju internet.');
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new PushError(body.error ?? `Greška servera (${res.status})`);
  return body as T;
}

export async function getRegistration(user: UserDb): Promise<PushRegistration | null> {
  const raw = (await getAllSettings(user))[REG_KEY];
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PushRegistration;
  } catch {
    return null;
  }
}

const saveRegistration = (user: UserDb, r: PushRegistration | null) => setSetting(user, REG_KEY, r ? JSON.stringify(r) : '');

function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pushSubscription(createIfMissing: boolean): Promise<PushSubscription | null> {
  const reg = (await registerServiceWorker()) ?? (await navigator.serviceWorker.ready);
  if (!reg) throw new PushError('Service worker nije dostupan u ovom pregledaču.');
  const existing = await reg.pushManager.getSubscription();
  if (existing || !createIfMissing) return existing;
  const { vapidPublicKey } = await api<{ vapidPublicKey: string }>('/api/config');
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(vapidPublicKey) });
}

const subscriptionBody = (s: PushSubscription) => {
  const json = s.toJSON();
  return { endpoint: json.endpoint, keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth } };
};

/**
 * Must be called from a user gesture (button press): asks for notification permission,
 * subscribes, and registers or updates the reminder on the server.
 */
export async function enableReminder(user: UserDb, hour: number, minute: number): Promise<PushRegistration> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new PushError(permission === 'denied' ? 'denied' : 'Dozvola nije data.');
  const sub = await pushSubscription(true);
  if (!sub) throw new PushError('Pretplata na notifikacije nije uspela.');
  const timeZone = deviceTimeZone();
  const current = await getRegistration(user);
  if (current) {
    try {
      await api(`/api/subscriptions/${current.id}`, {
        method: 'PUT',
        token: current.token,
        body: JSON.stringify({ ...subscriptionBody(sub), hour, minute, timeZone, enabled: true }),
      });
      const updated = { ...current, endpoint: sub.endpoint, hour, minute, timeZone };
      await saveRegistration(user, updated);
      return updated;
    } catch (e) {
      if (!(e instanceof PushError) || !/nije pronađena/.test(e.message)) throw e;
      // The server forgot this installation (e.g. deleted after an expired endpoint): register again.
    }
  }
  const created = await api<{ id: string; token: string }>('/api/subscriptions', {
    method: 'POST',
    body: JSON.stringify({ ...subscriptionBody(sub), hour, minute, timeZone }),
  });
  const reg = { ...created, endpoint: sub.endpoint, hour, minute, timeZone };
  await saveRegistration(user, reg);
  return reg;
}

/** Turns the reminder off and deletes the subscription on the server and in the browser. */
export async function disableReminder(user: UserDb): Promise<void> {
  const current = await getRegistration(user);
  if (current) {
    await api(`/api/subscriptions/${current.id}`, { method: 'DELETE', token: current.token }).catch((e) => {
      if (!(e instanceof PushError) || !/nije pronađena/.test(e.message)) throw e;
    });
  }
  await saveRegistration(user, null);
  const sub = await pushSubscription(false).catch(() => null);
  await sub?.unsubscribe().catch(() => undefined);
}

export async function sendTest(user: UserDb): Promise<void> {
  const current = await getRegistration(user);
  if (!current) throw new PushError('Prvo uključi podsetnik.');
  await api(`/api/subscriptions/${current.id}/test`, { method: 'POST', token: current.token, body: '{}' });
}

/**
 * Keeps the server in sync when the app is opened: new time zone (travel, DST rules are the
 * server's job), changed reminder time, or a push endpoint the browser rotated.
 * Returns false when the browser no longer has a subscription (e.g. permission revoked).
 */
export async function syncRegistration(user: UserDb, hour: number, minute: number): Promise<boolean> {
  const current = await getRegistration(user);
  if (!current) return false;
  const sub = await pushSubscription(Notification.permission === 'granted');
  if (!sub) return false;
  const timeZone = deviceTimeZone();
  if (sub.endpoint === current.endpoint && timeZone === current.timeZone && hour === current.hour && minute === current.minute) return true;
  await api(`/api/subscriptions/${current.id}`, {
    method: 'PUT',
    token: current.token,
    body: JSON.stringify({ ...subscriptionBody(sub), hour, minute, timeZone, enabled: true }),
  });
  await saveRegistration(user, { ...current, endpoint: sub.endpoint, hour, minute, timeZone });
  return true;
}
