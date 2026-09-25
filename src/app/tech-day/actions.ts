'use server';
import { revalidatePath } from 'next/cache';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { assertWritable } from '@/lib/plan';
import { head } from '@vercel/blob';
import { isDayRecord, recordLabel, validClock, dayNear, daysAround, officeMinutes } from '@/lib/tech-day';
import { ownsPath } from '@/lib/photos';

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

/** What `recordOnJob` answers with — a sentence for the phone, not an id. */
export type Recorded = { ok: true; says: string } | { ok: false; says: string };

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

/**
 * Record one thing that happened on the job — the SWMS, a photo, materials, the client's signature.
 *
 * One action for all four, because they are one shape: who, what, when. The order is enforced by
 * the screen showing only the next thing, not by refusing here — the technician is on site with a
 * customer waiting, and a phone that argues is a phone that gets put back in the pocket.
 */
export async function recordOnJob(input: {
  jobId: string;
  kind: string;
  who: string;
  what: string;
  itemId?: string | null;
  qty?: number | null;
}): Promise<Recorded> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, says: 'Sign in first.' };
  if (!isDayRecord(input.kind)) return { ok: false, says: 'SPEC does not know that kind of record.' };

  const jobId = String(input.jobId ?? '').slice(0, 64);
  const [job] = await db.select({ id: schema.jobs.id }).from(schema.jobs)
    .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.tenantId, user.tenantId)));
  if (!job) return { ok: false, says: 'That job is not in this business.' };

  /*
    Materials land on the job's cost rather than sitting as a note nobody prices. Only an item from
    this business's own catalogue, and only a sensible quantity.
  */
  let itemId: string | null = null;
  let qty: number | null = null;
  if (input.kind === 'materials' && input.itemId) {
    const [item] = await db.select({ id: schema.catalogueItems.id, costCents: schema.catalogueItems.costCents })
      .from(schema.catalogueItems)
      .where(and(eq(schema.catalogueItems.id, input.itemId), eq(schema.catalogueItems.tenantId, user.tenantId)));
    if (item) {
      itemId = item.id;
      qty = Math.max(1, Math.min(9999, Math.round(Number(input.qty) || 1)));
      const [current] = await db.select({ materialsCents: schema.jobs.materialsCents })
        .from(schema.jobs).where(eq(schema.jobs.id, jobId));
      await db.update(schema.jobs)
        .set({ materialsCents: (current?.materialsCents ?? 0) + item.costCents * qty })
        .where(eq(schema.jobs.id, jobId));
    }
  }

  await db.insert(schema.jobRecords).values({
    id: randomUUID(),
    tenantId: user.tenantId,
    jobId,
    kind: input.kind,
    who: String(input.who ?? user.name ?? 'Crew').slice(0, 120),
    what: String(input.what ?? '').slice(0, 400),
    itemId,
    qty,
    atTime: new Date().toISOString(),
  });

  revalidatePath('/tech-day');
  revalidatePath('/jobs');
  return { ok: true, says: `${recordLabel(input.kind)} recorded.` };
}

/**
 * Attach a photo that has already gone into the store.
 *
 * ── Why the row is written here and not by the store's own callback ──────────────────────────────
 *
 * Vercel Blob will call back to a deployment when an upload finishes, and writing the row there
 * looks tidier. It cannot reach a laptop, so a product built that way works in production and does
 * nothing at all everywhere it is developed, tested and demonstrated — the class of thing that is
 * found by a customer. One path, the same one everywhere.
 *
 * ── Which means the phone's word is not enough ───────────────────────────────────────────────────
 *
 * The phone tells SPEC where it put the file. Two things are asked before that becomes a record:
 * the path is inside this business's own folder, and `head()` says a file is really there. Without
 * the second, a row could claim a photo that was never uploaded, and the register would show an
 * evidence chain with nothing on the end of it — which is worse than the honest gap SPEC had
 * before, because this one looks complete.
 */
export async function attachPhoto(input: {
  jobId: string;
  path: string;
  caption: string;
  who?: string | null;
}): Promise<Recorded> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, says: 'Sign in first.' };
  try {
    await assertWritable(user.tenantId);
  } catch {
    return { ok: false, says: 'This business is read-only until the payment is sorted.' };
  }

  const path = String(input.path ?? '').slice(0, 400);
  if (!ownsPath(user.tenantId, path)) {
    return { ok: false, says: 'SPEC cannot keep a photo from there.' };
  }

  const jobId = String(input.jobId ?? '').slice(0, 64);
  const [job] = await db.select({ id: schema.jobs.id }).from(schema.jobs)
    .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.tenantId, user.tenantId)));
  if (!job) return { ok: false, says: 'That job is not in this business.' };

  // The file has to actually be there. A record pointing at nothing is a worse lie than no record.
  const there = await head(path).catch(() => null);
  if (!there) return { ok: false, says: 'That photo did not reach the store. Try it again.' };

  await db.insert(schema.jobRecords).values({
    id: randomUUID(),
    tenantId: user.tenantId,
    jobId,
    kind: 'photo',
    who: String(input.who ?? user.name ?? 'Crew').slice(0, 120),
    what: String(input.caption ?? '').slice(0, 400),
    itemId: null,
    qty: null,
    fileRef: path,
    atTime: new Date().toISOString(),
  });

  revalidatePath('/tech-day');
  revalidatePath('/jobs');
  return { ok: true, says: 'Photo saved to the job.' };
}

/**
 * Turned up and could not get in. One press.
 *
 * ── Why this takes no arguments worth speaking of ────────────────────────────────────────────────
 *
 * The person pressing it is standing in a driveway with a phone in one hand. Anything with a
 * decision in it does not get pressed — and a record only made on quiet days is worse than none,
 * because the number it produces says quiet days have the most no-access.
 *
 * So the press records the fact, and the reason is offered afterwards and never required. The job
 * goes back to `won` so it returns to the list waiting to be booked: a job left `scheduled` for a
 * day nobody worked is a job that looks done from the office.
 */
export async function couldNotGetIn(formData: FormData): Promise<Recorded> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, says: 'Sign in first.' };
  await assertWritable(user.tenantId);

  const jobId = String(formData.get('jobId') ?? '').slice(0, 64);
  const [job] = await db.select({ id: schema.jobs.id, ref: schema.jobs.ref, stage: schema.jobs.stage })
    .from(schema.jobs)
    .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.tenantId, user.tenantId)));
  if (!job) return { ok: false, says: 'That job is not on your day.' };

  const at = new Date().toISOString();
  await db.insert(schema.noAccessVisits).values({
    id: randomUUID(),
    tenantId: user.tenantId,
    jobId: job.id,
    who: user.name ?? user.email ?? 'Somebody',
    because: String(formData.get('because') ?? '').trim().slice(0, 200) || null,
    /*
      The customer is told as part of the same press. Telling them later is what turns a wasted
      visit into an argument about whether anybody came.
    */
    toldAt: at,
    createdAt: at,
  });

  /* Back to waiting-to-be-booked. A job left scheduled for a day nobody worked looks done. */
  if (job.stage === 'scheduled') {
    await db.update(schema.jobs).set({ stage: 'won', stageAt: at })
      .where(eq(schema.jobs.id, job.id));
  }

  revalidatePath('/tech-day');
  revalidatePath('/jobs');
  return { ok: true, says: `Recorded, and ${job.ref} is back on the list to rebook. No charge to the customer for today.` };
}
