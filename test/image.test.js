import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildImageRef } from '../src/image.js';

test('buildImageRef composes host/project/image:sha-<sha12>', () => {
  const ref = buildImageRef({
    registry: 'https://cr.vetra.io',
    project: 'app-acme',
    imageName: 'app',
    sha12: 'abcdef012345',
  });
  assert.equal(ref, 'cr.vetra.io/app-acme/app:sha-abcdef012345');
});

test('buildImageRef strips protocol and trailing slash from the registry', () => {
  const ref = buildImageRef({
    registry: 'https://cr.vetra.io/',
    project: 'app-acme',
    imageName: 'web',
    sha12: '0123456789ab',
  });
  assert.equal(ref, 'cr.vetra.io/app-acme/web:sha-0123456789ab');
});

test('buildImageRef requires all fields', () => {
  assert.throws(() => buildImageRef({ project: 'p', imageName: 'i', sha12: 's' }));
  assert.throws(() => buildImageRef({ registry: 'r', imageName: 'i', sha12: 's' }));
  assert.throws(() => buildImageRef({ registry: 'r', project: 'p', sha12: 's' }));
  assert.throws(() => buildImageRef({ registry: 'r', project: 'p', imageName: 'i' }));
});
