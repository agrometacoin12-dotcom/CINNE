import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const storage = new Map();
globalThis.window = { localStorage: {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: key => storage.delete(key),
} };
const { outputFiles } = await build({ entryPoints: ['src/lib/api-client.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { HttpApiClient } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const input = { email: 'producer@example.test', name: 'Producer', revenueShareBps: 5000 };

test('all producer operations send the admin bearer token', async () => {
  storage.set('studio.tokens', JSON.stringify({ accessToken: 'admin-access', refreshToken: 'refresh' }));
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, ...options });
    return new Response(JSON.stringify({ producer: null }), { status: 200 });
  };
  const client = new HttpApiClient();
  await client.getProducer('movie');
  await client.lookupProducer(input.email);
  await client.assignProducer('movie', input);
  await client.resendProducer('movie');
  assert.equal(calls.length, 4);
  for (const call of calls) assert.equal(call.headers.Authorization, 'Bearer admin-access');
  assert.deepEqual(calls.map(call => call.method), ['GET', 'GET', 'PUT', 'POST']);
  assert.deepEqual(JSON.parse(calls[2].body), input);
});

test('producer save refreshes an expired session and retries the same assignment once', async () => {
  storage.set('studio.tokens', JSON.stringify({ accessToken: 'expired', refreshToken: 'refresh' }));
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, ...options });
    if (url.endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'renewed', refreshToken: 'new-refresh' }));
    if (options.headers.Authorization === 'Bearer expired') return new Response('{}', { status: 401 });
    return new Response(JSON.stringify(input));
  };
  assert.deepEqual(await new HttpApiClient().assignProducer('movie', input), input);
  assert.equal(calls.length, 3);
  assert.equal(calls[2].headers.Authorization, 'Bearer renewed');
  assert.equal(calls[2].body, calls[0].body);
  assert.equal(JSON.parse(storage.get('studio.tokens')).accessToken, 'renewed');
});

test('a forbidden producer assignment remains an error', async () => {
  storage.set('studio.tokens', JSON.stringify({ accessToken: 'not-admin', refreshToken: 'refresh' }));
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 }); };
  await assert.rejects(new HttpApiClient().assignProducer('movie', input), error => error.status === 403);
  assert.equal(calls, 1);
});
