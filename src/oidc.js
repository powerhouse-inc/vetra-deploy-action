// GitHub OIDC ID token retrieval.

/**
 * Requests a GitHub Actions OIDC ID token for the given audience, using the
 * runner-provided `ACTIONS_ID_TOKEN_REQUEST_URL`/`ACTIONS_ID_TOKEN_REQUEST_TOKEN`
 * env vars. These are only present when the job grants
 * `permissions: { id-token: write }`, and GitHub never provides them (or any
 * secrets) to `pull_request` runs triggered from a forked repository.
 * @param {string} audience
 * @param {{ requestUrl?: string, requestToken?: string, fetchImpl?: typeof fetch }} [env]
 * @returns {Promise<string>}
 */
export async function requestOidcToken(audience, env = {}) {
  const requestUrl = env.requestUrl ?? process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = env.requestToken ?? process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  const fetchImpl = env.fetchImpl ?? fetch;

  if (!requestUrl || !requestToken) {
    throw new Error(
      'GitHub OIDC token request variables are missing ' +
        '(ACTIONS_ID_TOKEN_REQUEST_URL / ACTIONS_ID_TOKEN_REQUEST_TOKEN). ' +
        "Add 'permissions: { id-token: write }' to the workflow or job. " +
        'Note: pull_request runs from a forked repository never receive OIDC tokens ' +
        '(or secrets), by GitHub design — fork PRs are not supported by this action.',
    );
  }

  const separator = requestUrl.includes('?') ? '&' : '?';
  const url = `${requestUrl}${separator}audience=${encodeURIComponent(audience)}`;
  const res = await fetchImpl(url, {
    headers: { authorization: `bearer ${requestToken}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub OIDC token request failed: HTTP ${res.status}${text ? ` ${text}` : ''}`);
  }

  const body = await res.json();
  if (!body?.value) {
    throw new Error('GitHub OIDC token response did not contain a value');
  }
  return body.value;
}
