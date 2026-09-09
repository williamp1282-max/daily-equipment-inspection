import { sql, ensureTable } from '../lib/db.js';

export default async function handler(req, res) {
  try {
    await ensureTable();

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const { id } = req.query;
    if (!id) {
      res.status(400).json({ error: 'Missing id' });
      return;
    }

    const result = await sql`SELECT data FROM inspections WHERE id = ${id} LIMIT 1;`;

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Inspection not found' });
      return;
    }

    res.status(200).json(result.rows[0].data);
  } catch (err) {
    console.error('inspection detail handler error', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
}
