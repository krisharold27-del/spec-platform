/**
 * The Round 3 items: offline, adoption, complaints, disputes, vehicles and the price promise.
 *
 * ── Kris, 25 September ───────────────────────────────────────────────────────────────────────────
 *
 * *"Outages: phones keep working offline and sync when service returns; public status page; owner
 * gets a text. **No uptime promise in copy.** Adoption: jobs only go to the phone; pay only runs
 * from siteVIP timesheets; 'using siteVIP' (pre-starts, timesheets, sign-offs) is a KPI; supervisors
 * see who hasn't used it this week. Complaints: every client complaint becomes a callback with an
 * owner and a date, and the client gets an update at each step. Disputes: one-tap Dispute pack on
 * the client record."*
 *
 * And: *"Tolls: each toll charged to the job the ute was on. Fines: matched to the driver at that
 * time; the driver is sent the nomination to sign. Timesheets: location checked ONLY at clock on
 * and clock off at the job site; no tracking in between; the phone says so. Work orders land in
 * Leads to ACCEPT, never booked automatically. Price promise: price locked for 12 months, 60 days'
 * notice of any change."*
 *
 * ── The one that is a rule about what SPEC may SAY ───────────────────────────────────────────────
 *
 * *"No uptime promise in copy."* A number like 99.9% is a contractual claim, and a business that
 * lost a morning to an outage after reading it has been lied to in a way it can point at.
 * `tests/round3.test.ts` fails the build if a percentage uptime appears anywhere in this file, and
 * what SPEC says instead is what actually happens: the phones keep working, and here is the page
 * that tells you the truth in the moment.
 *
 * ── The location rule is a promise to the person, not to the business ────────────────────────────
 *
 * Location at clock-on and clock-off, and nowhere in between. It is the difference between proving
 * somebody was at the job and following them around all day, and the phone says which one it is
 * doing — because a tradesman who suspects the second will turn the phone off, and then the
 * timesheet is a text message again.
 */

/* ─────────────────────────────────────────────────────────────────────────────
 * When the signal goes
 * ───────────────────────────────────────────────────────────────────────────── */

export const NO_UPTIME_PROMISE =
  'SPEC does not publish an uptime figure. A number like that is a promise, and a business that lost a morning after reading it has been misled in a way it can point at. What is true instead: the phones keep working without signal and sync when it comes back, there is a status page anybody can open without signing in, and the owner gets a text when something is wrong.';

/** What keeps working on a phone with no signal, and what does not. Named, because vagueness here is a lie. */
export const WORKS_OFFLINE = [
  { what: 'Your pre-start', how: 'Filled in and held until there is signal.' },
  { what: 'Today’s jobs', how: 'Already on the phone from this morning.' },
  { what: 'Clock on and clock off', how: 'Times are the phone’s own; they upload later.' },
  { what: 'Photos and notes', how: 'Held on the phone and sent when service returns.' },
  { what: 'The customer’s sign-off', how: 'Signed on the phone, sent later.' },
] as const;

export const NEEDS_SIGNAL = [
  { what: 'A job booked in the last few minutes', why: 'It has not reached the phone yet.' },
  { what: 'Anything the office changed since you last had signal', why: 'Same reason.' },
] as const;

export interface Outage {
  /** What is affected, in plain words. */
  what: string;
  since: string;
  /** What a person can still do. Never empty — there is always something. */
  stillWorks: string;
}

