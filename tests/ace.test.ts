import { describe, it, expect } from 'vitest';
import { aceByMonth, incentiveFor, ACE_MONTHS_REQUIRED } from '../src/lib/incentive';
import { AT_THE_STANDARD } from '../src/lib/scoring';

/*
  ── Ace: three months at the standard, then it pays and the count starts again ───────────────────

  Set by Kris. Sales Ace and Ops Ace are the same mechanism under two names — a sales role earns
  one, an operations role the other.

  It is a SPRINT, not a standing, and that is most of the money. Twelve months at the standard pay
  double four times, not twelve. The version built before this paid double every month once earned
  and only stopped after two consecutive failures, which is a far more expensive scheme.

  90% is the SPEC standard itself, deliberately: Ace is not "doing well" — green starts at 80% — it
  is holding the standard the whole method rests on, three times over.
*/

const m = (...pcts: (number | null)[]) => pcts.map(rolePct => ({ rolePct }));

describe('the Ace run', () => {
  it('needs three consecutive months at the standard', () => {
    expect(ACE_MONTHS_REQUIRED).toBe(3);
    expect(aceByMonth(m(0.95, 0.92))).toEqual([false, false]);
    expect(aceByMonth(m(0.95, 0.92, 0.91))).toEqual([false, false, true]);
  });

  /* Never backdated. The two months building towards it pay normally — a run is not proven until
     it is finished, and paying for it early would pay for a run that might not happen. */
  it('pays only on the month the run completes', () => {
    expect(aceByMonth(m(0.9, 0.9, 0.9))).toEqual([false, false, true]);
  });

  it('starts the three months again after it pays', () => {
    // Six months at the standard pay twice: the third and the sixth.
    expect(aceByMonth(m(0.95, 0.95, 0.95, 0.95, 0.95, 0.95)))
      .toEqual([false, false, true, false, false, true]);
  });

  it('pays four times across a perfect year, not twelve', () => {
    const year = aceByMonth(m(...Array(12).fill(0.95)));
    expect(year.filter(Boolean)).toHaveLength(4);
    expect(year.map((p, i) => (p ? i + 1 : null)).filter(Boolean)).toEqual([3, 6, 9, 12]);
  });

  /* No partial credit. A run that survives a bad month is not a run. */
  it('resets the count on a single month below the standard', () => {
    expect(aceByMonth(m(0.95, 0.95, 0.89, 0.95, 0.95))).toEqual([false, false, false, false, false]);
    expect(aceByMonth(m(0.95, 0.95, 0.89, 0.95, 0.95, 0.95)))
      .toEqual([false, false, false, false, false, true]);
  });

  it('treats exactly 90% as at the standard', () => {
    expect(AT_THE_STANDARD).toBe(0.9);
    expect(aceByMonth(m(0.9, 0.9, 0.9))).toEqual([false, false, true]);
    expect(aceByMonth(m(0.899, 0.9, 0.9, 0.9))).toEqual([false, false, false, true]);
  });

  /* An unscored month is not at the standard. Counting it as a pass would pay double off a month
     nobody marked. */
  it('breaks the run on a month nobody scored', () => {
    expect(aceByMonth(m(0.95, null, 0.95, 0.95))).toEqual([false, false, false, false]);
  });

  it('doubles the ceiling in the month it pays', () => {
    const plain = incentiveFor({ roles: [{ level: 'manager', rolePct: 0.95 }], chainPillars: [] });
    const ace = incentiveFor({ roles: [{ level: 'manager', rolePct: 0.95 }], chainPillars: [], salesAce: true });
    expect(plain.ceiling).toBe(2000);
    expect(ace.ceiling).toBe(4000);
    expect(ace.payable).toBe(plain.payable * 2);
  });

  /* The director can switch the doubling off; the standing still shows, with no money attached. */
  it('shows the standing without the money when doubling is off', () => {
    const r = incentiveFor({
      roles: [{ level: 'manager', rolePct: 0.95 }], chainPillars: [],
      salesAce: true, salesAceDoubling: false,
    });
    expect(r.ceiling).toBe(2000);
  });
});
