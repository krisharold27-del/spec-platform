'use server';
import { redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { assertWritable } from '@/lib/plan';

export async function setCadence(formData: FormData) {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  await assertWritable(user.tenantId);
  const cadence = formData.get('cadence') === 'quarterly' ? 'quarterly' : 'monthly';
  await db.update(schema.tenants).set({ boardCadence: cadence }).where(eq(schema.tenants.id, user.tenantId));
  redirect('/setup/board?saved=1');
}

export async function addDirector(formData: FormData) {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  await assertWritable(user.tenantId);
  const name = String(formData.get('name') ?? '').trim();
  if (!name) redirect('/setup/board?error=name');
  await db.insert(schema.directors).values({
    id: randomUUID(),
    tenantId: user.tenantId,
    name,
    title: String(formData.get('title') ?? '').trim() || null,
    appointedAt: String(formData.get('appointedAt') ?? '').trim() || null,
    active: true,
  });
  redirect('/setup/board');
}

/**
 * Directors are stood down, never deleted. Who was on the board in a given month is part of the
 * record that month's pack was approved under.
 */
export async function standDownDirector(formData: FormData) {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  await assertWritable(user.tenantId);
  const id = String(formData.get('id') ?? '');
  await db.update(schema.directors).set({ active: false })
    .where(and(eq(schema.directors.id, id), eq(schema.directors.tenantId, user.tenantId)));
  redirect('/setup/board');
}

export async function recordBoardMeeting(formData: FormData) {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  await assertWritable(user.tenantId);
  const date = String(formData.get('date') ?? '').trim();
  if (!date) redirect('/setup/board?error=date');
  await db.insert(schema.meetings).values({
    id: randomUUID(),
    tenantId: user.tenantId,
    type: 'board',
    date,
    minutes: String(formData.get('minutes') ?? '').trim() || null,
    actions: null,
  });
  redirect('/setup/board');
}
