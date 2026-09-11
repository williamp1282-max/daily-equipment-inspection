import { sql, ensureTable, DEFAULT_CONFIG } from '../lib/db.js';
import { requireAuth, requireAdmin } from '../lib/auth.js';

const CONFIG_KEY = 'checklist_config';

export default async function handler(req, res) {
  try {
    await ensureTable();

    if (req.method === 'GET') {
      const user = requireAuth(req, res);
      if (!user) return;

      const result = await sql`SELECT value FROM app_config WHERE key = ${CONFIG_KEY} LIMIT 1;`;
      if (result.rows.length === 0) {
        res.status(200).json(DEFAULT_CONFIG);
        return;
      }
      res.status(200).json(result.rows[0].value);
      return;
    }

    if (req.method === 'PUT') {
      const admin = requireAdmin(req, res);
      if (!admin) return;

      const config = req.body;
      if (!config || typeof config !== 'object') {
        res.status(400).json({ error: 'Request body must be a JSON config object.' });
        return;
      }
      const required = ['commonItems', 'equipmentTypes', 'fluidItems', 'attachmentChecks', 'attachmentLabels', 'defaultLines', 'locations'];
      const missing = required.filter((k) => !(k in config));
      if (missing.length) {
        res.status(400).json({ error: `Config is missing required key(s): ${missing.join(', ')}` });
        return;
      }

      await sql`
        INSERT INTO app_config (key, value)
        VALUES (${CONFIG_KEY}, ${JSON.stringify(config)})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
      `;
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === 'DELETE') {
      // Reset to defaults
      const admin = requireAdmin(req, res);
      if (!admin) return;
      await sql`DELETE FROM app_config WHERE key = ${CONFIG_KEY};`;
      res.status(200).json(DEFAULT_CONFIG);
      return;
    }

    res.setHeader('Allow', 'GET, PUT, DELETE');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('config handler error', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
}
