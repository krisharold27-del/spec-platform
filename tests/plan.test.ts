import { describe, it, expect } from 'vitest';
import { planState, costLabel, SEAT_PRICE_MONTHLY } from '../src/lib/plan';

const t = (plan: string) => ({ id: 'x', plan, startDate: '2026-01-01' });

describe('seat-based plan', () => {
  it('is free with structure but nobody invited, and never read-only', () => {
    const s = planState(t('trial'), 0);
    expect(s.free).toBe(true);
    expect(s.billing).toBe(false);
    expect(s.monthlyCost).toBe(0);
    expect(s.readOnly).toBe(false);   // no clock: building never expires
    expect(costLabel(s)).toBe('Free — no one invited yet');
  });

  it('bills $26 per invited person', () => {
    const s = planState(t('basic'), 5);
    expect(s.monthlyCost).toBe(5 * SEAT_PRICE_MONTHLY);
    expect(s.monthlyCost).toBe(130);   // the brief's worked example
    expect(costLabel(s)).toBe('$130 a month · 5 people');
  });

  it('only goes read-only when a payment has actually failed', () => {
    expect(planState(t('lapsed'), 5).readOnly).toBe(true);
    expect(planState(t('basic'), 5).readOnly).toBe(false);
    expect(planState(t('trial'), 0).readOnly).toBe(false);
  });

  it('does not bill a business on the consulting program', () => {
    const s = planState(t('program'), 40);
    expect(s.billing).toBe(false);
    expect(costLabel(s)).toBe('SPEC Program');
  });
});
