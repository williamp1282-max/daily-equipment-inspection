import { sql, ensureTable } from '../lib/db.js';
import { requireAuth, requireAdmin } from '../lib/auth.js';

const VALID_STATUSES = ['Open', 'In Progress', 'Closed'];

export default async function handler(req, res) {
  try {
    await ensureTable();

    if (req.method === 'GET') {
      const user = requireAuth(req, res);
      if (!user) return;

      // Open/In Progress first, then Closed; newest first within each.
      const result = await sql`
        SELECT id, inspection_id, equipment_type, equipment_label, unit_id, location,
               item_group, item_label, item_status, item_notes, photo,
               status, created_at, created_by, resolution_notes, closed_at, closed_by, updated_at
        FROM work_orders
        ORDER BY (status = 'Closed') ASC, created_at DESC
        LIMIT 1000;
      `;
      res.status(200).json(result.rows);
      return;
    }

    if (req.method === 'PUT') {
      const user = requireAuth(req, res);
      if (!user) return;

      const { id, status, resolutionNotes } = req.body || {};
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      if (status && !VALID_STATUSES.includes(status)) {
        res.status(400).json({ error: `Status must be one of: ${VALID_STATUSES.join(', ')}` });
        return;
      }

      const existing = await sql`SELECT status, resolution_notes FROM work_orders WHERE id = ${id} LIMIT 1;`;
      if (existing.rows.length === 0) {
        res.status(404).json({ error: 'Work order not found.' });
        return;
      }

      const nextStatus = status || existing.rows[0].status;
      const nextNotes = resolutionNotes !== undefined ? resolutionNotes : existing.rows[0].resolution_notes;
      const now = new Date().toISOString();
      const isClosing = nextStatus === 'Closed' && existing.rows[0].status !== 'Closed';
      const isReopening = nextStatus !== 'Closed' && existing.rows[0].status === 'Closed';

      if (isClosing) {
        await sql`
          UPDATE work_orders
          SET status = ${nextStatus}, resolution_notes = ${nextNotes}, updated_at = ${now},
              closed_at = ${now}, closed_by = ${user.username}
          WHERE id = ${id};
        `;
      } else if (isReopening) {
        await sql`
          UPDATE work_orders
          SET status = ${nextStatus}, resolution_notes = ${nextNotes}, updated_at = ${now},
              closed_at = NULL, closed_by = NULL
          WHERE id = ${id};
        `;
      } else {
        await sql`
          UPDATE work_orders
          SET status = ${nextStatus}, resolution_notes = ${nextNotes}, updated_at = ${now}
          WHERE id = ${id};
        `;
      }

      res.status(200).json({ ok: true });
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
      await sql`DELETE FROM work_orders WHERE id = ${id};`;
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader('Allow', 'GET, PUT, DELETE');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('workorders handler error', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
}
