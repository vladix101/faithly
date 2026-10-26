// Cron: sends the daily reminders and the feast/fast notices that are due. Each run handles a small batch (free plan:
// 10 ms CPU and 50 outbound requests per invocation); the rest waits for the next minute.
import { deleteSubscription, pushHost, vapid } from './api.ts';
import type { Env } from './env.ts';
import { DAILY_NOTICE, sendPush, TEST_NOTICE, TEST_TTL_SECONDS, type Notice, type SendResult, type StoredSubscription, type Vapid } from './push.ts';
import { ensureSchema } from './schema.ts';
import { localParts, nextSendAt } from './schedule.ts';

const MAX_ATTEMPTS = 3;
const CONCURRENCY = 3;
/** How long a claimed reminder waits before another run may retry it (a cut-off run never finishes). */
const LEASE_MS = 3 * 60_000;
/** A reminder that is this late (outage, long backlog) is skipped instead of arriving at night. */
const STALE_MS = 3 * 3_600_000;
/** Push services keep an undelivered reminder this long (phone offline), then drop it. */
const TTL_SECONDS = 6 * 3600;

interface DueRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  hour: number;
  minute: number;
  time_zone: string;
  next_send_at: number;
  last_sent_date: string | null;
  attempts: number;
}

export interface DispatchSummary {
  due: number;
  sent: number;
  skipped: number;
  removed: number;
  retried: number;
  failed: number;
}

export async function dispatchDue(env: Env, now = Date.now(), fetchImpl: typeof fetch = fetch): Promise<DispatchSummary> {
  const batch = Math.max(1, Math.min(20, Number(env.SEND_BATCH ?? 2) || 2));
  const { results } = await env.DB.prepare(
    `SELECT id, endpoint, p256dh, auth, hour, minute, time_zone, next_send_at, last_sent_date, attempts
       FROM subscriptions WHERE enabled = 1 AND next_send_at <= ? ORDER BY next_send_at LIMIT ?`,
  )
    .bind(now, batch)
    .all<DueRow>();
  const summary: DispatchSummary = { due: results.length, sent: 0, skipped: 0, removed: 0, retried: 0, failed: 0 };
  const creds = vapid(env);

  const handle = async (row: DueRow) => {
    // The local day this reminder belongs to (the scheduled instant, not "now").
    const day = localParts(row.next_send_at, row.time_zone).date;
    const following = nextSendAt(Math.max(now, row.next_send_at), row.hour, row.minute, row.time_zone, day);
    const stale = now - row.next_send_at > STALE_MS || row.last_sent_date === day;
    // Earlier runs claimed this reminder and never finished (e.g. stopped at the CPU limit).
    const exhausted = row.attempts >= MAX_ATTEMPTS;

    if (stale || exhausted) {
      const moved = await env.DB.prepare(
        `UPDATE subscriptions SET next_send_at = ?, last_sent_date = ?, attempts = 0, updated_at = ?
          WHERE id = ? AND next_send_at = ?`,
      )
        .bind(following, stale ? row.last_sent_date : day, now, row.id, row.next_send_at)
        .run();
      if (!moved.meta.changes) return;
      if (stale) summary.skipped++;
      else {
        summary.failed++;
        console.warn('push gave up after unfinished attempts', row.id);
      }
      return;
    }

    // Claim the row with a short lease before sending: only the run whose UPDATE matches the old
    // next_send_at proceeds, so overlapping cron runs cannot send the same reminder twice. The day
    // is marked as sent only after the push service accepted the message, so a run that is cut off
    // (CPU limit, restart) does not lose today's reminder: the lease expires and a later run retries.
    const lease = now + LEASE_MS;
    const claim = await env.DB.prepare(
      `UPDATE subscriptions SET next_send_at = ?, attempts = attempts + 1, updated_at = ?
        WHERE id = ? AND next_send_at = ?`,
    )
      .bind(lease, now, row.id, row.next_send_at)
      .run();
    if (!claim.meta.changes) return;

    const { result, status, reason } = await deliver(row, DAILY_NOTICE, creds, TTL_SECONDS, fetchImpl, row.id);
    const finish = (nextAt: number, lastSent: string | null, attempts: number) =>
      env.DB.prepare(
        'UPDATE subscriptions SET next_send_at = ?, last_sent_date = ?, attempts = ?, updated_at = ? WHERE id = ? AND next_send_at = ?',
      )
        .bind(nextAt, lastSent, attempts, now, row.id, lease)
        .run();

    if (result === 'sent') {
      summary.sent++;
      await finish(following, day, 0);
    } else if (result === 'gone') {
      summary.removed++;
      await deleteSubscription(env, row.id);
    } else if (result === 'retry' && row.attempts + 1 < MAX_ATTEMPTS) {
      // Temporary error: give today's reminder back with a short backoff (2, 4 … minutes).
      summary.retried++;
      console.warn('push retry', row.id, pushHost(row.endpoint), status, reason ?? '');
      await finish(now + 120_000 * 2 ** row.attempts, row.last_sent_date, row.attempts + 1);
    } else {
      summary.failed++;
      console.warn('push failed', row.id, pushHost(row.endpoint), result, status, reason ?? '');
      await finish(following, day, 0);
    }
  };

  for (let i = 0; i < results.length; i += CONCURRENCY) {
    await Promise.all(results.slice(i, i + CONCURRENCY).map(handle));
  }
  return summary;
}

