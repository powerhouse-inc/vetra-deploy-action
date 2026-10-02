import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTokenSource } from '../src/token-source.js';

test('createTokenSource reuses a token until it is maxAgeMs old, then mints a fresh one', async () => {
  let t = 0;
  let n = 0;
  const get = createTokenSource(async () => `tok-${++n}`, { maxAgeMs: 1000, now: () => t });
  assert.equal(await get(), 'tok-1');
  t = 999;
  assert.equal(await get(), 'tok-1');
  t = 1000;
  assert.equal(await get(), 'tok-2');
});
