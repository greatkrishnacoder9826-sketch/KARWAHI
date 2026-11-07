export function createApi({ base, getToken }) {
  const auth = () => ({ Authorization: `Bearer ${getToken()}` });
  const parse = async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  };
  const post = (path, headers, body, signal) => fetch(`${base}${path}`, { method: 'POST', headers: { ...auth(), ...headers }, body, signal });

  const req = (method, path, body) =>
    fetch(`${base}${path}`, { method, headers: { ...auth(), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(parse);

  return {
    rel: {
      list: () => req('GET', '/api/relationships'),
      create: (p) => req('POST', '/api/relationships', p),
      update: (id, p) => req('PATCH', `/api/relationships/${id}`, p),
      remove: (id) => req('DELETE', `/api/relationships/${id}`),
      seed: () => req('POST', '/api/relationships/seed'),
      addEvent: (id, e) => req('POST', `/api/relationships/${id}/events`, e),
      removeEvent: (id, eid) => req('DELETE', `/api/relationships/${id}/events/${eid}`),
    },
    mem: {
      list: () => req('GET', '/api/memories'),
      create: (m) => req('POST', '/api/memories', m),
      update: (id, m) => req('PATCH', `/api/memories/${id}`, m),
      remove: (id) => req('DELETE', `/api/memories/${id}`),
    },
    exportAll: async () => {
      const res = await fetch(`${base}/api/export`, { headers: auth() });
      if (!res.ok) await parse(res);
      return res.blob();
    },
    chat: (message, conversationId, mode, signal) =>
      post('/api/chat', { 'Content-Type': 'application/json' }, JSON.stringify({ message, conversationId: conversationId || undefined, mode }), signal).then(parse),
    transcribe: (blob, signal) =>
      post('/api/voice/transcribe', { 'Content-Type': (blob.type || 'audio/webm').split(';')[0] }, blob, signal).then(parse),
    speak: async (text, signal) => {
      const res = await post('/api/voice/speak', { 'Content-Type': 'application/json' }, JSON.stringify({ text }), signal);
      if (!res.ok) await parse(res); // throws with the server's message
      return res.blob();
    },
  };
}