/**
 * Sends one message. On a 400 the push service refused the reminder's headers: it is resent
 * exactly like the test push, which the same subscriptions accept.
 */
async function deliver(
  sub: StoredSubscription,
  notice: Notice,
  creds: Vapid,
  ttlSeconds: number,
  fetchImpl: typeof fetch,
  logId: string,
): Promise<{ result: SendResult; status: number; reason?: string }> {
  try {
    const first = await sendPush(sub, notice, creds, ttlSeconds, fetchImpl);
    if (first.result !== 'rejected' || first.status !== 400) return first;
    console.warn('push 400, resending as test push', logId, pushHost(sub.endpoint), first.reason ?? '');
    return await sendPush(sub, { ...notice, tag: TEST_NOTICE.tag }, creds, TEST_TTL_SECONDS, fetchImpl);
  } catch (e) {
    console.error('push build failed', logId, e instanceof Error ? e.message : e);
    return { result: 'rejected', status: 0 };
  }
}

interface NoticeRow extends StoredSubscription {
  subscription_id: string;
  tag: string;
  send_at: number;
  title: string;
  body: string;
  attempts: number;
}

/** Feast and fast notices (web/iPhone), stored by the app as one-off messages. Deleted once handled. */
export async function dispatchNotices(env: Env, now = Date.now(), fetchImpl: typeof fetch = fetch): Promise<DispatchSummary> {
  await ensureSchema(env);
  const batch = Math.max(1, Math.min(20, Number(env.SEND_BATCH ?? 2) || 2));
  const { results } = await env.DB.prepare(
    `SELECT n.subscription_id, n.tag, n.send_at, n.title, n.body, n.attempts, s.endpoint, s.p256dh, s.auth
       FROM notices n JOIN subscriptions s ON s.id = n.subscription_id
      WHERE n.send_at <= ? ORDER BY n.send_at LIMIT ?`,
  )
    .bind(now, batch)
    .all<NoticeRow>();
  const summary: DispatchSummary = { due: results.length, sent: 0, skipped: 0, removed: 0, retried: 0, failed: 0 };
  const creds = vapid(env);

  const handle = async (row: NoticeRow) => {
    const at = (sendAt: number) =>
      env.DB.prepare('DELETE FROM notices WHERE subscription_id = ? AND tag = ? AND send_at = ?').bind(row.subscription_id, row.tag, sendAt);
    if (now - row.send_at > STALE_MS || row.attempts >= MAX_ATTEMPTS) {
      if (!(await at(row.send_at).run()).meta.changes) return;
      if (row.attempts >= MAX_ATTEMPTS) {
        summary.failed++;
        console.warn('notice gave up after unfinished attempts', row.subscription_id, row.tag);
      } else summary.skipped++;
      return;
    }
    // Same lease as the daily reminder: a run cut off mid-send leaves the notice for a later run.
    const lease = now + LEASE_MS;
    const claim = await env.DB.prepare(
      'UPDATE notices SET send_at = ?, attempts = attempts + 1 WHERE subscription_id = ? AND tag = ? AND send_at = ?',
    )
      .bind(lease, row.subscription_id, row.tag, row.send_at)
      .run();
    if (!claim.meta.changes) return;

    const notice: Notice = { title: row.title, body: row.body, url: '/calendar', tag: row.tag };
    const { result, status, reason } = await deliver(row, notice, creds, TTL_SECONDS, fetchImpl, row.subscription_id);
    if (result === 'sent') {
      summary.sent++;
      await at(lease).run();
    } else if (result === 'gone') {
      summary.removed++;
      await deleteSubscription(env, row.subscription_id);
    } else if (result === 'retry' && row.attempts + 1 < MAX_ATTEMPTS) {
      summary.retried++;
      console.warn('notice retry', row.subscription_id, row.tag, pushHost(row.endpoint), status, reason ?? '');
      await env.DB.prepare('UPDATE notices SET send_at = ? WHERE subscription_id = ? AND tag = ? AND send_at = ?')
        .bind(now + 120_000 * 2 ** row.attempts, row.subscription_id, row.tag, lease)
        .run();
    } else {
      summary.failed++;
      console.warn('notice failed', row.subscription_id, row.tag, pushHost(row.endpoint), result, status, reason ?? '');
      await at(lease).run();
    }
  };

  for (let i = 0; i < results.length; i += CONCURRENCY) {
    await Promise.all(results.slice(i, i + CONCURRENCY).map(handle));
  }
  return summary;
}

/** Removes rate-limit windows older than a day (cheap housekeeping, once per hour). */
export async function cleanup(env: Env, now = Date.now()): Promise<void> {
  if (new Date(now).getUTCMinutes() !== 7) return;
  await env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?')
    .bind(now - 2 * 86_400_000)
    .run();
}
