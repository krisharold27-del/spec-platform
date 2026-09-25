import { money as ledgerCell } from './xero';
import { money } from './jobs';

/**
 * Financials — the money, on its own page, in the words a tradie uses. Pure, no I/O.
 *
 * Kris, 25 September: *"can't see financials"* — they were buried inside the Virtual GM, and the
 * bar had nothing for money. So /financials is a key area beside People, and it answers three things:
 *
 *   The money at a glance: cash, profit this month against last, the GST you pay the ATO, what
 *   payroll cost, who owes you, who you owe, and what needs you.
 *
 *   Payroll: who worked, on which job, where and when — reconciled, approved, and sent to whoever
 *   runs the pay.
 *
 *   Your financial system: which one, connected or uploaded, and Angus Shield as the option. Always
 *   the business's choice; Angus recommended, never forced.
 *
 * ── Where a figure comes from, and the one rule about it ─────────────────────────────────────────
 *
 * The books are the master (the Angus Shield contract, section 2), so a figure read from the books —
 * a connected accounting system, or a file exported from it — wins over SiteVIP's own. SiteVIP's own
 * invoices and supplier bills fill "who owes us" and "who we owe" only when the books have not said,
 * and the tile says that is where it came from.
 *
 * A figure nobody has given is NOT zero. It is left empty and the tile says "Not in yet" — never a
 * made-up number, and never red. See `money` in lib/xero for the same rule on a report's cells.
 */

/* ─────────────────────────────────────────────────────────────────────────────
 * The figures
 * ───────────────────────────────────────────────────────────────────────────── */

export type FigureKey = 'cash' | 'profitThis' | 'profitLast' | 'gst' | 'payroll' | 'owedToUs' | 'weOwe';

/** Every figure in cents, or null when nobody has given it. */
export type Figures = Record<FigureKey, number | null>;

export const NO_FIGURES: Figures = {
  cash: null, profitThis: null, profitLast: null, gst: null, payroll: null, owedToUs: null, weOwe: null,
};

export type Source = 'ledger' | 'upload' | 'sitevip';

export const SOURCE_WORDS: Record<Source, string> = {
  ledger: 'from your accounting system',
  upload: 'from the file you uploaded',
  sitevip: 'from SiteVIP’s own invoices and bills',
};

/* ─────────────────────────────────────────────────────────────────────────────
 * Reading an exported file — Xero or MYOB, saved as CSV
 * ───────────────────────────────────────────────────────────────────────────── */

/** One CSV line into cells. Quoted cells may hold commas and doubled quotes. */
export function csvCells(line: string): string[] {
  const out: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cell); cell = ''; }
    else cell += ch;
  }
  out.push(cell);
  return out.map(c => c.trim());
}

/**
 * The line labels each figure is found by — by NAME, never by position, for the same reason as
 * `grossProfit` in lib/xero: every chart of accounts is different, and a reader that counts rows is
 * quietly wrong on the second business it meets.
 *
 * Xero's and MYOB's own report wording first, then the plain words somebody would type into a
 * spreadsheet of their own.
 */
const LABELS: { key: FigureKey | 'profit' | 'gstCollected' | 'gstPaid'; test: RegExp }[] = [
  { key: 'profitThis', test: /^profit this month$/ },
  { key: 'profitLast', test: /^profit last month$/ },
  { key: 'profit', test: /^(net profit|net income|net profit\s*\/?\s*\(loss\)|net profit \(loss\)|net loss|profit)$/ },
  { key: 'cash', test: /^(total bank|total cash|total cash at bank|cash at bank|cash on hand|cash|bank|total bank accounts)$/ },
  { key: 'gst', test: /^(gst|gst owing|gst payable|gst liability|total gst|gst to pay|net gst|bas owing)$/ },
  { key: 'gstCollected', test: /^gst collected$/ },
  { key: 'gstPaid', test: /^gst paid$/ },
  { key: 'payroll', test: /^(total )?(wages and salaries|wages & salaries|wages|salaries|payroll|payroll cost|salaries and wages|wages and salaries expense)$/ },
  { key: 'owedToUs', test: /^(total )?(accounts receivable|trade debtors|debtors|who owes us|owed to us)$/ },
  { key: 'weOwe', test: /^(total )?(accounts payable|trade creditors|creditors|who we owe|we owe)$/ },
];

