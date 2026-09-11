'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { getCurrentUser, canManage } from '@/lib/auth';
import { getScope } from '@/lib/scope';
import { assertWritable } from '@/lib/plan';
import { actionsOf, mondayOf } from '@/lib/meeting';

/**
 * The two things somebody on site actually writes.
 *
 * Both are plain form posts so they work on one bar of signal: there is no client bundle to
 * download before the first tap does anything, and a submit either goes through or does not rather
 * than sitting in a queue nobody can see.
 */

/** Log the talk. It is a record that the crew was told, not a transcript of what was said. */
export async function logToolbox(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || !canManage(user.access)) redirect('/signin');
  await assertWritable(user.tenantId);

  const topic = String(formData.get('topic') ?? '').trim();
  if (!topic) return;

  await db.insert(schema.meetings).values({
    id: randomUUID(), tenantId: user.tenantId, type: 'sog',
    date: new Date().toISOString().slice(0, 10),
    minutes: `Toolbox talk: ${topic}`,
    attendees: null, decisions: null,
  });
  revalidatePath('/site');
  revalidatePath('/meeting');
}

/**
 * Report a near miss.
 *
 * Deliberately open to anybody with a seat, including a readonly one. A near miss that only a
 * manager can report is a near miss that does not get reported, and nothing about filing one counts
 * against the person who did.
 *
 * It lands as an action on this week's meeting with a name against it, so it reaches the room
 * rather than a drawer.
 */
export async function reportHazard(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  await assertWritable(user.tenantId);

  const what = String(formData.get('what') ?? '').trim();
  if (!what) return;

  const scope = await getScope(user);
  // Whoever the reporter reports to owns following it up. If they are the top of the chart, it is
  // theirs — a hazard with nobody against it is how one gets lost.
  const mine = scope.myRoleId ? scope.roles.find(r => r.id === scope.myRoleId) : undefined;
  const above = mine?.reportsToRoleId ? scope.roles.find(r => r.id === mine.reportsToRoleId) : undefined;
  const owner = above?.holder?.name ?? above?.pencilled ?? user.name;

  const weekOf = mondayOf(new Date().toISOString());
  const rows = (await db.select().from(schema.meetings).where(eq(schema.meetings.tenantId, user.tenantId)))
    .filter(m => m.type === 'sog' && mondayOf(m.date) === weekOf);

  const entry = {
    id: randomUUID(),
    text: `Near miss reported by ${user.name}: ${what}`,
    owner,
    due: null,
    done: false,
    pillar: 'safety' as const,
  };

  if (rows[0]) {
    await db.update(schema.meetings)
      .set({ actions: JSON.stringify([...actionsOf(rows[0]), entry]) })
      .where(eq(schema.meetings.id, rows[0].id));
  } else {
    await db.insert(schema.meetings).values({
      id: randomUUID(), tenantId: user.tenantId, type: 'sog',
      date: new Date().toISOString().slice(0, 10),
      actions: JSON.stringify([entry]),
    });
  }
  revalidatePath('/site');
  revalidatePath('/meeting');
}
