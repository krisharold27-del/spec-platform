import { describe, it, expect } from 'vitest';
import {
  KINDS, kindByKey, labelFor, mayReadReason, balanceOf, check, approverFor,
  crewWarning, requestLine, OWNER_IS_TOLD,
  type Balance, type LeaveKind, type Request,
} from '../src/lib/leave';

const balances: Balance[] = [
  { kind: 'annual', hours: 76 },
  { kind: 'personal', hours: 15 },
];

describe('the kinds', () => {
  it('has all eight the design names', () => {
    expect(KINDS).toHaveLength(8);
    expect(KINDS.map(k => k.key)).toEqual(
      ['annual', 'personal', 'long_service', 'unpaid', 'til', 'rdo', 'compassionate', 'fdv']);
  });

  it('knows which draw down a balance', () => {
    expect(kindByKey('annual')?.accrues).toBe(true);
    expect(kindByKey('unpaid')?.accrues).toBe(false);
    expect(kindByKey('fdv')?.accrues).toBe(false);
  });
});

describe('family and domestic violence leave is never named to anybody else', () => {
  /*
    The most important test in this file. Somebody taking this leave is often hiding from a person
    who may know where they work, and a roster naming it has published that.
  */
  it('reads as "Leave" to everybody but the approver, payroll and the person', () => {
    expect(labelFor('fdv', 'anyone')).toBe('Leave');
    expect(labelFor('fdv', 'approver')).toContain('Family and domestic violence');
    expect(labelFor('fdv', 'payroll')).toContain('Family and domestic violence');
    expect(labelFor('fdv', 'self')).toContain('Family and domestic violence');
  });

  it('hides personal leave from a roster too, because it is medical', () => {
    expect(labelFor('personal', 'anyone')).toBe('Leave');
    expect(labelFor('personal', 'approver')).toContain("Personal");
  });

  it('does not hide what does not need hiding', () => {
    expect(labelFor('annual', 'anyone')).toBe('Annual leave');
    expect(labelFor('rdo', 'anyone')).toBe('RDO');
  });

  it('keeps the reason itself from anybody else', () => {
    expect(mayReadReason('fdv', 'anyone')).toBe(false);
    expect(mayReadReason('fdv', 'approver')).toBe(true);
    expect(mayReadReason('annual', 'anyone')).toBe(true);
  });

  it('fails safe on a kind it does not recognise', () => {
    /* An unknown kind could be anything, so it says the least it can say. */
    expect(labelFor('made_up' as LeaveKind, 'anyone')).toBe('Leave');
  });

  it('never leaks the kind through the request line', () => {
    const req: Request = {
      id: 'r1', who: 'Sam', kind: 'fdv', from: '2026-10-01', to: '2026-10-03',
      hours: 24, reason: 'private', state: 'approved', overrideBy: null,
    };
    const line = requestLine(req, check(req, balances), 'anyone');
    expect(line).not.toMatch(/violence|domestic|family/i);
    expect(line).toContain('Leave');
  });
});

describe('does it fit', () => {
  it('passes a request inside the balance', () => {
    const c = check({ kind: 'annual', hours: 38 }, balances);
    expect(c.verdict).toBe('within');
    expect(c.leaderAlone).toBe(true);
    expect(approverFor(c)).toBe('leader');
  });

  it('needs a manager when it is over', () => {
    const c = check({ kind: 'annual', hours: 100 }, balances);
    expect(c.verdict).toBe('over');
    expect(c.short).toBe(24);
    expect(approverFor(c)).toBe('manager');
    expect(c.says).toContain('owner is told');
  });

  it('does not treat untracked leave as over', () => {
    /*
      The failure this guards: giving FDV leave a balance of zero and then refusing every request
      as "over". It does not come out of a balance at all.
    */
    for (const kind of ['unpaid', 'compassionate', 'fdv'] as LeaveKind[]) {
      const c = check({ kind, hours: 40 }, balances);
      expect(c.verdict, kind).toBe('not_tracked');
      expect(c.leaderAlone, kind).toBe(true);
    }
  });

  it('treats exactly the balance as within it', () => {
    expect(check({ kind: 'annual', hours: 76 }, balances).verdict).toBe('within');
  });

  it('reads a missing balance as nothing, not as an error', () => {
    expect(balanceOf(balances, 'long_service')).toBe(0);
    expect(check({ kind: 'long_service', hours: 8 }, balances).verdict).toBe('over');
  });

  it('says why the owner hears about it', () => {
    expect(OWNER_IS_TOLD).toContain('before it is earned');
  });
});

describe('the crew warning warns and never blocks', () => {
  const week = [
    { day: 'Mon', booked: 3, available: 4 },
    { day: 'Tue', booked: 4, available: 4 },
    { day: 'Wed', booked: 2, available: 4 },
  ];

  it('names the day that would be short', () => {
    const w = crewWarning(week, 24);
    expect(w.days.map(d => d.day)).toEqual(['Tue']);
    expect(w.says).toContain('Tue');
    expect(w.says).toContain('person short');
  });

  it('says nothing when nothing would be short', () => {
    expect(crewWarning([{ day: 'Mon', booked: 1, available: 4 }], 8).says).toBeNull();
  });

  it('says nothing for no time off', () => {
    expect(crewWarning(week, 0).says).toBeNull();
  });

  it('counts more than one day without listing all of them', () => {
    const w = crewWarning([...week, { day: 'Thu', booked: 4, available: 4 }], 40);
    expect(w.days).toHaveLength(2);
    expect(w.says).toContain('2 days would be short');
  });
});

describe('an approved request says how it got approved', () => {
  const base: Request = {
    id: 'r1', who: 'Hemi', kind: 'annual', from: '2026-10-01', to: '2026-10-10',
    hours: 60, reason: 'Holiday', state: 'approved', overrideBy: null,
  };

  it('names the override when there was one', () => {
    const line = requestLine({ ...base, overrideBy: 'Tom Reyes' }, check(base, balances), 'approver');
    expect(line).toContain('in advance by Tom Reyes');
  });

  it('says nothing extra when there was not', () => {
    expect(requestLine(base, check(base, balances), 'approver')).toContain('Approved.');
  });

  it('collapses a one-day request to one date', () => {
    const one = { ...base, from: '2026-10-01', to: '2026-10-01', state: 'asked' as const };
    expect(requestLine(one, check(one, balances), 'approver')).toContain('2026-10-01.');
  });
});
