import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ACES, isAceKind, aceLabel, runOf, runLine, atStake, boardScore, towards, under,
  RUN_LENGTH, ACE_STANDARD, type AceMonth, type BoardLine,
} from '../src/lib/ace';

/*
  ── The Ace ──────────────────────────────────────────────────────────────────────────────────────

  Design 17: complete the training path for your role, then score 90%+ on your board for three
  CLOSED months in a row, and you hold the Ace. Where incentives are switched on, the quarter's
  incentive doubles. Then the run restarts.

  The same rule for Sales, Jobs, Safety, Office, Crew and Apprentice — that sameness IS the design.
  Six different bonus schemes is six arguments; one rule is one conversation.
*/

const month = (score: number | null, closed = true): AceMonth => ({ period: '2026-07', score, closed });

describe('one rule, every role', () => {
  it('has an Ace for each kind of work, and says who it is for', () => {
    expect(ACES.map(a => a.key)).toEqual(['sales', 'jobs', 'safety', 'office', 'crew', 'apprentice']);
    for (const a of ACES) expect(a.who.length, a.key).toBeGreaterThan(5);
    expect(isAceKind('sales')).toBe(true);
    expect(isAceKind('vibes')).toBe(false);
    expect(aceLabel('jobs')).toBe('Jobs Ace');
  });

  /* Every board is fed from what SPEC already holds — a board somebody can type measures typing. */
  it('SAYS EVERY BOARD IS FED, NEVER TYPED', () => {
    const src = readFileSync('src/lib/ace.ts', 'utf8');
    expect(src).toContain('Nobody types their own score');
  });
});

describe('the run', () => {
  it('needs three closed months at the standard', () => {
    expect(RUN_LENGTH).toBe(3);
    expect(ACE_STANDARD).toBe(90);
    expect(runOf([month(92), month(94), month(91)], true).held).toBe(true);
  });

  /*
    "Three in a row" means in a row. A run of 90, 85, 92, 94 is a streak of two — counting the
    good months and ignoring the one in the middle would make the Ace a tally rather than a run.
  */
  it('COUNTS BACK AND STOPS AT THE FIRST MONTH BELOW, rather than totalling the good ones', () => {
    const r = runOf([month(90), month(85), month(92), month(94)], true);
    expect(r.streak).toBe(2);
    expect(r.held).toBe(false);
  });

  /*
    A month counts only once it is CLOSED. A run winnable on an open month is a run won by not
    recording things — the live month is shown and never counted.
  */
  it('NEVER COUNTS THE LIVE MONTH, however good it looks', () => {
    const r = runOf([month(95), month(95), month(99, false)], true);
    expect(r.streak, 'two closed, one live').toBe(2);
    expect(r.held).toBe(false);
    expect(r.live?.score).toBe(99);
  });

  /* The path comes first. Somebody at three months without it has not earned it. */
  it('AND THE TRAINING PATH COMES BEFORE THE RUN', () => {
    const months = [month(95), month(95), month(95)];
    expect(runOf(months, true).held).toBe(true);
    expect(runOf(months, false).held, 'path not finished').toBe(false);
  });

  it('never claims more than the run length', () => {
    expect(runOf([month(95), month(95), month(95), month(95), month(95)], true).streak).toBe(RUN_LENGTH);
  });

  it('and a month with no score does not count as a pass', () => {
    expect(runOf([month(null), month(95), month(95)], true).streak).toBe(2);
  });
});

describe('what the run says', () => {
  /*
    Names what is missing rather than congratulating progress. Somebody two months in wants to know
    the training path is the thing standing in the way, not that they are doing well.
  */
  it('NAMES THE PATH WHEN THE PATH IS WHAT IS IN THE WAY', () => {
    const line = runLine(runOf([month(95), month(95)], false), false);
    expect(line).toContain('training path');
    expect(line).toContain('standing in the way');
  });

  it('counts down the months left when the path is done', () => {
    expect(runLine(runOf([month(95)], true), true)).toContain('1 of 3');
    expect(runLine(runOf([month(95)], true), true)).toContain('2 more');
  });

  /* And says the run restarts, because the Ace is not a pension. */
  it('SAYS THE RUN RESTARTS when it is held', () => {
    expect(runLine(runOf([month(95), month(95), month(95)], true), true)).toContain('restarts');
  });

  it('is honest about nothing having happened yet', () => {
    expect(runLine(runOf([], true), true)).toContain('No closed month');
  });
});

describe('what is at stake', () => {
  /*
    Shown only where incentives are switched on for that person. A doubled number in front of
    somebody who is not on an incentive is a promise nobody made.
  */
  it('SHOWS NOTHING TO SOMEBODY WHO IS NOT ON AN INCENTIVE', () => {
    expect(atStake(400_000, false)).toBeNull();
    expect(atStake(400_000, true)).toBe(800_000);
  });
});

describe('the board', () => {
  const line = (score: number): BoardLine => ({ label: 'x', value: '1', target: '1', score });

  it('averages its lines', () => {
    expect(boardScore([line(100), line(80)])).toBe(90);
    expect(boardScore([]), 'nothing measured is not a pass').toBe(0);
  });

  /* One runaway line must not carry the rest — a board is a set of standards, not a total. */
  it('CAPS A LINE AT 100 so one number cannot carry a failing board', () => {
    expect(boardScore([line(400), line(50)])).toBe(75);
  });

  it('scores towards a target where more is better, and under one where less is', () => {
    expect(towards(38, 40)).toBe(95);
    expect(under(1, 2), 'under the target is a pass').toBe(100);
    expect(under(4, 2)).toBe(50);
    expect(under(0, 0), 'zero against a zero target is a pass').toBe(100);
  });
});
