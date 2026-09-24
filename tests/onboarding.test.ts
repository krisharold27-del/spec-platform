import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  SEAT_KINDS, isSeatKind, seatKindLabel, seatKindOf, gapsFor, stopsWork, lapsedLicences,
  readyToWork, billFor, billLine, readiness, finaliseLine, isPersonalEmail, PERSONAL_DOMAINS,
  isSetupToken, SETUP_TOKEN_LENGTH, phoneProgress, inviteText, GAP_LABEL, money,
  type Person,
} from '../src/lib/onboarding';

/*
  ── Setting a business's people up ───────────────────────────────────────────────────────────────

  Kris, the weekend before putting JBI in with his HR admin: every person on a row, a tick for what
  they are, their licences and training and induction captured, and "finalise payment after
  everything is set".

  That last part is why this exists at all — billing reads a seat kind off an ACCOUNT, and accounts
  only exist once people are invited. Without somewhere to record the intent first, a business would
  have to invite all thirty-eight people, and start paying, before it could say who was what.
*/

const TODAY = '2026-09-24';

const person = (over: Partial<Person> = {}): Person => ({
  id: 'p1', name: 'Jack Rivers', email: 'jack@jbielectrical.com.au', roleTitle: 'Electrician',
  seatKind: null, isSubcontractor: false, inductedAt: '2026-09-01',
  licences: [{ what: 'A-grade licence', expiresAt: '2027-06-30' }],
  trainingDone: 2, trainingNeeded: 2, invited: false, ...over,
});

describe('what each person is', () => {
  it('is one of two, and each says who it is for', () => {
    expect(SEAT_KINDS.map(k => k.key)).toEqual(['team', 'leadership']);
    expect(isSeatKind('leadership')).toBe(true);
    expect(isSeatKind('boss')).toBe(false);
    expect(seatKindLabel('team')).toBe('Team member');
    for (const k of SEAT_KINDS) expect(k.who.length, k.key).toBeGreaterThan(30);
  });

  /*
    The tick wins over the chart. The chart is SPEC's guess from a title and who reports to whom,
    and a guess must never overrule somebody who has looked at the person and said.
  */
  it('LETS THE TICK BEAT THE CHART, in both directions', () => {
    expect(seatKindOf({ seatKind: 'leadership' }, 'team')).toBe('leadership');
    expect(seatKindOf({ seatKind: 'team' }, 'leadership')).toBe('team');
  });

  it('and falls back to the chart when nobody has said', () => {
    expect(seatKindOf({ seatKind: null }, 'leadership')).toBe('leadership');
    expect(seatKindOf({ seatKind: 'nonsense' }, 'team')).toBe('team');
  });
});

describe('the company email, which is the login', () => {
  /*
    Kris: "email is the login for the job system — so no personal emails recommended". The address
    is not a contact detail here: it signs them in, it receives the sign-in link, and it recovers
    the account. On a personal one the business does not hold the key, so when somebody leaves the
    account leaves with them.
  */
  it('SPOTS AN ADDRESS THE BUSINESS DOES NOT CONTROL', () => {
    expect(isPersonalEmail('someone@gmail.com')).toBe(true);
    expect(isPersonalEmail('someone@bigpond.com')).toBe(true);
    expect(isPersonalEmail('SOMEONE@Hotmail.com'), 'case does not matter').toBe(true);
    expect(isPersonalEmail('jack@jbielectrical.com.au')).toBe(false);
  });

  it('and does not guess at domains it cannot know', () => {
    // A real company whose name happens to look like a webmail provider must not be accused.
    expect(isPersonalEmail('jack@mailbox-electrical.com.au')).toBe(false);
    expect(PERSONAL_DOMAINS.length).toBeLessThan(40);
  });

  /* A recommendation, never a refusal — a screen that blocks is a screen they stop filling in. */
  it('IS A RECOMMENDATION AND NEVER A BLOCK', () => {
    const p = person({ email: 'jack@gmail.com' });
    expect(gapsFor(p)).toContain('personal_email');
    expect(stopsWork(p), 'it does not stop them working').toEqual([]);
    expect(readiness([p], TODAY).canFinalise, 'and it does not stop the bill').toBe(true);
  });

  it('says why, in words somebody can repeat to whoever asks', () => {
    const src = readFileSync('src/lib/onboarding.ts', 'utf8');
    expect(src).toContain('WHY_COMPANY_EMAIL');
    expect(src).toMatch(/the account goes with them|leaves with them/);
  });

  it('no email at all is a different gap from the wrong sort of email', () => {
    expect(gapsFor(person({ email: null }))).toContain('email');
    expect(gapsFor(person({ email: null }))).not.toContain('personal_email');
  });
});

describe('what stops somebody being sent to a job', () => {
  it('is a licence and an induction, and only those', () => {
    expect(stopsWork(person({ licences: [] }))).toEqual(['licence']);
    expect(stopsWork(person({ inductedAt: null }))).toEqual(['induction']);
  });

  /*
    An email and a training path both matter and neither stops somebody working today. A screen
    that cries wolf about a missing email stops being read about the licence.
  */
  it('AND NOT A MISSING EMAIL OR UNFINISHED TRAINING', () => {
    expect(stopsWork(person({ email: null }))).toEqual([]);
    expect(stopsWork(person({ trainingDone: 0, trainingNeeded: 4 }))).toEqual([]);
    expect(gapsFor(person({ trainingDone: 0, trainingNeeded: 4 })), 'still reported').toContain('training');
  });

  /* A licence that has run out is the same as not having one. */
  it('TREATS A LAPSED LICENCE AS NO LICENCE', () => {
    const p = person({ licences: [{ what: 'A-grade licence', expiresAt: '2026-01-01' }] });
    expect(lapsedLicences(p, TODAY)).toEqual(['A-grade licence']);
    expect(readyToWork(p, TODAY)).toBe(false);
  });

  it('and somebody with everything is ready', () => {
    expect(readyToWork(person(), TODAY)).toBe(true);
  });

  it('every gap has words a person can act on', () => {
    for (const g of Object.values(GAP_LABEL)) expect(g.length).toBeGreaterThan(8);
  });
});

