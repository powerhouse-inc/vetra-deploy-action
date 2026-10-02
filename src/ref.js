// Pure ref-classification logic. No I/O, no secrets, no network.
//
// Mirrors the server-side ref-class rules used by the Renown workload token
// exchange (see the Vetra Apps design doc, contract C1), so the action skips
// locally for the same refs the exchange would otherwise reject.

const PR_REF_RE = /^refs\/pull\/(\d+)\/merge$/;
const TAG_REF_RE = /^refs\/tags\/v(.+)$/;

/**
 * @param {unknown} ref
 * @returns {number|null}
 */
export function parsePrNumberFromRef(ref) {
  if (typeof ref !== 'string') return null;
  const m = ref.match(PR_REF_RE);
  return m ? Number(m[1]) : null;
}

/**
 * @param {unknown} ref
 * @returns {string|null} the tag version without the leading "v"
 */
export function parseReleaseTagFromRef(ref) {
  if (typeof ref !== 'string') return null;
  const m = ref.match(TAG_REF_RE);
  return m ? m[1] : null;
}

/**
 * @param {{ ref: string, productionBranch?: string }} opts
 * @returns {
 *   | { kind: 'production' }
 *   | { kind: 'preview', prNumber: number }
 *   | { kind: 'release', tagVersion: string }
 *   | { kind: 'skip', reason: string }
 * }
 */
export function classifyRef({ ref, productionBranch = 'main' }) {
  if (!ref || typeof ref !== 'string') {
    return { kind: 'skip', reason: `missing or invalid ref: ${JSON.stringify(ref)}` };
  }

  if (ref === `refs/heads/${productionBranch}`) {
    return { kind: 'production' };
  }

  const tagVersion = parseReleaseTagFromRef(ref);
  if (tagVersion !== null) {
    return { kind: 'release', tagVersion };
  }

  const prNumber = parsePrNumberFromRef(ref);
  if (prNumber !== null) {
    return { kind: 'preview', prNumber };
  }

  return {
    kind: 'skip',
    reason:
      `ref '${ref}' is not the production branch (refs/heads/${productionBranch}), ` +
      "a pull request merge ref (refs/pull/<n>/merge), or a version tag (refs/tags/v*)",
  };
}
