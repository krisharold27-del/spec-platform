/**
 * The money against a job: variations, progress claims, retention and invoices.
 *
 * ── Outsimple them: one table, three capabilities ────────────────────────────────────────────────
 *
 * SimPro has a screen for variations, a screen for progress claims, a screen for retention and a
 * screen for invoicing. They are four views of one fact — *a sum of money attached to this job,
 * which somebody owes or will owe* — and the only things that genuinely differ are when it is
 * raised and what has to happen before it can be sent.
 *
 * So there is one record with a `kind`, and the rules that differ live here as rules rather than as
 * four sets of columns. A variation must be agreed before it is billed. A claim is a percentage of
 * a contract rather than a fixed amount. Retention is the slice held back from a claim, released
 * later. An invoice is the thing that actually goes out and gets chased.
 */

export type BillKind = 'variation' | 'claim' | 'invoice';

export const BILL_KINDS: { key: BillKind; label: string; blurb: string }[] = [
  {
    key: 'variation', label: 'Variations',
    blurb: 'Extra work priced and agreed before it is done. Unagreed work is the single most common way a job loses money.',
  },
  {
    key: 'claim', label: 'Progress claims',
    blurb: 'Claim by stage or percentage, with retention held back and released when it is due.',
  },
  {
    key: 'invoice', label: 'Invoices',
    blurb: 'Sent on sign-off, then chased at 7, 14 and 30 days without anybody having to remember.',
  },
];

export const isBillKind = (v: string): v is BillKind =>
  BILL_KINDS.some(k => k.key === v);

export const billKindLabel = (v: string): string =>
  BILL_KINDS.find(k => k.key === v)?.label ?? 'Invoices';

/* ─────────────────────────────────────────────────────────────────────────────
 * Where it has got to
 * ───────────────────────────────────────────────────────────────────────────── */

export type BillState = 'draft' | 'agreed' | 'sent' | 'paid' | 'declined';

export const BILL_STATE_LABEL: Record<BillState, string> = {
  draft: 'Draft',
  agreed: 'Agreed on site',
  sent: 'Sent',
  paid: 'Paid',
  declined: 'Declined',
};

export const isBillState = (v: string): v is BillState =>
  ['draft', 'agreed', 'sent', 'paid', 'declined'].includes(v);

/**
 * May this be sent to the customer?
 *
 * ── The one rule that saves a trade business real money ──────────────────────────────────────────
 *
 * A VARIATION may not be sent until it has been agreed. Extra work done on a nod and billed
 * afterwards is the single most common way a job loses money: the customer disputes it, the
 * business has nothing signed, and it gets written off. SPEC refusing to bill an unagreed variation
 * is the whole point of having variations in the system at all.
 *
 * A claim or an invoice needs no such gate — a claim is against a contract that is already signed,
 * and an invoice is raised from work already signed off.
 */
