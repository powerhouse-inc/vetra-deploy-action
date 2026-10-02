// Reads the GitHub Actions event payload (GITHUB_EVENT_PATH) for the one
// field this action needs off it: the pull request's real head sha. For
// `pull_request` events, GITHUB_SHA is the ephemeral merge commit, not the
// commit the PR actually points at, so deployments must use the head sha.

import fs from 'node:fs';

/**
 * @param {string|undefined} eventPath
 * @returns {string|null}
 */
export function getPullRequestHeadSha(eventPath) {
  if (!eventPath || !fs.existsSync(eventPath)) return null;
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  } catch {
    return null;
  }
  return payload?.pull_request?.head?.sha ?? null;
}
