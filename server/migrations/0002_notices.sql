-- One-off reminders of an installation (web/iPhone): the evening before a red-letter feast and
-- before the first day of a multi-day fast. The app computes them from its calendar and replaces
-- the whole list when it opens; the server only stores and sends them.
-- IF NOT EXISTS: the Worker also creates this table itself (server/src/schema.ts), because
-- deploys from Git do not apply migrations.
CREATE TABLE IF NOT EXISTS notices (
  subscription_id TEXT NOT NULL,       -- subscriptions.id
  tag TEXT NOT NULL,                   -- e.g. faithly-feast-2026-11-21 (also the push Topic)
  send_at INTEGER NOT NULL,            -- UTC epoch ms (18:00 local time the evening before)
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (subscription_id, tag)
);
CREATE INDEX IF NOT EXISTS notices_due ON notices (send_at);
