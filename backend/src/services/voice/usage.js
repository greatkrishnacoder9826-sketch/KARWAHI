import { config } from '../../config/env.js';

// In-memory per-user daily TTS character counter. Resets on server restart (documented limitation).
const usage = new Map();
const today = () => new Date().toISOString().slice(0, 10);

function entry(userId) {
  const e = usage.get(userId);
  if (!e || e.day !== today()) { const fresh = { day: today(), chars: 0 }; usage.set(userId, fresh); return fresh; }
  return e;
}
export function spend(userId, chars) {
  const e = entry(userId);
  if (e.chars + chars > config.voiceDailyChars) return false;
  e.chars += chars;
  return true;
}
export function refund(userId, chars) { const e = entry(userId); e.chars = Math.max(0, e.chars - chars); }
export function snapshot(userId) { return { charsUsedToday: entry(userId).chars, dailyLimit: config.voiceDailyChars }; }
