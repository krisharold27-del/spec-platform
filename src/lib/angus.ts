/**
 * Angus Shield — SPEC's own financial system, and the one thing it must never be built as.
 *
 * ── The line at the top of Design 19 ─────────────────────────────────────────────────────────────
 *
 * *"Angus Shield is SPEC's own financial system. Same company, same login, same data model. It is
 * NOT a third-party connector."* And then the instruction that shapes this whole file:
 *
 *   **"Build Angus Shield on the same tenant, auth and data layer as SPEC so 'connect' is a
 *   setting, not an integration. Any connector code written for Xero must not be reused as the
 *   Angus Shield path."**
 *
 * That is an architecture rule with a sharp edge, so it is worth saying why it matters rather than
 * treating it as a preference. The cheap way to ship Angus Shield is to give it an entry in the
 * connector table, point it at an internal API and let every existing code path carry on unchanged —
 * a day's work, and it would look identical on screen. What it would cost is everything the product
 * was promised on: a daily sync where there should be none, a token that can expire, a field mapping
 * that can drift, a reconciliation that can disagree, and an outage in the connector layer taking
 * out a financial system that is sitting in the same database as the thing calling it.
 *
 * The whole pitch of Angus Shield is that none of those exist. `ANGUS_IS_NOT_A_CONNECTOR` below is
 * enforced by `tests/angus.test.ts`, which fails the build if this module ever imports from the
 * connector modules.
 *
 * ── Never forced, and the honesty that requires ──────────────────────────────────────────────────
 *
 * *"Never forced. Businesses can stay on Xero, MYOB etc. as long as they like."* This is not
 * politeness. A business's financial system holds its history, its accountant's habits and its
 * auditor's expectations, and a product that nags about moving it is a product that gets distrusted
 * about everything else. So: the offer appears once six months of data exists, `stay` is a first
 * class answer rather than a dismissal, and nothing in here counts a business that stays as behind.
 *
 * ── Payroll, settled ─────────────────────────────────────────────────────────────────────────────
 *
 * Payroll ALWAYS starts in siteVIP and ends in the financial system — Xero while they stay, Angus
 * Shield once switched. Angus Shield does not run payroll itself; it books what siteVIP sends.
 */
import type { Figures } from './financials';

/**
 * The rule this module is written around, kept as text so the test can assert on something that a
 * person reads rather than on a comment nobody sees.
 */
export const ANGUS_IS_NOT_A_CONNECTOR =
  'Angus Shield is SPEC. Same login, same data, no sync, no keys, no mapping — turning it on is a setting, not an integration.';

/** What sits under the money screens. Two states, and only two. */
export type FinanceSource = 'angus' | 'connector';

/** Shown at the top of Angus Shield, so nobody has to guess where a figure came from. */
export function sourceTitle(source: FinanceSource, connectorName: string | null): string {
  if (source === 'angus') return 'Angus Shield, directly';
  return connectorName ? `${connectorName}, read every morning` : 'No financial system connected yet';
}

