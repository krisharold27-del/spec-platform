'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { getCurrentUser, canManage } from '@/lib/auth';
import { getScope } from '@/lib/scope';
import { assertWritable } from '@/lib/plan';

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
  const user = await getCurrentUser();
  if (!user || !canManage(user.access)) redirect('/signin');
  await assertWritable(user.tenantId);

  const roleId = String(formData.get('roleId') ?? '');
  const scope = await getScope(user);
  if (!roleId || !scope.canEdit(roleId)) throw new Error('That role is outside your part of the chart.');

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
