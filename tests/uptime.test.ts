import { describe, it, expect } from 'vitest';
import { summarise, expectedChecks, quantile, uptimeLabel, basis, CHECK_EVERY_MINUTES } from '../src/lib/uptime';

const NOW = new Date('2026-09-13T12:00:00Z');
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000).toISOString();

/** A run of healthy checks, newest last, one every five minutes. */
const run = (count: number, ms = 100) =>
  Array.from({ length: count }, (_, i) => ({ at: minutesAgo((count - 1 - i) * CHECK_EVERY_MINUTES), ok: true, ms }));

describe('uptime, from checks that actually happened', () => {
  it('says nothing rather than 100% when nothing has been measured', () => {
    const u = summarise([], NOW);
    expect(u.pct).toBeNull();
    expect(uptimeLabel(u.pct)).toBe('—');
    expect(basis(u)).toMatch(/Nothing measured yet/);
  });

  it('reports a clean run as complete', () => {
    const u = summarise(run(12), NOW);
    expect(u.pct).toBe(100);
    expect(u.ok).toBe(12);
    expect(u.missed).toBe(0);
  });

  /*
    THE FAILURE MODE THIS FILE EXISTS FOR.

    When the app is down, nothing runs and nothing is written, so the table just has a gap. Counting
    successes over ROWS gives 100% however long the outage was — the worse it is, the fewer rows
    argue against it. Gaps have to count.
  */
  it('counts an outage that left no trace at all', () => {
    // Half an hour of health, ending an hour and a half ago…
    const before = [115, 110, 105, 100, 95, 90].map(m => ({ at: minutesAgo(m), ok: true, ms: 100 }));
    // …then nothing at all for ninety minutes: the app was down and could not record its own
    // failure, so the only evidence of the outage is the absence of rows.
    const after = [{ at: minutesAgo(0), ok: true, ms: 100 }];
    const u = summarise([...before, ...after], NOW);

    expect(u.ok).toBe(7);
    expect(u.expected).toBeGreaterThan(7);
    expect(u.pct).toBeLessThan(100);
    expect(u.missed).toBeGreaterThan(0);
    expect(basis(u)).toMatch(/never ran, counted against it/);
  });

  it('counts a check that ran and failed', () => {
    const pings = run(10);
    pings[4] = { ...pings[4], ok: false };
    const u = summarise(pings, NOW);
    expect(u.ok).toBe(9);
    expect(u.pct).toBeLessThan(100);
  });

  /*
    A window wider than the history would invent an outage for the time before measuring started.
    A business that switched this on yesterday has not been down for twenty-nine days.
  */
  it('does not blame the business for time before it was measuring', () => {
    const u = summarise(run(3), NOW);
    expect(u.pct).toBe(100);
    expect(u.expected).toBe(3);
  });

  it('works out how many checks were due', () => {
    expect(expectedChecks(minutesAgo(0), NOW)).toBe(1);
    expect(expectedChecks(minutesAgo(60), NOW)).toBe(13);   // one now, twelve in the hour
  });

  it('ignores an unreadable timestamp rather than producing nonsense', () => {
    expect(expectedChecks('not a date', NOW)).toBe(0);
  });

  it('reports the middle and the slow tail, from the checks that answered', () => {
    const pings = [10, 20, 30, 40, 1000].map((ms, i) => ({ at: minutesAgo(i * 5), ok: true, ms }));
    const u = summarise(pings, NOW);
    expect(u.median).toBe(30);
    expect(u.p95!).toBeGreaterThan(40);
  });

  it('leaves a failed check out of the response times', () => {
    const pings = [
      { at: minutesAgo(10), ok: true, ms: 100 },
      { at: minutesAgo(5), ok: false, ms: 9999 },
      { at: minutesAgo(0), ok: true, ms: 120 },
    ];
    expect(summarise(pings, NOW).median).toBe(110);
  });

  it('handles a single sample', () => {
    expect(quantile([42], 0.95)).toBe(42);
    expect(quantile([], 0.5)).toBeNull();
  });

  /*
    99.994% is not "100%". The entire reason anybody reads this number is the difference between
    those two, so it is floored, never rounded up to something nicer.
  */
  it('never rounds an imperfect figure up to a perfect one', () => {
    expect(uptimeLabel(99.994)).toBe('99.99%');
    expect(uptimeLabel(99.999)).toBe('99.99%');
    expect(uptimeLabel(100)).toBe('100.00%');
  });
});

/*
  Checks can arrive faster than the schedule — a deploy fires one, somebody runs it by hand, two
  instances overlap. Read from the clock alone, the expected count is then smaller than the number
  that actually answered, and the page reads "17 of 1 checks answered": gibberish, on the one panel
  whose entire job is to be believed.
*/
describe('when checks arrive faster than the schedule', () => {
  it('never claims more answered than were expected', () => {
    const burst = Array.from({ length: 17 }, (_, i) => ({
      at: new Date(NOW.getTime() - (17 - i) * 1000).toISOString(),  // one a second
      ok: true,
      ms: 5,
    }));
    const u = summarise(burst, NOW);
    expect(u.ok).toBe(17);
    expect(u.expected).toBeGreaterThanOrEqual(u.ok);
    expect(basis(u)).toBe('17 of 17 checks answered over 1 day.');
    expect(u.pct).toBe(100);
  });

  it('still counts a genuine gap when checks were also bunched', () => {
    const early = Array.from({ length: 4 }, (_, i) => ({ at: minutesAgo(120 - i), ok: true, ms: 5 }));
    const late = [{ at: minutesAgo(0), ok: true, ms: 5 }];
    const u = summarise([...early, ...late], NOW);
    expect(u.pct).toBeLessThan(100);
    expect(u.missed).toBeGreaterThan(0);
  });
});
