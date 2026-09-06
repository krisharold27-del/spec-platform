'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';

/** Save answers for one diagnostic section. Fields are named q:<sectionId>:<questionId>. */
export async function saveSection(formData: FormData) {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  const sectionId = String(formData.get('sectionId'));
  const now = new Date().toISOString();
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('q:')) continue;
    const [, sec, qid] = key.split(':');
    const answer = String(value).trim();
    const existing = db.select().from(schema.diagnostics)
      .where(and(eq(schema.diagnostics.tenantId, user.tenantId), eq(schema.diagnostics.sectionId, sec), eq(schema.diagnostics.questionId, qid))).get();
    if (existing) db.update(schema.diagnostics).set({ answer, answeredBy: user.email, answeredAt: now }).where(eq(schema.diagnostics.id, existing.id)).run();
    else if (answer) db.insert(schema.diagnostics).values({ id: randomUUID(), tenantId: user.tenantId, sectionId: sec, questionId: qid, answer, answeredBy: user.email, answeredAt: now }).run();
  }
  revalidatePath('/setup/expectations'); revalidatePath('/journey');
  redirect(`/setup/expectations#${sectionId}`);
}
