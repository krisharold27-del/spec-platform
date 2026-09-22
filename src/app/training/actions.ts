'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { requireManager } from '@/lib/guard';
import { getCurrentUser } from '@/lib/auth';
import { getScope, assertAdministrator } from '@/lib/scope';
import { assertWritable } from '@/lib/plan';
import { refuseTo } from '@/lib/refuse';

/**
 * Setting the path a role has to complete.
 *
 * The path belongs to the role: reassigning somebody never edits it, and a role may require
 * training with nobody in it. Core modules cannot be dropped — a business that can remove them ends
 * up with people scoring a month having never been told how scoring works.
 *
 * Nothing here touches anybody's progress. Changing a path adds and removes what COUNTS; what
 * somebody has already passed stays passed.
 */
export async function setCurriculum(formData: FormData) {
  const user = await requireManager();
  await assertWritable(user.tenantId);

  const roleId = String(formData.get('roleId') ?? '');
  const scope = await getScope(user);
  if (!roleId || !scope.canEdit(roleId)) refuseTo('/training', 'That role is outside your part of the chart.');

  const wanted = new Set(formData.getAll('moduleId').map(String).filter(Boolean));

  // Only this business's own modules: the ids arrive from a form anybody can edit.
  const modules = await db.select().from(schema.trainingModules)
    .where(eq(schema.trainingModules.tenantId, user.tenantId));
  const valid = new Map(modules.filter(m => m.active).map(m => [m.id, m]));
  // Core modules ride along whether or not the form sent them.
  for (const m of valid.values()) if (m.core) wanted.add(m.id);

  const existing = await db.select().from(schema.roleCurriculum)
    .where(eq(schema.roleCurriculum.roleId, roleId));
  const held = new Set(existing.map(e => e.moduleId));

  const toAdd = [...wanted].filter(id => valid.has(id) && !held.has(id));
  const toRemove = existing.filter(e => !wanted.has(e.moduleId));

  if (toAdd.length) {
    await db.insert(schema.roleCurriculum).values(toAdd.map((moduleId, i) => ({
      id: randomUUID(), roleId, moduleId, dueDays: 90, sortOrder: existing.length + i,
    }))).onConflictDoNothing();
  }
  if (toRemove.length) {
    await db.delete(schema.roleCurriculum)
      .where(and(eq(schema.roleCurriculum.roleId, roleId), inArray(schema.roleCurriculum.id, toRemove.map(r => r.id))));
  }

  revalidatePath('/training');
  revalidatePath('/my-page');
}

/**
 * Put somebody on the leadership seat's training upgrade, or take them off it.
 *
 * Administration, because it changes the bill — moved here from Settings 22 September, so the
 * control sits beside the material it unlocks rather than behind Seats and billing. Leadership
 * seats only: the server checks the chart rather than trusting the form, since a form is a
 * suggestion and this one decides money.
 *
 * Turning it on installs SPEC's material into the business and puts it on that role's path in the
 * same operation. Doing only the billing half would charge somebody the training price for a page
 * identical to the plain one, which is precisely the fault this mechanism exists to fix.
 */
export async function setTrainingSeat(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  assertAdministrator(await getScope(user));
  await assertWritable(user.tenantId);

  const userId = String(formData.get('userId') ?? '');
  const on = String(formData.get('on') ?? '') === '1';
  if (!userId) return;

  const { giveTrainingSeat, removeTrainingSeat } = await import('@/lib/training-seat');
  if (on) {
    const done = await giveTrainingSeat(user.tenantId, userId);
    if (!done) {
      // Not on a leadership seat. Say so rather than failing silently or throwing a page away.
      revalidatePath('/training');
      refuseTo('/training', 'That person is not on a leadership seat, so the training upgrade does not apply to them.');
    }
  } else {
    await removeTrainingSeat(user.tenantId, userId);
  }
  revalidatePath('/training');
  revalidatePath('/settings');
  revalidatePath('/journey');
}
