/**
 * Uptime and response time, from checks that actually happened — pure, no I/O.
 *
 * ── The thing almost every uptime figure gets wrong ──────────────────────────────────────────────
 *
 * **A failed check cannot record itself.** When the app is down, nothing runs, nothing is written,
 * and the table simply has a gap. Counting successes over rows therefore gives 100% no matter how
 * much downtime there was — the worse the outage, the fewer rows arguing against it. That is not a
 * rounding error; it is a number that is exactly wrong in the one situation it exists for.
 *
 * So uptime here is successes over the checks that SHOULD have happened in the window, worked out
 * from the interval and the clock. A gap counts against it, which is the whole point.
 *
 * The honest limitation, stated here and on the page rather than buried: a missing check can mean
 * the scheduler did not fire rather than the site being down. This measures "SPEC answered when
 * asked", which is close to uptime and is not a synonym for it.
 */

export const CHECK_EVERY_MINUTES = 5;

export interface Ping { at: string; ok: boolean; ms: number }

export interface Uptime {
  /** 0–100, or null when there is nothing to go on. Never a default of 100. */
  pct: number | null;
  /** Checks that answered. */
  ok: number;
  /** Checks that should have happened across the window. */
  expected: number;
  /** Middle response time in milliseconds, of the checks that answered. */
  median: number | null;
  /** The slow tail — what one request in twenty looks like. */
  p95: number | null;
  /** When the first check in the window happened, so the page can say what it is based on. */
  since: string | null;
  /** How many checks are missing entirely. */
  missed: number;
}

/**
 * How many checks were due between two instants.
 *
 * Counted from the FIRST CHECK rather than from the start of the window, because a window wider
 * than the history would invent an outage for the time before measuring began. A business that
 * switched this on yesterday has not been down for twenty-nine days.
 */
export function expectedChecks(firstAt: string, now: Date, everyMinutes = CHECK_EVERY_MINUTES): number {
  const start = Date.parse(firstAt);
  if (Number.isNaN(start)) return 0;
  const minutes = (now.getTime() - start) / 60_000;
  return Math.max(1, Math.floor(minutes / everyMinutes) + 1);
}

/** The value below which `fraction` of the samples sit. Linear, on a sorted copy. */
export function quantile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const at = fraction * (sorted.length - 1);
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return lo === hi ? sorted[lo] : Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo));
}

export function summarise(pings: Ping[], now: Date = new Date(), everyMinutes = CHECK_EVERY_MINUTES): Uptime {
  if (pings.length === 0) {
    return { pct: null, ok: 0, expected: 0, median: null, p95: null, since: null, missed: 0 };
  }

  const sorted = [...pings].sort((a, b) => (a.at < b.at ? -1 : 1));
  const since = sorted[0].at;
  const ok = sorted.filter(p => p.ok);

  /*
    Never fewer than the checks that actually ran.

    The expected count comes from the clock, and checks can arrive faster than the schedule — a
    deploy that fires one, somebody running it by hand, two instances overlapping. Taken on its own
    the clock then says one check was due while seventeen answered, and the page reads "17 of 1
    checks answered", which is gibberish on the one panel whose job is to be trusted.

    Whatever ran, ran. The clock only ever ADDS the checks that should have happened and did not.
  */
  const expected = Math.max(expectedChecks(since, now, everyMinutes), sorted.length);

  // A check that ran and failed is already counted against us by being `ok: false`; a check that
  // never ran is counted by the expected total being larger than the rows. Both end up in the same
  // percentage, which is what makes it mean anything.
  const pct = expected > 0 ? Math.min(100, (ok.length / expected) * 100) : null;
  const times = ok.map(p => p.ms);

  return {
    pct,
    ok: ok.length,
    expected,
    median: quantile(times, 0.5),
    p95: quantile(times, 0.95),
    since,
    missed: Math.max(0, expected - sorted.length),
  };
}

/**
 * Two decimal places, and never rounded up to a nicer number.
 *
 * 99.994% is not "100%". The whole reason anybody looks at this figure is the difference between
 * those two, and a display that rounds it away is answering a question nobody asked.
 */
export function uptimeLabel(pct: number | null): string {
  if (pct === null) return '—';
  const floored = Math.floor(pct * 100) / 100;
  return `${floored.toFixed(2)}%`;
}

/** What this figure is actually based on, said plainly under it. */
export function basis(u: Uptime): string {
  if (u.pct === null) return 'Nothing measured yet. The first check writes a reading within a few minutes of the next deploy.';
  const days = u.since ? Math.max(1, Math.round((Date.now() - Date.parse(u.since)) / 86_400_000)) : 1;
  const missed = u.missed > 0 ? ` ${u.missed} check${u.missed === 1 ? '' : 's'} never ran, counted against it.` : '';
  return `${u.ok} of ${u.expected} checks answered over ${days} day${days === 1 ? '' : 's'}.${missed}`;
}
