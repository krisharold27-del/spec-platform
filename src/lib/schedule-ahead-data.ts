/**
 * What the month-ahead plan is built from — all of it the business's own facts.
 *
 * Nothing here estimates, guesses or smooths. Where SPEC does not know something the need is left
 * out of the plan and said so on the screen, because a proposed day built on an invented duration
 * is a customer told a date that was never real.
 */
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { db, schema } from '../db';
import { PLAN_DAYS, plan, holes, type Need, type Hand, type Plan, type Hole } from './schedule-ahead';

export interface AheadView {
  plan: Plan;
  holes: Hole[];
  /** Needs SPEC left out because it does not know how long they take. Named, never dropped. */
  noDuration: { ref: string; what: string }[];
  hands: Hand[];
}

/**
 * The working days from today, weekends excluded.
 *
 * Public holidays are NOT excluded, and that is a gap rather than a decision — they differ by state
 * and by year, and `lib/certificates` set the rule about dates SPEC does not know. A holiday that
 * slips through shows as a day somebody was proposed and cannot work, which a scheduler will
 * notice; a holiday SPEC invented in the wrong state would be worse.
 */
export function workingDaysFrom(from: Date, count = PLAN_DAYS): string[] {
  const days: string[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  while (days.length < count) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export const PUBLIC_HOLIDAYS_NOT_KNOWN =
  'Weekends are left out; public holidays are not. They differ by state and by year and SPEC has not been told yours, so a day it proposes may land on one — it would rather you spotted that than have it invent a calendar.';

export async function aheadFor(tenantId: string, now: Date = new Date()): Promise<AheadView> {
  const days = workingDaysFrom(now, PLAN_DAYS);
  const from = days[0];
  const to = days[days.length - 1];

  const [jobs, bookings, staff, leave, scopes] = await Promise.all([
    db.select({
      id: schema.jobs.id, ref: schema.jobs.ref, title: schema.jobs.title, client: schema.jobs.client,
      stage: schema.jobs.stage, sectorId: schema.jobs.sectorId, workKind: schema.jobs.workKind,
      estimatedDays: schema.jobs.estimatedDays,
    })
      .from(schema.jobs)
      .where(and(eq(schema.jobs.tenantId, tenantId), inArray(schema.jobs.stage, ['won', 'scheduled']))),
    db.select({ jobId: schema.scheduleBookings.jobId, personKey: schema.scheduleBookings.personKey, day: schema.scheduleBookings.day })
      .from(schema.scheduleBookings)
      .where(and(
        eq(schema.scheduleBookings.tenantId, tenantId),
        gte(schema.scheduleBookings.day, from),
        lte(schema.scheduleBookings.day, to),
      )),
    db.select({
      id: schema.staff.id, name: schema.staff.name, userId: schema.staff.userId,
      inductedAt: schema.staff.inductedAt, isSubcontractor: schema.staff.isSubcontractor,
    })
      .from(schema.staff).where(eq(schema.staff.tenantId, tenantId)),
    db.select({
      staffId: schema.leaveEntries.staffId, userId: schema.leaveEntries.userId,
      fromDate: schema.leaveEntries.fromDate, toDate: schema.leaveEntries.toDate, state: schema.leaveEntries.state,
    })
      .from(schema.leaveEntries).where(eq(schema.leaveEntries.tenantId, tenantId)),
    db.select({ jobId: schema.jobScopes.jobId })
      .from(schema.jobScopes).where(eq(schema.jobScopes.tenantId, tenantId)),
  ]);

  /*
    ── How long a job takes, from this business's own finished work ────────────────────────────

    Hours actually spent on finished jobs, grouped by the kind of work, and the MEDIAN of them —
    the same rule as the instant-quote drafts in lib/our-rate, and for the same reason: one
    shutdown that ran three days would drag every future estimate with it.

    This is the difference between a plan and a list. It is also the part that must not be faked:
    where a business has never finished a job of that kind there is no median, the job is left out,
    and the screen names it. A guessed duration is a customer given a date that was never real.
  */
  const times = await db.select({ jobId: schema.timesheetEntries.jobId, minutes: schema.timesheetEntries.minutes })
    .from(schema.timesheetEntries).where(eq(schema.timesheetEntries.tenantId, tenantId));
  const allJobs = await db.select({ id: schema.jobs.id, workKind: schema.jobs.workKind })
    .from(schema.jobs).where(eq(schema.jobs.tenantId, tenantId));

  const daysByKind = new Map<string, number[]>();
  for (const j of allJobs) {
    const mins = times.filter(t => t.jobId === j.id).reduce((a, t) => a + (t.minutes ?? 0), 0);
    if (mins <= 0) continue;
    const kind = j.workKind ?? 'maintenance';
    /* A person-day is eight hours. Rounded up: half a day still occupies somebody for a day. */
    daysByKind.set(kind, [...(daysByKind.get(kind) ?? []), Math.max(1, Math.ceil(mins / 60 / 8))]);
  }

  const medianDaysFor = (kind: string): number | null => {
    const seen = daysByKind.get(kind);
    if (!seen || seen.length === 0) return null;
    const sorted = [...seen].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? Math.ceil((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
  };

  /* ── Who can work, and when they cannot ─────────────────────────────────────────────────── */

  const busyOf = (key: string): string[] => {
    const booked = bookings.filter(b => b.personKey === key).map(b => b.day);
    const off = leave
      .filter(l => l.state === 'approved')
      .filter(l => (l.userId ? `user:${l.userId}` : l.staffId ? `staff:${l.staffId}` : '') === key)
      .flatMap(l => days.filter(d => d >= l.fromDate && d <= l.toDate));
    return [...new Set([...booked, ...off])];
  };

  const hands: Hand[] = staff.map(s => {
    const key = s.userId ? `user:${s.userId}` : `staff:${s.id}`;
    /*
      Whether they may be sent to work — and this is the honest limit of it today.

      `clearToWork` in lib/people is the real gate, and it reads blocking measures and overdue
      training off a person's ROLE. This reads the staff list, which does not carry those, so
      calling it here with empty arrays would have every inducted person come back "clear" — a
      check that always passes, which is worse than no check because it looks like one.

      So the plan uses the one fact it genuinely has: somebody not inducted is not available. That
      is a floor rather than the gate, it is named in WHAT_IT_STILL_NEEDS, and the screen says so.
      Assuming clear because nobody checked is exactly the failure the real gate exists to prevent,
      and pretending to have run it would be the same failure wearing a better coat.
    */
    const inducted = Boolean(s.inductedAt);

    return {
      key,
      name: s.name,
      /* Nothing records per-person tickets yet, so nobody holds anything named. See the note below. */
      holds: [] as string[],
      clear: inducted,
      busy: busyOf(key),
    };
  });

  /* ── What needs doing ───────────────────────────────────────────────────────────────────── */

  const scheduledDaysOf = (jobId: string) =>
    new Set(bookings.filter(b => b.jobId === jobId).map(b => b.day)).size;

  const crewOf = (jobId: string) => Math.max(1, scopes.filter(s => s.jobId === jobId).length);

  const needs: Need[] = [];
  const noDuration: { ref: string; what: string }[] = [];

  for (const j of jobs) {
    /*
      Already scheduled work is not a need. Counting it again would have the plan propose a second
      set of days for a job somebody has already promised.
    */
    if (scheduledDaysOf(j.id) > 0) continue;

    /* What somebody said, then what this business's history says, then nothing. In that order. */
    const said = j.estimatedDays && j.estimatedDays > 0 ? Math.ceil(j.estimatedDays) : null;
    const fromHistory = said === null ? medianDaysFor(j.workKind ?? 'maintenance') : null;
    const days = said ?? fromHistory;

    if (days === null) {
      noDuration.push({ ref: j.ref, what: j.title });
      continue;
    }

    needs.push({
      id: j.id,
      kind: 'job',
      ref: j.ref,
      what: j.title,
      client: j.client ?? 'the client',
      days,
      notBefore: null,
      by: null,
      /* More than one scope means more than one crew — the rule lib/crews already holds. */
      crew: crewOf(j.id),
      /*
        Nothing records per-person tickets yet, so no need can require one. Named in
        WHAT_IT_STILL_NEEDS rather than quietly treated as "no requirements", which would let the
        plan send somebody to a mine site they are not inducted for.
      */
      needs: [],
    });
  }

  const made = plan({ from, workingDays: days, needs, hands });

  return {
    plan: made,
    holes: holes(made.quiet, days),
    noDuration,
    hands,
  };
}

/**
 * What is missing before this can plan anything real.
 *
 * Said on the screen rather than discovered. Two things: how long each job takes, and what tickets
 * each person holds. Without the first there is nothing to place; without the second the plan
 * cannot tell a mine job from a domestic one, and it would happily send somebody who is not allowed
 * on the site.
 */
export const WHAT_IT_STILL_NEEDS = [
  {
    what: 'How long each job takes',
    why: 'Nothing places a job without it. SPEC will not assume a day — that would make every plan wrong in the same direction, quietly.',
    where: '/jobs?tab=howlong',
  },
  {
    what: 'What each person holds',
    why: 'Tickets, inductions and site access. Without them the plan cannot tell a mine job from a domestic one, and would send somebody who is not allowed on.',
    where: '/compliance',
  },
  {
    what: 'Clear to Work, joined to the schedule',
    why: 'Right now the plan only knows whether somebody has been inducted. The real gate — licences, blocking measures, overdue training — hangs off their role, and until it is joined here the plan is using a floor rather than the gate.',
    where: '/compliance',
  },
] as const;
