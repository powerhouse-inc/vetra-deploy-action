// Minimal GraphQL client (global fetch, no dependencies) plus pure
// error-formatting logic used by the vetra-apps subgraph calls.

/**
 * Formats a GraphQL `errors` array as a single human-readable line, including
 * each error's `extensions.code` when present.
 * @param {Array<{ message: string, extensions?: { code?: string } }>} errors
 * @returns {string}
 */
export function formatGraphQLErrors(errors) {
  if (!Array.isArray(errors) || errors.length === 0) return 'unknown GraphQL error';
  return errors
    .map((e) => {
      const code = e?.extensions?.code ? `[${e.extensions.code}] ` : '';
      const message = e?.message ?? 'unknown error';
      return `${code}${message}`;
    })
    .join('; ');
}

/**
 * Posts a GraphQL request and returns `data`. Throws with a formatted message
 * (including extensions.code) on either a transport error or a GraphQL
 * `errors` array.
 * @param {string} url - base switchboard URL (without /graphql)
 * @param {string|null} token - bearer token, or null for unauthenticated calls
 * @param {string} query
 * @param {object} [variables]
 */
export async function graphqlRequest(url, token, query, variables) {
  const endpoint = `${url.replace(/\/+$/, '')}/graphql`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });

  let body;
  try {
    body = await res.json();
  } catch {
    throw new Error(`GraphQL request to ${endpoint} failed: HTTP ${res.status} with a non-JSON body`);
  }

  if (Array.isArray(body?.errors) && body.errors.length > 0) {
    throw new Error(`GraphQL request to ${endpoint} returned errors: ${formatGraphQLErrors(body.errors)}`);
  }
  if (!res.ok) {
    throw new Error(`GraphQL request to ${endpoint} failed: HTTP ${res.status}`);
  }
  return body.data;
}
