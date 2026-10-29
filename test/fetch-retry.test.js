import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withUnansweredRetry } from '../src/fetch-retry.js';

const quiet = { sleep: async () => {}, log: () => {} };

test('a request that got no answer is retried on a fresh attempt', async () => {
  let calls = 0;
  const f = withUnansweredRetry(async () => {
    calls += 1;
    if (calls === 1) throw new TypeError('fetch failed');
    return new Response('ok', { status: 200 });
  }, quiet);
  assert.equal((await f('https://x/token', { method: 'POST' })).status, 200);
  assert.equal(calls, 2);
});

test('an HTTP error is returned, never retried', async () => {
  let calls = 0;
  const f = withUnansweredRetry(async () => {
    calls += 1;
    return new Response('no', { status: 502 });
  }, quiet);
  assert.equal((await f('https://x/a')).status, 502);
  assert.equal(calls, 1);
});

test('gives up after the last retry with the original error', async () => {
  let calls = 0;
  const f = withUnansweredRetry(async () => {
    calls += 1;
    throw new TypeError('fetch failed');
  }, quiet);
  await assert.rejects(f('https://x/a'), /fetch failed/);
  assert.equal(calls, 3);
});
