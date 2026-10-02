// deployApp / appDeployment calls against the vetra-apps subgraph (contract C3).

import { graphqlRequest } from './graphql.js';

const DEPLOY_APP_MUTATION = `
mutation DeployApp($input: DeployAppInput!) {
  deployApp(input: $input) {
    id
    status
    error
    urls { app connect switchboard }
  }
}`;

const APP_DEPLOYMENT_QUERY = `
query AppDeployment($id: ID!) {
  appDeployment(id: $id) {
    id
    status
    error
    urls { app connect switchboard }
  }
}`;

const APP_REGISTRY_CREDENTIALS_QUERY = `
query AppRegistryCredentials($appId: ID!) {
  appRegistryCredentials(appId: $appId) {
    registry
    project
    username
    password
  }
}`;

/** @param {string} vetraUrl @param {string} token @param {object} input */
export async function deployApp(vetraUrl, token, input) {
  const data = await graphqlRequest(vetraUrl, token, DEPLOY_APP_MUTATION, { input });
  return data.deployApp;
}

/** @param {string} vetraUrl @param {string} token @param {string} id */
export async function fetchAppDeployment(vetraUrl, token, id) {
  const data = await graphqlRequest(vetraUrl, token, APP_DEPLOYMENT_QUERY, { id });
  return data.appDeployment;
}

/** @param {string} vetraUrl @param {string} token @param {string} appId */
export async function fetchAppRegistryCredentials(vetraUrl, token, appId) {
  const data = await graphqlRequest(vetraUrl, token, APP_REGISTRY_CREDENTIALS_QUERY, { appId });
  return data.appRegistryCredentials;
}

const TERMINAL_STATUSES = new Set(['READY', 'FAILED', 'SUPERSEDED']);

/**
 * Polls `appDeployment(id)` every `intervalMs` until it reaches a terminal
 * status, or returns a synthetic `{ status: 'TIMEOUT' }` result once
 * `timeoutMinutes` elapses.
 * @param {string} vetraUrl
 * @param {string} token
 * @param {string} id
 * @param {{ timeoutMinutes?: number, intervalMs?: number, sleep?: (ms: number) => Promise<void>, now?: () => number }} [opts]
 */
export async function pollDeployment(vetraUrl, token, id, opts = {}) {
  const { timeoutMinutes = 15, intervalMs = 10_000, sleep = defaultSleep, now = Date.now } = opts;
  const deadline = now() + timeoutMinutes * 60_000;
  let last = null;

  while (now() < deadline) {
    last = await fetchAppDeployment(vetraUrl, token, id);
    if (last && TERMINAL_STATUSES.has(last.status)) return last;
    await sleep(intervalMs);
  }

  return { ...(last ?? {}), id, status: 'TIMEOUT' };
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
