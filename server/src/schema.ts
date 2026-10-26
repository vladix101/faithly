// Tables added after the first deploy. Deploys from Git (Cloudflare Workers Builds) do not run
// `wrangler d1 migrations apply`, so the Worker creates them itself, once per isolate and database.
import type { Env } from './env.ts';

const ready = new WeakMap<D1Database, Promise<unknown>>();

export function ensureSchema(env: Env): Promise<unknown> {
  let p = ready.get(env.DB);
  if (!p) {
    p = env.DB.batch([
      env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS notices (
          subscription_id TEXT NOT NULL, tag TEXT NOT NULL, send_at INTEGER NOT NULL,
          title TEXT NOT NULL, body TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (subscription_id, tag))`,
      ),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS notices_due ON notices (send_at)'),
    ]).catch((e) => {
      ready.delete(env.DB);
      throw e;
    });
    ready.set(env.DB, p);
  }
  return p;
}
