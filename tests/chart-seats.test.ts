import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  MIN_KPIS, LEADER_TITLE, seatKindFor, seatBadges, pillarReadiness, readinessLine,
  firstWednesdayNextMonth, monthName, cadence, kpiSuggestions, addKpi, mayScore, KPI_EXAMPLES,
} from '../src/lib/chart-seats';
import { PILLARS } from '../src/lib/scoring';

/**
 * ── The org chart, to design 15 ──────────────────────────────────────────────────────────────────
 *
 * Kris, 19 September: *"now do the org chart"*, against a handoff that adds two seat types, a KPI
 * editor on every pillar, a sign-off deadline in the header, and a readiness dot per pillar.
 */

describe('which seat a card is', () => {
  /*
    ── Two signals, where the design uses one ──────────────────────────────────────────────────

    The design decides by TITLE. `lib/pricing` decided by the CHART. Both are gameable on their own
    and in opposite directions: by title, a business renames its way to cheaper seats; by the chart,
    a Site Supervisor whose crew has not been drawn yet is billed as somebody who is led.

    So it is either. Money rides on this, and the safe direction to be wrong in is the expensive
    one.
  */
  it('IS LEADERSHIP IF PEOPLE REPORT TO IT, whatever it is called', () => {
    expect(seatKindFor({ title: 'Yard hand', hasDirectReports: true })).toBe('leadership');
    expect(seatKindFor({ title: 'Electrician', hasDirectReports: true })).toBe('leadership');
  });

  it('OR IF ITS TITLE SAYS IT LEADS, even before anybody is under it', () => {
    for (const title of ['Site Supervisor', 'Operations Manager', 'Team Leader', 'Head of Growth', 'Director']) {
      expect(seatKindFor({ title, hasDirectReports: false }), title).toBe('leadership');
    }
  });

  it('and is a team seat only when neither is true', () => {
    expect(seatKindFor({ title: 'Electrician', hasDirectReports: false })).toBe('team');
    expect(seatKindFor({ title: 'Apprentice', hasDirectReports: false })).toBe('team');
  });

  it('and the title test is the design’s own', () => {
    expect(LEADER_TITLE.source).toContain('supervisor');
    expect(LEADER_TITLE.source).toContain('head of');
  });

  /*
    A tick against an empty chair certifies a vacancy, which is nothing. The design only ever shows
    the mark when `certified: true` AND somebody is in the seat.
  */
  it('SHOWS THE CERTIFIED MARK ONLY ON A SEAT SOMEBODY IS ACTUALLY IN', () => {
    const lead = { title: 'Operations Manager', hasDirectReports: true };
    expect(seatBadges({ ...lead, certified: true, filled: true })).toContain('✓ SPEC Certified');
    expect(seatBadges({ ...lead, certified: true, filled: false })).not.toContain('✓ SPEC Certified');
    expect(seatBadges({ ...lead, certified: false, filled: true })).not.toContain('✓ SPEC Certified');
  });

  it('and a team seat is never certified, because the mark is about leading', () => {
    const badges = seatBadges({ title: 'Electrician', hasDirectReports: false, certified: true, filled: true });
    expect(badges).toEqual(['Team seat']);
  });
});

describe('whether a pillar can be scored yet', () => {
  /*
    Two per pillar is not a new number. `lib/period` has enforced it since the first month was
    opened — a business with fewer has nothing worth scoring — and the design calls the same
    threshold MIN_KPIS. Two copies of it is how a chart goes green against a month that will not
    open.
  */
  it('IS THE SAME MINIMUM THE MONTH ALREADY REFUSES TO OPEN WITHOUT', () => {
    expect(MIN_KPIS).toBe(2);
    const period = readFileSync('src/lib/period.ts', 'utf8');
    expect(period, 'lib/period should use the shared minimum, not its own 2').toContain('MIN_KPIS');
  });

  it('and the dot is green at the minimum, red below it', () => {
    expect(pillarReadiness(0)).toBe('short');
    expect(pillarReadiness(1)).toBe('short');
    expect(pillarReadiness(2)).toBe('ready');
    expect(pillarReadiness(9)).toBe('ready');
  });

  it('says which pillars are short, not just that something is', () => {
    const line = readinessLine({ safety: 2, people: 1, earnings: 2, compliance: 0 });
    expect(line).toContain('people');
    expect(line).toContain('compliance');
    expect(line).not.toContain('safety');
  });

  it('and says so plainly when the role is ready', () => {
    expect(readinessLine({ safety: 2, people: 2, earnings: 3, compliance: 2 }))
      .toContain('This role can be scored');
  });
});

