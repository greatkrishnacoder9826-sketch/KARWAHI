// Finds which stored people a message is about and builds a small, sanitized context block for the AI.
const GENERIC = new Set(['didi', 'di', 'bhai', 'bhaiya', 'sir', 'madam', 'mam', 'ji', 'bhabhi']);
const MAX_CONTEXT_CHARS = 2500;

export function tokens(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
}

/** Returns { people, ambiguous }. Distinct name parts and aliases match directly; a bare "Didi" matches every Didi (ambiguous). */
export function pickMentioned(people, message) {
  const mt = tokens(message);
  const set = new Set(mt);
  const phrase = ` ${mt.join(' ')} `;
  const direct = [], generic = [];
  for (const p of people) {
    const nameTokens = tokens(p.name);
    const keys = nameTokens.filter((t) => !GENERIC.has(t) && t.length >= 3);
    const aliasPhrases = (p.aliases || []).map((a) => tokens(a).join(' ')).filter(Boolean);
    const hit = keys.some((k) => set.has(k)) || aliasPhrases.some((a) => phrase.includes(` ${a} `));
    if (hit) direct.push(p);
    else if (nameTokens.some((t) => GENERIC.has(t) && set.has(t))) generic.push(p);
  }
  if (direct.length) return { people: direct.slice(0, 4), ambiguous: false };
  if (generic.length) return { people: generic.slice(0, 3), ambiguous: generic.length > 1 };
  return { people: [], ambiguous: false };
}

const clean = (s) => String(s ?? '').replace(/<\/?\s*context[^>]*>/gi, '').replace(/\s+/g, ' ').trim();

export function buildContext({ people, ambiguous }, eventsByPerson = {}) {
  if (!people.length) return '';
  const lines = people.map((p) => {
    const parts = [`${clean(p.name)}`];
    if (p.relation) parts.push(`relation: ${clean(p.relation)}`);
    if (p.description) parts.push(`user says: ${clean(p.description)}`);
    if (p.my_feelings) parts.push(`user feels: ${clean(p.my_feelings)}`);
    for (const f of p.facts || []) parts.push(`${clean(f.key)}: ${clean(f.value)}`);
    const ev = (eventsByPerson[p.id] || []).map((e) => `${e.happened_on ? `${e.happened_on}: ` : ''}${clean(e.event_text)}`);
    if (ev.length) parts.push(`events the user shared: ${ev.join(' | ')}`);
    return `- ${parts.join(' | ')}`;
  });
  let body = lines.join('\n');
  if (body.length > MAX_CONTEXT_CHARS) body = `${body.slice(0, MAX_CONTEXT_CHARS)}...`;
  const note = ambiguous ? 'AMBIGUOUS: the message uses a generic title that fits several people below.\n' : '';
  return `<context type="people">\n${note}${body}\n</context>`;
}

/** Loads the user's people through their own RLS-scoped client and returns a context string ('' if nothing relevant). */
export async function relationshipContext(db, message) {
  const { data: all, error } = await db.from('relationships').select('id,name,relation,description,my_feelings,aliases,facts').limit(100);
  if (error || !all?.length) return '';
  const picked = pickMentioned(all, message);
  if (!picked.people.length) return '';
  const ids = picked.people.map((p) => p.id);
  const { data: events } = await db.from('relationship_events').select('relationship_id,event_text,happened_on,created_at')
    .in('relationship_id', ids).order('created_at', { ascending: false }).limit(40);
  const byPerson = {};
  for (const e of events || []) { (byPerson[e.relationship_id] ||= []); if (byPerson[e.relationship_id].length < 5) byPerson[e.relationship_id].push(e); }
  return buildContext(picked, byPerson);
}
