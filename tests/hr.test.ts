import { describe, it, expect } from 'vitest';
import {
  HR_TABS, tabOf, hrefOf, FEEDS, lastThree, reviewOf, trainingPill, trainingStateOf, trainingSummary,
  FAIR_PROCESS, mayTake, stepLine, draftContract, AWARD_CHECKS, lastPayWeek,
  EXIT_REASONS, verdictOf, exitsFrom, turnoverOf,
} from '../src/lib/hr';
import { FRAMEWORK } from '../src/lib/power-meter';

describe('the People tabs', () => {
  it('are the design’s, in its order, plus what has been added since', () => {
    /*
      "When somebody leaves" is not in the design. It was added 25 September, from the workflow
      review: every part of offboarding already lived somewhere — tools on the tools register, the
      seat on billing, access on the chart — and nothing joined them, so each was done by whoever
      remembered, which on a last day is nobody. Named here rather than folded into the list, so an
      addition stays a decision somebody made and not a thing that happened.
    */
    expect(HR_TABS.map(t => t.label)).toEqual([
      'Who you have', 'Staff list', 'Set everybody up', 'Reviews & conduct', 'Pay & exits',
      'Subcontractors', 'When somebody leaves', 'Who you need',
    ]);
    expect(tabOf('leavers')).toBe('leavers');
    expect(tabOf('staff')).toBe('staff');
    expect(hrefOf('staff')).toBe('/people?mode=staff');
  });

  /*
    Subcontractors, added by design 17 — and under PEOPLE, which is the decision rather than the
    placement. Kris: "subcontractors are people working for the business and are held to the full
    expectation on every job." Beside suppliers they would be a folder of certificates; here they
    are held to what everybody else is held to.
  */
  /*
    Setting everybody up is its own tab because of the MONEY, not the layout. Billing reads a seat
    kind off an account, and accounts only exist once people are invited — so without a place to
    record the intent first, a business would have to invite all thirty-eight people, and start
    paying, before it could say which ones were leadership. See lib/onboarding.
  */
  it('HAVE A PLACE TO SET EVERYBODY UP BEFORE ANYBODY IS CHARGED', () => {
    expect(tabOf('setup')).toBe('setup');
    expect(hrefOf('setup')).toBe('/people?mode=setup');
  });

  it('PUT SUBCONTRACTORS UNDER PEOPLE, not beside suppliers', () => {
    expect(tabOf('subbies')).toBe('subbies');
    expect(hrefOf('subbies')).toBe('/people?mode=subbies');
    expect(HR_TABS.find(t => t.tab === 'subbies')?.label).toBe('Subcontractors');
  });

  it('keep the old hiring link working, and never error on an unknown mode', () => {
    expect(tabOf('hiring')).toBe('hiring');
    expect(tabOf('conduct')).toBe('conduct');
    expect(tabOf('pay')).toBe('pay');
    expect(tabOf(undefined)).toBe('have');
    expect(tabOf('nonsense')).toBe('have');
    expect(hrefOf('have')).toBe('/people');
    expect(hrefOf('pay')).toBe('/people?mode=pay');
  });

  it('every "Feeds" line names a real Power Meter slot or a pillar measure', () => {
    const slots = new Set(FRAMEWORK.map(s => s.name));
    for (const feed of Object.values(FEEDS)) {
      const [pillar, name] = feed.split(' · ');
      expect(['Safety', 'People', 'Earnings', 'Compliance']).toContain(pillar);
      if (name !== 'Labour cost') expect(slots.has(name)).toBe(true);
    }
  });
});

describe('a review is the last three months of the KPI board', () => {
  it('takes the three most recent months, oldest first', () => {
    const p = ['2026-05', '2026-08', '2026-06', '2026-07'].map(period => ({ period }));
    expect(lastThree(p).map(x => x.period)).toEqual(['2026-06', '2026-07', '2026-08']);
  });

  it('reads the latest scored month, not an average', () => {
    const r = reviewOf([
      { period: '2026-06', score: 0.95, status: 'locked' },
      { period: '2026-07', score: 0.9, status: 'locked' },
      { period: '2026-08', score: 0.4, status: 'locked' },
    ]);
    expect(r.line).toBe('3 months: 95%, 90%, 40%');
    expect(r.light).toBe('red');
  });

  it('pending is never red: nothing marked is not measured, not a fail', () => {
    const r = reviewOf([{ period: '2026-08', score: null, status: 'open' }]);
    expect(r.light).toBe('pending');
    expect(r.line).toBe('1 month: —');
    expect(reviewOf([]).light).toBe('pending');
  });

  it('skips an unmarked latest month to the last one that was marked', () => {
    const r = reviewOf([
      { period: '2026-07', score: 0.92, status: 'locked' },
      { period: '2026-08', score: null, status: 'open' },
    ]);
    expect(r.light).toBe('green');
  });
});

describe('training records', () => {
  it('only an overdue module is red', () => {
    expect(trainingPill('overdue').light).toBe('red');
    expect(trainingPill('not_started').light).toBe('pending');
    expect(trainingPill('in_progress').light).toBe('amber');
    expect(trainingPill('complete').light).toBe('green');
  });
  it('complete beats overdue', () => {
    expect(trainingStateOf(100, true)).toBe('complete');
    expect(trainingStateOf(40, true)).toBe('overdue');
    expect(trainingStateOf(40, false)).toBe('in_progress');
    expect(trainingStateOf(null, false)).toBe('not_started');
  });
});

