/**
 * People's two newer tabs — Reviews & conduct, and Pay & exits. Pure functions, no I/O.
 *
 * `SPEC People.dc.html`, 23 September: SPEC is the HR system. The design adds a tab for reviews,
 * training records and warnings, and one for contracts, award checks, the payroll export and exits.
 *
 * The rule that shapes this file is the one the rest of People already keeps: **built from what
 * SPEC already holds.** A review is not a form, it is the last three months of the person's own KPI
 * board. A contract is not a blank template, it is drafted from the role on the org chart. An exit
 * is a placement that closed with nobody moving on to another role.
 *
 * And the one it adds: **nothing client-specific.** The award is the business's award — the one it
 * names — never one industry's written into the product (DECISIONS.md, 11 September: the generic
 * shape; never one client's vendors, awards or regulators). The payroll export goes to the business's
 * accounting system, named by category.
 */
import type { Pillar, Score } from './scoring';
import { light, type Light, LIGHT_LABEL } from './today';

/* ── The tabs ─────────────────────────────────────────────────────────────────────────────────── */

export type HrTab = 'have' | 'staff' | 'conduct' | 'pay' | 'hiring';

/**
 * The tabs, in the design's order — HR, Reviews & conduct, Pay & exits, Recruitment — with the
 * staff list beside HR.
 *
 * `mode` is the URL's word for each; `hiring` predates the other two and is kept so an existing
 * link to `/people?mode=hiring` still lands where it did.
 */
export const HR_TABS: { tab: HrTab; mode: string | null; label: string }[] = [
  { tab: 'have', mode: null, label: 'Who you have' },
  /*
    The whole business on one list (23 September) — see lib/directory. Second, beside "Who you have",
    because it is the same question asked of everybody rather than of the viewer's own line.
  */
  { tab: 'staff', mode: 'staff', label: 'Staff list' },
  { tab: 'conduct', mode: 'conduct', label: 'Reviews & conduct' },
  { tab: 'pay', mode: 'pay', label: 'Pay & exits' },
  { tab: 'hiring', mode: 'hiring', label: 'Who you need' },
];

/** Which tab a `?mode=` asks for. Anything unrecognised is the first tab, never an error. */
export const tabOf = (mode: string | undefined | null): HrTab =>
  HR_TABS.find(t => t.mode !== null && t.mode === mode)?.tab ?? 'have';

export const hrefOf = (tab: HrTab): string => {
  const mode = HR_TABS.find(t => t.tab === tab)?.mode;
  return mode ? `/people?mode=${mode}` : '/people';
};

/**
 * What each group feeds, in the Virtual GM Power Meter's own words — the design's "Feeds" line.
 *
 * Every one names a slot that exists in `lib/power-meter` or a pillar on the scorecard, so the line
 * is a pointer to a real number rather than a slogan.
 */
export const FEEDS = {
  reviews: 'People · Managers with a dev plan',
  training: 'People · Training completion',
  conduct: 'People · Negative staff turnover',
  contracts: 'Compliance · Contractual breach',
  award: 'Compliance · Regulatory breaches',
  payroll: 'Earnings · Labour cost',
  exits: 'People · Negative staff turnover',
} as const;

/* ── Reviews: the last three months of the KPI board ──────────────────────────────────────────── */

export interface MonthScore {
  /** YYYY-MM. */
  period: string;
  /** The role's overall score that month, 0–1. Null when nothing was marked Y or N. */
  score: Score;
  status: string;
}

/**
 * The three most recent months, oldest first — the order a person reads a trend in.
 *
 * Any status counts, the open month included: a review held on the 20th should see the month it is
 * held in, and an open month with nothing marked simply reads as "not marked" rather than as a zero.
 */
export function lastThree<T extends { period: string }>(periods: readonly T[]): T[] {
  return [...periods].sort((a, b) => b.period.localeCompare(a.period)).slice(0, 3).reverse();
}

export interface ReviewLine {
  /** "3 months: 91%, 88%, —" */
  line: string;
  light: Light;
  label: string;
}

const pctOf = (s: Score) => (s === null ? '—' : `${Math.round(s * 100)}%`);

/**
 * One person's review, read off their board.
 *
 * The light is the latest month that HAS a score — not an average, because a review is about where
 * somebody is now, and three months averaged hides the one that matters. A person with nothing
 * marked in any of the three is not measured yet, and pending is never red.
 */
export function reviewOf(months: readonly MonthScore[]): ReviewLine {
  if (!months.length) {
    return { line: 'No months on the board yet', light: 'pending', label: 'Not measured yet' };
  }
  const line = `${months.length} month${months.length === 1 ? '' : 's'}: ${months.map(m => pctOf(m.score)).join(', ')}`;
  const latest = [...months].reverse().find(m => m.score !== null);
  if (!latest) return { line, light: 'pending', label: 'Not measured yet' };
  const l = light(latest.score);
  return { line, light: l, label: LIGHT_LABEL[l] };
}

