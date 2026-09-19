import type { Pillar } from './scoring';

/**
 * The org chart's own rules — seats, KPI readiness, and when the month has to be signed off.
 *
 * Design 15, 19 September, and Kris: *"now do the org chart"*. Pure, so every rule here can be
 * argued with in a test rather than found on a screen.
 *
 * ── The minimum, owned in one place ─────────────────────────────────────────────────────────────
 *
 * Two KPIs per pillar is not a new rule. `lib/period` has enforced it since the first month was
 * opened — a business with fewer has nothing worth scoring — and the design calls the same number
 * `MIN_KPIS`. It is exported from here and used there, rather than written down twice, because two
 * copies of a threshold is how a chart goes green against a month that will not open.
 */

/** SPEC's minimum before a pillar can be scored at all. */
export const MIN_KPIS = 2;

/* ─────────────────────────────────────────────────────────────────────────────
 * Which seat a card is
 * ───────────────────────────────────────────────────────────────────────────── */

export type SeatKind = 'leadership' | 'team';

/**
 * Titles that say somebody leads people, straight from the design.
 *
 * "head of" is in there because a Head of Operations leads whether or not anybody has drawn their
 * team yet, and half of SPEC's own seeded charts are exactly that.
 */
export const LEADER_TITLE = /leader|supervisor|manager|director|head of/i;

/**
 * Which seat a role is on.
 *
 * ── Why this is BOTH signals, where the design uses one ─────────────────────────────────────────
 *
 * The design decides by title. `lib/pricing` decided by the chart — whether anybody reports to you
 * — because a title is what a business calls a person and the chart is what they actually do.
 *
 * Both are wrong on their own, in opposite directions, and both are gameable:
 *
 *   By title alone, a business renames its way to cheaper seats.
 *   By the chart alone, a Site Supervisor whose crew has not been drawn yet is billed as somebody
 *   who is led, which is wrong on the day they are hired and wrong for as long as it takes.
 *
 * So it is either: a role leads if somebody reports to it **or** its title says it does. That is
 * harder to move in the cheap direction — dropping your reports does not help if you are still
 * called a supervisor, and renaming does not help if people report to you — and it never
 * under-bills a leader. A manager with nobody under them yet is still a manager.
 */
export const seatKindFor = (role: { title: string; hasDirectReports: boolean }): SeatKind =>
  (role.hasDirectReports || LEADER_TITLE.test(role.title) ? 'leadership' : 'team');

/**
 * What the card says about its seat.
 *
 * The certified mark is only ever shown on a leadership seat with somebody actually in it. A tick
 * against an empty chair would be certifying a vacancy, which is nothing.
 */
