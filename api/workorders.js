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
        SELECT id, inspection_id, equipment_type, equipment_label, unit_id, location, region, department, cost_center,
               item_group, item_label, item_status, item_notes, photo,
               status, created_at, created_by, resolution_notes, closed_at, closed_by, updated_at
        FROM work_orders
        ORDER BY (status = 'Closed') ASC, created_at DESC
        LIMIT 1000;
      `;
      res.status(200).json(result.rows);
      return;
    }

    if (req.method === 'POST') {
      const user = requireAuth(req, res);
      if (!user) return;

      const { inspectionId, group, index, notes } = req.body || {};
      const VALID_GROUPS = ['fluids', 'checklist', 'attachmentChecklist', 'attachmentLines'];
      const isItemMode = group !== undefined && group !== null;

      if (!inspectionId) {
        res.status(400).json({ error: 'inspectionId is required.' });
        return;
      }
      if (isItemMode && (!VALID_GROUPS.includes(group) || typeof index !== 'number')) {
        res.status(400).json({ error: 'A valid group and an item index are required when filing from a specific check.' });
        return;
      }

      const inspResult = await sql`
        SELECT data, equipment_type, equipment_label, unit_id, location, region, department, cost_center
        FROM inspections WHERE id = ${inspectionId} LIMIT 1;
      `;
      if (inspResult.rows.length === 0) {
        res.status(404).json({ error: 'That inspection no longer exists.' });
        return;
      }
      const insp = inspResult.rows[0];

      // Two modes: filing from one specific checklist/fluid item (isItemMode),
      // or a general work order for the inspection as a whole (no group/index
      // given — used by the button at the bottom of the inspection detail).
      let itemGroup, itemLabel, itemStatus, itemNotes, itemPhoto;
      if (isItemMode) {
        const items = (insp.data && insp.data[group]) || [];
        const item = items[index];
        if (!item) {
          res.status(404).json({ error: 'That checklist item could not be found on this inspection.' });
          return;
        }
        itemGroup = group;
        itemLabel = item.label;
        itemStatus = item.status || 'N/A';
        itemNotes = item.notes || '';
        itemPhoto = item.photo || null;
      } else {
        itemGroup = 'general';
        itemLabel = 'General follow-up';
        itemStatus = '';
        itemNotes = (notes || '').trim();
        itemPhoto = null;
      }

      // Avoid filing a second open work order for the exact same item (or, in
      // general mode, a second general work order) on the exact same
      // inspection if one already exists and isn't closed yet.
      const existing = await sql`
        SELECT id FROM work_orders
        WHERE inspection_id = ${inspectionId} AND item_group = ${itemGroup} AND item_label = ${itemLabel} AND status != 'Closed'
        LIMIT 1;
      `;
      if (existing.rows.length) {
        res.status(200).json({ ok: true, created: false, id: existing.rows[0].id });
        return;
      }

      const woId = 'wo_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const now = new Date().toISOString();
      await sql`
        INSERT INTO work_orders (
          id, inspection_id, equipment_type, equipment_label, unit_id, location, region, department, cost_center,
          item_group, item_label, item_status, item_notes, photo,
          status, created_at, created_by, updated_at
        ) VALUES (
          ${woId}, ${inspectionId}, ${insp.equipment_type}, ${insp.equipment_label}, ${insp.unit_id}, ${insp.location},
          ${insp.region}, ${insp.department}, ${insp.cost_center},
          ${itemGroup}, ${itemLabel}, ${itemStatus}, ${itemNotes}, ${itemPhoto},
          'Open', ${now}, ${user.username}, ${now}
        );
      `;
      res.status(200).json({ ok: true, created: true, id: woId });
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

    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('workorders handler error', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
}
