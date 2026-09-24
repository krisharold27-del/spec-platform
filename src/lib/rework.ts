/**
 * Callbacks and rework — going back to a job that should have been finished.
 *
 * ── Why this is a Compliance number and not a Jobs one ───────────────────────────────────────────
 *
 * Rework is the cost a trade business never sees on a report: the hours are on a timesheet, the
 * materials are on a job, and both look like ordinary work. The only way it becomes visible is by
 * being counted separately — so a callback is its own record, pointing at the job it came from.
 *
 * It feeds Compliance rather than Earnings on purpose. Going back twice is not a money problem with
 * a money fix; it is work that was not done right, and the fix is a checklist, a toolbox talk or a
 * conversation. Filed under Earnings it would be argued about as a cost. Filed under Compliance it
 * is argued about as a standard, which is the argument worth having.
 *
 * ── Whose it is decides what happens, not who pays ───────────────────────────────────────────────
 *
 * Four causes, and each has one honest consequence. Getting this wrong in either direction is
 * expensive: a supplier's faulty fitting written off as workmanship is money the business is owed
 * and never claims, and a genuine workmanship callback invoiced to the customer is a customer lost.
 */

export type Cause = 'workmanship' | 'material' | 'subbie' | 'not_ours';

export const CAUSES: { key: Cause; label: string; consequence: string }[] = [
  {
    key: 'workmanship', label: 'Our workmanship',
    consequence: 'Fixed free. The cost stays on us, and the fix is a checklist rather than a conversation about money.',
  },
  {
    key: 'material', label: 'Material fault',
    consequence: 'Claimed from the supplier. Worth the paperwork — a batch that failed once will fail again.',
  },
  {
    key: 'subbie', label: 'Subcontractor',
    consequence: 'Sent back to them at their cost, and it counts on their score.',
  },
  {
    key: 'not_ours', label: 'Not our work',
    consequence: 'Invoiced as a call-out. Going out for nothing is still a day.',
  },
];

export const isCause = (v: string): v is Cause => CAUSES.some(c => c.key === v);

export const causeLabel = (v: string): string =>
  CAUSES.find(c => c.key === v)?.label ?? 'Our workmanship';

/** Which causes the business itself carries. The number that matters is the one it cannot bill. */
export const ONA_US: readonly Cause[] = ['workmanship'];

/** Whether this callback can be recovered from somebody, and from whom. */
export function recoverFrom(cause: string): 'supplier' | 'subcontractor' | 'customer' | null {
  if (cause === 'material') return 'supplier';
  if (cause === 'subbie') return 'subcontractor';
  if (cause === 'not_ours') return 'customer';
  return null;
}

/**
 * The target: under 2% of hours.
 *
 * Not zero. A business that reports zero rework is a business where nobody is writing it down, and
 * a target of zero is what produces that. Two per cent is achievable and honest, which is what
 * makes it a number people will actually record against.
 */
export const REWORK_TARGET = 0.02;

export interface Callback {
  id: string;
  /** The job that had to be gone back to. */
  jobRef: string;
  cause: string;
  /** Hours spent going back. */
  hours: number;
  costCents: number;
  /** What was actually got back, once a claim or an invoice landed. */
  recoveredCents: number;
  /** Who did the original work. Named so a pattern can be seen, never to blame one person. */
  who: string;
  at: string;
}

export interface ReworkStats {
  callbacks: number;
  hours: number;
  costCents: number;
  recoveredCents: number;
  /** Rework hours as a fraction of all hours worked. */
  rate: number;
  overTarget: boolean;
}

export function reworkStats(rows: readonly Callback[], totalHours: number): ReworkStats {
  const hours = rows.reduce((t, r) => t + r.hours, 0);
  const rate = totalHours > 0 ? hours / totalHours : 0;
  return {
    callbacks: rows.length,
    hours,
    costCents: rows.reduce((t, r) => t + r.costCents, 0),
    recoveredCents: rows.reduce((t, r) => t + r.recoveredCents, 0),
    rate,
    overTarget: totalHours > 0 && rate > REWORK_TARGET,
  };
}

/**
 * The pattern worth naming.
 *
 * One callback is a bad day. The same cause three times is a way of working, and that is the only
 * thing on this screen that can actually be fixed. Below three it says nothing rather than inviting
 * somebody to read a trend into two rows.
 */
export const PATTERN_AT = 3;

export function pattern(rows: readonly Callback[]): { cause: Cause; count: number; says: string } | null {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.cause, (counts.get(r.cause) ?? 0) + 1);
  const [cause, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  if (!cause || !isCause(cause) || count < PATTERN_AT) return null;
  return {
    cause,
    count,
    says: `${count} callbacks with the same cause — ${causeLabel(cause).toLowerCase()}. That is a way of working, not a bad day. A checklist on the job fixes it; another conversation will not.`,
  };
}

const money = (cents: number) => `$${Math.abs(Math.round(cents / 100)).toLocaleString('en-AU')}`;

/** The headline, which leads on the rate because that is the KPI, not the dollars. */
export function reworkLine(s: ReworkStats): string {
  if (s.callbacks === 0) return 'No callbacks. Nothing has had to be gone back to.';
  const pct = `${Math.round(s.rate * 1000) / 10}%`;
  if (s.overTarget) {
    return `${pct} of hours are rework, over the ${Math.round(REWORK_TARGET * 100)}% target — ${money(s.costCents)} of going back.`;
  }
  return `${s.callbacks} ${s.callbacks === 1 ? 'callback' : 'callbacks'}, ${pct} of hours. Under the ${Math.round(REWORK_TARGET * 100)}% target.`;
}

export { money as reworkMoney };
