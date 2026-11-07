import test from 'node:test';
import assert from 'node:assert/strict';

process.env.ELEVENLABS_API_KEY = 'test-key';
process.env.ELEVENLABS_VOICE_ID = 'voice123';
process.env.ELEVENLABS_TTS_MODEL = 'test_model';
const { transcribe, synthesize } = await import('../backend/src/services/voice/elevenlabs.js');
const { cleanForSpeech } = await import('../backend/src/utils/speechText.js');
const { VoiceStateMachine } = await import('../frontend/js/voice-state.js');

const realFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = realFetch; });

test('STT request matches documented shape', async () => {
  let call;
  globalThis.fetch = async (url, opts) => { call = { url, opts }; return new Response(JSON.stringify({ text: ' namaste ', language_code: 'hin' })); };
  const out = await transcribe(Buffer.alloc(3000), 'audio/webm');
  assert.equal(call.url, 'https://api.elevenlabs.io/v1/speech-to-text');
  assert.equal(call.opts.method, 'POST');
  assert.equal(call.opts.headers['xi-api-key'], 'test-key');
  assert.equal(call.opts.body.get('model_id'), 'scribe_v2');
  assert.equal(call.opts.body.get('file').name, 'speech.webm');
  assert.deepEqual(out, { text: 'namaste', language: 'hin' });
});

test('TTS request matches documented shape and returns bytes', async () => {
  let call;
  globalThis.fetch = async (url, opts) => { call = { url, opts }; return new Response(new Uint8Array([1, 2, 3])); };
  const audio = await synthesize('hello');
  assert.equal(call.url, 'https://api.elevenlabs.io/v1/text-to-speech/voice123?output_format=mp3_44100_128');
  assert.equal(call.opts.headers['xi-api-key'], 'test-key');
  assert.deepEqual(JSON.parse(call.opts.body), { text: 'hello', model_id: 'test_model' });
  assert.equal(audio.length, 3);
});

test('provider errors are mapped without leaking details', async () => {
  globalThis.fetch = async () => new Response('secret detail', { status: 401 });
  await assert.rejects(() => synthesize('x'), (e) => e.status === 502 && e.expose && !/secret/.test(e.message));
  globalThis.fetch = async () => new Response('', { status: 429 });
  await assert.rejects(() => transcribe(Buffer.alloc(3000)), (e) => e.status === 429);
});

test('cleanForSpeech strips markdown, code, urls, emoji and caps length', () => {
  assert.equal(cleanForSpeech('**Hi** `x` https://a.com 😀 ```code``` bye'), 'Hi x bye');
  assert.ok(cleanForSpeech('Ek baat. '.repeat(400)).length <= 1500);
  assert.equal(cleanForSpeech(42), '');
});

test('state machine rejects invalid and duplicate transitions', () => {
  const seen = [];
  const sm = new VoiceStateMachine((to) => seen.push(to));
  assert.equal(sm.go('speaking'), false);            // idle -> speaking invalid
  assert.equal(sm.go('requesting_microphone'), true);
  assert.equal(sm.go('requesting_microphone'), false); // duplicate callback ignored
  assert.equal(sm.go('listening'), true);
  assert.equal(sm.go('transcribing'), true);
  assert.equal(sm.go('thinking'), true);
  assert.equal(sm.go('speaking'), true);
  assert.equal(sm.go('interrupted'), true);
  assert.equal(sm.go('listening'), true);
  assert.equal(sm.go('idle'), true);
  assert.deepEqual(seen, ['requesting_microphone', 'listening', 'transcribing', 'thinking', 'speaking', 'interrupted', 'listening', 'idle']);
});
