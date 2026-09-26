/**
 * Leave: balances that accrue, the leader who approves, and the one kind nobody else may see.
 *
 * ── Kris, 25 September ───────────────────────────────────────────────────────────────────────────
 *
 * *"balances accrue every pay run. Requests on the phone; the person's DIRECT LEADER approves. If
 * the request exceeds the balance, it can only go through with a deliberate MANAGER override, and
 * the OWNER is notified. Leave in advance (negative) is case by case via the same override. On
 * request, SPEC checks the schedule and warns if the crew drops below what's booked. Types: annual,
 * personal/carer's, long service, unpaid, time in lieu, RDOs, compassionate, family and domestic
 * violence (FDV leave is confidential: shows only as 'leave' to anyone but the approver and
 * payroll)."*
 *
 * ── The confidential one, and why it is built first rather than added later ──────────────────────
 *
 * Family and domestic violence leave is the reason this file is careful. Somebody taking it is very
 * often hiding from a person who may know where they work, and a roster that says "FDV leave" next
 * to their name has published that. It is not a preference setting and it is not a nice touch: it
 * is the difference between a safe employee and an employer who told everybody.
 *
 * So `labelFor` takes the VIEWER, and every screen that shows leave must go through it. Building it
 * as a flag to be checked in each of eleven places is how ten of them get it right — and the
 * eleventh is somebody's home address.
 *
 * The same care, less sharply, applies to personal leave: "sick" on a roster is a medical fact
 * about somebody, and the business does not need to publish it to know who is in.
 *
 * ── Why over-balance is an override and not a refusal ────────────────────────────────────────────
 *
 * Because leave in advance is a normal thing a good employer does — somebody two weeks short for a
 * funeral overseas. Refusing it outright would mean the business does it outside SPEC, in a text
 * message, and payroll finds out in the run. What it must not be is ACCIDENTAL: hence deliberate,
 * by a manager rather than the direct leader, and the owner is told. Three frictions, no wall.
 */

export type LeaveKind =
  | 'annual' | 'personal' | 'long_service' | 'unpaid'
  | 'til' | 'rdo' | 'compassionate' | 'fdv';

export interface Kind {
  key: LeaveKind;
  label: string;
  /** Whether it draws down a balance SPEC tracks. */
  accrues: boolean;
  /**
   * Whether the reason is nobody's business but the approver's and payroll's.
   *
   * Personal leave is private because it is medical. FDV leave is private because naming it can put
   * somebody in danger — a different order of harm, and the reason `labelFor` exists at all.
   */
  private: boolean;
}

export const KINDS: Kind[] = [
  { key: 'annual',       label: 'Annual leave',        accrues: true,  private: false },
  { key: 'personal',     label: "Personal / carer's",  accrues: true,  private: true },
  { key: 'long_service', label: 'Long service',        accrues: true,  private: false },
  { key: 'unpaid',       label: 'Unpaid',              accrues: false, private: false },
  { key: 'til',          label: 'Time in lieu',        accrues: true,  private: false },
  { key: 'rdo',          label: 'RDO',                 accrues: true,  private: false },
  { key: 'compassionate', label: 'Compassionate',      accrues: false, private: true },
  { key: 'fdv',          label: 'Family and domestic violence', accrues: false, private: true },
];

export const kindByKey = (key: string): Kind | undefined => KINDS.find(k => k.key === key);

/* ─────────────────────────────────────────────────────────────────────────────
 * What anybody else is allowed to see
 * ───────────────────────────────────────────────────────────────────────────── */

export type Viewer = 'self' | 'approver' | 'payroll' | 'anyone';

/**
 * What this leave is called, to this viewer.
 *
 * The single place the confidentiality rule lives, so it cannot be right in ten screens and wrong
 * in the eleventh. Anyone who is not the person, their approver or payroll sees the word "Leave"
 * and nothing else — which is all a roster needs in order to be a roster.
 */
export function labelFor(kind: LeaveKind, viewer: Viewer): string {
  const k = kindByKey(kind);
  if (!k) return 'Leave';
  if (!k.private) return k.label;
  if (viewer === 'anyone') return 'Leave';
  return k.label;
}

/** Whether the reason behind a request may be read at all. */
export const mayReadReason = (kind: LeaveKind, viewer: Viewer): boolean =>
  !kindByKey(kind)?.private || viewer !== 'anyone';

