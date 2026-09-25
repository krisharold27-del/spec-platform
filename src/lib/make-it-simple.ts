import { dollars, type Fact, type Recommendation } from './recommends';
import { FRICTION_KINDS } from './switch';

/**
 * Make it simple — the weekly report the COGS meeting opens with.
 *
 * Kris, 25 September: *"Every week, automatically before each business's COGS meeting ... Claude
 * reviews the business's real data and produces a short 'Make it simple' report"* — what got
 * simpler, the top three things still complicated each with a Claude recommends fix, what is ready
 * to switch, and any friction logged against the Simple Guarantee. *"Goal: out-simple every
 * competitor, every week, continuously."*
 *
 * Pure — no I/O. The signals are counts from the business's own rows (lib/make-it-simple-data);
 * nothing here is typed in or estimated. A friction with nothing behind it is not on the report,
 * and a report with nothing complicated says so rather than finding something to say.
 *
 * ── The five kinds of friction ──────────────────────────────────────────────────────────────────
 *
 * Kris named them: repeated manual steps, double handling, admin nobody likes, delays, errors. Each
 * signal below is filed under the one it is, so the meeting reads WHY it is on the list.
 */

export type FrictionKind = 'Repeated manual steps' | 'Double handling' | 'Admin nobody likes' | 'Delays' | 'Errors';

/** What SPEC can count this week, from the business's own rows. */
export interface Signals {
  /** Timesheet entries with no approval, and the oldest one's age in days. */
  timesheetsWaiting: number;
  oldestTimesheetDays: number;
  /** Invoices sent, unpaid, more than 30 days ago. */
  overdueInvoices: number;
  overdueCents: number;
  /** Meeting actions still open after three weeks or more. */
  carriedActions: number;
  /** Callbacks still open, and what going back has cost. */
  openCallbacks: number;
  callbackCostCents: number;
  /** Pay runs with an award issue still open, not yet sent. */
  payRunsWithIssues: number;
  /** Enquiries waiting more than two days for a price, and the oldest one's age. */
  staleEnquiries: number;
  oldestEnquiryDays: number;
}

