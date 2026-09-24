/**
 * The tech's day on the phone — designs/SPEC Tech Day.dc.html.
 *
 *   Sign the SWMS → Start the job → Add photos → Materials used → Client sign-off → Finish
 *
 * and the timesheet builds itself from Start and Finish. Nobody types hours.
 *
 * Pure: state in, state out, no clock read inside (the time is always passed in), so every rule is
 * tested directly and the page is only the buttons.
 *
 * ── The order, and why it is not "tap anything" ─────────────────────────────────────────────────
 *
 * The design lets any step be ticked in any order. Two of them cannot be, in the real thing:
 *
 *   · Nobody starts work before the SWMS is signed. That is the point of a SWMS.
 *   · Photos, materials and sign-off are things that happen ON a job, so they wait for Start —
 *     otherwise hours would be missing from the very job the materials were costed to.
 *
 * Past Start, the three are in any order — a client may sign before the last photo — and Finish is
 * offered only when all five are done, because Finish is what stops the clock and sends it in.
 */

export type StepKey = 'swms' | 'start' | 'photos' | 'materials' | 'sign';

export interface Step {
  key: StepKey;
  label: string;
  /** What the step is, before it is done. */
  sub: string;
  /** Steps that must be done first. */
  after: StepKey[];
}

export const STEPS: readonly Step[] = [
  { key: 'swms', label: 'Sign the SWMS', sub: 'Read it, then sign it before any work starts', after: [] },
  { key: 'start', label: 'Start the job', sub: 'Starts your hours on this job', after: ['swms'] },
  { key: 'photos', label: 'Add photos', sub: 'Before, during and after', after: ['start'] },
  { key: 'materials', label: 'Materials used', sub: 'What went in, so it lands on the job costing', after: ['start'] },
  { key: 'sign', label: 'Client sign-off', sub: 'They sign on your phone', after: ['start'] },
];

export interface Material {
  name: string;
  qty: number;
}

export interface TechJob {
  title: string;
  site: string;
  /**
   * The job on the office's schedule this is, when it is one (23 September). Null for a job the tech
   * named themselves — their hours still reach the timesheets, as time not on a scheduled job.
   */
  jobId?: string | null;
  /** "J-1004", for the phone to show. */
  ref?: string | null;
}

/** Everything the phone holds about one job's day. Serialisable, so it survives a reload. */
export interface TechDayState {
  job: TechJob | null;
  /** ISO timestamps. */
  swmsSignedAt: string | null;
  /** Who signed the SWMS — the tech's own name. */
  swmsSignedBy: string | null;
  startedAt: string | null;
  photos: number;
  /** null until the tech has said what was used — [] is a real answer: nothing. */
  materials: Material[] | null;
  signedBy: string | null;
  signedAt: string | null;
  finishedAt: string | null;
  /**
   * The office's timesheet entry Start opened — set once the office has it. Null means the hours
   * are still only on this phone (no signal at Start), and Finish says so.
   */
  entryId: string | null;
}

export const EMPTY_DAY: TechDayState = {
  job: null,
  swmsSignedAt: null,
  swmsSignedBy: null,
  startedAt: null,
  photos: 0,
  materials: null,
  signedBy: null,
  signedAt: null,
  finishedAt: null,
  entryId: null,
};

export type TechDayAction =
  | { type: 'open'; job: TechJob }
  | { type: 'swms'; by: string; at: string }
  | { type: 'start'; at: string }
  | { type: 'photos'; count: number }
  | { type: 'materials'; items: Material[] }
  | { type: 'sign'; by: string; at: string }
  | { type: 'finish'; at: string }
  /** The office has the Start: the timesheet entry it wrote. */
  | { type: 'saved'; entryId: string }
  | { type: 'reset' };

/** Is this step done? */
export function isDone(s: TechDayState, key: StepKey): boolean {
  switch (key) {
    case 'swms': return !!s.swmsSignedAt;
    case 'start': return !!s.startedAt;
    case 'photos': return s.photos > 0;
    case 'materials': return s.materials !== null;
    case 'sign': return !!s.signedAt;
  }
}

const stepOf = (key: StepKey) => STEPS.find(x => x.key === key)!;

/** May this step be done now? Not if it is already done, and not before the steps it waits for. */
export function canDo(s: TechDayState, key: StepKey): boolean {
  if (!s.job || s.finishedAt) return false;
  // Photos may keep being added after the first — the step is "done" at one, but not closed.
  if (isDone(s, key) && key !== 'photos') return false;
  return stepOf(key).after.every(k => isDone(s, k));
}

