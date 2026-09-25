/**
 * Who may see which money, and the sign-in nobody may turn off.
 *
 * ── Kris, 25 September ───────────────────────────────────────────────────────────────────────────
 *
 * *"two-step sign-in for EVERYONE; owners, managers and anyone with pay access cannot turn it off.
 * Money visibility by role: Owner everything; GM everything except the owner's pay; Head of
 * Commercial all money and pay; Managers their team's jobs and costs; Supervisors their jobs' hours
 * and materials; Techs their own pay only."*
 *
 * ── Why the GM cannot see the owner's pay ────────────────────────────────────────────────────────
 *
 * The one rule in this list that looks arbitrary and is not. Everywhere else, seeing more is a
 * function of carrying more — the Head of Commercial sees all pay because they run the pay run.
 * The owner's own pay is different: it is the one number in a business that has no oversight above
 * it, and a GM who can read it is a GM who knows what their own ceiling is and what the owner took
 * out last quarter. Businesses have been broken by that being visible, and nothing is gained by it.
 *
 * ── Two-step is not optional for the people who could turn it off ────────────────────────────────
 *
 * Which is the whole point. The accounts worth attacking are exactly the ones that can approve a
 * pay run or read the customer list, and those are the accounts whose owners are busiest and most
 * likely to switch it off. So `mayTurnOff` is false for them and there is no override — an
 * "are you sure" on this is a dialog somebody clicks through on a Tuesday.
 */
import type { Seat } from './sight';

/** The seats money is read by. Finer than `lib/sight`'s three, because money is. */
export type MoneySeat =
  | 'owner' | 'gm' | 'commercial' | 'manager' | 'supervisor' | 'tech';

export interface SeatKind {
  key: MoneySeat;
  label: string;
  /** What they can see, in the business's words. */
  sees: string;
}

export const MONEY_SEATS: SeatKind[] = [
  { key: 'owner', label: 'Owner', sees: 'Everything.' },
  { key: 'gm', label: 'General manager', sees: 'Everything except the owner’s own pay.' },
  { key: 'commercial', label: 'Head of Commercial', sees: 'All money and all pay — they run the pay run.' },
  { key: 'manager', label: 'Manager', sees: 'Their own team’s jobs and what those jobs cost.' },
  { key: 'supervisor', label: 'Supervisor', sees: 'Hours and materials on their own jobs.' },
  { key: 'tech', label: 'Technician', sees: 'Their own pay, and nothing else about money.' },
];

export const seatKind = (key: MoneySeat): SeatKind => MONEY_SEATS.find(s => s.key === key)!;

/** The kinds of money a screen can show. */
export type MoneyKind =
  | 'own_pay'          // this person's own payslip
  | 'team_pay'         // what other people are paid
  | 'owner_pay'        // what the owner takes
  | 'job_hours'        // hours on a job
  | 'job_cost'         // what a job cost to do
  | 'job_margin'       // what it made
  | 'whole_position'   // cash, debtors, the business's numbers
  | 'customers';       // the client list and what they are worth

/**
 * The table, written out rather than derived from a hierarchy.
 *
 * Deliberately explicit. A rank-based rule — "everybody above level 3 sees costs" — reads as
 * elegant and then quietly grants something the day somebody's level changes. Every cell here was
 * decided, and a new kind of money added to the type forces every seat to be considered.
 */
const SEES: Record<MoneySeat, readonly MoneyKind[]> = {
  owner: ['own_pay', 'team_pay', 'owner_pay', 'job_hours', 'job_cost', 'job_margin', 'whole_position', 'customers'],
  gm: ['own_pay', 'team_pay', 'job_hours', 'job_cost', 'job_margin', 'whole_position', 'customers'],
  commercial: ['own_pay', 'team_pay', 'owner_pay', 'job_hours', 'job_cost', 'job_margin', 'whole_position', 'customers'],
  manager: ['own_pay', 'job_hours', 'job_cost'],
  supervisor: ['own_pay', 'job_hours', 'job_cost'],
  tech: ['own_pay'],
};

export const maySee = (seat: MoneySeat, kind: MoneyKind): boolean =>
  SEES[seat].includes(kind);

