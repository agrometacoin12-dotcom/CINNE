import test from 'node:test';
import assert from 'node:assert/strict';
import { nextFocus, mediaUrl, progressBody, remoteAction, escapeHtml } from '../src/core.js';

test('remote navigation chooses the same column across rails', () => {
  const current = { left: 0, right: 100, top: 0, bottom: 150 };
  const candidates = [
    { id: 'same-column', rect: { left: 0, right: 100, top: 300, bottom: 450 } },
    { id: 'diagonal', rect: { left: 110, right: 210, top: 160, bottom: 310 } }
  ];
  assert.equal(nextFocus(current, candidates, 'down'), 'same-column');
  assert.equal(nextFocus(current, candidates, 'left'), null);
});
test('TV key variants map to navigation and transport actions', () => {
  assert.equal(remoteAction({ keyCode: 461 }), 'back');
  assert.equal(remoteAction({ keyCode: 8 }), 'back');
  assert.equal(remoteAction({ keyCode: 415 }), 'play');
  assert.equal(remoteAction({ key: 'ArrowDown' }), 'down');
  assert.equal(remoteAction({ keyCode: 412 }), 'rewind');
});
test('heartbeat never invents a one-second duration that could consume a ticket', () => {
  assert.equal(progressBody(20, 0), null);
  assert.equal(progressBody(20, NaN), null);
  assert.equal(progressBody(Infinity, 120), null);
  assert.deepEqual(progressBody(60.4, 120.8, 'episode-1'), { positionSeconds: 60, durationSeconds: 120, episodeId: 'episode-1' });
  assert.deepEqual(progressBody(-1, 120), { positionSeconds: 0, durationSeconds: 120 });
});
test('art and labels reject executable schemes and escape markup', () => {
  assert.equal(mediaUrl('javascript:alert(1)', 'https://api.example.com'), '');
  assert.equal(mediaUrl('/media/a.jpg', 'https://api.example.com'), 'https://api.example.com/media/a.jpg');
  assert.equal(escapeHtml('<img src=x onerror="x">'), '&lt;img src=x onerror=&quot;x&quot;&gt;');
});
