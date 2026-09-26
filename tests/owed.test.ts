import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLAIMS, claimByKey, stateOf, foundLine, readOwed,
  REMIND_AT, OWNER_RINGS_AT, BAD_DEBT_NEAR, debtWatch, needsChasing, debtorsLine,
  ACCOUNTANT_CLAIMS_IT, WHY_NO_FIGURE,
  type Found, type Debt,
} from '../src/lib/owed';

const src = readFileSync(join(process.cwd(), 'src/lib/owed.ts'), 'utf8');

const found = (over: Partial<Found> = {}): Found => ({
  kind: CLAIMS[0],
  basis: 'Diesel in 9 utes and 2 generators, Jul to Sep.',
  amountCents: null,
  rateSource: null,
  sentAt: null,
  sentTo: null,
  ...over,
});

describe('SPEC finds the basis; the accountant claims it', () => {
  it('has the nine the design names', () => {
    expect(CLAIMS).toHaveLength(9);
    expect(claimByKey('fuel_tax')?.label).toBe('Fuel tax credits');
  });

  it('says per claim why it is the accountant’s', () => {
    /* One blanket disclaimer is a thing people stop reading; nine specific reasons are not. */
    for (const c of CLAIMS) {
      expect(c.theirs.length, c.key).toBeGreaterThan(25);
      expect(c.from.length, c.key).toBeGreaterThan(25);
    }
  });

  it('says the division of labour in words', () => {
    expect(ACCOUNTANT_CLAIMS_IT).toContain('stand behind it');
  });
});

describe('no rates live in this file', () => {
  /*
    A fuel tax credit rate SPEC made up, multiplied by a real litre count, produces a completely
    believable figure that is wrong — and it goes on a BAS.
  */
  it('has no percentage, cents-per-litre or threshold in the code', () => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const rates = [...code.matchAll(/\b\d+(?:\.\d+)?\s*(?:%|cents? per|c\/L|per litre)/gi)].map(m => m[0]);
    expect(rates, `a rate was written into the code: ${rates.join(', ')}`).toEqual([]);
  });

  it('refuses to put a figure on a claim it has no rate for', () => {
    const line = foundLine(found());
    expect(line).toContain('no figure here');
    expect(line).toContain('Diesel in 9 utes');
    expect(WHY_NO_FIGURE).toContain('BAS');
  });

  it('will only show a figure with a source beside it', () => {
    expect(stateOf(found({ amountCents: 318_000 }))).toBe('basis_only');
    expect(stateOf(found({ amountCents: 318_000, rateSource: 'ATO, checked 1 Jul 2026' }))).toBe('costed');
  });

  it('shows the figure when the business has set the rate', () => {
    const line = foundLine(found({ amountCents: 318_000, rateSource: 'ATO, 1 Jul 2026' }));
    expect(line).toContain('$3,180');
    expect(line).toContain('ATO, 1 Jul 2026');
  });
});

describe('the total never pretends to be the lot', () => {
  it('counts only what has been costed, and says how many were not', () => {
    const r = readOwed([
      found({ amountCents: 318_000, rateSource: 'ATO' }),
      found({ kind: CLAIMS[1] }),
      found({ kind: CLAIMS[2] }),
    ]);
    expect(r.costedCents).toBe(318_000);
    expect(r.costed).toBe(1);
    expect(r.basisOnly).toBe(2);
    expect(r.says).toContain('2 more SPEC has found and cannot put a figure on');
  });

  it('warns that the uncosted ones are not the small ones', () => {
    const r = readOwed([found({ amountCents: 1000, rateSource: 'x' }), found({ kind: CLAIMS[1] })]);
    expect(r.says).toContain('not smaller');
  });

  it('has no total at all when nothing is costed', () => {
    expect(readOwed([found(), found({ kind: CLAIMS[1] })]).costedCents).toBeNull();
  });

  it('says there is nothing rather than showing zero', () => {
    expect(readOwed([]).says).toContain('fills in');
  });

  it('counts what has gone to the accountant', () => {
    const r = readOwed([found({ sentAt: '2026-09-01', sentTo: 'Dale' })]);
    expect(r.sent).toBe(1);
    expect(foundLine(found({ sentAt: '2026-09-01', sentTo: 'Dale' }))).toContain('Dale');
  });
});

describe('debtors', () => {
  const debt = (over: Partial<Debt> = {}): Debt =>
    ({ id: 'd1', client: 'Bean There', ref: 'INV-1', cents: 15_620_00, days: 10, remindedAt: [], ...over });

  it('reminds at the design’s four points', () => {
    expect([...REMIND_AT]).toEqual([7, 14, 30, 45]);
  });

  it('sends the reminder that is DUE, not the first one missed', () => {
    /*
      The same rule as the quote chases. An invoice nobody touched for forty days should get the
      forty-day message — a gentle first nudge five weeks late tells the customer exactly how much
      attention they were getting.
    */
    expect(debtWatch(debt({ days: 40 })).remindDay).toBe(30);
    expect(debtWatch(debt({ days: 8 })).remindDay).toBe(7);
  });

  it('does not repeat one already sent', () => {
    expect(debtWatch(debt({ days: 8, remindedAt: [7] })).action).toBe('inside_terms');
    expect(debtWatch(debt({ days: 15, remindedAt: [7] })).remindDay).toBe(14);
  });

  it('stops reminding and asks the owner to ring', () => {
    const w = debtWatch(debt({ days: 50 }));
    expect(w.action).toBe('owner_rings');
    expect(w.says).toContain('call you have to make');
    expect(OWNER_RINGS_AT).toBe(45);
  });

  it('calls it what it is past ninety', () => {
    const w = debtWatch(debt({ days: BAD_DEBT_NEAR }));
    expect(w.action).toBe('bad_debt');
    expect(w.says).toContain('not a debtor any more');
  });

  it('leaves an invoice inside terms alone', () => {
    expect(debtWatch(debt({ days: 3 })).action).toBe('inside_terms');
    expect(needsChasing([debt({ days: 3 })])).toHaveLength(0);
  });

  it('puts the oldest first', () => {
    const list = [debt({ id: 'a', days: 10 }), debt({ id: 'b', days: 60 }), debt({ id: 'c', days: 35 })];
    expect(needsChasing(list).map(w => w.debt.id)).toEqual(['b', 'c', 'a']);
  });

  it('names the calls in the summary', () => {
    expect(debtorsLine([debt({ days: 50 })])).toContain('a call you have to make');
    expect(debtorsLine([])).toBe('Nothing overdue.');
  });
});
