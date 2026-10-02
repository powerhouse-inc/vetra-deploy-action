import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appsAudience, appsCiBaseUrl, formatApiError, getJson, postJson } from '../src/rest.js';

test('appsAudience derives the workload-token audience from the vetra switchboard URL', () => {
  assert.equal(
    appsAudience('https://switchboard.vetra.io'),
    'https://switchboard.vetra.io/api/@powerhousedao/vetra-cloud-package/apps',
  );
});

test('appsAudience trims a trailing slash from the vetra URL', () => {
  assert.equal(
    appsAudience('https://switchboard.vetra.io/'),
    'https://switchboard.vetra.io/api/@powerhousedao/vetra-cloud-package/apps',
  );
});

test('appsCiBaseUrl appends /ci to the audience', () => {
  assert.equal(
    appsCiBaseUrl('https://switchboard.vetra.io'),
    'https://switchboard.vetra.io/api/@powerhousedao/vetra-cloud-package/apps/ci',
  );
});

test('formatApiError renders "<code>: <message>"', () => {
  assert.equal(formatApiError({ error: 'NOT_FOUND', message: 'app not found' }), 'NOT_FOUND: app not found');
});

test('formatApiError tolerates a missing code or message', () => {
  assert.equal(formatApiError({ message: 'oops' }), 'UNKNOWN_ERROR: oops');
  assert.equal(formatApiError({ error: 'BAD_USER_INPUT' }), 'BAD_USER_INPUT: unknown error');
  assert.equal(formatApiError({}), 'UNKNOWN_ERROR: unknown error');
});

function fakeFetch(response) {
  return async (url, opts) => {
    fakeFetch.lastUrl = url;
    fakeFetch.lastOpts = opts;
    return response;
  };
}

test('postJson sends a bearer token and JSON body, and returns the parsed JSON on success', async () => {
  const fetchImpl = fakeFetch({ ok: true, status: 200, json: async () => ({ id: 'd1', status: 'PENDING' }) });
  const data = await postJson('https://x/ci/deploy', 'tok', { appId: 'a1' }, { fetchImpl });
  assert.deepEqual(data, { id: 'd1', status: 'PENDING' });
  assert.equal(fakeFetch.lastUrl, 'https://x/ci/deploy');
  assert.equal(fakeFetch.lastOpts.method, 'POST');
  assert.equal(fakeFetch.lastOpts.headers.authorization, 'Bearer tok');
  assert.deepEqual(JSON.parse(fakeFetch.lastOpts.body), { appId: 'a1' });
});

test('getJson sends no body and a GET method', async () => {
  const fetchImpl = fakeFetch({ ok: true, status: 200, json: async () => ({ id: 'd1' }) });
  const data = await getJson('https://x/ci/deployments/d1', 'tok', { fetchImpl });
  assert.deepEqual(data, { id: 'd1' });
  assert.equal(fakeFetch.lastOpts.method, 'GET');
  assert.equal(fakeFetch.lastOpts.body, undefined);
});

test('postJson throws "<code>: <message>" on a non-2xx JSON error response', async () => {
  const fetchImpl = fakeFetch({
    ok: false,
    status: 403,
    json: async () => ({ error: 'FORBIDDEN', message: 'caller is not this App\'s identity' }),
  });
  await assert.rejects(
    () => postJson('https://x/ci/deploy', 'tok', {}, { fetchImpl }),
    /FORBIDDEN: caller is not this App's identity/,
  );
});

test('postJson falls back to an HTTP-status message when the error body is not JSON', async () => {
  const fetchImpl = fakeFetch({
    ok: false,
    status: 500,
    json: async () => {
      throw new Error('not json');
    },
  });
  await assert.rejects(() => postJson('https://x/ci/deploy', 'tok', {}, { fetchImpl }), /HTTP 500/);
});
