-- Reference schema. You do NOT need to run this by hand — the app creates
-- these tables automatically (CREATE TABLE IF NOT EXISTS) the first time
-- any API route runs. Included here for documentation only.

CREATE TABLE IF NOT EXISTS inspections (
  id               TEXT PRIMARY KEY,
  equipment_type   TEXT,
  equipment_label  TEXT,
  unit_id          TEXT,
  operator         TEXT,
  inspection_date  TEXT,
  shift            TEXT,
  hours            TEXT,
  attachment       TEXT,
  has_fail         BOOLEAN,
  saved_at         TIMESTAMPTZ,
  created_by       TEXT,           -- username of whoever logged this inspection
  data             JSONB NOT NULL  -- full record: fluids, checklist, photos, comments, etc.
);
CREATE INDEX IF NOT EXISTS inspections_saved_at_idx ON inspections (saved_at DESC);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,     -- bcrypt hash, never plaintext
  role          TEXT NOT NULL DEFAULT 'general',  -- 'admin' | 'general'
  created_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS app_config (
  key   TEXT PRIMARY KEY,   -- currently only 'checklist_config'
  value JSONB NOT NULL      -- equipment types, checklist items, fluids, attachments
);
