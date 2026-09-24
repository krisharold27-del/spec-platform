/**
 * Compliance — do what we say, and prove it.
 *
 * Kris's design of 24 September: *"Every licence, policy, certificate, contract and audit in one
 * place. SPEC warns before anything lapses, and anything that lapses stops the work it covers."*
 *
 * ── What this page is NOT ────────────────────────────────────────────────────────────────────────
 *
 * It is not a sixth register. Two of its six areas are things SPEC already holds, and they are READ
 * here rather than copied:
 *
 *   · **Licences and tickets** are `obligations` — the same rows that gate Clear to Work on People.
 *   · **Breaches and corrective actions** are the actions already raised against safety reports.
 *
 * Only the four genuinely new areas get storage: insurance and registrations, certificates of
 * compliance, audits and inspections, and contracts and the award. That is the same rule the safety
 * register was built on — one copy of an answer, because the day two copies disagree nobody
 * believes either.
 */

import { EXPIRING_WITHIN_DAYS, daysUntil } from './obligations';

/* ─────────────────────────────────────────────────────────────────────────────
 * The six areas
 * ───────────────────────────────────────────────────────────────────────────── */

export type ComplianceArea =
  | 'licences' | 'insurance' | 'certificates' | 'audits' | 'contracts' | 'breaches';

export interface AreaSpec {
  key: ComplianceArea;
  /** The tab. */
  label: string;
  /** The heading, in full. */
  title: string;
  blurb: string;
  /** The measure it feeds, named by the measure and never by a system. */
  feeds: string;
  /** True when SPEC already holds this somewhere else and this page only reads it. */
  readOnly: boolean;
}

export const AREAS: AreaSpec[] = [
  {
    key: 'licences', label: 'Licences & tickets', title: 'Licences and tickets',
    blurb: 'Every person and every subcontractor. Warned well before it lapses. Anyone not current cannot be booked on a job.',
    feeds: 'Compliance · Licences current', readOnly: true,
  },
  {
    key: 'insurance', label: 'Insurance', title: 'Insurance and registrations',
    blurb: 'Your own policies, every subcontractor’s cover and every vehicle’s registration. A lapsed policy is a contract breach waiting to happen.',
    feeds: 'Compliance · Insurance and contract compliance', readOnly: false,
  },
  {
    key: 'certificates', label: 'Certificates', title: 'Certificates of compliance',
    blurb: 'Filled in from the job at sign-off, with the test results. Sent to the customer and lodged on time.',
    feeds: 'Compliance · Audit pass rate', readOnly: false,
  },
  {
    key: 'audits', label: 'Audits', title: 'Audits and inspections',
    blurb: 'Site inspections, internal audits and anything a client or regulator asks for. Findings become corrective actions with an owner.',
    feeds: 'Compliance · Audit pass rate', readOnly: false,
  },
  {
    key: 'contracts', label: 'Contracts & award', title: 'Contracts, pay and the award',
    blurb: 'Every employment contract signed, every subcontract current, every pay run checked against the award before it goes.',
    feeds: 'Compliance · Regulatory breaches', readOnly: false,
  },
  {
    key: 'breaches', label: 'Breaches & actions', title: 'Breaches and corrective actions',
    blurb: 'Zero breaches is the standard. Anything that goes wrong gets an owner, a date and a fix, and goes to the weekly meeting until it is closed.',
    feeds: 'Compliance · Zero regulatory breaches', readOnly: true,
  },
];

export const isComplianceArea = (v: string): v is ComplianceArea =>
  AREAS.some(a => a.key === v);

export const areaSpec = (key: ComplianceArea): AreaSpec =>
  AREAS.find(a => a.key === key)!;

/** The four areas this page stores itself. The other two are read from where they already live. */
export const STORED_AREAS = AREAS.filter(a => !a.readOnly).map(a => a.key);

/* ─────────────────────────────────────────────────────────────────────────────
 * How long a warning is worth
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * How far ahead a licence or ticket expiry is said out loud.
 *
 * ── Sixty, not thirty, and this was a real disagreement ──────────────────────────────────────────
 *
 * `obligations` warns at **30** days, with the reasoning *"a month is enough to renew most
 * things."* That is true of most things and not of the ones on this page. Kris's design says
 * **"Warned 60 days out"**, and the 24 September handoff says it twice more — *"60-day warnings,
 * not current = can't be booked"*.
 *
 * He is right, and the reason is on the screen itself: an expiry here does not merely lapse, it
 * **stops the work**. Somebody whose electrical licence runs out cannot be booked on a job, so a
 * renewal that takes six weeks against a thirty-day warning is a fortnight of a person who cannot
 * be sent anywhere. The cost of warning early is one extra line on a screen; the cost of warning
 * late is a crew short on a Monday.
 *
 * So Compliance warns at 60. `obligations` keeps 30 for the Clear to Work gate, because that gate
 * answers a different question — "can this person work today" — and widening it would turn things
 * that are fine into things that look broken.
 */
