
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({
  path: fileURLToPath(new URL('../../../.env', import.meta.url)),
});

const num = (v, d) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export const config = {
  port: Number(process.env.PORT || 3000),
  frontendOrigin:
    process.env.FRONTEND_ORIGIN || 'http://localhost:5500',

  // Supabase
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,

  // Groq
  groqApiKey: process.env.GROQ_API_KEY,
  groqModel: process.env.GROQ_MODEL,

  // ElevenLabs Voice
  elevenlabsKey: process.env.ELEVENLABS_API_KEY,
  elevenSttModel:
    process.env.ELEVENLABS_STT_MODEL || 'scribe_v2',
  elevenVoiceId: process.env.ELEVENLABS_VOICE_ID,
  elevenTtsModel:
    process.env.ELEVENLABS_TTS_MODEL ||
    'eleven_multilingual_v2',
  elevenSpeed: process.env.ELEVENLABS_SPEED
    ? clamp(num(process.env.ELEVENLABS_SPEED, 1), 0.7, 1.2)
    : undefined,
  voiceDailyChars: num(process.env.VOICE_DAILY_CHARS, 20000),
};

/**
 * Throws a clear error when a required setting is missing.
 */
export function requireConfig(...keys) {
  const missing = keys.filter((key) => !config[key]);

  if (missing.length) {
    const err = new Error(
      `Server is not configured: missing ${missing.join(', ')}`
    );
    err.status = 503;
    err.expose = false;
    throw err;
  }
}
