import { describe, it, expect } from 'vitest';
import { STRIPE_PRICES, lineItemsFor } from '../src/lib/pricing';
import { planState, costLabel, reconcileSubscriptionItems, type TenantPlan } from '../src/lib/plan';

/**
 * "Do you want SPEC AI powered?" — Kris, 22 September: JBI must be able to answer this itself, and
 * so must every business after it (`tenants.seatTier`, the journey page's `setBusinessSeatTier`).
 * See DECISIONS.md, 22 September.
 */

const t = (over: Partial<TenantPlan> = {}): TenantPlan =>
  ({ id: 'x', plan: 'basic', startDate: '2026-01-01', ...over });

describe('a business chooses its own seat tier', () => {
  it('reads as basic when nobody has chosen anything', () => {
    expect(planState(t(), 5, 'aud', 1).seatTier).toBe('basic');
    expect(planState(t({ seatTier: null }), 5, 'aud', 1).seatTier).toBe('basic');
    expect(planState(t({ seatTier: 'nonsense' }), 5, 'aud', 1).seatTier).toBe('basic');
  });

  it('bills the Advanced rate once the business says so, nobody else', () => {
    const basic = planState(t(), 5, 'aud', 1);
    const advanced = planState(t({ seatTier: 'advanced' }), 5, 'aud', 1);
    expect(advanced.seatTier).toBe('advanced');
    expect(advanced.monthlyCost).toBeGreaterThan(basic.monthlyCost);
  });

  it('names the tier it is actually quoting in the free-business sentence', () => {
    const basic = costLabel(planState(t(), 1, 'aud', 1));
    const advanced = costLabel(planState(t({ seatTier: 'advanced' }), 1, 'aud', 1));
    expect(basic).toContain('A$134');
    expect(advanced).toContain('A$227');
  });
});

describe('lineItemsFor — the two lines a checkout and a live subscription must agree on', () => {
  it('picks the Basic price ids by default', () => {
    const lines = lineItemsFor({ leadership: 2, team: 5 }, false);
    expect(lines).toEqual([
      { price: STRIPE_PRICES.leader_basic, quantity: 2 },
      { price: STRIPE_PRICES.team_basic, quantity: 5 },
    ]);
  });

  it('picks the Advanced price ids when the business has chosen AI', () => {
    const lines = lineItemsFor({ leadership: 2, team: 5 }, true);
    expect(lines).toEqual([
      { price: STRIPE_PRICES.leader_advanced, quantity: 2 },
      { price: STRIPE_PRICES.team_advanced, quantity: 5 },
    ]);
  });

  it('never sends a line for a seat kind the business has none of', () => {
    expect(lineItemsFor({ leadership: 0, team: 5 }, false)).toEqual([{ price: STRIPE_PRICES.team_basic, quantity: 5 }]);
    expect(lineItemsFor({ leadership: 2, team: 0 }, false)).toEqual([{ price: STRIPE_PRICES.leader_basic, quantity: 2 }]);
    expect(lineItemsFor({ leadership: 0, team: 0 }, false)).toEqual([]);
  });
});

describe('reconcileSubscriptionItems — pushing a tier change onto a LIVE subscription', () => {
  it('does nothing when the subscription already matches', () => {
    const existing = [{ id: 'si_1', price: STRIPE_PRICES.leader_basic, quantity: 2 }];
    const target = [{ price: STRIPE_PRICES.leader_basic, quantity: 2 }];
    expect(reconcileSubscriptionItems(existing, target)).toEqual([]);
  });

  it('updates quantity in place rather than replacing the line', () => {
    const existing = [{ id: 'si_1', price: STRIPE_PRICES.leader_basic, quantity: 2 }];
    const target = [{ price: STRIPE_PRICES.leader_basic, quantity: 3 }];
    expect(reconcileSubscriptionItems(existing, target)).toEqual([{ id: 'si_1', quantity: 3 }]);
  });

  /*
    The case this whole file exists for: JBI switching Basic → Advanced. The Basic leadership line
    has to go, and an Advanced leadership line has to arrive — never both at once, which is what a
    naive "just add the new line" approach would leave behind.
  */
  it('swaps Basic for Advanced — deletes the old line, adds the new one', () => {
    const existing = [
      { id: 'si_leader', price: STRIPE_PRICES.leader_basic, quantity: 1 },
      { id: 'si_team', price: STRIPE_PRICES.team_basic, quantity: 4 },
    ];
    const target = lineItemsFor({ leadership: 1, team: 4 }, true);
    const items = reconcileSubscriptionItems(existing, target);
    expect(items).toContainEqual({ price: STRIPE_PRICES.leader_advanced, quantity: 1 });
    expect(items).toContainEqual({ price: STRIPE_PRICES.team_advanced, quantity: 4 });
    expect(items).toContainEqual({ id: 'si_leader', deleted: true });
    expect(items).toContainEqual({ id: 'si_team', deleted: true });
    expect(items).toHaveLength(4);
  });

  it('removes a seat kind the business no longer has any of', () => {
    const existing = [
      { id: 'si_leader', price: STRIPE_PRICES.leader_basic, quantity: 1 },
      { id: 'si_team', price: STRIPE_PRICES.team_basic, quantity: 3 },
    ];
    // Every team member left, or was promoted — nothing to bill at the team rate any more.
    const target = [{ price: STRIPE_PRICES.leader_basic, quantity: 1 }];
    expect(reconcileSubscriptionItems(existing, target)).toEqual([{ id: 'si_team', deleted: true }]);
  });
});
