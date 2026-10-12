import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DAILY_NOTICE, sendPush } from '../src/push.ts';
import { browserSubscription, decryptPush, fakePushService, vapidKeys, verifyVapid } from './helpers.ts';

test('push message is decryptable by the subscriber and carries a valid VAPID signature', async () => {
  const keys = await vapidKeys();
  const sub = await browserSubscription('https://web.push.apple.com/QGhJ8abc');
  const svc = fakePushService(201);
  const r = await sendPush(
    { endpoint: sub.endpoint, ...sub.keys },
    DAILY_NOTICE,
    { subject: 'https://github.com/vladix101/faithly', ...keys },
    3600,
    svc.fetchImpl,
  );
  assert.deepEqual(r, { result: 'sent', status: 201 });
  const call = svc.calls[0];
  assert.equal(call.url, sub.endpoint);
  assert.equal(call.headers['content-encoding'], 'aes128gcm');
  assert.equal(call.headers.ttl, '3600');
  assert.equal(call.headers.topic, 'faithly-daily');
  const claims = await verifyVapid(call.headers.authorization, keys.verifyKey);
  assert.equal(claims.aud, 'https://web.push.apple.com');
  assert.equal(claims.sub, 'https://github.com/vladix101/faithly');
  assert.ok(Number(claims.exp) > Date.now() / 1000);
  const payload = JSON.parse(await decryptPush(call.body, sub));
  assert.deepEqual(payload, { title: 'Faithly 🤍', body: 'Tvoj današnji biblijski citat je spreman.', url: '/', tag: 'faithly-daily' });
});

test('push service answers are classified for cleanup and retry', async () => {
  const keys = await vapidKeys();
  const sub = await browserSubscription('https://fcm.googleapis.com/fcm/send/abc');
  const send = (status: number) =>
    sendPush(
      { endpoint: sub.endpoint, ...sub.keys },
      DAILY_NOTICE,
      { subject: 'mailto:x@example.com', ...keys },
      60,
      fakePushService(status).fetchImpl,
    );
  assert.equal((await send(410)).result, 'gone');
  assert.equal((await send(404)).result, 'gone');
  assert.equal((await send(429)).result, 'retry');
  assert.equal((await send(503)).result, 'retry');
  assert.equal((await send(400)).result, 'rejected');
  const offline = (async () => {
    throw new TypeError('network down');
  }) as unknown as typeof fetch;
  assert.equal(
    (await sendPush({ endpoint: sub.endpoint, ...sub.keys }, DAILY_NOTICE, { subject: 'mailto:x@example.com', ...keys }, 60, offline))
      .result,
    'retry',
  );
});
