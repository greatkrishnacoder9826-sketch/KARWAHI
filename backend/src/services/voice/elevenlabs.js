
import { config, requireConfig } from '../../config/env.js';

const BASE = 'https://api.elevenlabs.io/v1';

function fail(message, status) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  return err;
}

function providerError(status) {
  if (status === 401 || status === 403) {
    return fail('Voice provider rejected the API key or plan', 502);
  }

  if (status === 429) {
    return fail('Voice provider rate limit reached. Try again shortly.', 429);
  }

  if (status === 404) {
    return fail(
      'Voice or model not found. Check ELEVENLABS_VOICE_ID and model settings.',
      502
    );
  }

  return fail(`Voice provider error (${status})`, 502);
}


async function providerFetch(url, options) {
  let response;

  try {
    response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    if (
      error.name === 'TimeoutError' ||
      error.name === 'AbortError'
    ) {
      throw fail('Voice provider request timed out', 504);
    }

    throw fail('Could not connect to the voice provider', 502);
  }

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    console.error(
      'ElevenLabs error:',
      response.status,
      details.slice(0, 1500)
    );

    if (response.status === 402) {
      throw fail(
        `ElevenLabs billing/credits issue (402): ${details.slice(0, 500)}`,
        502
      );
    }

    throw providerError(response.status);
  }

  return response;
}

/**
 * Speech-to-text
 * Receives an audio buffer and returns { text, language }.
 */
export async function transcribe(buffer, mime = 'audio/webm') {
  requireConfig('elevenlabsKey', 'elevenSttModel');

  if (!Buffer.isBuffer(buffer) || buffer.length < 1500) {
    throw fail('Audio is missing or too short', 400);
  }

  const extension = mime.includes('mp4')
    ? 'm4a'
    : mime.includes('ogg')
      ? 'ogg'
      : 'webm';

  const form = new FormData();
  form.append('model_id', config.elevenSttModel);
  form.append(
    'file',
    new Blob([buffer], { type: mime }),
    `speech.${extension}`
  );

  const response = await providerFetch(
    `${BASE}/speech-to-text`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': config.elevenlabsKey,
      },
      body: form,
    }
  );

  const data = await response.json();

  return {
    text: (data.text || '').trim(),
    language: data.language_code || null,
  };
}

/**
 * Text-to-speech
 * Receives text and returns an MP3 Buffer.
 */
export async function synthesize(text) {
  requireConfig(
    'elevenlabsKey',
    'elevenVoiceId',
    'elevenTtsModel'
  );

  if (typeof text !== 'string' || !text.trim()) {
    throw fail('Text is required for speech generation', 400);
  }

  const body = {
    text: text.trim(),
    model_id: config.elevenTtsModel,
  };

  if (config.elevenSpeed) {
    body.voice_settings = {
      speed: config.elevenSpeed,
    };
  }

  const url =
    `${BASE}/text-to-speech/` +
    `${encodeURIComponent(config.elevenVoiceId)}` +
    '?output_format=mp3_44100_128';

  const response = await providerFetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': config.elevenlabsKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify(body),
  });

  return Buffer.from(await response.arrayBuffer());
}
