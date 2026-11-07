// Thin data-access layer over Supabase (RLS-scoped client). Commands use this interface so they can be tested with a fake.
const fail = (e) => { if (e) throw e; };

export function createStore(db, userId) {
  return {
    async listMemories() {
      const { data, error } = await db.from('personal_memories').select('id,content,category,sensitivity,created_at')
        .order('created_at', { ascending: true }).limit(500);
      fail(error); return data;
    },
    async insertMemory(row) {
      const { data, error } = await db.from('personal_memories').insert({ ...row, user_id: userId }).select('id').single();
      fail(error); return data.id;
    },
    async updateMemory(id, patch) {
      const { data, error } = await db.from('personal_memories').update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id).select('id');
      fail(error); return data.length === 1;
    },
    async deleteMemory(id) {
      const { data, error } = await db.from('personal_memories').delete().eq('id', id).select('id');
      fail(error); return data.length === 1;
    },
    async listPeople() {
      const { data, error } = await db.from('relationships').select('id,name,aliases').limit(100);
      fail(error); return data;
    },
    async addEvent(relationshipId, text) {
      const { data, error } = await db.from('relationship_events')
        .insert({ user_id: userId, relationship_id: relationshipId, event_text: text }).select('id').single();
      fail(error); return data.id;
    },
  };
}
