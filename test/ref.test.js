import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyRef, parsePrNumberFromRef, parseReleaseTagFromRef } from '../src/ref.js';

test('parsePrNumberFromRef extracts the PR number from a merge ref', () => {
  assert.equal(parsePrNumberFromRef('refs/pull/42/merge'), 42);
  assert.equal(parsePrNumberFromRef('refs/pull/1/merge'), 1);
});

test('parsePrNumberFromRef returns null for non-PR refs', () => {
  assert.equal(parsePrNumberFromRef('refs/heads/main'), null);
  assert.equal(parsePrNumberFromRef('refs/pull/42/head'), null);
  assert.equal(parsePrNumberFromRef(undefined), null);
  assert.equal(parsePrNumberFromRef(''), null);
});

test('parseReleaseTagFromRef strips the leading v', () => {
  assert.equal(parseReleaseTagFromRef('refs/tags/v1.4.0'), '1.4.0');
  assert.equal(parseReleaseTagFromRef('refs/tags/v1.0.0-beta.1'), '1.0.0-beta.1');
});

test('parseReleaseTagFromRef returns null for non-version tags and other refs', () => {
  assert.equal(parseReleaseTagFromRef('refs/heads/main'), null);
  assert.equal(parseReleaseTagFromRef('refs/tags/release'), null);
});

test('classifyRef: production branch push', () => {
  assert.deepEqual(classifyRef({ ref: 'refs/heads/main', productionBranch: 'main' }), {
    kind: 'production',
  });
});

test('classifyRef: production branch can be customized', () => {
  assert.deepEqual(classifyRef({ ref: 'refs/heads/release', productionBranch: 'release' }), {
    kind: 'production',
  });
  assert.equal(
    classifyRef({ ref: 'refs/heads/main', productionBranch: 'release' }).kind,
    'skip',
  );
});

test('classifyRef: pull request merge ref', () => {
  assert.deepEqual(classifyRef({ ref: 'refs/pull/42/merge', productionBranch: 'main' }), {
    kind: 'preview',
    prNumber: 42,
  });
});

test('classifyRef: version tag', () => {
  assert.deepEqual(classifyRef({ ref: 'refs/tags/v1.4.0', productionBranch: 'main' }), {
    kind: 'release',
    tagVersion: '1.4.0',
  });
});

test('classifyRef: tag takes priority even if it happens to equal the production branch name', () => {
  // refs/tags/* and refs/heads/* are disjoint ref namespaces, this just
  // guards against accidental substring matching.
  assert.equal(classifyRef({ ref: 'refs/tags/vmain', productionBranch: 'main' }).kind, 'release');
});

test('classifyRef: anything else is skipped with a reason', () => {
  const result = classifyRef({ ref: 'refs/heads/feature/foo', productionBranch: 'main' });
  assert.equal(result.kind, 'skip');
  assert.match(result.reason, /feature\/foo/);
});

test('classifyRef: missing ref is skipped', () => {
  assert.equal(classifyRef({ ref: '', productionBranch: 'main' }).kind, 'skip');
  assert.equal(classifyRef({ ref: undefined, productionBranch: 'main' }).kind, 'skip');
});

test('classifyRef: a non-merge pull_request ref (head) is skipped', () => {
  // Mirrors the server-side rule: only the merge ref is an allowed PREVIEW ref.
  assert.equal(classifyRef({ ref: 'refs/pull/42/head', productionBranch: 'main' }).kind, 'skip');
});
