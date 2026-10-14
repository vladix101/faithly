import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { handleApi } from '../src/api.ts';
import { dispatchDue } from '../src/dispatch.ts';
import type { Env } from '../src/env.ts';
import { createD1 } from './d1-shim.ts';
import { browserSubscription, decryptPush, fakePushService, vapidKeys } from './helpers.ts';

const ORIGIN = 'https://faithly.example.workers.dev';
let env: Env;
let raw: ReturnType<typeof createD1>['raw'];

beforeEach(async () => {
  const d1 = createD1();
  raw = d1.raw;
  const keys = await vapidKeys();
  env = {
    DB: d1.DB,
    ASSETS: {} as Fetcher,
    VAPID_PUBLIC_KEY: keys.publicKey,
    VAPID_PRIVATE_KEY: keys.privateKey,
    VAPID_SUBJECT: 'https://github.com/vladix101/faithly',
    SEND_BATCH: '5',
  };
});

const call = (
  method: string,
  path: string,
  body?: unknown,
  opts: { token?: string; ip?: string; origin?: string | null; now?: number } = {},
) =>
  handleApi(
    new Request(ORIGIN + path, {
      method,
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': opts.ip ?? '203.0.113.7',
        ...(opts.origin !== null ? { origin: opts.origin ?? ORIGIN } : {}),
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    }),
    env,
    opts.now ?? Date.parse('2026-10-12T05:00:00Z'),
  );

async function register(endpoint = 'https://fcm.googleapis.com/fcm/send/abc123', hour = 9) {
  const sub = await browserSubscription(endpoint);
  const res = await call('POST', '/api/subscriptions', { endpoint, keys: sub.keys, hour, minute: 0, timeZone: 'Europe/Belgrade' });
  assert.equal(res.status, 201);
  return { sub, ...((await res.json()) as { id: string; token: string }) };
}

test('health and config endpoints', async () => {
  const h = (await (await call('GET', '/api/health')).json()) as Record<string, unknown>;
  assert.equal(h.ok, true);
  assert.equal(h.db, 'ok');
  assert.equal(h.vapid, true);
  assert.equal(((await (await call('GET', '/api/config')).json()) as { vapidPublicKey: string }).vapidPublicKey, env.VAPID_PUBLIC_KEY);
});

test('registration stores only what reminders need, with a hashed token', async () => {
  const { id, token } = await register();
  const row = raw.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id) as Record<string, unknown>;
  assert.notEqual(row.token_hash, token);
  assert.equal(row.time_zone, 'Europe/Belgrade');
  assert.equal(new Date(Number(row.next_send_at)).toISOString(), '2026-10-12T07:00:00.000Z'); // 09:00 CEST
  assert.deepEqual(Object.keys(row).sort(), [
    'attempts',
    'auth',
    'created_at',
    'enabled',
    'endpoint',
    'hour',
    'id',
    'last_sent_date',
    'last_test_at',
    'minute',
    'next_send_at',
    'p256dh',
    'time_zone',
    'token_hash',
    'updated_at',
  ]);
});

test('changes require the secret token; the id alone is not enough', async () => {
  const { id, token, sub } = await register();
  const body = { endpoint: sub.endpoint, keys: sub.keys, hour: 20, minute: 30, timeZone: 'Asia/Tokyo', enabled: true };
  assert.equal((await call('PUT', `/api/subscriptions/${id}`, body)).status, 404);
  assert.equal((await call('PUT', `/api/subscriptions/${id}`, body, { token: 'x'.repeat(43) })).status, 404);
  assert.equal((await call('DELETE', `/api/subscriptions/${id}`, undefined, { token: 'x'.repeat(43) })).status, 404);
  assert.equal((await call('PUT', `/api/subscriptions/${id}`, body, { token })).status, 200);
  const row = raw.prepare('SELECT hour, minute, time_zone, next_send_at FROM subscriptions WHERE id = ?').get(id) as Record<
    string,
    number | string
  >;
  assert.deepEqual([row.hour, row.minute, row.time_zone], [20, 30, 'Asia/Tokyo']);
  assert.equal(new Date(Number(row.next_send_at)).toISOString(), '2026-10-12T11:30:00.000Z');
  assert.equal((await call('DELETE', `/api/subscriptions/${id}`, undefined, { token })).status, 204);
  assert.equal(Number((raw.prepare('SELECT COUNT(*) n FROM subscriptions').get() as { n: number }).n), 0);
});

