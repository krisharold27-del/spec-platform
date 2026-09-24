import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { seatOf, maySeeTab, tabsFor, maySeeMoney, stripMoney, TAB_SIGHT, whyNot, insteadGoTo, type Seat } from '../src/lib/sight';

/*
  The tabs are read out of the page as TEXT, the way `tests/jobs-tabs.test.ts` reads them. Importing
  the page itself drags in the database and every server-only module behind it, and a test that has
  to stand a server up to check a list is a test somebody eventually deletes.
*/
const PAGE_SRC = readFileSync('src/app/jobs/page.tsx', 'utf8');
function builtTabKeys(): string[] {
  const block = PAGE_SRC.slice(PAGE_SRC.indexOf('const TABS = ['));
  const body = block.slice(0, block.indexOf('] as const;'));
  return [...body.matchAll(/\{ key: '([a-z]+)'/g)].map(m => m[1]);
}

/*
  ── What each seat can SEE ──────────────────────────────────────────────────────────────────────

  Kris, 25 September, answering two questions: a subcontractor sees their own work only, and for
  employees, money is leadership. Until then /jobs was gated on "are you signed in to this
  business" and nothing else — anybody with a login could read every margin, the cash position and
  the whole customer list.
*/
describe('which seat somebody is in', () => {
  it('reads leadership and team off the seat kind', () => {
    expect(seatOf({ isSubcontractor: false, seatKind: 'leadership' })).toBe('leadership');
    expect(seatOf({ isSubcontractor: false, seatKind: 'team' })).toBe('team');
  });

  it('the subcontractor tick beats a leadership chart seat', () => {
    /*
      A subbie running a crew this month is still a subbie. The tick says who they are to the
      business; the chart says what they are doing — and it is the first that decides what they
      take with them when they are on somebody else's job next week.
    */
    expect(seatOf({ isSubcontractor: true, seatKind: 'leadership' })).toBe('subcontractor');
    expect(seatOf({ isSubcontractor: true, seatKind: 'team' })).toBe('subcontractor');
  });
});

describe('a subcontractor sees their own work and nothing else', () => {
  it('opens no Jobs tab at all', () => {
    for (const tab of Object.keys(TAB_SIGHT)) {
      expect(maySeeTab('subcontractor', tab), tab).toBe(false);
    }
    expect(tabsFor('subcontractor', [{ key: 'pipeline' }, { key: 'cash' }])).toEqual([]);
  });

  it('is sent to their own day, not to a dead end', () => {
    expect(insteadGoTo('subcontractor')).toBe('/tech-day');
    expect(whyNot('subcontractor')).toMatch(/your own page/i);
    /* Never the language of a locked door. */
    expect(whyNot('subcontractor')).not.toMatch(/denied|forbidden|permission|not allowed/i);
  });
});

describe('for employees, money is leadership', () => {
  it('leadership sees every tab', () => {
    for (const tab of Object.keys(TAB_SIGHT)) expect(maySeeTab('leadership', tab), tab).toBe(true);
  });

  it('a team member sees the work and not what it is worth', () => {
    expect(maySeeTab('team', 'pipeline')).toBe(true);
    expect(maySeeTab('team', 'schedule')).toBe(true);
    expect(maySeeTab('team', 'time')).toBe(true);
    expect(maySeeTab('team', 'wip')).toBe(false);
    expect(maySeeTab('team', 'cash')).toBe(false);
    expect(maySeeTab('team', 'customers')).toBe(false);
    expect(maySeeTab('team', 'billing')).toBe(false);
  });

  it('supplier cost is money, because it is what a competitor most wants', () => {
    expect(maySeeTab('team', 'catalogue')).toBe(false);
    expect(maySeeTab('team', 'stock')).toBe(false);
  });

  it('a price list is money, because it is the most portable thing a business owns', () => {
    for (const t of ['quotes', 'tenders', 'takeoff']) expect(maySeeTab('team', t), t).toBe(false);
  });

  it('still leaves a team member enough to do their job', () => {
    /*
      The other failure. Hiding what is ON from the people doing it protects nothing and makes the
      day harder — a rule that leaves somebody with an empty screen has not been thought through.
    */
    const left = Object.keys(TAB_SIGHT).filter(t => maySeeTab('team', t));
    expect(left.length).toBeGreaterThanOrEqual(5);
    expect(left).toContain('pipeline');
    expect(left).toContain('schedule');
  });
});

describe('the money is taken out, not styled away', () => {
  it('leaves leadership’s rows alone', () => {
    const rows = [{ id: 'a', valueCents: 500_000, materialsCents: 90_000 }];
    expect(stripMoney(rows, 'leadership')).toEqual(rows);
  });

  it('strips value and materials for everybody else', () => {
    const rows = [{ id: 'a', valueCents: 500_000, materialsCents: 90_000 }];
    for (const seat of ['team', 'subcontractor'] as Seat[]) {
      const out = stripMoney(rows, seat);
      expect(out[0].valueCents).toBe(0);
      expect(out[0].materialsCents).toBe(0);
      expect(out[0].id).toBe('a');
    }
  });

  it('does not change the rows it was given', () => {
    const rows = [{ id: 'a', valueCents: 500_000 }];
    stripMoney(rows, 'team');
    expect(rows[0].valueCents).toBe(500_000);
  });

  it('only leadership sees money anywhere', () => {
    expect(maySeeMoney('leadership')).toBe(true);
    expect(maySeeMoney('team')).toBe(false);
    expect(maySeeMoney('subcontractor')).toBe(false);
  });
});

describe('every tab is filed, so a new one cannot be born unguarded', () => {
  it('classifies every tab the product actually has', () => {
    /*
      The check that matters over time. A tab added later and not filed here would fall through
      `TAB_SIGHT[tab] === 'work'` as undefined — which denies rather than leaks, so the failure is
      safe — but it would be invisible to a team member with nobody knowing why.
    */
    const built = builtTabKeys();
    expect(built.length, 'read no tabs out of the page').toBeGreaterThan(15);
    const unfiled = built.filter(t => !(t in TAB_SIGHT));
    expect(unfiled, `not filed in TAB_SIGHT: ${unfiled.join(', ')}`).toEqual([]);
  });

  it('files nothing that is not a tab', () => {
    const built = new Set(builtTabKeys());
    const ghosts = Object.keys(TAB_SIGHT).filter(t => !built.has(t));
    expect(ghosts, `filed but not a tab: ${ghosts.join(', ')}`).toEqual([]);
  });

  it('an unknown tab is denied rather than allowed', () => {
    expect(maySeeTab('team', 'something-new')).toBe(false);
  });
});

describe('the page enforces it, not just the model', () => {
  const PAGE = PAGE_SRC;

  it('Jobs works out the seat and uses it', () => {
    /* `seatFor` is the database-backed resolver in lib/seat-of; `seatOf` is the pure rule under it. */
    expect(PAGE).toContain('seatFor(user)');
    expect(PAGE).toContain('maySeeTab(seat, tab)');
  });

  it('and refuses a tab this seat may not open, rather than rendering it', () => {
    /*
      The one that would actually leak. Filtering the tab ROW hides the door; somebody following a
      link from a colleague, or typing ?tab=cash, walks straight past it.
    */
    expect(PAGE).toMatch(/if \(!maySeeTab\(seat, tab\)\) \{[\s\S]{0,600}redirect\(/);
  });

  it('and strips the money out of the rows rather than hiding it in the markup', () => {
    expect(PAGE).toContain('stripMoney(');
  });
});
