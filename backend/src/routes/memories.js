import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { parseMemory, normalize, MAX_MEMORIES } from '../services/memory/memoryRules.js';
import { isUuid } from '../services/memory/relationshipValidation.js';

export const memoriesRouter = Router();
memoriesRouter.use(requireAuth);
memoriesRouter.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

const httpError = (status, message) => { const e = new Error(message); e.status = status; e.expose = true; return e; };
const checkId = (id) => { if (!isUuid(id)) throw httpError(400, 'Invalid id'); };

memoriesRouter.get('/', async (req, res, next) => {
  try {
    const { data, error } = await req.db.from('personal_memories').select('*').order('created_at', { ascending: true }).limit(MAX_MEMORIES);
    if (error) throw error;
    res.json({ memories: data });
  } catch (err) { next(err); }
});

memoriesRouter.post('/', async (req, res, next) => {
  try {
    const fields = parseMemory(req.body);
    const { data: existing, error: le } = await req.db.from('personal_memories').select('content');
    if (le) throw le;
    if (existing.length >= MAX_MEMORIES) throw httpError(400, `Limit reached (${MAX_MEMORIES} memories)`);
    if (existing.some((x) => normalize(x.content) === normalize(fields.content))) throw httpError(409, 'Ye memory pehle se saved hai');
    const { data, error } = await req.db.from('personal_memories').insert({ ...fields, user_id: req.user.id, source: 'user' }).select().single();
    if (error) throw error;
    res.status(201).json({ memory: data });
  } catch (err) { next(err); }
});

memoriesRouter.patch('/:id', async (req, res, next) => {
  try {
    checkId(req.params.id);
    const fields = parseMemory(req.body, { partial: true });
    if (!Object.keys(fields).length) throw httpError(400, 'Nothing to update');
    const { data, error } = await req.db.from('personal_memories')
      .update({ ...fields, updated_at: new Date().toISOString(), last_confirmed_at: new Date().toISOString() })
      .eq('id', req.params.id).select().maybeSingle();
    if (error) throw error;
    if (!data) throw httpError(404, 'Memory not found');
    res.json({ memory: data });
  } catch (err) { next(err); }
});

memoriesRouter.delete('/:id', async (req, res, next) => {
  try {
    checkId(req.params.id);
    const { data, error } = await req.db.from('personal_memories').delete().eq('id', req.params.id).select('id');
    if (error) throw error;
    if (!data.length) throw httpError(404, 'Memory not found');
    res.json({ deleted: true });
  } catch (err) { next(err); }
});