const normal = (label: string) => label.toLowerCase().replace(/\s+/g, ' ').replace(/[:*]/g, '').trim();

export interface FileRead {
  figures: Figures;
  /** Which figures the file gave, in the order the tiles draw them. */
  found: FigureKey[];
}

/**
 * The figures out of an exported report.
 *
 * A Profit and Loss with two columns (this month, last month) gives both profits; one column gives
 * this month only. A Balance Sheet gives cash, GST, who owes you and who you owe. Several files can
 * be read one after another with `mergeFigures` — the first to give a figure keeps it.
 */
export function readLedgerFile(text: string): FileRead {
  const figures: Figures = { ...NO_FIGURES };
  let gstIn: number | null = null;
  let gstOut: number | null = null;
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).slice(0, 5000);

  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = csvCells(line);
    const label = normal(cells[0] ?? '');
    if (!label) continue;
    const hit = LABELS.find(l => l.test.test(label));
    if (!hit) continue;
    const amounts = cells.slice(1).map(ledgerCell).filter((n): n is number => n !== null);
    if (!amounts.length) continue;
    const cents = amounts.map(a => Math.round(a * 100));

    if (hit.key === 'profit') {
      if (figures.profitThis === null) figures.profitThis = cents[0];
      if (figures.profitLast === null && cents.length > 1) figures.profitLast = cents[1];
    } else if (hit.key === 'gstCollected') {
      gstIn ??= cents[0];
    } else if (hit.key === 'gstPaid') {
      gstOut ??= cents[0];
    } else if (figures[hit.key] === null) {
      figures[hit.key] = cents[0];
    }
  }
  if (figures.gst === null && gstIn !== null) figures.gst = gstIn - Math.abs(gstOut ?? 0);

  return { figures, found: ORDER.filter(k => figures[k] !== null) };
}

/** The first source to give a figure keeps it. */
export function mergeFigures(...all: Figures[]): Figures {
  const out: Figures = { ...NO_FIGURES };
  for (const f of all) for (const k of ORDER) if (out[k] === null && f[k] !== null) out[k] = f[k];
  return out;
}

const ORDER: FigureKey[] = ['cash', 'profitThis', 'profitLast', 'gst', 'payroll', 'owedToUs', 'weOwe'];

/* ─────────────────────────────────────────────────────────────────────────────
 * The money at a glance
 *
 * Kris's brief, 25 September: one headline number at the top — cash in the bank — then no more than
 * six calm tiles, each one number and one plain line. A dot only when something needs attention:
 * amber for "have a look", red only for money actually going the wrong way (a loss, an overdrawn
 * bank). Nothing pending is ever coloured.
 * ───────────────────────────────────────────────────────────────────────────── */

export type Dot = 'green' | 'amber' | 'red';

export interface Tile {
  key: 'profit' | 'gst' | 'payroll' | 'owedToUs' | 'weOwe';
  label: string;
  /** "$12,400", or null when it is not in yet. */
  value: string | null;
  /** The line under the number — plain words, never a lecture. */
  says: string;
  dot?: Dot;
  source: Source | null;
  href?: string;
}

export interface Headline {
  label: string;
  value: string | null;
  says: string;
  dot?: Dot;
  source: Source | null;
}

export interface GlanceInput {
  figures: Figures;
  /** Where each figure came from. */
  sources: Partial<Record<FigureKey, Source>>;
  /** Overdue, from SiteVIP's own invoices. */
  overdueCents?: number;
  /** Supplier bills over what was ordered, from SiteVIP's own purchase orders. */
  billsOverOrder?: number;
}

