import { randomUUID } from 'crypto';
import { sql, ensureTable } from '../lib/db.js';
import { hashPassword, requireAdmin } from '../lib/auth.js';

export default async function handler(req, res) {
  try {
    await ensureTable();
    const admin = requireAdmin(req, res);
    if (!admin) return;

    if (req.method === 'GET') {
      const result = await sql`SELECT id, username, role, created_at FROM users ORDER BY created_at ASC;`;
      res.status(200).json(result.rows);
      return;
    }

    if (req.method === 'POST') {
      const { username, password, role } = req.body || {};
      if (!username || !password || password.length < 8) {
        res.status(400).json({ error: 'Username and an 8+ character password are required.' });
        return;
      }
      const finalRole = role === 'admin' ? 'admin' : 'general';
      const existing = await sql`SELECT id FROM users WHERE username = ${username.trim()} LIMIT 1;`;
      if (existing.rows.length) {
        res.status(400).json({ error: 'That username is already taken.' });
        return;
      }
      const id = randomUUID();
      const hash = await hashPassword(password);
      await sql`
        INSERT INTO users (id, username, password_hash, role, created_at)
        VALUES (${id}, ${username.trim()}, ${hash}, ${finalRole}, ${new Date().toISOString()});
      `;
      res.status(200).json({ ok: true, id, username: username.trim(), role: finalRole });
      return;
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      if (id === admin.id) {
        res.status(400).json({ error: "You can't delete your own account while signed in." });
        return;
      }
      await sql`DELETE FROM users WHERE id = ${id};`;
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('users handler error', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
}
