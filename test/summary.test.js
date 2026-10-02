import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderSummary } from '../src/summary.js';

test('renderSummary includes status and URLs', () => {
  const md = renderSummary({
    status: 'READY',
    urls: { app: 'https://acme.vetra.io', connect: 'https://connect.acme.vetra.io', switchboard: 'https://sb.acme.vetra.io' },
  });
  assert.match(md, /READY/);
  assert.match(md, /https:\/\/acme\.vetra\.io/);
  assert.match(md, /https:\/\/connect\.acme\.vetra\.io/);
  assert.match(md, /https:\/\/sb\.acme\.vetra\.io/);
});

test('renderSummary tolerates missing urls and shows the error when present', () => {
  const md = renderSummary({ status: 'FAILED', error: 'boom' });
  assert.match(md, /FAILED/);
  assert.match(md, /boom/);
  assert.match(md, /n\/a/);
});
