import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  NO_UPTIME_PROMISE, WORKS_OFFLINE, outageLine,
  USING, useWatch, whoHasNot, usingLine, ADOPTION_IS_NOT_A_MEMO,
  complaintWatch, DISPUTE_PACK, match, LOCATION_ONLY_AT_THE_ENDS, checksLocation,
  waitingToAccept, ACCEPTED_NEVER_AUTOMATIC, PRICE_LOCKED_MONTHS, NOTICE_DAYS, PRICE_PROMISE,
  type PersonWeek, type Complaint, type VehicleEvent, type WorkOrder,
} from '../src/lib/round3';

const src = readFileSync(join(process.cwd(), 'src/lib/round3.ts'), 'utf8');

describe('no uptime promise anywhere', () => {
  /*
    A number like 99.9% is a contractual claim, and a business that lost a morning after reading it
    has been misled in a way it can point at.
  */
  it('never publishes a percentage uptime in anything a person reads', () => {
    /*
      Scanned over the STRINGS, not the prose. The comment above NO_UPTIME_PROMISE names 99.9% as
      the example of what must not be said, which is the point of it — what must not happen is that
      figure reaching a page.
    */
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const strings = [...code.matchAll(/'((?:[^'\\]|\\.)*)'|`([^`]*)`/g)].map(m => m[1] ?? m[2]);
    const found = strings.filter(v => /\b9\d(?:\.\d+)?\s*%/.test(v));
    expect(found, `an uptime figure would reach a page: ${found.join(' | ')}`).toEqual([]);
  });

  it('says what is true instead', () => {
    expect(NO_UPTIME_PROMISE).toContain('does not publish an uptime figure');
    expect(NO_UPTIME_PROMISE).toContain('status page');
  });

  it('names what keeps working without signal, rather than being vague', () => {
    expect(WORKS_OFFLINE.length).toBeGreaterThanOrEqual(5);
    for (const w of WORKS_OFFLINE) expect(w.how.length, w.what).toBeGreaterThan(15);
  });

  it('always says what still works during an outage', () => {
    expect(outageLine(null)).toBe('Everything is working.');
    const said = outageLine({ what: 'The office screens are slow', since: '2026-09-25T09:15:00Z', stillWorks: 'Phones are unaffected.' });
    expect(said).toContain('09:15');
    expect(said).toContain('Phones are unaffected');
  });
});

describe('using siteVIP', () => {
  const person = (over: Partial<PersonWeek> = {}): PersonWeek =>
    ({ personKey: 'p1', name: 'Hemi', did: [...USING], daysBooked: 5, ...over });

  it('is the three that are doing the work, not opening the app', () => {
    expect([...USING]).toEqual(['prestart', 'timesheet', 'signoff']);
  });

  it('never puts somebody on leave on a "has not used it" list', () => {
    /* A supervisor told off about somebody's holiday stops reading the list. */
    const w = useWatch(person({ did: [], daysBooked: 0 }));
    expect(w.state).toBe('not_working');
    expect(whoHasNot([person({ did: [], daysBooked: 0 })])).toHaveLength(0);
  });

  it('says what somebody who used none of it costs the office', () => {
    const w = useWatch(person({ did: [] }));
    expect(w.state).toBe('not_using');
    expect(w.says).toContain('somebody is typing them up');
  });

  it('names what is missing rather than a score', () => {
    const w = useWatch(person({ did: ['prestart'] }));
    expect(w.state).toBe('partly');
    expect(w.says).toContain('missing clocked on and off and customer sign-off');
  });

  it('counts only people who were working', () => {
    expect(usingLine([person(), person({ did: [], daysBooked: 0 })])).toContain('All 1 used it');
  });

  it('says why adoption is not a memo', () => {
    expect(ADOPTION_IS_NOT_A_MEMO).toContain('survives a busy fortnight');
  });
});

describe('complaints', () => {
  const complaint = (over: Partial<Complaint> = {}): Complaint =>
    ({ from: 'Bean There', what: 'Light still flickers', at: '2026-09-20', ownerName: 'Tom', dueAt: '2026-09-27', updates: [{ at: '2026-09-21', said: 'Booked Thursday' }], closedAt: null, ...over });

  it('flags one nobody owns', () => {
    const w = complaintWatch(complaint({ ownerName: null }));
    expect(w.state).toBe('unowned');
    expect(w.says).toContain('a review nobody can answer');
  });

  it('flags one with no date', () => {
    expect(complaintWatch(complaint({ dueAt: null })).state).toBe('no_date');
  });

  it('treats silence as the real failure', () => {
    /* What turns a complaint into a lost customer is silence, not the fault. */
    const w = complaintWatch(complaint({ updates: [] }));
    expect(w.state).toBe('client_not_told');
    expect(w.says).toContain('turns this into a review');
  });

  it('is quiet when it is being handled', () => {
    expect(complaintWatch(complaint()).state).toBe('open');
  });

  it('packs a dispute in the order an argument runs', () => {
    expect(DISPUTE_PACK[0]).toContain('quote they accepted');
    expect(DISPUTE_PACK.join(' ')).toContain('variation');
  });
});

describe('tolls and fines', () => {
  const toll: VehicleEvent = { kind: 'toll', rego: 'ABC123', at: '2026-09-22T07:40:00Z', cents: 480, where: 'M5 East' };
  const fine: VehicleEvent = { kind: 'fine', rego: 'ABC123', at: '2026-09-22T07:40:00Z', cents: 30_400, where: 'Speed, Botany Rd' };

  it('charges a toll to the job the ute was on', () => {
    expect(match(toll, { jobRef: 'J-4402', driver: 'Hemi' }).jobRef).toBe('J-4402');
  });

  it('refuses to guess which job, and says where it went instead', () => {
    const m = match(toll, null);
    expect(m.jobRef).toBeNull();
    expect(m.says).toContain('stays on overhead');
  });

  it('drafts the nomination for the driver to sign', () => {
    const m = match(fine, { jobRef: 'J-4402', driver: 'Hemi' });
    expect(m.nomination).toContain('Hemi');
    expect(m.nomination).toContain('sign');
  });

  it('does not nominate anybody it cannot identify', () => {
    expect(match(fine, null).nomination).toBeNull();
  });
});

describe('where the phone looks', () => {
  it('checks location at the two ends only', () => {
    expect(checksLocation('clock_on')).toBe(true);
    expect(checksLocation('clock_off')).toBe(true);
    for (const m of ['lunch', 'driving', 'idle', 'photo']) expect(checksLocation(m), m).toBe(false);
  });

  it('says so to the person, in their words', () => {
    expect(LOCATION_ONLY_AT_THE_ENDS).toContain('Nothing follows you around');
    expect(LOCATION_ONLY_AT_THE_ENDS).toContain('not on the way home');
  });
});

describe('work orders and the price promise', () => {
  const order = (over: Partial<WorkOrder> = {}): WorkOrder =>
    ({ from: 'Strata agent', via: 'their portal', reference: 'WO-99', what: 'Light out', at: '2026-09-24', acceptedAt: null, ...over });

  it('waits to be accepted', () => {
    expect(waitingToAccept([order(), order({ acceptedAt: '2026-09-25' })])).toHaveLength(1);
  });

  it('says why nothing is booked automatically', () => {
    expect(ACCEPTED_NEVER_AUTOMATIC).toContain('commitment the business never made');
  });

  it('locks the price for a year with two months of notice', () => {
    expect(PRICE_LOCKED_MONTHS).toBe(12);
    expect(NOTICE_DAYS).toBe(60);
    expect(PRICE_PROMISE).toContain('not a launch offer'.replace('n', 'N'));
  });
});
