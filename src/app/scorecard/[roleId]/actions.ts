'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { getScope } from '@/lib/scope';
import { assertWritable } from '@/lib/plan';

/**
 * Save Y/N/NA answers and notes for one role in one period.
 *
 * A server action is a public endpoint: the role id arrives from the client and is not to be
 * trusted. Permission is re-checked here even though the page already hid the form.
 */
export async function saveScorecard(formData: FormData) {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  const roleId = String(formData.get('roleId'));
  const periodId = String(formData.get('periodId'));

  await assertWritable(user.tenantId);
  const scope = await getScope(user);
  if (!scope.canEdit(roleId)) throw new Error('You can only score your own role and the roles beneath it.');

  const periods = await db.select().from(schema.periods)
    .where(and(eq(schema.periods.id, periodId), eq(schema.periods.tenantId, user.tenantId)));
  const period = periods[0];
  if (!period || period.status === 'locked') throw new Error('Period is locked — locked months are never edited.');

  const now = new Date().toISOString();
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('answer:')) continue;
    const criterionId = key.slice('answer:'.length);
    const answer = String(value);
    const note = String(formData.get(`note:${criterionId}`) ?? '') || null;
    const existingRows = await db.select().from(schema.assessments)
      .where(and(eq(schema.assessments.periodId, periodId), eq(schema.assessments.roleId, roleId), eq(schema.assessments.criterionId, criterionId)));
    const existing = existingRows[0];
    if (existing) {
      await db.update(schema.assessments).set({ answer, note, enteredAt: now }).where(eq(schema.assessments.id, existing.id));
    } else {
      await db.insert(schema.assessments).values({ id: randomUUID(), periodId, roleId, criterionId, answer, note, enteredAt: now });
    }
  }
  revalidatePath('/'); revalidatePath('/team'); revalidatePath(`/scorecard/${roleId}`);
}
