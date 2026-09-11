import { sql, ensureTable, computeHasFail } from '../lib/db.js';
import { requireAuth, requireAdmin } from '../lib/auth.js';
import { sendFailureAlert } from '../lib/email.js';

const REQUIRED_FIELDS = ['equipmentType', 'unitId', 'operator', 'date'];

export default async function handler(req, res) {
  try {
    await ensureTable();

    if (req.method === 'GET') {
      const user = requireAuth(req, res);
      if (!user) return;

      const result = await sql`
        SELECT id, equipment_type, equipment_label, unit_id, operator,
               inspection_date, shift, hours, attachment, has_fail, saved_at, created_by, location
        FROM inspections
        ORDER BY saved_at DESC
        LIMIT 1000;
      `;
      res.status(200).json(result.rows);
      return;
    }

    if (req.method === 'POST') {
      const user = requireAuth(req, res);
      if (!user) return;

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

      const providedId = typeof record.id === 'string' && record.id ? record.id : null;
      let existing = null;
      if (providedId) {
        const existingResult = await sql`SELECT created_by FROM inspections WHERE id = ${providedId} LIMIT 1;`;
        existing = existingResult.rows[0] || null;
      }

      // Editing an inspection that already exists is an admin-only action.
      // Creating a brand-new inspection is open to any signed-in user.
      if (existing && user.role !== 'admin') {
        res.status(403).json({ error: 'Only admins can edit an existing inspection.' });
        return;
      }

      const id = providedId || ('insp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
      const savedAt = new Date().toISOString();
      const hasFail = computeHasFail(record);
      const createdBy = existing ? existing.created_by : user.username;
      const fullRecord = { ...record, id, savedAt, createdBy };

      await sql`
        INSERT INTO inspections (
          id, equipment_type, equipment_label, unit_id, operator,
          inspection_date, shift, hours, attachment, has_fail, saved_at, created_by, location, data
        ) VALUES (
          ${id}, ${record.equipmentType}, ${record.equipmentLabel || ''}, ${record.unitId}, ${record.operator},
          ${record.date}, ${record.shift || ''}, ${record.hours || ''}, ${record.attachment || 'none'},
          ${hasFail}, ${savedAt}, ${createdBy}, ${record.location || ''}, ${JSON.stringify(fullRecord)}
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
          saved_at = EXCLUDED.saved_at,
          location = EXCLUDED.location,
          data = EXCLUDED.data;
      `;

      res.status(200).json({ ok: true, id, hasFail, savedAt });

      // Fire the "needs attention" alert after responding to the client —
      // a slow or failed email should never hold up or break the save.
      if (hasFail) {
        try {
          const notifyResult = await sql`SELECT value FROM app_config WHERE key = ${'notify_emails'} LIMIT 1;`;
          const toEmails = notifyResult.rows.length ? notifyResult.rows[0].value.emails : [];
          if (toEmails.length) {
            const proto = req.headers['x-forwarded-proto'] || 'https';
            const host = req.headers.host;
            const appUrl = host ? `${proto}://${host}` : null;
            await sendFailureAlert({ toEmails, record: fullRecord, appUrl });
          }
        } catch (emailErr) {
          console.error('Failed to send inspection alert email', emailErr);
        }
      }
      return;
    }

    if (req.method === 'DELETE') {
      const admin = requireAdmin(req, res);
      if (!admin) return;

      const { id } = req.query;
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      await sql`DELETE FROM inspections WHERE id = ${id};`;
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('inspections handler error', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
}
