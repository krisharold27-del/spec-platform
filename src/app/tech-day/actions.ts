'use server';
import { revalidatePath } from 'next/cache';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { assertWritable } from '@/lib/plan';
import { validClock, dayNear, daysAround, officeMinutes } from '@/lib/tech-day';

/**
 * Start and Finish on the phone, written to the office's timesheets (23 September).
 *
 * The one write in SPEC a person without manager access makes about time: their OWN time, and
 * nobody else's. The person is always the signed-in user — never a key the phone sends — and a job
 * is only put on the entry when the office booked this person on it; a job the tech named themselves
 * is hours not on a scheduled job. The minutes are the server's own clock from Start to Finish; the
 * phone's clock only labels the entry. A leader still approves the week on Jobs → Timesheets.
 */

type Result = { ok: true; entryId: string } | { ok: false; reason: string };

async function me() {
  const user = await getCurrentUser();
  if (!user) return null;
  await assertWritable(user.tenantId);
  const staff = await db.select({ id: schema.staff.id }).from(schema.staff)
    .where(and(eq(schema.staff.tenantId, user.tenantId), eq(schema.staff.userId, user.id)));
  return { user, key: `user:${user.id}`, keys: [`user:${user.id}`, ...staff.map(s => `staff:${s.id}`)] };
}

/** Start: open this person's timesheet entry. Pressing it twice opens one entry, not two. */
export async function clockOn(input: { jobId: string | null; day: string; clock: string }): Promise<Result> {
  const who = await me();
  if (!who) return { ok: false, reason: 'Sign in again to send your hours to the office.' };
  const { user, key, keys } = who;
  const now = new Date();
  const day = dayNear(input.day, now);
  const clock = validClock(input.clock);
  if (!day || !clock) return { ok: false, reason: 'The phone’s date or time did not look right.' };

  const [running] = await db.select({ id: schema.timesheetEntries.id }).from(schema.timesheetEntries)
    .where(and(
      eq(schema.timesheetEntries.tenantId, user.tenantId), eq(schema.timesheetEntries.personKey, key),
      eq(schema.timesheetEntries.source, 'phone'), isNull(schema.timesheetEntries.finishedAt),
    ));
  if (running) return { ok: true, entryId: running.id };

  // Only a job the office booked this person on, around today, goes on the entry.
  let jobId: string | null = null;
  if (input.jobId) {
    const [booking] = await db.select({ jobId: schema.scheduleBookings.jobId }).from(schema.scheduleBookings)
      .where(and(
        eq(schema.scheduleBookings.tenantId, user.tenantId), eq(schema.scheduleBookings.jobId, String(input.jobId)),
        inArray(schema.scheduleBookings.personKey, keys), inArray(schema.scheduleBookings.day, daysAround(now)),
      ));
    if (!booking) return { ok: false, reason: 'That job is not booked for you today — ask the office to put you on it.' };
    jobId = booking.jobId;
  }

  const id = randomUUID();
  await db.insert(schema.timesheetEntries).values({
    id, tenantId: user.tenantId, personKey: key, personName: user.name, jobId, day,
    startedAt: clock, finishedAt: null, minutes: 0, billable: Boolean(jobId), source: 'phone',
    createdAt: now.toISOString(),
  });
  revalidatePath('/jobs');
  return { ok: true, entryId: id };
}

/** Finish: close this person's own open entry, with the minutes from the office's clock. */
export async function clockOff(input: { entryId: string; clock: string }): Promise<Result> {
  const who = await me();
  if (!who) return { ok: false, reason: 'Sign in again to send your hours to the office.' };
  const { user, key } = who;
  const clock = validClock(input.clock);
  if (!clock) return { ok: false, reason: 'The phone’s time did not look right.' };
  const [entry] = await db.select().from(schema.timesheetEntries)
    .where(and(
      eq(schema.timesheetEntries.id, String(input.entryId ?? '')), eq(schema.timesheetEntries.tenantId, user.tenantId),
      eq(schema.timesheetEntries.personKey, key), eq(schema.timesheetEntries.source, 'phone'),
    ));
  if (!entry) return { ok: false, reason: 'The office has no Start for this job from you.' };
  if (entry.finishedAt) return { ok: true, entryId: entry.id };
  await db.update(schema.timesheetEntries)
    .set({ finishedAt: clock, minutes: officeMinutes(entry.createdAt, new Date()) })
    .where(and(eq(schema.timesheetEntries.id, entry.id), eq(schema.timesheetEntries.tenantId, user.tenantId), isNull(schema.timesheetEntries.finishedAt)));
  revalidatePath('/jobs');
  revalidatePath('/tech-day');
  return { ok: true, entryId: entry.id };
}
