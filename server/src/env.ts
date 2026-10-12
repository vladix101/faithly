export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Public VAPID key (base64url, uncompressed P-256 point). Also given to browsers. */
  VAPID_PUBLIC_KEY: string;
  /** Secret: `wrangler secret put VAPID_PRIVATE_KEY` (base64url JWK "d"). */
  VAPID_PRIVATE_KEY: string;
  /** Contact for push services: https URL or mailto. */
  VAPID_SUBJECT: string;
  /** Max reminders sent per cron run (free plan: 10 ms CPU per invocation). */
  SEND_BATCH?: string;
  /** Local development only: extra comma-separated push hosts (e.g. a fake push server). */
  EXTRA_PUSH_HOSTS?: string;
}
