import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CHECKS, isCheckKind, checkLabel, stateOf, mayBook, expiringSoon, chaseText,
  checkClaim, queryText, subbieStats, subbieLine, HIDDEN_FROM_SUBBIES, WARN_DAYS,
  type Check,
} from '../src/lib/subbies';

/*
  ── Subcontractors ───────────────────────────────────────────────────────────────────────────────

  Kris, 24 September, correcting an earlier draft: *"subcontractors are people working for the
  business and are held to the full expectation on every job. Each subbie is a PAID TEAM SEAT, not
  free. Same SWMS, checklists and KPIs as employees; their scores count on their supervisor's team
  board."* They still see only their own jobs, never pricing.

  So a subbie is not a supplier with a folder of certificates. The only thing that differs from an
  employee is what they can SEE.
*/

const TODAY = '2026-09-24';

const all = (over: Partial<Record<string, string | null>> = {}): Check[] =>
  CHECKS.map(c => ({
    kind: c.key,
    state: 'current',
    expiresAt: (over[c.key] as string | null | undefined) ?? (c.expires ? '2027-06-30' : null),
  }));

describe('the six checks', () => {
  it('is six, and each one says why it matters', () => {
    expect(CHECKS).toHaveLength(6);
    for (const c of CHECKS) {
      expect(c.why.length, c.key).toBeGreaterThan(30);
    }
    expect(isCheckKind('liability')).toBe(true);
    expect(isCheckKind('vibes')).toBe(false);
    expect(checkLabel('abn')).toContain('ABN');
  });

  /*
    A certificate recorded as current in March is not current in October. What was typed does not
    outrank a date that has passed.
  */
  it('READS THE DATE, not what somebody typed', () => {
    expect(stateOf({ kind: 'liability', state: 'current', expiresAt: '2026-01-01' }, TODAY)).toBe('expired');
    expect(stateOf({ kind: 'liability', state: 'current', expiresAt: '2027-01-01' }, TODAY)).toBe('current');
    expect(stateOf({ kind: 'abn', state: 'current', expiresAt: null }, TODAY), 'never expires').toBe('current');
    expect(stateOf({ kind: 'liability', state: 'missing', expiresAt: null }, TODAY)).toBe('missing');
  });

  it('warns the same 30 days ahead that Clear to Work does', () => {
    expect(WARN_DAYS).toBe(30);
    expect(stateOf({ kind: 'licence', state: 'current', expiresAt: '2026-10-10' }, TODAY)).toBe('expiring');
  });
});

describe('who can be booked', () => {
  it('lets somebody with all six on', () => {
    expect(mayBook(all(), TODAY).ok).toBe(true);
  });

  /*
    ── All six, not five ────────────────────────────────────────────────────────────────────────

    A business that books an uninsured subbie onto a site is carrying that risk itself, and "five
    out of six" is exactly the reasoning that gets somebody onto a site uninsured.
  */
  it('REFUSES ON ANY ONE MISSING, however good the rest are', () => {
    for (const c of CHECKS) {
      const checks = all().filter(x => x.kind !== c.key);
      const v = mayBook(checks, TODAY);
      expect(v.ok, `missing ${c.key}`).toBe(false);
      expect(v.blocked, `missing ${c.key}`).toContain(c.label);
    }
  });

  it('and on one that has lapsed, not only one never recorded', () => {
    const v = mayBook(all({ liability: '2026-01-01' }), TODAY);
    expect(v.ok).toBe(false);
    expect(v.why).toContain('Public liability');
  });

  /* Expiring is a warning, not a stop — that is the whole point of warning ahead. */
  it('does not stop work for something that has not lapsed yet', () => {
    expect(mayBook(all({ licence: '2026-10-10' }), TODAY).ok).toBe(true);
    expect(expiringSoon(all({ licence: '2026-10-10' }), TODAY)).toHaveLength(1);
  });

  it('names what is missing, so the refusal can be acted on', () => {
    const v = mayBook([], TODAY);
    expect(v.blocked).toHaveLength(6);
    expect(v.why).toContain('Not clear to work');
  });
});

