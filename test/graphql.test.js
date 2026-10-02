import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatGraphQLErrors, graphqlRequest } from '../src/graphql.js';

test('formatGraphQLErrors includes extensions.code when present', () => {
  const msg = formatGraphQLErrors([
    { message: 'not found', extensions: { code: 'NOT_FOUND' } },
  ]);
  assert.equal(msg, '[NOT_FOUND] not found');
});

test('formatGraphQLErrors joins multiple errors and tolerates missing extensions', () => {
  const msg = formatGraphQLErrors([
    { message: 'first' },
    { message: 'second', extensions: { code: 'FORBIDDEN' } },
  ]);
  assert.equal(msg, 'first; [FORBIDDEN] second');
});

test('formatGraphQLErrors handles empty/invalid input', () => {
  assert.equal(formatGraphQLErrors([]), 'unknown GraphQL error');
  assert.equal(formatGraphQLErrors(undefined), 'unknown GraphQL error');
});

function fakeFetch(responses) {
  let call = 0;
  return async () => {
    const r = responses[Math.min(call, responses.length - 1)];
    call += 1;
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      json: async () => r.body,
    };
  };
}

test('graphqlRequest returns data on success', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fakeFetch([{ body: { data: { ping: 'pong' } } }]);
  try {
    const data = await graphqlRequest('https://switchboard.vetra.io', 'tok', 'query { ping }');
    assert.deepEqual(data, { ping: 'pong' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('graphqlRequest throws a formatted error when the response has errors', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fakeFetch([
    { body: { errors: [{ message: 'nope', extensions: { code: 'FORBIDDEN' } }] } },
  ]);
  try {
    await assert.rejects(
      () => graphqlRequest('https://switchboard.vetra.io', 'tok', 'query { ping }'),
      /\[FORBIDDEN\] nope/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('graphqlRequest throws on a non-OK HTTP response without a GraphQL errors array', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fakeFetch([{ ok: false, status: 500, body: {} }]);
  try {
    await assert.rejects(
      () => graphqlRequest('https://switchboard.vetra.io', 'tok', 'query { ping }'),
      /HTTP 500/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
