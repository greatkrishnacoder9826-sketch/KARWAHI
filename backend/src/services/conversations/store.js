const HISTORY_LIMIT = 12;

export async function ensureConversation(db, userId, conversationId) {
  if (conversationId) {
    const { data, error } = await db.from('conversations').select('id').eq('id', conversationId).maybeSingle();
    if (error) throw error;
    if (!data) { const e = new Error('Conversation not found'); e.status = 404; e.expose = true; throw e; }
    return data.id;
  }
  const { data, error } = await db.from('conversations').insert({ user_id: userId }).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function recentMessages(db, conversationId) {
  const { data, error } = await db
    .from('conversation_messages').select('role, content')
    .eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(HISTORY_LIMIT);
  if (error) throw error;
  return data.reverse();
}

export async function saveExchange(db, userId, conversationId, userText, assistantText) {
  const { error } = await db.from('conversation_messages').insert([
    { user_id: userId, conversation_id: conversationId, role: 'user', content: userText },
    { user_id: userId, conversation_id: conversationId, role: 'assistant', content: assistantText },
  ]);
  if (error) throw error;
}