const NOT_IN = 'Not in yet';

export function headline({ figures: f, sources }: GlanceInput): Headline {
  if (f.cash === null) return { label: 'Cash in the bank', value: null, says: NOT_IN, source: null };
  return {
    label: 'Cash in the bank', value: money(f.cash),
    says: f.cash < 0 ? 'Overdrawn.' : 'Across your bank accounts.',
    dot: f.cash < 0 ? 'red' : undefined,
    source: sources.cash ?? null,
  };
}

export function glance({ figures: f, sources, overdueCents = 0, billsOverOrder = 0 }: GlanceInput): Tile[] {
  const profit = ((): { says: string; dot?: Dot } => {
    if (f.profitThis === null) return { says: NOT_IN };
    const loss = f.profitThis < 0 ? 'red' as const : undefined;
    if (f.profitLast === null) return { says: 'This month so far.', dot: loss };
    const diff = f.profitThis - f.profitLast;
    if (Math.abs(diff) < 100) return { says: 'Same as last month.', dot: loss };
    return diff > 0
      ? { says: `Up ${money(diff)} on last month.`, dot: loss }
      : { says: `Down ${money(-diff)} on last month.`, dot: loss ?? 'amber' };
  })();

  return [
    {
      key: 'profit', label: 'Profit this month', value: f.profitThis === null ? null : money(f.profitThis),
      says: profit.says, dot: profit.dot, source: sources.profitThis ?? null, href: '/virtual-gm',
    },
    {
      key: 'owedToUs', label: 'Who owes you', value: f.owedToUs === null ? null : money(f.owedToUs),
      says: f.owedToUs === null ? NOT_IN
        : overdueCents > 0 ? `${money(overdueCents)} of it is overdue.`
        : f.owedToUs === 0 ? 'Nobody. Every invoice is paid.' : 'Nothing overdue.',
      dot: overdueCents > 0 ? 'amber' : undefined,
      source: sources.owedToUs ?? null, href: '/jobs?tab=billing',
    },
    {
      key: 'weOwe', label: 'Who you owe', value: f.weOwe === null ? null : money(f.weOwe),
      says: f.weOwe === null ? NOT_IN
        : billsOverOrder > 0 ? `${billsOverOrder} ${billsOverOrder === 1 ? 'bill is' : 'bills are'} over the order.`
        : f.weOwe === 0 ? 'Nothing. Every bill is paid.' : 'Supplier bills still to pay.',
      dot: billsOverOrder > 0 ? 'amber' : undefined,
      source: sources.weOwe ?? null, href: '/jobs?tab=stock',
    },
    {
      key: 'gst', label: 'GST to pay the ATO', value: f.gst === null ? null : money(Math.max(0, f.gst)),
      says: f.gst === null ? NOT_IN : f.gst > 0 ? 'Keep it aside — it isn’t yours.' : 'Nothing to pay. A refund is due.',
      source: sources.gst ?? null,
    },
    {
      key: 'payroll', label: 'Wages this month', value: f.payroll === null ? null : money(f.payroll),
      says: f.payroll === null ? NOT_IN : 'What the crew cost, from the books.', source: sources.payroll ?? null,
      href: '#payroll',
    },
  ];
}

/** Whether any figure at all is in — the line between the full page and the welcome. */
export const anyFigure = (f: Figures): boolean => ORDER.some(k => f[k] !== null);

/* ─────────────────────────────────────────────────────────────────────────────
 * What needs you
 * ───────────────────────────────────────────────────────────────────────────── */

export interface NeedsInput {
  figures: Figures;
  timesheetsWaiting: number;
  invoicesToChase: number;
  overdueCents: number;
  billsOverOrder: number;
  payRun: PayRunState;
  ledger: 'none' | 'named' | 'choose' | 'linked' | 'broken';
  /** When the uploaded file was read, if the figures lean on one. */
  uploadedAt: string | null;
  today: string;
}