/* ─────────────────────────────────────────────────────────────────────────────
 * Balances
 * ───────────────────────────────────────────────────────────────────────────── */

export interface Balance {
  kind: LeaveKind;
  /** Hours, not days: a nine-day fortnight makes "days" a number two people can disagree about. */
  hours: number;
}

export const balanceOf = (balances: readonly Balance[], kind: LeaveKind): number =>
  balances.find(b => b.kind === kind)?.hours ?? 0;

export interface Request {
  id: string;
  who: string;
  kind: LeaveKind;
  from: string;
  to: string;
  hours: number;
  reason: string;
  state: 'asked' | 'approved' | 'declined';
  /** Set when a manager deliberately allowed it past the balance. */
  overrideBy: string | null;
}

export type Verdict = 'within' | 'over' | 'not_tracked';

export interface Check {
  verdict: Verdict;
  balance: number;
  short: number;
  /** Whether this can go through on the direct leader's say-so alone. */
  leaderAlone: boolean;
  says: string;
}

/**
 * Does this request fit?
 *
 * `not_tracked` for unpaid, compassionate and FDV: they do not draw down a balance, so there is
 * nothing to be over. Treating them as "within" would be arithmetic that happens to give the right
 * answer, and would quietly start refusing FDV leave the day somebody gave it a balance of zero.
 */
export function check(req: Pick<Request, 'kind' | 'hours'>, balances: readonly Balance[]): Check {
  const kind = kindByKey(req.kind);
  if (!kind?.accrues) {
    return {
      verdict: 'not_tracked', balance: 0, short: 0, leaderAlone: true,
      says: `${kind?.label ?? 'This leave'} does not come out of a balance, so there is nothing to check.`,
    };
  }
  const balance = balanceOf(balances, req.kind);
  if (req.hours <= balance) {
    return {
      verdict: 'within', balance, short: 0, leaderAlone: true,
      says: `${req.hours} hours against ${balance} in the bank.`,
    };
  }
  const short = req.hours - balance;
  return {
    verdict: 'over', balance, short, leaderAlone: false,
    says: `${req.hours} hours against ${balance} in the bank — ${short} more than they have. This is leave in advance, which a manager can allow, and the owner is told when they do.`,
  };
}

/** Who has to say yes. The direct leader, unless it is over — then a manager, deliberately. */
export const approverFor = (c: Check): 'leader' | 'manager' =>
  c.leaderAlone ? 'leader' : 'manager';

export const OWNER_IS_TOLD =
  'Leave in advance is allowed and it is not automatic. A manager has to choose it, and the owner is told it happened — not to second-guess anybody, but because money going out before it is earned is the owner’s to know about.';

/* ─────────────────────────────────────────────────────────────────────────────
 * What it does to the week
 * ───────────────────────────────────────────────────────────────────────────── */

export interface CrewWarning {
  /** The days that would be short, and by how many people. */
  days: { day: string; booked: number; available: number }[];
  says: string | null;
}

/**
 * Does approving this leave anybody short?
 *
 * A WARNING and never a block. The schedule is a plan and the leave is a person's life; a system
 * that refuses leave because of a booking has decided which of those matters more, and it has
 * decided wrong. What it can usefully do is make sure nobody finds out on the morning.
 */
export function crewWarning(
  days: readonly { day: string; booked: number; available: number }[],
  hoursOff: number,
): CrewWarning {
  const short = days.filter(d => d.available - 1 < d.booked);
  if (hoursOff <= 0 || short.length === 0) return { days: [], says: null };
  const first = short[0];
  return {
    days: [...short],
    says: short.length === 1
      ? `${first.day} would be a person short — ${first.booked} booked and ${first.available - 1} available. Worth moving something before you say yes.`
      : `${short.length} days would be short, starting ${first.day}. Worth moving something before you say yes.`,
  };
}

export function requestLine(req: Request, c: Check, viewer: Viewer): string {
  const what = labelFor(req.kind, viewer);
  const when = req.from === req.to ? req.from : `${req.from} to ${req.to}`;
  if (req.state === 'approved') {
    return req.overrideBy
      ? `${what}, ${when}. Approved in advance by ${req.overrideBy}.`
      : `${what}, ${when}. Approved.`;
  }
  if (req.state === 'declined') return `${what}, ${when}. Declined.`;
  return `${what}, ${when}. ${c.says}`;
}
