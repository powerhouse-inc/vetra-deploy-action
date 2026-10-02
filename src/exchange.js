// Renown workload token exchange (contract C1).

/**
 * Exchanges a GitHub OIDC subject token for a Renown bearer token scoped to
 * one target audience (a registry URL or the Vetra switchboard URL).
 * @param {string} renownUrl
 * @param {string} subjectToken
 * @param {string} audience
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<string>}
 */
export async function exchangeToken(renownUrl, subjectToken, audience, opts = {}) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const endpoint = `${renownUrl.replace(/\/+$/, '')}/api/@powerhousedao/renown-package/workload/token`;

  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subject_token: subjectToken, audience }),
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const detail = body?.error_description ? `: ${body.error_description}` : '';
    throw new Error(
      `Renown workload token exchange failed for audience '${audience}': ` +
        `HTTP ${res.status} ${body?.error ?? ''}${detail}`.trim(),
    );
  }
  if (!body?.access_token) {
    throw new Error(`Renown workload token exchange for audience '${audience}' did not return an access_token`);
  }
  return body.access_token;
}
