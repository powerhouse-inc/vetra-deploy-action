import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pollDeployment } from '../src/deploy.js';

function fakeFetchSequence(statuses) {
  let call = 0;
  return async () => {
    const status = statuses[Math.min(call, statuses.length - 1)];
    call += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { appDeployment: { id: 'd1', status, urls: {} } } }),
    };
  };
}

test('pollDeployment returns as soon as a terminal status is reached', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fakeFetchSequence(['PENDING', 'DEPLOYING', 'READY']);
  const sleeps = [];
  try {
    const result = await pollDeployment('https://switchboard.vetra.io', 'tok', 'd1', {
      timeoutMinutes: 15,
      sleep: async (ms) => sleeps.push(ms),
    });
    assert.equal(result.status, 'READY');
    assert.equal(sleeps.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('pollDeployment treats FAILED and SUPERSEDED as terminal', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fakeFetchSequence(['FAILED']);
  try {
    const result = await pollDeployment('https://switchboard.vetra.io', 'tok', 'd1', {
      sleep: async () => {},
    });
    assert.equal(result.status, 'FAILED');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('pollDeployment returns a synthetic TIMEOUT status once the deadline passes', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fakeFetchSequence(['DEPLOYING']);
  let now = 0;
  try {
    const result = await pollDeployment('https://switchboard.vetra.io', 'tok', 'd1', {
      timeoutMinutes: 1,
      intervalMs: 10_000,
      now: () => now,
      sleep: async () => {
        now += 10_000;
      },
    });
    assert.equal(result.status, 'TIMEOUT');
    assert.equal(result.id, 'd1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
