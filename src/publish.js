// Package publishing: a temp .npmrc scoped to one registry host, then
// `npm version` (local, no git tag), `pnpm pack` (so workspace:/catalog:
// protocols get resolved to real version ranges before packing), and
// `npm publish` of the resulting tarball.

import fs from 'node:fs';
import path from 'node:path';
import { execCmd } from './util.js';

/**
 * Picks the tarball filename out of `pnpm pack`'s stdout. pnpm prints the
 * absolute/relative tarball path as the last non-empty line.
 * @param {string} packOutput
 * @param {string} dir
 * @returns {string}
 */
export function extractTarballName(packOutput, dir) {
  const lines = String(packOutput)
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const last = lines[lines.length - 1];
  if (!last || !last.endsWith('.tgz')) {
    throw new Error(`could not determine the tarball name from 'pnpm pack' output: ${JSON.stringify(packOutput)}`);
  }
  return path.isAbsolute(last) ? last : path.join(dir, last);
}

/**
 * Publishes one package directory at the given version/tag/registry.
 * Writes and removes a scratch .npmrc so the auth token never lands in the
 * repo's real .npmrc and is never printed.
 * @param {{ dir: string, version: string, registryUrl: string, distTag: string, token: string }} opts
 */
export function publishPackage({ dir, version, registryUrl, distTag, token }) {
  const normalizedRegistry = registryUrl.replace(/\/+$/, '');
  const host = normalizedRegistry.replace(/^https?:\/\//, '');
  const npmrcPath = path.join(dir, '.npmrc.vetra-deploy-action');
  const npmrcContents = `//${host}/:_authToken=${token}\nregistry=${normalizedRegistry}/\n`;

  fs.writeFileSync(npmrcPath, npmrcContents, { mode: 0o600 });
  try {
    execCmd('npm', ['version', version, '--no-git-tag-version', '--allow-same-version'], { cwd: dir });

    const packOutput = execCmd('pnpm', ['pack', '--userconfig', npmrcPath], { cwd: dir });
    const tarball = extractTarballName(packOutput, dir);

    execCmd(
      'npm',
      ['publish', tarball, '--registry', normalizedRegistry, '--tag', distTag, '--userconfig', npmrcPath],
      { cwd: dir },
    );
  } finally {
    fs.rmSync(npmrcPath, { force: true });
  }
}
