'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { getCurrentUser, canManage } from '@/lib/auth';
import { getScope } from '@/lib/scope';
import { assertWritable } from '@/lib/plan';
import { PILLARS } from '@/lib/scoring';
import { STAGES } from '@/lib/people';

/**
 * Hiring against a role.
 *
 * Everything here hangs off a role on the chart, which is the point: a vacancy is a hole in the
 * structure before it is a job ad, and a candidate is somebody being considered for a defined job
 * rather than a CV in a pile.
 */
async function manager(roleId?: string) {
  const user = await getCurrentUser();
  if (!user || !canManage(user.access)) redirect('/signin');
  await assertWritable(user.tenantId);
  if (roleId) {
    const scope = await getScope(user);
    if (!scope.canEdit(roleId)) throw new Error('That role is outside your part of the chart.');
  }
  return user;
}

export async function addCandidate(formData: FormData) {
  const roleId = String(formData.get('roleId') ?? '');
  const user = await manager(roleId);
  const name = String(formData.get('name') ?? '').trim();
  if (!name || !roleId) return;

  await db.insert(schema.candidates).values({
    id: randomUUID(), tenantId: user.tenantId, roleId, name,
    stage: 'applied', createdAt: new Date().toISOString(),
  });
  revalidatePath('/people');
}

/** Move somebody along. The stage list is fixed — a business cannot invent a seventh. */
export async function setStage(formData: FormData) {
  const user = await manager();
  const id = String(formData.get('candidateId') ?? '');
  const stage = String(formData.get('stage') ?? '');
  if (!id || !STAGES.some(s => s.key === stage)) return;

  // The id comes from a form anybody can edit: it has to be this business's own candidate, for a
  // role inside this person's scope.
  const [candidate] = await db.select().from(schema.candidates)
    .where(and(eq(schema.candidates.id, id), eq(schema.candidates.tenantId, user.tenantId)));
  if (!candidate) return;
  const scope = await getScope(user);
  if (!scope.canEdit(candidate.roleId)) throw new Error('That role is outside your part of the chart.');

  await db.update(schema.candidates).set({ stage }).where(eq(schema.candidates.id, id));
  revalidatePath('/people');
}

/**
 * Rate somebody against the four pillars the role is scored on.
 *
 * A blank stays blank rather than becoming a zero: an unrated pillar is an absence, exactly as an
 * unmarked KPI is, and a candidate rated on one pillar is not a bad candidate.
 */
export async function rateCandidate(formData: FormData) {
  const user = await manager();
  const id = String(formData.get('candidateId') ?? '');
  if (!id) return;

  const [candidate] = await db.select().from(schema.candidates)
    .where(and(eq(schema.candidates.id, id), eq(schema.candidates.tenantId, user.tenantId)));
  if (!candidate) return;
  const scope = await getScope(user);
  if (!scope.canEdit(candidate.roleId)) throw new Error('That role is outside your part of the chart.');

  const ratings: Record<string, number> = {};
  for (const p of PILLARS) {
    const raw = String(formData.get(`rating:${p}`) ?? '').trim();
    if (!raw) continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 1 && n <= 5) ratings[p] = Math.round(n);
  }

  await db.update(schema.candidates)
    .set({ ratings: Object.keys(ratings).length ? JSON.stringify(ratings) : null })
    .where(eq(schema.candidates.id, id));
  revalidatePath('/people');
}

/**
 * Who a record belongs to, from one form field.
 *
 * The dropdown offers people and roles in the same list, because that is how somebody thinks about
 * it — "Tom's white card" and "the site supervisor's insurance" are the same kind of sentence. The
 * prefix keeps them apart without a second question.
 *
 * Anything unrecognised returns nothing rather than guessing, so a tampered form writes a row
 * belonging to nobody instead of quietly attaching it to the wrong person.
 */
function holderFrom(raw: string): { staffId?: string; userId?: string; roleId?: string } {
  const [kind, id] = raw.split(':');
  if (!id) return {};
  if (kind === 'staff') return { staffId: id };
  if (kind === 'user') return { userId: id };
  if (kind === 'role') return { roleId: id };
  return {};
}

