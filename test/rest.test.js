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

const noSleep = async () => {};
const answer = (status, body) => ({ ok: status < 400, status, json: async () => body });

test('getJson retries a request that got no answer, then returns the answer', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls < 3) throw new TypeError('fetch failed');
    return answer(200, { status: 'READY' });
  };
  const body = await getJson('https://x/ci/deployments/d1', 'tok', { fetchImpl, sleep: noSleep });
  assert.deepEqual(body, { status: 'READY' });
  assert.equal(calls, 3);
});

test('getJson retries a gateway 502 but not an API error', async () => {
  let calls = 0;
  const gateway = async () => {
    calls += 1;
    return calls === 1 ? { ok: false, status: 502, json: async () => { throw new Error('html'); } } : answer(200, {});
  };
  await getJson('https://x/a', 'tok', { fetchImpl: gateway, sleep: noSleep });
  assert.equal(calls, 2);

  let apiCalls = 0;
  const notFound = async () => {
    apiCalls += 1;
    return answer(404, { error: 'NOT_FOUND', message: 'no deployment' });
  };
  await assert.rejects(getJson('https://x/a', 'tok', { fetchImpl: notFound, sleep: noSleep }), /NOT_FOUND/);
  assert.equal(apiCalls, 1);
});

test('getJson gives up after the last retry', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    throw new TypeError('fetch failed');
  };
  await assert.rejects(getJson('https://x/a', 'tok', { fetchImpl, sleep: noSleep }), /fetch failed/);
  assert.equal(calls, 5);
});

test('postJson retries a request that got no answer, but never an HTTP error', async () => {
  let calls = 0;
  const staleSocket = async () => {
    calls += 1;
    if (calls === 1) throw new TypeError('fetch failed');
    return answer(200, { id: 'd1' });
  };
  assert.deepEqual(await postJson('https://x/deploy', 'tok', {}, { fetchImpl: staleSocket, sleep: noSleep }), { id: 'd1' });
  assert.equal(calls, 2);

  calls = 0;
  const gateway = async () => {
    calls += 1;
    return { ok: false, status: 502, json: async () => { throw new Error('html'); } };
  };
  await assert.rejects(postJson('https://x/deploy', 'tok', {}, { fetchImpl: gateway, sleep: noSleep }), /HTTP 502/);
  assert.equal(calls, 1);

  calls = 0;
  const down = async () => {
    calls += 1;
    throw new TypeError('fetch failed');
  };
  await assert.rejects(postJson('https://x/deploy', 'tok', {}, { fetchImpl: down, sleep: noSleep }), /fetch failed/);
  assert.equal(calls, 3);
});
