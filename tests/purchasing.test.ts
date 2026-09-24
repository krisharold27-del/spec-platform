import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  match, isLate, byAttention, purchasingStats, purchasingLine, nextOrderRef,
  orderStateLabel, isOrderState, ORDER_STATES, TOLERANCE_CENTS, TOLERANCE_PCT,
  type OrderRow,
} from '../src/lib/purchasing';

/*
  ── Buying materials, and checking the bill ──────────────────────────────────────────────────────

  One of the three the Coverage map admitted was not written at all: the Stock & buying tab carried
  a heading called Purchase orders with nothing behind it.

  What a trade business loses money on is not raising the order. It is the bill that turns up three
  weeks later for more than the order said, gets paid because nobody had the order in front of them,
  and takes the margin off a job quoted at the old price. So `match` is the capability; the rest of
  the table exists to make that comparison possible.
*/

const order = (over: Partial<OrderRow> = {}): OrderRow => ({
  id: 'o1', ref: 'PO-0001', supplier: 'Middys', state: 'sent',
  totalCents: 100_000, billTotalCents: null, expectedAt: null, ...over,
});

describe('the bill against the order', () => {
  it('says nothing until there is a bill', () => {
    const m = match(100_000, null);
    expect(m.state).toBe('no_bill');
    expect(m.holds).toBe(false);
  });

  it('matches when it is the same', () => {
    expect(match(100_000, 100_000).state).toBe('ok');
    expect(match(100_000, 100_000).holds).toBe(false);
  });

  /*
    Not zero tolerance. Freight, a rounded pack size and a part-delivery all move a total by small
    amounts, and a system that stops on every one is a system whose warnings get clicked through.
  */
  it('ALLOWS THE SMALL DIFFERENCES that are not worth stopping for', () => {
    expect(match(100_000, 100_900).state, 'under 1%').toBe('ok');
    expect(match(100_000, 99_200).state).toBe('ok');
  });

  /*
    ...and the floor matters as much as the percentage: 1% of a sixty-dollar order is sixty cents,
    and nobody should be held up over that.
  */
  it('AND HAS A FLOOR, so a small order is not held over loose change', () => {
    expect(TOLERANCE_CENTS).toBe(500);
    expect(TOLERANCE_PCT).toBe(0.01);
    expect(match(6_000, 6_400).state, '$4 on a $60 order').toBe('ok');
    expect(match(6_000, 6_600).state, '$6 is past the floor').toBe('over');
  });

  /*
    ── The asymmetry, which is the whole point ──────────────────────────────────────────────────

    A bill HIGHER than the order costs money, so it holds payment. A bill LOWER is reported and
    holds nothing — it is usually a part-delivery with the rest to follow, and stopping a smaller
    payment helps nobody. A check that treats both directions the same either lets overcharges
    through or stops every part-delivery.
  */
  it('HOLDS A BILL THAT CAME IN OVER, and says by how much', () => {
    const m = match(100_000, 112_000);
    expect(m.state).toBe('over');
    expect(m.holds).toBe(true);
    expect(m.differenceCents).toBe(12_000);
    expect(m.says).toContain('$120.00');
    expect(m.says, 'and why it matters').toContain('margin');
  });

  it('DOES NOT HOLD A BILL THAT CAME IN UNDER, but does report it', () => {
    const m = match(100_000, 60_000);
    expect(m.state).toBe('under');
    expect(m.holds, 'a part-delivery is not a reason to stop paying').toBe(false);
    expect(m.says).toContain('$400.00');
  });

  /* A new bill is a new question — the action clears any acceptance that was recorded before. */
  it('and recording a new bill clears an acceptance made against the old one', () => {
    const actions = readFileSync('src/app/jobs/actions.ts', 'utf8');
    const fn = actions.slice(actions.indexOf('export async function recordBill'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toContain('matchedAt: null');
  });

  /*
    A held bill released with no reason is the same as never having held it — and in six months the
    question will be why this job's margin was short.
  */
  it('REFUSES TO RELEASE A HELD BILL WITH NO REASON GIVEN', () => {
    const actions = readFileSync('src/app/jobs/actions.ts', 'utf8');
    const fn = actions.slice(actions.indexOf('export async function acceptBill'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toContain('verdict.holds && !note');
    expect(body).toContain('back(');
  });
});

describe('what is waiting on somebody', () => {
  it('counts what is open, late and held', () => {
    const rows = [
      order({ id: 'a', ref: 'PO-0001', state: 'sent', expectedAt: '2026-09-01' }),
      order({ id: 'b', ref: 'PO-0002', state: 'billed', billTotalCents: 130_000 }),
      order({ id: 'c', ref: 'PO-0003', state: 'closed', billTotalCents: 100_000 }),
    ];
    const s = purchasingStats(rows, '2026-09-24');
    expect(s.open).toBe(2);
    expect(s.late).toBe(1);
    expect(s.held).toBe(1);
    expect(s.heldCents).toBe(30_000);
  });

  it('only calls something late while it is still coming', () => {
    expect(isLate({ state: 'sent', expectedAt: '2026-09-01' }, '2026-09-24')).toBe(true);
    expect(isLate({ state: 'received', expectedAt: '2026-09-01' }, '2026-09-24'), 'it arrived').toBe(false);
    expect(isLate({ state: 'sent', expectedAt: null }, '2026-09-24')).toBe(false);
  });

  /*
    A held bill is money about to leave wrongly. A late delivery is a crew standing around on
    Tuesday. Both beat an order that is merely open.
  */
  it('PUTS HELD BILLS ABOVE LATE DELIVERIES, and both above the rest', () => {
    const rows = [
      order({ id: 'plain', ref: 'PO-0003' }),
      order({ id: 'late', ref: 'PO-0002', expectedAt: '2026-09-01' }),
      order({ id: 'held', ref: 'PO-0001', billTotalCents: 200_000 }),
    ];
    expect(byAttention(rows, '2026-09-24').map(r => r.id)).toEqual(['held', 'late', 'plain']);
  });

  it('NEVER READS AS FINE while money is being held', () => {
    const held = purchasingStats([order({ billTotalCents: 150_000 })], '2026-09-24');
    expect(purchasingLine(held)).toContain('held');
    expect(purchasingLine(held)).toContain('$500.00');
    expect(purchasingLine(purchasingStats([], '2026-09-24'))).toBe('No orders open.');
  });
});

describe('the order itself', () => {
  it('numbers them in sequence, and never reuses one', () => {
    expect(nextOrderRef([])).toBe('PO-0001');
    expect(nextOrderRef(['PO-0001', 'PO-0002'])).toBe('PO-0003');
    // A gap does not get filled — a reused reference is two orders with one number.
    expect(nextOrderRef(['PO-0001', 'PO-0009'])).toBe('PO-0010');
    expect(nextOrderRef(['nonsense'])).toBe('PO-0001');
  });

  it('has the five states a real order goes through', () => {
    expect(ORDER_STATES.map(s => s.key))
      .toEqual(['draft', 'sent', 'received', 'billed', 'closed']);
    expect(orderStateLabel('billed')).toBe('Bill received');
    expect(isOrderState('sent')).toBe(true);
    expect(isOrderState('posted')).toBe(false);
  });

  /* It needs an amount, or there is nothing for the bill to be checked against. */
  it('REFUSES AN ORDER WITH NO AMOUNT, because that is what makes the check possible', () => {
    const actions = readFileSync('src/app/jobs/actions.ts', 'utf8');
    const fn = actions.slice(actions.indexOf('export async function raiseOrder'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toContain('total <= 0');
    expect(body).toContain('checked against');
  });

  it('is scoped to this business, and so is any job it is put against', () => {
    const actions = readFileSync('src/app/jobs/actions.ts', 'utf8');
    for (const fn of ['raiseOrder', 'recordBill', 'acceptBill', 'orderArrived']) {
      const body = actions.slice(actions.indexOf(`export async function ${fn}`));
      expect(body.slice(0, body.indexOf('\n}')), fn).toMatch(/tenantId|ownJob/);
    }
  });

  it('carries the tenant policy in the real policy file', () => {
    expect(readFileSync('drizzle/0001_rls.sql', 'utf8')).toContain("'purchase_orders'");
  });
});
