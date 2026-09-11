import { sql, ensureTable, computeHasFail } from '../lib/db.js';
import { requireAdmin } from '../lib/auth.js';

const REQUIRED_FIELDS = ['equipmentType', 'unitId', 'operator', 'date'];

export default async function handler(req, res) {
  try {
    await ensureTable();
    const admin = requireAdmin(req, res);
    if (!admin) return;

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const records = (req.body || {}).records;
    if (!Array.isArray(records) || !records.length) {
      res.status(400).json({ error: 'Request body must be { "records": [ ... ] } with at least one record.' });
      return;
    }
    if (records.length > 500) {
      res.status(400).json({ error: 'Import is capped at 500 records at a time.' });
      return;
    }

    let imported = 0;
    const errors = [];

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      if (!record || typeof record !== 'object') {
        errors.push({ index: i, error: 'Not a JSON object.' });
        continue;
      }
      const missing = REQUIRED_FIELDS.filter((f) => !record[f]);
      if (missing.length) {
        errors.push({ index: i, unitId: record.unitId, error: `Missing required field(s): ${missing.join(', ')}` });
        continue;
      }

      try {
        const id = 'insp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '_' + i;
        const savedAt = record.savedAt || new Date().toISOString();
        const hasFail = computeHasFail(record);
        const createdBy = record.createdBy || admin.username + ' (import)';
        const fullRecord = { ...record, id, savedAt, createdBy };

        await sql`
          INSERT INTO inspections (
            id, equipment_type, equipment_label, unit_id, operator,
            inspection_date, shift, hours, attachment, has_fail, saved_at, created_by, location, data
          ) VALUES (
            ${id}, ${record.equipmentType}, ${record.equipmentLabel || ''}, ${record.unitId}, ${record.operator},
            ${record.date}, ${record.shift || ''}, ${record.hours || ''}, ${record.attachment || 'none'},
            ${hasFail}, ${savedAt}, ${createdBy}, ${record.location || ''}, ${JSON.stringify(fullRecord)}
          );
        `;
        imported++;
      } catch (rowErr) {
        console.error('import row error', rowErr);
        errors.push({ index: i, unitId: record.unitId, error: 'Database error while inserting this record.' });
      }
    }

    res.status(200).json({ ok: true, imported, failed: errors.length, errors });
  } catch (err) {
    console.error('import handler error', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
}