/** What the big button does next: a step, "finish", or nothing (no job, or finished). */
export function nextStep(s: TechDayState): StepKey | 'finish' | null {
  if (!s.job || s.finishedAt) return null;
  const open = STEPS.find(x => !isDone(s, x.key));
  return open ? open.key : 'finish';
}

export const canFinish = (s: TechDayState): boolean => nextStep(s) === 'finish';

/** Clean a materials list: trimmed names, whole positive quantities, blanks dropped. */
export function cleanMaterials(items: Material[]): Material[] {
  return items
    .map(m => ({ name: m.name.trim().slice(0, 120), qty: Math.max(1, Math.floor(Number(m.qty) || 1)) }))
    .filter(m => m.name.length > 0);
}

/**
 * Apply one tap. Anything the rules above refuse returns the state unchanged — the page cannot
 * start a job with no SWMS by calling this in the wrong order.
 */
export function apply(s: TechDayState, a: TechDayAction): TechDayState {
  switch (a.type) {
    case 'reset':
      return EMPTY_DAY;
    case 'open': {
      const title = a.job.title.trim().slice(0, 160);
      if (!title) return s;
      // Opening a job only replaces a day that has not started — never one with hours on it.
      if (s.job && s.startedAt && !s.finishedAt) return s;
      return {
        ...EMPTY_DAY,
        job: { title, site: a.job.site.trim().slice(0, 160), jobId: a.job.jobId ?? null, ref: a.job.ref ?? null },
      };
    }
    case 'saved':
      // Only a running job takes an entry, and only once.
      return s.startedAt && !s.finishedAt && !s.entryId && a.entryId ? { ...s, entryId: a.entryId } : s;
    case 'swms': {
      const by = a.by.trim().slice(0, 120);
      if (!by || !canDo(s, 'swms')) return s;
      return { ...s, swmsSignedAt: a.at, swmsSignedBy: by };
    }
    case 'start':
      return canDo(s, 'start') ? { ...s, startedAt: a.at } : s;
    case 'photos':
      if (!canDo(s, 'photos') || !(a.count > 0)) return s;
      return { ...s, photos: s.photos + Math.floor(a.count) };
    case 'materials':
      return canDo(s, 'materials') ? { ...s, materials: cleanMaterials(a.items) } : s;
    case 'sign': {
      const by = a.by.trim().slice(0, 120);
      if (!by || !canDo(s, 'sign')) return s;
      return { ...s, signedBy: by, signedAt: a.at };
    }
    case 'finish':
      if (!canFinish(s) || !s.startedAt) return s;
      // A clock that has gone backwards (a phone's time corrected mid-job) never makes negative hours.
      return { ...s, finishedAt: a.at < s.startedAt ? s.startedAt : a.at };
  }
}

/** Whole minutes between two ISO times, never negative. */
export function minutesBetween(from: string, to: string): number {
  const ms = Date.parse(to) - Date.parse(from);
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 60_000) : 0;
}

export interface Timesheet {
  start: string | null;
  finish: string | null;
  /** Exact minutes worked. Nothing is rounded in what is kept. */
  minutes: number;
  /** Still clocking — started and not finished. */
  running: boolean;
}

/**
 * The timesheet that builds itself. While the job is running it counts up to `now`; once finished it
 * is fixed at Start → Finish.
 */
export function timesheet(s: TechDayState, now: string): Timesheet {
  if (!s.startedAt) return { start: null, finish: null, minutes: 0, running: false };
  const end = s.finishedAt ?? now;
  return { start: s.startedAt, finish: s.finishedAt, minutes: minutesBetween(s.startedAt, end), running: !s.finishedAt };
}

/** "6.5 h" — hours to one decimal, the way the design shows them. Display only. */
export function hoursLabel(minutes: number): string {
  const h = Math.round((minutes / 60) * 10) / 10;
  return `${h.toLocaleString('en-AU', { maximumFractionDigits: 1 })} h`;
}

