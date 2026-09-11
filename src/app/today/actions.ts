'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { getCurrentUser, canManage } from '@/lib/auth';
import { assertWritable } from '@/lib/plan';
import { weekStart } from '@/lib/today-data';

/**
 * Log this week's senior meeting.
 *
 * The only write Today makes. It records that the meeting happened — a date against the business,
 * nothing about what was said — because a month where the senior group never sat is not a month
 * that can be honestly scored. Logging twice in one week is a no-op rather than a second row.
 */
export async function logWeeklyMeeting() {
  const user = await getCurrentUser();
  if (!user || !canManage(user.access)) redirect('/signin');
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
  revalidatePath('/today');
}
