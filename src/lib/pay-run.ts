/**
 * The pay run, which is the one thing in SPEC that is allowed to refuse.
 *
 * ── Kris, 25 September ───────────────────────────────────────────────────────────────────────────
 *
 * *"payroll is always 100% right. A pay run cannot be approved until all seven checks pass."*
 *
 * ── Why this file blocks where the rest of SPEC asks ─────────────────────────────────────────────
 *
 * `lib/gentle` exists because software that calls people wrong makes them defensive, and almost
 * everywhere in this product the right move is to ask rather than to stop. Payroll is the exception
 * and it is worth being precise about why, because "this one is important" is the reasoning that
 * turns every screen into a gauntlet.
 *
 * The difference is who bears the mistake. A quote priced under cost costs the business money and
 * the business chose to send it. An underpaid apprentice did not choose anything, will very often
 * not know, and the error compounds every fortnight until somebody audits it — at which point it is
 * years of back pay, a Fair Work matter, and a person who trusted their employer and should not
 * have. There is no version of that where "we asked and they clicked yes" is an answer.
 *
 * So: seven checks, all of them, before an approve button exists at all. Not a warning on the
 * button. Not a confirmation dialog. The button is absent until the run is right, because a button
 * that appears and then refuses has taught somebody that the checks are advisory.
 *
 * ── What is still gentle ─────────────────────────────────────────────────────────────────────────
 *
 * Anything ODD, as opposed to wrong, goes to the supervisor as a `lib/gentle` prompt: a 14-hour
 * day, a week with no hours, an allowance that has never appeared before. Those are questions, they
 * have real answers, and they are asked of the person who would know — which is never the person
 * pressing approve on a Thursday afternoon.
 *
 * ── The numbers SPEC will not invent ─────────────────────────────────────────────────────────────
 *
 * The super guarantee rate, award rates and the overtime threshold are law, they change, and they
 * differ by award and by year. `lib/certificates` set the rule and it is the same here with more at
 * stake: a rate SPEC made up and applied to somebody's pay is worse than no rate, because it looks
 * like it was checked. Every one of them is a setting with a source and a date, and a check FAILS
 * rather than guesses when it has not been set.
 */
import type { GentleKey } from './gentle';

/** Who may approve. One seat, named. */
export const APPROVER_ROLE = 'Head of Commercial';

export type CheckKey =
  | 'hours' | 'award' | 'deductions' | 'super' | 'payment' | 'stp' | 'records';

export interface PayCheck {
  key: CheckKey;
  label: string;
  /** What it actually verifies, in words a bookkeeper would recognise. */
  verifies: string;
  /** What goes wrong when it is skipped. Not decoration — this is what makes it non-negotiable. */
  ifSkipped: string;
}

/** The seven, in the order a pay run happens. */
export const CHECKS: PayCheck[] = [
  {
    key: 'hours',
    label: 'Hours',
    verifies: 'Every hour comes from the job system and the pre-start, with nothing typed twice and nobody missing.',
    ifSkipped: 'Hours re-keyed from a text message are the single most common cause of an underpayment nobody notices for a year.',
  },
  {
    key: 'award',
    label: 'Award interpretation',
    verifies: 'Base rates, overtime past the weekly threshold, weekend and public holiday penalties, apprentice year rates and site allowances, all from the award as it stands today.',
    ifSkipped: 'Apprentice year rates are the most commonly underpaid thing in the trade, because they change on a birthday nobody has diarised.',
  },
  {
    key: 'deductions',
    label: 'Deductions',
    verifies: 'PAYG, salary sacrifice, child support and garnishees, each against its own authority.',
    ifSkipped: 'A missed child support deduction is a legal obligation the business failed, not an accounting error.',
  },
  {
    key: 'super',
    label: 'Super',
    verifies: 'Super on the right earnings at the current rate, paid at the same time as the wages.',
    ifSkipped: 'Late super is not deductible and attracts a charge, and under Payday Super the deadline is the pay day itself.',
  },
  {
    key: 'payment',
    label: 'Payment',
    verifies: 'Money out to every worker, to the ATO and to each super fund, with every account confirmed.',
    ifSkipped: 'A pay run that is approved and not paid looks identical in the books to one that was.',
  },
  {
    key: 'stp',
    label: 'Single Touch Payroll',
    verifies: 'Reported to the ATO under STP Phase 2 for this run, before the pay day.',
    ifSkipped: 'STP is reported per run, not per year — a missed one cannot be caught up quietly at the end.',
  },
  {
    key: 'records',
    label: 'Payslips and audit trail',
    verifies: 'A payslip for everybody and a line-by-line record of how each figure was arrived at.',
    ifSkipped: 'Without the working, a query about a payslip from eighteen months ago cannot be answered, only argued about.',
  },
];

