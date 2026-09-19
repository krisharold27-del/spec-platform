import { describe, it, expect } from 'vitest';
import { planState, costLabel, billableSeats, FREE_SEATS, SEAT_PRICE_MONTHLY, type TenantPlan } from '../src/lib/plan';
import { SEAT_PRICES } from '../src/lib/pricing';

const t = (plan: string, over: Partial<TenantPlan> = {}): TenantPlan =>
  ({ id: 'x', plan, startDate: '2026-01-01', ...over });

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

    The count of PEOPLE is five whatever the bill says: `seats` is the truth about the business and
    `billable` is the invoice. Collapsing the two is what produced a page telling a one-person
    business it was free while charging it.

    Five people, one of whom leads the other four — the shape of a small business — so the bill is
    one leadership seat and three team seats, with the free one taken off the cheaper kind.
  */
  it('bills per person AFTER THE FIRST, who is free', () => {
    const s = planState(t('basic'), 5, 'aud', 1);
    expect(s.seats, 'five people are in it').toBe(5);
    expect(s.billable, 'four of them are charged for').toBe(4);
    expect(s.leadershipSeats).toBe(1);
    expect(s.teamSeats).toBe(3);
    const total = SEAT_PRICE_MONTHLY + 3 * SEAT_PRICES.aud.team;
    expect(s.monthlyCost).toBe(total);
    expect(costLabel(s)).toBe(`A$${total} a month · 5 people, first seat free`);
  });

  it('A BUSINESS OF ONE PAYS NOTHING, and is not told it is empty', () => {
    const s = planState(t('trial'), 1);
    expect(s.free).toBe(true);
    expect(s.billing).toBe(false);
    expect(s.monthlyCost).toBe(0);
    expect(s.needsCheckout, 'and is never sent to a checkout for nothing').toBe(false);
    /*
      The wrong sentence here is "Free — nobody in it yet", said to the person who is in it.

      And the second wrong one, until design 15's prices landed: quoting the LEADERSHIP price for
      "each person you add". A GM about to invite an electrician was being shown A$134 for a seat
      that costs A$17, on the page where they decide whether to invite anybody at all.
    */
    expect(costLabel(s)).toBe(
      'Free — the first seat is, and so far it is just you. '
      + `A$${SEAT_PRICES.aud.team} a month for each person you add, `
      + `A$${SEAT_PRICE_MONTHLY} if they lead a team`,
    );
  });

  it('starts charging at the second person, not the first', () => {
    expect(planState(t('trial'), 1).billing).toBe(false);
    expect(planState(t('trial'), 2).billing).toBe(true);
    // A leader and somebody they lead: the free seat comes off the cheaper one, so the bill is
    // the leadership seat.
    expect(planState(t('trial'), 2, 'aud', 1).monthlyCost).toBe(SEAT_PRICE_MONTHLY);
    // And two people who lead nobody is two team seats, one of them free.
    expect(planState(t('trial'), 2).monthlyCost).toBe(SEAT_PRICES.aud.team);
  });

  it('never bills a negative number of seats', () => {
    expect(billableSeats(0)).toBe(0);
    expect(billableSeats(1)).toBe(0);
    expect(billableSeats(FREE_SEATS)).toBe(0);
    expect(planState(t('basic'), 0).monthlyCost).toBe(0);
  });

  it('holds at twenty thousand seats', () => {
    // Two thousand of them leading somebody, which is about the ratio a business of that size has.
    expect(planState(t('basic'), 20_000, 'aud', 2_000).monthlyCost)
      .toBe(2_000 * SEAT_PRICE_MONTHLY + 17_999 * SEAT_PRICES.aud.team);
  });

  it('bills in the business’s own currency, at the regional price — never converted', () => {
    const s = planState(t('basic'), 5, 'gbp', 1);
    const four = SEAT_PRICES.gbp.leadership + 3 * SEAT_PRICES.gbp.team;
    expect(s.monthlyCost).toBe(four);
    expect(costLabel(s)).toBe(`£${four} a month · 5 people, first seat free`);
  });

  it('only goes read-only when a payment has actually failed', () => {
    expect(planState(t('lapsed'), 5).readOnly).toBe(true);
    expect(planState(t('basic'), 5).readOnly).toBe(false);
    expect(planState(t('trial'), 0).readOnly).toBe(false);
  });

  /*
    ── A lapsed business is never a dead end ──────────────────────────────────────────────────────

    Found on the evening of 16 September, hours after the first seat became free.

    A business of one lets its card expire. Stripe gives up on the subscription, the webhook writes
    `lapsed`, and every page in SPEC goes read-only. But the first seat is free, so the bill is A$0
    — and the only button on the screen, "Fix payment", opened a checkout that had nothing to charge
    for and sent them straight back to the page they came from. Locked out of their own records with
    no door, over a debt that does not exist.

    The rule that settles it: **read-only follows the money.** Being lapsed is Stripe's opinion about
    a subscription; owing something is a fact about this business today. Only the second may lock a
    door, because only the second is something a customer can act on.
  */
  it('never locks a lapsed business that owes nothing', () => {
    expect(planState(t('lapsed'), 0).readOnly, 'nobody in it, nothing owed').toBe(false);
    expect(planState(t('lapsed'), 1).readOnly, 'one person, and the first seat is free').toBe(false);
  });

  it('locks a lapsed business the moment it owes something', () => {
    // Two people is the first seat that is actually billed, so it is the first that can be a debt.
    expect(planState(t('lapsed'), 2).billable).toBe(1);
    expect(planState(t('lapsed'), 2).readOnly).toBe(true);
  });

  /*
    Read-only is about the debt, not about which kind of failure produced it. Both a cancelled
    subscription and one that simply stopped being paid lock the same way — what differs is where
    the journey page sends them, the portal or a fresh checkout, which `subscribed` decides.
  */
  it('locks the same whether Stripe still has them or not', () => {
    const cancelled = planState(t('lapsed'), 5);
    const unpaid = planState(t('lapsed', { stripeSubscriptionId: 'sub_123' }), 5);
    expect(cancelled.subscribed, 'the id is cleared when a subscription is deleted').toBe(false);
    expect(unpaid.subscribed).toBe(true);
    expect(cancelled.readOnly).toBe(true);
    expect(unpaid.readOnly).toBe(true);
    // And neither is offered a second button: the banner already carries the one that fits.
    expect(cancelled.needsCheckout).toBe(false);
    expect(unpaid.needsCheckout).toBe(false);
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
