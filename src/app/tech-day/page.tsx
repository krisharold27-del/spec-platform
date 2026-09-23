import { redirect } from 'next/navigation';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { daysAround, type Booked } from '@/lib/tech-day';
import { getScorecard } from '@/lib/queries';
import { currentPeriod } from '@/lib/period';
import { getScope } from '@/lib/scope';
import { isScored } from '@/lib/today-data';
import { TechDayPhone, type ClearToWork, type OfficeEntry } from '@/components/tech-day-phone';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Today — siteVIP' };

/**
 * The tech's day, on the phone — designs/SPEC Tech Day.dc.html.
 *
 *   Sign the SWMS → Start the job → Add photos → Materials used → Client sign-off → Finish
 *
 * and the timesheet builds itself from Start and Finish. The rules for that order live in
 * lib/tech-day and are tested there; the phone component is only the buttons.
 *
 * ── What is real and what is not ──────────────────────────────────────────────────────────────
 *
 * Real: who you are, and whether you are clear to work — read from the Compliance pillar of your own
 * role's card this month, exactly as /site reads it for a crew. **Since 23 September, the jobs the
 * office booked you on** (schedule_bookings, around today) **and your hours**: Start opens a
 * timesheet entry and Finish closes it (`clockOn`/`clockOff`), so the office's Timesheets tab has
 * them the moment they happen, waiting for the week's approval. A job you name yourself still works,
 * as hours not on a scheduled job.
 *
 * Not yet: SWMS, photos, materials and the client's signature have no store in SPEC, so those stay on
 * this phone, and the phone says so where somebody might think the office already has them.
 */
export default async function TechDay() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');

  /*
    Clear to work, for this person only. Guarded: the day on the phone must still open when the card
    cannot be read — no signal to the database is not a reason to stop somebody signing a SWMS. An
    unread card is "not recorded", never "not clear". Pending is never red.
  */
  let clear: ClearToWork = { state: 'unknown', blocked: [] };
  try {
    const scope = await getScope(user);
    const period = await currentPeriod(user.tenantId);
    const mine = scope.myRoleId ? scope.roles.find(r => r.id === scope.myRoleId) ?? null : null;
    if (mine && period) {
      const { rows } = await getScorecard(mine.id, period.id);
      if (isScored(mine.level, rows.length, mine.isTeam)) {
        const compliance = rows.filter(r => r.pillar === 'compliance');
        const blocked = compliance.filter(r => r.answer === 'N').map(r => r.text);
        const marked = compliance.some(r => r.answer === 'Y');
        clear = blocked.length ? { state: 'not_clear', blocked } : marked ? { state: 'clear', blocked: [] } : clear;
      }
    }
  } catch {
    // Left as 'unknown' — see above.
  }

  /*
    The office's side. Everything is keyed to THIS person — their login, and the staff row they were
    pencilled in as before they had one, which is where a booking made before their invitation sits.
    Guarded like the card above: no database is a phone that still works, not a page that fails.
  */
  let booked: Booked[] = [];
  let open: OfficeEntry | null = null;
  try {
    const staff = await db.select({ id: schema.staff.id }).from(schema.staff)
      .where(and(eq(schema.staff.tenantId, user.tenantId), eq(schema.staff.userId, user.id)));
    const keys = [`user:${user.id}`, ...staff.map(s => `staff:${s.id}`)];
    const rows = await db.select({
      jobId: schema.jobs.id, ref: schema.jobs.ref, title: schema.jobs.title, site: schema.jobs.site,
      client: schema.jobs.client, day: schema.scheduleBookings.day,
    })
      .from(schema.scheduleBookings)
      .innerJoin(schema.jobs, and(eq(schema.jobs.id, schema.scheduleBookings.jobId), eq(schema.jobs.tenantId, user.tenantId)))
      .where(and(
        eq(schema.scheduleBookings.tenantId, user.tenantId),
        inArray(schema.scheduleBookings.personKey, keys),
        inArray(schema.scheduleBookings.day, daysAround(new Date())),
      ));
    booked = rows;
    const [entry] = await db.select().from(schema.timesheetEntries)
      .where(and(
        eq(schema.timesheetEntries.tenantId, user.tenantId), eq(schema.timesheetEntries.personKey, `user:${user.id}`),
        eq(schema.timesheetEntries.source, 'phone'), isNull(schema.timesheetEntries.finishedAt),
      ));
    if (entry) {
      const job = entry.jobId ? rows.find(r => r.jobId === entry.jobId) : undefined;
      open = { entryId: entry.id, startedAt: entry.createdAt, title: job?.title ?? 'The job you started', jobId: entry.jobId };
    }
  } catch {
    // The phone still runs the day on its own; it says so.
  }

  const firstName = (user.name ?? '').trim().split(/\s+/)[0] || '';
  return <TechDayPhone userId={user.id} name={user.name ?? ''} firstName={firstName} clear={clear} booked={booked} open={open} />;
}
