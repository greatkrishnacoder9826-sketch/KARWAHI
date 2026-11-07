import { userClient } from '../services/supabase.js';

/** Verifies the Supabase access token server-side. User id comes from the verified token, never from the client body. */
export async function requireAuth(req, res, next) {
  try {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Authentication required' });

    const db = userClient(token);
    const { data, error } = await db.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Invalid or expired session' });

    req.user = { id: data.user.id };
    req.db = db;
    next();
  } catch (err) {
    next(err);
  }
}