export const checkByKey = (key: string): PayCheck | undefined => CHECKS.find(c => c.key === key);

export type CheckState = 'passed' | 'failed' | 'not_run';

export interface CheckResult {
  key: CheckKey;
  state: CheckState;
  /** What it found. Required when failed — a failure with no reason is not actionable. */
  says: string;
  /** Who or what it is about, where that is one person. */
  who?: string;
}

export interface RunReading {
  results: CheckResult[];
  passed: number;
  failed: CheckResult[];
  notRun: CheckResult[];
  /** The whole point of this module. */
  mayApprove: boolean;
  says: string;
}

/**
 * Read a pay run against the seven.
 *
 * A check that has not run counts exactly as a check that failed, for approval purposes. This is the
 * thing that is easy to get wrong and expensive to get wrong: treating "not run" as neutral means a
 * check that crashes, or that never got wired up, silently stops guarding anything — and the failure
 * mode is silence, which is the failure mode this product refuses everywhere else.
 */
export function readRun(results: readonly CheckResult[]): RunReading {
  const byKey = new Map(results.map(r => [r.key, r]));
  const full: CheckResult[] = CHECKS.map(c =>
    byKey.get(c.key) ?? { key: c.key, state: 'not_run', says: 'This check has not run.' });

  const failed = full.filter(r => r.state === 'failed');
  const notRun = full.filter(r => r.state === 'not_run');
  const passed = full.filter(r => r.state === 'passed').length;
  const mayApprove = passed === CHECKS.length;

  return { results: full, passed, failed, notRun, mayApprove, says: runLine(passed, failed, notRun) };
}

function runLine(passed: number, failed: readonly CheckResult[], notRun: readonly CheckResult[]): string {
  if (passed === CHECKS.length) {
    return `All ${CHECKS.length} checks passed. This run can be approved by the ${APPROVER_ROLE}.`;
  }
  const bits: string[] = [];
  if (failed.length > 0) bits.push(`${failed.length} ${failed.length === 1 ? 'check has' : 'checks have'} failed`);
  if (notRun.length > 0) bits.push(`${notRun.length} ${notRun.length === 1 ? 'has' : 'have'} not run`);
  return `${passed} of ${CHECKS.length} passed — ${bits.join(' and ')}. Nothing can be approved until every one of them does.`;
}

/**
 * Why the approve button is not there.
 *
 * Said as the specific thing to fix, first failure first, because "checks incomplete" is a message
 * that leaves somebody clicking around looking for what it means.
 */
