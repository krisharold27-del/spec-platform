'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { getCurrentUser, canManage } from '@/lib/auth';
import { assertWritable } from '@/lib/plan';
import { actionsOf, decisionsOf, attendeesOf, mondayOf } from '@/lib/meeting';

/**
 * Writing to this week's meeting.
 *
 * Everything here writes to one row per week, created on first touch. The meeting is a record of
 * what a room decided, so it is only ever appended to by somebody who was entitled to be in it —
 * and it carries no business content anywhere outside SPEC.
 */
async function thisWeek(tenantId: string) {
  const weekOf = mondayOf(new Date().toISOString());
  const rows = (await db.select().from(schema.meetings).where(eq(schema.meetings.tenantId, tenantId)))
    .filter(m => m.type === 'sog' && mondayOf(m.date) === weekOf);
  if (rows[0]) return rows[0];

  const id = randomUUID();
  await db.insert(schema.meetings).values({
    id, tenantId, type: 'sog', date: new Date().toISOString().slice(0, 10),
  });
  return (await db.select().from(schema.meetings).where(eq(schema.meetings.id, id)))[0];
}

async function writer() {
  const user = await getCurrentUser();
  if (!user || !canManage(user.access)) redirect('/signin');
  await assertWritable(user.tenantId);
  return user;
}

/** Add an action, with the name of whoever owns it. An action with no owner is not an action. */
export async function addAction(formData: FormData) {
  const user = await writer();
  const text = String(formData.get('text') ?? '').trim();
  const owner = String(formData.get('owner') ?? '').trim();
  if (!text || !owner) return;

  const row = await thisWeek(user.tenantId);
  const pillar = String(formData.get('pillar') ?? '') || null;
  const due = String(formData.get('due') ?? '') || null;
  const next = [...actionsOf(row), { id: randomUUID(), text, owner, due, done: false, pillar }];
  await db.update(schema.meetings).set({ actions: JSON.stringify(next) }).where(eq(schema.meetings.id, row.id));
  revalidatePath('/meeting');
}

/** Tick an action off, on this week's row or on the week it was carried from. */
export async function completeAction(formData: FormData) {
  const user = await writer();
  const actionId = String(formData.get('actionId') ?? '');
  if (!actionId) return;

  const rows = (await db.select().from(schema.meetings).where(eq(schema.meetings.tenantId, user.tenantId)))
    .filter(m => m.type === 'sog');
  for (const row of rows) {
    const actions = actionsOf(row);
    if (!actions.some(a => a.id === actionId)) continue;
    const next = actions.map(a => (a.id === actionId ? { ...a, done: !a.done } : a));
    await db.update(schema.meetings).set({ actions: JSON.stringify(next) }).where(eq(schema.meetings.id, row.id));
    break;
  }
  revalidatePath('/meeting');
}

/** Record a decision. Dated and attributed, because a decision outlives the week it was made in. */
export async function addDecision(formData: FormData) {
  const user = await writer();
  const text = String(formData.get('text') ?? '').trim();
  if (!text) return;

  const row = await thisWeek(user.tenantId);
  const next = [...decisionsOf(row), { text, who: user.name, at: new Date().toISOString().slice(0, 10) }];
  await db.update(schema.meetings).set({ decisions: JSON.stringify(next) }).where(eq(schema.meetings.id, row.id));
  revalidatePath('/meeting');
}

/** Who was in the room. A senior meeting the senior group did not attend is a note, not a meeting. */
export async function toggleAttendee(formData: FormData) {
  const user = await writer();
  const person = String(formData.get('person') ?? '').trim();
  if (!person) return;

  const row = await thisWeek(user.tenantId);
  const held = attendeesOf(row);
  const next = held.includes(person) ? held.filter(p => p !== person) : [...held, person];
  await db.update(schema.meetings).set({ attendees: JSON.stringify(next) }).where(eq(schema.meetings.id, row.id));
  revalidatePath('/meeting');
}

/** Log the meeting: the minutes, and the week it belongs to. Logging is what keeps the month scoreable. */
export async function logMeeting(formData: FormData) {
  const user = await writer();
  const row = await thisWeek(user.tenantId);
  const minutes = String(formData.get('minutes') ?? '').trim() || null;
  await db.update(schema.meetings).set({ minutes }).where(eq(schema.meetings.id, row.id));
  revalidatePath('/meeting');
  revalidatePath('/my-page');
}
