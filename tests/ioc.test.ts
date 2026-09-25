import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  STAGES, LINK_ASKS, seatLink, readLink, isLinked, linkLine, nextMove, NAME_AT_MOST, type Seat,
} from '../src/lib/ioc';

/*
  ── The Intelligent Org Chart ───────────────────────────────────────────────────────────────────

  Kris, 25 September: "the IOC - intelligent org chart - is the foundation for the system being
  great - the first stage of the plan is LINK - we need the org chart to do this - who does what and
  are they capable and is the business achieving success", and "LINK - FLOW - GROW is the spec way".
*/
const seat = (over: Partial<Seat> = {}): Seat => ({
  id: 's1', title: 'Site Supervisor', person: 'Hal Walker', pencilled: false,
  scored: true, hasKpis: true, clear: 'clear', overdue: [], blocking: [], ...over,
});

describe('the SPEC way is three stages, and Link is the first', () => {
  it('names them in order', () => {
    expect(STAGES.map(s => s.key)).toEqual(['link', 'flow', 'grow']);
    expect(STAGES[0].is).toMatch(/foundation/i);
  });

  it('Link asks three questions, in the order each depends on the last', () => {
    expect(LINK_ASKS.map(a => a.key)).toEqual(['who', 'capable', 'working']);
    for (const a of LINK_ASKS) {
      expect(a.question).toMatch(/\?$/);
      /* What going without it costs — the half that makes somebody act. */
      expect(a.bad.length).toBeGreaterThan(50);
    }
  });
});

describe('one seat against the three', () => {
  it('a held, capable, measured seat is linked', () => {
    const l = seatLink(seat());
    expect(l.answers).toEqual({ who: true, capable: true, working: true });
    expect(l.next).toBeNull();
    expect(l.says).toBe('Linked.');
  });

  it('an empty seat is work nobody owns', () => {
    const l = seatLink(seat({ person: null }));
    expect(l.next).toBe('who');
    expect(l.says).toMatch(/work the business does and nobody owns/);
  });

  it('a pencilled name answers WHO and never CAPABLE', () => {
    /*
      There is no account, no licence on file and no training record, so nobody has been assessed.
      Saying otherwise lets a business read a chart of pencilled names as a linked business.
    */
    const l = seatLink(seat({ pencilled: true }));
    expect(l.answers.who).toBe(true);
    expect(l.answers.capable).toBe(false);
    expect(l.says).toMatch(/a name, not somebody assessed/);
  });

  it('somebody who cannot be sent to work does not hold the seat', () => {
    const l = seatLink(seat({ clear: 'blocked', blocking: ['A-grade licence lapsed'] }));
    expect(l.next).toBe('capable');
    expect(l.says).toMatch(/cannot be sent to work: A-grade licence lapsed/);
  });

  it('overdue training for THIS role counts against capability', () => {
    const l = seatLink(seat({ overdue: ['Working at heights'] }));
    expect(l.answers.capable).toBe(false);
    expect(l.says).toMatch(/overdue on Working at heights/);
  });

  it('an unscored role is not a gap — a checklist role has no percentage', () => {
    const l = seatLink(seat({ scored: false, hasKpis: false }));
    expect(l.answers.working).toBe(true);
    expect(l.next).toBeNull();
  });

  it('a scored role with no KPIs cannot say whether it is working', () => {
    const l = seatLink(seat({ hasKpis: false }));
    expect(l.next).toBe('working');
    expect(l.says).toMatch(/nothing says whether it is working/);
  });

  it('names only the FIRST gap, because they depend on each other', () => {
    /*
      Telling somebody their vacant seat is also unmeasured is telling them to do two things when
      the second cannot be done until the first is.
    */
    const l = seatLink(seat({ person: null, hasKpis: false, clear: 'unknown' }));
    expect(l.next).toBe('who');
    expect(l.says).not.toMatch(/KPIs/);
  });
});

