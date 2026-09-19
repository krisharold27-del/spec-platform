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
 * Teams
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * A team node holds several people and one shared scorecard between them.
 *
 * Design 15: "Technicians" and "Apprentices" hanging under a Site Supervisor, each with a pool of
 * names and one set of S/P/E/C for the group. The design seeds the name with a `window.prompt`
 * defaulting to "Team"; here it is typed into the chart, and an empty box means the same thing.
 */
export const TEAM_DEFAULT_NAME = 'Team';

/** What the design offers as examples of a team name, in its own words. */
export const TEAM_NAME_EXAMPLES = ['Technicians', 'Apprentices', 'Installers', 'Service crew'];

export type Named =
  | { ok: true; text: string }
  | { ok: false; reason: string };

/** A team's name. Falls back rather than refusing: an unnamed team is still a real team. */
export function teamName(raw: string): string {
  const text = raw.trim().replace(/\s+/g, ' ').slice(0, 80);
  return text || TEAM_DEFAULT_NAME;
}

/**
 * Somebody joining a team.
 *
 * Refuses a duplicate in any case, for the same reason `addKpi` does: two "Dave Morgan"s in one
 * crew is a team that reads as six and is five, and a shared score divided by the wrong number is
 * wrong for everybody in it.
 */
export function addMember(raw: string, existing: readonly string[]): Named {
  const text = raw.trim().replace(/\s+/g, ' ');
  if (!text) return { ok: false, reason: 'A name, so the team knows who is in it.' };
  if (text.length > 120) return { ok: false, reason: 'That is too long for a name.' };
  if (existing.some(e => e.trim().toLowerCase() === text.toLowerCase())) {
    return { ok: false, reason: 'They are already in this team.' };
  }
  return { ok: true, text };
}

/** "3 members", the way the design's card prints it. */
export const memberLine = (n: number): string => `${n} ${n === 1 ? 'member' : 'members'}`;

/**
 * May a team node hang here?
 *
 * Under a role, never under another team. A team of teams has nobody accountable for it: the shared
 * score would belong to a group whose members are themselves groups, and there is no person at the
 * end of it to have the conversation with. The design only ever draws one under a leader.
 */
export function mayHoldTeam(parent: { isTeam: boolean } | null | undefined): Named {
  if (!parent) return { ok: false, reason: 'A team has to sit under the role that leads it.' };
  if (parent.isTeam) return { ok: false, reason: 'A team cannot sit under another team — put it under the role that leads them both.' };
  return { ok: true, text: 'ok' };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Who may put a number on a pillar — and why there is no such function here
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * There was one, called `mayScore`: the direct manager or an administrator, and nobody scores their
 * own card. It had five tests and **no callers**, and it is deleted rather than kept, because a
 * rule nobody calls is not a safeguard — it is a safeguard-shaped thing that makes a reader stop
 * looking for the real one.
 *
 * It was written for a control this product does not have. Design 15 draws a numeric box on every
 * pillar card and types a percentage straight into it, with "Only {leaderName} can set this"
 * underneath — so the design needs a rule about who may type. SPEC has no such box and must not
 * grow one: a score here is what the KPI results add up to, and a control that set it directly
 * would make every number the board reads a matter of opinion. That is the one thing in this design
 * that will not be built.
 *
 * What SPEC does instead, and where the equivalent rule really lives:
 *
 *   `/scoring` marks RESULTS against a role's KPIs, inside `scope.canEdit` — your own branch.
 *   The month is then submitted, signed off up the chain and locked (see `signoffTrail`), which is
 *   the check on a person marking their own month. It is a different shape from the design's gate
 *   and it is enforced in code that runs, which the deleted function was not.
 * ───────────────────────────────────────────────────────────────────────────── */
