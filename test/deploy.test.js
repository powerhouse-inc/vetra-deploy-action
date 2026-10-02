import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deployApp, fetchAppDeployment, fetchAppRegistryCredentials, pollDeployment } from '../src/deploy.js';

function fakeFetch(handler) {
  return async (url, opts) => handler(url, opts);
}

test('fetchAppRegistryCredentials posts to /registry-credentials with the appId', async () => {
  let seenUrl;
  let seenBody;
  const fetchImpl = fakeFetch(async (url, opts) => {
    seenUrl = url;
    seenBody = JSON.parse(opts.body);
    return { ok: true, status: 200, json: async () => ({ registry: 'cr.vetra.io', project: 'app-acme', username: 'robot$ci', password: 'secret' }) };
  });
  const creds = await fetchAppRegistryCredentials('https://switchboard.vetra.io', 'tok', 'app-1', { fetchImpl });
  assert.equal(seenUrl, 'https://switchboard.vetra.io/api/@powerhousedao/vetra-cloud-package/apps/ci/registry-credentials');
  assert.deepEqual(seenBody, { appId: 'app-1' });
  assert.equal(creds.registry, 'cr.vetra.io');
  assert.equal(creds.password, 'secret');
});

test('deployApp posts the deploy input and returns the deployment', async () => {
  let seenUrl;
  let seenBody;
  const input = { appId: 'app-1', kind: 'PRODUCTION', gitRef: 'refs/heads/main', sha: 'abc123', packages: [] };
  const fetchImpl = fakeFetch(async (url, opts) => {
    seenUrl = url;
    seenBody = JSON.parse(opts.body);
    return { ok: true, status: 200, json: async () => ({ id: 'd1', status: 'PENDING', urls: {} }) };
  });
  const deployment = await deployApp('https://switchboard.vetra.io', 'tok', input, { fetchImpl });
  assert.equal(seenUrl, 'https://switchboard.vetra.io/api/@powerhousedao/vetra-cloud-package/apps/ci/deploy');
  assert.deepEqual(seenBody, input);
  assert.equal(deployment.id, 'd1');
});

test('fetchAppDeployment GETs /deployments/:id', async () => {
  let seenUrl;
  let seenMethod;
  const fetchImpl = fakeFetch(async (url, opts) => {
    seenUrl = url;
    seenMethod = opts.method;
    return { ok: true, status: 200, json: async () => ({ id: 'd1', status: 'READY', urls: { app: 'https://acme.vetra.io' } }) };
  });
  const deployment = await fetchAppDeployment('https://switchboard.vetra.io', 'tok', 'd1', { fetchImpl });
  assert.equal(seenUrl, 'https://switchboard.vetra.io/api/@powerhousedao/vetra-cloud-package/apps/ci/deployments/d1');
  assert.equal(seenMethod, 'GET');
  assert.equal(deployment.status, 'READY');
});

test('fetchAppDeployment URL-encodes the deployment id', async () => {
  let seenUrl;
  const fetchImpl = fakeFetch(async (url) => {
    seenUrl = url;
    return { ok: true, status: 200, json: async () => ({ id: 'a/b', status: 'READY' }) };
  });
  await fetchAppDeployment('https://switchboard.vetra.io', 'tok', 'a/b', { fetchImpl });
  assert.match(seenUrl, /deployments\/a%2Fb$/);
});

test('deployApp throws "<code>: <message>" on a non-2xx API error', async () => {
  const fetchImpl = fakeFetch(async () => ({
    ok: false,
    status: 403,
    json: async () => ({ error: 'PREVIEWS_DISABLED', message: 'previews are disabled for this App' }),
  }));
  await assert.rejects(
    () => deployApp('https://switchboard.vetra.io', 'tok', {}, { fetchImpl }),
    /PREVIEWS_DISABLED: previews are disabled for this App/,
  );
});

function fakeFetchSequence(statuses) {
  let call = 0;
  return async () => {
    const status = statuses[Math.min(call, statuses.length - 1)];
    call += 1;
    return { ok: true, status: 200, json: async () => ({ id: 'd1', status, urls: {} }) };
  };
}

test('pollDeployment returns as soon as a terminal status is reached', async () => {
  const fetchImpl = fakeFetchSequence(['PENDING', 'DEPLOYING', 'READY']);
  const sleeps = [];
  const result = await pollDeployment('https://switchboard.vetra.io', 'tok', 'd1', {
    timeoutMinutes: 15,
    sleep: async (ms) => sleeps.push(ms),
    fetchImpl,
  });
  assert.equal(result.status, 'READY');
  assert.equal(sleeps.length, 2);
});

test('pollDeployment treats FAILED and SUPERSEDED as terminal', async () => {
  const fetchImpl = fakeFetchSequence(['FAILED']);
  const result = await pollDeployment('https://switchboard.vetra.io', 'tok', 'd1', {
    sleep: async () => {},
    fetchImpl,
  });
  assert.equal(result.status, 'FAILED');
});

test('pollDeployment returns a synthetic TIMEOUT status once the deadline passes', async () => {
  const fetchImpl = fakeFetchSequence(['DEPLOYING']);
  let now = 0;
  const result = await pollDeployment('https://switchboard.vetra.io', 'tok', 'd1', {
    timeoutMinutes: 1,
    intervalMs: 10_000,
    now: () => now,
    sleep: async () => {
      now += 10_000;
    },
    fetchImpl,
  });
  assert.equal(result.status, 'TIMEOUT');
  assert.equal(result.id, 'd1');
});

test('pollDeployment asks a token getter for a fresh token on every poll', async () => {
  const seen = [];
  let polls = 0;
  const fetchImpl = async (_url, init) => {
    seen.push(init.headers.authorization ?? init.headers.Authorization);
    polls += 1;
    return new Response(JSON.stringify({ id: 'd1', status: polls < 2 ? 'DEPLOYING' : 'READY' }), { status: 200 });
  };
  let n = 0;
  const result = await pollDeployment('https://switchboard.vetra.io', async () => `tok-${++n}`, 'd1', {
    intervalMs: 0, sleep: async () => {}, fetchImpl,
  });
  assert.equal(result.status, 'READY');
  assert.deepEqual(seen, ['Bearer tok-1', 'Bearer tok-2']);
});
