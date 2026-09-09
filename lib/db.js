import { sql } from '@vercel/postgres';

let initialized = false;

/**
 * Creates the inspections table if it doesn't already exist.
 * Safe to call on every request — CREATE TABLE IF NOT EXISTS is cheap,
 * and we cache a flag per warm serverless instance to skip repeat calls.
 */
export async function ensureTable() {
  if (initialized) return;
  await sql`
    CREATE TABLE IF NOT EXISTS inspections (
      id TEXT PRIMARY KEY,
      equipment_type TEXT,
      equipment_label TEXT,
      unit_id TEXT,
      operator TEXT,
      inspection_date TEXT,
      shift TEXT,
      hours TEXT,
      attachment TEXT,
      has_fail BOOLEAN,
      saved_at TIMESTAMPTZ,
      data JSONB NOT NULL
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS inspections_saved_at_idx ON inspections (saved_at DESC);`;
  initialized = true;
}

/**
 * Mirrors the client-side hasAnyFail() logic so the server never trusts
 * (or requires) the client to have computed this correctly.
 */
export function computeHasFail(record) {
  const groups = [
    record.fluids || [],
    record.checklist || [],
    record.attachmentChecklist || [],
    record.attachmentLines || []
  ];
  for (const group of groups) {
    for (const item of group) {
      if (item && (item.status === 'Needs Attention' || item.status === 'Low')) {
        return true;
      }
    }
  }
  return false;
}

export { sql };
