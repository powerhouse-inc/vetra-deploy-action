import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getPullRequestHeadSha } from '../src/github-event.js';

function writeEvent(payload) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vetra-deploy-action-event-')), 'event.json');
  fs.writeFileSync(file, JSON.stringify(payload));
  return file;
}

test('getPullRequestHeadSha reads pull_request.head.sha', () => {
  const file = writeEvent({ pull_request: { head: { sha: 'deadbeef' } } });
  assert.equal(getPullRequestHeadSha(file), 'deadbeef');
});

test('getPullRequestHeadSha returns null when the field is absent', () => {
  const file = writeEvent({ pull_request: {} });
  assert.equal(getPullRequestHeadSha(file), null);
  const file2 = writeEvent({});
  assert.equal(getPullRequestHeadSha(file2), null);
});

test('getPullRequestHeadSha returns null for a missing/undefined path', () => {
  assert.equal(getPullRequestHeadSha(undefined), null);
  assert.equal(getPullRequestHeadSha('/does/not/exist.json'), null);
});

test('getPullRequestHeadSha returns null for invalid JSON rather than throwing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vetra-deploy-action-event-'));
  const file = path.join(dir, 'event.json');
  fs.writeFileSync(file, '{not json');
  assert.equal(getPullRequestHeadSha(file), null);
});
