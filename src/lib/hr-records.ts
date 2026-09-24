/**
 * What is actually recorded against a person — the contract, the conduct process, the pay run.
 *
 * `lib/hr` already held the thinking: the five steps of a fair process, the contract drafted from
 * the role, what every pay run is checked for, the week that has just finished. None of it was
 * stored, so the People screen could describe the right process and keep no record of it having
 * happened — which is precisely the position a business is in when a tribunal asks.
 *
 * ── Outsimple them ───────────────────────────────────────────────────────────────────────────────
 *
 * Two tables, not four. A contract and a conduct process are the same shape — a document about one
 * person, moving through states, that must not be edited after the fact. Splitting them would make
 * two screens out of one question about somebody's file.
 */

import { FAIR_PROCESS, AWARD_CHECKS, mayTake } from './hr';

/* ─────────────────────────────────────────────────────────────────────────────
 * Contracts and conduct
 * ───────────────────────────────────────────────────────────────────────────── */

export type RecordKind = 'contract' | 'conduct';

export const RECORD_KINDS: { key: RecordKind; label: string; blurb: string }[] = [
  {
    key: 'contract', label: 'Contracts',
    blurb: 'Drafted from the role on the chart, sent, and accepted. SPEC fills what it knows and leaves pay and the award for the business.',
  },
  {
    key: 'conduct', label: 'Conduct',
    blurb: 'The five steps of a fair process, in order. SPEC will not let one be skipped.',
  },
];

export const isRecordKind = (v: string): v is RecordKind =>
  RECORD_KINDS.some(k => k.key === v);

/* ── A contract ─────────────────────────────────────────────────────────────── */

export type ContractState = 'draft' | 'sent' | 'signed' | 'declined';

export const CONTRACT_LABEL: Record<ContractState, string> = {
  draft: 'Draft',
  sent: 'Waiting on signature',
  signed: 'Signed',
  declined: 'Declined',
};

export const isContractState = (v: string): v is ContractState =>
  ['draft', 'sent', 'signed', 'declined'].includes(v);

/**
 * How a contract reads, and whether it is waiting on somebody.
 *
 * A contract sent and never returned is the single most common gap in a small business's file, and
 * it is invisible until somebody goes looking. So it is said with a number of days attached: "sent"
 * is a state, "sent eleven days ago" is a prompt.
 */
export function contractLine(
  r: { state: string; sentAt: string | null; signedAt: string | null },
  at: Date = new Date(),
): string {
  if (r.state === 'signed') return `Signed ${r.signedAt?.slice(0, 10) ?? ''}`.trim();
  if (r.state === 'declined') return 'Declined — nothing in force';
  if (r.state === 'sent' && r.sentAt) {
    const days = Math.max(0, Math.floor((at.getTime() - Date.parse(r.sentAt)) / 86_400_000));
    if (days === 0) return 'Sent today, not signed yet';
    return `Sent ${days} ${days === 1 ? 'day' : 'days'} ago, not signed yet`;
  }
  return 'Draft — not sent';
}

/** Nothing is in force until it is accepted. Said plainly, because "sent" reads like "done". */
export const inForce = (r: { state: string }): boolean => r.state === 'signed';

/* ── A conduct process ──────────────────────────────────────────────────────── */

export interface StepNote { step: number; note: string; at: string }

export function parseSteps(json: string | null | undefined): StepNote[] {
  try {
    const v = JSON.parse(json ?? '[]');
    return Array.isArray(v) ? v.filter(s => typeof s?.step === 'number') : [];
  } catch { return []; }
}

/**
 * Which step may be taken next — and nothing else.
 *
 * `mayTake` in lib/hr is the rule; this is it applied to a stored record. A step skipped is a
 * process a tribunal can unpick, and SPEC being the thing that will not let it happen by accident
 * is the whole reason this is a system rather than a folder.
 */
export function nextStep(stepsDone: number): { index: number; label: string; note: string } | null {
  if (!mayTake(stepsDone, stepsDone)) return null;
  const s = FAIR_PROCESS[stepsDone];
  return { index: stepsDone, label: s.label, note: s.note };
}

export const processComplete = (stepsDone: number): boolean =>
  stepsDone >= FAIR_PROCESS.length;

/**
 * A conduct process that has stalled.
 *
 * Starting one and not finishing it is worse than never starting: the person has been told there is
 * a concern and then heard nothing, and the record shows a process begun and abandoned.
 */