export function sourceNote(source: FinanceSource, connectorName: string | null): string {
  if (source === 'angus') {
    return 'Live. Nothing to sync, because this is the same database the jobs are in — what you are reading is what happened.';
  }
  if (!connectorName) {
    return 'Connect the system you use today and these reviews fill themselves in. Or turn on Angus Shield and skip that step.';
  }
  return `Read from ${connectorName} each morning, so these figures are as at today's read. Nothing about ${connectorName} changes for your accountant.`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The six months, and the offer at the end of it
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * How much history has to sit in SPEC before the switch is worth offering.
 *
 * Six, because the switch's promise is that a year of reporting keeps working the day after — and
 * moving a business onto a ledger with six weeks of history in it would deliver a BAS that cannot be
 * compared to the last one. The number is the design's; the reason it is not three is this.
 */
export const READY_AFTER_MONTHS = 6;

/** The old system stays readable for a year after a switch. Long enough to cover one full audit. */
export const OLD_SYSTEM_READ_ONLY_MONTHS = 12;

export interface Readiness {
  months: number;
  /** 0 to 1, for the track on the screen. Capped, because 130% ready is not a thing. */
  through: number;
  ready: boolean;
  says: string;
}

export function readiness(monthsOfData: number): Readiness {
  const months = Math.max(0, Math.floor(monthsOfData));
  const through = Math.min(1, months / READY_AFTER_MONTHS);
  if (months >= READY_AFTER_MONTHS) {
    return {
      months, through, ready: true,
      says: `${months} months of your jobs, invoices and bills are in SPEC — enough to move across with last year's reporting still comparing.`,
    };
  }
  const left = READY_AFTER_MONTHS - months;
  return {
    months, through, ready: false,
    says: `${months} of ${READY_AFTER_MONTHS} months. ${left} more ${left === 1 ? 'month' : 'months'} and SPEC can move you across with your history intact. Nothing to do in the meantime.`,
  };
}

/** Everything the switch carries. Named, because "we'll migrate your data" is what people fear. */
export const WHAT_MOVES = [
  { what: 'Chart of accounts', how: 'Mapped account for account, and shown to you before anything moves.' },
  { what: 'Customers and suppliers', how: 'Matched on ABN first, then name. Anything ambiguous is asked about, never guessed.' },
  { what: 'Open invoices and bills', how: 'Balances carried at their exact cents, with the same due dates and the same references.' },
  { what: 'Six months of history', how: 'Transaction by transaction, so last quarter still compares to this one.' },
  { what: 'Pay run history', how: 'Every approved run, with its wages, PAYG and super journals as they were posted.' },
] as const;

export const RECONCILED_TO_THE_CENT =
  'The move is checked both ways before it is finished: every balance in the old system has to equal the same balance in Angus Shield, to the cent. If one does not, nothing switches and SPEC tells you which one.';

export const STAYING_IS_FINE =
  'Staying is a real answer, not a "not yet". Businesses run on Xero and MYOB for years and SPEC works exactly the same on top of them — this offer will still be here whenever you want it, and it will not be asked again unless you ask.';

/** What the accountant gets, said plainly because they are the one who will object. */
export const FOR_THE_ACCOUNTANT =
  'Your accountant gets their own Angus Shield login at no cost, and the old system stays readable for 12 months so nothing they need disappears mid-year.';

export type SwitchAnswer = 'switch' | 'stay';

export interface SwitchOffer {
  offered: boolean;
  readiness: Readiness;
  /** What the business already said, if it has said anything. */
  answered: SwitchAnswer | null;
  says: string;
}

/**
 * Whether to put the offer on the screen at all.
 *
 * Only once six months exist, only if they have not already answered, and never for a business
 * already on Angus Shield. Three conditions, all of them about not asking a question the business
 * has already dealt with.
 */
export function switchOffer(
  source: FinanceSource,
  monthsOfData: number,
  answered: SwitchAnswer | null,
): SwitchOffer {
  const r = readiness(monthsOfData);
  if (source === 'angus') {
    return { offered: false, readiness: r, answered: 'switch', says: 'You are on Angus Shield.' };
  }
  if (answered === 'stay') {
    return {
      offered: false, readiness: r, answered,
      says: 'You said stay, so SPEC has stopped asking. Turn it on from here whenever you want to.',
    };
  }
  if (!r.ready) return { offered: false, readiness: r, answered, says: r.says };
  return { offered: true, readiness: r, answered, says: r.says };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The four shields
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * The four numbers that say whether the business is financially safe — not whether it is doing well.
 *
 * A shield is a floor, which is why they are shields and not scores: cash that covers the next few
 * weeks, tax that is actually set aside, a margin that is not below what the work is worth, and
 * money owed that is not aging. A business can be growing fast and fail all four.
 */
export type ShieldKey = 'cash' | 'tax' | 'margin' | 'owed';

export type ShieldState = 'held' | 'thin' | 'broken' | 'unknown';

export interface Shield {
  key: ShieldKey;
  label: string;
  /** The figure, formatted by the caller. Null when SPEC has not been told. */
  value: string | null;
  state: ShieldState;
  says: string;
}

/** What the business sets once. SPEC will not invent any of these. */
export interface ShieldSetup {
  /** Weeks of cover the owner wants in the bank. Null means nobody has said. */
  bufferWeeks: number | null;
  /** Weekly running cost, for turning a balance into weeks. Null means SPEC cannot do that sum. */
  weeklyCostCents: number | null;
  /**
   * The margin the business measures itself against.
   *
   * Design 19 calls this the industry benchmark. SPEC does not have a licensed source of industry
   * margins, and a benchmark it made up would be exactly the invented number `lib/certificates`
   * refuses to print — so this is the business's own, offered as a starting point and confirmed.
   * Until it is set, the margin shield reports the margin and says it has nothing to judge it by.
   */
  benchmarkMarginPct: number | null;
}

export const NO_SHIELD_SETUP: ShieldSetup = { bufferWeeks: null, weeklyCostCents: null, benchmarkMarginPct: null };

const money = (cents: number): string =>
  `$${Math.round(cents / 100).toLocaleString('en-AU')}`;

export function cashShield(figures: Figures, setup: ShieldSetup): Shield {
  const base = { key: 'cash' as const, label: 'Cash buffer' };
  if (figures.cash === null) {
    return { ...base, value: null, state: 'unknown', says: 'No cash position yet. Connect your financial system or turn on Angus Shield.' };
  }
  if (setup.weeklyCostCents === null || setup.weeklyCostCents <= 0) {
    return {
      ...base, value: money(figures.cash), state: 'unknown',
      says: 'SPEC knows the balance but not what a week costs you to run, so it will not tell you how many weeks that is. Set it once and it will.',
    };
  }
  const weeks = figures.cash / setup.weeklyCostCents;
  const shown = `${weeks.toFixed(1)} weeks`;
  if (setup.bufferWeeks === null) {
    return { ...base, value: shown, state: 'unknown', says: `${money(figures.cash)} is ${shown} of running costs. Set the buffer you want to hold and SPEC will watch it for you.` };
  }
  if (weeks >= setup.bufferWeeks) {
    return { ...base, value: shown, state: 'held', says: `${shown} of cover against the ${setup.bufferWeeks} you set.` };
  }
  /* Broken rather than thin once it is under half the buffer: that is the point at which one late payer becomes a payroll problem. */
  const state: ShieldState = weeks < setup.bufferWeeks / 2 ? 'broken' : 'thin';
  return {
    ...base, value: shown, state,
    says: `${shown} of cover, under the ${setup.bufferWeeks} you set. ${state === 'broken' ? 'One late payment away from a pay run you cannot make.' : 'Collecting what is overdue is the fastest way back.'}`,
  };
}

export function taxShield(figures: Figures, setAsideCents: number | null): Shield {
  const base = { key: 'tax' as const, label: 'Tax covered' };
  const owed = [figures.gst, figures.payroll].filter((n): n is number => n !== null);
  if (owed.length === 0 || setAsideCents === null) {
    return { ...base, value: null, state: 'unknown', says: 'SPEC does not know what is owed or what is set aside yet.' };
  }
  const total = owed.reduce((a, b) => a + b, 0);
  const shown = `${money(setAsideCents)} of ${money(total)}`;
  if (setAsideCents >= total) {
    return { ...base, value: shown, state: 'held', says: `GST, PAYG and super are covered. ${shown} set aside.` };
  }
  const short = total - setAsideCents;
  return {
    ...base, value: shown, state: setAsideCents >= total / 2 ? 'thin' : 'broken',
    says: `${money(short)} short of what is owed. Tax money spent on running the business is the debt that ends companies, because it is owed whether the work comes in or not.`,
  };
}

export function marginShield(marginPct: number | null, setup: ShieldSetup): Shield {
  const base = { key: 'margin' as const, label: 'Margin' };
  if (marginPct === null) {
    return { ...base, value: null, state: 'unknown', says: 'Not enough finished jobs with costs against them to work out a margin.' };
  }
  const shown = `${marginPct.toFixed(1)}%`;
  if (setup.benchmarkMarginPct === null) {
    return {
      ...base, value: shown, state: 'unknown',
      says: `${shown} gross margin. SPEC will not tell you whether that is good — set the margin you hold yourself to and it will hold you to that one.`,
    };
  }
  if (marginPct >= setup.benchmarkMarginPct) {
    return { ...base, value: shown, state: 'held', says: `${shown} against the ${setup.benchmarkMarginPct}% you set.` };
  }
  const gap = setup.benchmarkMarginPct - marginPct;
  return {
    ...base, value: shown, state: gap > 5 ? 'broken' : 'thin',
    says: `${shown}, ${gap.toFixed(1)} points under the ${setup.benchmarkMarginPct}% you set. Profit by job below says which jobs are pulling it down.`,
  };
}

/** Overdue, not owed. What is inside terms is not a problem, it is a business. */
export function owedShield(overdueCents: number | null, oldestDays: number | null): Shield {
  const base = { key: 'owed' as const, label: 'Money owed to us' };
  if (overdueCents === null) {
    return { ...base, value: null, state: 'unknown', says: 'No invoices SPEC can see yet.' };
  }
  if (overdueCents === 0) {
    return { ...base, value: '$0', state: 'held', says: 'Nothing overdue.' };
  }
  const shown = money(overdueCents);
  const days = oldestDays ?? 0;
  /* The design's own line: nothing over 45 days, nothing near 90. */
  if (days >= 90) {
    return { ...base, value: shown, state: 'broken', says: `${shown} overdue and the oldest is ${days} days. Past 90 days it stops being a debtor and starts being a bad debt.` };
  }
  if (days > 45) {
    return { ...base, value: shown, state: 'broken', says: `${shown} overdue, oldest ${days} days — past the 45 that should be the limit.` };
  }
  return { ...base, value: shown, state: 'thin', says: `${shown} overdue, oldest ${days} days. Reminders are going; past 45 days it becomes a call you have to make.` };
}

export function shields(
  figures: Figures,
  setup: ShieldSetup,
  extra: { setAsideCents: number | null; marginPct: number | null; overdueCents: number | null; oldestDays: number | null },
): Shield[] {
  return [
    cashShield(figures, setup),
    taxShield(figures, extra.setAsideCents),
    marginShield(extra.marginPct, setup),
    owedShield(extra.overdueCents, extra.oldestDays),
  ];
}

/** Whether anything is actually wrong. Unknown is not wrong — it is unasked. */
export const broken = (list: readonly Shield[]): Shield[] =>
  list.filter(s => s.state === 'broken' || s.state === 'thin');

/* ─────────────────────────────────────────────────────────────────────────────
 * The reviews SPEC prepares
 * ───────────────────────────────────────────────────────────────────────────── */

export type Cadence = 'weekly' | 'monthly';

export interface ReviewKind {
  key: string;
  title: string;
  cadence: Cadence;
  /** What it answers, for anybody who has never read a set of accounts. */
  answers: string;
}

/**
 * The eight, from the design.
 *
 * Every one of them is a report an accountant would produce at a cost, once a quarter, three weeks
 * after the period it covers. The difference SPEC makes is not the report; it is that each arrives
 * with a written finding rather than a table, and that the owner signs it, which turns a document
 * into a decision with a date on it.
 */
export const REVIEWS: ReviewKind[] = [
  { key: 'pl', title: 'Profit and loss against budget', cadence: 'monthly', answers: 'Did the month go the way we said it would, and where did it differ?' },
  { key: 'cash', title: 'Cash, the next 13 weeks', cadence: 'weekly', answers: 'Is there a week coming where the money runs out?' },
  { key: 'debtors', title: 'Who owes us', cadence: 'weekly', answers: 'Whose money are we carrying, and for how long?' },
  { key: 'creditors', title: 'What we owe', cadence: 'weekly', answers: 'What has to go out, and is any of it early enough to earn a discount?' },
  { key: 'jobs', title: 'Profit by job', cadence: 'monthly', answers: 'Which work makes money and which work only looks like it does?' },
  { key: 'labour', title: 'Labour cost and billable hours', cadence: 'monthly', answers: 'How much of what we pay for turns into something we can charge for?' },
  { key: 'tax', title: 'Tax and super set aside', cadence: 'monthly', answers: 'Is the money that is not ours actually still there?' },
  { key: 'wip', title: 'Work in progress', cadence: 'monthly', answers: 'What have we done that we have not billed?' },
];

export const reviewByKey = (key: string): ReviewKind | undefined =>
  REVIEWS.find(r => r.key === key);

export interface PreparedReview {
  kind: ReviewKind;
  /** SPEC's written finding. Null when there is not enough data to say anything true. */
  finding: string | null;
  signedAt: string | null;
  signedBy: string | null;
}

/**
 * A review with nothing to say says nothing.
 *
 * The temptation is to fill the card with "no issues found", which reads as a clean bill of health
 * and is in fact a report that could not be produced. They are different and a business betting its
 * tax position on one must not have them confused.
 */
export function reviewLine(r: PreparedReview): string {
  if (r.finding === null) {
    return `Not enough in SPEC yet to say anything true about ${r.kind.title.toLowerCase()}. It is not a clean bill of health — it is a report that could not be written.`;
  }
  return r.finding;
}

export const signedCount = (list: readonly PreparedReview[]): number =>
  list.filter(r => Boolean(r.signedAt)).length;

/** What goes into the board pack: the signed ones. An unsigned finding is a draft. */
export const forBoardPack = (list: readonly PreparedReview[]): PreparedReview[] =>
  list.filter(r => Boolean(r.signedAt));

export function reviewsLine(list: readonly PreparedReview[]): string {
  const ready = list.filter(r => r.finding !== null);
  const signed = signedCount(list);
  if (ready.length === 0) return 'No reviews ready yet. They fill in as the jobs, invoices and bills build up.';
  if (signed === ready.length) return `All ${ready.length} reviews signed off. They are in the board pack.`;
  return `${ready.length} ${ready.length === 1 ? 'review' : 'reviews'} ready, ${ready.length - signed} waiting for you to sign off.`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Payroll, which ends here and never starts here
 * ───────────────────────────────────────────────────────────────────────────── */

export const PAYROLL_RULE =
  'Payroll always runs in siteVIP — timesheets, award, leave, super, allowances, approval, STP. The financial system books what siteVIP sends it: wages, PAYG and super journals, one set per approved pay run. Angus Shield does not run payroll; it receives it, exactly as Xero does.';

export function payrollPostsTo(source: FinanceSource, connectorName: string | null): string {
  return source === 'angus'
    ? 'Each approved pay run posts straight into Angus Shield — same database, so there is nothing to export and nothing to reconcile.'
    : `Each approved pay run posts wages, PAYG and super into ${connectorName ?? 'your financial system'}.`;
}