export interface Need {
  key: string;
  says: string;
  /** The one thing to do — every miss carries its fix. */
  action: string;
  href: string;
}

/**
 * Everything waiting on the owner, most expensive first. Each one names what to do and where —
 * solutions, not commentary. Nothing here is red: waiting is not failing.
 */
export function whatNeedsYou(n: NeedsInput): Need[] {
  const out: Need[] = [];
  const plural = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

  if (n.ledger === 'broken') {
    out.push({ key: 'ledger', says: 'Your accounting system stopped connecting.', action: 'Reconnect it', href: '/connections' });
  }
  if (n.invoicesToChase > 0) {
    out.push({
      key: 'chase', says: `${plural(n.invoicesToChase, 'invoice needs', 'invoices need')} chasing${n.overdueCents > 0 ? ` — ${money(n.overdueCents)} overdue` : ''}.`,
      action: 'Chase them', href: '/jobs?tab=billing',
    });
  }
  // GST is on its own tile already; repeating it here would be saying the same thing twice.
  if (n.figures.profitThis !== null && n.figures.profitLast !== null && n.figures.profitThis < n.figures.profitLast - 100) {
    out.push({
      key: 'profit', says: `Profit is down ${money(n.figures.profitLast - n.figures.profitThis)} on last month.`,
      action: 'See the levers to pull', href: '/virtual-gm',
    });
  }
  if (n.timesheetsWaiting > 0) {
    out.push({
      key: 'timesheets', says: `${plural(n.timesheetsWaiting, 'timesheet is', 'timesheets are')} waiting on your approval.`,
      action: 'Approve the week', href: '/jobs?tab=time',
    });
  }
  if (n.payRun === 'issues') {
    out.push({ key: 'payrun', says: 'The pay run has somebody under the award.', action: 'Fix it before it goes', href: '/people?mode=pay' });
  } else if (n.payRun === 'checked') {
    out.push({ key: 'payrun', says: 'The pay run is checked and not sent.', action: 'Send it to payroll', href: '/people?mode=pay' });
  }
  if (n.billsOverOrder > 0) {
    out.push({
      key: 'bills', says: `${plural(n.billsOverOrder, 'supplier bill is', 'supplier bills are')} over what was ordered.`,
      action: 'Check them before you pay', href: '/jobs?tab=stock',
    });
  }
  if (n.uploadedAt && daysBetween(n.uploadedAt.slice(0, 10), n.today) > 35) {
    out.push({ key: 'stale', says: `Your figures are from a file uploaded ${n.uploadedAt.slice(0, 10)}.`, action: 'Upload this month’s', href: '#your-system' });
  }
  return out;
}

