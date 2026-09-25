import { and, eq, inArray, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '../db';
import type { CurrentUser } from './auth';
import { crewFor } from './jobs-data';
import { checkHours } from './hr-records';
import {
  payWeek, reconcile, approvable, approveAdvice, destinationFor, maySend, runRows,
  type Entry, type Booking, type JobRef, type Flag, type Destination,
} from './timesheets';
import type { Recommendation } from './recommends';

/**
 * SiteVIP's payroll basics, against the database. Tenant in every query; every judgement in
 * lib/timesheets.
 */

export interface Week {
  monday: string;
  days: string[];
  entries: Entry[];
  bookings: Booking[];
  jobs: JobRef[];
  flags: Flag[];
}

/** A pay week, for these people — or the whole business when `keys` is not given. */
export async function weekFor(tenantId: string, day: string, keys?: readonly string[]): Promise<Week> {
  const days = payWeek(day);
  const monday = days[0];
  if (!days.length || (keys && !keys.length)) return { monday, days, entries: [], bookings: [], jobs: [], flags: [] };
  const who = keys ? [inArray(schema.timesheetEntries.personKey, [...keys])] : [];
  const [rows, bookingRows, jobRows] = await Promise.all([
    db.select().from(schema.timesheetEntries)
      .where(and(eq(schema.timesheetEntries.tenantId, tenantId), inArray(schema.timesheetEntries.day, days), ...who)),
    db.select({ personKey: schema.scheduleBookings.personKey, jobId: schema.scheduleBookings.jobId, day: schema.scheduleBookings.day })
      .from(schema.scheduleBookings)
      .where(and(
        eq(schema.scheduleBookings.tenantId, tenantId),
        inArray(schema.scheduleBookings.day, days),
        ...(keys ? [inArray(schema.scheduleBookings.personKey, [...keys])] : []),
      )),
    db.select({ id: schema.jobs.id, ref: schema.jobs.ref, site: schema.jobs.site, stage: schema.jobs.stage })
      .from(schema.jobs).where(eq(schema.jobs.tenantId, tenantId)),
  ]);
  const entries: Entry[] = rows.map(r => ({
    id: r.id, personKey: r.personKey, personName: r.personName, jobId: r.jobId, day: r.day,
    startedAt: r.startedAt, finishedAt: r.finishedAt, minutes: r.minutes,
    breakMinutes: r.breakMinutes, travelMinutes: r.travelMinutes, allowances: r.allowances, approvedAt: r.approvedAt,
  }));
  return { monday, days, entries, bookings: bookingRows, jobs: jobRows, flags: reconcile(entries, bookingRows, jobRows) };
}

/** The viewer's crew's week — what a supervisor reconciles and approves. */
export async function crewWeek(user: CurrentUser, day: string): Promise<Week> {
  const crew = await crewFor(user);
  return weekFor(user.tenantId, day, crew.map(c => c.key));
}

/** The approve step for this viewer's crew, as a Claude recommends card. */
export async function approveRecommendation(user: CurrentUser, monday: string): Promise<Recommendation> {
  const week = await crewWeek(user, monday);
  return approveAdvice(week.monday, week.entries, week.flags);
}

/** Approve what SPEC listed as approvable for this viewer's crew — never an entry a clash holds back. */
export async function approveCrewWeek(user: CurrentUser, monday: string): Promise<number> {
  const week = await crewWeek(user, monday);
  const ids = approvable(week.entries, week.flags);
  if (ids.length) {
    await db.update(schema.timesheetEntries).set({ approvedBy: user.name, approvedAt: new Date().toISOString() })
      .where(and(eq(schema.timesheetEntries.tenantId, user.tenantId), inArray(schema.timesheetEntries.id, ids)));
  }
  return ids.length;
}

export async function payRunFor(tenantId: string, monday: string) {
  const [run] = await db.select().from(schema.payRuns)
    .where(and(eq(schema.payRuns.tenantId, tenantId), eq(schema.payRuns.fromDate, monday)));
  return run ?? null;
}

/**
 * Whether approved hours go to Angus Shield on their own — the seamless path.
 *
 * docs/ANGUS_SHIELD_SITEVIP_CONTRACT.md (§1–§3) decides this, not a toggle here: it is true only
 * when the business has said the one yes and holds a live Angus Shield connection (a credential with
 * `provider = 'angus_shield'` on a live `financials` connection). Then each approval is an
 * `hours.approved` event and there is no send step at all.
 *
 * Neither the connection nor that event sender exists in SiteVIP yet, so this is false for every
 * business today and the screen offers the export — the business's own-system path, which is always
 * complete. Whoever builds the connector must emit `hours.approved` from `approveCrewWeek` in the
 * same change; until both exist, nothing on screen says hours are flowing anywhere.
 */
export async function angusConnected(tenantId: string): Promise<boolean> {
  const rows = await db.select({ status: schema.systemConnections.status })
    .from(schema.connectionCredentials)
    .innerJoin(schema.systemConnections, eq(schema.systemConnections.id, schema.connectionCredentials.connectionId))
    .where(and(
      eq(schema.connectionCredentials.tenantId, tenantId),
      eq(schema.connectionCredentials.provider, 'angus_shield'),
      eq(schema.systemConnections.tenantId, tenantId),
      // A business connection, never somebody's own mailbox.
      isNull(schema.systemConnections.personalFor),
    ));
  return rows.some(r => r.status === 'live');
}

/**
 * Send an approved week on for processing. The whole business's week, because a pay run is the
 * business's — so it waits until every entry in it is approved. Records the run as sent, with the
 * summary it went with; the file itself is `/jobs/timesheet-export`.
 */
export async function sendWeek(user: CurrentUser, monday: string): Promise<{ ok: true; to: Destination } | { ok: false; why: string }> {
  const week = await weekFor(user.tenantId, monday);
  const existing = await payRunFor(user.tenantId, week.monday);
  const can = maySend(week.entries, existing?.exportedAt ?? null);
  if (!can.ok) return { ok: false, why: can.why };

  const to = destinationFor(await angusConnected(user.tenantId));
  const rows = runRows(week.entries);
  const at = new Date().toISOString();
  const values = {
    rows: JSON.stringify(rows), issues: JSON.stringify(checkHours(rows)),
    checkedAt: at, checkedBy: user.id, exportedAt: at, sentTo: to,
  };
  if (existing) {
    await db.update(schema.payRuns).set(values)
      .where(and(eq(schema.payRuns.id, existing.id), eq(schema.payRuns.tenantId, user.tenantId)));
  } else {
    await db.insert(schema.payRuns).values({
      id: randomUUID(), tenantId: user.tenantId, fromDate: week.days[0], toDate: week.days[6], createdAt: at, ...values,
    });
  }
  return { ok: true, to };
}
