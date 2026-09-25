import { LONG_WEEK_HOURS, type PayRow } from './hr-records';
import type { Recommendation, Fact, Missing } from './recommends';

/**
 * SiteVIP's half of payroll: timesheet → reconcile → approve → send. Pure — no I/O.
 *
 * Kris, 25 September: *"payroll is split. SiteVIP's payroll job is the BASICS ONLY: who worked, on
 * which job, where, and when (hours, start/finish, breaks, travel, allowances like site/overtime
 * tags)."* A supervisor reconciles it (hours against jobs, gaps and clashes flagged, anything
 * unusual highlighted), approves it, and SiteVIP passes the approved timesheet on to whatever
 * payroll system the business uses — by export — or straight into Angus Shield's pay run when the
 * business has switched payroll to it. **SiteVIP does not calculate tax, super or payslips**, and
 * nothing in this file knows a pay rate.
 *
 * ── One place ───────────────────────────────────────────────────────────────────────────────────
 *
 * All four steps happen on Jobs › Time, because the person reconciling is the person approving and
 * usually the person sending (lib/workflows: nobody is sent to a second screen to finish one job).
 *
 * ── A pay week is seven days ────────────────────────────────────────────────────────────────────
 *
 * The Jobs week is Monday to Friday, which is right for booking crews and wrong for pay: Saturday's
 * overtime is still Saturday's overtime. Reconcile, approve and send all work on Monday to Sunday.
 */

export const ALLOWANCES = [
  { key: 'site', label: 'Site allowance' },
  { key: 'overtime', label: 'Overtime' },
  { key: 'meal', label: 'Meal allowance' },
] as const;

export type AllowanceKey = (typeof ALLOWANCES)[number]['key'];

export const isAllowance = (k: string): k is AllowanceKey => ALLOWANCES.some(a => a.key === k);

/** The tags as stored — unknown ones dropped, each once, in the list's own order. */
export function parseAllowances(raw: string | null | undefined): AllowanceKey[] {
  const given = new Set((raw ?? '').split(',').map(s => s.trim()));
  return ALLOWANCES.map(a => a.key).filter(k => given.has(k));
}

export const allowanceLabel = (k: string): string => ALLOWANCES.find(a => a.key === k)?.label ?? k;

const toMin = (t: string | null | undefined): number | null => {
  const m = (t ?? '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h < 24 && mi < 60 ? h * 60 + mi : null;
};

/** Paid minutes: start to finish, less the break. Null when the times do not make a stretch. */
export function paidMinutes(start: string, finish: string, breakMinutes = 0): number | null {
  const a = toMin(start), b = toMin(finish);
  if (a === null || b === null || b <= a) return null;
  const brk = Math.max(0, Math.round(breakMinutes));
  if (brk >= b - a) return null;
  return b - a - brk;
}

/** The seven days of the pay week that contains `day` — Monday to Sunday. */
export function payWeek(day: string): string[] {
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return [];
  const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000);
  return [0, 1, 2, 3, 4, 5, 6].map(i => new Date(monday.getTime() + i * 86_400_000).toISOString().slice(0, 10));
}

const isWeekend = (day: string) => {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6;
};

export interface Entry {
  id: string;
  personKey: string;
  personName: string;
  jobId: string | null;
  day: string;
  startedAt: string;
  finishedAt: string | null;
  minutes: number;
  breakMinutes: number;
  travelMinutes: number;
  allowances: string;
  approvedAt: string | null;
}

export interface Booking { personKey: string; jobId: string; day: string }
export interface JobRef { id: string; ref: string; site: string; stage: string }

export type FlagKind =
  | 'running' | 'clash'                                        // blocking — cannot be approved as it stands
  | 'booked_no_time' | 'time_not_booked' | 'no_break' | 'long_day' | 'weekend' | 'long_week' | 'closed_job';

export interface Flag {
  kind: FlagKind;
  /** Blocking flags hold their entries back from approval. The rest are for a person to look at. */
  blocking: boolean;
  who: string;
  day: string;
  says: string;
  /** The entries it is about — empty for a gap, where the problem is time that is NOT there. */
  entryIds: string[];
}

const hours = (minutes: number) => Math.round((minutes / 60) * 10) / 10;