export function seatBadges(role: {
  title: string; hasDirectReports: boolean; filled: boolean; certified: boolean;
}): string[] {
  const kind = seatKindFor(role);
  const badges: string[] = [kind === 'leadership' ? 'Leadership seat' : 'Team seat'];
  if (kind === 'leadership' && role.certified && role.filled) badges.push('✓ SPEC Certified');
  return badges;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Is this pillar ready to be scored?
 * ───────────────────────────────────────────────────────────────────────────── */

export type Readiness = 'ready' | 'short';

/**
 * A dot per pillar: green once the pillar has SPEC's minimum, red until.
 *
 * Red rather than amber on purpose. A pillar one KPI short is not "nearly there" — the month will
 * not open on it, so the honest colour is the one that means *this stops something*.
 */
export const pillarReadiness = (kpiCount: number): Readiness =>
  (kpiCount >= MIN_KPIS ? 'ready' : 'short');

/** What is still missing, said in the words a person would use. */
export function readinessLine(counts: Record<Pillar, number>): string {
  const short = (Object.entries(counts) as [Pillar, number][])
    .filter(([, n]) => n < MIN_KPIS)
    .map(([p]) => p);
  if (!short.length) return `Every pillar has its ${MIN_KPIS}. This role can be scored.`;
  return `${short.join(', ')} ${short.length === 1 ? 'is' : 'are'} short of ${MIN_KPIS} KPIs, so this role cannot be scored yet.`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * When the month has to be signed off
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * The first Wednesday of next month.
 *
 * The design computes this on the client as a placeholder and says *"Code should drive from the
 * real lock schedule"*. It is here rather than in a component so the banner and whatever eventually
 * locks the month read the same function — a deadline printed by one rule and enforced by another
 * is a deadline nobody believes twice.
 */
export function firstWednesdayNextMonth(now: Date = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  while (d.getDay() !== 3) d.setDate(d.getDate() + 1);
  return d;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export const monthName = (d: Date): string => `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

export interface Cadence {
  /** The month being scored, as a person says it. */
  scoringMonth: string;
  /** The day it has to be signed off by. */
  deadline: string;
  /** Days left, which is the part that changes behaviour. Negative once it is overdue. */
  daysLeft: number;
  overdue: boolean;
}

export function cadence(now: Date = new Date()): Cadence {
  const due = firstWednesdayNextMonth(now);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysLeft = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  return {
    scoringMonth: monthName(now),
    deadline: `${MONTHS[due.getMonth()]} ${due.getDate()}`,
    daysLeft,
    overdue: daysLeft < 0,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Adding a KPI
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * What SPEC offers as an example, by the kind of seat it is.
 *
 * Straight from the design, and the split is the point: a supervisor is measured on what their team
 * did, an electrician on what they did. Offering "Gross profit margin at 40%" to somebody who
 * cannot see a margin teaches them that SPEC is not about their job.
 */
export const KPI_EXAMPLES: Record<SeatKind, Record<Pillar, string[]>> = {
  leadership: {
    safety: ['Zero lost-time injuries across the team', 'Toolbox talks completed 100% of weeks',
      'Near-miss reports closed within 48 hours', 'Site audits passed with no repeat findings'],
    people: ['Staff turnover under 10%', '100% of 1:1s held this month',
      'Training completion at 100% across the team', 'Apprentice retention through probation'],
    earnings: ['Gross profit margin at 40%', 'Billable hours above 86% across the team',
      'Quotes turned around within 48 hours', 'Debtor days under 30'],
    compliance: ['Audit pass rate at 100%', 'Licences and tickets current across the team',
      'Job packs signed off before close-out', 'Compliance register up to date'],
  },
  team: {
    safety: ['Zero lost-time injuries this month', 'PPE worn on every job',
      'Vehicle safety check completed weekly', 'No unreported near misses'],
    people: ['Attend every toolbox talk', 'Complete assigned training modules on time',
      'No unexplained absences', 'Turn up on time, every day'],
    earnings: ['Billable hours above 86%', 'Jobs completed within quoted time',
      'Timesheets submitted same day', 'No comebacks on completed jobs'],
    compliance: ['Vehicle checklist completed every week', 'Ticket and licence kept current',
      'Job pack filled out correctly', 'Follow the checklist on every job'],
  },
};

/** The examples worth offering: this seat's, for this pillar, minus the ones already there. */
export function kpiSuggestions(kind: SeatKind, pillar: Pillar, already: readonly string[]): string[] {
  const taken = new Set(already.map(t => t.trim().toLowerCase()));
  return KPI_EXAMPLES[kind][pillar].filter(e => !taken.has(e.trim().toLowerCase()));
}

export type KpiAdded =
  | { ok: true; text: string }
  | { ok: false; reason: string };

/**
 * Whether a typed KPI can be added.
 *
 * Case-insensitive on duplicates, because "PPE worn on every job" and "PPE Worn On Every Job" are
 * the same measure and a pillar carrying both is a pillar that looks ready and is not — it would
 * pass the count of two on one real KPI.
 */
export function addKpi(raw: string, existing: readonly string[]): KpiAdded {
  const text = raw.trim().replace(/\s+/g, ' ');
  if (!text) return { ok: false, reason: 'A KPI needs some words.' };
  if (text.length > 120) return { ok: false, reason: 'That is too long for a card. Say it in a line.' };
  if (existing.some(e => e.trim().toLowerCase() === text.toLowerCase())) {
    return { ok: false, reason: 'That measure is already on this pillar.' };
  }
  return { ok: true, text };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Who may put a number on a pillar
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Scoring is not the same right as adding a KPI.
 *
 * The design gates the PERCENTAGE behind being the direct manager, or an Administrator / SPEC
 * Certified toggle, and says *"Code should replace both with real auth"*. This is that: the
 * manager the role reports to, or an administrator. Adding a KPI stays open to anybody who can
 * shape the chart — deciding what a role is measured on is a conversation, and putting the number
 * on it is a judgement about a person.
 *
 * Nobody scores their own card. That is the rule the whole product is sold on and it is the one
 * place a toggle in a prototype would have quietly become a way around it.
 */
export function mayScore(opts: {
  scorerRoleId: string | null;
  roleReportsTo: string | null;
  roleId: string;
  isAdministrator: boolean;
}): boolean {
  if (opts.scorerRoleId && opts.scorerRoleId === opts.roleId) return false;
  if (opts.isAdministrator) return true;
  return Boolean(opts.scorerRoleId) && opts.scorerRoleId === opts.roleReportsTo;
}