const daysBetween = (a: string, b: string): number =>
  Math.floor((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/* ─────────────────────────────────────────────────────────────────────────────
 * Payroll — timesheet to pay, four steps
 * ───────────────────────────────────────────────────────────────────────────── */

/** The latest pay run: none built, built with an award issue, checked and not sent, or sent. */
export type PayRunState = 'none' | 'issues' | 'checked' | 'sent';

export interface TimesheetRow {
  personKey: string;
  personName: string;
  jobId: string | null;
  day: string;
  minutes: number;
  finishedAt: string | null;
  approvedAt: string | null;
}

export interface WorkedRow {
  who: string;
  hours: number;
  /** The jobs worked on, as "J-1001 · 12 Smith St". */
  jobs: string[];
  days: number;
  waiting: number;
}

export interface PayrollFlow {
  worked: WorkedRow[];
  totalHours: number;
  /** Clock-ons with no clock-off — the only thing that genuinely stops a week reconciling. */
  open: number;
  /** Hours not on any job — allowed, and worth a look before it is paid. */
  offJobHours: number;
  waiting: number;
  approved: number;
  /** Hours in → Checked → Sent to pay. Kris's brief: three steps, not four. */
  steps: { key: 'in' | 'checked' | 'sent'; title: string; says: string; done: boolean }[];
  /** The one thing to do next, and where. */
  next: { label: string; href: string } | null;
}

const hrs = (minutes: number) => Math.round((minutes / 60) * 10) / 10;

/**
 * The week's timesheets walked through to pay: who worked, on which job, where and when; reconciled
 * and approved (Checked); then sent to whoever runs the pay — the business's own payroll system, or
 * Angus Shield once switched.
 *
 * `jobLabel` turns a job id into its reference and site — where the work was.
 */
export function payrollFlow(
  entries: readonly TimesheetRow[],
  jobLabel: (jobId: string) => string | null,
  payRun: PayRunState,
  payTo: string,
): PayrollFlow {
  const byPerson = new Map<string, TimesheetRow[]>();
  for (const e of entries) byPerson.set(e.personKey, [...(byPerson.get(e.personKey) ?? []), e]);

  const worked: WorkedRow[] = [...byPerson.values()].map(rows => ({
    who: rows[0].personName,
    hours: hrs(rows.reduce((t, r) => t + r.minutes, 0)),
    jobs: [...new Set(rows.map(r => (r.jobId ? jobLabel(r.jobId) : null)).filter((j): j is string => !!j))],
    days: new Set(rows.map(r => r.day)).size,
    waiting: rows.filter(r => r.finishedAt && !r.approvedAt).length,
  })).sort((a, b) => a.who.localeCompare(b.who));

  const open = entries.filter(e => !e.finishedAt).length;
  const offJobHours = hrs(entries.filter(e => !e.jobId).reduce((t, e) => t + e.minutes, 0));
  const waiting = entries.filter(e => e.finishedAt && !e.approvedAt).length;
  const approved = entries.filter(e => e.approvedAt).length;
  const totalHours = hrs(entries.reduce((t, e) => t + e.minutes, 0));
  const any = entries.length > 0;
  const checked = any && open === 0 && waiting === 0;
  const people = `${worked.length} ${worked.length === 1 ? 'person' : 'people'}`;

  const next = !any ? null
    : open > 0 ? { label: `Finish ${open} open ${open === 1 ? 'clock-on' : 'clock-ons'}`, href: '/jobs?tab=time' }
    : waiting > 0 ? { label: 'Approve the week', href: '/jobs?tab=time' }
    : payRun === 'sent' ? null
    : payRun === 'issues' ? { label: 'Fix the pay run', href: '/people?mode=pay' }
    : { label: payRun === 'checked' ? `Send to ${payTo}` : 'Build the pay run', href: '/people?mode=pay' };

  return {
    worked, totalHours, open, offJobHours, waiting, approved, next,
    steps: [
      {
        key: 'in', title: 'Hours in',
        says: any ? `${totalHours} hrs from ${people}, on the job from the phone.` : 'Nobody has clocked on this week yet.',
        done: any,
      },
      {
        key: 'checked', title: 'Checked',
        says: !any ? 'Reconciled and approved, once hours are in.'
          : open > 0 ? `${open} ${open === 1 ? 'clock-on has' : 'clock-ons have'} no finish time.`
          : waiting > 0 ? `${waiting} waiting on your approval.`
          : offJobHours > 0 ? `All approved. ${offJobHours} hrs not on a job.`
          : 'Every hour finished, on a job and approved.',
        done: checked,
      },
      {
        key: 'sent', title: 'Sent to pay',
        says: payRun === 'sent' ? `The last pay run went to ${payTo}.`
          : payRun === 'checked' ? `Award-checked. Ready for ${payTo}.`
          : payRun === 'issues' ? 'Somebody is under the award — fixed first.'
          : `Goes to ${payTo} once checked.`,
        done: payRun === 'sent',
      },
    ],
  };
}