export function stalled(
  r: { state: string; stepsDone: number; updatedAt: string },
  at: Date = new Date(),
  days = 14,
): boolean {
  if (r.state === 'closed' || processComplete(r.stepsDone)) return false;
  return (at.getTime() - Date.parse(r.updatedAt)) / 86_400_000 > days;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The pay run
 * ───────────────────────────────────────────────────────────────────────────── */

export interface PayRow {
  who: string;
  minutes: number;
  jobs: number;
}

export interface AwardIssue {
  check: string;
  who: string;
  says: string;
}

export function parseRows(json: string | null | undefined): PayRow[] {
  try {
    const v = JSON.parse(json ?? '[]');
    return Array.isArray(v) ? v.filter(r => typeof r?.who === 'string') : [];
  } catch { return []; }
}

export function parseIssues(json: string | null | undefined): AwardIssue[] {
  try {
    const v = JSON.parse(json ?? '[]');
    return Array.isArray(v) ? v.filter(i => typeof i?.check === 'string') : [];
  } catch { return []; }
}

/** Hours, from the minutes SPEC already holds. Rounded to a quarter, the way a payslip reads. */
export const hoursOf = (minutes: number): number => Math.round((minutes / 60) * 4) / 4;

export const totalHours = (rows: readonly PayRow[]): number =>
  hoursOf(rows.reduce((t, r) => t + r.minutes, 0));

/**
 * What the award check looks at. The list is `AWARD_CHECKS` from lib/hr — level, base rate,
 * allowances, overtime and penalties — against whichever award the business names, never one
 * client's.
 *
 * ── What SPEC can and cannot check on its own ────────────────────────────────────────────────────
 *
 * SPEC holds the hours. It does not hold the business's award, its levels or its rates, and it must
 * not invent them: a rate SPEC made up and presented as checked is worse than no check at all.
 *
 * So the check it runs unaided is the one it CAN run honestly — the hours against what an award
 * governs: an unusually long week, a week with no hours at all for somebody on the chart. Everything
 * that needs the award's own numbers is raised as a question for the business to answer, and the
 * answers are stored on the run so "what did we know when we paid it" has an answer later.
 */
export const LONG_WEEK_HOURS = 38;
export const VERY_LONG_WEEK_HOURS = 50;

export function checkHours(rows: readonly PayRow[]): AwardIssue[] {
  const issues: AwardIssue[] = [];
  for (const r of rows) {
    const h = hoursOf(r.minutes);
    if (h > VERY_LONG_WEEK_HOURS) {
      issues.push({
        check: 'Overtime and penalties',
        who: r.who,
        says: `${h} hours in the week. Well past ${LONG_WEEK_HOURS} — check the overtime and penalty rates before this goes.`,
      });
    } else if (h > LONG_WEEK_HOURS) {
      issues.push({
        check: 'Overtime and penalties',
        who: r.who,
        says: `${h} hours in the week, over the ordinary ${LONG_WEEK_HOURS}. Check what the extra is paid at.`,
      });
    }
    if (h === 0) {
      issues.push({
        check: 'Level',
        who: r.who,
        says: 'No hours recorded this week. Either they did not work, or the hours never reached SPEC.',
      });
    }
  }
  return issues;
}

/** The four things every run is checked for, whatever the award. */
export const CHECKS = AWARD_CHECKS;

/**
 * May this run go to the accounting system?
 *
 * Only once somebody has run the check. Not "once there are no issues" — a long week is often
 * correct and correctly paid, and blocking on it would teach people to stop recording overtime.
 * What must not happen is a run going out that nobody looked at.
 */
export function mayExport(run: { checkedAt: string | null; exportedAt: string | null }): boolean {
  return Boolean(run.checkedAt) && !run.exportedAt;
}

export function payRunLine(
  run: { checkedAt: string | null; exportedAt: string | null },
  issues: readonly AwardIssue[],
): string {
  if (run.exportedAt) return `Sent to the accounting system ${run.exportedAt.slice(0, 10)}`;
  if (!run.checkedAt) return 'Not checked against the award yet — check it before it goes.';
  if (issues.length === 0) return 'Checked. Nobody under the award.';
  return `Checked. ${issues.length} ${issues.length === 1 ? 'thing needs' : 'things need'} an answer before it goes.`;
}