/** Longer than this in a day with no break recorded is worth a look. */
export const NO_BREAK_AFTER_MINUTES = 6 * 60;
/** More paid time than this in one day is worth a look. */
export const LONG_DAY_MINUTES = 12 * 60;

/**
 * Reconcile a week: the hours against the jobs and the bookings, and anything unusual.
 *
 *   running         started, never finished — cannot be paid as it stands.        blocking
 *   clash           two stretches for one person that overlap.                    blocking
 *   booked_no_time  booked on a job that day, no time on it — a gap.
 *   time_not_booked time on a job the person was not booked on that day.
 *   closed_job      time on a job already invoiced or paid.
 *   no_break        a long day with no break recorded.
 *   long_day        more than twelve paid hours in one day.
 *   weekend         weekend time not tagged overtime.
 *   long_week       over the ordinary 38 hours in the week.
 */
export function reconcile(entries: readonly Entry[], bookings: readonly Booking[], jobs: readonly JobRef[]): Flag[] {
  const flags: Flag[] = [];
  const refOf = (id: string | null) => (id ? jobs.find(j => j.id === id)?.ref ?? 'a job' : 'no job');
  const nameOf = new Map(entries.map(e => [e.personKey, e.personName]));

  for (const e of entries) {
    if (!e.finishedAt) {
      flags.push({ kind: 'running', blocking: true, who: e.personName, day: e.day, entryIds: [e.id], says: `Started ${e.startedAt} on ${refOf(e.jobId)} and never finished.` });
    }
  }

  // Person-days.
  const days = new Map<string, Entry[]>();
  for (const e of entries) days.set(`${e.personKey}|${e.day}`, [...(days.get(`${e.personKey}|${e.day}`) ?? []), e]);

  for (const [key, mine] of days) {
    const [, day] = key.split('|');
    const who = mine[0].personName;
    const done = mine.filter(e => e.finishedAt).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    for (let i = 1; i < done.length; i++) {
      const prev = done[i - 1], cur = done[i];
      if ((toMin(cur.startedAt) ?? 0) < (toMin(prev.finishedAt) ?? 0)) {
        flags.push({ kind: 'clash', blocking: true, who, day, entryIds: [prev.id, cur.id], says: `${prev.startedAt}–${prev.finishedAt} on ${refOf(prev.jobId)} overlaps ${cur.startedAt}–${cur.finishedAt} on ${refOf(cur.jobId)}.` });
      }
    }
    const paid = done.reduce((n, e) => n + e.minutes, 0);
    const breaks = done.reduce((n, e) => n + e.breakMinutes, 0);
    if (paid > LONG_DAY_MINUTES) {
      flags.push({ kind: 'long_day', blocking: false, who, day, entryIds: done.map(e => e.id), says: `${hours(paid)} paid hours in one day.` });
    }
    if (paid > NO_BREAK_AFTER_MINUTES && breaks === 0) {
      flags.push({ kind: 'no_break', blocking: false, who, day, entryIds: done.map(e => e.id), says: `${hours(paid)} hours with no break recorded.` });
    }
    if (isWeekend(day) && done.some(e => !parseAllowances(e.allowances).includes('overtime'))) {
      flags.push({ kind: 'weekend', blocking: false, who, day, entryIds: done.map(e => e.id), says: 'Weekend time not tagged overtime.' });
    }
    for (const e of done) {
      if (!e.jobId) continue;
      const job = jobs.find(j => j.id === e.jobId);
      if (job && (job.stage === 'invoiced' || job.stage === 'paid')) {
        flags.push({ kind: 'closed_job', blocking: false, who, day, entryIds: [e.id], says: `Time on ${job.ref}, which is already ${job.stage}.` });
      }
      if (!bookings.some(b => b.personKey === e.personKey && b.jobId === e.jobId && b.day === day)) {
        flags.push({ kind: 'time_not_booked', blocking: false, who, day, entryIds: [e.id], says: `Time on ${refOf(e.jobId)} without being booked on it that day.` });
      }
    }
  }

  // Gaps: booked, and no time on that job that day.
  for (const b of bookings) {
    const onIt = entries.some(e => e.personKey === b.personKey && e.jobId === b.jobId && e.day === b.day);
    if (!onIt) {
      flags.push({ kind: 'booked_no_time', blocking: false, who: nameOf.get(b.personKey) ?? 'Somebody booked', day: b.day, entryIds: [], says: `Booked on ${refOf(b.jobId)} and no time recorded on it.` });
    }
  }

  // The week.
  const week = new Map<string, number>();
  for (const e of entries) if (e.finishedAt) week.set(e.personName, (week.get(e.personName) ?? 0) + e.minutes);
  for (const [who, minutes] of week) {
    if (hours(minutes) > LONG_WEEK_HOURS) {
      flags.push({ kind: 'long_week', blocking: false, who, day: '', entryIds: [], says: `${hours(minutes)} hours in the week, over the ordinary ${LONG_WEEK_HOURS}.` });
    }
  }

  return flags.sort((a, b) => Number(b.blocking) - Number(a.blocking) || a.day.localeCompare(b.day) || a.who.localeCompare(b.who));
}

