import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../backend/src/app.js';

let server, base;
test.before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

test('health is public', async () => {
  const r = await fetch(`${base}/api/health`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { status: 'ok' });
});
test('chat without token is rejected', async () => {
  const r = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"message":"hi"}' });
  assert.equal(r.status, 401);
});
test('chat with garbage token is rejected, not 500', async () => {
  const r = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer abc' }, body: '{"message":"hi"}' });
  assert.ok([401, 503].includes(r.status));
});
test('unknown route is 404', async () => {
  assert.equal((await fetch(`${base}/api/nope`)).status, 404);
});

test('voice endpoints require auth', async () => {
  for (const [path, method] of [['/api/voice/transcribe', 'POST'], ['/api/voice/speak', 'POST'], ['/api/voice/usage', 'GET']]) {
    const r = await fetch(`${base}${path}`, { method });
    assert.equal(r.status, 401, path);
  }
});

test('relationship endpoints require auth', async () => {
  for (const [path, method] of [['/api/relationships', 'GET'], ['/api/relationships', 'POST'], ['/api/relationships/seed', 'POST'], ['/api/relationships/3fa85f64-5717-4562-b3fc-2c963f66afa6', 'DELETE']]) {
    assert.equal((await fetch(`${base}${path}`, { method })).status, 401, `${method} ${path}`);
  }
});

test('memory and export endpoints require auth', async () => {
  for (const [path, method] of [['/api/memories', 'GET'], ['/api/memories', 'POST'], ['/api/export', 'GET'], ['/api/memories/3fa85f64-5717-4562-b3fc-2c963f66afa6', 'DELETE']])
    assert.equal((await fetch(`${base}${path}`, { method })).status, 401, `${method} ${path}`);
});