describe('the business against the three', () => {
  const chart = (...seats: Seat[]) => readLink(seats);

  it('counts each question separately', () => {
    const r = chart(seat(), seat({ id: 's2', person: null }), seat({ id: 's3', pencilled: true }));
    expect(r.seats).toBe(3);
    expect(r.answered.who).toBe(2);
    expect(r.answered.capable).toBe(1);
    expect(r.linked).toBe(1);
  });

  it('the next question is the FIRST one not every seat answers', () => {
    /*
      In order, because chasing capability across a chart with empty seats is work that has to be
      redone the moment those seats are filled.
    */
    const r = chart(seat({ person: null }), seat({ id: 's2', hasKpis: false }));
    expect(r.next).toBe('who');
  });

  it('moves on once a question is answered everywhere', () => {
    const r = chart(seat(), seat({ id: 's2', hasKpis: false }));
    expect(r.next).toBe('working');
  });

  it('is linked only when every seat is', () => {
    /*
      All or nothing on purpose: "83% linked" is a number a business is comfortable with for two
      years; "six seats are not linked" is six things somebody can do.
    */
    expect(isLinked(chart(seat(), seat({ id: 's2' })))).toBe(true);
    expect(isLinked(chart(seat(), seat({ id: 's2', person: null })))).toBe(false);
    expect(isLinked(chart())).toBe(false);
  });

  it('names a few seats, not all of them', () => {
    const many = Array.from({ length: 20 }, (_, i) => seat({ id: `s${i}`, person: null }));
    expect(readLink(many).worst.length).toBe(NAME_AT_MOST);
  });

  it('says where the business is, and what the next question costs', () => {
    const r = chart(seat(), seat({ id: 's2', person: null }));
    const line = linkLine(r);
    expect(line).toMatch(/1 of 2 seats linked/);
    expect(line).toMatch(/Who does what\?/);
    expect(line).toMatch(/least busy/);
  });

  it('says plainly when it is linked', () => {
    expect(linkLine(chart(seat()))).toMatch(/^Linked\./);
    expect(nextMove(chart(seat()))).toBeNull();
  });

  it('gives ONE next move, not a list', () => {
    const r = chart(seat({ person: null }), seat({ id: 's2', person: null }), seat({ id: 's3' }));
    const move = nextMove(r)!;
    expect(move).toMatch(/nobody owns/);
    expect(move).toMatch(/1 more like it/);
  });

  it('says what to do about an empty chart', () => {
    expect(linkLine(chart())).toMatch(/Draw the seats/);
  });
});

describe('there is one answer to Link, not two', () => {
  it('the stage defers to the IOC reading', async () => {
    /*
      The chart showed "Every role is linked — MET" directly above three questions saying one seat
      of four had somebody capable in it: two copies of one answer, disagreeing, on one screen.
      Attachment is a precondition of Link, not the whole of it.
    */
    const { stages } = await import('../src/lib/orgchart');
    const roles = [{ id: 'r1', title: 'GM', person: 'Kris', pencilled: false, parentId: null,
      level: 'gm', stream: 'whole', pillars: null, scored: true, hasKpis: true, badges: [],
      kpiCounts: { safety: 0, people: 0, earnings: 0, compliance: 0 } }] as never;

    const attachedOnly = stages(roles, [], {});
    expect(attachedOnly.find(s => s.key === 'link')!.met).toBe(true);

    const halfLinked = stages(roles, [], {}, 0.9, { linked: 1, seats: 4, says: '1 of 4 seats linked.' });
    expect(halfLinked.find(s => s.key === 'link')!.met).toBe(false);
    expect(halfLinked.find(s => s.key === 'link')!.detail).toBe('1 of 4 seats linked.');

    const allLinked = stages(roles, [], {}, 0.9, { linked: 4, seats: 4, says: 'Linked.' });
    expect(allLinked.find(s => s.key === 'link')!.met).toBe(true);
  });

  it('the org chart passes the reading in rather than letting the stage decide', () => {
    const src = readFileSync('src/app/org/page.tsx', 'utf8');
    expect(src).toMatch(/stages\(roles, detached, averages, 0\.9,[\s\S]{0,120}linked: link\.linked/);
  });
});
