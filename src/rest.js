// Minimal REST client (global fetch, no dependencies) for the vetra-apps CI
// API, plus the pure helpers it's built on: the workload-token audience/base
// URL it's scoped to, and its `{ error, message }` error-response format.

function trimTrailingSlash(url) {
  return String(url).replace(/\/+$/, '');
}

/**
 * The audience the CI workload token must be minted for to call this API.
 * @param {string} vetraUrl
 */
export function appsAudience(vetraUrl) {
  return `${trimTrailingSlash(vetraUrl)}/api/@powerhousedao/vetra-cloud-package/apps`;
}

/**
 * Base URL for the CI endpoints (registry-credentials, deploy, deployments/:id).
 * @param {string} vetraUrl
 */
export function appsCiBaseUrl(vetraUrl) {
  return `${appsAudience(vetraUrl)}/ci`;
}

/**
 * Formats a `{ error, message }` API error body as `"<error>: <message>"`.
 * @param {{ error?: string, message?: string }} body
 */
export function formatApiError(body) {
  const code = body?.error ?? 'UNKNOWN_ERROR';
  const message = body?.message ?? 'unknown error';
  return `${code}: ${message}`;
}

async function request(method, url, token, body, fetchImpl) {
  const res = await fetchImpl(url, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    if (json && typeof json === 'object' && 'error' in json) {
      throw new Error(formatApiError(json));
    }
    throw new Error(`${url} failed: HTTP ${res.status}`);
  }
  return json;
}

/**
 * @param {string} url
 * @param {string} token
 * @param {object} body
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 */
export function postJson(url, token, body, opts = {}) {
  return request('POST', url, token, body, opts.fetchImpl ?? fetch);
}

/**
 * @param {string} url
 * @param {string} token
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 */
export function getJson(url, token, opts = {}) {
  return request('GET', url, token, undefined, opts.fetchImpl ?? fetch);
}
