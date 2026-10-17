// HTTP API for push subscriptions. Every change needs the per-installation secret token;
// the installation id alone is not enough. Requests are size-limited, validated and rate-limited.
import type { Env } from './env.ts';
import { sendPush, TEST_NOTICE, TEST_TTL_SECONDS } from './push.ts';
import { isValidTimeZone, nextSendAt } from './schedule.ts';

const MAX_BODY = 4096;
const PUSH_HOSTS = ['fcm.googleapis.com', '.google.com', '.push.apple.com', '.push.services.mozilla.com', '.notify.windows.com'];
const B64URL = /^[A-Za-z0-9_-]+$/;

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });

// ---------- helpers ----------
const bytesToB64url = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const randomToken = (n: number) => bytesToB64url(crypto.getRandomValues(new Uint8Array(n)));
export async function sha256(text: string): Promise<string> {
  return bytesToB64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
}

function allowedEndpoint(endpoint: unknown, env: Env): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 1024) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  const extra = (env.EXTRA_PUSH_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  if (extra.includes(url.host)) return true; // local test server (never configured in production)
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  return PUSH_HOSTS.some((h) => (h.startsWith('.') ? url.hostname.endsWith(h) : url.hostname === h));
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY) throw new HttpError(413, 'Zahtev je prevelik.');
  const text = await req.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'Zahtev je prevelik.');
  try {
    const v = JSON.parse(text || '{}');
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  throw new HttpError(400, 'Neispravan JSON.');
}

interface ReminderInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  hour: number;
  minute: number;
  timeZone: string;
}

function parseReminder(b: Record<string, unknown>, env: Env): ReminderInput {
  const keys = (b.keys ?? {}) as Record<string, unknown>;
  const { endpoint, hour, minute, timeZone } = b;
  if (!allowedEndpoint(endpoint, env)) throw new HttpError(400, 'Neispravna adresa za notifikacije.');
  if (typeof keys.p256dh !== 'string' || keys.p256dh.length !== 87 || !B64URL.test(keys.p256dh))
    throw new HttpError(400, 'Neispravan ključ p256dh.');
  if (typeof keys.auth !== 'string' || keys.auth.length !== 22 || !B64URL.test(keys.auth))
    throw new HttpError(400, 'Neispravan ključ auth.');
  if (!Number.isInteger(hour) || (hour as number) < 0 || (hour as number) > 23) throw new HttpError(400, 'Neispravan sat.');
  if (!Number.isInteger(minute) || (minute as number) < 0 || (minute as number) > 59) throw new HttpError(400, 'Neispravan minut.');
  if (!isValidTimeZone(timeZone)) throw new HttpError(400, 'Neispravna vremenska zona.');
  return { endpoint, p256dh: keys.p256dh, auth: keys.auth, hour: hour as number, minute: minute as number, timeZone };
}

