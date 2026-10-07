import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { extractTarballName, publishPackage } from '../src/publish.js';

test('extractTarballName picks the last .tgz line from pnpm pack output', () => {
  const output = 'Packed 12 files into\nacme-widget-1.4.0.tgz\n';
  assert.equal(extractTarballName(output, '/repo/packages/widget'), path.join('/repo/packages/widget', 'acme-widget-1.4.0.tgz'));
});

test('extractTarballName keeps an absolute path as-is', () => {
  const output = '/repo/packages/widget/acme-widget-1.4.0.tgz\n';
  assert.equal(extractTarballName(output, '/repo/packages/widget'), '/repo/packages/widget/acme-widget-1.4.0.tgz');
});

test('extractTarballName throws when no tarball line is found', () => {
  assert.throws(() => extractTarballName('nothing useful here\n', '/repo'));
  assert.throws(() => extractTarballName('', '/repo'));
});

test('pack is not given --userconfig, which pnpm rejects', () => {
  // pnpm parses its own pack options strictly and fails with
  // "Unknown option: 'userconfig'", which broke every package publish.
  const calls = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vda-'));
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"x","version":"0.0.0"}');
  publishPackage(
    { dir, version: '1.2.3', registryUrl: 'https://registry.example.com', distTag: 'latest', token: 't' },
    (cmd, args) => {
      calls.push([cmd, args]);
      return cmd === 'pnpm' ? 'x-1.2.3.tgz' : '';
    },
  );

  const pack = calls.find(([cmd, args]) => cmd === 'pnpm' && args[0] === 'pack');
  assert.ok(pack, 'pnpm pack should run');
  assert.deepStrictEqual(pack[1], ['pack']);

  // publish still authenticates
  const publish = calls.find(([cmd, args]) => cmd === 'npm' && args[0] === 'publish');
  assert.ok(publish[1].includes('--userconfig'), 'publish must keep --userconfig');
});
