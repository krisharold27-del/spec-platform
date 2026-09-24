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

/* ─────────────────────────────────────────────────────────────────────────────
 * The rework that never got paid for
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Kris, 25 September: *"anything re work or call back that isnt paid is a key power meter
 * detractor"*.
 *
 * ── What this corrects ───────────────────────────────────────────────────────────────────────────
 *
 * Everything above this line sorts callbacks by CAUSE, and cause decides who is supposed to pay:
 * a material fault goes to the supplier, a subbie's mistake goes back to them, work that was never
 * ours gets invoiced. Only `workmanship` was treated as a cost the business carries.
 *
 * That is a description of what ought to happen, and it is quietly wrong about what does. A
 * supplier claim nobody lodged, a subbie backcharge nobody raised, a call-out nobody invoiced — all
 * three cost exactly what our own workmanship costs, and they are HARDER to see, because the cause
 * on the row says somebody else is paying. The business reads three rows as recovered, and none of
 * them are.
 *
 * So the number is not the cause. It is the money: what went out, less what actually came back.
 *
 * ── Why it belongs on the Power Meter ────────────────────────────────────────────────────────────
 *
 * Because it is paid for twice and earned once. The hours were paid, the materials were paid, the
 * van went out — and no invoice exists anywhere for any of it. It comes off gross profit with
 * nothing on the other side of the entry, which is the only kind of cost that does.
 *
 * A rate does not say that. "2.4% of hours" is a number somebody nods at; the money it cost is a
 * number somebody acts on, which is why `carriedLine` leads with the figure.
 */

/** What this callback actually cost the business: what went out, less what came back. */
export const carriedCents = (r: Callback): number =>
  Math.max(0, r.costCents - r.recoveredCents);

/**
 * Past this, a recovery is not coming.
 *
 * Ninety days because that is well beyond any supplier's claim window and any honest invoicing
 * delay. A row still showing nothing recovered at ninety days is not in progress; it is a decision
 * nobody made on purpose.
 */
export const RECOVERY_GOES_STALE_DAYS = 90;

/**
 * Money the business meant somebody else to pay, and is now paying itself.
 *
 * The sharpest line on the screen. These are not mistakes about who was at fault — the fault was
 * recorded correctly. They are claims and invoices that were never raised, which means the business
 * already decided it was owed this money and then did not ask for it.
 */
export function oursByDefault(rows: readonly Callback[], at: Date = new Date()): Callback[] {
  return rows.filter(r => {
    if (!recoverFrom(r.cause)) return false;          // ours by decision, not by default
    if (r.recoveredCents > 0) return false;           // something came back
    const days = Math.floor((at.getTime() - Date.parse(r.at)) / 86_400_000);
    return Number.isFinite(days) && days >= RECOVERY_GOES_STALE_DAYS;
  });
}

export interface Unpaid {
  /** Everything that went out and never came back, whatever the cause. */
  carriedCents: number;
  /** The part the business always intended to carry — its own workmanship. */
  byDecisionCents: number;
  /** The part somebody else was supposed to pay, and nobody ever asked. */
  byDefaultCents: number;
  byDefault: Callback[];
  /** Unpaid rework as a share of what the business billed. Null when nothing was billed. */
  shareOfRevenue: number | null;
}

export function unpaidRework(
  rows: readonly Callback[],
  revenueCents: number,
  at: Date = new Date(),
): Unpaid {
  const carried = rows.reduce((t, r) => t + carriedCents(r), 0);
  const byDefault = oursByDefault(rows, at);
  const byDefaultCents = byDefault.reduce((t, r) => t + carriedCents(r), 0);
  return {
    carriedCents: carried,
    /*
      By decision is everything carried that is NOT sitting in a stale recovery — our own
      workmanship, plus anything where a claim is genuinely still running. Subtracted rather than
      filtered by cause, so the two halves always add up to the whole and no money can fall between
      them.
    */
    byDecisionCents: carried - byDefaultCents,
    byDefaultCents,
    byDefault,
    shareOfRevenue: revenueCents > 0 ? carried / revenueCents : null,
  };
}

/**
 * Said as money, because that is what gets acted on.
 *
 * Leads with what it cost and then, only if there is any, the part nobody asked for — which is the
 * half a business can get back this week rather than fix over a year.
 */
export function carriedLine(u: Unpaid): string {
  if (u.carriedCents === 0) return 'Nothing went back out unpaid.';
  const share = u.shareOfRevenue === null ? '' : ` — ${(u.shareOfRevenue * 100).toFixed(1)}% of what you billed`;
  const base = `${money(u.carriedCents)} of work done twice and paid for once${share}.`;
  if (u.byDefaultCents === 0) return base;
  return `${base} ${money(u.byDefaultCents)} of that was somebody else's to pay and was never asked for — ${u.byDefault.length} ${u.byDefault.length === 1 ? 'claim' : 'claims'} past ${RECOVERY_GOES_STALE_DAYS} days with nothing back.`;
}
