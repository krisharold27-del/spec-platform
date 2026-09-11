import { describe, it, expect } from 'vitest';
import { calculate, money, LEAKS, IMPROVEMENT_ANCHOR, DEFAULTS, type CalculatorInput } from '../src/lib/calculator';

const input = (over: Partial<CalculatorInput> = {}): CalculatorInput => ({
  ...DEFAULTS, seatCostAnnual: 312, ...over,
});

describe('calculate', () => {
  it('takes labour as a share of revenue', () => {
    expect(calculate(input({ revenue: 10_000_000, labourShare: 30 })).labourCost).toBe(3_000_000);
  });

  // The claim is about the labour component, not revenue. Both are shown, and the revenue one is
  // always the smaller number — quoting only that would be softer, and quoting only the other
  // would be overclaiming.
  it('reports the gap against labour and against revenue, and they differ', () => {
    const r = calculate(input({ revenue: 10_000_000, labourShare: 30, improvement: 30 }));
    expect(r.gapPctOfLabour).toBeCloseTo(30, 5);
    expect(r.gapPctOfRevenue).toBeCloseTo(9, 5);
    expect(r.gapPctOfRevenue).toBeLessThan(r.gapPctOfLabour);
  });

  it('scales every share by the improvement the reader chose', () => {
    const full = calculate(input({ improvement: IMPROVEMENT_ANCHOR }));
    const third = calculate(input({ improvement: IMPROVEMENT_ANCHOR / 3 }));
    expect(third.gap).toBeCloseTo(full.gap / 3, 5);
    expect(third.recoverable).toBeCloseTo(full.recoverable / 3, 5);
  });

  it('sums to the shares it publishes', () => {
    const r = calculate(input({ revenue: 10_000_000, labourShare: 30, improvement: IMPROVEMENT_ANCHOR }));
    const shareTotal = LEAKS.reduce((t, l) => t + l.share, 0);
    expect(r.gapPctOfLabour).toBeCloseTo(shareTotal, 5);
  });

  // Switching a line off has to remove it from the headline, not grey it out.
  it('drops a switched-off line from every figure', () => {
    const all = calculate(input());
    const without = calculate(input({ off: ['rework'] }));
    const rework = all.lines.find(l => l.id === 'rework')!;
    expect(without.gap).toBeCloseTo(all.gap - rework.amount, 5);
    expect(without.lines.find(l => l.id === 'rework')!.amount).toBe(0);
    expect(without.lines.find(l => l.id === 'rework')!.on).toBe(false);
  });

  it('goes to zero when every line is off', () => {
    const r = calculate(input({ off: LEAKS.map(l => l.id) }));
    expect(r.gap).toBe(0);
    expect(r.recoverable).toBe(0);
    expect(r.multiple).toBeNull();
  });

  it('recovers only the share each line says is recoverable', () => {
    const r = calculate(input());
    expect(r.recoverable).toBeLessThan(r.gap);
    for (const l of r.lines) expect(l.recoverable).toBeCloseTo(l.amount * l.recover, 5);
  });

  it('divides the gap across real people', () => {
    const r = calculate(input({ headcount: 40 }));
    expect(r.perPerson).toBeCloseTo(r.gap / 40, 5);
  });

  it('prices the seats against the headcount', () => {
    expect(calculate(input({ headcount: 40, seatCostAnnual: 312 })).seatCost).toBe(12_480);
  });

  // A multiple with nothing on one side of it is not a comparison.
  it('gives no multiple when there is nothing to compare', () => {
    expect(calculate(input({ seatCostAnnual: 0 })).multiple).toBeNull();
    expect(calculate(input({ revenue: 0 })).multiple).toBeNull();
  });

  it('never produces a negative or a divide-by-zero from silly inputs', () => {
    const r = calculate(input({ revenue: -5, headcount: 0, labourShare: -10, improvement: -3 }));
    expect(r.labourCost).toBe(0);
    expect(r.gap).toBe(0);
    expect(r.perPerson).toBe(0);
    expect(Number.isFinite(r.gapPctOfLabour)).toBe(true);
    expect(Number.isFinite(r.gapPctOfRevenue)).toBe(true);
  });

  it('clamps a labour share above 100%', () => {
    expect(calculate(input({ revenue: 1_000_000, labourShare: 250 })).labourCost).toBe(1_000_000);
  });
});

describe('the leak lines themselves', () => {
  // A line that names a problem without naming what SPEC does about it is just bad news.
  it('gives every leak a cause and a fix', () => {
    for (const l of LEAKS) {
      expect(l.where.length).toBeGreaterThan(20);
      expect(l.how.length).toBeGreaterThan(20);
    }
  });

  it('keeps every share and recovery rate inside a defensible range', () => {
    for (const l of LEAKS) {
      expect(l.share).toBeGreaterThan(0);
      expect(l.share).toBeLessThanOrEqual(10);
      expect(l.recover).toBeGreaterThan(0);
      expect(l.recover).toBeLessThanOrEqual(0.8);
    }
  });

  it('claims no more than 30% of the labour bill in total', () => {
    expect(LEAKS.reduce((t, l) => t + l.share, 0)).toBeLessThanOrEqual(IMPROVEMENT_ANCHOR);
  });

  it('has a unique id per line', () => {
    expect(new Set(LEAKS.map(l => l.id)).size).toBe(LEAKS.length);
  });
});

describe('money', () => {
  it('rounds to whole dollars and groups them', () => {
    expect(money(1234567.89)).toBe('$1,234,568');
    expect(money(0)).toBe('$0');
  });

  it('takes the currency it is given', () => {
    expect(money(1000, '£')).toBe('£1,000');
  });
});
