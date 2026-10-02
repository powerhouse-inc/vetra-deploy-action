// Renown workload tokens live 10 minutes; a FUSION build plus the deploy wait
// can take longer. Re-mint instead of reusing the first token.

/**
 * @param {() => Promise<string>} mint
 * @param {{ maxAgeMs?: number, now?: () => number }} [opts]
 * @returns {() => Promise<string>}
 */
export function createTokenSource(mint, { maxAgeMs = 5 * 60_000, now = Date.now } = {}) {
  let token = null;
  let mintedAt = 0;
  return async () => {
    if (!token || now() - mintedAt >= maxAgeMs) {
      token = await mint();
      mintedAt = now();
    }
    return token;
  };
}
