'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { getScope } from '@/lib/scope';
import { assertWritable } from '@/lib/plan';
import { answerFor } from '@/lib/status';

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

  // Only this role's own KPIs. The ids arrive as form field names, which anybody can edit.
  const ownCriteria = new Set((await db.select({ id: schema.criteria.id }).from(schema.criteria)
    .where(eq(schema.criteria.roleId, roleId))).map(c => c.id));

  const now = new Date().toISOString();
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('status:')) continue;
    const criterionId = key.slice('status:'.length);
    if (!ownCriteria.has(criterionId)) continue;
    const status = String(value) || null;
    // The status is what the person chooses; the scoring value is derived from it, never typed.
    const answer = answerFor(status);
    const note = String(formData.get(`note:${criterionId}`) ?? '') || null;
    const result = String(formData.get(`result:${criterionId}`) ?? '').trim() || null;
    const source = String(formData.get(`source:${criterionId}`) ?? '').trim() || null;
    const existingRows = await db.select().from(schema.assessments)
      .where(and(eq(schema.assessments.periodId, periodId), eq(schema.assessments.roleId, roleId), eq(schema.assessments.criterionId, criterionId)));
    const existing = existingRows[0];
    if (existing) {
      await db.update(schema.assessments).set({ answer, status, result, source, note, enteredBy: user.email, enteredAt: now }).where(eq(schema.assessments.id, existing.id));
    } else {
      await db.insert(schema.assessments).values({ id: randomUUID(), periodId, roleId, criterionId, answer, status, result, source, note, enteredBy: user.email, enteredAt: now });
    }
  }
  revalidatePath('/'); revalidatePath('/team'); revalidatePath(`/scorecard/${roleId}`);
}

/**
 * Add a comment to a role's month.
 *
 * Comments travel with the month to sign-off and into the board pack, so they are kept against the
 * period rather than the role: what was said in August belongs to August. Anybody entitled to SEE
 * the card may comment on it — a readonly seat comments on its own month by design — but a locked
 * month takes no new comment, because nothing rewrites a closed period.
 */
export async function addComment(formData: FormData) {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  const roleId = String(formData.get('roleId'));
  const periodId = String(formData.get('periodId'));
  const body = String(formData.get('body') ?? '').trim();
  if (!body) return;

  await assertWritable(user.tenantId);
  const scope = await getScope(user);
  if (!scope.canSee(roleId)) throw new Error('That card is not yours to comment on.');

  const [period] = await db.select().from(schema.periods)
    .where(and(eq(schema.periods.id, periodId), eq(schema.periods.tenantId, user.tenantId)));
  if (!period || period.status === 'locked') throw new Error('That month is locked. Corrections are dated amendments in the next one.');

  await db.insert(schema.scorecardComments).values({
    id: randomUUID(), tenantId: user.tenantId, roleId, periodId,
    author: user.name, authorUserId: user.id, body,
    createdAt: new Date().toISOString(),
  });
  revalidatePath(`/scorecard/${roleId}`);
}

/**
 * Add one KPI to a role's card.
 *
 * A scorecard that can only be built in the setup wizard is a scorecard nobody changes. The KPIs
 * that matter are the ones somebody thinks of in March, looking at a month that did not measure the
 * thing that actually went wrong — and if the only way to add it is to walk back through setup,
 * they don't, and the card stays wrong for a year.
 *
 * Three rules hold it together:
 *
 *   **Weights re-balance, they are never typed.** Weights within a pillar must sum to 100%, and
 *   asking somebody to do that arithmetic while adding one row is how a card ends up invalid. The
 *   new KPI joins as an equal share of its pillar and the existing ones are scaled to fit.
 *
 *   **A locked month is never touched.** Adding a KPI changes what the card measures, so it lands
 *   in the open month and leaves every closed one exactly as it was signed.
 *
 *   **Only your own card and the ones beneath it**, re-checked here, because a server action is a
 *   public endpoint and the role id arrives from the client.
 */
export async function addKpi(formData: FormData) {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  const roleId = String(formData.get('roleId'));
  const pillar = String(formData.get('pillar'));
  const text = String(formData.get('text') ?? '').trim().slice(0, 200);
  const target = String(formData.get('target') ?? '').trim().slice(0, 80) || null;
  if (!text) return;
  if (!['safety', 'people', 'earnings', 'compliance'].includes(pillar)) return;

  await assertWritable(user.tenantId);
  const scope = await getScope(user);
  if (!scope.canEdit(roleId)) throw new Error('You can only change your own card and the cards beneath it.');

  const existing = await db.select().from(schema.criteria)
    .where(and(eq(schema.criteria.roleId, roleId), eq(schema.criteria.pillar, pillar), eq(schema.criteria.active, true)));

  // An equal share for the newcomer, and the rest scaled down to make room. Whatever the old
  // weights were relative to each other is preserved — this does not flatten somebody's judgement
  // about which KPI matters more, it only makes space.
  const share = 1 / (existing.length + 1);
  for (const c of existing) {
    await db.update(schema.criteria)
      .set({ weight: c.weight * (1 - share) })
      .where(eq(schema.criteria.id, c.id));
  }

  await db.insert(schema.criteria).values({
    id: randomUUID(), roleId, pillar, text, weight: share, kpi: true, target,
    sortOrder: existing.length,
  });

  revalidatePath(`/scorecard/${roleId}`);
  revalidatePath('/scoring');
}
