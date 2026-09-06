'use server';
import { revalidatePath } from 'next/cache';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';

/** Save Y/N/NA answers and notes for one role in one period. Refuses locked periods. */
export async function saveScorecard(formData: FormData) {
  const roleId = String(formData.get('roleId'));
  const periodId = String(formData.get('periodId'));
  const period = db.select().from(schema.periods).where(eq(schema.periods.id, periodId)).get();
  if (!period || period.status === 'locked') throw new Error('Period is locked — locked months are never edited.');

  const now = new Date().toISOString();
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('answer:')) continue;
    const criterionId = key.slice('answer:'.length);
    const answer = String(value);
    const note = String(formData.get(`note:${criterionId}`) ?? '') || null;
    const existing = db.select().from(schema.assessments)
      .where(and(eq(schema.assessments.periodId, periodId), eq(schema.assessments.roleId, roleId), eq(schema.assessments.criterionId, criterionId))).get();
    if (existing) {
      db.update(schema.assessments).set({ answer, note, enteredAt: now }).where(eq(schema.assessments.id, existing.id)).run();
    } else {
      db.insert(schema.assessments).values({ id: randomUUID(), periodId, roleId, criterionId, answer, note, enteredAt: now }).run();
    }
  }
  revalidatePath('/'); revalidatePath('/team'); revalidatePath(`/scorecard/${roleId}`);
}