export const WARN_BEFORE_DAYS = 60;

/** Kept so the difference above is visible in one place rather than inferred. */
export const CLEAR_TO_WORK_WARNS_AT = EXPIRING_WITHIN_DAYS;

export type ItemState = 'current' | 'expiring' | 'lapsed' | 'missing';

export const STATE_LABEL: Record<ItemState, string> = {
  current: 'Current',
  expiring: 'Expiring',
  lapsed: 'Stopping work',
  missing: 'Not recorded',
};

/**
 * Where an item stands.
 *
 * `missing` rather than `current` when there is no date: a policy nobody has recorded an expiry for
 * is not a policy anybody can say is in force, and reading it as fine is how a business discovers
 * its public liability lapsed in March.
 */
export function stateOf(
  item: { expiresAt: string | null; satisfiedAt?: string | null },
  at: Date = new Date(),
): ItemState {
  if (item.satisfiedAt) return 'current';
  if (!item.expiresAt) return 'missing';
  const days = daysUntil(item.expiresAt, at);
  if (days < 0) return 'lapsed';
  return days <= WARN_BEFORE_DAYS ? 'expiring' : 'current';
}

/**
 * Does this stop work?
 *
 * The sentence the whole page turns on — *"anything that lapses stops the work it covers."* Missing
 * counts, for the reason above: an unrecorded policy is not evidence of cover.
 */
export const stopsWork = (state: ItemState): boolean =>
  state === 'lapsed' || state === 'missing';

/** How the row reads, in the business's own words rather than a status name. */
export function stateNote(item: { expiresAt: string | null }, at: Date = new Date()): string {
  if (!item.expiresAt) return 'No expiry recorded — SPEC cannot say this is in force';
  const days = daysUntil(item.expiresAt, at);
  if (days < 0) return `Lapsed ${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} ago`;
  if (days === 0) return 'Expires today';
  return `${days} ${days === 1 ? 'day' : 'days'} left`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The four numbers across the top
 * ───────────────────────────────────────────────────────────────────────────── */

export interface ComplianceStats {
  current: number;
  total: number;
  expiringSoon: number;
  stoppingWork: number;
  breachesThisYear: number;
}

export function complianceStats(
  items: readonly { expiresAt: string | null; satisfiedAt?: string | null }[],
  breachesThisYear: number,
  at: Date = new Date(),
): ComplianceStats {
  const states = items.map(i => stateOf(i, at));
  return {
    current: states.filter(s => s === 'current').length,
    total: states.length,
    expiringSoon: states.filter(s => s === 'expiring').length,
    stoppingWork: states.filter(s => stopsWork(s)).length,
    breachesThisYear,
  };
}

/**
 * Worst first, then soonest.
 *
 * A list of compliance items in the order they were entered is a list nobody reads twice. The thing
 * that stops work today belongs above the thing that lapses in seven weeks.
 */
const RANK: Record<ItemState, number> = { lapsed: 0, missing: 1, expiring: 2, current: 3 };

export function byUrgency<T extends { expiresAt: string | null; satisfiedAt?: string | null }>(
  items: readonly T[],
  at: Date = new Date(),
): T[] {
  return [...items].sort((a, b) => {
    const d = RANK[stateOf(a, at)] - RANK[stateOf(b, at)];
    if (d !== 0) return d;
    // Within a band: soonest first, and anything with no date after anything that has one.
    if (!a.expiresAt) return 1;
    if (!b.expiresAt) return -1;
    return a.expiresAt.localeCompare(b.expiresAt);
  });
}

/**
 * The headline sentence, which must never congratulate a business that has not recorded anything.
 *
 * An empty Compliance page scores "0 stopping work, 0 breaches", which reads as a clean bill of
 * health and is actually a business that has told SPEC nothing. That is the single most misleading
 * thing this page could say, so it says the opposite.
 */
export function headline(stats: ComplianceStats): string {
  if (stats.total === 0) {
    return 'Nothing recorded yet. This page cannot tell you that you are compliant — only that nobody has written anything down.';
  }
  if (stats.stoppingWork > 0) {
    return `${stats.stoppingWork} ${stats.stoppingWork === 1 ? 'thing is' : 'things are'} stopping work right now.`;
  }
  if (stats.expiringSoon > 0) {
    return `Nothing is stopping work. ${stats.expiringSoon} ${stats.expiringSoon === 1 ? 'thing needs' : 'things need'} renewing in the next ${WARN_BEFORE_DAYS} days.`;
  }
  return 'Everything recorded is current.';
}
