import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

export const exportRouter = Router();
exportRouter.use(requireAuth);

// Returns only the signed-in user's rows (RLS-scoped client). Messages are capped at the 5000 most recent.
exportRouter.get('/', async (req, res, next) => {
  try {
    const q = (table, build) => build(req.db.from(table).select('*')).then(({ data, error }) => { if (error) throw error; return data; });
    const [memories, relationships, relationship_events, conversations, conversation_messages] = await Promise.all([
      q('personal_memories', (s) => s.order('created_at')),
      q('relationships', (s) => s.order('name')),
      q('relationship_events', (s) => s.order('created_at')),
      q('conversations', (s) => s.order('created_at')),
      q('conversation_messages', (s) => s.order('created_at', { ascending: false }).limit(5000)),
    ]);
    const stamp = new Date().toISOString().slice(0, 10);
    res.set({ 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="karwahe-export-${stamp}.json"`, 'Cache-Control': 'no-store' });
    res.send(JSON.stringify({ exported_at: new Date().toISOString(), memories, relationships, relationship_events, conversations, conversation_messages }, null, 2));
  } catch (err) { next(err); }
});
