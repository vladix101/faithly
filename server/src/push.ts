// Sends one Web Push message (RFC 8291 aes128gcm + RFC 8292 VAPID) with Web Crypto and fetch.
import { buildPushPayload } from '@block65/webcrypto-web-push';

export interface Vapid {
  subject: string;
  publicKey: string;
  privateKey: string;
}

export interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface Notice {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export const DAILY_NOTICE: Notice = {
  title: 'Faithly 🤍',
  body: 'Tvoj današnji biblijski citat je spreman.',
  url: '/',
  tag: 'faithly-daily',
};

/** The test push sent from the settings screen; the daily reminder falls back to it on a 400. */
export const TEST_NOTICE: Notice = { ...DAILY_NOTICE, tag: 'faithly-test' };
export const TEST_TTL_SECONDS = 300;

export type SendResult = 'sent' | 'gone' | 'retry' | 'rejected';

/**
 * - sent: accepted by the push service
 * - gone: 404/410, the subscription no longer exists and must be deleted
 * - retry: 429/5xx or a network error, worth a limited retry
 * - rejected: other 4xx (bad keys, payload…), retrying will not help
 */
export async function sendPush(
  sub: StoredSubscription,
  notice: Notice,
  vapid: Vapid,
  ttlSeconds: number,
  fetchImpl: typeof fetch = fetch,
): Promise<{ result: SendResult; status: number; reason?: string }> {
  const payload = await buildPushPayload(
    { data: { ...notice }, options: { ttl: ttlSeconds, urgency: 'normal', topic: notice.tag } },
    { endpoint: sub.endpoint, expirationTime: null, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    vapid,
  );
  let res: Response;
  try {
    res = await fetchImpl(sub.endpoint, payload as RequestInit);
  } catch {
    return { result: 'retry', status: 0 };
  }
  const status = res.status;
  if (status >= 200 && status < 300) {
    await res.body?.cancel().catch(() => undefined);
    return { result: 'sent', status };
  }
  // Push services explain refusals in the body, e.g. Apple {"reason":"BadWebPushTopic"}.
  const reason = (await res.text().catch(() => '')).slice(0, 200) || undefined;
  if (status === 404 || status === 410) return { result: 'gone', status, reason };
  if (status === 429 || status >= 500) return { result: 'retry', status, reason };
  return { result: 'rejected', status, reason };
}
