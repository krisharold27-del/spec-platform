/**
 * Work that comes round again — service contracts, and test-and-tag.
 *
 * ── Outsimple them: one idea, not two screens ────────────────────────────────────────────────────
 *
 * A maintenance agreement and a tagged appliance look like different things and behave like one.
 * Each has an interval, a last-done date, and a next-due date that nobody works out until it is
 * already late. The design asks for contracts *"that book themselves"* and for every tested item
 * *"with result, photo and next due date"*. Same sentence.
 *
 * The feature is not the register. It is **the date arriving before somebody notices**.
 */

export type RecurKind = 'contract' | 'asset';

export const RECUR_KINDS: { key: RecurKind; label: string; blurb: string }[] = [
  {
    key: 'contract', label: 'Service contracts',
    blurb: 'Maintenance agreements that book themselves. The job appears on the board when it is due, rather than when somebody remembers.',
  },
  {
    key: 'asset', label: 'Test & tag, client assets',
    blurb: 'Every tested item with its result and when it is next due. A failed item is not a date, it is a job.',
  },
];

export const isRecurKind = (v: string): v is RecurKind => RECUR_KINDS.some(k => k.key === v);

/** The next due date, from when it was last done. Plain month arithmetic, done once, here. */
export function nextDue(lastDoneAt: string | null, everyMonths: number): string | null {
  if (!lastDoneAt) return null;
  const d = new Date(`${lastDoneAt.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCMonth(d.getUTCMonth() + Math.max(1, Math.round(everyMonths)));
  return d.toISOString().slice(0, 10);
}

export type DueState = 'overdue' | 'due_soon' | 'scheduled' | 'never_done' | 'failed';

/** How far ahead something is worth booking. Long enough to get it on a schedule. */
export const BOOK_AHEAD_DAYS = 30;

export const DUE_LABEL: Record<DueState, string> = {
  overdue: 'Overdue',
  due_soon: 'Due soon',
  scheduled: 'Scheduled',
  never_done: 'Never done',
  failed: 'Failed its last test',
};

export interface Recur {
  kind: string;
  nextDueAt: string | null;
  lastDoneAt: string | null;
  result: string | null;
  bookedJobId: string | null;
}

/**
 * Where something stands.
 *
 * A FAILED item outranks any date. A tagged appliance that failed is not waiting for its next
 * twelve-month cycle — it is unsafe now, and reading it as "due in eleven months" is how a failed
 * item stays in service.
 */
export function dueStateOf(r: Recur, today: string): DueState {
  if (r.result === 'fail') return 'failed';
  if (!r.nextDueAt) return 'never_done';
  if (r.nextDueAt < today) return 'overdue';
  const soon = new Date(`${today}T00:00:00.000Z`);
  soon.setUTCDate(soon.getUTCDate() + BOOK_AHEAD_DAYS);
  if (r.nextDueAt <= soon.toISOString().slice(0, 10)) return r.bookedJobId ? 'scheduled' : 'due_soon';
  return 'scheduled';
}

/** Does this need a job raising for it now? The whole of "books itself". */
export const needsBooking = (r: Recur, today: string): boolean => {
  const s = dueStateOf(r, today);
  return (s === 'overdue' || s === 'due_soon' || s === 'failed' || s === 'never_done') && !r.bookedJobId;
};

export function dueLine(r: Recur, today: string): string {
  const state = dueStateOf(r, today);
  if (state === 'failed') return 'Failed its last test — that is a job, not a date.';
  if (state === 'never_done') return 'Never done. Nothing to count an interval from.';
  if (!r.nextDueAt) return '';
  const days = Math.round((Date.parse(r.nextDueAt) - Date.parse(today)) / 86_400_000);
  if (days < 0) return `Was due ${r.nextDueAt} — ${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} ago.`;
  if (days === 0) return 'Due today.';
  return `Due ${r.nextDueAt}, in ${days} ${days === 1 ? 'day' : 'days'}.`;
}

export interface RecurStats { overdue: number; dueSoon: number; failed: number; toBook: number }

export function recurStats(rows: readonly Recur[], today: string): RecurStats {
  const s = rows.map(r => dueStateOf(r, today));
  return {
    overdue: s.filter(x => x === 'overdue').length,
    dueSoon: s.filter(x => x === 'due_soon').length,
    failed: s.filter(x => x === 'failed').length,
    toBook: rows.filter(r => needsBooking(r, today)).length,
  };
}

/** Worst first: what failed, then what is late, then what is coming. */
const RANK: Record<DueState, number> = { failed: 0, overdue: 1, never_done: 2, due_soon: 3, scheduled: 4 };

export function byDue<T extends Recur>(rows: readonly T[], today: string): T[] {
  return [...rows].sort((a, b) =>
    RANK[dueStateOf(a, today)] - RANK[dueStateOf(b, today)]
    || (a.nextDueAt ?? '9999').localeCompare(b.nextDueAt ?? '9999'));
}

export function recurLine(s: RecurStats): string {
  if (s.failed > 0) return `${s.failed} ${s.failed === 1 ? 'item has' : 'items have'} failed a test and ${s.failed === 1 ? 'is' : 'are'} still in service.`;
  if (s.overdue > 0) return `${s.overdue} overdue.`;
  if (s.toBook > 0) return `${s.toBook} to book in the next ${BOOK_AHEAD_DAYS} days.`;
  return 'Nothing due.';
}
