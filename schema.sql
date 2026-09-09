-- Reference schema for the inspections table.
-- You do NOT need to run this by hand — the app creates this table
-- automatically (CREATE TABLE IF NOT EXISTS) the first time any API
-- route runs. It's included here for documentation/reference only.

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
  data             JSONB NOT NULL  -- full inspection record: fluids, checklist, photos, comments, etc.
);

CREATE INDEX IF NOT EXISTS inspections_saved_at_idx ON inspections (saved_at DESC);
