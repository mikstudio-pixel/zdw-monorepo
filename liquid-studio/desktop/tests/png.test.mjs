import test from 'node:test';
import assert from 'node:assert/strict';
import { decodePng } from '../main/png.js';

test('PNG export rejects invalid or oversized IPC payloads', () => {
  for (const value of [null, {}, 'data:text/html;base64,PHNjcmlwdD4=',
    'data:image/png;base64,bm90IGEgcG5n', 'data:image/png;base64,%%%%', 'x'.repeat(16 * 1024 * 1024 + 1)]) {
    assert.throws(() => decodePng(value), /PNG/);
  }
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII=';
  assert.equal(decodePng(`data:image/png;base64,${png}`).toString('base64'), png);
});
