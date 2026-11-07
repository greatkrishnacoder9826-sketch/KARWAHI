import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import { transcribe, synthesize } from '../services/voice/index.js';
import { spend, refund, snapshot } from '../services/voice/usage.js';
import { cleanForSpeech } from '../utils/speechText.js';

export const voiceRouter = Router();

voiceRouter.use(requireAuth);
voiceRouter.use(rateLimit({ windowMs: 60_000, limit: 40, keyGenerator: (req) => req.user.id, standardHeaders: true, legacyHeaders: false }));

// Raw audio body (webm/mp4/ogg). Hard 5 MB cap; tiny uploads are rejected.
voiceRouter.post('/transcribe', express.raw({ type: 'audio/*', limit: '5mb' }), async (req, res, next) => {
  try {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length < 1500) return res.status(400).json({ error: 'Audio missing or too short' });
    const mime = (req.get('content-type') || 'audio/webm').split(';')[0];
    res.json(await transcribe(buf, mime));
  } catch (err) { next(err); }
});

voiceRouter.post('/speak', async (req, res, next) => {
  let charged = 0;
  try {
    const raw = req.body?.text;
    if (typeof raw !== 'string' || raw.length > 4000) return res.status(400).json({ error: 'text must be a string up to 4000 characters' });
    const text = cleanForSpeech(raw);
    if (!text) return res.status(400).json({ error: 'Nothing speakable in text' });
    if (!spend(req.user.id, text.length)) return res.status(429).json({ error: 'Daily voice limit reached. Text chat use karo ya kal try karo' });
    charged = text.length;
    const audio = await synthesize(text);
    res.set({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' }).send(audio);
  } catch (err) {
    if (charged) refund(req.user.id, charged);
    next(err);
  }
});

voiceRouter.get('/usage', (req, res) => res.json(snapshot(req.user.id)));
