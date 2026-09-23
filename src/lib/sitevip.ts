/**
 * siteVIP — the trades edition of SPEC — as the public front door at `/`.
 *
 * Built to designs/siteVIP Landing.dc.html (23 September 2026). The full SPEC front door, with the
 * problem box and the pricing, moved to `/spec` the same day and is linked from this page.
 *
 * Pure: the words and the little bits of logic the page runs on, so they are tested directly.
 *
 * ── Categories, never vendors ──────────────────────────────────────────────────────────────────
 *
 * The design names three products in its "keep what you have" list and one in the flow. The never
 * list in CLAUDE.md is plain that SPEC names no vendor in the UI — connectors are by category — so
 * every one of them is written here as the kind of system it is. A business on any product in that
 * category reads the same sentence and none of them is the odd one out.
 */

/** One job, start to finish, in one place — the seven steps of the flow strip. */
export const SITEVIP_FLOW: readonly { label: string; line: string }[] = [
  { label: 'Enquiry', line: 'Call, email or web form lands on one list' },
  { label: 'Quote', line: 'Build it from your price book, send it in minutes' },
  { label: 'Win', line: 'Client accepts online, the job is created' },
  { label: 'Schedule', line: 'Drag the crew on. Not clear to work? Can’t be booked' },
  { label: 'On site', line: 'Job card, photos, SWMS and sign-off on the phone' },
  { label: 'Cost', line: 'Hours and materials land on the job as they happen' },
  { label: 'Get paid', line: 'Invoice goes out, your accounting system is updated, debtors chased' },
];

export interface SiteVipSystem {
  /** The area of the business. */
  job: string;
  /** The "keep what you have" choice, named by category. */
  own: string;
  /** Most trade businesses already have their books somewhere, so that one starts on "keep". */
  defaultOwn?: boolean;
}

/** Your choice, system by system. */
export const SITEVIP_SYSTEMS: readonly SiteVipSystem[] = [
  { job: 'Jobs, quotes & scheduling', own: 'My job system' },
  { job: 'Accounting', own: 'My accounting', defaultOwn: true },
  { job: 'Customers & sales', own: 'My CRM' },
  { job: 'HR & safety', own: 'My own' },
  { job: 'Timesheets', own: 'My own' },
];

/** Which areas start on "keep what you have". */
export const defaultOwnSystems = (): Record<string, boolean> =>
  Object.fromEntries(SITEVIP_SYSTEMS.map(s => [s.job, !!s.defaultOwn]));

/** The line under the toggles, which answers "so how many screens am I working from?" */
export function systemsLine(own: Record<string, boolean>): string {
  const count = SITEVIP_SYSTEMS.filter(s => own[s.job]).length;
  if (count === 0) return 'Everything runs in siteVIP. Nothing to connect.';
  return `siteVIP runs the rest and talks to your ${count} connected system${count === 1 ? '' : 's'}, so you still work from one screen.`;
}

/** Everyone gets their own screen. */
export const SITEVIP_USERS: readonly { who: string; what: string }[] = [
  { who: 'Owner & GM:', what: 'the Power Meter, margin by job and cash coming in.' },
  { who: 'Office & estimators:', what: 'enquiries, quotes, the schedule and invoices.' },
  { who: 'Supervisors:', what: 'their crews, their jobs, their KPI board.' },
  { who: 'Techs & apprentices:', what: 'today’s jobs on their phone. Start, photo, sign off.' },
];

/**
 * Where "Start" goes, carrying the business name.
 *
 * The same sign-up the SPEC front door's problem box hands over to, and the same parameter, so the
 * name typed here is already in the box on the next screen rather than asked for twice. Blank is
 * simply not carried.
 */
export function startHref(business: string | null | undefined): string {
  const name = (business ?? '').trim().slice(0, 200);
  return name ? `/signup?business=${encodeURIComponent(name)}` : '/signup';
}
