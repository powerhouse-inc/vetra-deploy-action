import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFusionImages } from '../src/images-step.js';

const creds = async () => ({ registry: 'https://cr.vetra.io', project: 'app-sektar', username: 'robot', password: 'pw' });

test('buildFusionImages builds and records every image on the run channel, returning the first', async () => {
  const built = [];
  const recorded = [];
  const first = await buildFusionImages(
    {
      fusionApps: [
        { name: 'host', dockerfile: 'hosts/cli/Dockerfile', context: '.' },
        { name: 'web', dockerfile: 'Dockerfile', context: '.' },
      ],
      vetraUrl: 'https://switchboard.vetra.io',
      appsToken: async () => 'tok',
      appId: 'app-1',
      sha: 'abcdef0123456789',
      sha12: 'abcdef012345',
      runId: '7',
      channel: 'LATEST',
    },
    { credentials: creds, build: (b) => built.push(b.imageRef), record: async (_u, _t, a) => recorded.push(a) },
  );
  assert.equal(first, 'cr.vetra.io/app-sektar/host:sha-abcdef012345');
  assert.deepEqual(built, ['cr.vetra.io/app-sektar/host:sha-abcdef012345', 'cr.vetra.io/app-sektar/web:sha-abcdef012345']);
  assert.deepEqual(
    recorded.map((r) => [r.kind, r.name, r.version, r.channel]),
    [
      ['FUSION_IMAGE', 'host', 'sha-abcdef012345', 'LATEST'],
      ['FUSION_IMAGE', 'web', 'sha-abcdef012345', 'LATEST'],
    ],
  );
});

test('buildFusionImages does nothing without FUSION apps', async () => {
  let asked = false;
  const first = await buildFusionImages(
    { fusionApps: [], vetraUrl: 'x', appsToken: async () => 'tok', appId: 'a', sha: 's', sha12: 's', runId: '1', channel: null },
    { credentials: async () => { asked = true; return creds(); } },
  );
  assert.equal(first, null);
  assert.equal(asked, false);
});
