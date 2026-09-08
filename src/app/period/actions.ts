'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { getScope, isTopOfChart } from '@/lib/scope';
import { assertWritable } from '@/lib/plan';
import { getTeamRollup, getGates, PILLARS } from '@/lib/queries';
import { generateBoardOutput } from '@/lib/board-output';
import { sendBoardOutputReadyEmail } from '@/lib/email';

/** Enter the two hard gates for the current period. */
export async function saveGates(formData: FormData) {
  const user = await getCurrentUser(); if (!user || user.access !== 'full') redirect('/signin');
  // Whole-business action: restricted to the top of the org chart, not to every full-access user.
  if (!isTopOfChart(await getScope(user))) throw new Error('Only the top of the org chart can do this.');
  await assertWritable(user.tenantId);
  const periodId = String(formData.get('periodId'));
  const lti = Number(formData.get('lti') ?? 0), mti = Number(formData.get('mti') ?? 0), psy = Number(formData.get('psychosocial') ?? 0);
  const training = Number(formData.get('training') ?? 0) / 100;
  const rows = [
    { gate: 'zero_harm', value: `${lti}/${mti}/${psy}`, pass: lti + mti + psy === 0, reason: String(formData.get('zhReason') ?? '') || null },
    { gate: 'clear_to_work', value: String(training), pass: training >= 1, reason: String(formData.get('ctwReason') ?? '') || null },
  ];
  for (const r of rows) {
    const existingRows = await db.select().from(schema.gates).where(and(eq(schema.gates.periodId, periodId), eq(schema.gates.gate, r.gate)));
    const e = existingRows[0];
    if (e) await db.update(schema.gates).set(r).where(eq(schema.gates.id, e.id));
    else await db.insert(schema.gates).values({ id: randomUUID(), periodId, ...r });
  }
  revalidatePath('/'); revalidatePath('/journey');
}

/** Lock the period, generate the board output, open the next month. */
export async function lockPeriod(formData: FormData) {
  const user = await getCurrentUser(); if (!user || user.access !== 'full') redirect('/signin');
  // Whole-business action: restricted to the top of the org chart, not to every full-access user.
  if (!isTopOfChart(await getScope(user))) throw new Error('Only the top of the org chart can do this.');
  await assertWritable(user.tenantId);
  const periodId = String(formData.get('periodId'));
  const periodRows = await db.select().from(schema.periods).where(and(eq(schema.periods.id, periodId), eq(schema.periods.tenantId, user.tenantId)));
  const period = periodRows[0];
  if (!period || period.status === 'locked') redirect('/');
  const tenant = (await db.select().from(schema.tenants).where(eq(schema.tenants.id, user.tenantId)))[0]!;
  const rollup = await getTeamRollup(user.tenantId, periodId);
  const gates = await getGates(periodId);
  const md = await generateBoardOutput({ tenantName: tenant.name, period: period.period, rollup, gates, pillars: PILLARS });
  await db.insert(schema.boardOutputs).values({ id: randomUUID(), periodId, markdown: md, generatedBy: 'claude', createdAt: new Date().toISOString() });
  await db.update(schema.periods).set({ status: 'locked' }).where(eq(schema.periods.id, periodId));
  const [y, m] = period.period.split('-').map(Number);
  const next = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`;
  await db.insert(schema.periods).values({ id: randomUUID(), tenantId: user.tenantId, period: next }).onConflictDoNothing();

  const notify = await db.select({ email: schema.users.email }).from(schema.users)
    .where(and(eq(schema.users.tenantId, user.tenantId), eq(schema.users.access, 'full')));
  for (const { email } of notify) {
    await sendBoardOutputReadyEmail({ to: email, businessName: tenant.name, period: period.period, periodId });
  }

  revalidatePath('/'); revalidatePath('/journey');
  redirect(`/board/${periodId}`);
}

export async function approveBoardOutput(formData: FormData) {
  const user = await getCurrentUser(); if (!user || user.access !== 'full') redirect('/signin');
  // Whole-business action: restricted to the top of the org chart, not to every full-access user.
  if (!isTopOfChart(await getScope(user))) throw new Error('Only the top of the org chart can do this.');
  await assertWritable(user.tenantId);
  const periodId = String(formData.get('periodId'));
  await db.update(schema.boardOutputs).set({ approvedBy: user.email }).where(eq(schema.boardOutputs.periodId, periodId));
  revalidatePath(`/board/${periodId}`); revalidatePath('/journey');
}
