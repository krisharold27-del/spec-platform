import { describe, it, expect } from 'vitest';
import {
  whoDecides, inTheRoom, whereItWaits, CONCENTRATED_AT, LIBRARY_NOTE, BOARD_KEYS,
  type WhoDecidesInput, type InTheRoomInput, type WhereItWaitsInput, type Board,
} from '../src/lib/boards';

const decides = (over: Partial<WhoDecidesInput> = {}): WhoDecidesInput => ({
  me: 'A. Morgan',
  decisions: { total: 12, mine: 11 },
  actions: { total: 10, mine: 8 },
  targets: { total: 16, unchanged: 16 },
  marks: { total: 24, mine: 22 },
  comments: { total: 9, mine: 8 },
  ...over,
});

const room = (over: Partial<InTheRoomInput> = {}): InTheRoomInput => ({
  me: 'A. Morgan',
  weeks: [
    { weekOf: '2026-08-17', present: 2, roster: 4, logged: true },
    { weekOf: '2026-08-24', present: 0, roster: 4, logged: false },
    { weekOf: '2026-08-31', present: 3, roster: 4, logged: true },
    { weekOf: '2026-09-07', present: 4, roster: 4, logged: true },
  ],
  ...over,
});

const waits = (over: Partial<WhereItWaitsInput> = {}): WhereItWaitsInput => ({
  me: 'A. Morgan',
  carried: [{ weeks: 4, owner: 'A. Morgan' }, { weeks: 1, owner: 'J. Barnes' }],
  waitingOnMe: [{ days: 17 }, { days: 2 }],
  vacancies: 1,
  ...over,
});

/** Everything a board puts on screen, for the rules that apply to all of them. */
const allText = (b: Board) =>
  [b.title, b.question, b.poles.concentrated, b.poles.distributed, b.reading, b.change,
   ...b.signals.flatMap(s => [s.label, s.display, s.contrast])].join(' ');

describe('every board', () => {
  const boards = [whoDecides(decides()), inTheRoom(room()), whereItWaits(waits())];

  it('covers the library', () => {
    expect(boards.map(b => b.key).sort()).toEqual([...BOARD_KEYS].sort());
  });

  /**
   * The rule the whole idea rests on. The director recognised HIMSELF in his numbers; a board that
   * says "you are a dictator" is the consultant confronting him again wearing a chart, and it gets
   * argued with instead of absorbed. It is also the rule book's: never name somebody's psychology
   * back at them.
   */
  it('never labels the person, only the way of working', () => {
    for (const b of boards) {
      const text = allText(b).toLowerCase();
      for (const word of ['dictator', 'micromanag', 'control freak', 'you are a', 'you have become', 'your problem is']) {
        expect(text).not.toContain(word);
      }
    }
  });

  it('puts the realisation as a question the reader answers themselves', () => {
    for (const b of boards) expect(b.question).toMatch(/\?$/);
  });

  // A realisation with no next action is just bad news about yourself.
  it('always carries the change that would move it', () => {
    for (const b of boards) expect(b.change.length).toBeGreaterThan(15);
  });

  it('names the two poles as ways of working rather than kinds of person', () => {
    for (const b of boards) {
      expect(b.poles.concentrated.length).toBeGreaterThan(5);
      expect(b.poles.distributed.length).toBeGreaterThan(5);
    }
  });

  it('says how much of it could actually be computed', () => {
    for (const b of boards) {
      expect(b.coverage.total).toBeGreaterThan(0);
      expect(b.coverage.measured).toBeLessThanOrEqual(b.coverage.total);
    }
  });

  // A conversation board is exactly where a leaderboard would be most tempting and most damaging.
  it('compares against a described pattern, never against another person or business', () => {
    for (const b of boards) {
      const text = allText(b).toLowerCase();
      for (const word of ['average business', 'other businesses', 'benchmark', 'ranked', 'better than', 'worse than', 'percentile']) {
        expect(text).not.toContain(word);
      }
    }
  });
});

describe('whoDecides', () => {
  it('reads all five signals when the business has recorded them', () => {
    const b = whoDecides(decides());
    expect(b.coverage).toEqual({ measured: 5, total: 5 });
    expect(b.signals.map(s => s.key)).toEqual(['decisions', 'actions', 'targets', 'marks', 'comments']);
  });

  it('flags a signal only at or above the stated threshold', () => {
    const at = whoDecides(decides({ decisions: { total: 10, mine: 7 } }));
    const under = whoDecides(decides({ decisions: { total: 10, mine: 6 } }));
    expect(CONCENTRATED_AT).toBe(0.7);
    expect(at.signals[0].concentrated).toBe(true);
    expect(under.signals[0].concentrated).toBe(false);
  });

  it('counts in the words a person would use', () => {
    expect(whoDecides(decides()).signals[0].display).toBe('11 of 12 decisions');
  });

  // SPEC's own claim is that a target is agreed and never imposed. If none ever moved, none was.
  it('treats a target that never moved as the sharpest signal', () => {
    const b = whoDecides(decides());
    const targets = b.signals.find(s => s.key === 'targets')!;
    expect(targets.value).toBe(1);
    expect(targets.concentrated).toBe(true);
    expect(targets.contrast).toContain('pushed back');
  });

  it('says plainly when nothing concentrates, rather than inventing a concern', () => {
    const b = whoDecides(decides({
      decisions: { total: 12, mine: 2 }, actions: { total: 10, mine: 1 },
      targets: { total: 16, unchanged: 3 }, marks: { total: 24, mine: 2 },
      comments: { total: 9, mine: 2 },
    }));
    expect(b.reading).toContain('Nothing here concentrates on you');
    expect(b.change).toContain('Nothing to change');
  });

  it('names which measures run through the person, and how many', () => {
    const b = whoDecides(decides());
    expect(b.reading).toContain('5 of 5 measures run through you');
    expect(b.reading).toContain('decisions written down in your name');
  });

  // Reading a mirror built from three data points would be worse than not looking.
  it('refuses to be read at all when almost nothing is recorded', () => {
    const b = whoDecides(decides({
      decisions: { total: 0, mine: 0 }, actions: { total: 0, mine: 0 },
      targets: { total: 0, unchanged: 0 }, marks: { total: 0, mine: 0 },
      comments: { total: 1, mine: 1 },
    }));
    expect(b.tooEarly).toBe(true);
    expect(b.reading).toContain('Not enough is recorded yet');
  });

  it('offers one concrete step rather than a programme', () => {
    expect(whoDecides(decides()).change).toContain('let the person who made a decision write it down');
    const marksOnly = whoDecides(decides({
      decisions: { total: 12, mine: 1 }, actions: { total: 10, mine: 1 },
      targets: { total: 16, unchanged: 1 }, comments: { total: 9, mine: 1 },
    }));
    expect(marksOnly.change).toContain('mark their own card');
  });

  it('says nothing recorded rather than nought when there is nothing to read', () => {
    const b = whoDecides(decides({ decisions: { total: 0, mine: 0 } }));
    expect(b.signals[0].value).toBeNull();
    expect(b.signals[0].display).toBe('None recorded yet');
    expect(b.signals[0].concentrated).toBe(false);
    expect(b.coverage.measured).toBe(4);
  });
});

describe('inTheRoom', () => {
  it('counts the weeks that were logged and the ones that were not', () => {
    const b = inTheRoom(room());
    expect(b.reading).toContain('1 of the last 4 weeks were not logged');
    expect(b.reading).toContain('75%');
  });

  it('asks for the record before it asks about attendance', () => {
    expect(inTheRoom(room()).change).toContain('Log the next one even if it ran for six minutes');
  });

  it('turns to who was missing once every week is logged', () => {
    const b = inTheRoom(room({
      weeks: [
        { weekOf: '2026-08-31', present: 2, roster: 4, logged: true },
        { weekOf: '2026-09-07', present: 3, roster: 4, logged: true },
      ],
    }));
    expect(b.reading).toContain('Every week logged');
    expect(b.change).toContain('what they were doing instead');
  });

  it('waits for enough weeks before it is worth reading', () => {
    expect(inTheRoom(room({ weeks: [{ weekOf: '2026-09-07', present: 4, roster: 4, logged: true }] })).tooEarly).toBe(true);
  });
});

describe('whereItWaits', () => {
  it('reports what has been sitting, and for how long', () => {
    const b = whereItWaits(waits());
    expect(b.reading).toContain('1 action has been carried three weeks or more');
    expect(b.reading).toContain('1 approval has been waiting a fortnight');
    expect(b.reading).toContain('1 role reports to you with nobody in it');
  });

  // A signal flagged in the table and absent from the sentence under it reads as though the board
  // did not notice.
  it('puts a flagged concentration into the reading, not just into the table', () => {
    const b = whereItWaits(waits({
      carried: [{ weeks: 1, owner: 'A. Morgan' }, { weeks: 1, owner: 'A. Morgan' }],
      waitingOnMe: [], vacancies: 0,
    }));
    expect(b.signals[0].concentrated).toBe(true);
    expect(b.reading).toContain('2 of the 2 carried actions are yours');
  });

  // An action carried three weeks is a decision nobody has made.
  it('goes after the oldest thing first', () => {
    expect(whereItWaits(waits()).change).toContain('is a decision nobody has made');
  });

  it('says a decline unblocks the same as a yes', () => {
    const b = whereItWaits(waits({ carried: [{ weeks: 1, owner: 'J. Barnes' }] }));
    expect(b.change).toContain('A decline is a real outcome');
  });

  it('says nothing has been sitting when nothing has', () => {
    const b = whereItWaits(waits({ carried: [{ weeks: 1, owner: 'J. Barnes' }], waitingOnMe: [{ days: 1 }], vacancies: 0 }));
    expect(b.reading).toBe('Nothing has been sitting.');
    expect(b.change).toContain('Nothing to change');
  });

  it('is too early when nothing at all is recorded', () => {
    expect(whereItWaits(waits({ carried: [], waitingOnMe: [], vacancies: 0 })).tooEarly).toBe(true);
  });
});

describe('LIBRARY_NOTE', () => {
  // If these read as scores, people will start managing the board instead of the business.
  it('says these are not scores and that nobody else can see them', () => {
    expect(LIBRARY_NOTE).toContain('not scores');
    expect(LIBRARY_NOTE).toContain('Nobody else can see yours');
  });
});