describe('the chase', () => {
  it('is drafted, never sent on its own', () => {
    const t = chaseText('JBI Electrical', 'Sam Rivers', 'liability', '2026-10-10');
    expect(t).toContain('Sam');
    expect(t).toContain('public liability');
    expect(t).toContain('2026-10-10');
    expect(t).toContain('JBI Electrical');
  });
});

describe('what a subbie may see', () => {
  /*
    Their own jobs — where, when, the SWMS — and nothing about what the business charges. Written
    down and tested because the risk is a later edit handing a whole job row to a template.
  */
  it('NEVER SEES WHAT THE BUSINESS CHARGES', () => {
    expect(HIDDEN_FROM_SUBBIES).toContain('valueCents');
    expect(HIDDEN_FROM_SUBBIES).toContain('margin');
    expect(HIDDEN_FROM_SUBBIES).toContain('chargeCents');
  });

  it('and the rule is written down where somebody will read it', () => {
    const src = readFileSync('src/lib/subbies.ts', 'utf8');
    expect(src).toContain('PAID TEAM SEAT');
    expect(src).toMatch(/never the business's prices|never pricing/i);
  });
});

describe('their invoice against the schedule', () => {
  /*
    Kris's own example: five days of scaffold hire claimed against four on the schedule. Nobody has
    the schedule in front of them three weeks later, so it gets paid.
  */
  it('HOLDS A CLAIM FOR MORE DAYS THAN THE SCHEDULE HAS', () => {
    const v = checkClaim({ what: 'Scaffold hire', claimedDays: 5, claimedCents: 250_000 }, { days: 4 });
    expect(v.holds).toBe(true);
    expect(v.says).toContain('5 days claimed, 4 on the schedule');
  });

  it('and passes one that matches', () => {
    expect(checkClaim({ what: 'Scaffold', claimedDays: 4, claimedCents: 0 }, { days: 4 }).holds).toBe(false);
    expect(checkClaim({ what: 'Scaffold', claimedDays: 3, claimedCents: 0 }, { days: 4 }).holds).toBe(false);
  });

  /*
    The schedule is wrong about as often as the invoice is, so the held message says so and the
    drafted query asks rather than accuses. A query that reads as an accusation is how a business
    loses a good subbie over an admin error.
  */
  it('SAYS THE SCHEDULE MIGHT BE THE WRONG ONE', () => {
    const v = checkClaim({ what: 'Scaffold', claimedDays: 5, claimedCents: 0 }, { days: 4 });
    expect(v.says).toContain('the schedule may be what is wrong');
  });

  it('and the drafted query asks rather than accuses', () => {
    const q = queryText('JBI', 'Sam Rivers', { what: 'scaffold hire', claimedDays: 5, claimedCents: 0 }, { days: 4 });
    expect(q).toContain('Can you let us know');
    expect(q).not.toMatch(/overcharg|wrong|dispute|incorrect/i);
  });
});

describe('the headline', () => {
  const checks = new Map<string, Check[]>();

  it('NEVER READS AS FINE while somebody on the schedule cannot legally be there', () => {
    checks.set('a', all().filter(c => c.kind !== 'liability'));
    const s = subbieStats([{ id: 'a', status: 'active' }], checks, TODAY);
    expect(s.blocked).toBe(1);
    expect(subbieLine(s)).toContain('cannot be booked');
  });

  it('then leads on what is about to lapse', () => {
    checks.set('b', all({ licence: '2026-10-10' }));
    const s = subbieStats([{ id: 'b', status: 'active' }], checks, TODAY);
    expect(subbieLine(s)).toContain('expire');
  });

  it('and says nothing rather than congratulating an empty register', () => {
    expect(subbieLine(subbieStats([], new Map(), TODAY))).toBe('No subcontractors yet.');
  });
});
