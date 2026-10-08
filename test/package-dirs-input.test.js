import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The input is read straight from process.env so that `package-dirs: ''`
// disables publishing instead of falling back to the '.' default.
test("index.js reads package-dirs without the empty-means-default fallback", () => {
  const src = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.match(src, /process\.env\.INPUT_PACKAGE_DIRS \?\? '\.'/);
  assert.doesNotMatch(src, /env\('INPUT_PACKAGE_DIRS'/);
});
