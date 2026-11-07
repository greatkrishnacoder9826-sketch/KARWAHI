import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { SYSTEM_PROMPT, VOICE_HINT, RELATIONSHIP_GUIDE, MEMORY_GUIDE } from '../prompts/personality.js';
import { relationshipContext } from '../services/memory/relationships.js';
import { memoryContext } from '../services/memory/memories.js';
import { parseCommand, executeCommand } from '../services/memory/commands.js';
import { createStore } from '../services/memory/store.js';
import { generateReply } from '../services/ai/groq.js';
import { ensureConversation, recentMessages, saveExchange } from '../services/conversations/store.js';

export const chatRouter = Router();

chatRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const { message, conversationId, mode } = req.body || {};
    if (typeof message !== 'string' || !message.trim() || message.length > 4000)
      return res.status(400).json({ error: 'message must be a non-empty string up to 4000 characters' });
    if (conversationId !== undefined && typeof conversationId !== 'string')
      return res.status(400).json({ error: 'conversationId must be a string' });

    if (mode !== undefined && mode !== 'text' && mode !== 'voice')
      return res.status(400).json({ error: "mode must be 'text' or 'voice'" });

    const convId = await ensureConversation(req.db, req.user.id, conversationId);
    // Explicit remember/forget/list commands run on the backend; the reply only states what the database really did.
    const cmd = parseCommand(message);
    if (cmd) {
      const reply = await executeCommand({ store: createStore(req.db, req.user.id), cmd, mode });
      await saveExchange(req.db, req.user.id, convId, message.trim(), reply);
      return res.json({ conversationId: convId, reply, command: cmd.type });
    }

    const history = await recentMessages(req.db, convId);
    // Relevant people only; a failure here must never break the chat.
    const peopleCtx = await relationshipContext(req.db, message.trim()).catch(() => '');
    const memCtx = await memoryContext(req.db, message.trim()).catch(() => '');
    const reply = await generateReply([
      { role: 'system', content: SYSTEM_PROMPT },
      ...(mode === 'voice' ? [{ role: 'system', content: VOICE_HINT }] : []),
      ...(peopleCtx ? [{ role: 'system', content: `${RELATIONSHIP_GUIDE}\n\n${peopleCtx}` }] : []),
      ...(memCtx ? [{ role: 'system', content: `${MEMORY_GUIDE}\n\n${memCtx}` }] : []),
      ...history,
      { role: 'user', content: message.trim() },
    ]);
    await saveExchange(req.db, req.user.id, convId, message.trim(), reply);
    res.json({ conversationId: convId, reply });
  } catch (err) { next(err); }
});