export function outageLine(outage: Outage | null): string {
  if (!outage) return 'Everything is working.';
  return `${outage.what}, since ${outage.since.slice(11, 16)}. ${outage.stillWorks}`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Using siteVIP
 * ───────────────────────────────────────────────────────────────────────────── */

/** The three things that count as using it. Doing the work, not opening the app. */
export const USING = ['prestart', 'timesheet', 'signoff'] as const;
export type Using = (typeof USING)[number];

export const USING_LABEL: Record<Using, string> = {
  prestart: 'Pre-start',
  timesheet: 'Clocked on and off',
  signoff: 'Customer sign-off',
};

export interface PersonWeek {
  personKey: string;
  name: string;
  /** Which of the three they did at all this week. */
  did: readonly Using[];
  /** Whether they were actually working — somebody on leave is not not-using it. */
  daysBooked: number;
}

export type UseState = 'using' | 'partly' | 'not_using' | 'not_working';

export interface UseWatch {
  person: PersonWeek;
  state: UseState;
  says: string;
}

/**
 * Whether somebody used siteVIP this week.
 *
 * `daysBooked` of zero is `not_working`, and it is the check that stops this being a nasty little
 * feature. A person on annual leave showing up on a supervisor's "has not used it" list is a
 * supervisor being told off about somebody's holiday, and the list gets ignored from then on.
 */
export function useWatch(p: PersonWeek): UseWatch {
  if (p.daysBooked === 0) {
    return { person: p, state: 'not_working', says: `${p.name} had no days booked this week.` };
  }
  if (p.did.length === USING.length) {
    return { person: p, state: 'using', says: `${p.name} — all three.` };
  }
  if (p.did.length === 0) {
    return {
      person: p, state: 'not_using',
      says: `${p.name} worked ${p.daysBooked} ${p.daysBooked === 1 ? 'day' : 'days'} and did none of it on the phone. Their hours and their pre-starts are somewhere else, which means somebody is typing them up.`,
    };
  }
  const missing = USING.filter(u => !p.did.includes(u)).map(u => USING_LABEL[u].toLowerCase());
  return { person: p, state: 'partly', says: `${p.name} — missing ${missing.join(' and ')}.` };
}

export const whoHasNot = (people: readonly PersonWeek[]): UseWatch[] =>
  people.map(useWatch).filter(w => w.state === 'not_using' || w.state === 'partly');

export function usingLine(people: readonly PersonWeek[]): string {
  const working = people.filter(p => p.daysBooked > 0);
  if (working.length === 0) return 'Nobody was booked this week.';
  const fully = working.filter(p => useWatch(p).state === 'using').length;
  return fully === working.length
    ? `All ${working.length} used it for everything this week.`
    : `${fully} of ${working.length} used it for everything this week.`;
}

export const ADOPTION_IS_NOT_A_MEMO =
  'Jobs only go to the phone, and pay only runs from siteVIP timesheets. Nobody has to be talked into using it, because there is nowhere else the work or the hours come from — and that is the only version of adoption that survives a busy fortnight.';

/* ─────────────────────────────────────────────────────────────────────────────
 * Complaints and disputes
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * A complaint becomes a callback with an owner and a date.
 *
 * Not a "complaints register", which is where complaints go to be counted rather than fixed. A
 * callback is a thing already in the system that somebody owns, appears on a schedule and has a
 * date — which means the machinery for chasing it already exists and nobody has to build a second
 * kind of overdue.
 */
export interface Complaint {
  from: string;
  what: string;
  at: string;
  ownerName: string | null;
  dueAt: string | null;
  /** What the client has been told, and when. */
  updates: readonly { at: string; said: string }[];
  closedAt: string | null;
}

export type ComplaintState = 'unowned' | 'no_date' | 'client_not_told' | 'open' | 'closed';

export function complaintWatch(c: Complaint): { state: ComplaintState; says: string } {
  if (c.closedAt) return { state: 'closed', says: `Closed ${c.closedAt.slice(0, 10)}.` };
  if (!c.ownerName?.trim()) {
    return { state: 'unowned', says: `${c.from} complained and nobody owns it. A complaint nobody owns becomes a review nobody can answer.` };
  }
  if (!c.dueAt) {
    return { state: 'no_date', says: `${c.ownerName} owns it and there is no date on it. Without one it is a good intention.` };
  }
  if (c.updates.length === 0) {
    /*
      The thing that turns a complaint into a lost customer is silence, not the fault. A client who
      has been told what is happening waits; one who has heard nothing assumes nothing is happening.
    */
    return { state: 'client_not_told', says: `${c.from} has not been told anything since they complained. That is what turns this into a review.` };
  }
  return { state: 'open', says: `${c.ownerName}, due ${c.dueAt.slice(0, 10)} · ${c.updates.length} ${c.updates.length === 1 ? 'update' : 'updates'} to the client.` };
}

/** What goes in a dispute pack, in the order an argument actually runs. */
export const DISPUTE_PACK = [
  'The quote they accepted, and when',
  'Every variation, and whether it was signed',
  'What was booked, and who was there',
  'Photos, with their dates',
  'The sign-off, if there is one',
  'Every message either way',
  'The invoice, and what has been paid',
] as const;

export const DISPUTE_PACK_IS_ONE_TAP =
  'One tap on the client record. The reason it is one tap is that a dispute pack assembled by hand, under pressure, three weeks later, is a dispute pack with the inconvenient bits missing — and the other side will notice.';

/* ─────────────────────────────────────────────────────────────────────────────
 * Tolls, fines and where the ute was
 * ───────────────────────────────────────────────────────────────────────────── */

export interface VehicleEvent {
  kind: 'toll' | 'fine';
  rego: string;
  at: string;
  cents: number;
  where: string;
}

export interface Matched {
  event: VehicleEvent;
  /** The job the ute was on at that moment, from the schedule. Null when nothing matches. */
  jobRef: string | null;
  /** Who was clocked on to it. Null when nobody was. */
  driver: string | null;
  says: string;
  /** Set for a fine with a driver — the nomination they have to sign. */
  nomination: string | null;
}

/**
 * Match a toll or a fine to the job and the driver.
 *
 * Both from what SPEC already holds — the schedule and the clock — rather than from a tracker. A
 * toll with no match is left unmatched and said so, because guessing which job to charge it to is
 * how a job's margin becomes fiction.
 */
export function match(
  event: VehicleEvent,
  onAt: { jobRef: string; driver: string } | null,
): Matched {
  if (!onAt) {
    return {
      event, jobRef: null, driver: null, nomination: null,
      says: event.kind === 'toll'
        ? `${event.where}, and SPEC cannot see which job ${event.rego} was on. It stays on overhead rather than being charged to a guess.`
        : `${event.where}, and SPEC cannot see who had ${event.rego}. Somebody has to work out the nomination by hand.`,
    };
  }
  if (event.kind === 'toll') {
    return {
      event, jobRef: onAt.jobRef, driver: onAt.driver, nomination: null,
      says: `${event.where} · charged to ${onAt.jobRef}.`,
    };
  }
  return {
    event, jobRef: onAt.jobRef, driver: onAt.driver,
    nomination: `${onAt.driver} was driving ${event.rego} at ${event.at.slice(11, 16)}. The nomination is drafted for them to sign.`,
    says: `${event.where} · ${onAt.driver} was driving.`,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Where the phone looks, and where it does not
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Said ON the phone, not in a policy.
 *
 * A tradesman who suspects they are being followed around all day will turn the phone off, and then
 * the timesheet is a text message again. The only thing that prevents that is the phone saying
 * plainly what it does — at the moment it does it.
 */
export const LOCATION_ONLY_AT_THE_ENDS =
  'Your location is checked when you clock on and when you clock off, at the job. Not in between, not at lunch, and not on the way home. Nothing follows you around.';

export type LocationMoment = 'clock_on' | 'clock_off';

export const checksLocation = (moment: string): moment is LocationMoment =>
  moment === 'clock_on' || moment === 'clock_off';

/* ─────────────────────────────────────────────────────────────────────────────
 * Work orders, and the price promise
 * ───────────────────────────────────────────────────────────────────────────── */

export interface WorkOrder {
  from: string;
  /** How it arrived: a portal, an email, an agent. */
  via: string;
  reference: string;
  what: string;
  at: string;
  acceptedAt: string | null;
}

/**
 * A work order lands in Leads to be ACCEPTED, never booked automatically.
 *
 * The reason is not caution about the data. It is that an automatically booked job is a commitment
 * the business never made — to a price it has not seen, on a day it may not have anybody, for a
 * client whose account may be over its limit. One tap to accept costs seconds and keeps the
 * business the one deciding what it takes on.
 */
export const ACCEPTED_NEVER_AUTOMATIC =
  'Work orders land in Leads to be accepted. Never booked automatically — an automatic booking is a commitment the business never made, to a price nobody has seen, on a day that may have nobody free.';

export const waitingToAccept = (orders: readonly WorkOrder[]): WorkOrder[] =>
  orders.filter(o => !o.acceptedAt);

/** Twelve months locked, sixty days' notice. On the landing page and on pricing. */
export const PRICE_LOCKED_MONTHS = 12;
export const NOTICE_DAYS = 60;

export const PRICE_PROMISE =
  'Your price is locked for 12 months from the day you start, and if it ever changes you get 60 days’ notice. Not a launch offer — it is how the pricing works.';