/**
 * Record a document or obligation.
 *
 * An empty expiry is kept as null on purpose: plenty of things do not expire, and a date SPEC
 * invented would either block somebody who is fine or clear somebody who is not. Both are worse
 * than an honest "does not expire".
 */
export async function addObligation(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || !canManage(user.access)) redirect('/signin');
  await assertWritable(user.tenantId);

  const what = String(formData.get('what') ?? '').trim().slice(0, 120);
  if (!what) return;
  const holder = holderFrom(String(formData.get('holder') ?? ''));

  // A role must be one this person can actually see; a person must belong to this business. The
  // ids arrive from the client, so neither is taken on trust.
  if (holder.roleId) {
    const scope = await getScope(user);
    if (!scope.canSee(holder.roleId)) throw new Error('That role is not yours to hold a record against.');
  }
  if (holder.userId) {
    const [row] = await db.select({ id: schema.users.id }).from(schema.users)
      .where(and(eq(schema.users.id, holder.userId), eq(schema.users.tenantId, user.tenantId)));
    if (!row) throw new Error('That person is not in this business.');
  }
  if (holder.staffId) {
    const [row] = await db.select({ id: schema.staff.id }).from(schema.staff)
      .where(and(eq(schema.staff.id, holder.staffId), eq(schema.staff.tenantId, user.tenantId)));
    if (!row) throw new Error('That person is not in this business.');
  }

  await db.insert(schema.obligations).values({
    id: randomUUID(),
    tenantId: user.tenantId,
    what,
    ...holder,
    expiresAt: String(formData.get('expiresAt') ?? '').trim() || null,
    evidence: String(formData.get('evidence') ?? '').trim().slice(0, 200) || null,
    createdAt: new Date().toISOString(),
  });
  revalidatePath('/people');
}

/**
 * Book somebody away.
 *
 * Entered as `requested` even when a manager types it, so the approval is a real act with a name
 * against it rather than something that happened because of who was at the keyboard. A date pair
 * the wrong way round is silently corrected — a person who typed the end first meant the range they
 * typed, and refusing it teaches nothing.
 */
export async function bookLeave(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || !canManage(user.access)) redirect('/signin');
  await assertWritable(user.tenantId);

  const holder = holderFrom(String(formData.get('person') ?? ''));
  if (!holder.staffId && !holder.userId) return;
  const a = String(formData.get('fromDate') ?? '').slice(0, 10);
  const b = String(formData.get('toDate') ?? '').slice(0, 10);
  if (!a || !b) return;
  const [fromDate, toDate] = a <= b ? [a, b] : [b, a];

  const kind = String(formData.get('kind') ?? 'annual');
  await db.insert(schema.leaveEntries).values({
    id: randomUUID(),
    tenantId: user.tenantId,
    staffId: holder.staffId ?? null,
    userId: holder.userId ?? null,
    kind: ['annual', 'sick', 'unpaid', 'parental', 'other'].includes(kind) ? kind : 'other',
    fromDate, toDate,
    state: 'requested',
    coveredBy: String(formData.get('coveredBy') ?? '').trim().slice(0, 120) || null,
    createdAt: new Date().toISOString(),
  });
  revalidatePath('/people');
}

/**
 * Approve or decline a booking.
 *
 * A decline is a real outcome, not a request left open: it keeps the name and the date exactly as
 * an approval does, and the row stays visible so nobody has to remember the conversation.
 */
export async function decideLeave(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || !canManage(user.access)) redirect('/signin');
  await assertWritable(user.tenantId);

  const id = String(formData.get('id') ?? '');
  const state = String(formData.get('state') ?? '');
  if (!id || !['approved', 'declined'].includes(state)) return;

  await db.update(schema.leaveEntries)
    .set({ state, decidedBy: user.name, decidedAt: new Date().toISOString() })
    .where(and(eq(schema.leaveEntries.id, id), eq(schema.leaveEntries.tenantId, user.tenantId)));
  revalidatePath('/people');
}