/** Fixed-window counter in D1; throws 429 when `limit` is exceeded within `windowMs`. */
export async function rateLimit(env: Env, key: string, limit: number, windowMs: number, now: number): Promise<void> {
  const start = now - (now % windowMs);
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN window_start = ?2 THEN count + 1 ELSE 1 END,
       window_start = ?2
     RETURNING count`,
  )
    .bind(key, start)
    .first<{ count: number }>();
  if ((row?.count ?? 0) > limit) throw new HttpError(429, 'Previše zahteva. Pokušaj ponovo kasnije.');
}

interface Row {
  id: string;
  token_hash: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  hour: number;
  minute: number;
  time_zone: string;
  last_sent_date: string | null;
  last_test_at: number | null;
}

async function authorize(req: Request, env: Env, id: string): Promise<Row> {
  const token = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(req.headers.get('authorization') ?? '')?.[1];
  const row = await env.DB.prepare('SELECT * FROM subscriptions WHERE id = ?').bind(id).first<Row>();
  // Same answer for "unknown id" and "wrong token", so ids cannot be probed.
  if (!row || !token || (await sha256(token)) !== row.token_hash) throw new HttpError(404, 'Pretplata nije pronađena.');
  return row;
}

const clientKey = async (req: Request) => sha256(`ip:${req.headers.get('cf-connecting-ip') ?? 'local'}`);

// ---------- routes ----------
export async function handleApi(req: Request, env: Env, now = Date.now()): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  try {
    // Browsers send Origin on cross-site POST/PUT/DELETE; only our own pages may call the API.
    const origin = req.headers.get('origin');
    if (req.method !== 'GET' && origin && origin !== url.origin) throw new HttpError(403, 'Nedozvoljen izvor zahteva.');

    if (path === '/api/health' && req.method === 'GET') {
      const db = await env.DB.prepare('SELECT COUNT(*) AS n FROM subscriptions').first<{ n: number }>();
      return json(200, {
        ok: true,
        db: 'ok',
        subscriptions: db?.n ?? 0,
        vapid: !!env.VAPID_PRIVATE_KEY && !!env.VAPID_PUBLIC_KEY,
        time: new Date(now).toISOString(),
      });
    }
    if (path === '/api/config' && req.method === 'GET') {
      return json(200, { vapidPublicKey: env.VAPID_PUBLIC_KEY });
    }

    if (path === '/api/subscriptions' && req.method === 'POST') {
      await rateLimit(env, `create:${await clientKey(req)}`, 10, 3_600_000, now);
      const input = parseReminder(await readBody(req), env);
      const id = crypto.randomUUID();
      const token = randomToken(32);
      // A browser that lost its local data re-registers with the same endpoint: replace the old row.
      await env.DB.batch([
        env.DB.prepare('DELETE FROM subscriptions WHERE endpoint = ?').bind(input.endpoint),
        env.DB.prepare(
          `INSERT INTO subscriptions (id, token_hash, endpoint, p256dh, auth, hour, minute, time_zone, enabled, next_send_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        ).bind(
          id,
          await sha256(token),
          input.endpoint,
          input.p256dh,
          input.auth,
          input.hour,
          input.minute,
          input.timeZone,
          nextSendAt(now, input.hour, input.minute, input.timeZone, null),
          now,
          now,
        ),
      ]);
      return json(201, { id, token });
    }

    const m = /^\/api\/subscriptions\/([0-9a-f-]{36})(\/test)?$/.exec(path);
    if (m) {
      const [, id, test] = m;
      await rateLimit(env, `sub:${id}`, 60, 3_600_000, now);
      const row = await authorize(req, env, id);

      if (!test && req.method === 'PUT') {
        const b = await readBody(req);
        const input = parseReminder(b, env);
        const enabled = b.enabled !== false;
        // Keep last_sent_date: changing the time or zone must not trigger a second reminder today.
        await env.DB.prepare(
          `UPDATE subscriptions SET endpoint = ?, p256dh = ?, auth = ?, hour = ?, minute = ?, time_zone = ?, enabled = ?,
             next_send_at = ?, attempts = 0, updated_at = ? WHERE id = ?`,
        )
          .bind(
            input.endpoint,
            input.p256dh,
            input.auth,
            input.hour,
            input.minute,
            input.timeZone,
            enabled ? 1 : 0,
            enabled ? nextSendAt(now, input.hour, input.minute, input.timeZone, row.last_sent_date) : null,
            now,
            id,
          )
          .run();
        return json(200, { ok: true });
      }
      if (!test && req.method === 'DELETE') {
        await env.DB.prepare('DELETE FROM subscriptions WHERE id = ?').bind(id).run();
        return json(204, null);
      }
      if (test && req.method === 'POST') {
        if (row.last_test_at && now - row.last_test_at < 30_000) throw new HttpError(429, 'Sačekaj pola minuta pre sledeće probe.');
        await rateLimit(env, `test:${id}`, 20, 86_400_000, now);
        await env.DB.prepare('UPDATE subscriptions SET last_test_at = ? WHERE id = ?').bind(now, id).run();
        const { result, status, reason } = await sendPush(row, TEST_NOTICE, vapid(env), TEST_TTL_SECONDS);
        if (result === 'gone') {
          await env.DB.prepare('DELETE FROM subscriptions WHERE id = ?').bind(id).run();
          throw new HttpError(410, 'Pretplata više ne važi. Isključi i ponovo uključi podsetnik.');
        }
        if (result !== 'sent') {
          console.warn('test push failed', id, pushHost(row.endpoint), status, reason ?? '');
          throw new HttpError(502, `Servis za notifikacije je odbio poruku (${status}).`);
        }
        return json(202, { sent: true });
      }
    }
    throw new HttpError(404, 'Nepoznata adresa.');
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message });
    console.error('API error', e instanceof Error ? e.message : e);
    return json(500, { error: 'Greška servera.' });
  }
}

/** Push service host for logs (the full endpoint is a secret capability URL). */
export const pushHost = (endpoint: string) => {
  try {
    return new URL(endpoint).hostname;
  } catch {
    return '?';
  }
};

export const vapid = (env: Env) => ({ subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY });
