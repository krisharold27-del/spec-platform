import { describe, it, expect } from 'vitest';
import {
  PLAN_DAYS, FIRM_DAYS, firmnessAt, FIRMNESS_SAYS,
  inOrder, holdsWhatIsNeeded, freeOn, plan,
  A_HOLE_IS, holes, holesLine, HOW_IT_DECIDES, IT_PROPOSES,
  type Need, type Hand,
} from '../src/lib/schedule-ahead';

/* Ten working days, Mon 28 Sep onwards, weekends already excluded by the caller. */
const DAYS = [
  '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02',
  '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09',
];

const need = (over: Partial<Need> = {}): Need => ({
  id: 'n1', kind: 'job', ref: 'J-1', what: 'Switchboard', client: 'Harbourview',
  days: 1, notBefore: null, by: null, crew: 1, needs: [],
  ...over,
});

const hand = (over: Partial<Hand> = {}): Hand => ({
  key: 'h1', name: 'Hemi', holds: [], clear: true, busy: [],
  ...over,
});

describe('how far, and how much to believe it', () => {
  it('plans a month', () => {
    expect(PLAN_DAYS).toBe(30);
  });

  it('gets less confident the further out it goes', () => {
    expect(firmnessAt(1)).toBe('firm');
    expect(firmnessAt(FIRM_DAYS)).toBe('firm');
    expect(firmnessAt(FIRM_DAYS + 1)).toBe('likely');
    expect(firmnessAt(20)).toBe('shape');
  });

  it('says what each one means for telling a customer', () => {
    /* The point: day 28 presented as confidently as tomorrow makes nobody believe tomorrow. */
    expect(FIRMNESS_SAYS.firm).toContain('Tell the customer');
    expect(FIRMNESS_SAYS.likely).toContain('not a date');
    expect(FIRMNESS_SAYS.shape).toContain('not that it happens on that day');
  });
});

describe('what gets placed first', () => {
  it('takes the sooner deadline', () => {
    const out = inOrder([need({ id: 'a', by: '2026-10-09' }), need({ id: 'b', by: '2026-09-30' })]);
    expect(out.map(n => n.id)).toEqual(['b', 'a']);
  });

  it('puts anything with a deadline ahead of anything without', () => {
    const out = inOrder([need({ id: 'a' }), need({ id: 'b', by: '2026-10-09' })]);
    expect(out.map(n => n.id)).toEqual(['b', 'a']);
  });

  it('then the longer job, because long jobs have fewer places to go', () => {
    const out = inOrder([need({ id: 'a', days: 1 }), need({ id: 'b', days: 4 })]);
    expect(out.map(n => n.id)).toEqual(['b', 'a']);
  });
});

describe('a person is not a body', () => {
  it('will not send somebody who is not clear to work', () => {
    /*
      Not a tiebreaker and not a preference. A scheduler that treats this as a soft score will
      eventually book somebody whose ticket has lapsed.
    */
    expect(freeOn(hand({ clear: false }), DAYS[0])).toBe(false);
    const p = plan({ from: DAYS[0], workingDays: DAYS, needs: [need()], hands: [hand({ clear: false })] });
    expect(p.proposals).toHaveLength(0);
    expect(p.unfilled[0].why).toBe('nobody_holds_it');
  });

  it('checks tickets and inductions', () => {
    expect(holdsWhatIsNeeded(hand({ holds: ['mine induction'] }), need({ needs: ['mine induction'] }))).toBe(true);
    expect(holdsWhatIsNeeded(hand({ holds: [] }), need({ needs: ['mine induction'] }))).toBe(false);
  });

  it('tells a missing ticket apart from a missing Thursday', () => {
    /*
      One is solved by moving something; the other is somebody going and getting an induction. A
      scheduler that blurs them sends a manager hunting for a spare day that would not have helped.
    */
    const noTicket = plan({
      from: DAYS[0], workingDays: DAYS,
      needs: [need({ needs: ['mine induction'] })],
      hands: [hand()],
    });
    expect(noTicket.unfilled[0].why).toBe('nobody_holds_it');
    expect(noTicket.unfilled[0].says).toContain('not a scheduling problem');

    const noDay = plan({
      from: DAYS[0], workingDays: DAYS,
      needs: [need({ days: 10 }), need({ id: 'n2', ref: 'J-2', days: 10 })],
      hands: [hand()],
    });
    expect(noDay.unfilled[0].why).toBe('nobody_free');
    expect(noDay.unfilled[0].says).toContain('subbied in');
  });
});

describe('placing the work', () => {
  it('places a one-day job on the first free day', () => {
    const p = plan({ from: DAYS[0], workingDays: DAYS, needs: [need()], hands: [hand()] });
    expect(p.proposals[0].days).toEqual([DAYS[0]]);
    expect(p.proposals[0].hands[0].name).toBe('Hemi');
  });

  it('keeps a multi-day job on consecutive days with the same people', () => {
    /* Swapping crews mid-job is how work gets done twice. */
    const p = plan({ from: DAYS[0], workingDays: DAYS, needs: [need({ days: 3 })], hands: [hand()] });
    expect(p.proposals[0].days).toEqual(DAYS.slice(0, 3));
    expect(p.proposals[0].hands).toHaveLength(1);
  });

  it('puts the whole crew on at once', () => {
    const p = plan({
      from: DAYS[0], workingDays: DAYS,
      needs: [need({ crew: 2 })],
      hands: [hand(), hand({ key: 'h2', name: 'Tom' })],
    });
    expect(p.proposals[0].hands.map(h => h.name).sort()).toEqual(['Hemi', 'Tom']);
  });

  it('works around days somebody is already spoken for', () => {
    const p = plan({
      from: DAYS[0], workingDays: DAYS,
      needs: [need({ days: 2 })],
      hands: [hand({ busy: [DAYS[0], DAYS[1]] })],
    });
    expect(p.proposals[0].days).toEqual([DAYS[2], DAYS[3]]);
  });

  it('never double-books a person it has already placed', () => {
    const p = plan({
      from: DAYS[0], workingDays: DAYS,
      needs: [need({ id: 'a', ref: 'J-A' }), need({ id: 'b', ref: 'J-B' })],
      hands: [hand()],
    });
    expect(p.proposals).toHaveLength(2);
    expect(p.proposals[0].days[0]).not.toBe(p.proposals[1].days[0]);
  });

  it('respects a day it cannot start before', () => {
    const p = plan({
      from: DAYS[0], workingDays: DAYS,
      needs: [need({ notBefore: DAYS[4] })],
      hands: [hand()],
    });
    expect(p.proposals[0].days).toEqual([DAYS[4]]);
  });

  it('says so when it cannot be done by when it is wanted', () => {
    const p = plan({
      from: DAYS[0], workingDays: DAYS,
      needs: [need({ days: 5, by: DAYS[1] })],
      hands: [hand()],
    });
    expect(p.unfilled[0].why).toBe('past_its_date');
    /* Better to tell them now than on the day. */
    expect(p.unfilled[0].says).toContain('than on the day');
  });

  it('marks the far ones as a shape, not a plan', () => {
    const many = Array.from({ length: 8 }, (_, i) => need({ id: `n${i}`, ref: `J-${i}` }));
    const p = plan({ from: DAYS[0], workingDays: DAYS, needs: many, hands: [hand()] });
    expect(p.proposals.at(-1)!.firmness).not.toBe('firm');
  });
});

describe('nothing is silently dropped', () => {
  it('accounts for every need, placed or not', () => {
    /*
      The failure that makes a scheduler dangerous: the business believes the month is covered
      because the jobs it could not fit simply are not on the screen.
    */
    const needs = [
      need({ id: 'a' }),
      need({ id: 'b', needs: ['confined space'] }),
      need({ id: 'c', days: 5, by: DAYS[1] }),
    ];
    const p = plan({ from: DAYS[0], workingDays: DAYS, needs, hands: [hand()] });
    expect(p.proposals.length + p.unfilled.length).toBe(needs.length);
  });

  it('gives every unfilled one a reason somebody can act on', () => {
    const p = plan({
      from: DAYS[0], workingDays: DAYS,
      needs: [need({ needs: ['mine induction'] })],
      hands: [hand()],
    });
    expect(p.unfilled[0].says.length).toBeGreaterThan(50);
  });

  it('counts what could not be placed in the summary', () => {
    const p = plan({
      from: DAYS[0], workingDays: DAYS,
      needs: [need(), need({ id: 'b', needs: ['x'] })],
      hands: [hand()],
    });
    expect(p.says).toContain('could not be placed');
  });

  it('says there is nothing rather than showing an empty plan', () => {
    expect(plan({ from: DAYS[0], workingDays: DAYS, needs: [], hands: [hand()] }).says)
      .toBe('Nothing waiting to be scheduled.');
  });
});

describe('the hole is the point', () => {
  it('finds a run of empty days', () => {
    const quiet = [DAYS[5], DAYS[6], DAYS[7]];
    const found = holes(quiet, DAYS);
    expect(found).toHaveLength(1);
    expect(found[0].days).toBe(3);
    expect(found[0].says).toContain('time to sell something into');
  });

  it('does not call one empty Tuesday a hole', () => {
    expect(holes([DAYS[3]], DAYS)).toHaveLength(0);
    expect(A_HOLE_IS).toBe(3);
  });

  it('finds more than one', () => {
    const quiet = [DAYS[0], DAYS[1], DAYS[2], DAYS[6], DAYS[7], DAYS[8], DAYS[9]];
    expect(holes(quiet, DAYS)).toHaveLength(2);
  });

  it('names the worst when there are several', () => {
    const quiet = [DAYS[0], DAYS[1], DAYS[2], DAYS[6], DAYS[7], DAYS[8], DAYS[9]];
    expect(holesLine(holes(quiet, DAYS))).toContain('longest 4 days');
  });

  it('says nothing dramatic when the month is full', () => {
    expect(holesLine([])).toContain('No quiet stretches');
  });

  it('reports the quiet days from a real plan', () => {
    const p = plan({ from: DAYS[0], workingDays: DAYS, needs: [need()], hands: [hand()] });
    expect(p.quiet).toHaveLength(DAYS.length - 1);
    expect(p.says).toContain('nobody on anything');
  });
});

describe('what it says about itself', () => {
  it('is straight about what is doing the deciding', () => {
    /* "AI scheduling" invites a picture of a model deciding. A model that invents a booking is a
       customer told the wrong day by a business that cannot explain why. */
    expect(HOW_IT_DECIDES).toContain('not guessed');
    expect(HOW_IT_DECIDES).toContain('same answer twice');
  });

  it('never claims to have booked anything', () => {
    expect(IT_PROPOSES).toContain('Nothing here is booked');
    expect(IT_PROPOSES).toContain('promise to a customer');
  });
});