/** Waiting, finished, and not held back by a blocking flag. */
export function approvable(entries: readonly Entry[], flags: readonly Flag[]): string[] {
  const held = new Set(flags.filter(f => f.blocking).flatMap(f => f.entryIds));
  return entries.filter(e => !e.approvedAt && e.finishedAt && !held.has(e.id)).map(e => e.id);
}

export const approveTopic = (monday: string): string => `timesheets:${monday}`;

const weekWords = (monday: string) =>
  new Date(`${monday}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * The approve step, as a Claude recommends card: how many entries can be approved, what needs a look
 * first, and the numbers behind it. Yes approves the entries SPEC listed as approvable — never one
 * a blocking flag is holding back.
 */
export function approveAdvice(monday: string, entries: readonly Entry[], flags: readonly Flag[]): Recommendation {
  const topic = approveTopic(monday);
  const ready = approvable(entries, flags);
  const waiting = entries.filter(e => !e.approvedAt);
  const paid = entries.filter(e => e.finishedAt).reduce((n, e) => n + e.minutes, 0);
  const tags = new Map<string, number>();
  for (const e of entries) for (const t of parseAllowances(e.allowances)) tags.set(t, (tags.get(t) ?? 0) + 1);
  const people = new Set(entries.map(e => e.personKey)).size;
  const blocking = flags.filter(f => f.blocking);
  const checks = flags.filter(f => !f.blocking);

  const facts: Fact[] = [
    { label: 'People', value: String(people) },
    { label: 'Paid hours', value: String(hours(paid)), note: 'start to finish, less breaks' },
    { label: 'Breaks', value: `${hours(entries.reduce((n, e) => n + e.breakMinutes, 0))} h` },
    { label: 'Travel', value: `${hours(entries.reduce((n, e) => n + e.travelMinutes, 0))} h` },
    ...ALLOWANCES.map(a => ({ label: a.label, value: String(tags.get(a.key) ?? 0), note: 'entries tagged' })),
    { label: 'Held back', value: String(blocking.length), note: 'clashes and unfinished time' },
    { label: 'Worth a look', value: String(checks.length), note: 'gaps, unbooked time, long days and the rest' },
  ];

  if (!entries.length) {
    return {
      kind: 'missing', topic, facts: [],
      headline: `No time recorded for the week of ${weekWords(monday)} yet.`,
      missing: [{ what: 'Hours from Start and Finish on the phone, or typed in below', href: '/tech-day' }],
    };
  }
  if (!waiting.length) {
    return { kind: 'hold', topic, facts, headline: `All approved for the week of ${weekWords(monday)}.`, reason: 'Ready to send to payroll.' };
  }
  if (!ready.length) {
    const missing: Missing[] = blocking.map(f => ({ what: `${f.who}, ${f.day}: ${f.says}` }));
    return { kind: 'missing', topic, facts, headline: 'Nothing can be approved until these are sorted.', missing };
  }

  const look = checks.length + blocking.length;
  return {
    kind: 'recommend', topic, facts,
    headline: `Approve ${ready.length} ${ready.length === 1 ? 'entry' : 'entries'} for the week of ${weekWords(monday)}${look ? ` — ${look} ${look === 1 ? 'thing needs' : 'things need'} a look first` : ' — nothing unusual'}.`,
    reason: look
      ? `${blocking.length ? `${blocking.length} held back until fixed (${blocking.map(f => f.kind === 'clash' ? 'a clash' : 'unfinished time').join(', ')}). ` : ''}${checks.length ? `${checks.length} worth checking before you say yes: ${[...new Set(checks.map(f => FLAG_WORDS[f.kind]))].join(', ')}.` : ''}`.trim()
      : 'Every entry matches a booking, has its break and sits inside an ordinary week.',
    action: { type: 'approve_timesheets', week: monday },
    yes: `Yes, approve ${ready.length}`,
  };
}

export const FLAG_WORDS: Record<FlagKind, string> = {
  running: 'unfinished time',
  clash: 'overlapping time',
  booked_no_time: 'booked with no time',
  time_not_booked: 'time on a job not booked',
  closed_job: 'time on a finished job',
  no_break: 'long days with no break',
  long_day: 'very long days',
  weekend: 'weekend time not tagged overtime',
  long_week: 'over 38 hours',
};

/* ─────────────────────────────────────────────────────────────────────────────
 * Send
 * ───────────────────────────────────────────────────────────────────────────── */

export type Destination = 'export' | 'angus_shield';

/**
 * Where approved hours go. Angus Shield only when the business holds a live Angus Shield connection
 * (the contract's one yes) — then hours go on approval and there is no export step at all. Otherwise
 * a file, in the columns any payroll system imports: the own-system path, always complete.
 */
export const destinationFor = (angusConnected: boolean): Destination => (angusConnected ? 'angus_shield' : 'export');

/**
 * Whether the week can go: something approved, nothing still waiting, not already sent. A week with
 * one entry unapproved waits for it, because anything sent without it would be paid short and fixed
 * by hand afterwards — the double handling this whole flow exists to remove.
 */
export function maySend(entries: readonly Entry[], sentAt: string | null): { ok: boolean; why: string } {
  if (sentAt) return { ok: false, why: `Sent ${sentAt.slice(0, 10)}.` };
  const approved = entries.filter(e => e.approvedAt).length;
  const waiting = entries.filter(e => !e.approvedAt).length;
  if (!approved) return { ok: false, why: 'Nothing approved yet.' };
  if (waiting) return { ok: false, why: `${waiting} ${waiting === 1 ? 'entry is' : 'entries are'} still waiting for approval.` };
  return { ok: true, why: '' };
}

export function sentLine(sentTo: string | null, sentAt: string | null): string {
  if (!sentAt) return 'Not sent yet.';
  return sentTo === 'angus_shield'
    ? `In Angus Shield’s pay run since ${sentAt.slice(0, 10)}.`
    : `Sent to your payroll system ${sentAt.slice(0, 10)}.`;
}

/** The columns a payroll system imports. Hours only — no rate, no tax, no super, ever. */
export const PAY_HEADER = ['Person', 'Date', 'Job', 'Site', 'Start', 'Finish', 'Break (min)', 'Travel (min)', 'Paid hours', 'Allowances'] as const;

export function payLines(entries: readonly Entry[], jobs: readonly JobRef[]): (string | number)[][] {
  return entries
    .filter(e => e.approvedAt && e.finishedAt)
    .sort((a, b) => a.personName.localeCompare(b.personName) || a.day.localeCompare(b.day) || a.startedAt.localeCompare(b.startedAt))
    .map(e => {
      const job = e.jobId ? jobs.find(j => j.id === e.jobId) : null;
      return [
        e.personName, e.day, job?.ref ?? '', job?.site ?? '', e.startedAt, e.finishedAt ?? '',
        e.breakMinutes, e.travelMinutes, hours(e.minutes),
        parseAllowances(e.allowances).map(allowanceLabel).join('; '),
      ];
    });
}

/** The pay run's own summary rows — whose hours, and how many — kept on the run as it was sent. */
export function runRows(entries: readonly Entry[]): PayRow[] {
  const by = new Map<string, { minutes: number; jobs: Set<string> }>();
  for (const e of entries) {
    if (!e.approvedAt || !e.finishedAt) continue;
    const seen = by.get(e.personName) ?? { minutes: 0, jobs: new Set<string>() };
    seen.minutes += e.minutes;
    if (e.jobId) seen.jobs.add(e.jobId);
    by.set(e.personName, seen);
  }
  return [...by].map(([who, v]) => ({ who, minutes: v.minutes, jobs: v.jobs.size }));
}
