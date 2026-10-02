// Pure version-derivation and package-dir helpers. No I/O beyond reading
// package.json, no network, no secrets.

import fs from 'node:fs';
import path from 'node:path';

/**
 * Strips prerelease (-foo) and build metadata (+foo) from a semver string,
 * leaving `<base>` as used by the version-derivation table.
 * @param {unknown} version
 * @returns {string}
 */
export function stripPrerelease(version) {
  if (typeof version !== 'string' || version.length === 0) return '0.0.0';
  return version.split('+')[0].split('-')[0];
}

/**
 * @param {string} base
 * @param {{ kind: string, prNumber?: number, tagVersion?: string }} classification
 * @param {{ runNumber: string|number, sha7: string }} ctx
 * @returns {string}
 */
export function deriveVersion(base, classification, { runNumber, sha7 } = {}) {
  switch (classification.kind) {
    case 'production':
      return `${base}-main.${runNumber}.${sha7}`;
    case 'preview':
      return `${base}-pr.${classification.prNumber}.${sha7}`;
    case 'release':
      return classification.tagVersion;
    default:
      throw new Error(`cannot derive a version for ref kind '${classification.kind}'`);
  }
}

/**
 * The npm registry a classification publishes to.
 * @param {{ kind: string }} classification
 */
export function registryForClassification(classification) {
  return classification.kind === 'preview'
    ? 'https://registry.dev.vetra.io'
    : 'https://registry.vetra.io';
}

/**
 * The npm dist-tag a classification publishes under. Note the production
 * dist-tag (and version segment) is the literal string "main", regardless of
 * the configured production branch's actual name.
 * @param {{ kind: string, prNumber?: number }} classification
 * @returns {string|null}
 */
export function distTagForClassification(classification) {
  switch (classification.kind) {
    case 'production':
      return 'main';
    case 'preview':
      return `pr-${classification.prNumber}`;
    case 'release':
      return 'latest';
    default:
      return null;
  }
}

/**
 * Parses the `package-dirs` action input (newline- or space-separated) into a
 * list of directories. An empty/blank input yields an empty list.
 * @param {unknown} input
 * @returns {string[]}
 */
export function listPackageDirs(input) {
  if (input == null) return [];
  return String(input)
    .split(/[\s\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * @param {string} dir
 * @returns {{ name: string, version: string, private: boolean, raw: object, file: string }|null}
 */
export function readPackageJson(dir) {
  const file = path.join(dir, 'package.json');
  if (!fs.existsSync(file)) return null;
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    name: raw.name,
    version: raw.version,
    private: raw.private === true,
    raw,
    file,
  };
}
