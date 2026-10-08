import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  deriveVersion,
  distTagForClassification,
  listPackageDirs,
  readPackageJson,
  registryForClassification,
  stripPrerelease,
} from '../src/version.js';

test('stripPrerelease removes prerelease and build metadata', () => {
  assert.equal(stripPrerelease('1.4.0'), '1.4.0');
  assert.equal(stripPrerelease('1.4.0-beta.1'), '1.4.0');
  assert.equal(stripPrerelease('1.4.0+build.5'), '1.4.0');
  assert.equal(stripPrerelease('1.4.0-beta.1+build.5'), '1.4.0');
});

test('stripPrerelease falls back for missing/invalid input', () => {
  assert.equal(stripPrerelease(undefined), '0.0.0');
  assert.equal(stripPrerelease(''), '0.0.0');
});

test('deriveVersion: production', () => {
  const v = deriveVersion('1.4.0', { kind: 'production' }, { runNumber: 7, sha7: 'abc1234' });
  assert.equal(v, '1.4.0-main.7.abc1234');
});

test('deriveVersion: preview uses the PR number', () => {
  const v = deriveVersion('1.4.0', { kind: 'preview', prNumber: 42 }, { runNumber: 7, sha7: 'abc1234' });
  assert.equal(v, '1.4.0-pr.42.abc1234');
});

test('deriveVersion: release uses the tag version verbatim (ignores base/ctx)', () => {
  const v = deriveVersion('ignored', { kind: 'release', tagVersion: '1.4.0' }, {});
  assert.equal(v, '1.4.0');
});

test('deriveVersion: throws for a skip classification', () => {
  assert.throws(() => deriveVersion('1.4.0', { kind: 'skip' }, {}));
});

test('registryForClassification: preview goes to the dev registry, everything else to prod', () => {
  assert.equal(registryForClassification({ kind: 'preview' }), 'https://registry.dev.vetra.io');
  assert.equal(registryForClassification({ kind: 'production' }), 'https://registry.vetra.io');
  assert.equal(registryForClassification({ kind: 'release' }), 'https://registry.vetra.io');
});

test('distTagForClassification', () => {
  assert.equal(distTagForClassification({ kind: 'production' }), 'main');
  assert.equal(distTagForClassification({ kind: 'preview', prNumber: 42 }), 'pr-42');
  assert.equal(distTagForClassification({ kind: 'release' }), 'latest');
  assert.equal(distTagForClassification({ kind: 'skip' }), null);
});

test('listPackageDirs parses newline- and space-separated lists', () => {
  assert.deepEqual(listPackageDirs(''), []);
  assert.deepEqual(listPackageDirs('   '), []);
  assert.deepEqual(listPackageDirs('.'), ['.']);
  assert.deepEqual(listPackageDirs('packages/a packages/b'), ['packages/a', 'packages/b']);
  assert.deepEqual(listPackageDirs('packages/a\npackages/b\n'), ['packages/a', 'packages/b']);
  assert.deepEqual(listPackageDirs('  packages/a  \n\n packages/b '), ['packages/a', 'packages/b']);
});

test('listPackageDirs: empty/blank input disables publishing entirely', () => {
  assert.deepEqual(listPackageDirs(''), []);
  assert.deepEqual(listPackageDirs('   '), []);
  assert.deepEqual(listPackageDirs(undefined), []);
  assert.deepEqual(listPackageDirs(null), []);
});

test('readPackageJson reads name/version/private from a directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vetra-deploy-action-test-'));
  try {
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: '@acme/widget', version: '2.1.0', private: true }),
    );
    const pkg = readPackageJson(dir);
    assert.equal(pkg.name, '@acme/widget');
    assert.equal(pkg.version, '2.1.0');
    assert.equal(pkg.private, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('readPackageJson returns null when there is no package.json', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vetra-deploy-action-test-'));
  try {
    assert.equal(readPackageJson(dir), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('readPackageJson treats a missing "private" field as public', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vetra-deploy-action-test-'));
  try {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'a', version: '1.0.0' }));
    assert.equal(readPackageJson(dir).private, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
