import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { extractTarballName } from '../src/publish.js';

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
