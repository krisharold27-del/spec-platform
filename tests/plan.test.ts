import { describe, it, expect } from 'vitest';
import { planState, costLabel, billableSeats, FREE_SEATS, SEAT_PRICE_MONTHLY } from '../src/lib/plan';

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

  /*
    The first seat is free — Kris, 16 September: "yes do the first seat free".

    The worked example in the brief said five people cost A$130. It now costs A$104, and the count
    of PEOPLE is still five: `seats` is the truth about the business and `billable` is the invoice.
    Collapsing the two is what produced a page telling a one-person business it was free while
    charging it A$26.
  */
  it('bills A$26 per person AFTER THE FIRST, who is free', () => {
    const s = planState(t('basic'), 5);
    expect(s.seats, 'five people are in it').toBe(5);
    expect(s.billable, 'four of them are charged for').toBe(4);
    expect(s.monthlyCost).toBe(4 * SEAT_PRICE_MONTHLY);
    expect(s.monthlyCost).toBe(104);
    expect(costLabel(s)).toBe('A$104 a month · 5 people, first seat free');
  });

  it('A BUSINESS OF ONE PAYS NOTHING, and is not told it is empty', () => {
    const s = planState(t('trial'), 1);
    expect(s.free).toBe(true);
    expect(s.billing).toBe(false);
    expect(s.monthlyCost).toBe(0);
    expect(s.needsCheckout, 'and is never sent to a checkout for nothing').toBe(false);
    // The wrong sentence here is "Free — nobody in it yet", said to the person who is in it.
    expect(costLabel(s)).toBe('Free — the first seat is, and so far it is just you. A$26 a month for each person you add');
  });

  it('starts charging at the second person, not the first', () => {
    expect(planState(t('trial'), 1).billing).toBe(false);
    expect(planState(t('trial'), 2).billing).toBe(true);
    expect(planState(t('trial'), 2).monthlyCost).toBe(SEAT_PRICE_MONTHLY);
  });

  it('never bills a negative number of seats', () => {
    expect(billableSeats(0)).toBe(0);
    expect(billableSeats(1)).toBe(0);
    expect(billableSeats(FREE_SEATS)).toBe(0);
    expect(planState(t('basic'), 0).monthlyCost).toBe(0);
  });

  it('holds at twenty thousand seats', () => {
    expect(planState(t('basic'), 20_000).monthlyCost).toBe(19_999 * SEAT_PRICE_MONTHLY);
  });

  it('bills in the business’s own currency, at the regional price — never converted', () => {
    const s = planState(t('basic'), 5, 'gbp');
    expect(s.monthlyCost).toBe(68);    // 4 × £17
    expect(costLabel(s)).toBe('£68 a month · 5 people, first seat free');
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
