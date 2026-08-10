-- Universal PalsPayIn relay — the whole schema. Applied with:
--   wrangler d1 execute palspayin-relay --remote --file worker/schema.sql
--
-- One flat table of ciphertext rows plus a per-group last-write marker for
-- the TTL sweep. The server can read none of the content; group_id is the
-- capability (128-bit random, from the link the server never fully sees —
-- the AES key rides in the hash fragment).

CREATE TABLE IF NOT EXISTS relay_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (group_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_relay_events_group_seq ON relay_events (group_id, seq);

CREATE TABLE IF NOT EXISTS relay_groups (
  group_id TEXT PRIMARY KEY,
  last_write INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_relay_groups_last_write ON relay_groups (last_write);