export function whyNotApprovable(r: RunReading): string | null {
  if (r.mayApprove) return null;
  const first = r.failed[0] ?? r.notRun[0];
  if (!first) return null;
  const check = checkByKey(first.key)!;
  const who = first.who ? ` (${first.who})` : '';
  return first.state === 'failed'
    ? `${check.label}${who}: ${first.says}`
    : `${check.label} has not run yet, so nobody can say whether it is right.`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The rates SPEC is told rather than knows
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Anything that is set by law and changes.
 *
 * `source` and `checkedAt` are not paperwork. They are what lets a business answer "where did this
 * rate come from" eighteen months later, which is the question an audit actually asks.
 */
export interface LegalRate {
  key: string;
  label: string;
  /** Null means nobody has told SPEC, and nothing may be calculated from it. */
  value: number | null;
  unit: 'percent' | 'hours' | 'dollars';
  source: string | null;
  checkedAt: string | null;
}

export const RATE_KEYS = ['super', 'overtimeAfter'] as const;

export const RATE_LABELS: Record<(typeof RATE_KEYS)[number], string> = {
  super: 'Super guarantee rate',
  overtimeAfter: 'Overtime after (hours a week)',
};

/** Set, with a source. Both, because a number with no provenance is a number nobody can defend. */
export const isSet = (r: LegalRate): boolean =>
  r.value !== null && Boolean(r.source?.trim());

export function ratesReady(rates: readonly LegalRate[]): { ready: boolean; missing: LegalRate[]; says: string } {
  const missing = rates.filter(r => !isSet(r));
  if (missing.length === 0) {
    return { ready: true, missing, says: 'Every rate payroll depends on is set, with where it came from.' };
  }
  return {
    ready: false, missing,
    says: `${missing.length} ${missing.length === 1 ? 'rate is' : 'rates are'} not set: ${missing.map(m => m.label).join(', ')}. SPEC will not guess a rate that somebody's pay is calculated from.`,
  };
}

/**
 * A Fair Work change SPEC has seen and the business has not yet accepted.
 *
 * Flagged for acceptance rather than applied silently. Applying it silently would be faster and it
 * would be wrong: the business, not SPEC, is the employer, and the day a rate changes mid-quarter
 * somebody has to know it happened.
 */
export interface RateChange {
  key: string;
  label: string;
  from: number | null;
  to: number;
  effective: string;
  source: string;
  acceptedAt: string | null;
}

export const pending = (changes: readonly RateChange[]): RateChange[] =>
  changes.filter(c => !c.acceptedAt);

export function changeLine(c: RateChange): string {
  const from = c.from === null ? 'not set' : String(c.from);
  return `${c.label}: ${from} → ${c.to}, from ${c.effective.slice(0, 10)}. From ${c.source}. Accept it and every run from that date uses it.`;
}

/**
 * Manual additions — a project site allowance somebody typed in — need a date they were last
 * checked, because they have no source that will tell SPEC when they change.
 */
export const NEEDS_A_CHECK_DATE =
  'This one was added by hand, so nothing will tell SPEC when it changes. Put a date on when it was last checked and SPEC will remind you.';

/* ─────────────────────────────────────────────────────────────────────────────
 * Odd, as opposed to wrong
 * ───────────────────────────────────────────────────────────────────────────── */

export interface Oddity {
  who: string;
  what: string;
  /** Which gentle prompt to raise. */
  prompt: GentleKey;
  facts: Record<string, string>;
}

/** Over twelve hours in a day. The design's own threshold. */
export const LONG_DAY_HOURS = 12;

/**
 * Things worth asking the supervisor about before the run goes through.
 *
 * The supervisor, not the approver. The person who knows whether Tuesday really was fourteen hours
 * is the person who was on the job, and routing it to the Head of Commercial turns a two-second
 * answer into a chain of three messages.
 */
export function oddities(
  days: readonly { who: string; date: string; hours: number }[],
): Oddity[] {
  return days
    .filter(d => d.hours > LONG_DAY_HOURS)
    .map(d => ({
      who: d.who,
      what: `${d.hours} hours on ${d.date.slice(0, 10)}`,
      prompt: 'long_day' as const,
      facts: { hours: String(d.hours) },
    }));
}

export const ODDITIES_GO_TO_THE_SUPERVISOR =
  'These go to the supervisor, not to whoever approves the run. The person who was on the job is the one who knows, and they can answer it in two seconds.';

/** Any cycle. Weekly, fortnightly, monthly — the checks are the same seven. */
export const ANY_CYCLE =
  'Weekly, fortnightly or monthly — whatever you run, the same seven checks have to pass before it can be approved.';
