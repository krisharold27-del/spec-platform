import { describe, it, expect } from 'vitest';
import { incentiveFor, sectionFailed, DEDUCTION_CAP } from '../src/lib/incentive';
import type { Pillar } from '../src/lib/scoring';

const tally = (scored: number, notMet: number) => ({ scored, notMet });
const report = (s: [number, number], p: [number, number], e: [number, number], c: [number, number]) =>
  ({ safety: tally(...s), people: tally(...p), earnings: tally(...e), compliance: tally(...c) } as Record<Pillar, ReturnType<typeof tally>>);

const score = (safety: number, people: number, earnings: number, compliance: number) => ({
  pillars: { safety, people, earnings, compliance },
  overall: (safety + people + earnings + compliance) / 4,
});

describe('a section fails on a majority of scored KPIs not met', () => {
  it('fails when most are not met', () => expect(sectionFailed(tally(3, 2))).toBe(true));
  it('does not fail on an exact half', () => expect(sectionFailed(tally(2, 1))).toBe(false));
  it('does not fail when nothing is scored', () => expect(sectionFailed(tally(0, 0))).toBe(false));
});

describe('August 2026, against the real review pack', () => {
  // Jordan 87.5%, Anthony 70.8%, Jason 65.0% — managers, $2,000 max.
  it('pays each manager their overall against $2,000', () => {
    expect(incentiveFor('manager', score(1, 1, 1, 0.5)).final).toBe(1750);   // Jordan
    expect(incentiveFor('manager', score(1, 1, 0.5, 1 / 3)).final).toBe(1416); // Anthony — 70.8%, not 70.83%
    expect(incentiveFor('manager', score(1, 1, 0.6, 0)).final).toBe(1300);   // Jason
  });

  it("reduces the GM by 5% per failed section across the reports", () => {
    const gm = score(1, 1, 2 / 3, 1); // 91.67% raw, shown as 91.7% -> base $3,668 of $4,000
    // Anthony and Jason each failed Compliance; Jordan failed nothing.
    const twoFailed = incentiveFor('gm', gm, [
      report([2, 0], [2, 0], [2, 1], [2, 1]),  // Jordan — no majority failure
      report([2, 0], [2, 0], [2, 1], [3, 2]),  // Anthony — Compliance fails
      report([2, 0], [2, 0], [5, 2], [3, 3]),  // Jason — Compliance fails
    ]);
    expect(twoFailed.failedSectionCount).toBe(2);
    expect(twoFailed.deductionRate).toBeCloseTo(0.10);
    expect(twoFailed.base).toBe(3668);   // matches the review pack exactly
    expect(twoFailed.final).toBe(3301);  // 10% off, as the pack shows
  });

  it("three reports each failing one section costs the leader 15%", () => {
    const r = report([2, 0], [2, 0], [2, 0], [3, 2]); // one failed section
    const out = incentiveFor('gm', score(1, 1, 1, 1), [r, r, r]);
    expect(out.failedSectionCount).toBe(3);
    expect(out.deductionRate).toBeCloseTo(0.15);
    expect(out.final).toBe(3400); // 4,000 less 15%
  });

  it('caps the deduction at 25% however many sections fail', () => {
    const r = report([2, 2], [2, 2], [2, 2], [2, 2]); // all four fail
    const out = incentiveFor('gm', score(1, 1, 1, 1), [r, r, r]);
    expect(out.failedSectionCount).toBe(12);
    expect(out.deductionRate).toBe(DEDUCTION_CAP);
    expect(out.final).toBe(3000);
  });
});
