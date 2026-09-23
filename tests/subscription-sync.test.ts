import { describe, it, expect } from 'vitest';
import { STRIPE_PRICES, lineItemsFor } from '../src/lib/pricing';
import { seatBill, reconcileSubscriptionItems, type SubscriptionItemUpdate } from '../src/lib/plan';

/**
 * "Stripe needs to auto sync as I could never keep up if there are 100's of companys." — Kris, 23
 * September, straight after the seat-kind override shipped and made it obvious how easily a chart
 * drifts from what it started as. A subscription's quantity used to be set once, at checkout, and
 * never touched again.
 *
 * `syncSubscriptionSeats` (lib/plan) is the part that actually calls Stripe, and it is not tested
 * here — it needs a live subscription to retrieve and update. What IS tested is the arithmetic
 * behind it: given what a subscription currently charges and what the chart says it should charge
 * now, exactly which lines does Stripe get told to add, change or remove. That is where a mistake
 * would bill somebody the wrong amount, so it is the part pulled out to be testable without a
 * Stripe client or a database.
 *
 * This shipped once before, briefly, as the mechanism behind the Basic/Advanced seat-tier choice
 * (22 September) and was retired with that tier the same day — the diffing was right; only the
 * "two prices for the same seat" it was pushing was premature. See DECISIONS.md, 22 and 23
 * September.
 */

describe('reconcileSubscriptionItems — pushing a chart change onto a LIVE subscription', () => {
  it('does nothing when the subscription already matches', () => {
    const existing = [{ id: 'si_leader', price: STRIPE_PRICES.leader, quantity: 6 }];
    const target = [{ price: STRIPE_PRICES.leader, quantity: 6 }];
    expect(reconcileSubscriptionItems(existing, target)).toEqual([]);
  });

  it('updates quantity in place rather than replacing the line', () => {
    // JBI growing from six leadership seats to nine — the case Kris asked for this to handle.
    const existing = [{ id: 'si_leader', price: STRIPE_PRICES.leader, quantity: 6 }];
    const target = [{ price: STRIPE_PRICES.leader, quantity: 9 }];
    expect(reconcileSubscriptionItems(existing, target)).toEqual([{ id: 'si_leader', quantity: 9 }]);
  });

  it('adds a line the subscription does not have yet', () => {
    // A business's first team member, on a subscription that so far only ever had leaders.
    const existing = [{ id: 'si_leader', price: STRIPE_PRICES.leader, quantity: 1 }];
    const target = [
      { price: STRIPE_PRICES.leader, quantity: 1 },
      { price: STRIPE_PRICES.team, quantity: 3 },
    ];
    const items = reconcileSubscriptionItems(existing, target);
    expect(items).toEqual([{ price: STRIPE_PRICES.team, quantity: 3 }]);
  });

  it('removes a seat kind the business no longer has any of', () => {
    // Every team member promoted, or the last one moved off the chart entirely.
    const existing = [
      { id: 'si_leader', price: STRIPE_PRICES.leader, quantity: 2 },
      { id: 'si_team', price: STRIPE_PRICES.team, quantity: 3 },
    ];
    const target = [{ price: STRIPE_PRICES.leader, quantity: 5 }];
    const items = reconcileSubscriptionItems(existing, target);
    expect(items).toContainEqual({ id: 'si_leader', quantity: 5 });
    expect(items).toContainEqual({ id: 'si_team', deleted: true });
    expect(items).toHaveLength(2);
  });

  /*
    Janine's exact case — a seat kind change is Kris overriding `seatKindOverride` by hand, and the
    subscription has to swap which line she is counted on, not just change a number on one line.
  */
  it('moves a seat from one kind to the other — one line grows, the other shrinks', () => {
    const existing = [
      { id: 'si_leader', price: STRIPE_PRICES.leader, quantity: 6 },
      { id: 'si_team', price: STRIPE_PRICES.team, quantity: 10 },
    ];
    // Janine moved off the leadership rate and onto team: six leaders becomes five, ten team
    // members becomes eleven.
    const target = [
      { price: STRIPE_PRICES.leader, quantity: 5 },
      { price: STRIPE_PRICES.team, quantity: 11 },
    ];
    const items = reconcileSubscriptionItems(existing, target);
    expect(items).toEqual(
      expect.arrayContaining<SubscriptionItemUpdate>([
        { id: 'si_leader', quantity: 5 },
        { id: 'si_team', quantity: 11 },
      ]),
    );
    expect(items).toHaveLength(2);
  });

  it('adds the training line separately, never folded into the plain leadership one', () => {
    const existing = [{ id: 'si_leader', price: STRIPE_PRICES.leader, quantity: 6 }];
    // Two of the six leaders go on the training upgrade — plain leadership drops to four.
    const target = lineItemsFor(seatBill(40, 6, 'aud', 2));
    const items = reconcileSubscriptionItems(existing, target);
    expect(items).toContainEqual({ id: 'si_leader', quantity: 4 });
    expect(items).toContainEqual({ price: STRIPE_PRICES.leaderTraining, quantity: 2 });
    expect(items).toContainEqual({ price: STRIPE_PRICES.team, quantity: 33 });
  });

  it('matches by price id, never by array position — an unrelated line is left alone', () => {
    // The subscription happens to carry team before leadership; the diff must not get confused by
    // the order and touch the wrong one.
    const existing = [
      { id: 'si_team', price: STRIPE_PRICES.team, quantity: 4 },
      { id: 'si_leader', price: STRIPE_PRICES.leader, quantity: 2 },
    ];
    const target = [
      { price: STRIPE_PRICES.leader, quantity: 2 },
      { price: STRIPE_PRICES.team, quantity: 4 },
    ];
    expect(reconcileSubscriptionItems(existing, target)).toEqual([]);
  });
});
