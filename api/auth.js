import { randomUUID } from 'crypto';
import { sql, ensureTable } from '../lib/db.js';
import {
  hashPassword,
  verifyPassword,
  signSession,
  setSessionCookie,
  clearSessionCookie,
  getSessionUser
} from '../lib/auth.js';

export default async function handler(req, res) {
  try {
    await ensureTable();

    if (req.method === 'GET') {
      const countResult = await sql`SELECT COUNT(*)::int AS count FROM users;`;
      const needsSetup = countResult.rows[0].count === 0;
      const sessionUser = getSessionUser(req);
      let user = null;
      if (sessionUser && !needsSetup) {
        const result = await sql`SELECT id, username, role FROM users WHERE id = ${sessionUser.id} LIMIT 1;`;
        if (result.rows.length) user = result.rows[0];
      }
      res.status(200).json({ needsSetup, user });
      return;
    }

    if (req.method === 'POST') {
      const { action, username, password, newPassword } = req.body || {};

      if (action === 'setup') {
        const countResult = await sql`SELECT COUNT(*)::int AS count FROM users;`;
        if (countResult.rows[0].count > 0) {
          res.status(400).json({ error: 'Setup already completed.' });
          return;
        }
        if (!username || !password || password.length < 8) {
          res.status(400).json({ error: 'Username and an 8+ character password are required.' });
          return;
        }
        const id = randomUUID();
        const hash = await hashPassword(password);
        await sql`
          INSERT INTO users (id, username, password_hash, role, created_at)
          VALUES (${id}, ${username.trim()}, ${hash}, 'admin', ${new Date().toISOString()});
        `;
        const token = signSession({ id, username: username.trim(), role: 'admin' });
        setSessionCookie(res, token);
        res.status(200).json({ ok: true, user: { id, username: username.trim(), role: 'admin' } });
        return;
      }

      if (action === 'login') {
        if (!username || !password) {
          res.status(400).json({ error: 'Username and password are required.' });
          return;
        }
        const result = await sql`SELECT id, username, password_hash, role FROM users WHERE username = ${username.trim()} LIMIT 1;`;
        if (result.rows.length === 0) {
          res.status(401).json({ error: 'Invalid username or password.' });
          return;
        }
        const row = result.rows[0];
        const ok = await verifyPassword(password, row.password_hash);
        if (!ok) {
          res.status(401).json({ error: 'Invalid username or password.' });
          return;
        }
        const token = signSession({ id: row.id, username: row.username, role: row.role });
        setSessionCookie(res, token);
        res.status(200).json({ ok: true, user: { id: row.id, username: row.username, role: row.role } });
        return;
      }

      if (action === 'logout') {
        clearSessionCookie(res);
        res.status(200).json({ ok: true });
        return;
      }

      if (action === 'change-password') {
        const sessionUser = getSessionUser(req);
        if (!sessionUser) {
          res.status(401).json({ error: 'Not signed in.' });
          return;
        }
        if (!newPassword || newPassword.length < 8) {
          res.status(400).json({ error: 'New password must be at least 8 characters.' });
          return;
        }
        const hash = await hashPassword(newPassword);
        await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${sessionUser.id};`;
        res.status(200).json({ ok: true });
        return;
      }

      res.status(400).json({ error: 'Unknown action.' });
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('auth handler error', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
}
