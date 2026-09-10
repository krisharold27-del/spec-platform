/**
 * A sliding-window limit: at most `limit` events per key per window. Pure apart from its own memory.
 *
 * Used to stop the sign-in and sign-up forms being turned into a way to flood an inbox or create
 * businesses in bulk. It lives in server memory, so each server instance counts separately — a
 * floor, not the whole guarantee. The sign-in limit is also kept on the person's sign-in identity
 * (see sendMagicLink), which holds across servers.
 */
export function createThrottle(windowMs: number, maxKeys = 10_000, limit = 1) {
  const hits = new Map<string, number[]>();
  return {
    /** True if this key may go now, and records it. False if it has used its allowance for the window. */
    allow(key: string, now = Date.now()): boolean {
      const recent = (hits.get(key) ?? []).filter(t => now - t < windowMs);
      if (recent.length >= limit) { hits.set(key, recent); return false; }
      if (!hits.has(key) && hits.size >= maxKeys) {
        for (const [k, ts] of hits) if (ts.every(t => now - t >= windowMs)) hits.delete(k);
        if (hits.size >= maxKeys) hits.delete(hits.keys().next().value as string);
      }
      recent.push(now);
      hits.set(key, recent);
      return true;
    },
  };
}
