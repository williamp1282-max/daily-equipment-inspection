import { sql, ensureTable } from '../lib/db.js';
import { requireAdmin } from '../lib/auth.js';

const KEY = 'notify_emails';

export default async function handler(req, res) {
  try {
    await ensureTable();
    const admin = requireAdmin(req, res);
    if (!admin) return;

    if (req.method === 'GET') {
      const result = await sql`SELECT value FROM app_config WHERE key = ${KEY} LIMIT 1;`;
      const emails = result.rows.length ? result.rows[0].value.emails : [];
      res.status(200).json({ emails: emails, emailConfigured: !!process.env.RESEND_API_KEY });
      return;
    }

    if (req.method === 'PUT') {
      const { emails } = req.body || {};
      if (!Array.isArray(emails)) {
        res.status(400).json({ error: 'emails must be an array of strings.' });
        return;
      }
      const cleaned = emails
        .map(function (e) { return String(e).trim(); })
        .filter(function (e) { return e.length > 0; });

      await sql`
        INSERT INTO app_config (key, value)
        VALUES (${KEY}, ${JSON.stringify({ emails: cleaned })})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
      `;
      res.status(200).json({ ok: true, emails: cleaned });
      return;
    }

    res.setHeader('Allow', 'GET, PUT');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('notify handler error', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
}
