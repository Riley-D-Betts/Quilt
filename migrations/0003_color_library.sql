-- Migration number: 0003    personal color library
-- Idempotent (IF NOT EXISTS) so it is safe whether applied by
-- `wrangler d1 migrations apply` or pasted into the D1 console.

CREATE TABLE IF NOT EXISTS color_library (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  color TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_color_library_user ON color_library(user_id, created_at DESC);
