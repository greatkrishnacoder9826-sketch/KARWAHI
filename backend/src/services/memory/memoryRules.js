export const CATEGORIES = ['general', 'preference', 'education', 'skill', 'project', 'goal', 'date', 'profile'];
export const MAX_MEMORIES = 200;
export const MAX_LEN = 500;

const bad = (message) => { const e = new Error(message); e.status = 400; e.expose = true; return e; };

export const normalize = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();

/** Things that must never be stored as memories (credentials, card/ID numbers, API keys). Returns a short label or null. */
export function refusalReason(text) {
  const t = String(text);
  const hits = [];
  if (/\b(password|passcode|otp|cvv)\b/i.test(t) || /\bpin\b(?!\s*code)/i.test(t)) hits.push('password/OTP/PIN');
  if (/(?:\d[ -]?){13,19}/.test(t)) hits.push('card ya account number');
  if (/\b\d{4}\s\d{4}\s\d{4}\b/.test(t) || /\b(aadhaar|aadhar|passport|pan\s*card|driving\s*licen[cs]e)\b[^.]*\d/i.test(t) || /\b[A-Z]{5}\d{4}[A-Z]\b/.test(t)) hits.push('government ID number');
  if (/\b(?:sk|gsk|xi|sb)[-_][A-Za-z0-9_-]{16,}/.test(t) || /\b(api[ _-]?key|secret[ _-]?key|access[ _-]?token)\b/i.test(t)) hits.push('API key/secret');
  return hits.length ? hits.join(', ') : null;
}

export function sensitivityOf(text) {
  return /\b(diagnos\w*|depress\w*|anxiety|therapy|medicine|dawa|bimari|illness|disease|salary|income|loan|debt|karz|religio\w*|dharm|vote|voting|party)\b/i.test(text) ? 'sensitive' : 'normal';
}

export function guessCategory(text) {
  if (/\b(pasand|favou?rite|prefer\w*|like|love|dislike|hate)\b/i.test(text)) return 'preference';
  if (/\b(exam|semester|bca|ignou|college|university|course|assignment|padhai)\b/i.test(text)) return 'education';
  if (/\b(project|repo|github|app|website)\b/i.test(text)) return 'project';
  if (/\b(goal|dream|banna|internship|career|job|target)\b/i.test(text)) return 'goal';
  if (/\b(birthday|deadline|date|tarikh)\b/i.test(text) || /\b\d{1,2}[\/-]\d{1,2}([\/-]\d{2,4})?\b/.test(text)) return 'date';
  if (/\b(skill|python|sql|excel|power ?bi|ml|machine learning)\b/i.test(text)) return 'skill';
  return 'general';
}

export function parseMemory(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object') throw bad('Body must be a JSON object');
  const out = {};
  if (body.content !== undefined || !partial) {
    if (typeof body.content !== 'string') throw bad('content must be a string');
    const c = body.content.trim().replace(/\s+/g, ' ');
    if (!c) throw bad('content is required');
    if (c.length > MAX_LEN) throw bad(`content is too long (max ${MAX_LEN} characters)`);
    const why = refusalReason(c);
    if (why) throw bad(`Ye ${why} jaisa lag raha hai. Aisi cheezein yahan save nahi hoti.`);
    out.content = c;
    out.sensitivity = sensitivityOf(c);
  }
  if (body.category !== undefined) {
    if (!CATEGORIES.includes(body.category)) throw bad(`category must be one of: ${CATEGORIES.join(', ')}`);
    out.category = body.category;
  } else if (!partial) out.category = guessCategory(out.content);
  return out;
}
