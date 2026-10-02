// Job summary rendering ($GITHUB_STEP_SUMMARY).

import { appendSummary } from './util.js';

/**
 * Renders a deployment (or deployApp mutation result) as a small markdown
 * table and appends it to the job summary.
 * @param {{ status?: string, error?: string, urls?: { app?: string, connect?: string, switchboard?: string } }} deployment
 */
export function renderSummary(deployment) {
  const urls = deployment?.urls ?? {};
  const rows = [
    ['Status', deployment?.status ?? 'UNKNOWN'],
    ['App URL', urls.app ? `[${urls.app}](${urls.app})` : '_n/a_'],
    ['Connect URL', urls.connect ? `[${urls.connect}](${urls.connect})` : '_n/a_'],
    ['Switchboard URL', urls.switchboard ? `[${urls.switchboard}](${urls.switchboard})` : '_n/a_'],
  ];
  if (deployment?.error) {
    rows.push(['Error', deployment.error]);
  }

  const lines = [
    '## Vetra Deploy',
    '',
    '| | |',
    '|---|---|',
    ...rows.map(([k, v]) => `| **${k}** | ${v} |`),
    '',
  ];
  return lines.join('\n');
}

/** @param {object} deployment */
export function writeSummary(deployment) {
  appendSummary(renderSummary(deployment));
}
