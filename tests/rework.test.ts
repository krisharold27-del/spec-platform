import { describe, it, expect } from 'vitest';
import {
  carriedCents, unpaidRework, oursByDefault, carriedLine,
  RECOVERY_GOES_STALE_DAYS, recoverFrom, ONA_US, type Callback,
} from '../src/lib/rework';

/*
  ── Unpaid rework ───────────────────────────────────────────────────────────────────────────────

  Kris, 25 September: "anything re work or call back that isnt paid is a key power meter
  detractor".
*/
describe('the rework that never got paid for', () => {
  const cb = (over: Partial<Callback> = {}): Callback => ({
    id: Math.random().toString(36).slice(2),
    jobRef: 'J-1001', cause: 'workmanship', hours: 4, costCents: 100_000,
    recoveredCents: 0, who: 'Jamie', at: '2026-01-01T00:00:00.000Z', ...over,
  });
  const at = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  it('counts what went out less what came back, whatever the cause', () => {
    expect(carriedCents(cb({ costCents: 100_000, recoveredCents: 40_000 }))).toBe(60_000);
    expect(carriedCents(cb({ costCents: 100_000, recoveredCents: 100_000 }))).toBe(0);
  });

  it('never goes negative when more came back than went out', () => {
    /* A supplier settling above cost is good news, not a credit against other rework. */
    expect(carriedCents(cb({ costCents: 50_000, recoveredCents: 90_000 }))).toBe(0);
  });

  it('a material fault nobody claimed costs exactly what our own workmanship costs', () => {
    /*
      The correction this whole section exists for. Cause decides who OUGHT to pay; it does not
      decide who did. Three rows reading "supplier" with nothing recovered are three rows the
      business believes are covered and none of them are.
    */
    const ours = unpaidRework([cb({ cause: 'workmanship', costCents: 80_000 })], 0, at('2026-06-01'));
    const theirs = unpaidRework([cb({ cause: 'material', costCents: 80_000 })], 0, at('2026-06-01'));
    expect(theirs.carriedCents).toBe(ours.carriedCents);
  });

  it('separates what we meant to carry from what nobody asked for', () => {
    const u = unpaidRework([
      cb({ cause: 'workmanship', costCents: 30_000 }),
      cb({ cause: 'material', costCents: 50_000 }),
      cb({ cause: 'subbie', costCents: 20_000 }),
    ], 0, at('2026-06-01'));
    expect(u.byDecisionCents).toBe(30_000);
    expect(u.byDefaultCents).toBe(70_000);
    expect(u.byDefault).toHaveLength(2);
  });

  it('the two halves always add up to the whole', () => {
    /* Subtracted rather than filtered by cause, so no money can fall between them. */
    const rows = [
      cb({ cause: 'workmanship', costCents: 30_000 }),
      cb({ cause: 'material', costCents: 50_000, recoveredCents: 10_000 }),
      cb({ cause: 'not_ours', costCents: 20_000, at: '2026-05-25T00:00:00.000Z' }),
    ];
    const u = unpaidRework(rows, 0, at('2026-06-01'));
    expect(u.byDecisionCents + u.byDefaultCents).toBe(u.carriedCents);
  });

  it('leaves a claim alone while it could still genuinely be running', () => {
    const fresh = unpaidRework([cb({ cause: 'material', at: '2026-05-20T00:00:00.000Z' })], 0, at('2026-06-01'));
    expect(fresh.byDefault).toEqual([]);
    expect(fresh.byDecisionCents).toBe(100_000);
  });

  it('a claim with something back is not abandoned, however old', () => {
    const part = unpaidRework(
      [cb({ cause: 'material', costCents: 100_000, recoveredCents: 1, at: '2025-01-01T00:00:00.000Z' })],
      0, at('2026-06-01'),
    );
    expect(part.byDefault).toEqual([]);
  });

  it('says it as money, and leads with the part that can be got back this week', () => {
    const u = unpaidRework([
      cb({ cause: 'workmanship', costCents: 30_000 }),
      cb({ cause: 'material', costCents: 70_000 }),
    ], 4_000_000, at('2026-06-01'));
    const line = carriedLine(u);
    expect(line).toMatch(/done twice and paid for once/);
    expect(line).toMatch(/2\.5% of what you billed/);
    expect(line).toMatch(/never asked for/);
    /* The money comes before the rate — a rate is nodded at, a figure is acted on. */
    expect(line.indexOf('$')).toBeLessThan(line.indexOf('%'));
  });

  it('says nothing when nothing went out unpaid', () => {
    expect(carriedLine(unpaidRework([cb({ recoveredCents: 100_000 })], 100_000, at('2026-06-01'))))
      .toBe('Nothing went back out unpaid.');
  });

  it('gives no share when nothing was billed, rather than a zero', () => {
    expect(unpaidRework([cb()], 0, at('2026-06-01')).shareOfRevenue).toBeNull();
    expect(carriedLine(unpaidRework([cb()], 0, at('2026-06-01')))).not.toMatch(/%/);
  });
});
