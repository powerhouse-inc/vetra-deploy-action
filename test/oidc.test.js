import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestOidcToken } from '../src/oidc.js';

test('requestOidcToken throws a clear error when the request env vars are missing', async () => {
  await assert.rejects(
    () => requestOidcToken('https://renown.vetra.io', { requestUrl: undefined, requestToken: undefined }),
    /id-token: write/,
  );
  await assert.rejects(
    () => requestOidcToken('https://renown.vetra.io', { requestUrl: undefined, requestToken: undefined }),
    /fork/,
  );
});

test('requestOidcToken appends the audience query param and returns .value', async () => {
  let seenUrl;
  let seenHeaders;
  const fetchImpl = async (url, opts) => {
    seenUrl = url;
    seenHeaders = opts.headers;
    return { ok: true, json: async () => ({ value: 'the-jwt' }) };
  };
  const token = await requestOidcToken('https://renown.vetra.io', {
    requestUrl: 'https://token.actions.githubusercontent.com/request',
    requestToken: 'runner-token',
    fetchImpl,
  });
  assert.equal(token, 'the-jwt');
  assert.equal(seenUrl, 'https://token.actions.githubusercontent.com/request?audience=https%3A%2F%2Frenown.vetra.io');
  assert.equal(seenHeaders.authorization, 'bearer runner-token');
});

test('requestOidcToken appends with & when the request url already has a query string', async () => {
  let seenUrl;
  const fetchImpl = async (url) => {
    seenUrl = url;
    return { ok: true, json: async () => ({ value: 'x' }) };
  };
  await requestOidcToken('https://renown.vetra.io', {
    requestUrl: 'https://token.actions.githubusercontent.com/request?foo=bar',
    requestToken: 't',
    fetchImpl,
  });
  assert.match(seenUrl, /\?foo=bar&audience=/);
});

test('requestOidcToken throws when the response has no value', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({}) });
  await assert.rejects(
    () =>
      requestOidcToken('https://renown.vetra.io', {
        requestUrl: 'https://x',
        requestToken: 't',
        fetchImpl,
      }),
    /did not contain a value/,
  );
});

test('requestOidcToken throws on a non-OK response', async () => {
  const fetchImpl = async () => ({ ok: false, status: 403, text: async () => 'forbidden' });
  await assert.rejects(
    () =>
      requestOidcToken('https://renown.vetra.io', {
        requestUrl: 'https://x',
        requestToken: 't',
        fetchImpl,
      }),
    /HTTP 403/,
  );
});
