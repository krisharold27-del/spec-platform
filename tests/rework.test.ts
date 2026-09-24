import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  carriedCents, unpaidRework, oursByDefault, carriedLine,
  RECOVERY_GOES_STALE_DAYS, recoverFrom, ONA_US, CAUSES,
  returningIs, returningSays, RETURNING_RULE, type Callback,
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

/*
  ── Paid is a continuation; unpaid is rework ────────────────────────────────────────────────────

  Kris, 25 September: "if returning for troubleshooting etc and paid this is just a continuation of
  the job - anything paid simple job process - unpaid is re work and negative to the business".
*/
describe('the first question is whether it is paid, not whose fault it was', () => {
  it('paid is a continuation of the job', () => {
    expect(returningIs(true)).toBe('continuation');
    expect(returningSays(true)).toMatch(/not a callback/i);
    expect(returningSays(true)).toMatch(/will not count against/i);
  });

  it('unpaid is rework, and says what it costs', () => {
    expect(returningIs(false)).toBe('rework');
    expect(returningSays(false)).toMatch(/gross profit/i);
  });

  it('the rule is stated in the words the decision is made in', () => {
    expect(RETURNING_RULE).toMatch(/paid/i);
    expect(RETURNING_RULE).toMatch(/rework/i);
    /* No jargon, because it is read at the end of a long day. */
    expect(RETURNING_RULE).not.toMatch(/utilisation|variance|classification/i);
  });

  it('"not our work" no longer claims to be invoiced', () => {
    /*
      It used to read "Invoiced as a call-out", which under this rule is a contradiction: if it was
      invoiced it was paid, so it was never a callback. The cause now means what is left — somebody
      else's fault and we did not charge for the visit.
    */
    const c = CAUSES.find(x => x.key === 'not_ours')!;
    expect(c.label).toMatch(/not charged/i);
    expect(c.consequence).not.toMatch(/^Invoiced/);
  });

  it('the action returns before it ever looks at the cause when it is paid', () => {
    /*
      Read off the file, because this is a rule about ORDER — and order is the whole point. Asking
      whose fault it was for work a customer is happily paying for is the question that made people
      stop filling this in.
    */
    const src = readFileSync('src/app/jobs/actions.ts', 'utf8');
    const fn = src.slice(src.indexOf('export async function logCallback'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    const paidAt = body.indexOf("'paid'");
    const causeAt = body.indexOf("'cause'");
    expect(paidAt).toBeGreaterThan(-1);
    expect(causeAt).toBeGreaterThan(-1);
    expect(paidAt, 'the cause is asked before the paid question').toBeLessThan(causeAt);
    /* And a paid return writes time on the job rather than a callback row. */
    expect(body.slice(paidAt, causeAt)).toContain('timesheetEntries');
  });
});
