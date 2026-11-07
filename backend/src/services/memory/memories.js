// Retrieves a few relevant saved memories for the AI context (keyword overlap; semantic/vector search is not built yet).
const STOP = new Set(['the', 'and', 'for', 'you', 'kya', 'hai', 'hain', 'mera', 'meri', 'mere', 'mujhe', 'main', 'aur', 'tum', 'ko', 'ka', 'ki', 'ke', 'se', 'me', 'mein', 'ho', 'tha', 'thi', 'karo', 'kar', 'bhi', 'nahi', 'yeh', 'ye', 'wo', 'woh']);
const words = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w));
const clean = (s) => String(s ?? '').replace(/<\/?\s*context[^>]*>/gi, '').replace(/\s+/g, ' ').trim();

export function pickMemories(memories, message, max = 6) {
  const q = new Set(words(message));
  const scored = memories.map((m) => ({ m, s: words(m.content).filter((w) => q.has(w)).length })).filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s).slice(0, max).map((r) => r.m);
  const always = memories.filter((m) => (m.category === 'profile' || m.category === 'preference') && !scored.includes(m)).slice(-3);
  return [...scored, ...always];
}

export function buildMemoryContext(picked) {
  if (!picked.length) return '';
  let body = picked.map((m) => `- ${clean(m.content)}`).join('\n');
  if (body.length > 1500) body = `${body.slice(0, 1500)}...`;
  return `<context type="memories">\n${body}\n</context>`;
}

export async function memoryContext(db, message) {
  const { data, error } = await db.from('personal_memories').select('content,category').order('created_at', { ascending: true }).limit(200);
  if (error || !data?.length) return '';
  return buildMemoryContext(pickMemories(data, message));
}
