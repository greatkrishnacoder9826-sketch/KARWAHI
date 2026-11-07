import { config, requireConfig } from '../../config/env.js';

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

function fail(message, status) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  return err;
}

/** Calls Groq's OpenAI-compatible chat endpoint. Provider details stay inside this module. */
export async function generateReply(messages) {
  requireConfig('groqApiKey', 'groqModel');
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.groqApiKey}` },
      body: JSON.stringify({ model: config.groqModel, messages, temperature: 0.7, max_tokens: 800 }),
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    throw fail('AI service did not respond in time', 504);
  }
  if (!res.ok) throw fail(res.status === 429 ? 'AI service is rate-limited, try again shortly' : 'AI service error', res.status === 429 ? 429 : 502);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw fail('AI service returned an empty reply', 502);
  return text;
}
