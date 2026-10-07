import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordArtifact, channelForClassification } from '../src/artifacts.js';

const okFetch = (calls) => async (url, init) => {
  calls.push({ url, init, body: JSON.parse(init.body) });
  return { ok: true, status: 200, json: async () => ({ appId: 'a1', recorded: true }) };
};

test('posts the artifact to the apps CI artifacts endpoint', async () => {
  const calls = [];
  await recordArtifact('https://sb.example.com', 'tok', {
    appId: 'a1', kind: 'PACKAGE', name: '@acme/pkg', version: '1.2.3',
    reference: 'https://registry.example.com/@acme/pkg/-/pkg-1.2.3.tgz',
  }, { fetchImpl: okFetch(calls) });

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/apps\/ci\/artifacts$/);
  assert.equal(calls[0].init.headers.authorization, 'Bearer tok');
  assert.equal(calls[0].body.kind, 'PACKAGE');
  assert.equal(calls[0].body.version, '1.2.3');
});

test('a failed registration does not throw: the artifact is a record, not the deploy', async () => {
  // The package IS published and the image IS pushed by the time this runs.
  // Failing the job here would report a successful publish as a failure.
  const warnings = [];
  await recordArtifact('https://sb.example.com', 'tok',
    { appId: 'a1', kind: 'PACKAGE', name: 'p', version: '1', reference: 'r' },
    {
      fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({ error: 'X', message: 'down' }) }),
      warn: (m) => warnings.push(m),
    });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /down|X/);
});

test('channel follows the ref classification', () => {
  assert.equal(channelForClassification({ kind: 'release' }), 'LATEST');
  assert.equal(channelForClassification({ kind: 'production' }), 'STAGING');
  assert.equal(channelForClassification({ kind: 'preview' }), null);
  assert.equal(channelForClassification({ kind: 'skip' }), null);
});