export function maySend(bill: { kind: string; state: string }): { ok: boolean; why: string } {
  if (bill.state === 'sent' || bill.state === 'paid') return { ok: false, why: 'Already sent.' };
  if (bill.kind === 'variation' && bill.state !== 'agreed') {
    return {
      ok: false,
      why: 'Get it agreed before it is billed. Extra work done on a nod and invoiced afterwards is the most common way a job loses money.',
    };
  }
  return { ok: true, why: '' };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Retention
 * ───────────────────────────────────────────────────────────────────────────── */

/** The usual slice held back from a progress claim, as a fraction. A default, never a rule. */
export const DEFAULT_RETENTION = 0.05;

export interface ClaimMaths {
  grossCents: number;
  retentionCents: number;
  netCents: number;
}

/**
 * What a progress claim actually pays this month, once retention is held back.
 *
 * Retention is the part small businesses lose track of: it is held from every claim, it is
 * genuinely theirs, and it is released months later by somebody remembering. A number that is only
 * ever computed in somebody's head is a number that goes uncollected.
 */
export function claimMaths(grossCents: number, retentionPct: number = DEFAULT_RETENTION): ClaimMaths {
  const retentionCents = Math.round(grossCents * Math.max(0, Math.min(retentionPct, 1)));
  return { grossCents, retentionCents, netCents: grossCents - retentionCents };
}

/** Everything held back and not yet released. The figure nobody has to hand. */
export const retentionHeld = (
  bills: readonly { kind: string; retentionCents: number; releasedAt: string | null }[],
): number =>
  bills.filter(b => b.kind === 'claim' && !b.releasedAt)
    .reduce((t, b) => t + b.retentionCents, 0);

/* ─────────────────────────────────────────────────────────────────────────────
 * Chasing what is owed
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * When an unpaid invoice gets chased. The design's own ladder.
 *
 * Nobody has to remember: the reminder is due because the date passed, not because somebody looked.
 * That is the difference between a debtor list and getting paid.
 */
export const REMINDERS = [7, 14, 30] as const;

export interface Chase {
  /** Which reminder is due now — 7, 14, 30 — or null when none is. */
  due: (typeof REMINDERS)[number] | null;
  daysOut: number;
  says: string;
}

/**
 * What is owed on this invoice, and whether a reminder is due.
 *
 * `remindersSent` is how many have gone, so the same one is never sent twice and the next one is
 * whatever the age has passed that has not been sent.
 */
export function chase(
  bill: { state: string; sentAt: string | null; remindersSent: number },
  at: Date = new Date(),
): Chase {
  if (bill.state !== 'sent' || !bill.sentAt) {
    return { due: null, daysOut: 0, says: '' };
  }
  const daysOut = Math.max(0, Math.floor((at.getTime() - Date.parse(bill.sentAt)) / 86_400_000));
  const passed = REMINDERS.filter(d => daysOut >= d);
  const due = passed.length > bill.remindersSent ? passed[bill.remindersSent] : null;

  if (due === null) {
    return {
      due: null,
      daysOut,
      says: daysOut === 0 ? 'Sent today.' : `${daysOut} ${daysOut === 1 ? 'day' : 'days'} out.`,
    };
  }
  return {
    due,
    daysOut,
    says: `${daysOut} days out. The ${due}-day reminder is due and has not gone.`,
  };
}

export interface MoneyStats {
  owedCents: number;
  overdueCents: number;
  retentionCents: number;
  chasesDue: number;
  unagreedVariations: number;
}

export function moneyStats(
  bills: readonly {
    kind: string; state: string; amountCents: number; retentionCents: number;
    releasedAt: string | null; sentAt: string | null; remindersSent: number;
  }[],
  at: Date = new Date(),
): MoneyStats {
  const sent = bills.filter(b => b.state === 'sent');
  return {
    owedCents: sent.reduce((t, b) => t + b.amountCents - b.retentionCents, 0),
    overdueCents: sent.filter(b => chase(b, at).daysOut > REMINDERS[0])
      .reduce((t, b) => t + b.amountCents - b.retentionCents, 0),
    retentionCents: retentionHeld(bills),
    chasesDue: sent.filter(b => chase(b, at).due !== null).length,
    unagreedVariations: bills.filter(b => b.kind === 'variation' && b.state === 'draft').length,
  };
}

const cash = (c: number) =>
  `$${(c / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The headline, which leads on whatever is costing money right now. */
export function moneyLine(s: MoneyStats): string {
  if (s.chasesDue > 0) {
    return `${s.chasesDue} ${s.chasesDue === 1 ? 'invoice needs' : 'invoices need'} chasing — ${cash(s.overdueCents)} past the first reminder.`;
  }
  if (s.unagreedVariations > 0) {
    return `${s.unagreedVariations} ${s.unagreedVariations === 1 ? 'variation is' : 'variations are'} not agreed yet, so ${s.unagreedVariations === 1 ? 'it' : 'they'} cannot be billed.`;
  }
  if (s.retentionCents > 0) return `${cash(s.owedCents)} owed, and ${cash(s.retentionCents)} held in retention.`;
  if (s.owedCents > 0) return `${cash(s.owedCents)} owed, nothing overdue.`;
  return 'Nothing outstanding.';
}

export { cash as moneyLabel };
