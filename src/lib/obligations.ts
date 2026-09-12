/**
 * Documents and obligations — pure, no I/O.
 *
 * What a person or a role is obliged to hold, and whether it is still good. This is the evidence
 * under the Clear to Work gate, and everything here follows from one rule: **the gate is pass or
 * fail, never a percentage, and never a guess.**
 *
 * Four states, and the two that are not obvious matter most:
 *
 *   `expired`  — the date has passed. Blocks.
 *   `expiring` — inside the warning window. Does NOT block, because a licence good until Friday is
 *                good until Friday, and blocking somebody early teaches everyone to ignore the
 *                warning. It is loud, and it does not stop work.
 *   `current`  — in date, or no expiry at all. A signed contract does not expire.
 *   `missing`  — required, and nothing recorded. Blocks, because "nobody wrote it down" is not
 *                evidence that somebody holds a licence. Assuming clear because nobody checked is
 *                the failure the gate exists to prevent.
 *
 * Leave is in the same file for one reason: they answer the same question. Clear to Work asks who
 * may work; leave asks who is here. A business that knows one and not the other still cannot answer
 * "is this job covered on Tuesday".
 */

export type ObligationState = 'current' | 'expiring' | 'expired' | 'missing';

/** How far ahead an expiry is worth saying out loud. A month is enough to renew most things. */
export const EXPIRING_WITHIN_DAYS = 30;

export interface Obligation {
  what: string;
  /** Null means it does not expire. Never a date SPEC invented. */
  expiresAt: string | null;
  /** Whose it is, for display. A person's name, or a role title. */
  who: string;
  evidence?: string | null;
}

const DAY = 86_400_000;

/**
 * Whole days from `at` until the date, negative once it has passed.
 *
 * Compared as CALENDAR DAYS, not as instants, and the difference is not academic. An expiry is
 * written as a date with no time, which parses as midnight; `at` is a moment in the working day. So
 * a ticket expiring today, checked at nine in the morning, is nine hours "past" midnight and a
 * straight subtraction reports it expired — blocking somebody whose licence is valid until tonight.
 * Taking the date off both sides is what makes "expires today" mean "still good today".
 */
export function daysUntil(date: string, at: Date): number {
  const day = (s: string) => Date.parse(`${s.slice(0, 10)}T00:00:00Z`);
  return Math.round((day(date) - day(at.toISOString())) / DAY);
}

export function stateOf(o: Pick<Obligation, 'expiresAt'>, at: Date = new Date()): ObligationState {
  if (o.expiresAt === null || o.expiresAt === undefined || o.expiresAt === '') return 'current';
  const days = daysUntil(o.expiresAt, at);
  if (Number.isNaN(days)) return 'missing';   // an unreadable date is not evidence of anything
  if (days < 0) return 'expired';
  return days <= EXPIRING_WITHIN_DAYS ? 'expiring' : 'current';
}

/**
 * Does this stop somebody working?
 *
 * Only two states do. Stated as its own function rather than inline at each call site, because a
 * hard gate that means something slightly different in three places is not a hard gate.
 */
export const blocks = (state: ObligationState): boolean => state === 'expired' || state === 'missing';

export const STATE_LABEL: Record<ObligationState, string> = {
  current: 'Current',
  expiring: 'Expiring',
  expired: 'Expired',
  missing: 'Nothing recorded',
};

/** What a person reads beside it. Says the consequence, not the status again. */
export function stateNote(o: Pick<Obligation, 'expiresAt'>, at: Date = new Date()): string {
  const state = stateOf(o, at);
  if (state === 'current') {
    if (!o.expiresAt) return 'Does not expire.';
    return `Good for another ${daysUntil(o.expiresAt!, at)} days.`;
  }
  if (state === 'expiring') {
    const days = daysUntil(o.expiresAt!, at);
    return days === 0
      ? 'Expires today. Still valid — it does not block until tomorrow.'
      : `Expires in ${days} ${days === 1 ? 'day' : 'days'}. Still valid until then.`;
  }
  if (state === 'expired') return 'Expired. This blocks Clear to Work until it is renewed.';
  return 'Nothing recorded. Not established is not the same as clear.';
}

/**
 * The reasons this set of obligations blocks somebody, in the words the gate reports.
 *
 * Returns an empty list when nothing blocks, which is what lib/people expects to merge into
 * `blocking` — so an expired licence fails Clear to Work by exactly the same path an overdue
 * training module does. One gate, one meaning.
 */
export function blockingReasons(obligations: Obligation[], at: Date = new Date()): string[] {
  return obligations
    .filter(o => blocks(stateOf(o, at)))
    .map(o => (stateOf(o, at) === 'expired' ? `${o.what} has expired` : `${o.what} has nothing recorded`));
}

/* ── Leave and availability ────────────────────────────────────────────────────────────────────── */

export type LeaveKind = 'annual' | 'sick' | 'unpaid' | 'parental' | 'other';

export const LEAVE_KINDS: { id: LeaveKind; label: string }[] = [
  { id: 'annual', label: 'Annual leave' },
  { id: 'sick', label: 'Sick leave' },
  { id: 'unpaid', label: 'Unpaid' },
  { id: 'parental', label: 'Parental' },
  { id: 'other', label: 'Something else' },
];

export const leaveKindLabel = (id: string): string =>
  LEAVE_KINDS.find(k => k.id === id)?.label ?? 'Leave';

export interface LeaveEntry {
  who: string;
  kind: string;
  fromDate: string;
  toDate: string;
  state: string;
  coveredBy?: string | null;
}

/** Is this person away on the given day? Inclusive at both ends — a last day is a day off. */
export function awayOn(l: Pick<LeaveEntry, 'fromDate' | 'toDate' | 'state'>, day: Date): boolean {
  if (l.state !== 'approved') return false;
  const d = day.toISOString().slice(0, 10);
  return l.fromDate <= d && d <= l.toDate;
}

/** Not yet finished. Approved and still to come, or approved and happening now. */
export function upcoming(l: Pick<LeaveEntry, 'toDate'>, at: Date = new Date()): boolean {
  return l.toDate >= at.toISOString().slice(0, 10);
}

/**
 * What this absence actually costs, in one line.
 *
 * The honest answer is usually "nothing much", and saying so is the point — a leave list that
 * flags every day off as a risk gets skimmed, and then the fortnight that mattered gets skimmed
 * too. Only two things raise it: nobody covering, and long enough that it spans real work.
 */
export function impactOf(l: LeaveEntry): string {
  const days = Math.max(1, Math.round((Date.parse(l.toDate) - Date.parse(l.fromDate)) / DAY) + 1);
  const covered = (l.coveredBy ?? '').trim();
  if (covered) return `${days} ${days === 1 ? 'day' : 'days'}, covered by ${covered}.`;
  if (days <= 2) return `${days} ${days === 1 ? 'day' : 'days'}, nobody covering. Short enough that it usually keeps.`;
  return `${days} days with nobody covering — that is a gap in the chart, not just a diary entry.`;
}

/** The line above the list. Says the number, and says it plainly when the number is none. */
export function leaveLine(entries: LeaveEntry[], at: Date = new Date()): string {
  const ahead = entries.filter(e => e.state === 'approved' && upcoming(e, at));
  const today = entries.filter(e => awayOn(e, at));
  if (ahead.length === 0) return 'Nobody is booked away.';
  if (today.length === 0) return `${ahead.length} booked ahead, nobody away today.`;
  return `${today.length} away today, ${ahead.length} booked ahead.`;
}