test('input validation: push hosts, keys, time, zone, size and origin', async () => {
  const sub = await browserSubscription('https://fcm.googleapis.com/fcm/send/abc');
  const ok = { endpoint: sub.endpoint, keys: sub.keys, hour: 9, minute: 0, timeZone: 'Europe/Belgrade' };
  const bad = async (patch: Record<string, unknown>, status = 400) =>
    assert.equal((await call('POST', '/api/subscriptions', { ...ok, ...patch })).status, status, JSON.stringify(patch));
  await bad({ endpoint: 'https://evil.example.com/push' }); // arbitrary URLs are never fetched
  await bad({ endpoint: 'http://fcm.googleapis.com/fcm/send/abc' });
  await bad({ endpoint: 'https://127.0.0.1/push' });
  await bad({ endpoint: 'https://fcm.googleapis.com.evil.com/x' });
  await bad({ keys: { p256dh: 'short', auth: sub.keys.auth } });
  await bad({ hour: 24 });
  await bad({ minute: -1 });
  await bad({ timeZone: 'Mars/Olympus' });
  assert.equal((await call('POST', '/api/subscriptions', '{"x":"' + 'a'.repeat(5000) + '"}')).status, 413);
  assert.equal((await call('POST', '/api/subscriptions', 'not json')).status, 400);
  assert.equal((await call('POST', '/api/subscriptions', ok, { origin: 'https://other.site' })).status, 403);
  // (invalid attempts count toward the rate limit too, so the valid request comes from another client)
  assert.equal(
    (await call('POST', '/api/subscriptions', { ...ok, endpoint: 'https://web.push.apple.com/abc' }, { ip: '198.51.100.9' })).status,
    201,
  );
});

test('registration is rate limited per client', async () => {
  for (let i = 0; i < 10; i++) await register(`https://fcm.googleapis.com/fcm/send/n${i}`);
  const sub = await browserSubscription('https://fcm.googleapis.com/fcm/send/n11');
  const res = await call('POST', '/api/subscriptions', { endpoint: sub.endpoint, keys: sub.keys, hour: 9, minute: 0, timeZone: 'UTC' });
  assert.equal(res.status, 429);
  const other = await call(
    'POST',
    '/api/subscriptions',
    { endpoint: sub.endpoint, keys: sub.keys, hour: 9, minute: 0, timeZone: 'UTC' },
    { ip: '198.51.100.1' },
  );
  assert.equal(other.status, 201);
});

test('re-registering the same browser replaces the old row (no duplicate reminders)', async () => {
  await register('https://fcm.googleapis.com/fcm/send/same');
  await register('https://fcm.googleapis.com/fcm/send/same');
  assert.equal(Number((raw.prepare('SELECT COUNT(*) n FROM subscriptions').get() as { n: number }).n), 1);
});

