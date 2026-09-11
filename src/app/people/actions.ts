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
