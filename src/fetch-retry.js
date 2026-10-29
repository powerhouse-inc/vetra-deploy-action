// Every request the action makes goes through fetch, and any of them can be
// the first one after a long image build or push: its pooled keep-alive
// connection was closed by a load balancer while it sat idle, and the request
// fails without an answer ("fetch failed"). Retried once or twice that way it
// opens a fresh connection. Only a request that got NO answer is retried; an
// HTTP error is returned as is. Every call the action makes is safe to repeat
// (token mint and exchange, artifact record, deploy: see rest.js).

const DELAYS_MS = [1_000, 3_000];

/**
 * @param {typeof fetch} fetchImpl
 * @param {{ delays?: number[], sleep?: (ms: number) => Promise<void>, log?: (msg: string) => void }} [opts]
 * @returns {typeof fetch}
 */
export function withUnansweredRetry(fetchImpl, opts = {}) {
  const delays = opts.delays ?? DELAYS_MS;
  const sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const log = opts.log ?? ((msg) => console.log(msg));
  return async (input, init) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fetchImpl(input, init);
      } catch (err) {
        if (!(err instanceof TypeError) || attempt >= delays.length) throw err;
        const url = typeof input === 'string' ? input : String(input?.url ?? input);
        log(`Vetra: no answer from ${url.split('?')[0]} (${err.message}); retrying.`);
        await sleep(delays[attempt]);
      }
    }
  };
}
