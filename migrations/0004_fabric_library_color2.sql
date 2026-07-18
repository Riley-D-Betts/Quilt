-- Migration number: 0004    secondary pattern color for library fabrics
-- SQLite has no "ADD COLUMN IF NOT EXISTS": if you already ran this by hand
-- in the console, a "duplicate column name" error here is harmless.

ALTER TABLE fabric_library ADD COLUMN color2 TEXT;
