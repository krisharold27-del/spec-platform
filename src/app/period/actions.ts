'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { getTeamRollup, getGates, PILLARS } from '@/lib/queries';
import { generateBoardOutput } from '@/lib/board-output';

/** Enter the two hard gates for the current period. */
export async function saveGates(formData: FormData) {
  const user = await getCurrentUser(); if (!user || user.access !== 'full') redirect('/signin');
  const periodId = String(formData.get('periodId'));
  const lti = Number(formData.get('lti') ?? 0), mti = Number(formData.get('mti') ?? 0), psy = Number(formData.get('psychosocial') ?? 0);
  const training = Number(formData.get('training') ?? 0) / 100;
  const rows = [
    { gate: 'zero_harm', value: `${lti}/${mti}/${psy}`, pass: lti + mti + psy === 0, reason: String(formData.get('zhReason') ?? '') || null },
    { gate: 'clear_to_work', value: String(training), pass: training >= 1, reason: String(formData.get('ctwReason') ?? '') || null },
  ];
  for (const r of rows) {
    const e = db.select().from(schema.gates).where(and(eq(schema.gates.periodId, periodId), eq(schema.gates.gate, r.gate))).get();
    if (e) db.update(schema.gates).set(r).where(eq(schema.gates.id, e.id)).run();
    else db.insert(schema.gates).values({ id: randomUUID(), periodId, ...r }).run();
  }
  revalidatePath('/'); revalidatePath('/journey');
}

/** Lock the period, generate the board output, open the next month. */
export async function lockPeriod(formData: FormData) {
  const user = await getCurrentUser(); if (!user || user.access !== 'full') redirect('/signin');
  const periodId = String(formData.get('periodId'));
  const period = db.select().from(schema.periods).where(and(eq(schema.periods.id, periodId), eq(schema.periods.tenantId, user.tenantId))).get();
  if (!period || period.status === 'locked') redirect('/');
  const tenant = db.select().from(schema.tenants).where(eq(schema.tenants.id, user.tenantId)).get()!;
  const rollup = getTeamRollup(user.tenantId, periodId);
  const gates = getGates(periodId);
  const md = await generateBoardOutput({ tenantName: tenant.name, period: period.period, rollup, gates, pillars: PILLARS });
  db.insert(schema.boardOutputs).values({ id: randomUUID(), periodId, markdown: md, generatedBy: 'claude', createdAt: new Date().toISOString() }).run();
  db.update(schema.periods).set({ status: 'locked' }).where(eq(schema.periods.id, periodId)).run();
  const [y, m] = period.period.split('-').map(Number);
  const next = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`;
  db.insert(schema.periods).values({ id: randomUUID(), tenantId: user.tenantId, period: next }).onConflictDoNothing().run();
  revalidatePath('/'); revalidatePath('/journey');
  redirect(`/board/${periodId}`);
}

export async function approveBoardOutput(formData: FormData) {
  const user = await getCurrentUser(); if (!user || user.access !== 'full') redirect('/signin');
  const periodId = String(formData.get('periodId'));
  db.update(schema.boardOutputs).set({ approvedBy: user.email }).where(eq(schema.boardOutputs.periodId, periodId)).run();
  revalidatePath(`/board/${periodId}`); revalidatePath('/journey');
}
