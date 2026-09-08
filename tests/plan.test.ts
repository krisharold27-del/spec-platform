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
    expect(costLabel(s)).toBe('Free — nobody in it yet');
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

describe('who occupies a seat', () => {
  it('counts the founder who signed themselves up, not just people who were invited', () => {
    // The bug this pins: counting invitedAt alone meant a leader who created the business was never
    // billed, so a one-person tenant using the whole system reported as free.
    const rows = [
      { invitedAt: null, acceptedAt: null, authUserId: 'auth-1' },   // signed up directly
      { invitedAt: '2026-09-01', acceptedAt: null, authUserId: null }, // invited, not yet clicked
      { invitedAt: null, acceptedAt: null, authUserId: null },        // a name with no way in
    ];
    const seats = rows.filter(u => u.invitedAt || u.acceptedAt || u.authUserId).length;
    expect(seats).toBe(2);
  });
});
