import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exchangeToken } from '../src/exchange.js';

test('exchangeToken posts subject_token/audience and returns access_token', async () => {
  let seenUrl;
  let seenBody;
  const fetchImpl = async (url, opts) => {
    seenUrl = url;
    seenBody = JSON.parse(opts.body);
    return { ok: true, json: async () => ({ access_token: 'bearer-jwt', token_type: 'Bearer', expires_in: 600 }) };
  };
  const token = await exchangeToken('https://switchboard.renown.vetra.io', 'oidc-jwt', 'https://registry.vetra.io', {
    fetchImpl,
  });
  assert.equal(token, 'bearer-jwt');
  assert.equal(
    seenUrl,
    'https://switchboard.renown.vetra.io/api/@powerhousedao/renown-package/workload/token',
  );
  assert.deepEqual(seenBody, { subject_token: 'oidc-jwt', audience: 'https://registry.vetra.io' });
});

test('exchangeToken strips a trailing slash from the renown URL', async () => {
  let seenUrl;
  const fetchImpl = async (url) => {
    seenUrl = url;
    return { ok: true, json: async () => ({ access_token: 't' }) };
  };
  await exchangeToken('https://switchboard.renown.vetra.io/', 'x', 'aud', { fetchImpl });
  assert.equal(
    seenUrl,
    'https://switchboard.renown.vetra.io/api/@powerhousedao/renown-package/workload/token',
  );
});

test('exchangeToken throws with the error/error_description on a non-OK response', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 403,
    json: async () => ({ error: 'access_denied', error_description: 'PREVIEW may not request this audience' }),
  });
  await assert.rejects(
    () => exchangeToken('https://r', 'x', 'https://registry.vetra.io', { fetchImpl }),
    /access_denied.*PREVIEW may not request this audience/s,
  );
});

test('exchangeToken throws when access_token is missing from an OK response', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({}) });
  await assert.rejects(() => exchangeToken('https://r', 'x', 'aud', { fetchImpl }), /did not return an access_token/);
});