/* ── Training records ─────────────────────────────────────────────────────────────────────────── */

export type TrainingState = 'complete' | 'in_progress' | 'overdue' | 'not_started';

/**
 * A training record's pill.
 *
 * Overdue is the only red, because it is the only one that is a missed date rather than an absence;
 * a module nobody has started and nobody set a date for is not a failure by anybody.
 */
export function trainingPill(state: TrainingState): { light: Light; label: string } {
  switch (state) {
    case 'complete': return { light: 'green', label: 'Complete' };
    case 'in_progress': return { light: 'amber', label: 'In progress' };
    case 'overdue': return { light: 'red', label: 'Overdue' };
    default: return { light: 'pending', label: 'Not started' };
  }
}

export function trainingStateOf(progress: number | null, overdue: boolean): TrainingState {
  if (progress !== null && progress >= 100) return 'complete';
  if (overdue) return 'overdue';
  if (progress !== null && progress > 0) return 'in_progress';
  return 'not_started';
}

export interface ModuleLine {
  module: string;
  state: TrainingState;
  /** YYYY-MM-DD, where the path sets one. */
  due: string | null;
}

/**
 * One person's training record, in one row: how much of the path is done, and what is next.
 *
 * The pill is the worst thing on the path — an overdue module outranks everything, because it is the
 * one that fails Clear to Work. "Next" is the overdue one if there is one, otherwise the first
 * module not yet finished, in the path's own order.
 */
export function trainingSummary(lines: readonly ModuleLine[]): { sub: string; state: TrainingState } {
  const done = lines.filter(l => l.state === 'complete').length;
  const count = `${done} of ${lines.length} module${lines.length === 1 ? '' : 's'} complete`;
  const next = lines.find(l => l.state === 'overdue') ?? lines.find(l => l.state !== 'complete');
  const state: TrainingState = !next ? 'complete'
    : lines.some(l => l.state === 'overdue') ? 'overdue'
      : lines.some(l => l.state === 'in_progress') ? 'in_progress'
        : 'not_started';
  if (!next) return { sub: count, state };
  return { sub: `${count} · next: ${next.module}${next.due ? `, due ${next.due}` : ''}`, state };
}

/* ── Warnings: a fair process, one step at a time ─────────────────────────────────────────────── */

export interface ProcessStep {
  key: string;
  label: string;
  note: string;
}

/**
 * The five steps, in order. The design: "raise the concern, offer a support person, meet, give the
 * outcome in writing, set a review date. SPEC will not let a step be skipped."
 *
 * Written as procedural fairness rather than as one country's statute: which law applies is the
 * business's region, and the steps a fair process needs are the same in all of them.
 */
export const FAIR_PROCESS: ProcessStep[] = [
  { key: 'raise', label: 'Raise the concern', note: 'In writing, specific: what happened, when, and which expectation it fell short of.' },
  { key: 'support', label: 'Offer a support person', note: 'They may bring somebody with them. Offered before the meeting is booked, not at the door.' },
  { key: 'meet', label: 'Meet and hear their side', note: 'Their response is recorded in their words before anything is decided.' },
  { key: 'outcome', label: 'Give the outcome in writing', note: 'What was decided, why, and what happens if it recurs.' },
  { key: 'review', label: 'Set a review date', note: 'A date to check it has been put right — and to close it when it has.' },
];

/**
 * Whether a step may be taken, given how many are done. Only ever the next one: a step skipped is a
 * process a tribunal can unpick, and SPEC is the thing that will not let it happen by accident.
 */
export const mayTake = (stepIndex: number, done: number): boolean =>
  stepIndex === done && stepIndex >= 0 && stepIndex < FAIR_PROCESS.length;

export const stepLine = (done: number): string =>
  (done >= FAIR_PROCESS.length
    ? 'All five steps done'
    : `Step ${done + 1} of ${FAIR_PROCESS.length} · ${FAIR_PROCESS[done].label.toLowerCase()}`);

/* ── Contracts: drafted from the role on the chart ────────────────────────────────────────────── */

export interface ContractSource {
  roleTitle: string;
  businessName: string;
  reportsTo: string | null;
  person: string | null;
  /** The placement's start date, YYYY-MM-DD. */
  startDate: string | null;
  kpis: { pillar: Pillar; text: string }[];
}

/**
 * A first draft of the employment contract's role schedule, from the chart.
 *
 * SPEC proposes; the leader edits. What SPEC knows it writes — the title, who it reports to, the
 * start date, what the role is measured on. What it does not know — pay, the award and the level in
 * it, hours — it leaves marked for the business to fill, rather than inventing a number.
 */