export const NO_SIGNALS: Signals = {
  timesheetsWaiting: 0, oldestTimesheetDays: 0, overdueInvoices: 0, overdueCents: 0, carriedActions: 0,
  openCallbacks: 0, callbackCostCents: 0, payRunsWithIssues: 0, staleEnquiries: 0, oldestEnquiryDays: 0,
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface Friction {
  key: string;
  kind: FrictionKind;
  /** Higher goes first. Money and pay before tidiness. */
  priority: number;
  count: (s: Signals) => number;
  headline: (s: Signals) => string;
  reason: string;
  /** What the meeting agrees to do — becomes the action, word for word. */
  fix: string;
  href: string;
  facts: (s: Signals) => Fact[];
}

export const FRICTIONS: Friction[] = [
  {
    key: 'invoices', kind: 'Delays', priority: 6, href: '/jobs?tab=billing',
    count: s => s.overdueInvoices,
    headline: s => `${plural(s.overdueInvoices, 'invoice is', 'invoices are')} more than 30 days overdue — ${dollars(s.overdueCents)} outstanding.`,
    reason: 'Money already earned, sitting with customers. SPEC chases at 7, 14 and 30 days; past 30 it takes a person ringing.',
    fix: 'Ring each customer with an invoice over 30 days and agree a date to pay',
    facts: s => [{ label: 'Invoices over 30 days', value: String(s.overdueInvoices) }, { label: 'Outstanding on them', value: dollars(s.overdueCents) }],
  },
  {
    key: 'payruns', kind: 'Errors', priority: 5, href: '/people?mode=pay',
    count: s => s.payRunsWithIssues,
    headline: s => `${plural(s.payRunsWithIssues, 'pay run has', 'pay runs have')} award issues still open.`,
    reason: 'A pay run with an open award check cannot go out, and fixing pay after it has gone is the expensive way.',
    fix: 'Clear the open award issues before the next pay run',
    facts: s => [{ label: 'Pay runs with an open issue', value: String(s.payRunsWithIssues) }],
  },
  {
    key: 'callbacks', kind: 'Errors', priority: 4, href: '/jobs?tab=rework',
    count: s => s.openCallbacks,
    headline: s => `${plural(s.openCallbacks, 'callback is', 'callbacks are')} still open — ${dollars(s.callbackCostCents)} spent going back.`,
    reason: 'Every return trip is a job done twice. Closing each one with its cause is how the pattern shows up.',
    fix: 'Close out the open callbacks and record the cause of each',
    facts: s => [{ label: 'Open callbacks', value: String(s.openCallbacks) }, { label: 'Cost of going back so far', value: dollars(s.callbackCostCents) }],
  },
  {
    key: 'enquiries', kind: 'Delays', priority: 3, href: '/jobs?tab=leads',
    count: s => s.staleEnquiries,
    headline: s => `${plural(s.staleEnquiries, 'enquiry has', 'enquiries have')} waited more than 2 days for a price — the oldest ${s.oldestEnquiryDays} days.`,
    reason: 'Two days is where work is won or lost; after that the customer has usually asked somebody else.',
    fix: 'Price or book every enquiry older than two days, and keep the list under two days',
    facts: s => [{ label: 'Enquiries over 2 days', value: String(s.staleEnquiries) }, { label: 'Oldest', value: `${s.oldestEnquiryDays} days` }],
  },
  {
    key: 'timesheets', kind: 'Admin nobody likes', priority: 2, href: '/jobs?tab=time',
    count: s => s.timesheetsWaiting,
    headline: s => `${plural(s.timesheetsWaiting, 'timesheet entry is', 'timesheet entries are')} waiting for approval — the oldest ${s.oldestTimesheetDays} days.`,
    reason: 'Approval that waits turns into a Friday afternoon of checking, and pay built from hours nobody has looked at.',
    fix: 'Approve timesheets as they land, not in a batch at the end of the week',
    facts: s => [{ label: 'Waiting for approval', value: String(s.timesheetsWaiting) }, { label: 'Oldest', value: `${s.oldestTimesheetDays} days` }],
  },
  {
    key: 'carried', kind: 'Double handling', priority: 1, href: '/meeting',
    count: s => s.carriedActions,
    headline: s => `${plural(s.carriedActions, 'meeting action has', 'meeting actions have')} been carried three weeks or more.`,
    reason: 'An action carried three weeks is a decision nobody has made, talked about again every week.',
    fix: 'Decide each action carried three weeks or more: do it with a date, or drop it',
    facts: s => [{ label: 'Actions carried 3+ weeks', value: String(s.carriedActions) }],
  },
];

export const frictionOf = (key: string): Friction | null => FRICTIONS.find(f => f.key === key) ?? null;
export const simpleTopic = (key: string): string => `simple:${key}`;

/**
 * One friction, as a Claude recommends card. Accepting it in the meeting makes the fix an action with
 * an owner. Nothing behind it any more reads as sorted rather than disappearing without a word.
 */
export function frictionAdvice(key: string, s: Signals): Recommendation | null {
  const f = frictionOf(key);
  if (!f) return null;
  const facts = [...f.facts(s), { label: 'Why it is on the list', value: f.kind }];
  if (f.count(s) === 0) {
    return { kind: 'hold', topic: simpleTopic(key), headline: 'Sorted since the report — nothing waiting now.', reason: f.fix, facts };
  }
  return {
    kind: 'recommend', topic: simpleTopic(key), facts,
    headline: f.headline(s),
    reason: `${f.reason} Claude recommends: ${f.fix.charAt(0).toLowerCase()}${f.fix.slice(1)}.`,
    action: { type: 'meeting_action', key, text: f.fix },
    yes: 'Yes — make it an action',
  };
}

/** The top three still complicated, money first. Only what has something behind it. */
export function topFrictions(s: Signals, count = 3): Friction[] {
  return FRICTIONS.filter(f => f.count(s) > 0).sort((a, b) => b.priority - a.priority).slice(0, count);
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The schedule
 * ───────────────────────────────────────────────────────────────────────────── */

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export const isMeetingDay = (d: unknown): d is number => Number.isInteger(d) && (d as number) >= 1 && (d as number) <= 7;
export const isMeetingTime = (t: unknown): t is string => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
/** Monday = 1 … Sunday = 7. */
const weekdayOf = (d: Date) => ((d.getUTCDay() + 6) % 7) + 1;

/**
 * Which meeting a report is for: the next meeting day from today, or — with no day set — the Monday
 * of this week, so the report still runs weekly.
 */
export function meetingDateFor(now: Date, day: number | null): string {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (!isMeetingDay(day)) {
    return isoDay(new Date(today.getTime() - (weekdayOf(today) - 1) * 86_400_000));
  }
  const ahead = (day - weekdayOf(today) + 7) % 7;
  return isoDay(new Date(today.getTime() + ahead * 86_400_000));
}

/**
 * Whether it is time to write the report: from the day before the meeting. With no day set, any time
 * in the week. Early enough to be read, late enough that the numbers are this week's.
 */
export function isDue(now: Date, meetingDate: string, day: number | null): boolean {
  if (!isMeetingDay(day)) return true;
  const days = (Date.parse(`${meetingDate}T00:00:00Z`) - Date.parse(`${isoDay(now)}T00:00:00Z`)) / 86_400_000;
  return days <= 1;
}

export function scheduleLine(day: number | null, time: string | null): string | null {
  if (!isMeetingDay(day)) return null;
  return `${DAY_NAMES[day - 1]}${isMeetingTime(time) ? ` at ${time}` : ''}`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The report
 * ───────────────────────────────────────────────────────────────────────────── */

export interface SimpleReport {
  meetingDate: string;
  generatedAt: string;
  schedule: string | null;
  /** (1) What got simpler this week. */
  simpler: string[];
  /** (2) The top three still complicated, as they stood when the report was written. */
  frictions: { key: string; kind: FrictionKind; headline: string }[];
  signals: Signals;
  /** (3) What is ready to switch, or under way. */
  ready: { area: string; line: string; href: string }[];
  /** (4) Friction logged against the Simple Guarantee this week. */
  guarantee: { lines: string[]; months: string[] };
  /** Last week's accepted fixes, tracked to done. */
  tracked: { text: string; owner: string; done: boolean }[];
}

export interface ReportInput {
  meetingDate: string;
  now: Date;
  schedule: string | null;
  signals: Signals;
  previous: SimpleReport | null;
  /** Decisions carried out in the last seven days. */
  done: { headline: string }[];
  /** Actions the meeting accepted from earlier reports. */
  tracked: { text: string; owner: string; done: boolean }[];
  ready: { area: string; line: string; href: string }[];
  /** Friction logged in the last seven days — the kind's words and the business's own note. */
  friction: { kind: string; note: string | null; month: string }[];
}

/** A friction's count, said as the change since last week. */
function improved(previous: Signals, now: Signals): string[] {
  const out: string[] = [];
  for (const f of FRICTIONS) {
    const was = f.count(previous);
    const is = f.count(now);
    if (is < was) out.push(`${f.facts(now)[0].label}: ${was} → ${is}.`);
  }
  return out;
}

export function buildReport(input: ReportInput): SimpleReport {
  const simpler = [
    ...input.done.map(d => `Done: ${d.headline}`),
    ...input.tracked.filter(t => t.done).map(t => `${t.text} — done (${t.owner}).`),
    ...(input.previous ? improved(input.previous.signals, input.signals) : []),
  ];
  const labels = new Map<string, string>(FRICTION_KINDS.map(k => [k.key, k.label]));
  return {
    meetingDate: input.meetingDate,
    generatedAt: input.now.toISOString(),
    schedule: input.schedule,
    simpler: simpler.length ? simpler : ['Nothing SPEC can see got simpler this week.'],
    frictions: topFrictions(input.signals).map(f => ({ key: f.key, kind: f.kind, headline: f.headline(input.signals) })),
    signals: input.signals,
    ready: input.ready,
    guarantee: {
      lines: input.friction.map(f => `${labels.get(f.kind) ?? 'Something else'}${f.note ? ` — “${f.note}”` : ''}`),
      months: [...new Set(input.friction.map(f => f.month))],
    },
    tracked: input.tracked,
  };
}

/** Read back safely; a bad row is treated as no report rather than a broken meeting page. */
export function parseReport(raw: string): SimpleReport | null {
  try {
    const r = JSON.parse(raw) as SimpleReport;
    return r && typeof r.meetingDate === 'string' && Array.isArray(r.frictions) ? r : null;
  } catch {
    return null;
  }
}