describe('one row per person for training', () => {
  it('counts the path and names what is next, overdue first', () => {
    const s = trainingSummary([
      { module: 'A', state: 'complete', due: '2026-09-01' },
      { module: 'B', state: 'not_started', due: '2026-10-01' },
      { module: 'C', state: 'overdue', due: '2026-09-10' },
    ]);
    expect(s.state).toBe('overdue');
    expect(s.sub).toBe('1 of 3 modules complete · next: C, due 2026-09-10');
  });
  it('a finished path is complete, with nothing next', () => {
    expect(trainingSummary([{ module: 'A', state: 'complete', due: null }]))
      .toEqual({ sub: '1 of 1 module complete', state: 'complete' });
  });
  it('an untouched path is not started, never red', () => {
    expect(trainingSummary([{ module: 'A', state: 'not_started', due: null }]).state).toBe('not_started');
  });
});

describe('a fair process, one step at a time', () => {
  it('has the design’s five steps', () => {
    expect(FAIR_PROCESS).toHaveLength(5);
    expect(FAIR_PROCESS[1].label).toBe('Offer a support person');
  });
  it('will not let a step be skipped', () => {
    expect(mayTake(0, 0)).toBe(true);
    expect(mayTake(2, 0)).toBe(false);
    expect(mayTake(1, 2)).toBe(false);
    expect(mayTake(5, 5)).toBe(false);
    expect(stepLine(1)).toBe('Step 2 of 5 · offer a support person');
    expect(stepLine(5)).toBe('All five steps done');
  });
  it('names no one country’s statute', () => {
    expect(JSON.stringify(FAIR_PROCESS)).not.toMatch(/fair work act/i);
  });
});

describe('a contract drafted from the role on the chart', () => {
  it('writes what the chart knows and leaves pay and the award to the business', () => {
    const text = draftContract({
      roleTitle: 'Site Supervisor', businessName: 'A business', reportsTo: 'Operations Manager',
      person: 'T. Example', startDate: '2026-08-04', kpis: [{ pillar: 'safety', text: 'Zero harm' }],
    });
    expect(text).toContain('Reports to: Operations Manager');
    expect(text).toContain('Start date: 2026-08-04');
    expect(text).toContain('Zero harm');
    expect(text).toContain('the business names its award');
    expect(text).not.toMatch(/\$\d/);
  });
});

describe('never one industry’s award', () => {
  it('names no award in the product — the business names its own', () => {
    const src = JSON.stringify({ AWARD_CHECKS, FAIR_PROCESS, EXIT_REASONS, FEEDS });
    expect(src).not.toMatch(/electrical|contracting award|modern award/i);
  });
});

describe('the pay week', () => {
  it('is the Monday to Sunday just finished', () => {
    // Wednesday 23 September 2026
    expect(lastPayWeek(new Date('2026-09-23T03:00:00Z'))).toEqual({ from: '2026-09-14', to: '2026-09-20' });
    // A Monday
    expect(lastPayWeek(new Date('2026-09-21T03:00:00Z'))).toEqual({ from: '2026-09-14', to: '2026-09-20' });
  });
});

describe('exits, right and wrong', () => {
  it('a move to another role is not an exit', () => {
    const exits = exitsFrom([
      { roleId: 'tech', userId: 'u1', staffId: null, fromDate: '2025-01-01', toDate: '2026-03-01' },
      { roleId: 'sup', userId: 'u1', staffId: null, fromDate: '2026-03-01', toDate: null },
      { roleId: 'app', userId: null, staffId: 's2', fromDate: '2025-01-01', toDate: '2026-08-02' },
      { roleId: 'x', userId: null, staffId: null, fromDate: '2025-01-01', toDate: '2026-08-02' },
    ]);
    expect(exits).toEqual([{ roleId: 'app', userId: null, staffId: 's2', left: '2026-08-02' }]);
  });

  it('keeps the latest placement for somebody who held two before leaving', () => {
    const exits = exitsFrom([
      { roleId: 'a', userId: 'u1', staffId: null, fromDate: '2025-01-01', toDate: '2025-06-01' },
      { roleId: 'b', userId: 'u1', staffId: null, fromDate: '2025-06-01', toDate: '2026-01-01' },
    ]);
    expect(exits).toHaveLength(1);
    expect(exits[0].roleId).toBe('b');
  });

  it('only wrong-reason exits count; an unrecorded reason is never counted as wrong', () => {
    expect(verdictOf('retired')).toBe('right');
    expect(verdictOf('unsupported')).toBe('wrong');
    expect(verdictOf(null)).toBeNull();
    expect(turnoverOf(['right', 'wrong', null, null])).toEqual({ wrong: 1, right: 1, unrecorded: 2 });
  });

  it('has both kinds of reason', () => {
    expect(EXIT_REASONS.some(r => r.verdict === 'right')).toBe(true);
    expect(EXIT_REASONS.some(r => r.verdict === 'wrong')).toBe(true);
  });
});