describe('what it will cost, before anybody is charged', () => {
  const team = (n: number) => Array.from({ length: n }, () => ({ seatKind: 'team' as const }));
  const lead = (n: number) => Array.from({ length: n }, () => ({ seatKind: 'leadership' as const }));

  it('nobody on the list costs nothing', () => {
    expect(billFor([]).monthlyCents).toBe(0);
    expect(billLine(billFor([]))).toContain('Nobody on the list');
  });

  it('ONE PERSON IS FREE, and says so', () => {
    expect(billFor(team(1)).monthlyCents).toBe(0);
    expect(billFor(lead(1)).monthlyCents).toBe(0);
    expect(billLine(billFor(lead(1)))).toContain('first seat is free');
  });

  /*
    The free seat comes off the DEAREST one — what a business would choose if asked. A free seat
    that quietly comes off the cheapest is a discount somebody has to check to believe.
  */
  it('TAKES THE FREE SEAT OFF THE DEAREST, not the cheapest', () => {
    // 1 leadership + 1 team: the leadership one is free, so the bill is one team seat.
    expect(billFor([...lead(1), ...team(1)]).monthlyCents).toBe(17_00);
  });

  it('adds up a real business', () => {
    // JBI-shaped: 9 leadership, 29 team. One leadership seat free.
    const b = billFor([...lead(9), ...team(29)]);
    expect(b.people).toBe(38);
    expect(b.charged).toBe(37);
    expect(b.monthlyCents).toBe((8 * 134 + 29 * 17) * 100);
    expect(billLine(b)).toContain('38 people');
    expect(billLine(b)).toContain('first seat free');
  });

  it('and reads in whole dollars, which is how a bill is discussed', () => {
    expect(money(153_900, 'A$')).toBe('A$1,539');
  });
});

describe('finishing the list', () => {
  /*
    Deliberately NOT "everything is filled in". Licences, inductions and training arrive over weeks,
    and a business that cannot turn SPEC on until every certificate is scanned never turns it on.
  */
  it('DOES NOT WAIT FOR EVERY CERTIFICATE', () => {
    const half = person({ licences: [], inductedAt: null, email: null });
    expect(readiness([half], TODAY).canFinalise).toBe(true);
  });

  it('but does wait for everybody to have a role', () => {
    expect(readiness([person({ roleTitle: null })], TODAY).canFinalise).toBe(false);
    expect(readiness([], TODAY).canFinalise, 'nobody is not a list').toBe(false);
  });

  it('counts what is still to chase without blocking on it', () => {
    const r = readiness([person({ email: null }), person({ email: 'x@gmail.com' }), person({ licences: [] })], TODAY);
    expect(r.people).toBe(3);
    expect(r.missingEmail).toBe(1);
    expect(r.personalEmail).toBe(1);
    expect(r.cannotBeBooked).toBe(1);
  });

  it('the button says what pressing it does', () => {
    const people = [person(), person({ id: 'p2' })];
    const line = finaliseLine(readiness(people, TODAY), billFor(people.map(() => ({ seatKind: 'team' as const }))));
    expect(line).toContain('invitation');
  });

  it('and says what is in the way when something is', () => {
    expect(finaliseLine(readiness([person({ roleTitle: null })], TODAY), billFor([])))
      .toContain('no role on the chart');
    expect(finaliseLine(readiness([], TODAY), billFor([]))).toBe('Add your people first.');
  });
});

describe('the half they do on their phone', () => {
  /*
    Thirty-eight people with a licence, a ticket, an induction and a start date is well over a
    hundred fields. The office puts in what only the office knows; the person puts in what only they
    have — the certificate is in their wallet, not in the HR admin's drawer.
  */
  it('IS A CREDENTIAL, the same as the customer page’s link', () => {
    expect(SETUP_TOKEN_LENGTH).toBe(32);
    expect(isSetupToken('a'.repeat(32))).toBe(true);
    expect(isSetupToken('a'.repeat(31))).toBe(false);
    expect(isSetupToken('../../etc/passwd')).toBe(false);
  });

  it('tells them how far through they are, and what is next', () => {
    const fresh = person({ email: null, licences: [], inductedAt: null });
    expect(phoneProgress(fresh)).toMatchObject({ done: 0, of: 3 });
    expect(phoneProgress(fresh).next).toContain('details');
    expect(phoneProgress(person()).next, 'nothing left').toBeNull();
  });

  /* It arrives as a text on a phone. A long one does not get read. */
  it('SENDS SOMETHING SHORT, with no password and no app', () => {
    const t = inviteText('JBI Electrical', 'Jack Rivers', 'https://x.test/s/abc');
    expect(t).toContain('Jack');
    expect(t).toContain('JBI Electrical');
    expect(t.length).toBeLessThan(200);
    expect(t).not.toMatch(/password|download|install|app store/i);
  });
});
