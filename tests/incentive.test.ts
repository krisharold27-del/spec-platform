/** The incentive against docs/BUILD_SPEC.md §6 and the worked examples in The Rules. */
import { describe, it, expect } from 'vitest';
import { incentiveFor, failedPillarCount, salesAceByMonth, salesAceExposure, DEDUCTION_CAP } from '../src/lib/incentive';

describe('worked examples from The Rules', () => {
  it('Head of Operations, September: 83.3% of $2,000 = $1,666, two failed pillars beneath, $1,499 payable', () => {
    const r = incentiveFor({
      roles: [{ level: 'manager', rolePct: 5 / 6 }],
      chainPillars: [1, 0.4, 0.9, 1, /* crew */ 0.8, 0.8, 0.8, 0.3],
    });
    expect(r.earned).toBe(1666);
    expect(r.failedPillars).toBe(2);
    expect(r.deductionRate).toBeCloseTo(0.10, 10);
    expect(r.payable).toBe(1499);
  });

  it('Sales Manager holding Sales Ace: ceiling doubles to $4,000, 87.5% = $3,500, one failure, $3,325', () => {
    const r = incentiveFor({ roles: [{ level: 'manager', rolePct: 0.875 }], chainPillars: [0.45], salesAce: true });
    expect(r.ceiling).toBe(4000);
    expect(r.earned).toBe(3500);
    expect(r.payable).toBe(3325);
  });
});

describe('what counts as a failure (§6.2)', () => {
  /*
    At or below 50% — fifty exactly is a failure, not a bad month. Kris set it, and it is the same
    line the chart turns red on, so red on a card and money coming off mean the same thing.
    Previously `< 0.5`, which let a quadrant landing on exactly 50.0% escape.
  */
  it('a quadrant at or under 50% fails; above it is a bad month; no score is never a failure', () => {
    expect(failedPillarCount([0.49, 0.5, 0.6, null, 0])).toBe(3);  // 0.49, 0.5 and 0 fail
    expect(failedPillarCount([0.501, 0.6, 0.79])).toBe(0);
    expect(failedPillarCount([null, null])).toBe(0);
  });

  it('the deduction comes off the earned figure, not the ceiling', () => {
    const r = incentiveFor({ roles: [{ level: 'gm', rolePct: 0.75 }], chainPillars: [0.2, 0.2] });
    expect(r.earned).toBe(3000);   // 75% of $4,000
    expect(r.payable).toBe(2700);  // 10% off $3,000 — not off $4,000
  });

  it('caps at 25% however many pillars fail', () => {
    const r = incentiveFor({ roles: [{ level: 'gm', rolePct: 1 }], chainPillars: Array(12).fill(0) });
    expect(r.failedPillars).toBe(12);
    expect(r.deductionRate).toBe(DEDUCTION_CAP);
    expect(r.payable).toBe(3000);
  });

  it('a good team credits nothing — only a bad one reduces', () => {
    const r = incentiveFor({ roles: [{ level: 'supervisor', rolePct: 0.9 }], chainPillars: [1, 1, 1, 1] });
    expect(r.payable).toBe(900);
  });
});

describe('the ladder (§6.1)', () => {
  it('seven levels, halving, and the director outside the scheme', () => {
    const pay = (level: string) => incentiveFor({ roles: [{ level, rolePct: 1 }], chainPillars: [] }).payable;
    expect(['gm', 'manager', 'supervisor', 'specialist', 'technician', 'apprentice'].map(pay)).toEqual([4000, 2000, 1000, 750, 500, 250]);
    const director = incentiveFor({ roles: [{ level: 'director', rolePct: 1 }], chainPillars: [] });
    expect(director.inScheme).toBe(false);
    expect(director.payable).toBe(0);
  });

  it('a business may set its own ceilings', () => {
    expect(incentiveFor({ roles: [{ level: 'manager', rolePct: 1 }], chainPillars: [], ceilings: { manager: 3000 } }).payable).toBe(3000);
  });
});

describe('no score, first period, and a merge', () => {
  it('no score earns nothing — it is not a zero-percent month', () => {
    const r = incentiveFor({ roles: [{ level: 'manager', rolePct: null }], chainPillars: [] });
    expect(r.rolePct).toBeNull();
    expect(r.earned).toBe(0);
  });

  it('the first period runs without incentives until the leader switches them on', () => {
    expect(incentiveFor({ roles: [{ level: 'manager', rolePct: 1 }], chainPillars: [], incentivesOn: false }).payable).toBe(0);
  });

  it('a merge pays the higher ceiling once, on the mean of the two roles', () => {
    const r = incentiveFor({ roles: [{ level: 'manager', rolePct: 0.8 }, { level: 'supervisor', rolePct: 1 }], chainPillars: [] });
    expect(r.ceiling).toBe(2000);   // not 2,000 + 1,000
    expect(r.earned).toBe(1800);    // 90% of $2,000
  });

  it('the doubling can be switched off — the standing stays, the money does not', () => {
    const r = incentiveFor({ roles: [{ level: 'manager', rolePct: 1 }], chainPillars: [], salesAce: true, salesAceDoubling: false });
    expect(r.ceiling).toBe(2000);
  });
});

describe('Sales Ace (§6.4)', () => {
  const ok = { outcome: true, behaviours: true };
  const miss = { outcome: true, behaviours: false };

  it('earned by both halves three months running, from the third month — never backdated', () => {
    expect(salesAceByMonth([ok, ok, ok, ok])).toEqual([false, false, true, true]);
  });

  it('the outcome alone is not enough', () => {
    expect(salesAceByMonth([miss, miss, miss])).toEqual([false, false, false]);
  });

  it('survives one bad month; lost by two in a row, from the second', () => {
    expect(salesAceByMonth([ok, ok, ok, miss, ok])).toEqual([false, false, true, true, true]);
    expect(salesAceByMonth([ok, ok, ok, miss, miss, ok])).toEqual([false, false, true, true, false, false]);
  });

  it('earned back the same way — three more months', () => {
    expect(salesAceByMonth([ok, ok, ok, miss, miss, ok, ok, ok])).toEqual([false, false, true, true, false, false, false, true]);
  });

  it('shows the director the exposure before it is switched on: a manager and four specialists', () => {
    expect(salesAceExposure(['manager', 'specialist', 'specialist', 'specialist', 'specialist']))
      .toEqual({ plainMonthly: 5000, allHoldingMonthly: 10000 });
  });
});
