import { sql, ensureTable, computeHasFail } from '../lib/db.js';

const REQUIRED_FIELDS = ['equipmentType', 'unitId', 'operator', 'date'];

export default async function handler(req, res) {
  try {
    await ensureTable();

    if (req.method === 'GET') {
      // Return a lightweight summary list (no photos / notes payload) —
      // the client filters this in-browser, same as the full detail record
      // fetched separately per inspection. Capped at 1000 most recent.
      const result = await sql`
        SELECT id, equipment_type, equipment_label, unit_id, operator,
               inspection_date, shift, hours, attachment, has_fail, saved_at
        FROM inspections
        ORDER BY saved_at DESC
        LIMIT 1000;
      `;
      res.status(200).json(result.rows);
      return;
    }

    if (req.method === 'POST') {
      const record = req.body;

      if (!record || typeof record !== 'object') {
        res.status(400).json({ error: 'Request body must be a JSON inspection record.' });
        return;
      }

      const missing = REQUIRED_FIELDS.filter((f) => !record[f]);
      if (missing.length) {
        res.status(400).json({ error: `Missing required field(s): ${missing.join(', ')}` });
        return;
      }

      const id = typeof record.id === 'string' && record.id
        ? record.id
        : 'insp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const savedAt = new Date().toISOString();
      const hasFail = computeHasFail(record);
      const fullRecord = { ...record, id, savedAt };

      await sql`
        INSERT INTO inspections (
          id, equipment_type, equipment_label, unit_id, operator,
          inspection_date, shift, hours, attachment, has_fail, saved_at, data
        ) VALUES (
          ${id}, ${record.equipmentType}, ${record.equipmentLabel || ''}, ${record.unitId}, ${record.operator},
          ${record.date}, ${record.shift || ''}, ${record.hours || ''}, ${record.attachment || 'none'},
          ${hasFail}, ${savedAt}, ${JSON.stringify(fullRecord)}
        )
        ON CONFLICT (id) DO UPDATE SET
          equipment_type = EXCLUDED.equipment_type,
          equipment_label = EXCLUDED.equipment_label,
          unit_id = EXCLUDED.unit_id,
          operator = EXCLUDED.operator,
          inspection_date = EXCLUDED.inspection_date,
          shift = EXCLUDED.shift,
          hours = EXCLUDED.hours,
          attachment = EXCLUDED.attachment,
          has_fail = EXCLUDED.has_fail,
          data = EXCLUDED.data;
      `;

      res.status(200).json({ ok: true, id, hasFail, savedAt });
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('inspections handler error', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
}
