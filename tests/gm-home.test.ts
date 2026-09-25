import { describe, it, expect } from 'vitest';
import {
  weekOnWeek, GM_QUESTIONS, worstAnswer, gmLine, leversToPull, PULL_AT_MOST, leversLine,
  awayWatch, reachesAwayOwner, ONLY_INJURY_REACHES_YOU, totalSaved, sideBySide, groupLine,
  type AnsweredQuestion, type Lever, type Saving, type BusinessCard,
} from '../src/lib/gm-home';

describe('has the power meter got better?', () => {
  it('says better with the movement', () => {
    const w = weekOnWeek(68, 61);
    expect(w.movement).toBe('better');
    expect(w.says).toContain('up 7 points');
  });

  it('says worse without softening it', () => {
    expect(weekOnWeek(55, 62).says).toContain('down 7 points');
  });

  it('treats level as an answer rather than a gap', () => {
    const w = weekOnWeek(60, 60);
    expect(w.movement).toBe('level');
    expect(w.says).toContain('Level is an answer');
  });

  it('will not compare against a week it does not have', () => {
    const w = weekOnWeek(60, null);
    expect(w.movement).toBe('unknown');
    expect(w.change).toBeNull();
    expect(w.says).toContain('nothing to compare');
  });

  it('says nothing at all when there is no score', () => {
    expect(weekOnWeek(null, 50).movement).toBe('unknown');
  });
});

describe('the GM’s four questions', () => {
  const q = (key: 'safety' | 'people' | 'earnings' | 'promises', answer: AnsweredQuestion['answer']): AnsweredQuestion =>
    ({ q: GM_QUESTIONS.find(x => x.key === key)!, answer, read: 'read', to: null });

  it('is four', () => {
    expect(GM_QUESTIONS).toHaveLength(4);
    expect(GM_QUESTIONS.map(x => x.key)).toEqual(['safety', 'people', 'earnings', 'promises']);
  });

  it('takes the worst, not the average', () => {
    /* Three clear and one injury is not a 75% week. */
    const list = [q('safety', 'problem'), q('people', 'clear'), q('earnings', 'clear'), q('promises', 'clear')];
    expect(worstAnswer(list)).toBe('problem');
    expect(gmLine(list)).toContain('needs you');
  });

  it('says all clear when it is', () => {
    const list = GM_QUESTIONS.map(x => q(x.key, 'clear'));
    expect(worstAnswer(list)).toBe('clear');
    expect(gmLine(list)).toContain('all clear');
  });

  it('admits which it cannot answer', () => {
    const list = [q('safety', 'clear'), q('people', 'clear'), q('earnings', 'unknown'), q('promises', 'clear')];
    expect(worstAnswer(list)).toBe('unknown');
    expect(gmLine(list)).toContain('not running here');
  });
});

describe('the levers', () => {
  const lever = (key: string, worth: number): Lever =>
    ({ key, what: key, because: 'because', worth, to: '/x' });

  it('shows the biggest three and no more', () => {
    const all = [lever('a', 1), lever('b', 9), lever('c', 4), lever('d', 7), lever('e', 2)];
    const pulled = leversToPull(all);
    expect(pulled).toHaveLength(PULL_AT_MOST);
    expect(pulled.map(l => l.key)).toEqual(['b', 'd', 'c']);
  });

  it('drops anything it cannot price', () => {
    expect(leversToPull([lever('a', 0), lever('b', 3)]).map(l => l.key)).toEqual(['b']);
  });

  it('says what pulling them would do to the score', () => {
    const reading = { score: 60 } as Parameters<typeof leversLine>[1];
    expect(leversLine([lever('a', 4), lever('b', 2)], reading)).toContain('60 to 66');
  });

  it('does not pretend to a score it has not got', () => {
    expect(leversLine([lever('a', 4)], null)).not.toContain(' to ');
  });

  it('says so plainly when there is nothing to pull', () => {
    expect(leversLine([], null)).toContain('already pulled');
  });
});

describe('I’m away', () => {
  it('sends everything to the deputy', () => {
    const w = awayWatch({ away: true, from: null, until: '2026-10-10', deputyKey: 'k', deputyName: 'Sam' });
    expect(w.state).toBe('away');
    expect(w.says).toContain('Sam');
    expect(w.says).toContain('injury');
  });

  it('refuses to pretend it is working with nobody named', () => {
    /*
      The alerts have to go somewhere. Silently leaving them with the owner while the switch reads
      "away" would be the switch lying, which is worse than the switch being off.
    */
    const w = awayWatch({ away: true, from: null, until: null, deputyKey: null, deputyName: null });
    expect(w.state).toBe('away_no_deputy');
    expect(w.says).toContain('still coming to you');
  });

  it('lets exactly one thing through', () => {
    expect(reachesAwayOwner('injury')).toBe(true);
    for (const kind of ['invoice', 'resignation', 'tender_lost', 'overdue', 'urgent']) {
      expect(reachesAwayOwner(kind), kind).toBe(false);
    }
    expect(ONLY_INJURY_REACHES_YOU).toContain('hurt');
  });
});

describe('what siteVIP saved you', () => {
  const s = (what: string, hours: number, cents: number | null): Saving => ({ what, hours, cents });

  it('gives hours and dollars when it can price them', () => {
    const t = totalSaved([s('quotes', 6, 600_00), s('payroll', 4, 400_00)]);
    expect(t.hours).toBe(10);
    expect(t.cents).toBe(100_000);
    expect(t.says).toContain('10 hours and $1,000');
  });

  it('will not invent a dollar figure', () => {
    const t = totalSaved([s('quotes', 6, null)]);
    expect(t.cents).toBeNull();
    expect(t.says).toContain('will not put a dollar figure');
  });

  it('counts unpriced items in hours and says how many', () => {
    const t = totalSaved([s('a', 2, 200_00), s('b', 3, null)]);
    expect(t.hours).toBe(5);
    expect(t.cents).toBe(20_000);
    expect(t.says).toContain('1 more thing is counted in hours but not priced');
  });

  it('says there is nothing yet rather than showing zero', () => {
    expect(totalSaved([]).says).toContain('fills in over your first month');
  });
});

describe('more than one business', () => {
  const b = (name: string, score: number | null): BusinessCard => ({ id: name, name, score, change: null });

  it('puts the one that needs you first', () => {
    expect(sideBySide([b('A', 80), b('B', 42), b('C', 61)]).map(x => x.name)).toEqual(['B', 'C', 'A']);
  });

  it('puts unscored businesses last rather than treating them as zero', () => {
    expect(sideBySide([b('A', 80), b('B', null)]).map(x => x.name)).toEqual(['A', 'B']);
  });

  it('says nothing at all for a single business', () => {
    expect(groupLine([b('A', 80)])).toBe('');
  });

  it('names the one to go to', () => {
    expect(groupLine([b('A', 80), b('B', 42)])).toContain('B is the one');
  });
});
