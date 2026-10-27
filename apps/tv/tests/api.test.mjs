import test from 'node:test';
import assert from 'node:assert/strict';
import { TvApi } from '../src/api.js';

function storage(token = 'old-refresh') {
  const data = new Map([['ct.tv.refresh', token]]);
  return { getItem: k => data.get(k), setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
}
const pair = { accessToken: 'fresh-access', refreshToken: 'fresh-refresh' };

test('concurrent expired requests rotate once and both retry', async () => {
  let rotations = 0;
  const api = new TvApi('https://api.example.com', storage(), async (url, opts) => {
    if (url.endsWith('/refresh')) { rotations++; await new Promise(r => setTimeout(r, 10)); return { status: 200, body: pair }; }
    return { status: opts.headers.Authorization === 'Bearer fresh-access' ? 200 : 401, body: { ok: true } };
  });
  api.access = 'old-access';
  const results = await Promise.all([api.request('/one', { auth: true }), api.request('/two', { auth: true })]);
  assert.equal(rotations, 1);
  assert.ok(results.every(x => x.ok));
});
test('a delayed stale 401 uses already refreshed tokens without rotating again', async () => {
  let rotations = 0;
  const api = new TvApi('https://api.example.com', storage(), async (url, opts) => {
    if (url.endsWith('/refresh')) { rotations++; return { status: 200, body: pair }; }
    if (opts.headers.Authorization === 'Bearer fresh-access') return { status: 200, body: {} };
    if (url.endsWith('/slow')) await new Promise(r => setTimeout(r, 30));
    return { status: 401, body: {} };
  });
  api.access = 'old-access';
  await Promise.all([api.request('/fast', { auth: true }), api.request('/slow', { auth: true })]);
  assert.equal(rotations, 1);
});
for (const status of [429, 500, 503]) {
  test('refresh HTTP ' + status + ' keeps the session and surfaces the transient error', async () => {
    const store = storage();
    const api = new TvApi('https://api.example.com', store, async () => ({ status, body: { detail: 'Try later' } }));
    await assert.rejects(api.request('/me', { auth: true }), { status });
    assert.equal(store.getItem('ct.tv.refresh'), 'old-refresh');
  });
}
test('definitively rejected refresh clears local session', async () => {
  const store = storage();
  const api = new TvApi('https://api.example.com', store, async () => ({ status: 401, body: {} }));
  let notified = false;
  api.onSessionLost = () => { notified = true; };
  await assert.rejects(api.request('/me', { auth: true }), { status: 401 });
  assert.equal(store.getItem('ct.tv.refresh'), undefined);
  assert.equal(notified, true);
});
test('logout during refresh cannot resurrect a session', async () => {
  let complete;
  const store = storage();
  const api = new TvApi('https://api.example.com', store, () => new Promise(resolve => { complete = resolve; }));
  const pending = api.rotate();
  api.clear();
  complete({ status: 200, body: pair });
  await assert.rejects(pending, { status: 401 });
  assert.equal(api.access, null);
  assert.equal(store.getItem('ct.tv.refresh'), undefined);
});
test('network errors preserve the refresh token', async () => {
  const store = storage();
  const api = new TvApi('https://api.example.com', store, async () => { throw new Error('offline'); });
  await assert.rejects(api.rotate(), /offline/);
  assert.equal(store.getItem('ct.tv.refresh'), 'old-refresh');
});
