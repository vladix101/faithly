// Cron: sends the daily reminders that are due. Each run handles a small batch (free plan:
// 10 ms CPU and 50 outbound requests per invocation); the rest waits for the next minute.
import { vapid } from './api.ts';
import type { Env } from './env.ts';
import { DAILY_NOTICE, sendPush, type SendResult } from './push.ts';
import { localParts, nextSendAt } from './schedule.ts';

const MAX_ATTEMPTS = 3;
const CONCURRENCY = 3;
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

    // Claim the row before sending: only the run whose UPDATE matches the old next_send_at
    // proceeds, so overlapping cron runs cannot send the same day's reminder twice.
    const claim = await env.DB.prepare(
      `UPDATE subscriptions SET next_send_at = ?, last_sent_date = ?, attempts = 0, updated_at = ?
        WHERE id = ? AND next_send_at = ?`,
    )
      .bind(following, stale ? row.last_sent_date : day, now, row.id, row.next_send_at)
      .run();
    if (!claim.meta.changes) return;
    if (stale) {
      summary.skipped++;
      return;
    }

    let result: SendResult;
    try {
      ({ result } = await sendPush(row, DAILY_NOTICE, creds, TTL_SECONDS, fetchImpl));
    } catch (e) {
      console.error('push build failed', row.id, e instanceof Error ? e.message : e);
      result = 'rejected';
    }
    if (result === 'sent') summary.sent++;
    else if (result === 'gone') {
      summary.removed++;
      await env.DB.prepare('DELETE FROM subscriptions WHERE id = ?').bind(row.id).run();
    } else if (result === 'retry' && row.attempts + 1 < MAX_ATTEMPTS) {
      // Temporary error: give today's reminder back with a short backoff (2, 4 … minutes).
      summary.retried++;
      await env.DB.prepare(
        'UPDATE subscriptions SET next_send_at = ?, last_sent_date = ?, attempts = ?, updated_at = ? WHERE id = ? AND next_send_at = ?',
      )
        .bind(now + 120_000 * 2 ** row.attempts, row.last_sent_date, row.attempts + 1, now, row.id, following)
        .run();
    } else summary.failed++;
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
