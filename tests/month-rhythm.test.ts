import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { monthNow, needsNewMonth, isMarkable } from '../src/lib/period';

/*
  ── The monthly rhythm ───────────────────────────────────────────────────────────────────────────

  Kris, 24 September 2026:

    "Scores SET (lock) at the end of the last day of the month. On the 1st of the next month the
     SCORES clear to zero. The KPIs themselves, targets, owners and team KPIs all carry over
     unchanged. Nothing is deleted. Supervisors and managers start the new month with the same KPIs
     and their teams. The locked month is still reviewed and signed off (GM submits, Director signs)
     as before, but scoring for the new month starts on the 1st regardless. Ace streaks, incentives
     and the 'Is the business going well?' verdict read from the locked months, so the reset never
     makes the business look worse than it is."

  This was not a missing feature. `currentPeriod` returned the LAST period whenever none was open
  and never asked what month it is, so a business that signed September off would have opened SPEC
  on 1 October and been shown September as its current month, with no way to start October. Seven
  days from the day this was written.
*/

describe('a month rolls over on the 1st', () => {
  const on = (iso: string) => new Date(`${iso}T09:00:00.000Z`);

  it('OPENS A NEW MONTH the moment the calendar moves past the last one', () => {
    expect(needsNewMonth({ period: '2026-09' }, on('2026-10-01'))).toBe(true);
    expect(needsNewMonth({ period: '2026-09' }, on('2026-10-15'))).toBe(true);
    expect(needsNewMonth({ period: '2026-09' }, on('2027-01-01')), 'a gap is still a roll').toBe(true);
  });

  it('leaves the month alone while it is still that month', () => {
    expect(needsNewMonth({ period: '2026-09' }, on('2026-09-01'))).toBe(false);
    expect(needsNewMonth({ period: '2026-09' }, on('2026-09-30'))).toBe(false);
  });

  /*
    A business with no history at all is a different question — `hasSomethingToScore` answers it,
    and answering "yes, roll" here would open a month for an empty business, which scores zero and
    reads as a failure rather than as a business not yet built.
  */
  it('does not roll a business that has no months at all', () => {
    expect(needsNewMonth(undefined, on('2026-10-01'))).toBe(false);
    expect(needsNewMonth(null, on('2026-10-01'))).toBe(false);
  });

  it('never goes backwards if a clock is wrong', () => {
    expect(needsNewMonth({ period: '2026-10' }, on('2026-09-15'))).toBe(false);
  });

  it('keys a month the way the table does', () => {
    expect(monthNow(on('2026-10-01'))).toBe('2026-10');
    expect(monthNow(on('2026-01-31'))).toBe('2026-01');
  });
});

describe('what may still be marked', () => {
  const on = (iso: string) => new Date(`${iso}T09:00:00.000Z`);

  it('this month, while it is open', () => {
    expect(isMarkable({ period: '2026-09', status: 'open' }, on('2026-09-24'))).toBe(true);
  });

  /*
    ── Submitted is still markable; a past month is not ─────────────────────────────────────────

    "Submitted" means the person accountable has declared it finished, and somebody correcting a
    number before the Director signs is the system working. The date is what closes it, not the
    declaration — that is the half of the old rule this change keeps.
  */
  it('and still this month once it has been handed up, so a correction is possible', () => {
    expect(isMarkable({ period: '2026-09', status: 'submitted' }, on('2026-09-30'))).toBe(true);
  });

  it('NOT A MONTH THAT HAS PASSED, whatever state it is in', () => {
    for (const status of ['open', 'submitted', 'locked']) {
      expect(isMarkable({ period: '2026-09', status }, on('2026-10-01')), status).toBe(false);
    }
  });

  it('not a locked month even within it', () => {
    expect(isMarkable({ period: '2026-09', status: 'locked' }, on('2026-09-24'))).toBe(false);
  });

  it('not nothing', () => {
    expect(isMarkable(null, on('2026-10-01'))).toBe(false);
    expect(isMarkable(undefined, on('2026-10-01'))).toBe(false);
  });
});

describe('what carries over, and what clears', () => {
  /*
    ── The mechanism is that there is no mechanism ──────────────────────────────────────────────

    "The KPIs themselves, targets, owners and team KPIs all carry over unchanged. Nothing is
    deleted." They carry over because they live on the ROLE, not on the period — so rolling a month
    moves nothing and copies nothing. The scores clear because a new period simply has no marks
    against it yet.

    This is worth a test rather than a comment, because the tempting way to implement "carry over"
    is to copy the criteria into the new month, and that is how a business ends up with four
    duplicates of every KPI by Christmas and no way to tell which one is real.
  */
  it('DOES NOT COPY KPIs INTO THE NEW MONTH — they live on the role, so they never move', () => {
    const period = readFileSync('src/lib/period.ts', 'utf8');
    const roll = period.slice(period.indexOf('needsNewMonth(latest)'));
    const body = roll.slice(0, roll.indexOf('if (latest) return latest;'));
    expect(body, 'a roll must not write criteria').not.toMatch(/insert\([^)]*criteria/);
    expect(body, 'nor scorecard rows').not.toMatch(/insert\([^)]*assessments/);
    // The one thing it does write is the new period itself.
    expect(body).toMatch(/insert\(schema\.periods\)/);
  });

  it('and never deletes anything on the way past', () => {
    const period = readFileSync('src/lib/period.ts', 'utf8');
    expect(period, 'nothing is deleted when a month rolls').not.toMatch(/\.delete\(/);
  });
});
