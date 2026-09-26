'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { requireManager } from '@/lib/guard';
import { getScope } from '@/lib/scope';
import { assertWritable } from '@/lib/plan';
import { weekStart } from '@/lib/today-data';
import { QUOTE_CHASE } from '@/lib/growth';

/**
 * Log this week's senior meeting.
 *
 * The only write Today makes. It records that the meeting happened — a date against the business,
 * nothing about what was said — because a month where the senior group never sat is not a month
 * that can be honestly scored. Logging twice in one week is a no-op rather than a second row.
 */
export async function logWeeklyMeeting() {
  const user = await requireManager();
  await assertWritable(user.tenantId);

  const since = weekStart(new Date());
  const existing = (await db.select().from(schema.meetings).where(eq(schema.meetings.tenantId, user.tenantId)))
    .filter(m => m.type === 'sog' && m.date >= since);
  if (!existing.length) {
    await db.insert(schema.meetings).values({
      id: randomUUID(),
      tenantId: user.tenantId,
      type: 'sog',
      date: new Date().toISOString().slice(0, 10),
    });
  }
  revalidatePath('/my-page');
}

/** How far one press of Continue carries somebody through a module. */
const STEP = 25;

/**
 * Work through a module on the path of the role you hold.
 *
 * Deliberately narrow: it moves the signed-in person's own progress and nothing else. It cannot
 * touch anybody else's record, cannot reach a module that is not on this person's own path, and
 * cannot sign a path off — sign-off is a manager's decision about somebody they work with, not
 * something a progress bar awards itself.
 */
export async function continueModule(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  await assertWritable(user.tenantId);

  const moduleId = String(formData.get('moduleId') ?? '');
  if (!moduleId) return;

  // The module id comes from a form anybody can edit. It has to be on the path of the role this
  // person actually holds, in their own business, or nothing happens.
  const scope = await getScope(user);
  if (!scope.myRoleId) return;
  const [onPath] = await db.select().from(schema.roleCurriculum)
    .where(and(eq(schema.roleCurriculum.roleId, scope.myRoleId), eq(schema.roleCurriculum.moduleId, moduleId)));
  if (!onPath) return;
  const [module] = await db.select().from(schema.trainingModules)
    .where(and(eq(schema.trainingModules.id, moduleId), eq(schema.trainingModules.tenantId, user.tenantId)));
  if (!module || !module.active) return;

  const [existing] = await db.select().from(schema.trainingRecords)
    .where(and(eq(schema.trainingRecords.userId, user.id), eq(schema.trainingRecords.moduleId, moduleId)));

  const at = new Date().toISOString();
  const next = Math.min(100, (existing?.progress ?? 0) + STEP);
  const finished = next >= 100;

  if (existing) {
    // A module already passed is reviewed, never reset — and its mark is never overwritten here.
    if (existing.progress >= 100) return;
    await db.update(schema.trainingRecords)
      .set({ progress: next, completedAt: finished ? at : null })
      .where(eq(schema.trainingRecords.id, existing.id));
  } else {
    await db.insert(schema.trainingRecords).values({
      id: randomUUID(), tenantId: user.tenantId, moduleId, userId: user.id,
      progress: next, startedAt: at, completedAt: finished ? at : null,
    });
  }
  revalidatePath('/my-page');
}

/**
 * Sign a person's path off for the role they hold — the manager's decision that they are trained
 * and capable in it. Only somebody this person reports to, who may manage that role, can do it,
 * and only once the path is actually finished.
 */
export async function signOffTraining(formData: FormData) {
  const user = await requireManager();
  await assertWritable(user.tenantId);

  const roleId = String(formData.get('roleId') ?? '');
  const scope = await getScope(user);
  // Never your own path, and never outside your chain: scope.canEdit covers the chain, and a role
  // signing itself off would make the step meaningless.
  if (!roleId || roleId === scope.myRoleId || !scope.canEdit(roleId)) return;

  const [assignment] = await db.select().from(schema.roleAssignments)
    .where(and(eq(schema.roleAssignments.roleId, roleId), isNull(schema.roleAssignments.toDate)));
  if (!assignment || assignment.trainedAt) return;

  const curriculum = await db.select().from(schema.roleCurriculum).where(eq(schema.roleCurriculum.roleId, roleId));
  if (!curriculum.length) return;
  const records = assignment.userId
    ? await db.select().from(schema.trainingRecords)
        .where(and(eq(schema.trainingRecords.tenantId, user.tenantId), eq(schema.trainingRecords.userId, assignment.userId)))
    : [];
  const done = new Set(records.filter(r => r.progress >= 100).map(r => r.moduleId));
  if (!curriculum.every(c => done.has(c.moduleId))) return;

  await db.update(schema.roleAssignments)
    .set({ trainedAt: new Date().toISOString(), trainedBy: user.name })
    .where(eq(schema.roleAssignments.id, assignment.id));
  revalidatePath('/my-page');
  revalidatePath(`/scorecard/${roleId}`);
}

/**
 * Approve SPEC's draft chase on a late quote and record it as sent — from My Page.
 *
 * Kris, 26 September: *"control is always in my page - this is associated with the administrator of
 * the company"*. The quote chases already lived on Jobs; the decision to send one is the
 * administrator's, so the control sits on the page they open every morning. Same row as Jobs'
 * "Sent it" (`quote_chases`), so a chase approved here never shows as due there, and vice versa.
 */
export async function approveQuoteChase(form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  const scope = await getScope(user);
  if (!scope.canAdminister) redirect('/my-page');
  await assertWritable(user.tenantId);

  const jobId = String(form.get('jobId') ?? '').slice(0, 64);
  const day = Number(form.get('day') ?? 0);
  if (!QUOTE_CHASE.includes(day as (typeof QUOTE_CHASE)[number])) redirect('/my-page');

  /* Found in this business and still out as a quote, so an id from anywhere else finds nothing. */
  const [job] = await db.select().from(schema.jobs)
    .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.tenantId, user.tenantId)));
  if (!job || job.stage !== 'quoted') redirect('/my-page');

  /* Pressed twice, or already sent from Jobs: one row, never two. */
  const already = await db.select().from(schema.quoteChases).where(and(
    eq(schema.quoteChases.tenantId, user.tenantId),
    eq(schema.quoteChases.jobId, jobId),
    eq(schema.quoteChases.day, day),
  ));
  if (!already.length) {
    await db.insert(schema.quoteChases).values({
      id: randomUUID(),
      tenantId: user.tenantId,
      jobId,
      day,
      said: String(form.get('said') ?? '').slice(0, 2000) || null,
      sentAt: new Date().toISOString(),
      sentBy: user.id,
    });
  }
  revalidatePath('/my-page');
  revalidatePath('/jobs');
  redirect(`/my-page?chased=${encodeURIComponent(jobId)}#late-quotes`);
}