test('test push goes only to the caller’s own subscription and is throttled', async () => {
  const { id, token, sub } = await register();
  await register('https://fcm.googleapis.com/fcm/send/someone-else');
  const svc = fakePushService(201);
  const realFetch = globalThis.fetch;
  globalThis.fetch = svc.fetchImpl;
  try {
    assert.equal((await call('POST', `/api/subscriptions/${id}/test`, {}, { token })).status, 202);
    assert.equal(svc.calls.length, 1);
    assert.equal(svc.calls[0].url, sub.endpoint);
    assert.equal(JSON.parse(await decryptPush(svc.calls[0].body, sub)).tag, 'faithly-test');
    assert.equal((await call('POST', `/api/subscriptions/${id}/test`, {}, { token, now: Date.parse('2026-10-12T05:00:10Z') })).status, 429);
    assert.equal((await call('POST', `/api/subscriptions/${id}/test`, {})).status, 404);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('cron sends each due reminder once, even with overlapping runs', async () => {
  const { sub } = await register();
  await register('https://fcm.googleapis.com/fcm/send/later', 18);
  const svc = fakePushService(201);
  const at = Date.parse('2026-10-12T07:00:30Z'); // 09:00:30 in Belgrade
  const [a, b] = await Promise.all([dispatchDue(env, at, svc.fetchImpl), dispatchDue(env, at, svc.fetchImpl)]);
  assert.equal(a.sent + b.sent, 1);
  assert.equal(svc.calls.length, 1);
  assert.equal(JSON.parse(await decryptPush(svc.calls[0].body, sub)).title, 'Faithly 🤍');
  // Same minute again, and later the same day: nothing more for this subscription.
  assert.equal((await dispatchDue(env, at + 60_000, svc.fetchImpl)).sent, 0);
  const row = raw.prepare('SELECT last_sent_date, next_send_at FROM subscriptions WHERE endpoint = ?').get(sub.endpoint) as Record<
    string,
    string | number
  >;
  assert.equal(row.last_sent_date, '2026-10-12');
  assert.equal(new Date(Number(row.next_send_at)).toISOString(), '2026-10-13T07:00:00.000Z');
});

test('expired subscriptions (404/410) are deleted', async () => {
  await register();
  const s = await dispatchDue(env, Date.parse('2026-10-12T07:01:00Z'), fakePushService(410).fetchImpl);
  assert.equal(s.removed, 1);
  assert.equal(Number((raw.prepare('SELECT COUNT(*) n FROM subscriptions').get() as { n: number }).n), 0);
});

test('temporary errors are retried a limited number of times, then the day is given up', async () => {
  await register();
  const svc = fakePushService(503);
  let now = Date.parse('2026-10-12T07:00:30Z');
  const sentOrRetried = [];
  for (let i = 0; i < 6; i++) {
    const s = await dispatchDue(env, now, svc.fetchImpl);
    sentOrRetried.push(`${s.retried}/${s.failed}`);
    now += 10 * 60_000;
  }
  assert.equal(svc.calls.length, 3); // first try + 2 retries
  assert.deepEqual(sentOrRetried, ['1/0', '1/0', '0/1', '0/0', '0/0', '0/0']);
  const row = raw.prepare('SELECT next_send_at, attempts FROM subscriptions').get() as Record<string, number>;
  assert.equal(new Date(Number(row.next_send_at)).toISOString(), '2026-10-13T07:00:00.000Z');
  // A success after a retry also counts once.
  await register('https://fcm.googleapis.com/fcm/send/flaky');
  let n = 0;
  const flaky = fakePushService(() => (n++ === 0 ? 503 : 201));
  const t0 = Date.parse('2026-10-13T07:00:30Z');
  await dispatchDue(env, t0, flaky.fetchImpl);
  const s2 = await dispatchDue(env, t0 + 5 * 60_000, flaky.fetchImpl);
  assert.ok(s2.sent >= 1);
});

test('batch size bounds the work of one cron run; stale reminders are skipped, not sent at night', async () => {
  for (let i = 0; i < 8; i++) await register(`https://fcm.googleapis.com/fcm/send/b${i}`, 9);
  const svc = fakePushService(201);
  const first = await dispatchDue(env, Date.parse('2026-10-12T07:00:30Z'), svc.fetchImpl);
  assert.equal(first.due, 5);
  const second = await dispatchDue(env, Date.parse('2026-10-12T07:01:30Z'), svc.fetchImpl);
  assert.equal(second.due, 3);
  assert.equal(svc.calls.length, 8);
  await register('https://fcm.googleapis.com/fcm/send/stale', 9);
  const late = await dispatchDue(env, Date.parse('2026-10-12T19:00:00Z'), svc.fetchImpl); // 21:00 local
  assert.equal(late.skipped, 1);
  assert.equal(svc.calls.length, 8);
});

test('a cron run cut off mid-send (CPU limit) does not lose today’s reminder', async () => {
  const { sub } = await register();
  const at = Date.parse('2026-10-12T07:00:30Z');
  // The push request never completes: the run is stopped after claiming the row.
  void dispatchDue(env, at, (() => new Promise(() => undefined)) as unknown as typeof fetch);
  await new Promise((r) => setTimeout(r, 50));
  const svc = fakePushService(201);
  assert.equal((await dispatchDue(env, at + 60_000, svc.fetchImpl)).sent, 0); // still leased
  assert.equal((await dispatchDue(env, at + 4 * 60_000, svc.fetchImpl)).sent, 1);
  assert.equal(JSON.parse(await decryptPush(svc.calls[0].body, sub)).title, 'Faithly 🤍');
  const row = raw.prepare('SELECT last_sent_date, next_send_at, attempts FROM subscriptions').get() as Record<string, string | number>;
  assert.equal(row.last_sent_date, '2026-10-12');
  assert.equal(new Date(Number(row.next_send_at)).toISOString(), '2026-10-13T07:00:00.000Z');
  assert.equal(Number(row.attempts), 0);
});
