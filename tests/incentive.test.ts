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

/**
 * The worked example from the 8 September build brief. The order of operations is the whole
 * point: the leader's own score reduces the maximum first, and staff failures then come off that
 * already-reduced figure — never off the original maximum. Taking 10% off $4,000 instead of off
 * $3,000 overpays by $100 and quietly breaks the accountability mechanic.
 */
describe('brief worked example', () => {
  it('deducts from the adjusted figure, not the maximum', () => {
    const score = { overall: 0.75, pillars: { safety: 0.75, people: 0.75, earnings: 0.75, compliance: 0.75 } } as never;
    const failing = { safety: { scored: 2, notMet: 2 }, people: { scored: 2, notMet: 0 }, earnings: { scored: 2, notMet: 0 }, compliance: { scored: 2, notMet: 0 } };
    const r = incentiveFor('gm', score, [failing, failing]);
    expect(r.base).toBe(3000);              // 75% of $4,000
    expect(r.failedSectionCount).toBe(2);   // one section failed per report
    expect(r.deductionRate).toBeCloseTo(0.10);
    expect(r.final).toBe(2700);             // 10% off $3,000 — not off $4,000
  });

  it('caps the leadership deduction at 25%', () => {
    const score = { overall: 1, pillars: { safety: 1, people: 1, earnings: 1, compliance: 1 } } as never;
    const allFail = { safety: { scored: 1, notMet: 1 }, people: { scored: 1, notMet: 1 }, earnings: { scored: 1, notMet: 1 }, compliance: { scored: 1, notMet: 1 } };
    const r = incentiveFor('gm', score, [allFail, allFail, allFail]);
    expect(r.failedSectionCount).toBe(12);  // 3 reports x 4 quadrants
    expect(r.deductionRate).toBe(0.25);     // capped, not 60%
    expect(r.final).toBe(3000);
  });
});
