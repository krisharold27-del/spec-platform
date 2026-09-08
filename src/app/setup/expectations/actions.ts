'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { assertWritable } from '@/lib/plan';

/**
 * Save a single diagnostic answer. The interview saves as the leader answers rather than behind a
 * Save button, so this is called once per question and must be cheap and idempotent.
 */
export async function saveAnswer(sectionId: string, questionId: string, value: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  await assertWritable(user.tenantId);
  const answer = value.trim();
  const now = new Date().toISOString();

  const existing = (await db.select().from(schema.diagnostics).where(and(
    eq(schema.diagnostics.tenantId, user.tenantId),
    eq(schema.diagnostics.sectionId, sectionId),
    eq(schema.diagnostics.questionId, questionId),
  )))[0];

  if (existing) {
    await db.update(schema.diagnostics)
      .set({ answer, answeredBy: user.email, answeredAt: now })
      .where(eq(schema.diagnostics.id, existing.id));
  } else if (answer) {
    await db.insert(schema.diagnostics).values({
      id: randomUUID(), tenantId: user.tenantId, sectionId, questionId,
      answer, answeredBy: user.email, answeredAt: now,
    });
  }

  // The journey page reports diagnostic progress, so it has to see each answer land.
  revalidatePath('/journey');
  return { ok: true };
}
