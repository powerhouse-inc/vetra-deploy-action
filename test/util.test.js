import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setOutput, appendSummary } from '../src/util.js';

test('setOutput writes the multiline-safe GITHUB_OUTPUT format', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vetra-deploy-action-output-'));
  const file = path.join(dir, 'output');
  fs.writeFileSync(file, '');
  const original = process.env.GITHUB_OUTPUT;
  process.env.GITHUB_OUTPUT = file;
  try {
    setOutput('version', '1.4.0-pr.42.abc1234');
    const contents = fs.readFileSync(file, 'utf8');
    assert.match(contents, /^version<<.+\n1\.4\.0-pr\.42\.abc1234\n.+\n$/);
  } finally {
    process.env.GITHUB_OUTPUT = original;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('setOutput writes an empty value cleanly', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vetra-deploy-action-output-'));
  const file = path.join(dir, 'output');
  fs.writeFileSync(file, '');
  const original = process.env.GITHUB_OUTPUT;
  process.env.GITHUB_OUTPUT = file;
  try {
    setOutput('deployment-id', '');
    const contents = fs.readFileSync(file, 'utf8');
    assert.match(contents, /^deployment-id<<.+\n\n.+\n$/);
  } finally {
    process.env.GITHUB_OUTPUT = original;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('appendSummary appends to GITHUB_STEP_SUMMARY', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vetra-deploy-action-summary-'));
  const file = path.join(dir, 'summary');
  fs.writeFileSync(file, '');
  const original = process.env.GITHUB_STEP_SUMMARY;
  process.env.GITHUB_STEP_SUMMARY = file;
  try {
    appendSummary('# hello\n');
    appendSummary('more\n');
    assert.equal(fs.readFileSync(file, 'utf8'), '# hello\nmore\n');
  } finally {
    process.env.GITHUB_STEP_SUMMARY = original;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