export function draftContract(source: ContractSource): string {
  const { roleTitle, businessName, reportsTo, person, startDate, kpis } = source;
  const lines = [
    `Role schedule — ${roleTitle}, ${businessName}`,
    '',
    `Employee: ${person ?? '(nobody in the role yet)'}`,
    `Position: ${roleTitle}`,
    `Reports to: ${reportsTo ?? '(top of the chart)'}`,
    `Start date: ${startDate ?? '(to be agreed)'}`,
    'Award and level: (the business names its award and the level in it)',
    'Pay, hours and allowances: (set by the business, checked against its award)',
  ];
  if (kpis.length) {
    lines.push('', `Measured on (${kpis.length}):`);
    for (const k of kpis) lines.push(`  · ${k.text}`);
  }
  return lines.join('\n');
}

/* ── The award: checked against the business's own ────────────────────────────────────────────── */

/** What every pay run is checked for, against whichever award the business names. */
export const AWARD_CHECKS = ['Level', 'Base rate', 'Allowances', 'Overtime and penalties'] as const;

/* ── The payroll export: hours → the accounting system ────────────────────────────────────────── */

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The pay week that has just finished — Monday to Sunday — as dates. A pay run is always for a week
 * already worked, never the one in progress.
 */
export function lastPayWeek(now: Date): { from: string; to: string } {
  const day = (now.getUTCDay() + 6) % 7; // Monday = 0
  const thisMonday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
  const from = new Date(thisMonday.getTime() - 7 * 86_400_000);
  const to = new Date(thisMonday.getTime() - 86_400_000);
  return { from: iso(from), to: iso(to) };
}

/* ── Exits, and whether each was for the right reason ─────────────────────────────────────────── */

export type ExitVerdict = 'right' | 'wrong';

/**
 * Exit reasons, each marked right or wrong.
 *
 * Right-reason exits — retirement, a real step up, moving away — never count against the business.
 * Wrong-reason exits are the ones that feed negative turnover, the heavy hitter on the Power Meter.
 */
export const EXIT_REASONS: { key: string; label: string; verdict: ExitVerdict }[] = [
  { key: 'retired', label: 'Retired', verdict: 'right' },
  { key: 'step_up', label: 'A real step up elsewhere', verdict: 'right' },
  { key: 'moved', label: 'Moved away', verdict: 'right' },
  { key: 'study', label: 'Went to study', verdict: 'right' },
  { key: 'term_ended', label: 'Fixed term finished', verdict: 'right' },
  { key: 'unsupported', label: 'Felt unsupported', verdict: 'wrong' },
  { key: 'manager', label: 'Left because of their manager', verdict: 'wrong' },
  { key: 'pay', label: 'Pay or conditions', verdict: 'wrong' },
  { key: 'workload', label: 'Workload or hours', verdict: 'wrong' },
  { key: 'bad_fit', label: 'Wrong hire for the role', verdict: 'wrong' },
  { key: 'dismissed', label: 'Let go after a fair process', verdict: 'wrong' },
];

export const verdictOf = (reasonKey: string | null): ExitVerdict | null =>
  EXIT_REASONS.find(r => r.key === reasonKey)?.verdict ?? null;

export interface Placement {
  roleId: string;
  userId: string | null;
  staffId: string | null;
  fromDate: string;
  toDate: string | null;
}

export interface Exit {
  roleId: string;
  userId: string | null;
  staffId: string | null;
  left: string;
}

/**
 * Who has left, read from the chart's own history.
 *
 * A placement that closed is an exit only if the person holds no open placement anywhere — somebody
 * moved from Technician to Supervisor closed one placement and opened another, and that is a
 * promotion, not a departure. A placement with nobody behind it (neither account nor staff row) is
 * not a person and is skipped. Newest first.
 */
export function exitsFrom(placements: readonly Placement[]): Exit[] {
  const key = (p: { userId: string | null; staffId: string | null }) => p.userId ?? p.staffId;
  const stillHere = new Set(placements.filter(p => !p.toDate).map(key).filter(Boolean));
  const latest = new Map<string, Exit>();
  for (const p of placements) {
    const k = key(p);
    if (!k || !p.toDate || stillHere.has(k)) continue;
    const prior = latest.get(k);
    if (!prior || p.toDate > prior.left) {
      latest.set(k, { roleId: p.roleId, userId: p.userId, staffId: p.staffId, left: p.toDate });
    }
  }
  return [...latest.values()].sort((a, b) => b.left.localeCompare(a.left));
}

/**
 * Negative turnover, counted the design's way: wrong-reason exits only.
 *
 * An exit whose reason nobody has recorded yet is counted apart, never as wrong — not recorded is
 * not doing badly.
 */
export function turnoverOf(verdicts: readonly (ExitVerdict | null)[]): { wrong: number; right: number; unrecorded: number } {
  return {
    wrong: verdicts.filter(v => v === 'wrong').length,
    right: verdicts.filter(v => v === 'right').length,
    unrecorded: verdicts.filter(v => v === null).length,
  };
}
