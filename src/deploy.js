// Calls against the vetra-apps CI REST API: registry credentials, deployApp,
// and appDeployment polling.

import { appsCiBaseUrl, getJson, postJson } from './rest.js';

/**
 * @param {string} vetraUrl
 * @param {string} token
 * @param {string} appId
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 */
export async function fetchAppRegistryCredentials(vetraUrl, token, appId, opts) {
  return postJson(`${appsCiBaseUrl(vetraUrl)}/registry-credentials`, token, { appId }, opts);
}

/**
 * @param {string} vetraUrl
 * @param {string} token
 * @param {object} input
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 */
export async function deployApp(vetraUrl, token, input, opts) {
  return postJson(`${appsCiBaseUrl(vetraUrl)}/deploy`, token, input, opts);
}

/**
 * @param {string} vetraUrl
 * @param {string} token
 * @param {string} id
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 */
export async function fetchAppDeployment(vetraUrl, token, id, opts) {
  return getJson(`${appsCiBaseUrl(vetraUrl)}/deployments/${encodeURIComponent(id)}`, token, opts);
}

const TERMINAL_STATUSES = new Set(['READY', 'FAILED', 'SUPERSEDED']);

/**
 * Polls `GET /deployments/:id` every `intervalMs` until it reaches a terminal
 * status, or returns a synthetic `{ status: 'TIMEOUT' }` result once
 * `timeoutMinutes` elapses.
 * @param {string} vetraUrl
 * @param {string} token
 * @param {string} id
 * @param {{
 *   timeoutMinutes?: number, intervalMs?: number,
 *   sleep?: (ms: number) => Promise<void>, now?: () => number,
 *   fetchImpl?: typeof fetch,
 * }} [opts]
 */
export async function pollDeployment(vetraUrl, token, id, opts = {}) {
  const { timeoutMinutes = 15, intervalMs = 10_000, sleep = defaultSleep, now = Date.now, fetchImpl } = opts;
  const deadline = now() + timeoutMinutes * 60_000;
  let last = null;

  while (now() < deadline) {
    last = await fetchAppDeployment(vetraUrl, token, id, { fetchImpl });
    if (last && TERMINAL_STATUSES.has(last.status)) return last;
    await sleep(intervalMs);
  }

  return { ...(last ?? {}), id, status: 'TIMEOUT' };
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