describe('when the month has to be signed off', () => {
  /*
    The design computes this on the client as a placeholder and says Code should drive it from the
    real lock schedule. It lives in one function so the banner and whatever eventually locks the
    month cannot disagree — a deadline printed by one rule and enforced by another is a deadline
    nobody believes twice.
  */
  it('IS THE FIRST WEDNESDAY OF NEXT MONTH', () => {
    // 19 September 2026 is a Saturday. October 2026 starts on a Thursday, so the 7th is the first Wednesday.
    const due = firstWednesdayNextMonth(new Date(2026, 8, 19));
    expect(due.getDay(), 'Wednesday is day 3').toBe(3);
    expect(due.getMonth()).toBe(9);
    expect(due.getDate()).toBe(7);
  });

  it('and works when the first of the month IS a Wednesday', () => {
    // July 2026 starts on a Wednesday, so a date in June must give the 1st.
    const due = firstWednesdayNextMonth(new Date(2026, 5, 10));
    expect(due.getDate()).toBe(1);
    expect(due.getDay()).toBe(3);
  });

  it('and rolls into the next year from December', () => {
    const due = firstWednesdayNextMonth(new Date(2026, 11, 20));
    expect(due.getFullYear()).toBe(2027);
    expect(due.getMonth()).toBe(0);
    expect(due.getDay()).toBe(3);
  });

  it('names the month being scored and how long is left', () => {
    const c = cadence(new Date(2026, 8, 19));
    expect(c.scoringMonth).toBe('September 2026');
    expect(c.deadline).toBe('October 7');
    expect(c.daysLeft).toBe(18);
    expect(c.overdue).toBe(false);
  });

  it('and says when it is overdue rather than counting down past nothing', () => {
    // The 8th of October: the deadline was yesterday, and the next one is November's.
    const c = cadence(new Date(2026, 9, 8));
    expect(c.scoringMonth).toBe('October 2026');
    expect(c.daysLeft).toBeGreaterThan(0);
    expect(monthName(new Date(2026, 0, 1))).toBe('January 2026');
  });
});

describe('adding a KPI', () => {
  /*
    A supervisor is measured on what their team did; an electrician on what they did. Offering
    "Gross profit margin at 40%" to somebody who cannot see a margin teaches them that SPEC is not
    about their job.
  */
  it('OFFERS EXAMPLES THAT FIT THE SEAT', () => {
    expect(kpiSuggestions('leadership', 'earnings', [])[0]).toBe('Gross profit margin at 40%');
    expect(kpiSuggestions('team', 'safety', [])).toContain('PPE worn on every job');
    expect(kpiSuggestions('team', 'earnings', [])).not.toContain('Gross profit margin at 40%');
  });

  it('and every pillar has examples for both kinds of seat', () => {
    for (const kind of ['leadership', 'team'] as const) {
      for (const pillar of PILLARS) {
        expect(KPI_EXAMPLES[kind][pillar].length, `${kind}/${pillar}`).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('skips the ones already on the pillar, however they were typed', () => {
    const left = kpiSuggestions('team', 'safety', ['ppe worn on EVERY job']);
    expect(left).not.toContain('PPE worn on every job');
    expect(left.length).toBe(KPI_EXAMPLES.team.safety.length - 1);
  });

  /*
    Case-insensitive, because "PPE worn on every job" and "PPE Worn On Every Job" are the same
    measure — and a pillar carrying both looks ready at two and is really one.
  */
  it('REFUSES A DUPLICATE IN ANY CASE, which would fake the minimum', () => {
    const added = addKpi('PPE Worn On Every Job', ['PPE worn on every job']);
    expect(added.ok).toBe(false);
    expect(added.ok === false && added.reason).toContain('already on this pillar');
  });

  it('and refuses an empty one, and tidies the spacing of a real one', () => {
    expect(addKpi('   ', []).ok).toBe(false);
    const ok = addKpi('  Debtor   days under 30 ', []);
    expect(ok.ok && ok.text).toBe('Debtor days under 30');
  });

  it('and refuses one too long to read on a card', () => {
    expect(addKpi('x'.repeat(200), []).ok).toBe(false);
  });
});

describe('who may put a number on a pillar', () => {
  /*
    The design gates the percentage behind the direct manager or an Administrator / SPEC Certified
    toggle, and says Code should replace both with real auth. This is that.

    Adding a KPI stays open to anybody who can shape the chart — what a role is measured on is a
    conversation. Putting the number on it is a judgement about a person, and that is the manager's.
  */
  it('IS THE MANAGER THE ROLE REPORTS TO', () => {
    expect(mayScore({ scorerRoleId: 'boss', roleReportsTo: 'boss', roleId: 'r1', isAdministrator: false })).toBe(true);
    expect(mayScore({ scorerRoleId: 'someone-else', roleReportsTo: 'boss', roleId: 'r1', isAdministrator: false })).toBe(false);
  });

  it('or an administrator', () => {
    expect(mayScore({ scorerRoleId: 'anyone', roleReportsTo: 'boss', roleId: 'r1', isAdministrator: true })).toBe(true);
  });

  /*
    The rule the whole product is sold on, and the one place a toggle in a prototype would have
    quietly become a way around it. An administrator does not get to score themselves either.
  */
  it('AND NOBODY SCORES THEIR OWN CARD, administrator or not', () => {
    expect(mayScore({ scorerRoleId: 'r1', roleReportsTo: 'boss', roleId: 'r1', isAdministrator: false })).toBe(false);
    expect(mayScore({ scorerRoleId: 'r1', roleReportsTo: 'boss', roleId: 'r1', isAdministrator: true })).toBe(false);
  });

  it('and somebody with no role on the chart scores nothing', () => {
    expect(mayScore({ scorerRoleId: null, roleReportsTo: 'boss', roleId: 'r1', isAdministrator: false })).toBe(false);
  });

  it('and the top of the chart is not scored by a stray null reportsTo', () => {
    expect(mayScore({ scorerRoleId: null, roleReportsTo: null, roleId: 'gm', isAdministrator: false })).toBe(false);
  });
});