/** "7:14" — a time on the phone's own clock. The zone is a parameter so tests do not depend on it. */
export function clock(iso: string, timeZone?: string): string {
  return new Date(iso)
    .toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone })
    .replace(/\s?[ap]m$/i, '');
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What a done step says in place of its description. */
export function doneLine(s: TechDayState, key: StepKey, timeZone?: string): string {
  switch (key) {
    case 'swms': return s.swmsSignedAt ? `Signed ${clock(s.swmsSignedAt, timeZone)}` : '';
    case 'start': return s.startedAt ? `Started ${clock(s.startedAt, timeZone)}${s.finishedAt ? '' : ' · clocking'}` : '';
    case 'photos': return `${plural(s.photos, 'photo')} added`;
    case 'materials':
      if (!s.materials) return '';
      return s.materials.length ? `${plural(s.materials.length, 'item')} · for the job costing` : 'Nothing used';
    case 'sign': return s.signedBy ? `Signed by ${s.signedBy}` : '';
  }
}

/** The line under the big button. */
export function primaryNote(s: TechDayState): string {
  const n = nextStep(s);
  if (n === null) return '';
  if (n === 'finish') return 'Stops your hours and closes the job on this phone.';
  return 'One step at a time. Tap the step or this button.';
}

/** The big button's words. */
export function primaryLabel(s: TechDayState): string {
  const n = nextStep(s);
  if (n === null) return '';
  return n === 'finish' ? 'Finish the job' : stepOf(n).label;
}

/** The done screen's three lines. */
export function summary(s: TechDayState, now: string): { hours: string; materials: string; photos: string } {
  return {
    hours: hoursLabel(timesheet(s, now).minutes),
    materials: s.materials?.length ? plural(s.materials.length, 'item') : 'None',
    photos: String(s.photos),
  };
}

/**
 * Where the phone keeps today's job. One key per person per day, so a shared phone does not mix two
 * people's hours and yesterday's job does not greet anybody this morning.
 */
export const storageKey = (userId: string, day: string) => `spec.tech-day.${userId}.${day}`;

/** Read back what the phone saved, refusing anything that is not the shape written. */
export function revive(raw: string | null | undefined): TechDayState {
  if (!raw) return EMPTY_DAY;
  try {
    const v = JSON.parse(raw) as Partial<TechDayState>;
    if (!v || typeof v !== 'object') return EMPTY_DAY;
    const str = (x: unknown) => (typeof x === 'string' ? x : null);
    const job = v.job && typeof v.job.title === 'string'
      ? {
          title: v.job.title, site: typeof v.job.site === 'string' ? v.job.site : '',
          jobId: typeof v.job.jobId === 'string' ? v.job.jobId : null,
          ref: typeof v.job.ref === 'string' ? v.job.ref : null,
        }
      : null;
    return {
      job,
      swmsSignedAt: str(v.swmsSignedAt),
      swmsSignedBy: str(v.swmsSignedBy),
      startedAt: str(v.startedAt),
      photos: typeof v.photos === 'number' && v.photos > 0 ? Math.floor(v.photos) : 0,
      materials: Array.isArray(v.materials) ? cleanMaterials(v.materials as Material[]) : null,
      signedBy: str(v.signedBy),
      signedAt: str(v.signedAt),
      finishedAt: str(v.finishedAt),
      entryId: str(v.entryId),
    };
  } catch {
    return EMPTY_DAY;
  }
}

/* ── The office's side: the schedule in, the timesheet out (23 September) ──────────────────────── */

/**
 * A booking on the office's schedule, as the phone receives it. The page reads the bookings either
 * side of today (the server's day is UTC; the phone's is local) and the phone keeps its own day's.
 */
export interface Booked {
  jobId: string;
  ref: string;
  title: string;
  site: string;
  client: string;
  day: string;
}

/** Today's booked jobs on this phone's own calendar day, once each, in J-number order. */
export function bookedOn(booked: readonly Booked[], day: string): Booked[] {
  const seen = new Set<string>();
  return booked
    .filter(b => b.day === day && !seen.has(b.jobId) && Boolean(seen.add(b.jobId)))
    .sort((a, b) => a.ref.localeCompare(b.ref, 'en', { numeric: true }));
}

/** "07:14" on the phone's own clock — the shape a typed timesheet entry already takes. */
export function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** A clock time the phone sent, or null. */
export const validClock = (s: unknown): string | null =>
  typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : null;

/**
 * The phone's day, accepted only when it is within a day of the server's — a phone's calendar may
 * be a timezone away from the server's, never a week.
 */
export function dayNear(day: unknown, now: Date): string | null {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const t = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.abs(t - today) <= 86_400_000 ? day : null;
}

/** The three calendar days a phone anywhere could call today. */
export function daysAround(now: Date): string[] {
  const d = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  return [-1, 0, 1].map(k => new Date(d + k * 86_400_000).toISOString().slice(0, 10));
}

