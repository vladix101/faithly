-- Faithly Web Push: one row per installed PWA that turned the daily reminder on.
-- Only what is needed to send the reminder is stored; notes and favorites never leave the device.
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,                 -- random installation id (UUID)
  token_hash TEXT NOT NULL,            -- SHA-256 of the per-installation secret token
  endpoint TEXT NOT NULL UNIQUE,       -- push service URL (allow-listed hosts only)
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  hour INTEGER NOT NULL CHECK (hour BETWEEN 0 AND 23),
  minute INTEGER NOT NULL CHECK (minute BETWEEN 0 AND 59),
  time_zone TEXT NOT NULL,             -- IANA zone, e.g. Europe/Belgrade
  enabled INTEGER NOT NULL DEFAULT 1,
  next_send_at INTEGER,                -- UTC epoch ms of the next reminder
  last_sent_date TEXT,                 -- local YYYY-MM-DD of the last sent reminder (no duplicates)
  attempts INTEGER NOT NULL DEFAULT 0, -- retries of the current reminder after temporary errors
  last_test_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX subscriptions_due ON subscriptions (next_send_at) WHERE enabled = 1;

-- Fixed-window rate limiting per client/installation.
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
