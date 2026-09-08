/**
 * Governance — a section inside Compliance, not a separate pillar.
 *
 * Compliance in most businesses is read as "did we breach anything". That misses the part that
 * actually protects the owner: whether the board is sitting on the schedule it agreed, and whether
 * anyone can say who the directors are. A business can pass every safety audit and still be
 * ungoverned, and an owner only discovers that when something has already gone wrong.
 *
 * Everything here is checked against real rows. A board that has not met is reported as not having
 * met — never as "no data", which reads like a clean result.
 */

export type Cadence = 'monthly' | 'quarterly';

export const CADENCE: Record<Cadence, { label: string; days: number; note: string }> = {
  monthly: {
    label: 'Monthly',
    days: 31,
    note: 'Recommended. A month is short enough that a problem is still small when the board sees it.',
  },
  quarterly: {
    label: 'Quarterly',
    days: 92,
    note: 'The outer limit. Workable, but a problem can run for a full quarter before anyone at board level sees it.',
  },
};

export function cadenceOf(value: string | null | undefined): Cadence {
  return value === 'quarterly' ? 'quarterly' : 'monthly';
}

export interface BoardMeetingRow { date: string }
export interface DirectorRow { name: string; title: string | null; active: boolean }

export interface GovernanceCheck {
  id: string;
  question: string;
  /** pass | attention | not_reporting — never a silent blank. */
  status: 'pass' | 'attention' | 'not_reporting';
  detail: string;
  /** What to do about it. Rule 4: any report of a miss carries a proposed fix. */
  fix?: string;
}

export function daysSince(iso: string, at: Date): number {
  return Math.floor((at.getTime() - new Date(iso).getTime()) / 86_400_000);
}

export function governanceChecks(
  cadence: Cadence,
  meetings: BoardMeetingRow[],
  directors: DirectorRow[],
  at: Date = new Date(),
): GovernanceCheck[] {
  const c = CADENCE[cadence];
  const sorted = [...meetings].sort((a, b) => (a.date < b.date ? 1 : -1));
  const last = sorted[0];
  const active = directors.filter(d => d.active);

  const checks: GovernanceCheck[] = [];

  // 1. Is the board actually sitting?
  if (!last) {
    checks.push({
      id: 'board_meeting_held',
      question: 'Is the board meeting on schedule?',
      status: 'not_reporting',
      detail: `No board meeting has been recorded. The agreed cadence is ${c.label.toLowerCase()}.`,
      fix: 'Record the last board meeting date, or set one. An unrecorded meeting is indistinguishable from one that never happened.',
    });
  } else {
    const gap = daysSince(last.date, at);
    const overdue = gap > c.days;
    checks.push({
      id: 'board_meeting_held',
      question: 'Is the board meeting on schedule?',
      status: overdue ? 'attention' : 'pass',
      detail: overdue
        ? `${gap} days since the last board meeting, against a ${c.label.toLowerCase()} cadence.`
        : `Last met ${gap} day${gap === 1 ? '' : 's'} ago, within the ${c.label.toLowerCase()} cadence.`,
      fix: overdue ? 'Set the next board date before this pack is circulated.' : undefined,
    });
  }

  // 2. Does the business know who its directors are?
  checks.push({
    id: 'directors_recorded',
    question: 'Are the directors recorded?',
    status: active.length ? 'pass' : 'not_reporting',
    detail: active.length
      ? `${active.length} director${active.length === 1 ? '' : 's'} on record: ${active.map(d => d.title ? `${d.name} (${d.title})` : d.name).join(', ')}.`
      : 'No directors recorded.',
    fix: active.length ? undefined : 'Add the directors. This is the register the board is accountable through.',
  });

  // 3. Are minutes being kept? A meeting with no record is a conversation.
  const withMinutes = sorted.filter(m => 'minutes' in m && (m as { minutes?: string | null }).minutes).length;
  if (sorted.length) {
    checks.push({
      id: 'minutes_kept',
      question: 'Are minutes kept?',
      status: withMinutes === sorted.length ? 'pass' : 'attention',
      detail: `${withMinutes} of ${sorted.length} recorded board meetings have minutes.`,
      fix: withMinutes === sorted.length ? undefined : 'Attach minutes to the meetings missing them — a meeting with no record is a conversation, not governance.',
    });
  }

  return checks;
}

/** Governance is clean only when nothing is outstanding and nothing is unreported. */
export function governanceStatus(checks: GovernanceCheck[]): 'pass' | 'attention' | 'not_reporting' {
  if (checks.some(c => c.status === 'attention')) return 'attention';
  if (checks.some(c => c.status === 'not_reporting')) return 'not_reporting';
  return 'pass';
}