/**
 * A manager and a supervisor see the same KINDS and not the same rows.
 *
 * Worth stating in code rather than leaving to each screen: the difference between them is scope,
 * not category, and a screen that filters by seat without also filtering by whose jobs they are has
 * given a supervisor the whole business's costs.
 */
export const scopedToTheirOwn = (seat: MoneySeat): boolean =>
  seat === 'manager' || seat === 'supervisor';

export function whyNotMoney(seat: MoneySeat, kind: MoneyKind): string | null {
  if (maySee(seat, kind)) return null;
  if (kind === 'owner_pay') {
    return 'What the owner takes out is the one number with nobody above it, and it stays with the owner and the seat that runs the pay.';
  }
  if (kind === 'own_pay') return null;
  return `${seatKind(seat).label} sees ${seatKind(seat).sees.toLowerCase()}`;
}

/** Map `lib/sight`'s three seats onto these six, for screens that only know the coarse one. */
export function fromSeat(seat: Seat): MoneySeat {
  if (seat === 'leadership') return 'owner';
  if (seat === 'subcontractor') return 'tech';
  return 'tech';
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Two-step sign-in
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Whether this seat may turn two-step off.
 *
 * Nobody with pay access, and nobody who manages. Those are the accounts worth attacking and the
 * accounts whose holders are busiest — which is exactly the combination that gets it switched off
 * on a Tuesday morning.
 */
export function mayTurnOffTwoStep(seat: MoneySeat): boolean {
  return !(['owner', 'gm', 'commercial', 'manager'] as MoneySeat[]).includes(seat);
}

export const TWO_STEP_FOR_EVERYONE =
  'Two-step sign-in is on for everybody. Owners, managers and anybody who can see pay cannot turn it off — those are the accounts worth attacking, and they belong to the people most likely to switch it off when they are busy.';

export interface TwoStep {
  on: boolean;
  /** How they do the second step. */
  method: 'app' | 'sms' | null;
}

export function twoStepReading(seat: MoneySeat, state: TwoStep): { ok: boolean; says: string } {
  if (state.on) {
    return { ok: true, says: `On, by ${state.method === 'sms' ? 'text message' : 'an authenticator app'}.` };
  }
  if (!mayTurnOffTwoStep(seat)) {
    return {
      ok: false,
      says: `Not set up yet, and this seat cannot go without it. ${seatKind(seat).label} can reach pay or money, so the second step is required before the account is used again.`,
    };
  }
  return { ok: false, says: 'Not set up. Worth doing — it takes a minute and it is the single biggest thing protecting the account.' };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Your data is yours
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * The benchmark opt-in.
 *
 * Default OFF, and it stays off until somebody deliberately turns it on. Written as a constant
 * rather than a default parameter so there is nowhere for it to be accidentally inverted.
 */
export const BENCHMARKS_DEFAULT_ON = false;

export const DATA_IS_YOURS =
  'The business owns its data, always. SPEC uses it for anonymised industry benchmarks only if you turn that on — it is off until you do, and names, customers and prices are never shared either way.';

export const STORED_IN_AUSTRALIA =
  'Your data is stored in Australia. Encrypted backups may be held overseas, which is said here rather than left in a policy document nobody opens.';

/** What "export everything" actually contains. Named, because a promise is not a list. */
export const EXPORT_INCLUDES = [
  'Jobs, with their quotes, costs, photos and sign-offs',
  'Customers and everything recorded against them',
  'People, their roles, licences and training',
  'Pay runs and timesheets',
  'Safety: incidents, pre-starts, Take 5s, SWMS',
  'Compliance: licences, certificates and obligations',
  'Money: invoices, claims, retentions and what is owed',
  'Every document uploaded',
] as const;

/**
 * Who may export everything.
 *
 * Owner only, and not the Head of Commercial despite them seeing all money. An export is the whole
 * business in a file, and the question it answers is not "may this person see it" but "may this
 * person WALK OUT WITH IT". Those are different questions and only one seat answers yes.
 */
export const mayExportEverything = (seat: MoneySeat): boolean => seat === 'owner';

export const WHY_OWNER_ONLY =
  'An export is the whole business in one file. The question is not who may look at it — it is who may walk out with it, and that is the owner.';
