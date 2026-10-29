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

/** Backoff before each retry of a request that never got an answer. */
const RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 20_000];

/**
 * A failure worth retrying: the request got no answer (undici's `fetch failed`
 * TypeError: reset, DNS, timeout) or a gateway in front of the switchboard
 * answered 502/503/504 while it restarts.
 */
function isTransient(err) {
  return isUnanswered(err) || /failed: HTTP 50[234]$/.test(String(err?.message));
}

/**
 * The request got no answer at all. The common case after a long image build
 * is a keep-alive socket the load balancer closed while it sat idle: the first
 * request after the build fails on it without reaching the switchboard.
 */
function isUnanswered(err) {
  return err instanceof TypeError;
}

async function request(method, url, token, body, fetchImpl, retry = {}) {
  const delays = retry.retries === 0 ? [] : RETRY_DELAYS_MS.slice(0, retry.retries ?? RETRY_DELAYS_MS.length);
  const sleep = retry.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; ; attempt++) {
    try {
      return await requestOnce(method, url, token, body, fetchImpl);
    } catch (err) {
      const retryable = retry.unansweredOnly ? isUnanswered(err) : isTransient(err);
      if (attempt >= delays.length || !retryable) throw err;
      console.log(`Vetra: ${method} ${url} failed (${err.message}); retrying in ${delays[attempt] / 1000}s.`);
      await sleep(delays[attempt]);
    }
  }
}

async function requestOnce(method, url, token, body, fetchImpl) {
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
 * POSTs are retried only when they got no answer at all (see isUnanswered),
 * never on an HTTP error. A repeat is harmless for the CI API's POSTs: an
 * artifact version is recorded once, and a second /deploy of the same commit
 * supersedes the first.
 * @param {string} url
 * @param {string} token
 * @param {object} body
 * @param {{ fetchImpl?: typeof fetch, retries?: number, sleep?: (ms: number) => Promise<void> }} [opts]
 */
export function postJson(url, token, body, opts = {}) {
  return request('POST', url, token, body, opts.fetchImpl ?? fetch, {
    retries: opts.retries ?? 2,
    unansweredOnly: true,
    sleep: opts.sleep,
  });
}

/**
 * GETs are retried on transient failures (see isTransient).
 * @param {string} url
 * @param {string} token
 * @param {{ fetchImpl?: typeof fetch, retries?: number, sleep?: (ms: number) => Promise<void> }} [opts]
 */
export function getJson(url, token, opts = {}) {
  return request('GET', url, token, undefined, opts.fetchImpl ?? fetch, {
    retries: opts.retries,
    sleep: opts.sleep,
  });
}
