/**
 * Plant on hire, and the day it should have gone back.
 *
 * ── The quietest leak there is ───────────────────────────────────────────────────────────────────
 *
 * From the workflow map: a job needs a scissor lift, it goes on hire, the job finishes, and the
 * lift sits on site for three more weeks because off-hiring it is nobody's specific job. The cost
 * turns up later on a hire invoice that nobody connects to the job it belonged to.
 *
 * It is quiet because every single step is reasonable. Nobody forgets on purpose; there is simply
 * no moment at which the system says "this finished, and that did not".
 *
 * ── So the job finishing is the trigger ──────────────────────────────────────────────────────────
 *
 * Not a reminder somebody sets. The job already knows when it finished, and the hire already knows
 * which job it is on — the connection is the whole feature, and without it this is a list of hires
 * that ages exactly as badly as the spreadsheet it replaced.
 */

export interface Hire {
  id: string;
  jobId: string;
  jobRef: string;
  what: string;
  supplier: string;
  onHireAt: string;
  offHireAt: string | null;
  /** What it costs per day, when the business has recorded it. Null is honest, not empty. */
  perDayCents: number | null;
}

export type HireState = 'on_hire' | 'should_be_back' | 'returned';

export interface HireWatch {
  hire: Hire;
  state: HireState;
  days: number;
  /** Days it has been on hire since the job finished. The number that costs money. */
  idleDays: number;
  wastedCents: number | null;
  says: string;
}

const dayCount = (from: string, to: number) =>
  Math.max(0, Math.floor((to - Date.parse(from)) / 86_400_000));

export function hireWatch(
  hire: Hire,
  jobFinishedAt: string | null,
  at: Date = new Date(),
): HireWatch {
  const now = at.getTime();
  const days = dayCount(hire.onHireAt, hire.offHireAt ? Date.parse(hire.offHireAt) : now);

  if (hire.offHireAt) {
    return {
      hire, state: 'returned', days, idleDays: 0, wastedCents: null,
      says: `Off hire ${hire.offHireAt.slice(0, 10)}, ${days} ${days === 1 ? 'day' : 'days'} in all.`,
    };
  }
  if (!jobFinishedAt) {
    return {
      hire, state: 'on_hire', days, idleDays: 0, wastedCents: null,
      says: `On hire ${days} ${days === 1 ? 'day' : 'days'}. ${hire.jobRef} is still running.`,
    };
  }

  /*
    The job has finished and this has not gone back. Counted from the day the JOB finished, not from
    the day it went on hire — the hire up to that point was work, and only what comes after is
    waste. Conflating them makes the number enormous and therefore ignorable.
  */
  const idleDays = dayCount(jobFinishedAt, now);
  const wastedCents = hire.perDayCents === null ? null : hire.perDayCents * idleDays;
  return {
    hire, state: 'should_be_back', days, idleDays, wastedCents,
    says: wastedCents === null
      ? `${hire.jobRef} finished ${idleDays} ${idleDays === 1 ? 'day' : 'days'} ago and this is still on hire. Record what it costs a day and SPEC will tell you what that is worth.`
      : `${hire.jobRef} finished ${idleDays} ${idleDays === 1 ? 'day' : 'days'} ago and this is still on hire — about ${money(wastedCents)} of hire on a job that is done.`,
  };
}

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-AU', { maximumFractionDigits: 0 })}`;

/** Everything sitting on hire against a job that has already finished. The list worth acting on. */
export function shouldBeBack(watches: readonly HireWatch[]): HireWatch[] {
  return watches.filter(w => w.state === 'should_be_back').sort((a, b) => b.idleDays - a.idleDays);
}

export function plantLine(watches: readonly HireWatch[]): string {
  const late = shouldBeBack(watches);
  if (late.length === 0) {
    const on = watches.filter(w => w.state === 'on_hire').length;
    return on === 0 ? 'Nothing on hire.' : `${on} on hire, all on jobs still running.`;
  }
  const priced = late.filter(w => w.wastedCents !== null);
  const total = priced.reduce((n, w) => n + (w.wastedCents ?? 0), 0);
  const base = `${late.length} ${late.length === 1 ? 'item is' : 'items are'} still on hire against a finished job`;
  return total > 0 ? `${base} — about ${money(total)} so far.` : `${base}.`;
}
