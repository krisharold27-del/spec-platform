/**
 * A fixed-window throttle: at most one event per key per window. Pure apart from its own memory.
 *
 * Used to stop the sign-in form being turned into a way to flood someone's inbox. It lives in
 * server memory, so each server instance counts separately — a floor, not a guarantee. A
 * database-backed limit belongs with the schema work (BUILD_SPEC §1).
 */
export function createThrottle(windowMs: number, maxKeys = 10_000) {
  const last = new Map<string, number>();
  return {
    /** True if this key may go now, and records it. False if it went within the window. */
    allow(key: string, now = Date.now()): boolean {
      const prev = last.get(key);
      if (prev !== undefined && now - prev < windowMs) return false;
      if (last.size >= maxKeys) {
        for (const [k, t] of last) if (now - t >= windowMs) last.delete(k);
        if (last.size >= maxKeys) last.delete(last.keys().next().value as string);
      }
      last.set(key, now);
      return true;
    },
  };
}
