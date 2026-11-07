import { Router } from 'express';
import { readFile } from 'node:fs/promises';
import { requireAuth } from '../middleware/auth.js';
import { parsePerson, parseEvent, isUuid } from '../services/memory/relationshipValidation.js';

export const relationshipsRouter = Router();
relationshipsRouter.use(requireAuth);
relationshipsRouter.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

const MAX_PEOPLE = 100;
const httpError = (status, message) => { const e = new Error(message); e.status = status; e.expose = true; return e; };
const checkId = (id) => { if (!isUuid(id)) throw httpError(400, 'Invalid id'); };

relationshipsRouter.get('/', async (req, res, next) => {
  try {
    const { data: people, error } = await req.db.from('relationships').select('*').order('name').limit(MAX_PEOPLE);
    if (error) throw error;
    let events = [];
    if (people.length) {
      const r = await req.db.from('relationship_events').select('*').in('relationship_id', people.map((p) => p.id)).order('created_at', { ascending: false });
      if (r.error) throw r.error;
      events = r.data;
    }
    res.json({ people: people.map((p) => ({ ...p, events: events.filter((e) => e.relationship_id === p.id) })) });
  } catch (err) { next(err); }
});

relationshipsRouter.post('/', async (req, res, next) => {
  try {
    const fields = parsePerson(req.body);
    const { count, error: ce } = await req.db.from('relationships').select('id', { count: 'exact', head: true });
    if (ce) throw ce;
    if (count >= MAX_PEOPLE) throw httpError(400, `Limit reached (${MAX_PEOPLE} people)`);
    const { data, error } = await req.db.from('relationships').insert({ ...fields, user_id: req.user.id, source: 'user' }).select().single();
    if (error) throw error;
    res.status(201).json({ person: { ...data, events: [] } });
  } catch (err) { next(err); }
});

// Seed the user's starting people from a private server-side file. Idempotent: skips names that already exist.
relationshipsRouter.post('/seed', async (req, res, next) => {
  try {
    let seed;
    try { seed = JSON.parse(await readFile(new URL('../../seed/relationships.seed.json', import.meta.url), 'utf8')); }
    catch { throw httpError(404, 'Seed file not found on the server'); }
    const { data: existing, error } = await req.db.from('relationships').select('name');
    if (error) throw error;
    const have = new Set(existing.map((r) => r.name.toLowerCase()));
    const rows = seed.map((s) => parsePerson(s)).filter((p) => !have.has(p.name.toLowerCase()))
      .map((p) => ({ ...p, user_id: req.user.id, source: 'seed' }));
    if (rows.length) { const r = await req.db.from('relationships').insert(rows); if (r.error) throw r.error; }
    res.json({ added: rows.length, skipped: seed.length - rows.length });
  } catch (err) { next(err); }
});

relationshipsRouter.patch('/:id', async (req, res, next) => {
  try {
    checkId(req.params.id);
    const fields = parsePerson(req.body, { partial: true });
    if (!Object.keys(fields).length) throw httpError(400, 'Nothing to update');
    const { data, error } = await req.db.from('relationships').update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).select().maybeSingle();
    if (error) throw error;
    if (!data) throw httpError(404, 'Person not found');
    res.json({ person: data });
  } catch (err) { next(err); }
});

relationshipsRouter.delete('/:id', async (req, res, next) => {
  try {
    checkId(req.params.id);
    const { data, error } = await req.db.from('relationships').delete().eq('id', req.params.id).select('id');
    if (error) throw error;
    if (!data.length) throw httpError(404, 'Person not found');
    res.json({ deleted: true }); // events are removed by ON DELETE CASCADE
  } catch (err) { next(err); }
});

relationshipsRouter.post('/:id/events', async (req, res, next) => {
  try {
    checkId(req.params.id);
    const ev = parseEvent(req.body);
    const { data: owner, error: oe } = await req.db.from('relationships').select('id').eq('id', req.params.id).maybeSingle();
    if (oe) throw oe;
    if (!owner) throw httpError(404, 'Person not found');
    const { data, error } = await req.db.from('relationship_events').insert({ ...ev, user_id: req.user.id, relationship_id: req.params.id }).select().single();
    if (error) throw error;
    res.status(201).json({ event: data });
  } catch (err) { next(err); }
});

relationshipsRouter.delete('/:id/events/:eventId', async (req, res, next) => {
  try {
    checkId(req.params.id); checkId(req.params.eventId);
    const { data, error } = await req.db.from('relationship_events').delete().eq('id', req.params.eventId).eq('relationship_id', req.params.id).select('id');
    if (error) throw error;
    if (!data.length) throw httpError(404, 'Event not found');
    res.json({ deleted: true });
  } catch (err) { next(err); }
});
