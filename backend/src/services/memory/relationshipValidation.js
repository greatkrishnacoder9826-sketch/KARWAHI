const bad = (message) => { const e = new Error(message); e.status = 400; e.expose = true; return e; };

function str(v, max, field, { required = false } = {}) {
  if (v === undefined) return undefined;
  if (typeof v !== 'string') throw bad(`${field} must be a string`);
  const t = v.trim();
  if (required && !t) throw bad(`${field} is required`);
  if (t.length > max) throw bad(`${field} is too long (max ${max} characters)`);
  return t;
}

/** Validates a person payload. With partial=true only provided fields are returned (for PATCH). */
export function parsePerson(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object') throw bad('Body must be a JSON object');
  const out = {};
  const set = (k, v) => { if (v !== undefined) out[k] = v; };
  set('name', str(body.name, 80, 'name', { required: !partial || body.name !== undefined }));
  if (!partial && out.name === undefined) throw bad('name is required');
  set('relation', str(body.relation, 120, 'relation'));
  set('description', str(body.description, 1000, 'description'));
  set('my_feelings', str(body.my_feelings, 1000, 'my_feelings'));

  if (body.aliases !== undefined) {
    if (!Array.isArray(body.aliases) || body.aliases.length > 8) throw bad('aliases must be an array of up to 8 names');
    out.aliases = body.aliases.map((a) => str(a, 40, 'alias')).filter(Boolean);
  }
  if (body.facts !== undefined) {
    if (!Array.isArray(body.facts) || body.facts.length > 20) throw bad('facts must be an array of up to 20 details');
    out.facts = body.facts.map((f) => {
      if (!f || typeof f !== 'object') throw bad('each fact must be {key, value}');
      return { key: str(f.key, 40, 'fact key', { required: true }), value: str(f.value, 200, 'fact value', { required: true }) };
    });
  }
  return out;
}

export function parseEvent(body) {
  if (!body || typeof body !== 'object') throw bad('Body must be a JSON object');
  const event_text = str(body.event_text, 500, 'event_text', { required: true });
  let happened_on = null;
  if (body.happened_on !== undefined && body.happened_on !== null && body.happened_on !== '') {
    if (typeof body.happened_on !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.happened_on) || Number.isNaN(Date.parse(body.happened_on)))
      throw bad('happened_on must be a date like 2026-10-31');
    happened_on = body.happened_on;
  }
  return { event_text, happened_on };
}

export const isUuid = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
