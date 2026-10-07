import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFusionApps } from '../src/fusion-apps.js';

test('parses one entry per line as name -> dockerfile', () => {
  const out = parseFusionApps('dtbau-psb: apps/dtbau-psb/Dockerfile\ndtbau-backup: apps/dtbau-backup/Dockerfile\n');
  assert.deepEqual(out, [
    { name: 'dtbau-psb', dockerfile: 'apps/dtbau-psb/Dockerfile', context: '.' },
    { name: 'dtbau-backup', dockerfile: 'apps/dtbau-backup/Dockerfile', context: '.' },
  ]);
});

test('tolerates the aligned spacing people actually write', () => {
  const out = parseFusionApps('  dtbau-psb:    apps/a/Dockerfile\n\n  dtbau-backup:  apps/b/Dockerfile  ');
  assert.deepEqual(out.map((a) => a.name), ['dtbau-psb', 'dtbau-backup']);
  assert.deepEqual(out.map((a) => a.dockerfile), ['apps/a/Dockerfile', 'apps/b/Dockerfile']);
});

test('ignores blank lines and # comments', () => {
  const out = parseFusionApps('# two images\n\napp-a: a/Dockerfile\n   # the second one\napp-b: b/Dockerfile\n');
  assert.equal(out.length, 2);
});

test('takes an explicit build context after the dockerfile', () => {
  const out = parseFusionApps('app-a: apps/a/Dockerfile apps/a');
  assert.deepEqual(out, [{ name: 'app-a', dockerfile: 'apps/a/Dockerfile', context: 'apps/a' }]);
});

test('empty input means no images', () => {
  assert.deepEqual(parseFusionApps(''), []);
  assert.deepEqual(parseFusionApps('   \n  \n'), []);
  assert.deepEqual(parseFusionApps(undefined), []);
});

test('rejects a line with no colon, naming the line', () => {
  // A silently dropped image is worse than a failed run: the deploy would
  // reference an image that was never pushed.
  assert.throws(() => parseFusionApps('app-a apps/a/Dockerfile'), /app-a apps\/a\/Dockerfile/);
});

test('rejects a duplicate image name', () => {
  assert.throws(() => parseFusionApps('a: x/Dockerfile\na: y/Dockerfile'), /duplicate/i);
});

test('rejects an entry with an empty name or dockerfile', () => {
  assert.throws(() => parseFusionApps(': x/Dockerfile'), /name/i);
  assert.throws(() => parseFusionApps('a:'), /dockerfile/i);
});

test('one-entry shorthand from fusion-dockerfile inputs', () => {
  const out = parseFusionApps('', { dockerfile: 'Dockerfile', imageName: 'app', context: '.' });
  assert.deepEqual(out, [{ name: 'app', dockerfile: 'Dockerfile', context: '.' }]);
});

test('fusion-apps wins over the shorthand when both are given', () => {
  const out = parseFusionApps('a: x/Dockerfile', { dockerfile: 'Dockerfile', imageName: 'app', context: '.' });
  assert.deepEqual(out.map((a) => a.name), ['a']);
});
