import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config/env.js';
import { healthRouter } from './routes/health.js';
import { chatRouter } from './routes/chat.js';
import { voiceRouter } from './routes/voice.js';
import { relationshipsRouter } from './routes/relationships.js';
import { memoriesRouter } from './routes/memories.js';
import { exportRouter } from './routes/export.js';

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: config.frontendOrigin }));
  app.use(express.json({ limit: '32kb' }));
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false }));

  app.use('/api/health', healthRouter);
  app.use('/api/chat', chatRouter);
  app.use('/api/voice', voiceRouter);
  app.use('/api/relationships', relationshipsRouter);
  app.use('/api/memories', memoriesRouter);
  app.use('/api/export', exportRouter);

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  // Central error handler: never leaks provider details or secrets.
  app.use((err, _req, res, _next) => {
    const status = err.status || 500;
    if (status >= 500 && !err.expose) console.error('[error]', err.message);
    res.status(status).json({ error: err.expose ? err.message : status === 503 ? 'Service unavailable' : 'Something went wrong' });
  });
  return app;
}
