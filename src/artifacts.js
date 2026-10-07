// Registers a published artifact (package tarball or FUSION image) on the App's
// document, via the vetra-apps CI API. This is what makes a version offerable
// in the licence template builder.

import { appsCiBaseUrl, formatApiError } from './rest.js';
import { warning } from './util.js';

/**
 * Which auto-update channel, if any, this run's artifacts should claim.
 *
 * Mirrors the npm dist-tags the same run publishes under
 * (`distTagForClassification`): a tag release is what `LATEST` means, a
 * production-branch build is what `STAGING` tracks, and a preview belongs to
 * one pull request and is never a channel anyone auto-updates to. `DEV` is
 * reserved for publishes that do not come from this action.
 *
 * @param {{ kind: string }} classification
 * @returns {'LATEST' | 'STAGING' | null}
 */
export function channelForClassification(classification) {
  switch (classification?.kind) {
    case 'release':
      return 'LATEST';
    case 'production':
      return 'STAGING';
    default:
      return null;
  }
}

/**
 * Records one artifact. Never throws.
 *
 * By the time this runs the package is already on the registry and the image is
 * already in Harbor. Failing the job here would report a successful publish as
 * a failed one; the drift the miss creates is visible in the App document and
 * fixable by re-running. The publish itself is what must not be lost.
 *
 * @param {string} vetraUrl
 * @param {string} token
 * @param {{ appId: string, kind: 'PACKAGE' | 'FUSION_IMAGE', name: string,
 *          version: string, reference: string, commitSha?: string,
 *          runId?: string, channel?: string | null }} artifact
 * @param {{ fetchImpl?: typeof fetch, warn?: (msg: string) => void }} [opts]
 */
export async function recordArtifact(vetraUrl, token, artifact, opts = {}) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const warn = opts.warn ?? warning;
  const url = `${appsCiBaseUrl(vetraUrl)}/artifacts`;

  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(artifact),
    });
    if (!res.ok) {
      let body = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      const detail =
        body && typeof body === 'object' && 'error' in body
          ? formatApiError(body)
          : `HTTP ${res.status}`;
      warn(
        `Vetra: could not record ${artifact.kind} ${artifact.name}@${artifact.version}: ${detail}`,
      );
    }
  } catch (err) {
    warn(
      `Vetra: could not record ${artifact.kind} ${artifact.name}@${artifact.version}: ${err?.message ?? String(err)}`,
    );
  }
}
