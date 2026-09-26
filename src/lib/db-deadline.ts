/**
 * A deadline on every database wait.
 *
 * On 26 September /org hung for the full 300 seconds Vercel allows, twice in one morning, while
 * /api/ping on the same database answered every five minutes. Nothing on /org loops without a
 * visited set and its AI calls are bounded, so the wait was a query that never came back — the
 * classic serverless shape: an instance is frozen between requests, the pooler drops its socket,
 * and the thawed instance writes the next query into a connection nobody is listening to. With no
 * deadline, postgres.js waits for an answer that is never coming and the customer watches a blank
 * tab for five minutes.
 *
 * So each query gets a deadline. Past it, `onStuck` runs (the caller drops the connection, which
 * rejects the waiting query, and the next query opens a fresh one) and the query is named in the
 * log, so the next time this happens the log says where rather than leaving it to be guessed.
 * Anything slower than `slowMs` is logged too, so a query drifting towards the deadline shows up
 * before it reaches it.
 *
 * Works on any thenable, which is what a postgres.js query is: it runs when first awaited, so the
 * clock starts there — building a query and handing it to drizzle costs nothing.
 */

export interface DeadlineOptions {
  deadlineMs: number;
  slowMs: number;
  onStuck: () => void;
  log?: (line: string) => void;
}

/** The query's first line, clipped — enough to name it, never its parameters. */
export const nameQuery = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 140);

export function withDeadline<Q extends PromiseLike<unknown>>(query: Q, text: string, opts: DeadlineOptions): Q {
  const log = opts.log ?? ((line: string) => console.error(line));
  const original = query.then;
  let started = false;
  (query as { then: unknown }).then = function then(this: Q, ok?: (v: unknown) => unknown, fail?: (e: unknown) => unknown) {
    if (!started) {
      started = true;
      const t0 = Date.now();
      const timer = setTimeout(() => {
        log(`[db] no answer after ${opts.deadlineMs}ms, reconnecting: ${nameQuery(text)}`);
        opts.onStuck();
      }, opts.deadlineMs);
      (timer as { unref?: () => void }).unref?.();
      const done = () => {
        clearTimeout(timer);
        const ms = Date.now() - t0;
        if (ms >= opts.slowMs && ms < opts.deadlineMs) log(`[db] slow query ${ms}ms: ${nameQuery(text)}`);
      };
      return original.call(this, v => { done(); return ok ? ok(v) : v; }, e => { done(); if (fail) return fail(e); throw e; });
    }
    return original.call(this, ok, fail);
  };
  return query;
}
