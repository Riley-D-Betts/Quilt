-- Migration number: 0002    personal fabric library
-- Idempotent (IF NOT EXISTS) so it is safe whether applied by
-- `wrangler d1 migrations apply` or pasted into the D1 console.

CREATE TABLE IF NOT EXISTS fabric_library (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  pattern TEXT NOT NULL,
  image TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fabric_library_user ON fabric_library(user_id, created_at DESC);
