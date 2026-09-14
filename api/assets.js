import { sql, ensureTable } from '../lib/db.js';
import { requireAuth, requireAdmin } from '../lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    await ensureTable();

    if (req.method === 'GET') {
      const user = requireAuth(req, res);
      if (!user) return;

      const result = await sql`
        SELECT unit_id, equipment_type, model, location, region, department, cost_center, created_at, updated_at
        FROM assets
        ORDER BY unit_id ASC;
      `;
      res.status(200).json(result.rows);
      return;
    }

    if (req.method === 'POST') {
      const admin = requireAdmin(req, res);
      if (!admin) return;

      if (req.body && req.body.action === 'populateFromInspections') {
        // Seed the registry from unique unit IDs already logged on
        // inspections, using each unit's most recent inspection for its
        // equipment type / model / location / region / department / cost
        // center. Never overwrites a unit that's already registered — this
        // only fills gaps, so manually-curated entries are untouched.
        const rows = await sql`
          SELECT DISTINCT ON (unit_id)
            unit_id, equipment_type, location, region, department, cost_center,
            data->>'model' AS model
          FROM inspections
          WHERE unit_id IS NOT NULL AND unit_id <> ''
          ORDER BY unit_id, saved_at DESC;
        `;

        let added = 0;
        const now = new Date().toISOString();
        for (const r of rows.rows) {
          const result = await sql`
            INSERT INTO assets (unit_id, equipment_type, model, location, region, department, cost_center, created_at, updated_at)
            VALUES (${r.unit_id}, ${r.equipment_type || ''}, ${r.model || ''}, ${r.location || ''}, ${r.region || ''}, ${r.department || ''}, ${r.cost_center || ''}, ${now}, ${now})
            ON CONFLICT (unit_id) DO NOTHING
            RETURNING unit_id;
          `;
          if (result.rows.length) added++;
        }

        res.status(200).json({ ok: true, scanned: rows.rows.length, added });
        return;
      }

      const { unitId, equipmentType, model, location, region, department, costCenter } = req.body || {};
      if (!unitId || !String(unitId).trim()) {
        res.status(400).json({ error: 'Unit / Asset Number is required.' });
        return;
      }
      const cleanUnitId = String(unitId).trim();
      const now = new Date().toISOString();

      await sql`
        INSERT INTO assets (unit_id, equipment_type, model, location, region, department, cost_center, created_at, updated_at)
        VALUES (${cleanUnitId}, ${equipmentType || ''}, ${model || ''}, ${location || ''}, ${region || ''}, ${department || ''}, ${costCenter || ''}, ${now}, ${now})
        ON CONFLICT (unit_id) DO UPDATE SET
          equipment_type = EXCLUDED.equipment_type,
          model = EXCLUDED.model,
          location = EXCLUDED.location,
          region = EXCLUDED.region,
          department = EXCLUDED.department,
          cost_center = EXCLUDED.cost_center,
          updated_at = EXCLUDED.updated_at;
      `;
      res.status(200).json({ ok: true, unitId: cleanUnitId });
      return;
    }

    if (req.method === 'DELETE') {
      const admin = requireAdmin(req, res);
      if (!admin) return;

      const { unitId } = req.query;
      if (!unitId) {
        res.status(400).json({ error: 'Missing unitId' });
        return;
      }
      await sql`DELETE FROM assets WHERE unit_id = ${unitId};`;
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('assets handler error', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
}