/**
 * The minutes the office records, from ITS clock: Start's moment to Finish's. The phone's clock
 * only labels the entry — hours are never a number the phone chose. Capped at a day, since a clock
 * left running overnight is a forgotten Finish for a leader to fix, not sixteen billable hours.
 */
export function officeMinutes(startedIso: string, now: Date): number {
  return Math.min(24 * 60, minutesBetween(startedIso, now.toISOString()));
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 * The rest of the day: the SWMS, the photos, the materials and the client's signature
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Clocking on and off is above and is hours. These four are records against a job made by a person
 * at a time, and they share one table — the order is fixed, so SPEC knows where the technician is
 * in it and the screen only ever shows the next thing.
 */

export type DayRecord = 'swms' | 'photo' | 'materials' | 'signoff';

export const DAY_RECORDS: { key: DayRecord; label: string; prompt: string }[] = [
  { key: 'swms', label: 'SWMS', prompt: 'Sign the SWMS before anything starts.' },
  { key: 'photo', label: 'Photos', prompt: 'Photos of what you found and what you did.' },
  { key: 'materials', label: 'Materials used', prompt: 'What came off the van onto this job.' },
  { key: 'signoff', label: 'Client sign-off', prompt: 'The client signs that it is done.' },
];

export const isDayRecord = (v: string): v is DayRecord => DAY_RECORDS.some(r => r.key === v);

export const recordLabel = (v: string): string =>
  DAY_RECORDS.find(r => r.key === v)?.label ?? 'Record';

export interface Rec { kind: string; who: string; what: string; atTime: string; qty?: number | null }

/**
 * Has the SWMS been signed for this job?
 *
 * The one that gates everything else. High-risk work started before the SWMS is signed is the
 * single thing a regulator asks about first, and it is the easiest to skip when it is a form rather
 * than the thing standing between the technician and the Start button.
 */
export const swmsSigned = (recs: readonly Rec[]): boolean =>
  recs.some(r => r.kind === 'swms');

export const signedOff = (recs: readonly Rec[]): boolean =>
  recs.some(r => r.kind === 'signoff');

export const countOf = (recs: readonly Rec[], kind: DayRecord): number =>
  recs.filter(r => r.kind === kind).length;

/**
 * The next thing to press — and only ever one.
 *
 * Null once the client has signed: the day on that job is done and the screen should say so rather
 * than offering a fifth thing.
 */
export function nextAction(recs: readonly Rec[], started: boolean): { key: DayRecord; prompt: string } | null {
  if (!swmsSigned(recs)) return { key: 'swms', prompt: DAY_RECORDS[0].prompt };
  if (signedOff(recs)) return null;
  if (!started) return null;          // the Start button is the next thing, and it is not a record
  if (countOf(recs, 'photo') === 0) return { key: 'photo', prompt: DAY_RECORDS[1].prompt };
  if (countOf(recs, 'materials') === 0) return { key: 'materials', prompt: DAY_RECORDS[2].prompt };
  return { key: 'signoff', prompt: DAY_RECORDS[3].prompt };
}

/** What the job card says it is waiting on. */
export function dayLine(recs: readonly Rec[], started: boolean): string {
  if (!swmsSigned(recs)) return 'The SWMS is not signed. Nothing starts until it is.';
  if (signedOff(recs)) return 'Signed off by the client. Done.';
  if (!started) return 'SWMS signed. Press Start when you are on the tools.';
  const photos = countOf(recs, 'photo');
  const mats = countOf(recs, 'materials');
  return `${photos} ${photos === 1 ? 'photo' : 'photos'}, ${mats} ${mats === 1 ? 'material line' : 'material lines'}. The client has not signed yet.`;
}

/**
 * Whether the day's record is complete enough to invoice from.
 *
 * Not a gate on the technician — they are on site and the customer is waiting. It is what the
 * office sees: an invoice raised off a job with no sign-off is the one that gets disputed.
 */
export interface Evidence { complete: boolean; missing: string[] }

export function evidenceOf(recs: readonly Rec[]): Evidence {
  const missing: string[] = [];
  if (!swmsSigned(recs)) missing.push('the SWMS was never signed');
  if (countOf(recs, 'photo') === 0) missing.push('no photos');
  if (!signedOff(recs)) missing.push('the client did not sign');
  return { complete: missing.length === 0, missing };
}
